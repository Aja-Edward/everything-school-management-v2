# tenants/admin.py
from django.contrib import admin
from .models import (
    Tenant, TenantService, ServicePricing, TenantSettings,
    TenantInvoice, TenantInvoiceLineItem, TenantPayment, TenantInvitation
)


class TenantServiceInline(admin.TabularInline):
    model = TenantService
    extra = 0


class TenantSettingsInline(admin.StackedInline):
    model = TenantSettings
    can_delete = False


@admin.register(Tenant)
class TenantAdmin(admin.ModelAdmin):
    list_display = ['name', 'slug', 'status', 'is_active', 'owner_email', 'created_at']
    list_filter = ['status', 'is_active', 'created_at']
    search_fields = ['name', 'slug', 'owner_email']
    readonly_fields = ['id', 'created_at', 'updated_at', 'activated_at']
    inlines = [TenantSettingsInline, TenantServiceInline]

    fieldsets = (
        ('Basic Information', {
            'fields': ('id', 'name', 'slug', 'owner_name', 'owner_email', 'owner_phone')
        }),
        ('Custom Domain', {
            'fields': ('custom_domain', 'custom_domain_verified', 'domain_verification_token'),
            'classes': ('collapse',)
        }),
        ('Status', {
            'fields': ('status', 'is_active')
        }),
        ('Timestamps', {
            'fields': ('created_at', 'updated_at', 'activated_at', 'deleted_at'),
            'classes': ('collapse',)
        }),
    )


@admin.register(TenantService)
class TenantServiceAdmin(admin.ModelAdmin):
    list_display = ['tenant', 'service', 'is_enabled', 'enabled_at']
    list_filter = ['service', 'is_enabled']
    search_fields = ['tenant__name']


@admin.register(ServicePricing)
class ServicePricingAdmin(admin.ModelAdmin):
    list_display = ['service', 'price_per_student', 'is_base_service', 'is_active']
    list_filter = ['is_base_service', 'is_active']
    list_editable = ['price_per_student', 'is_active']


class TenantInvoiceLineItemInline(admin.TabularInline):
    model = TenantInvoiceLineItem
    extra = 0


class TenantPaymentInline(admin.TabularInline):
    model = TenantPayment
    extra = 0
    readonly_fields = ['created_at']


@admin.register(TenantInvoice)
class TenantInvoiceAdmin(admin.ModelAdmin):
    list_display = ['invoice_number', 'tenant', 'status', 'total_amount', 'balance_due', 'issue_date']
    list_filter = ['status', 'billing_period', 'issue_date']
    search_fields = ['invoice_number', 'tenant__name']
    readonly_fields = ['id', 'invoice_number', 'base_amount', 'services_amount', 'subtotal', 'total_amount', 'balance_due', 'created_at']
    inlines = [TenantInvoiceLineItemInline, TenantPaymentInline]

    fieldsets = (
        ('Invoice Details', {
            'fields': ('id', 'invoice_number', 'tenant', 'status')
        }),
        ('Billing Period', {
            'fields': ('billing_period', 'academic_session', 'term')
        }),
        ('Pricing', {
            'fields': ('base_price_per_student', 'student_count')
        }),
        ('Amounts', {
            'fields': ('base_amount', 'services_amount', 'subtotal', 'discount_amount', 'discount_reason', 'total_amount', 'amount_paid', 'balance_due')
        }),
        ('Dates', {
            'fields': ('issue_date', 'due_date', 'paid_at')
        }),
        ('Notes', {
            'fields': ('notes', 'admin_notes'),
            'classes': ('collapse',)
        }),
    )


@admin.register(TenantPayment)
class TenantPaymentAdmin(admin.ModelAdmin):
    list_display = ['reference', 'invoice', 'amount', 'payment_method', 'status', 'created_at']
    list_filter = ['status', 'payment_method', 'created_at']
    search_fields = ['reference', 'invoice__invoice_number', 'invoice__tenant__name']
    readonly_fields = ['id', 'created_at', 'updated_at']


@admin.register(TenantInvitation)
class TenantInvitationAdmin(admin.ModelAdmin):
    list_display = ['email', 'tenant', 'role', 'status', 'created_at', 'expires_at']
    list_filter = ['status', 'role', 'created_at']
    search_fields = ['email', 'tenant__name']
    readonly_fields = ['id', 'token', 'created_at']
