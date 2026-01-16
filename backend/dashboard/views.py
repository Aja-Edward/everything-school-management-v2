from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django.db.models import Count, Q, Prefetch, Avg, Sum
from django.utils import timezone
from datetime import timedelta, datetime
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
from teacher.models import Teacher
from classroom.models import ClassroomTeacherAssignment


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
            present=Count("id", filter=Q(status="present")),
            absent=Count("id", filter=Q(status="absent")),
            late=Count("id", filter=Q(status="late")),
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
            .values("id", "title", "created_at", "priority")[:5]
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
            Exam.objects.filter(date__lt=today, status="completed")
            .exclude(id__in=StudentResult.objects.values_list("exam_id", flat=True))
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
                                queryset=Student.objects.filter(is_active=True),
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
        pending_attendance = (
            Lesson.objects.filter(
                teacher_id=teacher_id,
                date__gte=last_week,
                date__lte=today,
                status="completed",
            )
            .exclude(
                id__in=Attendance.objects.filter(teacher_id=teacher_id).values_list(
                    "lesson_id", flat=True
                )
            )
            .count()
        )

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
                    queryset=Student.objects.select_related("classroom").filter(
                        is_active=True
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

            # Today's schedule
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
                .select_related("exam__subject")
                .order_by("-exam__date")
                .values("id", "exam__subject__name", "exam__date", "score", "grade")[:5]
            )

            children_data.append(
                {
                    "id": child.id,
                    "full_name": f"{child.user.first_name} {child.user.last_name}",
                    "classroom": (
                        {
                            "id": child.classroom.id,
                            "name": child.classroom.name,
                        }
                        if child.classroom
                        else None
                    ),
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
            .select_related("exam__subject")
            .order_by("-exam__date")
            .values(
                "id",
                "exam__subject__name",
                "exam__date",
                "score",
                "grade",
                "exam__total_marks",
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
        upcoming_exams = (
            Exam.objects.filter(
                classroom=student.classroom,
                date__gte=today,
                date__lte=next_two_weeks,
                status="scheduled",
            )
            .select_related("subject")
            .order_by("date")
            .values(
                "id", "subject__name", "date", "start_time", "duration", "total_marks"
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
                "classroom": (
                    {
                        "id": student.classroom.id,
                        "name": student.classroom.name,
                    }
                    if student.classroom
                    else None
                ),
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
        logger.error(f"❌ Extended dashboard error: {str(e)}")
        return Response(
            {"error": "Failed to load extended data", "detail": str(e)}, status=500
        )


def teacher_dashboard_extended(request, teacher_id):
    """Extended data for teacher dashboard"""

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
            "id", "subject__name", "classroom__name", "date", "start_time", "end_time"
        )[:20]
    )

    return Response(
        {
            "attendance_history": list(attendance_data),
            "upcoming_lessons": list(upcoming_lessons),
            "data_scope": "extended_load",
            "loaded_at": timezone.now().isoformat(),
        }
    )


def parent_dashboard_extended(request, parent_id):
    """Extended data for parent dashboard"""

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


def student_dashboard_extended(request, student_id):
    """Extended data for student dashboard"""

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


def admin_dashboard_extended(request):
    """Extended data for admin dashboard"""

    today = timezone.now().date()
    last_month = today - timedelta(days=30)

    # Attendance trends (last 30 days)
    attendance_trends = (
        Attendance.objects.filter(date__gte=last_month)
        .values("date")
        .annotate(
            total=Count("id"),
            present=Count("id", filter=Q(status="present")),
            absent=Count("id", filter=Q(status="absent")),
        )
        .order_by("-date")
    )

    # Recent enrollments
    recent_students = (
        Student.objects.filter(created_at__gte=last_month)
        .select_related("user", "classroom")
        .order_by("-created_at")
        .values(
            "id", "user__first_name", "user__last_name", "classroom__name", "created_at"
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


# ============================================================================
# 🔧 HELPER FUNCTIONS
# ============================================================================


def get_user_role(user):
    """Determine user role"""

    if user.is_superuser or user.is_staff:
        return "admin"

    # Check role from profile or user attributes
    if hasattr(user, "role"):
        return user.role

    # Try to determine from related models
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
