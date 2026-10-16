"""The schools whose logos scroll across the marketing homepage."""
from rest_framework.test import APITestCase

from tenants.models import Tenant, TenantSettings
from tenants.views import showcase_logo_url

URL = '/api/tenants/showcase/'
LOGO = 'https://res.cloudinary.com/demo/image/upload/v17/school_logos/{slug}/logo_{slug}.png'


class ShowcaseSchoolsTest(APITestCase):
    def school(self, slug, logo=True, **fields):
        tenant = Tenant.objects.create(
            name=slug.replace('-', ' ').title(), slug=slug,
            owner_email=f'owner@{slug}.example',
            status=fields.pop('status', 'active'), is_active=fields.pop('is_active', True),
            **fields)
        TenantSettings.objects.update_or_create(
            tenant=tenant, defaults={'logo': LOGO.format(slug=slug) if logo else ''})
        return tenant

    def slugs(self):
        res = self.client.get(URL, HTTP_HOST='localhost')
        self.assertEqual(res.status_code, 200, res.content)
        return [s['slug'] for s in res.json()]

    def test_an_active_school_shows_as_soon_as_it_has_a_logo(self):
        self.school('bright-stars')
        res = self.client.get(URL, HTTP_HOST='localhost')
        self.assertEqual(res.json(), [{
            'name': 'Bright Stars',
            'slug': 'bright-stars',
            'logo': 'https://res.cloudinary.com/demo/image/upload/c_fit,h_200,f_auto,q_auto/'
                    'v17/school_logos/bright-stars/logo_bright-stars.png',
        }])

    def test_schools_without_a_logo_are_left_out(self):
        self.school('no-logo-yet', logo=False)
        self.assertEqual(self.slugs(), [])

    def test_inactive_suspended_and_deleted_schools_are_left_out(self):
        from django.utils import timezone
        self.school('pending-school', status='pending', is_active=False)
        self.school('suspended-school', status='suspended', is_active=False)
        self.school('deleted-school', deleted_at=timezone.now())
        self.assertEqual(self.slugs(), [])

    def test_a_platform_admin_can_hide_a_school(self):
        self.school('demo-school', show_on_homepage=False)
        self.school('real-school')
        self.assertEqual(self.slugs(), ['real-school'])

    def test_a_stray_prefix_in_the_stored_logo_is_ignored(self):
        stored = 'image/upload/https://res.cloudinary.com/demo/image/upload/v9/a/logo.png'
        self.assertEqual(
            showcase_logo_url(stored),
            'https://res.cloudinary.com/demo/image/upload/c_fit,h_200,f_auto,q_auto/v9/a/logo.png')

    def test_a_logo_that_is_not_on_cloudinary_is_not_shown(self):
        self.assertIsNone(showcase_logo_url('https://example.com/logo.png'))
        self.assertIsNone(showcase_logo_url(''))


class HomepageSwitchTest(APITestCase):
    def test_a_platform_admin_hides_a_school_from_the_school_list(self):
        from django.contrib.auth import get_user_model
        tenant = Tenant.objects.create(
            name='Demo School', slug='demo-school', owner_email='owner@demo.example',
            status='active', is_active=True)
        TenantSettings.objects.update_or_create(
            tenant=tenant, defaults={'logo': LOGO.format(slug='demo-school')})
        admin = get_user_model().objects.create_user(
            username='ops_admin', email='ops@example.com', role='platform_admin',
            password=None, is_active=True, tenant=None)
        self.client.force_authenticate(admin)

        res = self.client.patch(f'/api/tenants/list/{tenant.id}/', {'show_on_homepage': False},
                                format='json', HTTP_HOST='localhost')
        self.assertEqual(res.status_code, 200, res.content)
        self.assertFalse(res.json()['show_on_homepage'])

        self.client.force_authenticate(None)
        self.assertEqual(self.client.get(URL, HTTP_HOST='localhost').json(), [])
