from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.exceptions import NotFound
from rest_framework.permissions import AllowAny
from django.db.models import Avg, Q
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_exempt
import logging

from utils.section_filtering import AutoSectionFilterMixin
from tenants.mixins import TenantFilterMixin
from utils.pagination import StandardResultsPagination
from .models import ParentProfile
from .serializers import ParentProfileSerializer
from .permissions import IsParent, IsParentOrAdmin

from attendance.models import Attendance
from result.models import StudentResult
from users.models import CustomUser

logger = logging.getLogger(__name__)


@method_decorator(csrf_exempt, name="dispatch")
class ParentViewSet(TenantFilterMixin, AutoSectionFilterMixin, viewsets.ModelViewSet):
    """
    CRITICAL: TenantFilterMixin MUST be first to ensure tenant isolation.
    Parent ViewSet with automatic section filtering.
    Section admins only see parents whose children are in their sections.
    """

    queryset = ParentProfile.objects.all()
    serializer_class = ParentProfileSerializer
    permission_classes = [IsParentOrAdmin]
    pagination_class = StandardResultsPagination  # PERFORMANCE: Paginate parents

    def get_queryset(self):
        """
        CRITICAL: Call super() to get tenant-filtered queryset first.
        Then use AutoSectionFilterMixin for section filtering.
        """
        # CRITICAL: Call super() to get tenant-filtered queryset first
        queryset = super().get_queryset()

        user = self.request.user

        # Special case: Parents can only see their own profile
        if (
            hasattr(user, "parent_profile")
            and not user.is_staff
            and not user.is_superuser
        ):
            try:
                parent = ParentProfile.objects.get(user=user)
                queryset = queryset.filter(id=parent.id)
            except ParentProfile.DoesNotExist:
                queryset = queryset.none()

        logger.info(
            f"[ParentViewSet] Queryset count for {user.username}: {queryset.count()}"
        )

        return queryset.select_related("user")

    @action(
        detail=False, methods=["get"], url_path="search", permission_classes=[AllowAny]
    )
    def search(self, request):
        """Search parents by name, username, or email - respects section filtering."""
        query = request.query_params.get("q", "")

        # Use get_queryset() to apply section filtering
        parents = self.get_queryset()

        if query:
            parents = parents.filter(
                Q(user__first_name__icontains=query)
                | Q(user__last_name__icontains=query)
                | Q(user__username__icontains=query)
                | Q(user__email__icontains=query)
            )

        results = [
            {
                "id": parent.id,
                "user_id": parent.user.id,
                "full_name": parent.user.full_name,
                "username": parent.user.username,
                "email": parent.user.email,
                "phone": parent.phone,
                "address": parent.address,
            }
            for parent in parents
        ]
        return Response(results)

    def retrieve(self, request, pk=None):
        """
        Retrieve parent profile - section admins can only see parents in their section.
        """
        if pk:
            # If pk is provided, use standard retrieve with permission check
            try:
                parent = self.get_queryset().get(pk=pk)
            except ParentProfile.DoesNotExist:
                raise NotFound("Parent profile not found or you don't have access.")
        else:
            # If no pk, return current user's parent profile
            try:
                parent = request.user.parent_profile
            except ParentProfile.DoesNotExist:
                raise NotFound("Parent profile not found.")

        serializer = ParentProfileSerializer(parent)
        return Response(serializer.data)

    @action(detail=False, methods=["get"], url_path="dashboard")
    def dashboard(self, request):
        """
        Parent dashboard - section admins see filtered data based on their section.
        """
        user = request.user

        # For section admins viewing a specific parent's dashboard
        parent_id = request.query_params.get("parent_id")

        if parent_id and user.is_staff:
            # Admin viewing a specific parent's dashboard
            try:
                parent = self.get_queryset().get(id=parent_id)
            except ParentProfile.DoesNotExist:
                raise NotFound("Parent profile not found or you don't have access.")
        else:
            # Parent viewing their own dashboard
            try:
                parent = request.user.parent_profile
            except ParentProfile.DoesNotExist:
                raise NotFound("Parent profile not found.")

        # Get students - use mixin's filtering for section admins
        students = parent.students.all()

        # Apply section filtering to students
        from students.models import Student

        students_qs = Student.objects.filter(id__in=[s.id for s in students])
        students_filtered = self.apply_section_filters(students_qs)

        dashboard_data = []

        for student in students_filtered:
            attendance_records = Attendance.objects.filter(student=student)
            total_attendance = attendance_records.count()
            present_count = attendance_records.filter(status="present").count()
            attendance_percentage = (
                round((present_count / total_attendance) * 100, 2)
                if total_attendance > 0
                else 0
            )

            avg_score = (
                StudentResult.objects.filter(student=student).aggregate(
                    avg=Avg("score")
                )["avg"]
                or 0
            )

            recent_attendance = attendance_records.order_by("-date")[:5]
            attendance_list = [
                {"date": str(att.date), "status": att.status}
                for att in recent_attendance
            ]

            recent_results = StudentResult.objects.filter(student=student).order_by(
                "-exam__exam_date"
            )[:5]
            result_list = [
                {
                    "subject": getattr(
                        getattr(res.exam, "subject", None), "name", "N/A"
                    ),
                    "score": res.score,
                    "exam_date": str(getattr(res.exam, "exam_date", None)),
                }
                for res in recent_results
            ]

            dashboard_data.append(
                {
                    "student_id": student.id,
                    "student": student.user.full_name,
                    "attendance_percentage": attendance_percentage,
                    "average_score": round(avg_score, 2),
                    "recent_attendance": attendance_list,
                    "recent_results": result_list,
                    "alert": "Low performance" if avg_score < 50 else None,
                }
            )

        return Response({"dashboard": dashboard_data})

    @action(detail=True, methods=["post"])
    def activate(self, request, pk=None):
        """Activate parent - respects section filtering."""
        try:
            parent = self.get_queryset().get(pk=pk)
        except ParentProfile.DoesNotExist:
            raise NotFound("Parent profile not found or you don't have access.")

        parent.user.is_active = True
        parent.user.save()
        return Response({"status": "parent activated"})

    @action(detail=True, methods=["post"])
    def deactivate(self, request, pk=None):
        """Deactivate parent - respects section filtering."""
        try:
            parent = self.get_queryset().get(pk=pk)
        except ParentProfile.DoesNotExist:
            raise NotFound("Parent profile not found or you don't have access.")

        parent.user.is_active = False
        parent.user.save()
        return Response({"status": "parent deactivated"})

    @action(detail=True, methods=["post"])
    def add_student(self, request, pk=None):
        """
        Add a new student to an existing parent.
        Section admins can only add students to parents in their section.
        """
        try:
            parent = self.get_queryset().get(pk=pk)
        except ParentProfile.DoesNotExist:
            raise NotFound("Parent profile not found or you don't have access.")

        # Use the student creation serializer with existing_parent_id
        from students.serializers import StudentCreateSerializer

        student_data = request.data.copy()
        student_data["existing_parent_id"] = pk

        # For section admins, validate using mixin's method
        user = request.user
        role = self.get_user_role()

        if role in [
            "nursery_admin",
            "primary_admin",
            "junior_secondary_admin",
            "senior_secondary_admin",
            "secondary_admin",
        ]:

            education_levels = self.get_user_education_level_access()
            student_education_level = student_data.get("education_level")

            if (
                student_education_level
                and student_education_level not in education_levels
            ):
                return Response(
                    {
                        "error": f"You can only add students in your section ({', '.join(education_levels)})",
                        "your_access": education_levels,
                    },
                    status=status.HTTP_403_FORBIDDEN,
                )

        serializer = StudentCreateSerializer(data=student_data)
        serializer.is_valid(raise_exception=True)
        student = serializer.save()

        return Response(
            {
                "status": "student added to parent",
                "student": {
                    "id": student.id,
                    "name": student.user.full_name,
                    "email": student.user.email,
                },
                "student_password": getattr(
                    serializer, "_generated_student_password", None
                ),
            },
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=["post"])
    def add_existing_student(self, request, pk=None):
        """
        Link an existing student to a parent.
        Section admins can only link students in their section.
        """
        try:
            parent = self.get_queryset().get(pk=pk)
        except ParentProfile.DoesNotExist:
            raise NotFound("Parent profile not found or you don't have access.")

        student_id = request.data.get("student_id")
        if not student_id:
            return Response(
                {"error": "student_id is required"}, status=status.HTTP_400_BAD_REQUEST
            )

        try:
            from students.models import Student

            student = Student.objects.get(id=student_id)
        except Student.DoesNotExist:
            return Response(
                {"error": "Student not found"}, status=status.HTTP_404_NOT_FOUND
            )

        # For section admins, validate using mixin's method
        user = request.user
        role = self.get_user_role()

        if role in [
            "nursery_admin",
            "primary_admin",
            "junior_secondary_admin",
            "senior_secondary_admin",
            "secondary_admin",
        ]:

            education_levels = self.get_user_education_level_access()

            if student.education_level not in education_levels:
                return Response(
                    {
                        "error": "You can only link students from your section",
                        "student_level": student.education_level,
                        "your_access": education_levels,
                    },
                    status=status.HTTP_403_FORBIDDEN,
                )

        # Check if student is already linked to this parent
        if parent.students.filter(id=student_id).exists():
            return Response(
                {"error": "Student is already linked to this parent"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Link student to parent
        parent.students.add(student)

        return Response(
            {
                "status": "existing student linked to parent",
                "student": {
                    "id": student.id,
                    "name": student.user.full_name,
                    "email": student.user.email,
                },
            },
            status=status.HTTP_200_OK,
        )

    @action(detail=False, methods=["get"])
    def statistics(self, request):
        """Get parent statistics based on user's section access"""
        queryset = self.get_queryset()  # Already filtered by section

        total_parents = queryset.count()
        active_parents = queryset.filter(user__is_active=True).count()
        inactive_parents = queryset.filter(user__is_active=False).count()

        # Count students linked to these parents
        from students.models import Student

        all_student_ids = []
        for parent in queryset:
            all_student_ids.extend(parent.students.values_list("id", flat=True))

        students = Student.objects.filter(id__in=all_student_ids)
        # Apply section filtering to students
        students = self.apply_section_filters(students)

        return Response(
            {
                "total_parents": total_parents,
                "active_parents": active_parents,
                "inactive_parents": inactive_parents,
                "total_students_linked": students.count(),
                "parents_with_multiple_children": queryset.annotate(
                    child_count=Q("students")
                )
                .filter(child_count__gt=1)
                .count(),
            }
        )
