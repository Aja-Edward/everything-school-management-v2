from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from .models import CustomUser


@admin.register(CustomUser)
class CustomUserAdmin(BaseUserAdmin):
    list_display = [
        "username",
        "email",
        "full_name",
        "role",
        "school_name",  # Show tenant name
        "section",
        "is_active",
        "is_staff",
    ]

    list_filter = [
        "tenant",  # Filter by tenant
        "role",
        "section",
        "is_active",
        "is_staff",
        "email_verified",
    ]

    search_fields = [
        "username",
        "email",
        "first_name",
        "last_name",
        "tenant__name",
        "tenant__slug",
    ]

    fieldsets = (
        (None, {"fields": ("username", "password")}),
        (
            "Personal Info",
            {
                "fields": (
                    "first_name",
                    "middle_name",
                    "last_name",
                    "email",
                    "phone",
                    "phone_number",
                )
            },
        ),
        (
            "Tenant & Role Information",
            {
                "fields": ("tenant", "role", "section", "reports_to"),
                "description": "Multi-tenant: Users must be assigned to a tenant (school)",
            },
        ),
        (
            "Permissions",
            {
                "fields": (
                    "is_active",
                    "is_staff",
                    "is_superuser",
                    "groups",
                    "user_permissions",
                )
            },
        ),
        (
            "Verification",
            {
                "fields": (
                    "email_verified",
                    "verification_code",
                    "verification_code_expires",
                )
            },
        ),
        ("Important Dates", {"fields": ("last_login", "date_joined")}),
    )

    add_fieldsets = (
        (
            None,
            {
                "classes": ("wide",),
                "fields": (
                    "username",
                    "email",
                    "password1",
                    "password2",
                    "first_name",
                    "last_name",
                    "tenant",  # Required for new users
                    "role",
                    "section",
                    "is_active",
                    "is_staff",
                ),
            },
        ),
    )

    readonly_fields = ["date_joined", "last_login"]

    def school_name(self, obj):
        """Display tenant name in list"""
        return obj.tenant.name if obj.tenant else "-"

    school_name.short_description = "School"
    school_name.admin_order_field = "tenant__name"

    def get_queryset(self, request):
        """Filter users by tenant for non-superusers"""
        qs = super().get_queryset(request)

        # True Django superusers see everything
        if request.user.is_superuser:
            return qs

        # Tenant admins only see their tenant's users
        if hasattr(request.user, "tenant") and request.user.tenant:
            return qs.filter(tenant=request.user.tenant)

        return qs.none()
