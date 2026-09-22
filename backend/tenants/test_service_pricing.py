"""
Service prices as a school sees them: per student per term, and per student
for a whole session.
"""

from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APITestCase

from tenants.models import ServicePricing, Tenant

User = get_user_model()


class ServicesListPricingTest(APITestCase):
    def setUp(self):
        self.school = Tenant.objects.create(
            name="Alpha Academy", slug="alpha-academy", status="active",
            is_active=True, owner_email="alpha@example.com")
        self.admin = User.objects.create_user(
            username="alpha_admin", email="alpha_admin@example.com", role="superadmin",
            password=None, is_active=True, tenant=self.school)

    def services(self):
        self.client.force_authenticate(self.admin)
        response = self.client.get(
            "/api/tenants/services/", HTTP_X_TENANT_SLUG=self.school.slug)
        self.assertEqual(response.status_code, 200)
        return {row["service"]: row for row in response.data}

    def test_cbt_and_gate_tracker_are_offered_at_their_term_and_session_prices(self):
        services = self.services()

        cbt = services["cbt"]
        self.assertEqual(cbt["name"], "Computer-Based Testing (CBT)")
        self.assertEqual(cbt["category"], "assessment")
        self.assertEqual(cbt["price_per_student"], 100)
        self.assertEqual(cbt["price_per_student_per_session"], 300)
        self.assertFalse(cbt["is_default"])

        gate = services["gate_tracker"]
        self.assertEqual(gate["name"], "Gate Tracker")
        self.assertEqual(gate["category"], "attendance")
        self.assertEqual(gate["price_per_student"], 1300)
        self.assertEqual(gate["price_per_student_per_session"], 3900)

    def test_every_service_keeps_its_category(self):
        categories = {code: row["category"] for code, row in self.services().items()}

        self.assertEqual(categories["exams"], "core")
        self.assertEqual(categories["arrival_notification"], "attendance")
        self.assertEqual(categories["question_bank"], "assessment")
        self.assertEqual(categories["sms_notifications"], "communication")
        self.assertEqual(categories["fees"], "finance")
        self.assertEqual(categories["timetable"], "scheduling")


class SessionPriceTest(TestCase):
    def test_a_set_session_price_is_used_as_is(self):
        pricing = ServicePricing(
            service="timetable", price_per_student=Decimal("200.00"),
            price_per_student_per_session=Decimal("500.00"))
        self.assertEqual(pricing.session_price, Decimal("500.00"))

    def test_without_a_session_price_a_session_costs_three_terms(self):
        pricing = ServicePricing(service="timetable", price_per_student=Decimal("200.00"))
        self.assertEqual(pricing.session_price, Decimal("600.00"))
