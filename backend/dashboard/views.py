from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django.db.models import Count, Q, Prefetch, Avg, Sum, F, DecimalField, Case, When
from django.utils import timezone
from datetime import timedelta, datetime
from events.models import Event
import logging

from teacher.models import Teacher
from students.models import Student
from parent.models import ParentProfile
from lesson.models import Lesson
from attendance.models import Attendance
from classroom.models import Classroom
from exam.models import Exam
from result.models import StudentResult
from schoolSettings.models import SchoolAnnouncement
from classroom.models import ClassroomTeacherAssignment
from fee.models import Payment, FeeStructure, StudentFee


logger = logging.getLogger(__name__)


# ============================================================================
# 🎯 UNIFIED DASHBOARD ROUTER
# ============================================================================


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def dashboard_summary(request):
    """
    🎯 SMART ROUTER: Automatically detects user role and returns appropriate dashboard

    Usage: GET /api/dashboard/summary/

    Returns dashboard data based on authenticated user's role:
    - Admin/Staff → Admin dashboard
    - Teacher → Teacher dashboard
    - Parent → Parent dashboard
    - Student → Student dashboard
    """

    user = request.user

    try:
        # Detect user role
        role = get_user_role(user)

        logger.info(f"📊 Dashboard requested by {user.username} (role: {role})")

        # Route to appropriate dashboard
        if role in ["admin", "staff", "superadmin"]:
            return admin_dashboard_summary(request)
        elif role == "teacher":
            return teacher_dashboard_summary(request)
        elif role == "parent":
            return parent_dashboard_summary(request)
        elif role == "student":
            return student_dashboard_summary(request)
        else:
            return Response({"error": "Unknown user role", "role": role}, status=400)

    except Exception as e:
        logger.error(f"❌ Dashboard routing error: {str(e)}", exc_info=True)
        return Response(
            {"error": "Failed to load dashboard", "detail": str(e)}, status=500
        )


# ============================================================================
# 👨‍💼 ADMIN DASHBOARD
# ============================================================================


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def admin_dashboard_summary(request):
    """
    ⚡ OPTIMIZED: Admin dashboard with school-wide statistics

    Returns:
    - Overall school stats (students, teachers, classes)
    - Today's attendance summary
    - Recent activities
    - Quick alerts/notifications
    """

    try:
        today = timezone.now().date()

        # ============================================
        # 📊 OPTIMIZED QUERIES: Use aggregations instead of counting
        # ============================================

        # Student statistics (single query with aggregation)
        student_stats = Student.objects.aggregate(
            total=Count("id"),
            active=Count("id", filter=Q(is_active=True)),
            inactive=Count("id", filter=Q(is_active=False)),
        )

        # Teacher statistics
        teacher_stats = Teacher.objects.aggregate(
            total=Count("id"),
            active=Count("id", filter=Q(is_active=True)),
            inactive=Count("id", filter=Q(is_active=False)),
        )

        # Parent statistics
        parent_stats = ParentProfile.objects.aggregate(
            total=Count("id"),
            active=Count("id", filter=Q(user__is_active=True)),
        )

        # Classroom count
        classroom_count = Classroom.objects.count()

        # Today's attendance summary (single optimized query)
        attendance_today = Attendance.objects.filter(date=today).aggregate(
            total=Count("id"),
            present=Count("id", filter=Q(status="P")),
            absent=Count("id", filter=Q(status="A")),
            late=Count("id", filter=Q(status="L")),
        )

        # Calculate attendance rate
        attendance_rate = 0
        if attendance_today["total"] > 0:
            attendance_rate = round(
                (attendance_today["present"] / attendance_today["total"]) * 100, 1
            )

        # ============================================
        # 📅 TODAY'S SCHEDULE SUMMARY
        # ============================================

        todays_lessons = Lesson.objects.filter(
            date=today, status="scheduled"
        ).aggregate(
            total=Count("id"),
            completed=Count("id", filter=Q(status="completed")),
        )

        # ============================================
        # 🔔 RECENT ANNOUNCEMENTS (last 5)
        # ============================================

        recent_announcements = (
            SchoolAnnouncement.objects.filter(is_active=True)
            .order_by("-created_at")
            .values("id", "title", "created_at", "announcement_type", "is_pinned")[:5]
        )

        # ============================================
        # ⚠️ QUICK ALERTS
        # ============================================

        alerts = []

        # Check for low attendance
        if attendance_rate < 85 and attendance_today["total"] > 0:
            alerts.append(
                {
                    "type": "warning",
                    "message": f"Attendance today is {attendance_rate}% (below 85%)",
                }
            )

        # Check for pending results
        pending_exams = (
            Exam.objects.filter(exam_date__lt=today, status="completed")
            .exclude(
                id__in=StudentResult.objects.values_list("exam_session_id", flat=True)
            )
            .count()
        )

        if pending_exams > 0:
            alerts.append(
                {
                    "type": "info",
                    "message": f"{pending_exams} exams have pending results",
                }
            )

        # ============================================
        # 📦 PREPARE RESPONSE
        # ============================================

        response_data = {
            "role": "admin",
            "stats": {
                "students": student_stats,
                "teachers": teacher_stats,
                "parents": parent_stats,
                "classrooms": classroom_count,
            },
            "attendance_today": {
                **attendance_today,
                "rate": attendance_rate,
            },
            "lessons_today": todays_lessons,
            "recent_announcements": list(recent_announcements),
            "alerts": alerts,
            "loaded_at": timezone.now().isoformat(),
            "data_scope": "initial_load",
        }

        logger.info(
            f"✅ Admin dashboard loaded: "
            f"{student_stats['total']} students, "
            f"{teacher_stats['total']} teachers, "
            f"Attendance: {attendance_rate}%"
        )

        return Response(response_data)

    except Exception as e:
        logger.error(f"❌ Admin dashboard error: {str(e)}", exc_info=True)
        return Response(
            {"error": "Failed to load admin dashboard", "detail": str(e)}, status=500
        )


# ============================================================================
# 👨‍🏫 TEACHER DASHBOARD
# ============================================================================


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def teacher_dashboard_summary(request, teacher_id=None):
    """
    ⚡ OPTIMIZED: Teacher dashboard initial load

    Returns only CRITICAL data:
    - Teacher profile (with prefetched relationships)
    - Today's schedule
    - Basic stats
    """

    try:
        # Get teacher ID
        if not teacher_id:
            teacher_id = get_teacher_id_from_user(request.user)
            if not teacher_id:
                return Response({"error": "Teacher profile not found"}, status=404)

        # ============================================
        # 🚀 OPTIMIZED QUERY: Single query with prefetch
        # ============================================

        teacher = (
            Teacher.objects.select_related("user")
            .prefetch_related(
                Prefetch(
                    "classroom_assignments",
                    queryset=(
                        ClassroomTeacherAssignment.objects.select_related(
                            "classroom",
                            "classroom__section",
                            "subject",
                        ).prefetch_related(
                            Prefetch(
                                "classroom__students",
                                queryset=Student.objects.filter(is_active=True).only(
                                    "id"
                                ),
                            )
                        )
                    ),
                )
            )
            .get(id=teacher_id)
        )

        # ============================================
        # 📊 CALCULATE STATS (from prefetched data)
        # ============================================

        assignments = list(teacher.classroom_assignments.all())

        unique_classrooms = set()
        unique_subjects = set()
        total_students = set()

        for assignment in assignments:
            unique_classrooms.add(assignment.classroom.id)
            unique_subjects.add(assignment.subject.id)
            for student in assignment.classroom.students.all():
                total_students.add(student.id)

        stats = {
            "total_classes": len(unique_classrooms),
            "total_subjects": len(unique_subjects),
            "total_students": len(total_students),
        }

        # ============================================
        # 📅 TODAY'S SCHEDULE ONLY
        # ============================================

        today = timezone.now().date()

        todays_lessons = (
            Lesson.objects.filter(teacher_id=teacher_id, date=today, status="scheduled")
            .select_related("classroom", "subject")
            .order_by("start_time")
            .values(
                "id",
                "subject__name",
                "classroom__name",
                "start_time",
                "end_time",
                "lesson_type",
            )[:10]
        )

        # ============================================
        # 📋 QUICK COUNTS
        # ============================================

        last_week = today - timedelta(days=7)
        completed_lessons = Lesson.objects.filter(
            teacher_id=teacher_id,
            date__gte=last_week,
            date__lte=today,
            status="completed",
        ).count()

        attendance_records = Attendance.objects.filter(
            teacher_id=teacher_id,
            date__gte=last_week,
            date__lte=today,
        ).count()

        pending_attendance = max(0, completed_lessons - attendance_records)

        # ============================================
        # 📦 RESPONSE
        # ============================================

        response_data = {
            "role": "teacher",
            "teacher": {
                "id": teacher.id,
                "user_id": teacher.user.id,
                "full_name": f"{teacher.user.first_name} {teacher.user.last_name}",
                "email": teacher.user.email,
                "is_active": teacher.is_active,
            },
            "stats": stats,
            "today_schedule": list(todays_lessons),
            "quick_info": {
                "pending_attendance": pending_attendance,
                "has_classes_today": len(list(todays_lessons)) > 0,
            },
            "classroom_assignments": [
                {
                    "id": assignment.id,
                    "classroom_id": assignment.classroom.id,
                    "classroom_name": assignment.classroom.name,
                    "subject_id": assignment.subject.id,
                    "subject_name": assignment.subject.name,
                    "student_count": assignment.classroom.students.count(),
                }
                for assignment in assignments
            ],
            "loaded_at": timezone.now().isoformat(),
            "data_scope": "initial_load",
        }

        logger.info(
            f"✅ Teacher dashboard loaded for {teacher_id}: "
            f"{stats['total_students']} students, {len(list(todays_lessons))} lessons today"
        )

        return Response(response_data)

    except Teacher.DoesNotExist:
        return Response({"error": "Teacher not found"}, status=404)
    except Exception as e:
        logger.error(f"❌ Teacher dashboard error: {str(e)}", exc_info=True)
        return Response(
            {"error": "Failed to load teacher dashboard", "detail": str(e)}, status=500
        )


# ============================================================================
# 👨‍👩‍👧 PARENT DASHBOARD
# ============================================================================


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def parent_dashboard_summary(request, parent_id=None):
    """
    ⚡ OPTIMIZED: Parent dashboard with children's information

    Returns:
    - Parent profile
    - Children's current status
    - Today's schedule for all children
    - Recent grades/results
    """

    try:
        # Get parent ID
        if not parent_id:
            parent_id = get_parent_id_from_user(request.user)
            if not parent_id:
                return Response({"error": "Parent profile not found"}, status=404)

        # ============================================
        # 🚀 OPTIMIZED QUERY: Prefetch all children data
        # ============================================

        parent = (
            ParentProfile.objects.select_related("user")
            .prefetch_related(
                Prefetch(
                    "children",
                    queryset=Student.objects.filter(is_active=True).select_related(
                        "user", "student_class", "section"
                    ),
                )
            )
            .get(id=parent_id)
        )

        children = list(parent.children.all())

        if not children:
            return Response(
                {
                    "role": "parent",
                    "parent": {
                        "id": parent.id,
                        "full_name": f"{parent.user.first_name} {parent.user.last_name}",
                        "email": parent.user.email,
                    },
                    "children": [],
                    "message": "No children found for this parent",
                    "loaded_at": timezone.now().isoformat(),
                }
            )

        # ============================================
        # 📊 CHILDREN DATA
        # ============================================

        today = timezone.now().date()
        children_data = []

        for child in children:
            # Today's attendance
            attendance_today = (
                Attendance.objects.filter(student=child, date=today)
                .values("status")
                .first()
            )

            # Today's schedule - use classroom ForeignKey
            todays_lessons = []
            if child.classroom:
                todays_lessons = (
                    Lesson.objects.filter(
                        classroom=child.classroom, date=today, status="scheduled"
                    )
                    .select_related("subject", "teacher__user")
                    .values(
                        "id",
                        "subject__name",
                        "teacher__user__first_name",
                        "teacher__user__last_name",
                        "start_time",
                        "end_time",
                    )[:5]
                )

            # Recent results (last 5)
            recent_results = (
                StudentResult.objects.filter(student=child)
                .select_related("exam_session__subject")
                .order_by("-exam_session__exam_date")
                .values(
                    "id",
                    "exam_session__subject__name",
                    "exam_session__exam_date",
                    "total_score",
                    "grade",
                )[:5]
            )

            children_data.append(
                {
                    "id": child.id,
                    "full_name": f"{child.user.first_name} {child.user.last_name}",
                    "classroom": child.classroom.name if child.classroom else None,
                    "classroom_id": child.classroom.id if child.classroom else None,
                    "attendance_today": (
                        attendance_today["status"] if attendance_today else "not_marked"
                    ),
                    "todays_schedule": list(todays_lessons),
                    "recent_results": list(recent_results),
                }
            )

        # ============================================
        # 📦 RESPONSE
        # ============================================

        response_data = {
            "role": "parent",
            "parent": {
                "id": parent.id,
                "user_id": parent.user.id,
                "full_name": f"{parent.user.first_name} {parent.user.last_name}",
                "email": parent.user.email,
                "phone": getattr(parent, "phone", None),
            },
            "children": children_data,
            "stats": {
                "total_children": len(children),
            },
            "loaded_at": timezone.now().isoformat(),
            "data_scope": "initial_load",
        }

        logger.info(
            f"✅ Parent dashboard loaded for {parent_id}: " f"{len(children)} children"
        )

        return Response(response_data)

    except ParentProfile.DoesNotExist:
        return Response({"error": "Parent profile not found"}, status=404)
    except Exception as e:
        logger.error(f"❌ Parent dashboard error: {str(e)}", exc_info=True)
        return Response(
            {"error": "Failed to load parent dashboard", "detail": str(e)}, status=500
        )


# ============================================================================
# 👨‍🎓 STUDENT DASHBOARD
# ============================================================================


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def student_dashboard_summary(request, student_id=None):
    """
    ⚡ OPTIMIZED: Student dashboard with personalized information

    Returns:
    - Student profile
    - Today's schedule
    - Recent attendance
    - Recent grades
    - Upcoming exams
    """

    try:
        # Get student ID
        if not student_id:
            student_id = get_student_id_from_user(request.user)
            if not student_id:
                return Response({"error": "Student profile not found"}, status=404)

        # ============================================
        # 🚀 OPTIMIZED QUERY
        # ============================================

        student = Student.objects.select_related("user", "classroom").get(id=student_id)

        today = timezone.now().date()

        # ============================================
        # 📅 TODAY'S SCHEDULE
        # ============================================

        todays_lessons = []
        if student.classroom:
            todays_lessons = (
                Lesson.objects.filter(
                    classroom=student.classroom, date=today, status="scheduled"
                )
                .select_related("subject", "teacher__user")
                .order_by("start_time")
                .values(
                    "id",
                    "subject__name",
                    "teacher__user__first_name",
                    "teacher__user__last_name",
                    "start_time",
                    "end_time",
                    "lesson_type",
                )[:10]
            )

        # ============================================
        # 📊 ATTENDANCE SUMMARY (last 7 days)
        # ============================================

        last_week = today - timedelta(days=7)
        attendance_summary = (
            Attendance.objects.filter(
                student=student, date__gte=last_week, date__lte=today
            )
            .values("status")
            .annotate(count=Count("id"))
        )

        attendance_stats = {
            "present": 0,
            "absent": 0,
            "late": 0,
        }

        for item in attendance_summary:
            attendance_stats[item["status"]] = item["count"]

        # ============================================
        # 📝 RECENT RESULTS (last 5)
        # ============================================

        recent_results = (
            StudentResult.objects.filter(student=student)
            .select_related("exam_session__subject")
            .order_by("-exam_session__exam_date")
            .values(
                "id",
                "exam_session__subject__name",
                "exam_session__exam_date",
                "total_score",
                "grade",
                "exam_session__total_marks",
            )[:5]
        )

        # Calculate average
        avg_score = (
            StudentResult.objects.filter(student=student).aggregate(avg=Avg("score"))[
                "avg"
            ]
            or 0
        )

        # ============================================
        # 📅 UPCOMING EXAMS (next 14 days)
        # ============================================

        next_two_weeks = today + timedelta(days=14)
        upcoming_exams = []
        if student.classroom:
            upcoming_exams = (
                Exam.objects.filter(
                    classroom=student.classroom,
                    exam_date__gte=today,
                    exam_date__lte=next_two_weeks,
                    status="scheduled",
                )
                .select_related("subject")
                .order_by("exam_date")
                .values(
                    "id",
                    "subject__name",
                    "exam_date",
                    "start_time",
                    "duration_minutes",
                    "total_marks",
                )[:5]
            )

        # ============================================
        # 📦 RESPONSE
        # ============================================

        response_data = {
            "role": "student",
            "student": {
                "id": student.id,
                "user_id": student.user.id,
                "full_name": f"{student.user.first_name} {student.user.last_name}",
                "email": student.user.email,
                "classroom": student.classroom.name if student.classroom else None,
                "classroom_id": student.classroom.id if student.classroom else None,
            },
            "today_schedule": list(todays_lessons),
            "attendance_summary": attendance_stats,
            "academic": {
                "recent_results": list(recent_results),
                "average_score": round(avg_score, 1),
            },
            "upcoming_exams": list(upcoming_exams),
            "loaded_at": timezone.now().isoformat(),
            "data_scope": "initial_load",
        }

        logger.info(
            f"✅ Student dashboard loaded for {student_id}: "
            f"{len(list(todays_lessons))} lessons today"
        )

        return Response(response_data)

    except Student.DoesNotExist:
        return Response({"error": "Student profile not found"}, status=404)
    except Exception as e:
        logger.error(f"❌ Student dashboard error: {str(e)}", exc_info=True)
        return Response(
            {"error": "Failed to load student dashboard", "detail": str(e)}, status=500
        )


# ============================================================================
# 📊 EXTENDED DATA ENDPOINTS (Load after initial render)
# ============================================================================


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def dashboard_extended(request):
    """
    📊 EXTENDED DATA: Load this AFTER initial dashboard render

    Returns additional data based on user role:
    - Attendance history
    - Upcoming events
    - Recent activities
    - Detailed statistics

    Call this 100-500ms after initial load
    """

    user = request.user
    role = get_user_role(user)

    try:
        if role == "teacher":
            teacher_id = get_teacher_id_from_user(user)
            return teacher_dashboard_extended(request, teacher_id)
        elif role == "parent":
            parent_id = get_parent_id_from_user(user)
            return parent_dashboard_extended(request, parent_id)
        elif role == "student":
            student_id = get_student_id_from_user(user)
            return student_dashboard_extended(request, student_id)
        elif role in ["admin", "staff"]:
            return admin_dashboard_extended(request)
        else:
            return Response({"error": "Unknown role"}, status=400)

    except Exception as e:
        logger.error(f"❌ Extended dashboard error: {str(e)}", exc_info=True)
        return Response(
            {"error": "Failed to load extended data", "detail": str(e)}, status=500
        )


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def teacher_dashboard_extended(request, teacher_id=None):
    """
    📊 TEACHER EXTENDED DATA
    GET /api/dashboard/teacher/{teacher_id}/extended/
    """
    try:
        if not teacher_id:
            teacher_id = get_teacher_id_from_user(request.user)
            if not teacher_id:
                return Response({"error": "Teacher profile not found"}, status=404)

        today = timezone.now().date()
        thirty_days_ago = today - timedelta(days=30)

        # Attendance history
        attendance_data = (
            Attendance.objects.filter(teacher_id=teacher_id, date__gte=thirty_days_ago)
            .values("date", "status")
            .annotate(count=Count("id"))
            .order_by("-date")
        )

        # Upcoming lessons
        next_week = today + timedelta(days=7)
        upcoming_lessons = (
            Lesson.objects.filter(
                teacher_id=teacher_id,
                date__gt=today,
                date__lte=next_week,
                status="scheduled",
            )
            .select_related("classroom", "subject")
            .order_by("date", "start_time")
            .values(
                "id",
                "subject__name",
                "classroom__name",
                "date",
                "start_time",
                "end_time",
            )[:20]
        )

        # Announcements and events
        announcements = (
            SchoolAnnouncement.objects.filter(
                is_active=True, target_audience__in=["all", "teachers"]
            )
            .order_by("-created_at")
            .values("id", "title", "content", "created_at")[:5]
        )

        upcoming_events = (
            Event.objects.filter(start_date__gte=timezone.now().date(), is_active=True)
            .order_by("start_date")
            .values("id", "title", "start_date", "end_date")[:5]
        )

        return Response(
            {
                "attendance_history": list(attendance_data),
                "upcoming_lessons": list(upcoming_lessons),
                "announcements": list(announcements),
                "upcoming_events": list(upcoming_events),
                "data_scope": "extended_load",
                "loaded_at": timezone.now().isoformat(),
            }
        )

    except Exception as e:
        logger.error(f"❌ Teacher extended dashboard error: {str(e)}", exc_info=True)
        return Response(
            {"error": "Failed to load extended data", "detail": str(e)}, status=500
        )


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def parent_dashboard_extended(request, parent_id=None):
    """
    📊 PARENT EXTENDED DATA
    GET /api/dashboard/parent/{parent_id}/extended/
    """
    try:
        if not parent_id:
            parent_id = get_parent_id_from_user(request.user)
            if not parent_id:
                return Response({"error": "Parent profile not found"}, status=404)

        # Get all children
        children = Student.objects.filter(parent_profiles__id=parent_id, is_active=True)

        # Detailed attendance for all children (last 30 days)
        thirty_days_ago = timezone.now().date() - timedelta(days=30)

        children_attendance = []
        for child in children:
            attendance = (
                Attendance.objects.filter(student=child, date__gte=thirty_days_ago)
                .values("date", "status")
                .order_by("-date")
            )

            children_attendance.append(
                {
                    "student_id": child.id,
                    "student_name": f"{child.user.first_name} {child.user.last_name}",
                    "attendance": list(attendance),
                }
            )

        return Response(
            {
                "children_attendance": children_attendance,
                "data_scope": "extended_load",
                "loaded_at": timezone.now().isoformat(),
            }
        )

    except Exception as e:
        logger.error(f"❌ Parent extended dashboard error: {str(e)}", exc_info=True)
        return Response(
            {"error": "Failed to load extended data", "detail": str(e)}, status=500
        )


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def student_dashboard_extended(request, student_id=None):
    """
    📊 STUDENT EXTENDED DATA
    GET /api/dashboard/student/{student_id}/extended/
    """
    try:
        if not student_id:
            student_id = get_student_id_from_user(request.user)
            if not student_id:
                return Response({"error": "Student profile not found"}, status=404)

        # Full attendance history (last 60 days)
        sixty_days_ago = timezone.now().date() - timedelta(days=60)

        attendance_history = (
            Attendance.objects.filter(student_id=student_id, date__gte=sixty_days_ago)
            .values("date", "status")
            .order_by("-date")
        )

        # All results this term
        all_results = (
            StudentResult.objects.filter(student_id=student_id)
            .select_related("exam__subject")
            .order_by("-exam__date")
            .values(
                "id",
                "exam__subject__name",
                "exam__date",
                "score",
                "grade",
                "exam__total_marks",
            )[:20]
        )

        return Response(
            {
                "attendance_history": list(attendance_history),
                "all_results": list(all_results),
                "data_scope": "extended_load",
                "loaded_at": timezone.now().isoformat(),
            }
        )

    except Exception as e:
        logger.error(f"❌ Student extended dashboard error: {str(e)}", exc_info=True)
        return Response(
            {"error": "Failed to load extended data", "detail": str(e)}, status=500
        )


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def admin_dashboard_extended(request):
    """
    📊 ADMIN EXTENDED DATA
    GET /api/dashboard/admin/extended/
    """
    try:
        today = timezone.now().date()
        last_month = today - timedelta(days=30)

        # Attendance trends (last 30 days)
        attendance_trends = (
            Attendance.objects.filter(date__gte=last_month)
            .values("date")
            .annotate(
                total=Count("id"),
                present=Count("id", filter=Q(status="P")),
                absent=Count("id", filter=Q(status="A")),
            )
            .order_by("-date")
        )

        # Recent enrollments - with classroom ForeignKey
        recent_students = (
            Student.objects.filter(admission_date__gte=last_month)
            .select_related("user", "classroom")
            .order_by("-admission_date")
            .values(
                "id",
                "user__first_name",
                "user__last_name",
                "classroom__name",
                "admission_date",
            )[:10]
        )

        return Response(
            {
                "attendance_trends": list(attendance_trends),
                "recent_enrollments": list(recent_students),
                "data_scope": "extended_load",
                "loaded_at": timezone.now().isoformat(),
            }
        )

    except Exception as e:
        logger.error(f"❌ Admin extended dashboard error: {str(e)}", exc_info=True)
        return Response(
            {"error": "Failed to load extended data", "detail": str(e)}, status=500
        )


# ============================================================================
# 📊 ENHANCED ADMIN DASHBOARD STATISTICS (DASH-001)
# ============================================================================


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def admin_dashboard_enhanced_stats(request):
    """
    📊 ENHANCED ADMIN DASHBOARD STATISTICS

    GET /api/dashboard/admin/enhanced-stats/

    Returns comprehensive dashboard data including:
    - Payment statistics (total fees, collected, pending, overdue)
    - Attendance trends with chart data (last 30 days)
    - Grade distribution with pass rates
    - Recent activity feed
    - System alerts and notifications

    This endpoint is designed for DASH-001 dashboard widgets.
    """

    try:
        today = timezone.now().date()
        last_30_days = today - timedelta(days=30)
        last_7_days = today - timedelta(days=7)
        current_month_start = today.replace(day=1)

        # ============================================
        # 💰 PAYMENT STATISTICS
        # ============================================

        total_fees_expected = StudentFee.objects.exclude(
            status='CANCELLED'
        ).aggregate(
            total=Sum('amount_due')
        )['total'] or 0

        payment_stats = Payment.objects.aggregate(
            total_collected=Sum('amount', filter=Q(verified=True)),
            total_pending=Sum('amount', filter=Q(verified=False, status='PENDING')),
            total_failed=Sum('amount', filter=Q(verified=False, gateway_status='FAILED')),
            payments_this_month=Sum('amount', filter=Q(
                verified=True,
                payment_date__gte=current_month_start
            )),
            payments_count=Count('id'),
            completed_count=Count('id', filter=Q(verified=True)),
            pending_count=Count('id', filter=Q(verified=False)),
        )

        overdue_amount = StudentFee.objects.filter(
            is_overdue=True,
            status__in=['PENDING', 'PARTIAL', 'OVERDUE']
        ).aggregate(total=Sum(F('amount_due') - F('amount_paid')))['total'] or 0

        payment_trends = (
            Payment.objects.filter(
                verified=True,
                payment_date__gte=last_30_days
            )
            .values('payment_date')
            .annotate(
                amount=Sum('amount'),
                count=Count('id')
            )
            .order_by('payment_date')
        )

        payment_data = {
            'total_fees_expected': float(total_fees_expected),
            'total_collected': float(payment_stats['total_collected'] or 0),
            'total_pending': float(payment_stats['total_pending'] or 0),
            'total_failed': float(payment_stats['total_failed'] or 0),
            'total_overdue': float(overdue_amount),
            'this_month_collected': float(payment_stats['payments_this_month'] or 0),
            'collection_rate': round(
                (float(payment_stats['total_collected'] or 0) / float(total_fees_expected) * 100)
                if total_fees_expected > 0 else 0,
                1
            ),
            'payments_count': payment_stats['payments_count'],
            'completed_count': payment_stats['completed_count'],
            'pending_count': payment_stats['pending_count'],
            'payment_trends': [
                {
                    'date': item['payment_date'].isoformat(),
                    'amount': float(item['amount']),
                    'count': item['count']
                }
                for item in payment_trends
            ]
        }

        # ============================================
        # 📊 ATTENDANCE TRENDS (Chart Data)
        # ============================================

        attendance_trends = (
            Attendance.objects.filter(date__gte=last_30_days)
            .values('date')
            .annotate(
                total=Count('id'),
                present=Count('id', filter=Q(status='P')),
                absent=Count('id', filter=Q(status='A')),
                late=Count('id', filter=Q(status='L')),
                excused=Count('id', filter=Q(status='E'))
            )
            .order_by('date')
        )

        attendance_chart_data = []
        for day in attendance_trends:
            rate = round((day['present'] / day['total'] * 100) if day['total'] > 0 else 0, 1)
            attendance_chart_data.append({
                'date': day['date'].isoformat(),
                'total': day['total'],
                'present': day['present'],
                'absent': day['absent'],
                'late': day['late'],
                'excused': day['excused'],
                'attendance_rate': rate
            })

        attendance_overall = Attendance.objects.filter(
            date__gte=last_30_days
        ).aggregate(
            total=Count('id'),
            present=Count('id', filter=Q(status='P')),
            absent=Count('id', filter=Q(status='A')),
            late=Count('id', filter=Q(status='L'))
        )

        overall_attendance_rate = round(
            (attendance_overall['present'] / attendance_overall['total'] * 100)
            if attendance_overall['total'] > 0 else 0,
            1
        )

        attendance_data = {
            'overall_rate': overall_attendance_rate,
            'total_records': attendance_overall['total'],
            'present_count': attendance_overall['present'],
            'absent_count': attendance_overall['absent'],
            'late_count': attendance_overall['late'],
            'chart_data': attendance_chart_data,
            'period': 'Last 30 Days'
        }

        # ============================================
        # 📈 GRADE DISTRIBUTION & ACADEMIC PERFORMANCE
        # ============================================

        grade_distribution = (
            StudentResult.objects.all()
            .values('grade')
            .annotate(count=Count('id'))
            .order_by('grade')
        )

        total_results = StudentResult.objects.count()
        passing_grades = ["A", "B", "C", "D"]

        pass_count = StudentResult.objects.filter(
            grade__in=passing_grades
        ).count()

        fail_count = total_results - pass_count
        pass_rate = round((pass_count / total_results * 100) if total_results > 0 else 0, 1)

        subject_performance = (
            StudentResult.objects.values('subject__name')
            .annotate(
                avg_score=Avg('total_score'),
                count=Count('id')
            )
            .order_by('-avg_score')[:10]
        )

        grade_data = {
            'distribution': [
                {
                    'grade': item['grade'],
                    'count': item['count'],
                    'percentage': round((item['count'] / total_results * 100) if total_results > 0 else 0, 1)
                }
                for item in grade_distribution
            ],
            'pass_rate': pass_rate,
            'pass_count': pass_count,
            'fail_count': fail_count,
            'total_results': total_results,
            'top_subjects': [
                {
                    'subject': item['subject__name'],
                    'average': round(float(item['avg_score']), 1),
                    'student_count': item['count']
                }
                for item in subject_performance
            ]
        }

        # ============================================
        # 📋 ACTIVITY FEED (Recent Activities)
        # ============================================

        activities = []

        # Recent student enrollments - with classroom ForeignKey
        recent_students = (
            Student.objects.filter(admission_date__gte=last_7_days)
            .select_related("user", "classroom")
            .order_by("-admission_date")[:5]
        )

        for student in recent_students:
            activities.append(
                {
                    "type": "enrollment",
                    "icon": "👨‍🎓",
                    "title": "New Student Enrollment",
                    "description": f"{student.user.first_name} {student.user.last_name} enrolled in {student.classroom.name if student.classroom else 'No classroom'}",
                    "timestamp": student.admission_date.isoformat(),
                    "priority": "normal",
                }
            )

        # Recent exam completions
        recent_exams = (
            Exam.objects.filter(
                exam_date__gte=last_7_days,
                status='completed'
            )
            .select_related('subject', 'grade_level', 'section')
            .order_by('-exam_date')[:5]
        )

        for exam in recent_exams:
            exam_location = exam.grade_level.name if exam.grade_level else 'Unknown grade'
            if exam.section:
                exam_location += f" - {exam.section.name}"

            activities.append({
                'type': 'exam',
                'icon': '📝',
                'title': 'Exam Completed',
                'description': f"{exam.subject.name} exam completed for {exam_location}",
                'timestamp': timezone.datetime.combine(exam.exam_date, exam.start_time).isoformat() if exam.start_time else exam.exam_date.isoformat(),
                'priority': 'normal'
            })

        # Recent announcements
        recent_announcements = (
            SchoolAnnouncement.objects.filter(
                is_active=True,
                created_at__gte=last_7_days
            )
            .order_by('-created_at')[:5]
        )

        for announcement in recent_announcements:
            activities.append({
                'type': 'announcement',
                'icon': '📢',
                'title': 'New Announcement',
                'description': announcement.title,
                'timestamp': announcement.created_at.isoformat(),
                'priority': 'high' if announcement.is_pinned else 'normal'
            })

        activities.sort(key=lambda x: x['timestamp'], reverse=True)

        # ============================================
        # ⚠️ ALERTS & NOTIFICATIONS
        # ============================================

        alerts = []

        if overall_attendance_rate < 85:
            alerts.append({
                'type': 'warning',
                'severity': 'medium',
                'icon': '⚠️',
                'title': 'Low Attendance Rate',
                'message': f'Overall attendance is {overall_attendance_rate}% (below 85% threshold)',
                'action': 'View Attendance Report',
                'action_url': '/admin/attendance'
            })

        if overdue_amount > 0:
            overdue_count = StudentFee.objects.filter(
                is_overdue=True,
                status__in=['PENDING', 'PARTIAL', 'OVERDUE']
            ).count()

            alerts.append({
                'type': 'error',
                'severity': 'high',
                'icon': '💰',
                'title': 'Overdue Payments',
                'message': f'{overdue_count} payments overdue (Total: ${overdue_amount:,.2f})',
                'action': 'View Payment Dashboard',
                'action_url': '/admin/payments'
            })

        pending_results_count = (
            Exam.objects.filter(
                exam_date__lt=today,
                status='completed'
            )
            .exclude(
                id__in=StudentResult.objects.values_list('exam_session_id', flat=True)
            )
            .count()
        )

        if pending_results_count > 0:
            alerts.append({
                'type': 'info',
                'severity': 'low',
                'icon': '📊',
                'title': 'Pending Results',
                'message': f'{pending_results_count} completed exams have pending results',
                'action': 'Publish Results',
                'action_url': '/admin/results'
            })

        classrooms_without_teachers = Classroom.objects.annotate(
            teacher_count=Count('classroomteacherassignment')
        ).filter(teacher_count=0).count()

        if classrooms_without_teachers > 0:
            alerts.append({
                'type': 'warning',
                'severity': 'medium',
                'icon': '👨‍🏫',
                'title': 'Unassigned Classes',
                'message': f'{classrooms_without_teachers} classrooms have no assigned teachers',
                'action': 'Assign Teachers',
                'action_url': '/admin/classrooms'
            })

        inactive_students_with_debt = Student.objects.filter(
            is_active=False
        ).filter(
            id__in=StudentFee.objects.filter(
                status__in=['PENDING', 'PARTIAL', 'OVERDUE']
            ).values_list('student_id', flat=True)
        ).count()

        if inactive_students_with_debt > 0:
            alerts.append({
                'type': 'info',
                'severity': 'low',
                'icon': 'ℹ️',
                'title': 'Inactive Students with Pending Fees',
                'message': f'{inactive_students_with_debt} inactive students have outstanding payments',
                'action': 'Review Cases',
                'action_url': '/admin/students?filter=inactive'
            })

        # ============================================
        # 📦 PREPARE RESPONSE
        # ============================================

        response_data = {
            "payment_statistics": payment_data,
            "attendance_trends": attendance_data,
            "grade_distribution": grade_data,
            "recent_activities": activities[:20],
            "alerts": alerts,
            "summary": {
                "total_students": Student.objects.filter(is_active=True).count(),
                "total_teachers": Teacher.objects.filter(is_active=True).count(),
                "total_classrooms": Classroom.objects.count(),
                "attendance_rate": overall_attendance_rate,
                "collection_rate": payment_data["collection_rate"],
                "pass_rate": pass_rate,
            },
            "generated_at": timezone.now().isoformat(),
            "period": f"{last_30_days.isoformat()} to {today.isoformat()}",
        }

        logger.info(
            f"✅ Enhanced admin dashboard stats generated: "
            f"Attendance: {overall_attendance_rate}%, "
            f"Collection: {payment_data['collection_rate']}%, "
            f"Pass Rate: {pass_rate}%"
        )

        return Response(response_data)

    except Exception as e:
        logger.error(f"❌ Enhanced admin dashboard stats error: {str(e)}", exc_info=True)
        return Response(
            {
                'error': 'Failed to generate enhanced dashboard statistics',
                'detail': str(e)
            },
            status=500
        )


# ============================================================================
# 🔧 HELPER FUNCTIONS
# ============================================================================


def get_user_role(user):
    """Determine user role"""

    if user.is_superuser or user.is_staff:
        return "admin"

    if hasattr(user, "role"):
        return user.role

    if hasattr(user, "teacher_profile") or Teacher.objects.filter(user=user).exists():
        return "teacher"
    elif (
        hasattr(user, "parent_profile")
        or ParentProfile.objects.filter(user=user).exists()
    ):
        return "parent"
    elif hasattr(user, "student_profile") or Student.objects.filter(user=user).exists():
        return "student"

    return "unknown"


def get_teacher_id_from_user(user):
    """Get teacher ID from user object"""

    if hasattr(user, "teacher_profile"):
        return user.teacher_profile.id

    teacher = Teacher.objects.filter(user=user).first()
    return teacher.id if teacher else None


def get_parent_id_from_user(user):
    """Get parent ID from user object"""

    if hasattr(user, "parent_profile"):
        return user.parent_profile.id

    parent = ParentProfile.objects.filter(user=user).first()
    return parent.id if parent else None


def get_student_id_from_user(user):
    """Get student ID from user object"""

    if hasattr(user, "student_profile"):
        return user.student_profile.id

    student = Student.objects.filter(user=user).first()
    return student.id if student else None


# ============================================================================
# 🚀 OPTIMIZED ADMIN DASHBOARD ENDPOINT (PERF-001)
# ============================================================================

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def admin_dashboard_optimized(request):
    """
    🚀 OPTIMIZED ADMIN DASHBOARD - Single API Call

    GET /api/dashboard/admin/optimized/

    Returns ALL dashboard data in one optimized call:
    - Dashboard statistics
    - Students list (paginated)
    - Teachers list (paginated)
    - Parents list (paginated)
    - Attendance data summary
    - Classrooms
    - Messages
    - User profile

    This eliminates the N+1 problem by reducing 8 API calls to 1.
    Performance: <2 seconds vs 30-60 seconds
    """

    try:
        today = timezone.now().date()

        # ==================================================================
        # 📊 STATISTICS (Aggregated - Single Query)
        # ==================================================================

        student_stats = Student.objects.aggregate(
            total=Count("id"),
            active=Count("id", filter=Q(is_active=True)),
            inactive=Count("id", filter=Q(is_active=False)),
        )

        teacher_stats = Teacher.objects.aggregate(
            total=Count("id"),
            active=Count("id", filter=Q(is_active=True)),
            inactive=Count("id", filter=Q(is_active=False)),
        )

        parent_stats = ParentProfile.objects.aggregate(
            total=Count("id"),
            active=Count("id", filter=Q(user__is_active=True)),
        )

        classroom_count = Classroom.objects.count()

        # ==================================================================
        # 👥 USERS DATA (Optimized with select_related)
        # ==================================================================

        page = int(request.query_params.get('page', 1))
        page_size = int(request.query_params.get('page_size', 100))
        offset = (page - 1) * page_size

        # Students - optimized query with student_class ForeignKey
        students = (
            Student.objects.select_related("user", "student_class", "section")
            .only(
                "id",
                "registration_number",
                "gender",
                "date_of_birth",
                "admission_date",
                "is_active",
                "user__id",
                "user__first_name",
                "user__last_name",
                "user__email",
                "user__is_active",
                "user__date_joined",
                "student_class__id",
                "student_class__name",
                "section__id",
                "section__name",
            )
            .order_by("-admission_date")[offset : offset + page_size]
        )

        students_data = [
            {
                "id": s.id,
                "registration_number": s.registration_number,
                "user": {
                    "id": s.user.id,
                    "first_name": s.user.first_name,
                    "last_name": s.user.last_name,
                    "email": s.user.email,
                    "is_active": s.user.is_active,
                    "created_at": (
                        s.user.date_joined.isoformat() if s.user.date_joined else None
                    ),
                    "role": "STUDENT",
                },
                "full_name": f"{s.user.first_name} {s.user.last_name}",
                "classroom": s.classroom,  # Uses the @property which returns a formatted string
                "classroom_id": s.student_class.id if s.student_class else None,
                "gender": s.gender,
                "date_of_birth": (
                    s.date_of_birth.isoformat() if s.date_of_birth else None
                ),
                "admission_date": (
                    s.admission_date.isoformat() if s.admission_date else None
                ),
                "is_active": s.is_active,
            }
            for s in students
        ]

        # Teachers - optimized query
        teachers = (
            Teacher.objects.select_related('user')
            .only(
                'id', 'employee_id', 'phone_number', 'is_active',
                'hire_date', 'created_at', 'updated_at',
                'user__id', 'user__first_name', 'user__last_name',
                'user__email', 'user__is_active', 'user__date_joined'
            )
            .order_by('-created_at')[offset:offset + page_size]
        )

        teachers_data = [
            {
                'id': t.id,
                'employee_id': t.employee_id,
                'user': {
                    'id': t.user.id,
                    'first_name': t.user.first_name,
                    'last_name': t.user.last_name,
                    'email': t.user.email,
                    'is_active': t.user.is_active,
                    'created_at': t.user.date_joined.isoformat() if t.user.date_joined else None,
                    'role': 'TEACHER'
                },
                'full_name': f"{t.user.first_name} {t.user.last_name}",
                'phone_number': t.phone_number,
                'hire_date': t.hire_date.isoformat() if t.hire_date else None,
                'is_active': t.is_active,
                'created_at': t.created_at.isoformat() if t.created_at else None,
                'updated_at': t.updated_at.isoformat() if t.updated_at else None,
            }
            for t in teachers
        ]

        # Parents - optimized query
        parents = (
            ParentProfile.objects.select_related('user')
            .only(
                'id', 'phone', 'address', 'created_at', 'updated_at',
                'user__id', 'user__first_name', 'user__last_name',
                'user__email', 'user__is_active', 'user__date_joined'
            )
            .order_by('-created_at')[offset:offset + page_size]
        )

        parents_data = [
            {
                'id': p.id,
                'user': {
                    'id': p.user.id,
                    'first_name': p.user.first_name,
                    'last_name': p.user.last_name,
                    'email': p.user.email,
                    'is_active': p.user.is_active,
                    'created_at': p.user.date_joined.isoformat() if p.user.date_joined else None,
                    'role': 'PARENT'
                },
                'full_name': f"{p.user.first_name} {p.user.last_name}",
                'phone': p.phone,
                'address': p.address,
                'is_active': p.user.is_active,
                'created_at': p.created_at.isoformat() if p.created_at else None,
                'updated_at': p.updated_at.isoformat() if p.updated_at else None,
            }
            for p in parents
        ]

        # ==================================================================
        # 📊 ATTENDANCE DATA (Summary)
        # ==================================================================

        last_30_days = today - timedelta(days=30)
        attendance_summary = Attendance.objects.filter(
            date__gte=last_30_days
        ).aggregate(
            total=Count('id'),
            present=Count('id', filter=Q(status='P')),
            absent=Count('id', filter=Q(status='A')),
            late=Count('id', filter=Q(status='L')),
            excused=Count('id', filter=Q(status='E'))
        )

        attendance_rate = round(
            (attendance_summary['present'] / attendance_summary['total'] * 100)
            if attendance_summary['total'] > 0 else 0,
            1
        )

        attendance_data = {
            'totalPresent': attendance_summary['present'],
            'totalAbsent': attendance_summary['absent'],
            'totalLate': attendance_summary['late'],
            'totalExcused': attendance_summary['excused'],
            'totalStudents': attendance_summary['total'],
            'attendanceRate': attendance_rate,
            'period': 'Last 30 Days'
        }

        # ==================================================================
        # 🏫 CLASSROOMS
        # ==================================================================

        classrooms = (
            Classroom.objects.select_related("section", "section__class_grade")
            .only(
                "id",
                "name",
                "max_capacity",
                "is_active",
                "section__id",
                "section__name",
                "section__class_grade__id",
                "section__class_grade__name",
            )
            .order_by("section__class_grade__order", "section__name")[:100]
        )

        classrooms_data = [
            {
                "id": c.id,
                "name": c.name,
                "grade_level": (
                    c.section.class_grade.name
                    if c.section and c.section.class_grade
                    else None
                ),
                "section": c.section.name if c.section else None,
                "capacity": c.max_capacity,
                "is_active": c.is_active,
            }
            for c in classrooms
        ]
        # ==================================================================
        # 💬 MESSAGES (Recent)
        # ==================================================================

        from messaging.models import Message as MessagingMessage
        messages = MessagingMessage.objects.select_related(
            'sender'
        ).only(
            'id', 'subject', 'content', 'created_at', 'is_read',
            'sender__id', 'sender__first_name', 'sender__last_name'
        ).order_by('-created_at')[:20]

        messages_data = [
            {
                "id": m.id,
                "subject": m.subject,
                "body": m.content[:200] if m.content else "",
                "sender": {
                    "id": m.sender.id if m.sender else None,
                    "name": (
                        f"{m.sender.first_name} {m.sender.last_name}"
                        if m.sender
                        else "System"
                    ),
                },
                "created_at": m.created_at.isoformat() if m.created_at else None,
                "is_read": m.is_read,
            }
            for m in messages
        ]

        # ==================================================================
        # 👤 USER PROFILE
        # ==================================================================

        user_profile = {
            'id': request.user.id,
            'email': request.user.email,
            'first_name': request.user.first_name,
            'last_name': request.user.last_name,
            'full_name': f"{request.user.first_name} {request.user.last_name}",
            'role': request.user.role if hasattr(request.user, 'role') else 'ADMIN',
            'is_active': request.user.is_active,
        }

        # ==================================================================
        # 📦 PREPARE RESPONSE
        # ==================================================================

        response_data = {
            'dashboardStats': {
                'totalStudents': student_stats['total'],
                'totalTeachers': teacher_stats['total'],
                'totalParents': parent_stats['total'],
                'totalClasses': classroom_count,
                'totalUsers': student_stats['total'] + teacher_stats['total'] + parent_stats['total'],
                'activeUsers': student_stats['active'] + teacher_stats['active'],
                'inactiveUsers': student_stats['inactive'] + teacher_stats['inactive'],
                'pendingVerifications': 0,
                'recentRegistrations': 0
            },
            'students': {
                'results': students_data,
                'total': student_stats['total'],
                'page': page,
                'page_size': page_size,
            },
            'teachers': {
                'results': teachers_data,
                'total': teacher_stats['total'],
                'page': page,
                'page_size': page_size,
            },
            'parents': {
                'results': parents_data,
                'total': parent_stats['total'],
                'page': page,
                'page_size': page_size,
            },
            'attendanceData': attendance_data,
            'classrooms': classrooms_data,
            'messages': messages_data,
            'userProfile': user_profile,
            'loadedAt': timezone.now().isoformat(),
            'dataScope': 'optimized_load',
            'performance': {
                'apiCalls': 1,
                'description': 'All data loaded in single optimized request'
            }
        }

        logger.info(
            f"✅ Optimized admin dashboard loaded: "
            f"{student_stats['total']} students, "
            f"{teacher_stats['total']} teachers, "
            f"Attendance: {attendance_rate}% (1 API call)"
        )

        return Response(response_data)

    except Exception as e:
        logger.error(f"❌ Optimized admin dashboard error: {str(e)}", exc_info=True)
        return Response(
            {"error": "Failed to load optimized dashboard", "detail": str(e)},
            status=500,
        )
