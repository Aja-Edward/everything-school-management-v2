"""
Assessment components a school has changed must survive a deploy.

The Render build runs seed_tenant_defaults for every active school. It used
to top each education level up with any default component (CA1, CA2, EXAM,
Class Work) the school no longer had, so components a school deleted or
renamed came back on every deploy.
"""
from io import StringIO

from django.core.management import call_command
from django.test import TestCase

from academics.models import EducationLevel
from result.models import AssessmentComponent
from tenants.models import Tenant


class ComponentSeedingTest(TestCase):
    def setUp(self):
        # Creating the tenant runs the post_save seeding, as registration does.
        self.tenant = Tenant.objects.create(
            name="Seed School", slug="seed-school", status="active",
            is_active=True, owner_email="seed@example.com")
        self.primary = EducationLevel.objects.get(tenant=self.tenant, level_type="PRIMARY")

    def codes(self, level=None):
        return sorted(AssessmentComponent.objects.filter(
            tenant=self.tenant, education_level=level or self.primary
        ).values_list("code", flat=True))

    def deploy(self, *args):
        call_command("seed_tenant_defaults", *args, stdout=StringIO(), stderr=StringIO())

    def test_a_new_school_gets_the_default_components(self):
        self.assertEqual(self.codes(), ["CA1", "CA2", "EXAM"])

    def test_a_deleted_component_does_not_come_back_on_deploy(self):
        AssessmentComponent.objects.filter(
            tenant=self.tenant, education_level=self.primary, code="CA2").delete()

        self.deploy()

        self.assertEqual(self.codes(), ["CA1", "EXAM"])

    def test_a_renamed_component_is_not_duplicated_on_deploy(self):
        AssessmentComponent.objects.filter(
            tenant=self.tenant, education_level=self.primary, code="CA1"
        ).update(code="TEST1", name="Mid-term Test")

        self.deploy()

        self.assertEqual(self.codes(), ["CA2", "EXAM", "TEST1"])

    def test_explicit_components_step_still_leaves_a_customised_level_alone(self):
        AssessmentComponent.objects.filter(
            tenant=self.tenant, education_level=self.primary, code="CA2").delete()

        self.deploy("--step", "components")

        self.assertEqual(self.codes(), ["CA1", "EXAM"])

    def test_explicit_components_step_fills_a_level_with_none(self):
        AssessmentComponent.objects.filter(
            tenant=self.tenant, education_level=self.primary).delete()

        self.deploy("--step", "components")

        self.assertEqual(self.codes(), ["CA1", "CA2", "EXAM"])
