from rest_framework import viewsets, filters, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django_filters.rest_framework import DjangoFilterBackend
from .models import Attendance
from .serializers import AttendanceSerializer
from .filters import AttendanceFilter
from rest_framework import viewsets
import csv
from io import TextIOWrapper
from students.models import Student
from teacher.models import Teacher
from classroom.models import Section
from parent.models import ParentProfile
from schoolSettings.permissions import HasAttendancePermission, HasAttendancePermissionOrReadOnly

from utils.section_filtering import AutoSectionFilterMixin
from tenants.mixins import TenantFilterMixin
from utils.pagination import LargeResultsPagination


class AttendanceViewSet(TenantFilterMixin, AutoSectionFilterMixin, viewsets.ModelViewSet):
    """CRITICAL: TenantFilterMixin MUST be first to ensure tenant isolation."""
    serializer_class = AttendanceSerializer
    queryset = Attendance.objects.all()
    permission_classes = [IsAuthenticated]
    pagination_class = LargeResultsPagination  # PERFORMANCE: Paginate large attendance datasets
    filter_backends = [
        DjangoFilterBackend,
        filters.SearchFilter,
        filters.OrderingFilter,
    ]
    filterset_class = AttendanceFilter
    search_fields = ["student__first_name", "teacher__first_name"]
    ordering_fields = ["date", "student"]

    def create(self, request, *args, **kwargs):
        """Override create to add debugging"""
        print(f"🔍 AttendanceViewSet.create called")
        print(f"🔍 Request data: {request.data}")
        print(f"🔍 Request user: {request.user}")
        print(f"🔍 Request user role: {request.user.role}")
        
        try:
            return super().create(request, *args, **kwargs)
        except Exception as e:
            print(f"❌ Error in create: {e}")
            print(f"❌ Error type: {type(e)}")
            import traceback
            print(f"❌ Full traceback: {traceback.format_exc()}")
            raise

    def get_queryset(self):
        # CRITICAL: Call super() to get tenant-filtered queryset first
        # Apply section filtering
        queryset = super().get_queryset()

        

        # Apply additional filters
        user = self.request.user

        # If parent, restrict to only their children's attendance
        if user.is_authenticated and user.role == "parent":
            try:
                parent_profile = ParentProfile.objects.get(user=user)
                return queryset.filter(
                    student__in=parent_profile.children.all()
                )
            except ParentProfile.DoesNotExist:
                return Attendance.objects.none()

        # Other roles: return all
        return queryset

    @action(detail=False, methods=["post"], url_path="import-csv")
    def import_csv(self, request):
        csv_file = request.FILES.get("file")
        if not csv_file:
            return Response(
                {"error": "No CSV file uploaded"}, status=status.HTTP_400_BAD_REQUEST
            )

        try:
            decoded_file = TextIOWrapper(csv_file.file, encoding="utf-8")
            reader = csv.DictReader(decoded_file)

            for row in reader:
                student = Student.objects.get(id=row["student"])
                teacher = Teacher.objects.get(id=row["teacher"])
                section = Section.objects.get(id=row["section"])

                Attendance.objects.create(
                    student=student,
                    teacher=teacher,
                    section=section,
                    date=row["attendance_date"],
                    status=row["status"].lower(),
                )

            return Response(
                {"message": "CSV import successful."}, status=status.HTTP_201_CREATED
            )
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=["get"], url_path="export-csv")
    def export_csv(self, request):
        response = Response(content_type="text/csv")
        response["Content-Disposition"] = 'attachment; filename="attendance.csv"'

        writer = csv.writer(response)
        writer.writerow(["student", "teacher", "section", "date", "status"])

        for record in self.filter_queryset(self.get_queryset()):
            writer.writerow(
                [
                    record.student.id,
                    record.teacher.id if record.teacher else "",
                    record.section.id,
                    record.date,
                    record.status,
                ]
            )

        return response
