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

        allowed_roles = ['ADMIN', 'TEACHER', 'PARENT', 'SUPERADMIN']

        # Also check Django's is_superuser flag
        return user_role in allowed_roles or request.user.is_superuser
