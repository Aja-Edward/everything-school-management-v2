"""
A school admin switches an event on from Settings and it shows on the school's site.

The Active and Published toggles were dropped by the write serializers, so
every event stayed inactive, and activating one switched off every other
school's events.
"""
from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from common.admin_access import admin_account_flags
from events.models import Event
from tenants.models import Tenant

User = get_user_model()

EVENTS = "/api/events/events/"


class EventTestBase(APITestCase):
    def setUp(self):
        self.school = self._school("event-school")
        self.other_school = self._school("event-other")
        self.admin = self._user("event-admin", self.school)
        self.other_admin = self._user("event-other-admin", self.other_school)

    def _school(self, slug):
        return Tenant.objects.create(
            name=slug, slug=slug, status="active", is_active=True,
            owner_email=f"{slug}@example.com",
        )

    def _user(self, name, school):
        return User.objects.create_user(
            username=name, email=f"{name}@example.com", role="admin",
            password=None, is_active=True, tenant=school, **admin_account_flags("admin"),
        )

    def _event(self, school, admin, **extra):
        extra.setdefault("title", f"{school.slug} open day")
        return Event.objects.create(
            tenant=school, created_by=admin, description="Come and see us.", **extra,
        )

    def titles(self, response):
        self.assertEqual(response.status_code, 200, response.content)
        rows = response.data["results"] if isinstance(response.data, dict) else response.data
        return [e["title"] for e in rows]

    def call(self, method, path, data=None, user=None, school=None):
        if user:
            self.client.force_authenticate(user)
        return getattr(self.client, method)(
            path, data, format="json", HTTP_X_TENANT_SLUG=(school or self.school).slug,
        )


class EventToggleTest(EventTestBase):
    def test_the_active_and_published_toggles_save_and_come_back(self):
        event = self._event(self.school, self.admin)

        response = self.call("patch", f"{EVENTS}{event.id}/", {"is_active": True}, user=self.admin)
        self.assertEqual(response.status_code, 200, response.content)
        self.assertTrue(response.data["is_active"])
        self.assertEqual(response.data["id"], event.id)

        self.call("patch", f"{EVENTS}{event.id}/", {"is_published": True})
        event.refresh_from_db()
        self.assertTrue(event.is_active and event.is_published)

    def test_an_event_created_active_and_published_is_on_the_school_site(self):
        response = self.call("post", EVENTS, {
            "title": "Inter-house sports", "description": "Saturday.",
            "display_type": "banner", "is_active": True, "is_published": True,
        }, user=self.admin)
        self.assertEqual(response.status_code, 201, response.content)
        self.assertIn("id", response.data)

        self.client.force_authenticate(None)
        site = self.call("get", EVENTS + "?is_active=true&is_published=true")
        self.assertEqual(self.titles(site), ["Inter-house sports"])

    def test_the_site_filters_hold_for_a_signed_in_visitor(self):
        self._event(self.school, self.admin, is_active=True, is_published=True)
        self._event(self.school, self.admin, title="draft", is_active=False, is_published=False)

        site = self.call("get", EVENTS + "?is_active=true&is_published=true", user=self.admin)
        self.assertEqual(self.titles(site), ["event-school open day"])

    def test_activating_one_school_event_leaves_other_schools_alone(self):
        theirs = self._event(self.other_school, self.other_admin, is_active=True, is_published=True)
        ours = self._event(self.school, self.admin)

        self.assertEqual(self.call("post", f"{EVENTS}{ours.id}/activate/", user=self.admin).status_code, 200)

        theirs.refresh_from_db()
        ours.refresh_from_db()
        self.assertTrue(theirs.is_active)
        self.assertTrue(ours.is_active)

    def test_the_active_endpoint_shows_this_school_event_only(self):
        self._event(self.other_school, self.other_admin, is_active=True, is_published=True)
        ours = self._event(self.school, self.admin, is_active=True, is_published=True)

        response = self.call("get", EVENTS + "active/")
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.data["id"], ours.id)

    def test_another_school_cannot_toggle_our_event(self):
        ours = self._event(self.school, self.admin)
        response = self.call(
            "patch", f"{EVENTS}{ours.id}/", {"is_active": True},
            user=self.other_admin, school=self.other_school,
        )
        self.assertEqual(response.status_code, 404)
        ours.refresh_from_db()
        self.assertFalse(ours.is_active)


class EventWriteAccessTest(EventTestBase):
    """
    Any signed-in user of the school could change, switch off or delete its
    website events. Only the school's admins may now.
    """

    def _member(self, role):
        return User.objects.create_user(
            username=f"event-{role}", email=f"event-{role}@example.com", role=role,
            password=None, is_active=True, tenant=self.school, **admin_account_flags(role),
        )

    def test_a_teacher_or_student_cannot_change_switch_on_or_delete_an_event(self):
        event = self._event(self.school, self.admin, is_active=True, is_published=True)
        for role in ("teacher", "student"):
            user = self._member(role)
            with self.subTest(role=role):
                self.assertEqual(self.call(
                    "patch", f"{EVENTS}{event.id}/", {"title": "hacked"}, user=user,
                ).status_code, 403)
                self.assertEqual(self.call("post", f"{EVENTS}{event.id}/activate/", user=user).status_code, 403)
                self.assertEqual(self.call("post", f"{EVENTS}{event.id}/deactivate/", user=user).status_code, 403)
                self.assertEqual(self.call("delete", f"{EVENTS}{event.id}/", user=user).status_code, 403)
                self.assertEqual(self.call("post", EVENTS, {
                    "title": "fake", "description": "x", "display_type": "banner",
                }, user=user).status_code, 403)
                # They can still read the school's events.
                self.assertEqual(self.titles(self.call("get", EVENTS, user=user)), ["event-school open day"])

        event.refresh_from_db()
        self.assertEqual(event.title, "event-school open day")
        self.assertTrue(event.is_active)

    def test_a_section_admin_can_still_edit_and_delete(self):
        event = self._event(self.school, self.admin)
        section_admin = self._member("primary_admin")
        self.assertEqual(self.call(
            "patch", f"{EVENTS}{event.id}/", {"title": "Prize giving"}, user=section_admin,
        ).status_code, 200)
        self.assertEqual(self.call("post", f"{EVENTS}{event.id}/activate/").status_code, 200)
        self.assertEqual(self.call("delete", f"{EVENTS}{event.id}/").status_code, 204)
        self.assertFalse(Event.objects.filter(id=event.id).exists())

    def test_an_admin_can_still_delete(self):
        event = self._event(self.school, self.admin)
        self.assertEqual(self.call("delete", f"{EVENTS}{event.id}/", user=self.admin).status_code, 204)

    def test_an_anonymous_visitor_still_sees_the_active_published_events(self):
        ours = self._event(self.school, self.admin, is_active=True, is_published=True)
        self._event(self.school, self.admin, title="draft")

        self.assertEqual(self.titles(self.call("get", EVENTS)), ["event-school open day"])
        response = self.call("get", EVENTS + "active/")
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.data["id"], ours.id)
