"""
Updating a subject must not wipe the levels it is taught at.

Subject stores the same information twice: education_levels, the coarse JSON
list the admin UI collects, and grade_levels, the M2M every modern filter
reads. Two signals keep the pair in step -- post_save fills an empty M2M from
the JSON, m2m_changed rewrites the JSON from the M2M.

The admin UI posts grade_level_ids: [] on every save, because it only ever
collects coarse levels and leaves the fine ones to be derived. create() reads
that empty list as "not supplied" and skips it; update() read it as "set the
M2M to nothing", which emptied the M2M, fired m2m_changed, and let the sync
signal write the empty result straight back over the levels the admin had just
picked. Creating a subject worked; editing one silently blanked its levels.
"""

from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from academics.models import EducationLevel
from classroom.models import GradeLevel
from subject.models import Subject
from subject.serializers import SubjectCreateUpdateSerializer
from tenants.models import Tenant

User = get_user_model()


class SubjectLevelTestCase(APITestCase):
    """
    A school as it comes out of registration.

    Creating a Tenant seeds its education levels and their grade levels, so
    these fixtures are the real thing rather than a hand-built stand-in. Only
    Nursery and Primary get default grade levels, so JSS gets its own here --
    which is also why a JSS subject is the case most likely to break.
    """

    def setUp(self):
        self.tenant = Tenant.objects.create(
            name="Levels School",
            slug="levels-school",
            status="active",
            is_active=True,
            owner_email="levels@example.com",
        )
        self.primary = EducationLevel.objects.get(tenant=self.tenant, code="primary")
        self.junior = EducationLevel.objects.get(tenant=self.tenant, code="jss")
        self.primary_grades = list(
            GradeLevel.objects.filter(tenant=self.tenant, education_level=self.primary)
        )
        self.junior_grades = [
            GradeLevel.objects.create(
                tenant=self.tenant,
                name="JSS {0}".format(n),
                education_level=self.junior,
                order=n,
            )
            for n in (1, 2)
        ]
        # Created the way the UI creates one: coarse levels only, the M2M left
        # for derive_grade_levels to fill.
        self.subject = Subject.objects.create(
            tenant=self.tenant,
            name="Mathematics",
            code="MATH-PRI",
            education_levels=["PRIMARY"],
        )

    def levels_of(self, subject):
        return sorted(
            subject.grade_levels.values_list("education_level__level_type", flat=True)
        )


class SubjectUpdateKeepsItsLevelsTest(SubjectLevelTestCase):
    def test_creating_a_subject_derives_its_grade_levels(self):
        """The premise: the create path already works, so the M2M is populated."""
        self.assertEqual(self.subject.grade_levels.count(), len(self.primary_grades))
        self.assertEqual(self.subject.education_levels, ["PRIMARY"])

    def test_re_saving_a_subject_does_not_blank_its_levels(self):
        serializer = SubjectCreateUpdateSerializer(
            instance=self.subject,
            data={
                "name": "Mathematics",
                "education_levels": ["PRIMARY"],
                "grade_level_ids": [],
            },
            partial=True,
        )
        self.assertTrue(serializer.is_valid(), serializer.errors)
        serializer.save()

        self.subject.refresh_from_db()
        self.assertEqual(
            self.subject.education_levels,
            ["PRIMARY"],
            "the levels the admin re-submitted were erased on save",
        )
        self.assertEqual(self.subject.grade_levels.count(), len(self.primary_grades))

    def test_changing_the_level_moves_the_grade_levels_with_it(self):
        serializer = SubjectCreateUpdateSerializer(
            instance=self.subject,
            data={"education_levels": ["JUNIOR_SECONDARY"], "grade_level_ids": []},
            partial=True,
        )
        self.assertTrue(serializer.is_valid(), serializer.errors)
        serializer.save()

        self.subject.refresh_from_db()
        self.assertEqual(self.subject.education_levels, ["JUNIOR_SECONDARY"])
        self.assertEqual(
            self.levels_of(self.subject),
            ["JUNIOR_SECONDARY", "JUNIOR_SECONDARY"],
            "the JSON moved to JSS but the M2M every filter reads stayed on Primary",
        )

    def test_adding_a_level_keeps_the_one_already_there(self):
        serializer = SubjectCreateUpdateSerializer(
            instance=self.subject,
            data={
                "education_levels": ["PRIMARY", "JUNIOR_SECONDARY"],
                "grade_level_ids": [],
            },
            partial=True,
        )
        self.assertTrue(serializer.is_valid(), serializer.errors)
        serializer.save()

        self.subject.refresh_from_db()
        self.assertEqual(
            sorted(self.subject.education_levels), ["JUNIOR_SECONDARY", "PRIMARY"]
        )
        self.assertEqual(
            self.subject.grade_levels.count(),
            len(self.primary_grades) + len(self.junior_grades),
        )

    def test_an_explicit_grade_level_selection_still_wins(self):
        """Sending real grade level ids must still mean exactly those."""
        chosen = self.primary_grades[0]
        serializer = SubjectCreateUpdateSerializer(
            instance=self.subject,
            data={"education_levels": ["PRIMARY"], "grade_level_ids": [chosen.id]},
            partial=True,
        )
        self.assertTrue(serializer.is_valid(), serializer.errors)
        serializer.save()

        self.subject.refresh_from_db()
        self.assertEqual(list(self.subject.grade_levels.all()), [chosen])
        self.assertEqual(self.subject.education_levels, ["PRIMARY"])

    def test_an_update_that_mentions_no_levels_leaves_them_alone(self):
        serializer = SubjectCreateUpdateSerializer(
            instance=self.subject, data={"short_name": "Maths"}, partial=True
        )
        self.assertTrue(serializer.is_valid(), serializer.errors)
        serializer.save()

        self.subject.refresh_from_db()
        self.assertEqual(self.subject.education_levels, ["PRIMARY"])
        self.assertEqual(self.subject.grade_levels.count(), len(self.primary_grades))

    def test_clearing_every_level_is_still_possible(self):
        """The guard protects a populated field; it must not block a real clear."""
        serializer = SubjectCreateUpdateSerializer(
            instance=self.subject,
            data={"education_levels": [], "grade_level_ids": []},
            partial=True,
        )
        self.assertTrue(serializer.is_valid(), serializer.errors)
        serializer.save()

        self.subject.refresh_from_db()
        self.assertEqual(self.subject.education_levels, [])
        self.assertEqual(self.subject.grade_levels.count(), 0)


class SyncSignalDoesNotBlankTheJsonFieldTest(SubjectLevelTestCase):
    """
    Defence in depth: the serializer is not the only way to empty the M2M.

    An empty grade_levels is not evidence that a subject has no levels. It is
    also the state a subject sits in before derive_grade_levels runs, and the
    state it is left in when a school has not seeded grade levels for the level
    the admin chose. Writing [] back in those cases erases the admin's input.
    """

    def test_clearing_the_m2m_does_not_erase_education_levels(self):
        self.subject.grade_levels.clear()

        self.subject.refresh_from_db()
        self.assertEqual(self.subject.education_levels, ["PRIMARY"])

    def test_a_level_with_no_seeded_grades_survives(self):
        GradeLevel.objects.filter(education_level=self.junior).delete()

        serializer = SubjectCreateUpdateSerializer(
            instance=self.subject,
            data={"education_levels": ["JUNIOR_SECONDARY"], "grade_level_ids": []},
            partial=True,
        )
        self.assertTrue(serializer.is_valid(), serializer.errors)
        serializer.save()

        self.subject.refresh_from_db()
        self.assertEqual(
            self.subject.education_levels,
            ["JUNIOR_SECONDARY"],
            "a school with no JSS grade levels seeded lost the level it picked",
        )

    def test_the_json_still_follows_a_real_grade_level_change(self):
        """The sync itself must keep working - only the blanking case changed."""
        self.subject.grade_levels.set(self.junior_grades)

        self.subject.refresh_from_db()
        self.assertEqual(self.subject.education_levels, ["JUNIOR_SECONDARY"])


class SubjectUpdateThroughTheApiTest(SubjectLevelTestCase):
    """The payload the admin dashboard actually sends, end to end."""

    def setUp(self):
        super().setUp()
        self.admin = User.objects.create_user(
            username="levels-admin",
            email="admin@levels-school.example.com",
            first_name="Levels",
            last_name="Admin",
            role="admin",
            password="testpass123",
            is_active=True,
            tenant=self.tenant,
        )
        self.client.force_authenticate(user=self.admin)

    def test_the_dashboard_payload_keeps_the_levels(self):
        response = self.client.patch(
            "/api/subjects/{0}/".format(self.subject.id),
            {
                "name": "Mathematics",
                "code": "MATH-PRI",
                "education_levels": ["PRIMARY"],
                "grade_level_ids": [],
                "prerequisite_ids": [],
            },
            format="json",
            HTTP_X_TENANT_SLUG=self.tenant.slug,
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.subject.refresh_from_db()
        self.assertEqual(self.subject.education_levels, ["PRIMARY"])
        self.assertEqual(self.subject.grade_levels.count(), len(self.primary_grades))
