# tenants/urls.py
from django.urls import path, include
from rest_framework.routers import DefaultRouter

from .views import (
    # Registration
    SchoolRegistrationView,
    CheckSlugView,
    CheckDomainView,
    PublicTenantView,
    SetupTokenExchangeView,

    # Tenant management
    TenantViewSet,
    CurrentTenantView,

    # Services
    ServiceManagementViewSet,
    ServicePricingViewSet,

    # Domain
    DomainManagementViewSet,

    # Settings
    TenantSettingsViewSet,

    # Invoices and Payments
    TenantInvoiceViewSet,
    TenantPaymentViewSet,

    # Invitations
    TenantInvitationViewSet,
)

router = DefaultRouter()
router.register(r'list', TenantViewSet, basename='tenant')
router.register(r'pricing', ServicePricingViewSet, basename='service-pricing')
router.register(r'invoices', TenantInvoiceViewSet, basename='tenant-invoice')
router.register(r'payments', TenantPaymentViewSet, basename='tenant-payment')
router.register(r'invitations', TenantInvitationViewSet, basename='tenant-invitation')

# Service management as a ViewSet
service_list = ServiceManagementViewSet.as_view({
    'get': 'list',
})
service_toggle = ServiceManagementViewSet.as_view({
    'post': 'toggle',
})

# Domain management
domain_current = DomainManagementViewSet.as_view({
    'get': 'current',
})
domain_set = DomainManagementViewSet.as_view({
    'post': 'set_custom_domain',
})
domain_verify = DomainManagementViewSet.as_view({
    'post': 'verify_domain',
})
domain_remove = DomainManagementViewSet.as_view({
    'post': 'remove_custom_domain',
})

# Settings
settings_current = TenantSettingsViewSet.as_view({
    'get': 'current',
    'patch': 'current',
})

urlpatterns = [
    # Include router URLs
    path('', include(router.urls)),

    # Public registration endpoints (no auth required)
    path('register/', SchoolRegistrationView.as_view(), name='school-register'),
    path('check-slug/', CheckSlugView.as_view(), name='check-slug'),
    path('check-domain/', CheckDomainView.as_view(), name='check-domain'),
    path('public/<slug:slug>/', PublicTenantView.as_view(), name='public-tenant'),
    path('setup/exchange/', SetupTokenExchangeView.as_view(), name='setup-token-exchange'),

    # Current tenant context
    path('current/', CurrentTenantView.as_view(), name='current-tenant'),

    # Service management
    path('services/', service_list, name='service-list'),
    path('services/toggle/', service_toggle, name='service-toggle'),

    # Domain management
    path('domain/', domain_current, name='domain-current'),
    path('domain/set/', domain_set, name='domain-set'),
    path('domain/verify/', domain_verify, name='domain-verify'),
    path('domain/remove/', domain_remove, name='domain-remove'),

    # Settings
    path('settings/', settings_current, name='tenant-settings'),
]
