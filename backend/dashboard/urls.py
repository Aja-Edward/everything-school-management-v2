from django.urls import path
from . import views

app_name = "dashboard"

urlpatterns = [
    # ============================================================================
    # 🎯 UNIFIED DASHBOARD (Auto-detects role)
    # ============================================================================
    # Main endpoint - automatically routes to correct dashboard based on user role
    path("summary/", views.dashboard_summary, name="dashboard-summary"),
    # Extended data - loads after initial render
    path("extended/", views.dashboard_extended, name="dashboard-extended"),
    # ============================================================================
    # 👨‍💼 ADMIN DASHBOARD (Direct access)
    # ============================================================================
    path("admin/summary/", views.admin_dashboard_summary, name="admin-summary"),
    path("admin/extended/", views.admin_dashboard_extended, name="admin-extended"),
    # ============================================================================
    # 👨‍🏫 TEACHER DASHBOARD (Direct access)
    # ============================================================================
    # Auto-detect teacher from logged-in user
    path("teacher/summary/", views.teacher_dashboard_summary, name="teacher-summary"),
    # Specific teacher by ID
    path(
        "teacher/<int:teacher_id>/summary/",
        views.teacher_dashboard_summary,
        name="teacher-summary-by-id",
    ),
    path(
        "teacher/<int:teacher_id>/extended/",
        views.teacher_dashboard_extended,
        name="teacher-extended",
    ),
    # ============================================================================
    # 👨‍👩‍👧 PARENT DASHBOARD (Direct access)
    # ============================================================================
    # Auto-detect parent from logged-in user
    path("parent/summary/", views.parent_dashboard_summary, name="parent-summary"),
    # Specific parent by ID
    path(
        "parent/<int:parent_id>/summary/",
        views.parent_dashboard_summary,
        name="parent-summary-by-id",
    ),
    path(
        "parent/<int:parent_id>/extended/",
        views.parent_dashboard_extended,
        name="parent-extended",
    ),
    # ============================================================================
    # 👨‍🎓 STUDENT DASHBOARD (Direct access)
    # ============================================================================
    # Auto-detect student from logged-in user
    path("student/summary/", views.student_dashboard_summary, name="student-summary"),
    # Specific student by ID
    path(
        "student/<int:student_id>/summary/",
        views.student_dashboard_summary,
        name="student-summary-by-id",
    ),
    path(
        "student/<int:student_id>/extended/",
        views.student_dashboard_extended,
        name="student-extended",
    ),
]

"""
USAGE EXAMPLES:
===============

1. AUTOMATIC ROLE DETECTION (Recommended for most cases):
   GET /api/dashboard/summary/
   - Automatically detects user role and returns appropriate dashboard
   
2. ROLE-SPECIFIC ENDPOINTS:
   GET /api/dashboard/admin/summary/      # Admin dashboard
   GET /api/dashboard/teacher/summary/    # Teacher dashboard (auto-detect)
   GET /api/dashboard/parent/summary/     # Parent dashboard (auto-detect)
   GET /api/dashboard/student/summary/    # Student dashboard (auto-detect)
   
3. EXTENDED DATA (Load after initial render):
   GET /api/dashboard/extended/           # Auto-detect role
   GET /api/dashboard/teacher/17/extended/  # Specific teacher
   
4. BY SPECIFIC ID (For admins viewing other users' dashboards):
   GET /api/dashboard/teacher/17/summary/
   GET /api/dashboard/parent/42/summary/
   GET /api/dashboard/student/123/summary/

FRONTEND USAGE:
===============

// Simple - Auto-detect role
const dashboard = await api.get('/api/dashboard/summary/');

// Load extended data after initial render
setTimeout(async () => {
  const extended = await api.get('/api/dashboard/extended/');
}, 200);

// Or specific role
const teacherDashboard = await api.get('/api/dashboard/teacher/summary/');
"""
