from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.exceptions import NotFound, PermissionDenied
from attendance.models import Attendance
from result.family_access import (
    academics_released,
    family_result_summary,
    family_visible_results,
)
from students.models import Student
from django.db import models


class StudentDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, student_id):
        # Check parent profile existence
        try:
            parent_profile = request.user.parent_profile
        except Exception:
            raise NotFound("Parent profile not found.")

        # Confirm student belongs to this parent
        if not parent_profile.students.filter(
            id=student_id, tenant=request.tenant
        ).exists():
            raise PermissionDenied("You do not have access to this student's data.")

        student = Student.objects.get(id=student_id)

        # Gather attendance & result data
        attendance_records = Attendance.objects.filter(
            student=student, tenant=request.tenant)
        total_attendance = attendance_records.count()
        present_count = attendance_records.filter(status="present").count()
        attendance_percentage = (
            round((present_count / total_attendance) * 100, 2)
            if total_attendance
            else 0
        )

        # Results only once the admin has released the Academics tab, and
        # then only published ones (the same rule as the parent dashboard).
        # This used to read fields StudentResult doesn't have (score, exam),
        # so it errored -- and it took drafts too.
        results = family_visible_results(request.tenant, student)
        avg_score = results.aggregate(avg=models.Avg("percentage"))["avg"] or 0

        recent_attendance = attendance_records.order_by("-date")[:5]
        attendance_list = [
            {"date": str(att.date), "status": att.status}
            for att in recent_attendance
        ]

        result_list = [
            family_result_summary(res)
            for res in results.order_by("-created_at")[:5]
        ]

        data = {
            "student": str(student),
            "academics_visible": academics_released(request.tenant),
            "attendance_percentage": attendance_percentage,
            "average_score": round(avg_score, 2),
            "recent_attendance": attendance_list,
            "recent_results": result_list,
        }
        return Response(data)
