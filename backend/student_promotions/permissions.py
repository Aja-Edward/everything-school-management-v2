"""
student_promotions/permissions.py

Promotions are an admin tool: the records expose every student's session
average, and the actions decide who moves into which class.
"""

from rest_framework.permissions import BasePermission

from common.admin_access import admin_level_access


class IsPromotionAdmin(BasePermission):
    """School admins, and section admins (narrowed to their levels by the views)."""

    message = "Only school admins can manage promotions."

    def has_permission(self, request, view):
        return admin_level_access(request.user, getattr(request, "tenant", None)) != []
