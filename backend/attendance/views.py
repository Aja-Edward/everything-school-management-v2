import csv
import io
import logging
from io import TextIOWrapper

from django.db import transaction
from django.http import StreamingHttpResponse
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from classroom.models import Section
from parent.models import ParentProfile
from schoolSettings.permissions import HasAttendancePermission, HasAttendancePermissionOrReadOnly
from students.models import Student
from teacher.models import Teacher
from tenants.mixins import TenantFilterMixin
from utils.pagination import LargeResultsPagination
from utils.section_filtering import AutoSectionFilterMixin

from .filters import AttendanceFilter
from .models import Attendance
from .serializers import AttendanceSerializer

logger = logging.getLogger(__name__)


class AttendanceViewSet(TenantFilterMixin, AutoSectionFilterMixin, viewsets.ModelViewSet):
    """CRITICAL: TenantFilterMixin MUST be first to ensure tenant isolation."""

    serializer_class = AttendanceSerializer
    queryset = Attendance.objects.all()
    permission_classes = [IsAuthenticated, HasAttendancePermissionOrReadOnly]
    pagination_class = LargeResultsPagination
    filter_backends = [
        DjangoFilterBackend,
        filters.SearchFilter,
        filters.OrderingFilter,
    ]
    filterset_class = AttendanceFilter
    search_fields = [
        "student__user__first_name",
        "student__user__last_name",
        "teacher__user__first_name",
        "teacher__user__last_name",
    ]
    ordering_fields = ["date", "student"]

    def get_queryset(self):
        queryset = (
            super()
            .get_queryset()
            .select_related(
                "student__user",
                "student__stream",
                "student__student_class",
                "student__student_class__education_level",  # needed for education_level_display
                "student__section",  # needed for student's section details
                "teacher__user",
                "section",  # needed for section_name
            )
        )
        user = self.request.user
        if user.is_authenticated and user.role == "parent":
            try:
                parent_profile = ParentProfile.objects.get(user=user)
                return queryset.filter(student__in=parent_profile.children.all())
            except ParentProfile.DoesNotExist:
                return Attendance.objects.none()
        return queryset

    @action(
        detail=False,
        methods=["post"],
        url_path="import-csv",
        permission_classes=[IsAuthenticated, HasAttendancePermission],
    )
    def import_csv(self, request):
        csv_file = request.FILES.get("file")
        if not csv_file:
            return Response({"error": "No CSV file uploaded"}, status=400)

        tenant = request.tenant

        try:
            decoded_file = TextIOWrapper(csv_file.file, encoding="utf-8")
            reader = csv.DictReader(decoded_file)

            with transaction.atomic():
                for row in reader:
                    student = Student.objects.get(id=row["student"], tenant=tenant)
                    section = Section.objects.get(id=row["section"], tenant=tenant)
                    teacher = None
                    if row.get("teacher"):
                        teacher = Teacher.objects.get(id=row["teacher"], tenant=tenant)

                    Attendance.objects.create(
                        tenant=tenant,
                        student=student,
                        teacher=teacher,
                        section=section,
                        date=row["attendance_date"],
                        status=row["status"].strip(),
                    )

            return Response({"message": "CSV import successful."}, status=201)
        except (Student.DoesNotExist, Teacher.DoesNotExist, Section.DoesNotExist) as e:
            return Response({"error": f"Record not found: {e}"}, status=400)
        except KeyError as e:
            return Response({"error": f"Missing column in CSV: {e}"}, status=400)
        except Exception as e:
            logger.exception("CSV import failed")
            return Response({"error": str(e)}, status=400)

    @action(detail=False, methods=["get"], url_path="export-csv")
    def export_csv(self, request):

        def stream_rows():
            buf = io.StringIO()
            writer = csv.writer(buf)
            writer.writerow(["student", "teacher", "section", "date", "status"])
            yield buf.getvalue()

            qs = self.filter_queryset(self.get_queryset())
            for record in qs.iterator(chunk_size=500):
                buf = io.StringIO()
                writer = csv.writer(buf)
                writer.writerow(
                    [
                        record.student_id,
                        record.teacher_id or "",
                        record.section_id,
                        record.date,
                        record.status,
                    ]
                )
                yield buf.getvalue()

        response = StreamingHttpResponse(stream_rows(), content_type="text/csv")
        response["Content-Disposition"] = 'attachment; filename="attendance.csv"'
        return response
