"""The marketing site's demo form and the platform admin's list of requests."""
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.cache import cache
from rest_framework.test import APITestCase

from tenants.models import DemoRequest, PlatformContent, Tenant

User = get_user_model()

URL = '/api/tenants/demo-requests/'

FORM = {
    'school_name': 'Bright Stars Academy',
    'contact_name': 'Ada Okafor',
    'role': 'Proprietor',
    'phone': '0801 234 5678',
    'location': 'Gwarinpa, Abuja',
    'student_count': '101-300',
    'preferred_contact': 'whatsapp',
    'message': 'We want to move results off Excel.',
    'source': 'home',
}


@patch('utils.email.send_email_via_brevo', return_value=(201, 'ok'))
class DemoRequestFormTest(APITestCase):
    def setUp(self):
        cache.clear()  # the per-IP limit is kept in the cache

    def post(self, data, **extra):
        return self.client.post(URL, data, format='json', HTTP_HOST='localhost', **extra)

    def test_a_visitor_can_ask_for_a_demo(self, send):
        res = self.post(FORM)
        self.assertEqual(res.status_code, 201, res.content)
        demo = DemoRequest.objects.get()
        self.assertEqual(demo.school_name, 'Bright Stars Academy')
        self.assertEqual(demo.status, 'new')
        self.assertNotIn('status', res.data)
        self.assertNotIn('notes', res.data)

    def test_the_team_is_emailed_at_the_contact_address(self, send):
        content = PlatformContent.load()
        content.contact_email = 'sales@example.com'
        content.save()
        self.post({**FORM, 'school_name': 'Bright <b>Stars</b>'})
        subject, html, to_email = send.call_args.args
        self.assertEqual(to_email, 'sales@example.com')
        self.assertIn('Bright &lt;b&gt;Stars&lt;/b&gt;', html)
        self.assertNotIn('<b>Stars</b>', html)

    def test_a_failed_email_still_saves_the_request(self, send):
        send.side_effect = RuntimeError('Brevo is down')
        res = self.post(FORM)
        self.assertEqual(res.status_code, 201)
        self.assertEqual(DemoRequest.objects.count(), 1)

    def test_an_unreachable_phone_number_is_refused(self, send):
        res = self.post({**FORM, 'phone': '12345'})
        self.assertEqual(res.status_code, 400)
        self.assertIn('phone', res.data)

    def test_school_name_and_contact_are_required(self, send):
        res = self.post({'phone': '08012345678'})
        self.assertEqual(res.status_code, 400)
        self.assertIn('school_name', res.data)
        self.assertIn('contact_name', res.data)

    def test_choosing_email_needs_an_email_address(self, send):
        res = self.post({**FORM, 'preferred_contact': 'email'})
        self.assertEqual(res.status_code, 400)
        self.assertIn('email', res.data)

    def test_a_visitor_cannot_set_the_follow_up_status(self, send):
        self.post({**FORM, 'status': 'won', 'notes': 'free forever'})
        demo = DemoRequest.objects.get()
        self.assertEqual(demo.status, 'new')
        self.assertEqual(demo.notes, '')

    def test_a_bot_filling_the_honeypot_saves_nothing(self, send):
        res = self.post({**FORM, 'website': 'http://spam.example'})
        self.assertEqual(res.status_code, 201)
        self.assertFalse(DemoRequest.objects.exists())
        send.assert_not_called()

    def test_a_stale_login_cookie_does_not_block_the_form(self, send):
        self.client.cookies['access_token'] = 'expired-garbage'
        res = self.post(FORM)
        self.assertEqual(res.status_code, 201)

    def test_one_address_is_limited_to_five_an_hour(self, send):
        for _ in range(5):
            self.assertEqual(self.post(FORM).status_code, 201)
        self.assertEqual(self.post(FORM).status_code, 429)


class DemoRequestAdminTest(APITestCase):
    def setUp(self):
        self.demo = DemoRequest.objects.create(
            school_name='Bright Stars Academy', contact_name='Ada Okafor',
            phone='08012345678')
        self.platform_admin = User.objects.create_user(
            username='ops_admin', email='ops@example.com', role='platform_admin',
            password=None, is_active=True, tenant=None)

    def get(self, url=URL):
        return self.client.get(url, HTTP_HOST='localhost')

    def test_anyone_logged_out_cannot_read_requests(self):
        self.assertIn(self.get().status_code, (401, 403))

    def test_a_school_admin_cannot_read_requests(self):
        school = Tenant.objects.create(
            name='Alpha Academy', slug='alpha-academy',
            owner_email='owner@alpha.example', owner_name='Owner')
        admin = User.objects.create_user(
            username='alpha_admin', email='admin@alpha.example', role='superadmin',
            password=None, is_active=True, tenant=school)
        self.client.force_authenticate(admin)
        self.assertEqual(self.get().status_code, 403)

    def test_the_platform_admin_sees_requests_and_records_follow_up(self):
        self.client.force_authenticate(self.platform_admin)
        res = self.get()
        self.assertEqual(res.status_code, 200)
        rows = res.data['results'] if isinstance(res.data, dict) else res.data
        self.assertEqual(rows[0]['school_name'], 'Bright Stars Academy')

        res = self.client.patch(
            f'{URL}{self.demo.pk}/',
            {'status': 'demo_booked', 'notes': 'Thursday 10am', 'school_name': 'Changed'},
            format='json', HTTP_HOST='localhost')
        self.assertEqual(res.status_code, 200, res.content)
        self.demo.refresh_from_db()
        self.assertEqual(self.demo.status, 'demo_booked')
        self.assertEqual(self.demo.notes, 'Thursday 10am')
        self.assertEqual(self.demo.school_name, 'Bright Stars Academy')

    def test_requests_are_never_deleted(self):
        self.client.force_authenticate(self.platform_admin)
        res = self.client.delete(f'{URL}{self.demo.pk}/', HTTP_HOST='localhost')
        self.assertEqual(res.status_code, 405)
        self.assertTrue(DemoRequest.objects.filter(pk=self.demo.pk).exists())


class WhatsAppNumberTest(APITestCase):
    def test_the_number_is_kept_as_digits_only(self):
        admin = User.objects.create_user(
            username='ops_admin', email='ops@example.com', role='platform_admin',
            password=None, is_active=True, tenant=None)
        self.client.force_authenticate(admin)
        res = self.client.patch('/api/tenants/platform-content/',
                                {'contact_whatsapp': '+234 801 234 5678'},
                                format='json', HTTP_HOST='localhost')
        self.assertEqual(res.status_code, 200, res.content)
        self.assertEqual(PlatformContent.load().contact_whatsapp, '2348012345678')


class DemoVideoUrlTest(APITestCase):
    def setUp(self):
        admin = User.objects.create_user(
            username='video_admin', email='video@example.com', role='platform_admin',
            password=None, is_active=True, tenant=None)
        self.client.force_authenticate(admin)

    def test_the_link_is_saved_and_served_publicly(self):
        url = 'https://res.cloudinary.com/demo/video/upload/nuventa-cloud-demo.mp4'
        res = self.client.patch('/api/tenants/platform-content/',
                                {'demo_video_url': url},
                                format='json', HTTP_HOST='localhost')
        self.assertEqual(res.status_code, 200, res.content)
        self.client.force_authenticate(None)
        res = self.client.get('/api/tenants/platform-content/', HTTP_HOST='localhost')
        self.assertEqual(res.json()['demo_video_url'], url)

    def test_something_that_is_not_a_link_is_refused(self):
        res = self.client.patch('/api/tenants/platform-content/',
                                {'demo_video_url': 'nuventa demo video'},
                                format='json', HTTP_HOST='localhost')
        self.assertEqual(res.status_code, 400)
        self.assertEqual(PlatformContent.load().demo_video_url, '')
