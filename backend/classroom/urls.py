from django.urls import path, include
from rest_framework.routers import DefaultRouter

# Import from academics app
from academics.views import AcademicSessionViewSet, TermViewSet

# Import from classroom app
from .views import (
    # Academic Structure ViewSets
    GradeLevelViewSet,
    SectionViewSet,
    StreamViewSet,
    # People Management ViewSets
    TeacherViewSet,
    StudentViewSet,
    # Enhanced Subject ViewSets (modular approach)
    SubjectViewSet,
    SubjectAnalyticsViewSet,
    SubjectManagementViewSet,
    # Classroom Management ViewSets
    ClassroomViewSet,
    ClassroomTeacherAssignmentViewSet,
    StudentEnrollmentViewSet,
    # Scheduling ViewSets
    ClassScheduleViewSet,
    # Additional Views for Nigerian Education System
    SubjectByEducationLevelView,
    SubjectQuickSearchView,
    SubjectComparisonView,
    # Utility Views
    health_check,
    system_info,
    clear_caches_endpoint,
)

# Main router for standard CRUD operations
router = DefaultRouter()

# ============================================================================
# ACADEMIC STRUCTURE ROUTES
# ============================================================================
# ✅ Using AcademicSessionViewSet and TermViewSet from academics app
router.register(
    r"academic-sessions", AcademicSessionViewSet, basename="academicsession"
)
router.register(r"terms", TermViewSet, basename="term")
router.register(r"grades", GradeLevelViewSet, basename="gradelevel")
router.register(r"sections", SectionViewSet, basename="section")
router.register(r"streams", StreamViewSet, basename="stream")

# ============================================================================
# ENHANCED SUBJECT MANAGEMENT ROUTES
# ============================================================================
# Core subject CRUD operations with Nigerian education system support
router.register(r"subjects", SubjectViewSet, basename="subject")

# Subject analytics and reporting (read-only)
router.register(
    r"analytics/subjects", SubjectAnalyticsViewSet, basename="subject-analytics"
)

# Subject management operations (admin-only)
router.register(
    r"management/subjects", SubjectManagementViewSet, basename="subject-management"
)

# ============================================================================
# PEOPLE MANAGEMENT ROUTES
# ============================================================================
# Note: Teachers are handled by the teacher app at /api/teachers/
router.register(r"students", StudentViewSet, basename="student")

# ============================================================================
# CLASSROOM MANAGEMENT ROUTES
# ============================================================================
router.register(r"classrooms", ClassroomViewSet, basename="classroom")
router.register(
    r"teacher-assignments",
    ClassroomTeacherAssignmentViewSet,
    basename="teacherassignment",
)
router.register(
    r"student-enrollments", StudentEnrollmentViewSet, basename="studentenrollment"
)

# ============================================================================
# SCHEDULING ROUTES
# ============================================================================
router.register(r"schedules", ClassScheduleViewSet, basename="classschedule")

# ============================================================================
# URL PATTERNS
# ============================================================================
urlpatterns = [
    # Include all router URLs
    path("", include(router.urls)),
    # ========================================================================
    # SYSTEM HEALTH & MONITORING ENDPOINTS
    # ========================================================================
    path("health/", health_check, name="health-check"),
    path("system-info/", system_info, name="system-info"),
    path("clear-caches/", clear_caches_endpoint, name="clear-caches"),
    # ========================================================================
    # ENHANCED SUBJECT ENDPOINTS (Nigerian Education System)
    # ========================================================================
    # Education level specific endpoints
    path(
        "subjects/by-level/",
        SubjectByEducationLevelView.as_view(),
        name="subjects-by-education-level",
    ),
    # Quick search for autocomplete
    path(
        "subjects/quick-search/",
        SubjectQuickSearchView.as_view(),
        name="subjects-quick-search",
    ),
    # Subject comparison
    path(
        "subjects/compare/",
        SubjectComparisonView.as_view(),
        name="subjects-compare",
    ),
    # Subject ViewSet custom actions (explicit URLs for better documentation)
    path(
        "subjects/by-category/",
        SubjectViewSet.as_view({"get": "by_category"}),
        name="subjects-by-category",
    ),
    path(
        "subjects/by-education-level/",
        SubjectViewSet.as_view({"get": "by_education_level"}),
        name="subjects-grouped-by-education-level",
    ),
    path(
        "subjects/nursery/",
        SubjectViewSet.as_view({"get": "nursery_subjects"}),
        name="nursery-subjects",
    ),
    path(
        "subjects/senior-secondary/",
        SubjectViewSet.as_view({"get": "senior_secondary_subjects"}),
        name="senior-secondary-subjects",
    ),
    path(
        "subjects/cross-cutting/",
        SubjectViewSet.as_view({"get": "cross_cutting_subjects"}),
        name="cross-cutting-subjects",
    ),
    path(
        "subjects/for-grade/",
        SubjectViewSet.as_view({"get": "for_grade"}),
        name="subjects-for-grade",
    ),
    path(
        "subjects/search-suggestions/",
        SubjectViewSet.as_view({"get": "search_suggestions"}),
        name="subjects-search-suggestions",
    ),
    path(
        "subjects/statistics/",
        SubjectViewSet.as_view({"get": "statistics"}),
        name="subjects-statistics",
    ),
    path(
        "subjects/<int:pk>/check-availability/",
        SubjectViewSet.as_view({"post": "check_availability"}),
        name="subject-check-availability",
    ),
    path(
        "subjects/<int:pk>/prerequisites/",
        SubjectViewSet.as_view({"get": "prerequisites"}),
        name="subject-prerequisites",
    ),
    path(
        "subjects/<int:pk>/education-levels/",
        SubjectViewSet.as_view({"get": "education_levels"}),
        name="subject-education-levels",
    ),
    # ========================================================================
    # CLASSROOM MANAGEMENT ENDPOINTS
    # ========================================================================
    # Classroom specific endpoints
    path(
        "classrooms/statistics/",
        ClassroomViewSet.as_view({"get": "statistics"}),
        name="classroom-statistics",
    ),
    path(
        "classrooms/<int:pk>/students/",
        ClassroomViewSet.as_view({"get": "students"}),
        name="classroom-students",
    ),
    path(
        "classrooms/<int:pk>/teachers/",
        ClassroomViewSet.as_view({"get": "teachers"}),
        name="classroom-teachers",
    ),
    path(
        "classrooms/<int:pk>/subjects/",
        ClassroomViewSet.as_view({"get": "subjects"}),
        name="classroom-subjects",
    ),
    path(
        "classrooms/<int:pk>/schedule/",
        ClassroomViewSet.as_view({"get": "schedule"}),
        name="classroom-schedule",
    ),
    path(
        "classrooms/<int:pk>/set-capacity/",
        ClassroomViewSet.as_view({"patch": "set_capacity"}),
        name="classroom-set-capacity",
    ),
    # ========================================================================
    # STUDENT MANAGEMENT ENDPOINTS
    # ========================================================================
    # Student specific endpoints
    path(
        "students/<int:student_id>/current-class/",
        StudentViewSet.as_view({"get": "current_class"}),
        name="student-current-class",
    ),
    path(
        "students/<int:student_id>/subjects/",
        StudentViewSet.as_view({"get": "subjects"}),
        name="student-subjects",
    ),
    path(
        "students/<int:student_id>/schedule/",
        StudentViewSet.as_view({"get": "schedule"}),
        name="student-schedule",
    ),
    path(
        "students/<int:student_id>/enrollment-history/",
        StudentViewSet.as_view({"get": "enrollment_history"}),
        name="student-enrollment-history",
    ),
    # ========================================================================
    # TEACHER MANAGEMENT ENDPOINTS
    # ========================================================================
    # Teacher specific endpoints
    path(
        "teachers/<int:teacher_id>/classes/",
        TeacherViewSet.as_view({"get": "classes"}),
        name="teacher-classes",
    ),
    path(
        "teachers/<int:teacher_id>/subjects/",
        TeacherViewSet.as_view({"get": "subjects"}),
        name="teacher-subjects",
    ),
    path(
        "teachers/<int:teacher_id>/schedule/",
        TeacherViewSet.as_view({"get": "schedule"}),
        name="teacher-schedule",
    ),
    path(
        "teachers/<int:teacher_id>/workload/",
        TeacherViewSet.as_view({"get": "workload"}),
        name="teacher-workload",
    ),
    # ========================================================================
    # ACADEMIC STRUCTURE ENDPOINTS
    # ========================================================================
    # ✅ Academic Session endpoints (from academics app)
    path(
        "academic-sessions/current/",
        AcademicSessionViewSet.as_view({"get": "current"}),
        name="current-academic-session",
    ),
    path(
        "academic-sessions/<int:pk>/set-current/",
        AcademicSessionViewSet.as_view({"post": "set_current"}),
        name="set-current-academic-session",
    ),
    path(
        "academic-sessions/<int:pk>/terms/",
        AcademicSessionViewSet.as_view({"get": "terms"}),
        name="academic-session-terms",
    ),
    path(
        "academic-sessions/<int:pk>/statistics/",
        AcademicSessionViewSet.as_view({"get": "statistics"}),
        name="academic-session-statistics",
    ),
    # ✅ Term endpoints (from academics app)
    path(
        "terms/current/",
        TermViewSet.as_view({"get": "current"}),
        name="current-term",
    ),
    path(
        "terms/by-session/",
        TermViewSet.as_view({"get": "by_session"}),
        name="terms-by-session",
    ),
    path(
        "terms/<int:pk>/set-current/",
        TermViewSet.as_view({"post": "set_current"}),
        name="set-current-term",
    ),
    path(
        "terms/<int:pk>/subjects/",
        TermViewSet.as_view({"get": "subjects"}),
        name="term-subjects",
    ),
    # Grade level endpoints
    path(
        "grades/<int:pk>/subjects/",
        GradeLevelViewSet.as_view({"get": "subjects"}),
        name="grade-subjects",
    ),
    path(
        "grades/<int:pk>/students/",
        GradeLevelViewSet.as_view({"get": "students"}),
        name="grade-students",
    ),
    path(
        "grades/<int:pk>/classrooms/",
        GradeLevelViewSet.as_view({"get": "classrooms"}),
        name="grade-classrooms",
    ),
    path(
        "grades/<int:pk>/sections/",
        GradeLevelViewSet.as_view({"get": "sections"}),
        name="grade-sections",
    ),
    path(
        "grades/nursery/",
        GradeLevelViewSet.as_view({"get": "nursery_grades"}),
        name="nursery-grades",
    ),
    path(
        "grades/primary/",
        GradeLevelViewSet.as_view({"get": "primary_grades"}),
        name="primary-grades",
    ),
    path(
        "grades/junior-secondary/",
        GradeLevelViewSet.as_view({"get": "junior_secondary_grades"}),
        name="junior-secondary-grades",
    ),
    path(
        "grades/senior-secondary/",
        GradeLevelViewSet.as_view({"get": "senior_secondary_grades"}),
        name="senior-secondary-grades",
    ),
    # Stream endpoints
    path(
        "streams/by-type/",
        StreamViewSet.as_view({"get": "by_type"}),
        name="streams-by-type",
    ),
    # ========================================================================
    # ENROLLMENT & ASSIGNMENT ENDPOINTS
    # ========================================================================
    # Student enrollment endpoints
    path(
        "student-enrollments/by-academic-year/<int:academic_year_id>/",
        StudentEnrollmentViewSet.as_view({"get": "by_academic_year"}),
        name="enrollments-by-academic-year",
    ),
    path(
        "student-enrollments/by-grade/<int:grade_id>/",
        StudentEnrollmentViewSet.as_view({"get": "by_grade"}),
        name="enrollments-by-grade",
    ),
    path(
        "student-enrollments/statistics/",
        StudentEnrollmentViewSet.as_view({"get": "statistics"}),
        name="enrollment-statistics",
    ),
    # Teacher assignment endpoints
    path(
        "teacher-assignments/by-academic-year/<int:academic_year_id>/",
        ClassroomTeacherAssignmentViewSet.as_view({"get": "by_academic_year"}),
        name="assignments-by-academic-year",
    ),
    path(
        "teacher-assignments/by-subject/<int:subject_id>/",
        ClassroomTeacherAssignmentViewSet.as_view({"get": "by_subject"}),
        name="assignments-by-subject",
    ),
    path(
        "teacher-assignments/workload-analysis/",
        ClassroomTeacherAssignmentViewSet.as_view({"get": "workload_analysis"}),
        name="teacher-workload-analysis",
    ),
    # ========================================================================
    # SCHEDULING ENDPOINTS
    # ========================================================================
    # Schedule management endpoints
    path(
        "schedules/by-classroom/<int:classroom_id>/",
        ClassScheduleViewSet.as_view({"get": "by_classroom"}),
        name="schedules-by-classroom",
    ),
    path(
        "schedules/by-teacher/<int:teacher_id>/",
        ClassScheduleViewSet.as_view({"get": "by_teacher"}),
        name="schedules-by-teacher",
    ),
    path(
        "schedules/by-subject/<int:subject_id>/",
        ClassScheduleViewSet.as_view({"get": "by_subject"}),
        name="schedules-by-subject",
    ),
    path(
        "schedules/conflicts/",
        ClassScheduleViewSet.as_view({"get": "conflicts"}),
        name="schedule-conflicts",
    ),
    path(
        "schedules/daily/<str:date>/",
        ClassScheduleViewSet.as_view({"get": "daily_schedule"}),
        name="daily-schedule",
    ),
    path(
        "schedules/weekly/",
        ClassScheduleViewSet.as_view({"get": "weekly_schedule"}),
        name="weekly-schedule",
    ),
]

# ============================================================================
# API DOCUMENTATION
# ============================================================================
"""
Enhanced Nigerian Education System API - URL Configuration

This URL configuration supports a comprehensive Nigerian education management system
with specialized endpoints for nursery through senior secondary education.

=== MAIN ENDPOINT CATEGORIES ===

1. SYSTEM MONITORING
   - /health/ - API health check
   - /system-info/ - System information and statistics
   - /clear-caches/ - Cache management (admin only)

2. SUBJECT MANAGEMENT (Nigerian Education System)
   - /subjects/ - Core CRUD operations
   - /analytics/subjects/ - Analytics and reporting
   - /management/subjects/ - Admin management operations
   - /subjects/by-level/ - Education level filtering
   - /subjects/nursery/ - Nursery-specific subjects
   - /subjects/senior-secondary/ - SS subject classification
   - /subjects/cross-cutting/ - Cross-cutting subjects
   - /subjects/quick-search/ - Autocomplete search
   - /subjects/compare/ - Subject comparison

3. ACADEMIC STRUCTURE
   - /academic-years/ - Academic year management
   - /terms/ - Term management
   - /grades/ - Grade level management (Nursery-SS3)
   - /sections/ - Section management

4. PEOPLE MANAGEMENT
   - /teachers/ - Teacher management
   - /students/ - Student management

5. CLASSROOM MANAGEMENT
   - /classrooms/ - Classroom management
   - /teacher-assignments/ - Teacher-classroom assignments
   - /student-enrollments/ - Student enrollment management

6. SCHEDULING
   - /schedules/ - Class schedule management

=== NIGERIAN EDUCATION LEVELS SUPPORTED ===

✅ NURSERY EDUCATION
   - Pre-Nursery, Nursery 1, Nursery 2
   - Activity-based subjects
   - Specialized nursery endpoints

✅ PRIMARY EDUCATION
   - Primary 1-6
   - Core subjects and activities
   - Basic skill development

✅ JUNIOR SECONDARY EDUCATION
   - JSS 1-3
   - Foundation subjects
   - Introduction to specialized subjects

✅ SENIOR SECONDARY EDUCATION
   - SS 1-3
   - Subject type classification:
     * Cross-cutting (required for all)
     * Core Science
     * Core Arts
     * Core Humanities
     * Elective subjects

=== SPECIAL FEATURES ===

🎯 Cross-cutting Subjects: Mathematics, English, Civic Education
🎨 Activity-based Learning: For nursery education
🔬 Practical Requirements: Lab and equipment tracking
👨‍🏫 Specialist Teachers: Subject-specific requirements
📊 Comprehensive Analytics: Performance and utilization metrics
⚡ Performance Optimized: Multi-level caching system
🔒 Role-based Access: Student, Teacher, Admin permissions

=== CACHING STRATEGY ===

- List views: 15 minutes
- Detail views: 30 minutes
- Statistics: 10 minutes
- Search results: 5 minutes
- System info: 1 hour

=== EXAMPLE USAGE ===

# Get nursery subjects
GET /subjects/nursery/?level=NURSERY_1

# Get Senior Secondary science subjects
GET /subjects/senior-secondary/?type=core_science

# Compare subjects
POST /subjects/compare/
{"subject_ids": [1, 2, 3]}

# Get subjects for a specific grade
GET /subjects/for-grade/?grade=5

# Quick search for autocomplete
GET /subjects/quick-search/?q=math&limit=5

# Get cross-cutting subjects
GET /subjects/cross-cutting/

# Check subject availability for grade
POST /subjects/1/check-availability/
{"grade_level_id": 10}

# Get teacher's schedule
GET /teachers/1/schedule/

# Get classroom subjects
GET /classrooms/1/subjects/
"""
