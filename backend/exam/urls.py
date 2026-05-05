from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    ExamViewSet,
    ExamScheduleViewSet,
    ExamRegistrationViewSet,
    ResultViewSet,
    ExamStatisticsViewSet,
    QuestionBankViewSet,
    ExamTemplateViewSet,
    ExamReviewViewSet,
    ExamTypeViewSet,
    DifficultyLevelViewSet,
    ExamStatusViewSet,
)
from .document_views import (
    parse_exam_document,
    document_parser_status,
)

# Create router for ViewSets
router = DefaultRouter()
router.register(r"exams", ExamViewSet, basename="exam")
router.register(r"schedules", ExamScheduleViewSet, basename="exam-schedule")
router.register(r"registrations", ExamRegistrationViewSet, basename="exam-registration")
router.register(r"results", ResultViewSet, basename="result")
router.register(r"statistics", ExamStatisticsViewSet, basename="exam-statistics")
router.register(r"question-bank", QuestionBankViewSet, basename="question-bank")
router.register(r"exam-templates", ExamTemplateViewSet, basename="exam-template")
router.register(r"exam-reviews",      ExamReviewViewSet,      basename="exam-review")
router.register(r"exam-types",        ExamTypeViewSet,        basename="exam-type")
router.register(r"difficulty-levels", DifficultyLevelViewSet, basename="difficulty-level")
router.register(r"exam-statuses",     ExamStatusViewSet,      basename="exam-status")

# Custom URL patterns for specific exam endpoints
custom_patterns = [
    # Exam-specific endpoints
    path(
        "<int:exam_id>/register/",
        ExamViewSet.as_view({"post": "register_student"}),
        name="exam-register-student",
    ),
    path(
        "<int:exam_id>/unregister/",
        ExamViewSet.as_view({"post": "unregister_student"}),
        name="exam-unregister-student",
    ),
    path(
        "<int:exam_id>/registrations/",
        ExamViewSet.as_view({"get": "get_registrations"}),
        name="exam-registrations",
    ),
    path(
        "<int:exam_id>/results/",
        ExamViewSet.as_view({"get": "get_results", "post": "bulk_create_results"}),
        name="exam-results",
    ),
    path(
        "<int:exam_id>/statistics/",
        ExamViewSet.as_view({"get": "get_statistics"}),
        name="exam-statistics",
    ),
    path(
        "<int:exam_id>/start/",
        ExamViewSet.as_view({"post": "start_exam"}),
        name="exam-start",
    ),
    path(
        "<int:exam_id>/end/",
        ExamViewSet.as_view({"post": "end_exam"}),
        name="exam-end",
    ),
    path(
        "<int:exam_id>/cancel/",
        ExamViewSet.as_view({"post": "cancel_exam"}),
        name="exam-cancel",
    ),
    path(
        "<int:exam_id>/postpone/",
        ExamViewSet.as_view({"post": "postpone_exam"}),
        name="exam-postpone",
    ),
    # Bulk operations
    path(
        "bulk-update/",
        ExamViewSet.as_view({"post": "bulk_update"}),
        name="exam-bulk-update",
    ),
    path(
        "bulk-delete/",
        ExamViewSet.as_view({"post": "bulk_delete"}),
        name="exam-bulk-delete",
    ),
    # Calendar and summary views
    path(
        "calendar/",
        ExamViewSet.as_view({"get": "calendar_view"}),
        name="exam-calendar",
    ),
    path(
        "summary/",
        ExamViewSet.as_view({"get": "summary_list"}),
        name="exam-summary",
    ),
    # Filter endpoints
    path(
        "by-schedule/<int:schedule_id>/",
        ExamViewSet.as_view({"get": "by_schedule"}),
        name="exams-by-schedule",
    ),
    path(
        "by-subject/<int:subject_id>/",
        ExamViewSet.as_view({"get": "by_subject"}),
        name="exams-by-subject",
    ),
    path(
        "by-grade/<int:grade_id>/",
        ExamViewSet.as_view({"get": "by_grade"}),
        name="exams-by-grade",
    ),
    path(
        "by-teacher/<int:teacher_id>/",
        ExamViewSet.as_view({"get": "by_teacher"}),
        name="exams-by-teacher",
    ),
    path(
        "upcoming/",
        ExamViewSet.as_view({"get": "upcoming"}),
        name="exams-upcoming",
    ),
    path(
        "completed/",
        ExamViewSet.as_view({"get": "completed"}),
        name="exams-completed",
    ),
    path(
        "ongoing/",
        ExamViewSet.as_view({"get": "ongoing"}),
        name="exams-ongoing",
    ),
    # Registration-specific endpoints
    path(
        "registrations/by-student/<int:student_id>/",
        ExamRegistrationViewSet.as_view({"get": "by_student"}),
        name="registrations-by-student",
    ),
    path(
        "registrations/by-exam/<int:exam_id>/",
        ExamRegistrationViewSet.as_view({"get": "by_exam"}),
        name="registrations-by-exam",
    ),
    path(
        "registrations/bulk-register/",
        ExamRegistrationViewSet.as_view({"post": "bulk_register"}),
        name="registration-bulk-register",
    ),
    path(
        "registrations/mark-attendance/",
        ExamRegistrationViewSet.as_view({"post": "mark_attendance"}),
        name="registration-mark-attendance",
    ),
    # Result-specific endpoints
    path(
        "results/by-student/<int:student_id>/",
        ResultViewSet.as_view({"get": "by_student"}),
        name="results-by-student",
    ),
    path(
        "results/by-exam/<int:exam_id>/",
        ResultViewSet.as_view({"get": "by_exam"}),
        name="results-by-exam",
    ),
    path(
        "results/by-subject/<int:subject_id>/",
        ResultViewSet.as_view({"get": "by_subject"}),
        name="results-by-subject",
    ),
    path(
        "results/by-grade/<int:grade_id>/",
        ResultViewSet.as_view({"get": "by_grade"}),
        name="results-by-grade",
    ),
    path(
        "results/student-transcript/<int:student_id>/",
        ResultViewSet.as_view({"get": "student_transcript"}),
        name="student-transcript",
    ),
    path(
        "results/grade-sheet/<int:exam_id>/",
        ResultViewSet.as_view({"get": "grade_sheet"}),
        name="exam-grade-sheet",
    ),
    path(
        "results/bulk-create/",
        ResultViewSet.as_view({"post": "bulk_create"}),
        name="results-bulk-create",
    ),
    path(
        "results/bulk-update/",
        ResultViewSet.as_view({"post": "bulk_update"}),
        name="results-bulk-update",
    ),
    # Schedule-specific endpoints
    path(
        "schedules/<int:schedule_id>/exams/",
        ExamScheduleViewSet.as_view({"get": "get_exams"}),
        name="schedule-exams",
    ),
    path(
        "schedules/<int:schedule_id>/activate/",
        ExamScheduleViewSet.as_view({"post": "activate"}),
        name="schedule-activate",
    ),
    path(
        "schedules/<int:schedule_id>/deactivate/",
        ExamScheduleViewSet.as_view({"post": "deactivate"}),
        name="schedule-deactivate",
    ),
    path(
        "schedules/active/",
        ExamScheduleViewSet.as_view({"get": "active_schedules"}),
        name="schedules-active",
    ),
    path(
        "schedules/current-term/",
        ExamScheduleViewSet.as_view({"get": "current_term"}),
        name="schedules-current-term",
    ),
    # Statistics endpoints
    path(
        "statistics/by-schedule/<int:schedule_id>/",
        ExamStatisticsViewSet.as_view({"get": "by_schedule"}),
        name="statistics-by-schedule",
    ),
    path(
        "statistics/by-subject/<int:subject_id>/",
        ExamStatisticsViewSet.as_view({"get": "by_subject"}),
        name="statistics-by-subject",
    ),
    path(
        "statistics/by-grade/<int:grade_id>/",
        ExamStatisticsViewSet.as_view({"get": "by_grade"}),
        name="statistics-by-grade",
    ),
    path(
        "statistics/generate/<int:exam_id>/",
        ExamStatisticsViewSet.as_view({"post": "generate_statistics"}),
        name="statistics-generate",
    ),
    path(
        "statistics/comparison/",
        ExamStatisticsViewSet.as_view({"get": "comparison_report"}),
        name="statistics-comparison",
    ),
    # Report endpoints
    path(
        "reports/performance-summary/",
        ExamViewSet.as_view({"get": "performance_summary"}),
        name="reports-performance-summary",
    ),
    path(
        "reports/attendance-report/",
        ExamViewSet.as_view({"get": "attendance_report"}),
        name="reports-attendance",
    ),
    path(
        "reports/grade-distribution/",
        ExamViewSet.as_view({"get": "grade_distribution"}),
        name="reports-grade-distribution",
    ),
    # Export endpoints
    path(
        "export/results/<int:exam_id>/",
        ResultViewSet.as_view({"get": "export_results"}),
        name="export-results",
    ),
    path(
        "export/registrations/<int:exam_id>/",
        ExamRegistrationViewSet.as_view({"get": "export_registrations"}),
        name="export-registrations",
    ),
    path(
        "export/exam-timetable/<int:schedule_id>/",
        ExamViewSet.as_view({"get": "export_timetable"}),
        name="export-timetable",
    ),
    # Document upload and parsing
    path(
        "parse-document/",
        parse_exam_document,
        name="parse-exam-document",
    ),
    path(
        "parser-status/",
        document_parser_status,
        name="document-parser-status",
    ),
]

# Combine router URLs with custom patterns
urlpatterns = [
    path("", include(router.urls)),
    *custom_patterns,
]

# Additional URL patterns for API documentation
urlpatterns += [
    path("docs/", include("rest_framework.urls")),  # DRF browsable API
]
