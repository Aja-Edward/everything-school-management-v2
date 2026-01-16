# Add these imports at the top
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django.db.models import Count, Q
from django.utils import timezone
from datetime import timedelta
import logging

from lesson.models import Lesson, LessonAttendance
from teacher.models import Teacher
from students.models import Student
from classroom.models import ClassroomTeacherAssignment

logger = logging.getLogger(__name__)


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
            if not teacher_id:
                return Response({"error": "Teacher profile not found"}, status=404)
            return teacher_dashboard_extended(request, teacher_id)
        elif role == "parent":
            parent_id = get_parent_id_from_user(user)
            if not parent_id:
                return Response({"error": "Parent profile not found"}, status=404)
            return parent_dashboard_extended(request, parent_id)
        elif role == "student":
            student_id = get_student_id_from_user(user)
            if not student_id:
                return Response({"error": "Student profile not found"}, status=404)
            return student_dashboard_extended(request, student_id)
        elif role in ["admin", "staff", "superadmin"]:
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
    Extended data for teacher dashboard
    NOTE: This is a helper function, always called from decorated views above
    """

    try:
        today = timezone.now().date()
        thirty_days_ago = today - timedelta(days=30)

        # ============================================
        # 📊 LESSON COMPLETION HISTORY (Last 30 days)
        # ============================================
        lesson_history = (
            Lesson.objects.filter(
                teacher_id=teacher_id, date__gte=thirty_days_ago, date__lte=today
            )
            .values("date", "status")
            .annotate(count=Count("id"))
            .order_by("-date")
        )

        # ============================================
        # 📊 LESSON ATTENDANCE RATES (Last 30 days)
        # ============================================
        attendance_summary = (
            LessonAttendance.objects.filter(
                lesson__teacher_id=teacher_id,
                lesson__date__gte=thirty_days_ago,
                lesson__date__lte=today,
            )
            .values("lesson__date")
            .annotate(
                total=Count("id"),
                present=Count("id", filter=Q(status="present")),
                absent=Count("id", filter=Q(status="absent")),
                late=Count("id", filter=Q(status="late")),
            )
            .order_by("-lesson__date")
        )

        # ============================================
        # 📅 UPCOMING LESSONS (Next 7 days)
        # ============================================
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
                "lesson_type",
            )[:20]
        )

        # ============================================
        # 📈 STATISTICS
        # ============================================
        stats = {
            "total_lessons_30_days": Lesson.objects.filter(
                teacher_id=teacher_id, date__gte=thirty_days_ago, date__lte=today
            ).count(),
            "completed_lessons": Lesson.objects.filter(
                teacher_id=teacher_id,
                date__gte=thirty_days_ago,
                date__lte=today,
                status="completed",
            ).count(),
        }

        logger.info(f"✅ Teacher extended dashboard loaded for {teacher_id}")

        # ✅ Always return Response object
        return Response(
            {
                "lesson_history": list(lesson_history),
                "attendance_summary": list(attendance_summary),
                "upcoming_lessons": list(upcoming_lessons),
                "stats": stats,
                "data_scope": "extended_load",
                "loaded_at": timezone.now().isoformat(),
            }
        )

    except Exception as e:
        logger.error(f"❌ Teacher extended dashboard error: {str(e)}", exc_info=True)
        return Response(
            {"error": "Failed to load extended data", "detail": str(e)}, status=500
        )


def parent_dashboard_extended(request, parent_id):
    """Extended data for parent dashboard"""
    from parent.models import ParentProfile

    try:
        # Get all children
        children = Student.objects.filter(parent_profiles__id=parent_id, is_active=True)

        # Detailed attendance for all children (last 30 days)
        thirty_days_ago = timezone.now().date() - timedelta(days=30)

        children_attendance = []
        for child in children:
            from attendance.models import Attendance

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


def student_dashboard_extended(request, student_id):
    """Extended data for student dashboard"""
    from attendance.models import Attendance
    from result.models import StudentResult

    try:
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


def admin_dashboard_extended(request):
    """Extended data for admin dashboard"""
    from attendance.models import Attendance

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

        # Recent enrollments
        recent_students = (
            Student.objects.filter(created_at__gte=last_month)
            .select_related("user", "classroom")
            .order_by("-created_at")
            .values(
                "id",
                "user__first_name",
                "user__last_name",
                "classroom__name",
                "created_at",
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
# 🔧 HELPER FUNCTIONS
# ============================================================================


def get_user_role(user):
    """Determine user role"""
    from parent.models import ParentProfile

    if user.is_superuser or user.is_staff:
        return "superadmin" if user.is_superuser else "admin"

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
    from parent.models import ParentProfile

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
