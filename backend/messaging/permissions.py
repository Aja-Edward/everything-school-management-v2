from rest_framework.permissions import BasePermission


class IsParentTeacherOrAdmin(BasePermission):
    """
    Permission class that allows access to parents, teachers, admins, and superadmins.
    """
    def has_permission(self, request, view):
        if not request.user.is_authenticated:
            return False

        # Check user role (handle both lowercase and uppercase)
        user_role = getattr(request.user, 'role', '').upper()

        # Section admins message too; their inbox is their own, like anyone's.
        allowed_roles = [
            'ADMIN', 'TEACHER', 'PARENT', 'SUPERADMIN',
            'NURSERY_ADMIN', 'PRIMARY_ADMIN', 'JUNIOR_SECONDARY_ADMIN',
            'SENIOR_SECONDARY_ADMIN', 'SECONDARY_ADMIN',
        ]

        # Also check Django's is_superuser flag
        return user_role in allowed_roles or request.user.is_superuser
