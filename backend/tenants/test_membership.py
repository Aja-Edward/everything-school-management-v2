"""
A signed-in user only counts as signed in at their own school.

These authenticate with real JWTs, by cookie and by Authorization header.
force_authenticate() skips the authentication classes, which is exactly
where the check lives, so it can't be used here.
"""

from datetime import date

from django.conf import settings
from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from django.urls import URLPattern, URLResolver, get_resolver, path
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.test import APITestCase
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import AccessToken

from academics.models import EducationLevel
from authentication.supabase_backend import SupabaseJWTAuthentication
from classroom.models import Class
from security.authentication import SecureJWTAuthentication
from students.models import Student
from teacher.models import Teacher
from tenants.models import Tenant

from .membership import user_school_id

User = get_user_model()


class WhoAmIView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        return Response({"authenticated": request.user.is_authenticated})


class ProtectedView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response({"username": request.user.username})


urlpatterns = [
    path("membership-test/whoami/", WhoAmIView.as_view()),
    path("membership-test/protected/", ProtectedView.as_view()),
]


class TwoSchoolsMixin:
    def make_schools(self):
        self.school_a = Tenant.objects.create(
            name="Alpha Academy", slug="alpha-academy", status="active",
            is_active=True, owner_email="alpha@example.com")
        self.school_b = Tenant.objects.create(
            name="Beta College", slug="beta-college", status="active",
            is_active=True, owner_email="beta@example.com")

    def make_user(self, username, role, tenant):
        return User.objects.create_user(
            username=username, email=f"{username}@example.com", role=role,
            password="testpass123", is_active=True, tenant=tenant)

    def by_cookie(self, user):
        self.client.cookies[settings.AUTH_COOKIE_ACCESS] = str(AccessToken.for_user(user))
        return {}

    def by_header(self, user):
        return {"HTTP_AUTHORIZATION": f"Bearer {AccessToken.for_user(user)}"}


@override_settings(ROOT_URLCONF=__name__)
class RequestSchoolMembershipTest(TwoSchoolsMixin, APITestCase):
    def setUp(self):
        self.make_schools()
        self.admin_a = self.make_user("alpha_admin", "superadmin", self.school_a)

    def get(self, url, school, credentials):
        headers = dict(credentials)
        if school is not None:
            headers["HTTP_X_TENANT_SLUG"] = school.slug
        return self.client.get(url, **headers)

    def test_own_school_is_signed_in(self):
        for how in (self.by_cookie, self.by_header):
            with self.subTest(how=how.__name__):
                self.client.cookies.clear()
                response = self.get("/membership-test/protected/", self.school_a, how(self.admin_a))
                self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_another_school_sees_an_anonymous_visitor(self):
        for how in (self.by_cookie, self.by_header):
            with self.subTest(how=how.__name__):
                self.client.cookies.clear()
                credentials = how(self.admin_a)

                # Public pages still work, just not as a signed-in user...
                whoami = self.get("/membership-test/whoami/", self.school_b, credentials)
                self.assertEqual(whoami.status_code, status.HTTP_200_OK)
                self.assertFalse(whoami.data["authenticated"])

                # ...and protected ones refuse with 403, not a 401 the
                # frontend would try to refresh its way past.
                protected = self.get("/membership-test/protected/", self.school_b, credentials)
                self.assertEqual(protected.status_code, status.HTTP_403_FORBIDDEN)

    def test_no_school_named_leaves_the_user_signed_in(self):
        response = self.get("/membership-test/protected/", None, self.by_header(self.admin_a))
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_school_recorded_only_on_the_profile_counts(self):
        # Teacher creation and the bulk uploads set the school on the
        # profile but not on the user.
        teacher_user = self.make_user("profile_teacher", "teacher", tenant=None)
        Teacher.objects.create(tenant=self.school_a, user=teacher_user)
        # Student.save() now insists the two match, so students like this are
        # older rows: make one the way they were, then clear the user's school.
        student_user = self.make_user("profile_student", "student", self.school_a)
        Student.objects.create(
            tenant=self.school_a, user=student_user, gender="F", date_of_birth=date(2015, 1, 1))
        User.objects.filter(pk=student_user.pk).update(tenant=None)
        student_user.refresh_from_db()

        for user in (teacher_user, student_user):
            with self.subTest(role=user.role):
                self.assertEqual(user_school_id(user), self.school_a.id)
                own = self.get("/membership-test/protected/", self.school_a, self.by_header(user))
                other = self.get("/membership-test/protected/", self.school_b, self.by_header(user))
                self.assertEqual(own.status_code, status.HTTP_200_OK)
                self.assertEqual(other.status_code, status.HTTP_403_FORBIDDEN)

    def test_user_with_no_school_is_not_signed_in_at_any_school(self):
        orphan = self.make_user("orphan_parent", "parent", tenant=None)

        response = self.get("/membership-test/protected/", self.school_a, self.by_header(orphan))

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_platform_staff_work_across_schools(self):
        staff = self.make_user("platform_root", "platform_admin", tenant=None)

        for school in (self.school_a, self.school_b):
            with self.subTest(school=school.slug):
                response = self.get("/membership-test/protected/", school, self.by_header(staff))
                self.assertEqual(response.status_code, status.HTTP_200_OK)


class RealEndpointTest(TwoSchoolsMixin, APITestCase):
    """The reported hole, on an ordinary tenant-scoped endpoint."""

    def setUp(self):
        self.make_schools()
        self.admin_a = self.make_user("alpha_admin", "superadmin", self.school_a)
        level_b, _ = EducationLevel.objects.get_or_create(
            tenant=self.school_b, code="primary",
            defaults={"name": "Primary", "level_type": "PRIMARY"})
        Class.objects.create(
            tenant=self.school_b, name="Beta Secret Class", code="BETA_SECRET",
            education_level=level_b, grade_number=1, order=99)

    def classes(self, school):
        return self.client.get(
            "/api/classrooms/classes/", HTTP_X_TENANT_SLUG=school.slug,
            HTTP_AUTHORIZATION=f"Bearer {AccessToken.for_user(self.admin_a)}")

    def test_admin_cannot_read_another_schools_classes(self):
        response = self.classes(self.school_b)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertNotIn("Beta Secret Class", str(response.content))

    def test_admin_still_reads_their_own(self):
        response = self.classes(self.school_a)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertNotIn("Beta Secret Class", str(response.content))


class EveryViewUsesCheckedAuthenticationTest(TestCase):
    """
    The check lives in the project's authentication classes, so a view that
    lists its own (DRF's SessionAuthentication, TokenAuthentication, ...)
    silently opts out of it. TeacherViewSet did.
    """

    CHECKED = (SecureJWTAuthentication, SupabaseJWTAuthentication)

    def walk(self, patterns, prefix=""):
        for pattern in patterns:
            if isinstance(pattern, URLResolver):
                yield from self.walk(pattern.url_patterns, prefix + str(pattern.pattern))
            elif isinstance(pattern, URLPattern):
                view = getattr(pattern.callback, "cls", None)
                if view is not None:
                    yield prefix + str(pattern.pattern), view

    def test_no_view_bypasses_the_school_check(self):
        offenders = sorted({
            f"{route} -> {view.__module__}.{view.__name__}: {auth.__name__}"
            for route, view in self.walk(get_resolver().url_patterns)
            for auth in getattr(view, "authentication_classes", [])
            if not issubclass(auth, self.CHECKED)
        })
        self.assertEqual(offenders, [])


class NewUsersGetTheirSchoolTest(TwoSchoolsMixin, APITestCase):
    """
    Every way of creating a school's user records the school on the user.
    Several didn't, which left accounts the membership check can only place
    by falling back to their profile -- and some with no school at all.
    """

    def setUp(self):
        self.make_schools()
        self.request = type("Request", (), {"tenant": self.school_a, "user": None})()

    def assert_at_school_a(self, user):
        user.refresh_from_db()
        self.assertEqual(user.tenant, self.school_a)

    def test_bulk_teacher_upload(self):
        from teacher.tasks import _create_teacher_from_cleaned, _validate_row

        errors, cleaned = _validate_row(2, {
            "employee_id": "T-100", "staff_type": "Teaching", "first_name": "Ada",
            "last_name": "Obi", "email": "ada.bulk@example.com", "phone_number": "08030000000",
            "hire_date": "2024-09-01", "qualification": "B.Ed", "specialization": "Maths",
        }, self.school_a.id)
        self.assertEqual(errors, [])

        teacher, _, _ = _create_teacher_from_cleaned(self.school_a, cleaned)

        self.assert_at_school_a(teacher.user)

    def test_bulk_parent_upload(self):
        from parent.tasks import _create_parent, _validate_row

        errors, cleaned = _validate_row(2, {
            "first_name": "Bola", "last_name": "Eze", "gender": "F", "phone": "08031111111",
            "email": "bola.bulk@example.com", "address": "1 School Road", "relationship": "Mother",
        })
        self.assertEqual(errors, [])

        parent, _, _, _ = _create_parent(self.school_a, cleaned)

        self.assert_at_school_a(parent.user)

    def test_teacher_form(self):
        from teacher.serializers import TeacherSerializer

        serializer = TeacherSerializer(data={
            "user_email": "chidi.form@example.com", "user_first_name": "Chidi",
            "user_last_name": "Okafor", "employee_id": "T-200",
        }, context={"request": self.request})
        self.assertTrue(serializer.is_valid(), serializer.errors)

        teacher = serializer.save(tenant=self.school_a)

        self.assert_at_school_a(teacher.user)

    def parent_form(self, email):
        from parent.serializers import ParentProfileSerializer

        serializer = ParentProfileSerializer(data={
            "user_email": email, "user_first_name": "Dayo", "user_last_name": "Ade",
            "phone": "08032222222", "address": "2 School Road",
        }, context={"request": self.request})
        self.assertTrue(serializer.is_valid(), serializer.errors)
        return serializer.save(tenant=self.school_a)

    def test_parent_form(self):
        self.assert_at_school_a(self.parent_form("dayo.form@example.com").user)

    def test_parent_form_does_not_borrow_another_schools_account(self):
        theirs = self.make_user("beta_parent", "parent", self.school_b)
        theirs.email = "shared.parent@example.com"
        theirs.save()

        profile = self.parent_form("shared.parent@example.com")

        self.assertNotEqual(profile.user_id, theirs.pk)
        self.assert_at_school_a(profile.user)
        theirs.refresh_from_db()
        self.assertEqual(theirs.tenant, self.school_b)

    def test_parent_form_adopts_an_account_with_no_school(self):
        orphan = self.make_user("schoolless_parent", "parent", tenant=None)
        orphan.email = "schoolless.parent@example.com"
        orphan.save()

        profile = self.parent_form("schoolless.parent@example.com")

        self.assertEqual(profile.user_id, orphan.pk)
        self.assert_at_school_a(orphan)

    def test_student_form_with_a_new_parent(self):
        from parent.models import ParentProfile
        from students.serializers import StudentCreateSerializer

        serializer = StudentCreateSerializer(data={
            "user_first_name": "Emeka", "user_last_name": "Nwosu", "gender": "M",
            "date_of_birth": "2015-03-01", "parent_first_name": "Ngozi",
            "parent_last_name": "Nwosu", "parent_email": "ngozi.form@example.com",
            "parent_contact": "08033333333",
        }, context={"request": self.request})
        self.assertTrue(serializer.is_valid(), serializer.errors)

        # StudentViewSet.create() saves without a tenant; the serializer
        # takes it from the request.
        student = serializer.save()

        self.assert_at_school_a(student.user)
        parent = ParentProfile.objects.get(user__email="ngozi.form@example.com")
        self.assertEqual(parent.tenant, self.school_a)
        self.assert_at_school_a(parent.user)

    def test_accepting_an_invitation(self):
        from datetime import timedelta

        from django.utils import timezone
        from invitations.models import Invitation

        inviter = self.make_user("alpha_inviter", "superadmin", self.school_a)
        invitation = Invitation.objects.create(
            email="invited.teacher@example.com", role="teacher", invited_by=inviter,
            expires_at=timezone.now() + timedelta(days=3))

        response = self.client.post("/api/invitations/accept/", {
            "token": str(invitation.token), "first_name": "Ife",
            "last_name": "Bello", "password": "a-long-enough-password",
        }, format="json", HTTP_X_TENANT_SLUG=self.school_a.slug)

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assert_at_school_a(User.objects.get(email="invited.teacher@example.com"))
