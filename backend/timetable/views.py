import csv
import io
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework import viewsets, status
from rest_framework.response import Response
from rest_framework.decorators import action
from django_filters.rest_framework import DjangoFilterBackend
from .models import Timetable
from .serializers import TimetableSerializer
from utils.email import send_email_via_brevo
from utils.section_filtering import AutoSectionFilterMixin
from tenants.mixins import TenantFilterMixin
from common.admin_access import IsSchoolAdminOrReadOnly

from django.http import JsonResponse


class TimetableViewSet(TenantFilterMixin, AutoSectionFilterMixin, viewsets.ModelViewSet):
    # No permission_classes and no school filter: the AllowAny default let
    # anyone, signed in or not, list every school's timetable and create, edit
    # or delete entries in it. The section filter was imported but unused.
    queryset = Timetable.objects.all()
    serializer_class = TimetableSerializer
    permission_classes = [IsSchoolAdminOrReadOnly]
    filter_backends = [DjangoFilterBackend]
    # "classroom" is not a field (it is section), and naming it made every list
    # request raise TypeError.
    filterset_fields = ["day", "section", "teacher", "subject"]

    @action(detail=False, methods=["post"], url_path="bulk-upload")
    def bulk_upload(self, request):
        data = request.data
        if not isinstance(data, list):
            return Response(
                {"error": "Expected a list of timetable entries."}, status=400
            )
        serializer = self.get_serializer(data=data, many=True)
        if serializer.is_valid():
            serializer.save(tenant=request.tenant)
            return Response(
                {"message": "Bulk upload successful.", "count": len(serializer.data)},
                status=201,
            )
        return Response(serializer.errors, status=400)

    @action(
        detail=False,
        methods=["post"],
        url_path="csv-upload",
        parser_classes=[MultiPartParser, FormParser],
    )
    def csv_upload(self, request):
        """
        Upload timetable data via CSV file.
        CSV columns must be: day,start_time,end_time,subject,teacher,classroom
        """
        file = request.FILES.get("file")
        if not file:
            return Response({"error": "No file uploaded."}, status=400)

        decoded_file = file.read().decode("utf-8")
        io_string = io.StringIO(decoded_file)
        reader = csv.DictReader(io_string)

        entries = []
        errors = []
        line_num = 1
        for row in reader:
            line_num += 1
            # Adjust field names according to your Timetable model fields
            entry_data = {
                "day": row.get("day"),
                "start_time": row.get("start_time"),
                "end_time": row.get("end_time"),
                "subject": row.get("subject"),
                "teacher": row.get("teacher"),
                "classroom": row.get("classroom"),
            }
            serializer = self.get_serializer(data=entry_data)
            if serializer.is_valid():
                entries.append(serializer)
            else:
                errors.append({"line": line_num, "errors": serializer.errors})

        if errors:
            return Response({"errors": errors}, status=400)

        # Save all valid entries
        for serializer in entries:
            serializer.save(tenant=request.tenant)

        return Response(
            {"message": f"CSV upload successful. {len(entries)} entries created."},
            status=201,
        )


# accounts/views.py


def test_email_view(request):
    subject = "Test Email from SchoolMS"
    html_content = "<h2>This is a test email sent using Brevo SMTP API</h2>"
    to_email = "recipient@example.com"  # Change this to your test email

    status, response = send_email_via_brevo(subject, html_content, to_email)
    return JsonResponse({"status": status, "response": response})
