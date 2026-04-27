"""
student_promotions/urls.py

Add to your main urls.py:
    path("api/student_promotions/", include("student_promotions.urls")),
"""

from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import PromotionRuleViewSet, StudentPromotionViewSet

router = DefaultRouter()
router.register(r"rules", PromotionRuleViewSet, basename="promotion-rule")
router.register(r"", StudentPromotionViewSet, basename="student-promotion")

urlpatterns = [
    path("", include(router.urls)),
]

app_name = "student_promotions"


# ── Generated route summary ──────────────────────────────────────────────────
#
# GET    /api/student_promotions/                               list all student_promotions
# GET    /api/student_promotions/{id}/                          single student_promotions
# POST   /api/student_promotions/run-auto/                      trigger auto for class
# POST   /api/student_promotions/{id}/manual-promote/           admin override
# POST   /api/student_promotions/{id}/recalculate/              re-run auto for student
# GET    /api/student_promotions/summary/                       aggregate stats
# GET    /api/student_promotions/rules/                         list rules
# POST   /api/student_promotions/rules/                         create rule
# GET    /api/student_promotions/rules/{id}/                    single rule
# PATCH  /api/student_promotions/rules/{id}/                    update rule
# DELETE /api/student_promotions/rules/{id}/                    delete rule
