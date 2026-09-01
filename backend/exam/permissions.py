# exam/permissions.py

from rest_framework.permissions import BasePermission


class IsTeacherOrAdmin(BasePermission):
    """
    Allows access only to teachers and admin roles.

    The question bank stores `correct_answer` alongside the question, and
    QuestionBankDetailSerializer returns it. Authentication alone is therefore
    not a sufficient gate: with only IsAuthenticated, a signed-in student falls
    through QuestionBankViewSet.get_queryset()'s `elif not user.is_staff`
    branch and can read every is_shared=True question in their school —
    answer keys included. `is_shared` means "shared with other teachers", not
    "safe for learners".

    Students never need this endpoint. They reach questions through the exam
    flow, which is responsible for stripping answers before serving them.
    """

    # Mirrors CustomUser.is_admin, plus 'principal' as used elsewhere in the
    # codebase (see parent/permissions.py).
    ADMIN_ROLES = frozenset(
        {
            "superadmin",
            "admin",
            "principal",
            "secondary_admin",
            "senior_secondary_admin",
            "junior_secondary_admin",
            "primary_admin",
            "nursery_admin",
        }
    )

    def has_permission(self, request, view):
        user = request.user

        if not user or not user.is_authenticated:
            return False

        if user.is_superuser or user.is_staff:
            return True

        role = getattr(user, "role", None)
        if not role:
            return False

        return role == "teacher" or role in self.ADMIN_ROLES
