# from rest_framework import viewsets, filters, status, permissions
# from rest_framework.decorators import action
# from rest_framework.response import Response
# from django_filters.rest_framework import DjangoFilterBackend
# from django.http import HttpResponse
# from django.core.exceptions import ValidationError
# from django.db import transaction
# from django.db.models import Q, Count, Avg, Max, Min
# from django.utils import timezone
# from io import TextIOWrapper
# import csv
# from datetime import datetime, timedelta
# from utils.section_filtering import SectionFilterMixin, AutoSectionFilterMixin
# import logging

# # Import models
# from .models import Exam, ExamSchedule, ExamRegistration, ExamStatistics
# from result.models import StudentResult
# from classroom.models import GradeLevel, Section
# from subject.models import Subject
# from teacher.models import Teacher
# from students.models import Student
# from django.shortcuts import render, redirect
# from django.contrib import messages
# from .forms import ExamForm, ExamScheduleForm


# # Import serializers
# from .serializers import (
#     ExamListSerializer,
#     ExamDetailSerializer,
#     ExamCreateUpdateSerializer,
#     ExamScheduleSerializer,
#     ExamRegistrationSerializer,
#     ResultSerializer,
#     ResultCreateUpdateSerializer,
#     ExamStatisticsSerializer,
# )

# # Import filters
# from .filters import ExamFilter

# logger = logging.getLogger(__name__)


# def create_exam(request):
#     if request.method == "POST":
#         form = ExamForm(request.POST)
#         if form.is_valid():
#             exam = form.save()
#             messages.success(request, f'Exam "{exam.title}" created successfully!')
#             return redirect("exam_list")  # Adjust URL name as needed
#     else:
#         form = ExamForm()

#     return render(request, "exams/exam_form.html", {"form": form})


# def create_exam_schedule(request):
#     if request.method == "POST":
#         form = ExamScheduleForm(request.POST)
#         if form.is_valid():
#             schedule = form.save()
#             messages.success(
#                 request, f'Exam schedule "{schedule.name}" created successfully!'
#             )
#             return redirect("exam_schedule_list")  # Adjust URL name as needed
#     else:
#         form = ExamScheduleForm()

#     return render(request, "exams/exam_schedule_form.html", {"form": form})


# class ExamViewSet(AutoSectionFilterMixin, viewsets.ModelViewSet):
#     """
#     Streamlined ViewSet for managing exams
#     """

#     queryset = Exam.objects.select_related(
#         "subject", "grade_level", "section", "teacher"
#     ).prefetch_related("invigilators")

#     filter_backends = [
#         DjangoFilterBackend,
#         filters.SearchFilter,
#         filters.OrderingFilter,
#     ]
#     filterset_class = ExamFilter
#     search_fields = ["title", "description", "code", "subject__name", "venue"]
#     ordering_fields = ["exam_date", "start_time", "title", "created_at"]
#     ordering = ["-exam_date", "start_time"]
#     permission_classes = [permissions.IsAuthenticated]

#     def get_serializer_class(self):
#         """Return appropriate serializer based on action"""
#         if self.action == "list":
#             return ExamListSerializer
#         elif self.action in ["create", "update", "partial_update"]:
#             return ExamCreateUpdateSerializer
#         return ExamDetailSerializer

#     def get_queryset(self):
#         """Optimize queryset for list view with section filtering"""
#         queryset = super().get_queryset()

#         if self.action == "list":
#             queryset = queryset.annotate(
#                 registered_students_count=Count("examregistration", distinct=True)
#             )

#         # Apply section-based filtering for authenticated users
#         if self.request.user.is_authenticated:
#             user = self.request.user

#             # 🟢 TEACHERS: Check FIRST - See only their own exams
#             if hasattr(user, "teacher"):
#                 return queryset.filter(teacher_id=user.teacher.id)

#             # 🟢 ADMINS/STAFF: See all exams (checked AFTER teachers)
#             if user.is_superuser or user.is_staff:
#                 return queryset

#             # 🟢 STUDENTS/PARENTS: Filter by section access
#             section_access = self.get_user_section_access()
#             education_levels = self.get_education_levels_for_sections(section_access)

#             if not education_levels:
#                 return queryset.none()

#             queryset = queryset.filter(
#                 grade_level__education_level__in=education_levels
#             )

#         return queryset

#     def perform_create(self, serializer):
#         serializer.save(created_by=self.request.user)

#     def perform_update(self, serializer):
#         serializer.save(updated_by=self.request.user)

#     @action(detail=False, methods=["post"])
#     def bulk_create(self, request):
#         """Bulk create results"""
#         results_data = request.data.get("results", [])

#         if not results_data:
#             return Response(
#                 {"error": "Results data is required"},
#                 status=status.HTTP_400_BAD_REQUEST,
#             )

#         created_results = []
#         errors = []

#         with transaction.atomic():
#             for i, result_data in enumerate(results_data):
#                 serializer = ResultCreateUpdateSerializer(data=result_data)
#                 if serializer.is_valid():
#                     result = serializer.save(recorded_by=request.user)
#                     created_results.append(result.id)
#                 else:
#                     errors.append({"index": i, "errors": serializer.errors})

#             if errors:
#                 transaction.set_rollback(True)
#                 return Response({"errors": errors}, status=status.HTTP_400_BAD_REQUEST)

#         return Response(
#             {
#                 "message": f"Created {len(created_results)} results",
#                 "created_ids": created_results,
#             },
#             status=status.HTTP_201_CREATED,
#         )

#     @action(detail=False, methods=["post"])
#     def bulk_update(self, request):
#         """Bulk update results"""
#         results_data = request.data.get("results", [])

#         if not results_data:
#             return Response(
#                 {"error": "Results data is required"},
#                 status=status.HTTP_400_BAD_REQUEST,
#             )

#         updated_count = 0
#         errors = []

#         with transaction.atomic():
#             for i, result_data in enumerate(results_data):
#                 result_id = result_data.get("id")
#                 if not result_id:
#                     errors.append({"index": i, "error": "Result ID is required"})
#                     continue

#                 try:
#                     result = StudentResult.objects.get(id=result_id)
#                     serializer = ResultCreateUpdateSerializer(
#                         result, data=result_data, partial=True
#                     )
#                     if serializer.is_valid():
#                         serializer.save(updated_by=request.user)
#                         updated_count += 1
#                     else:
#                         errors.append({"index": i, "errors": serializer.errors})
#                 except StudentResult.DoesNotExist:
#                     errors.append(
#                         {"index": i, "error": f"Result {result_id} not found"}
#                     )
#                 except Exception as e:
#                     errors.append({"index": i, "error": str(e)})

#             if errors:
#                 transaction.set_rollback(True)
#                 return Response({"errors": errors}, status=status.HTTP_400_BAD_REQUEST)

#         return Response(
#             {
#                 "message": f"Updated {updated_count} results",
#                 "updated_count": updated_count,
#             }
#         )

#     @action(detail=False, methods=["get"])
#     def by_student(self, request, student_id=None):
#         """Get results by student"""
#         if not student_id:
#             return Response(
#                 {"error": "Student ID is required"}, status=status.HTTP_400_BAD_REQUEST
#             )

#         results = self.get_queryset().filter(student_id=student_id)
#         serializer = self.get_serializer(results, many=True)
#         return Response(serializer.data)

#     @action(detail=False, methods=["get"])
#     def by_exam(self, request, exam_id=None):
#         """Get results by exam"""
#         if not exam_id:
#             return Response(
#                 {"error": "Exam ID is required"}, status=status.HTTP_400_BAD_REQUEST
#             )

#         results = self.get_queryset().filter(exam_id=exam_id)
#         serializer = self.get_serializer(results, many=True)
#         return Response(serializer.data)

#     @action(detail=False, methods=["get"])
#     def by_subject(self, request, subject_id=None):
#         """Get results by subject"""
#         if not subject_id:
#             return Response(
#                 {"error": "Subject ID is required"}, status=status.HTTP_400_BAD_REQUEST
#             )

#         results = self.get_queryset().filter(subject_id=subject_id)
#         serializer = self.get_serializer(results, many=True)
#         return Response(serializer.data)

#     @action(detail=False, methods=["get"])
#     def by_grade(self, request, grade_id=None):
#         """Get results by grade level"""
#         if not grade_id:
#             return Response(
#                 {"error": "Grade ID is required"}, status=status.HTTP_400_BAD_REQUEST
#             )

#         results = self.get_queryset().filter(grade_level_id=grade_id)
#         serializer = self.get_serializer(results, many=True)
#         return Response(serializer.data)

#     @action(detail=False, methods=["get"])
#     def student_transcript(self, request, student_id=None):
#         """Get student transcript"""
#         if not student_id:
#             return Response(
#                 {"error": "Student ID is required"}, status=status.HTTP_400_BAD_REQUEST
#             )

#         results = (
#             self.get_queryset()
#             .filter(student_id=student_id)
#             .order_by("exam__exam_date")
#         )
#         serializer = self.get_serializer(results, many=True)
#         return Response(serializer.data)

#     @action(detail=False, methods=["get"])
#     def grade_sheet(self, request, exam_id=None):
#         """Get grade sheet for an exam"""
#         if not exam_id:
#             return Response(
#                 {"error": "Exam ID is required"}, status=status.HTTP_400_BAD_REQUEST
#             )

#         results = (
#             self.get_queryset()
#             .filter(exam_id=exam_id)
#             .order_by("student__user__first_name")
#         )
#         serializer = self.get_serializer(results, many=True)
#         return Response(serializer.data)

#     # Core Exam Management
#     @action(detail=True, methods=["post"])
#     def start_exam(self, request, pk=None):
#         """Start an exam"""
#         exam = self.get_object()

#         if exam.status != "scheduled":
#             return Response(
#                 {"error": "Only scheduled exams can be started"},
#                 status=status.HTTP_400_BAD_REQUEST,
#             )

#         exam.status = "in_progress"
#         exam.save()
#         return Response({"message": "Exam started successfully"})

#     @action(detail=True, methods=["post"])
#     def end_exam(self, request, pk=None):
#         """End an exam and generate statistics"""
#         exam = self.get_object()

#         if exam.status != "in_progress":
#             return Response(
#                 {"error": "Only exams in progress can be ended"},
#                 status=status.HTTP_400_BAD_REQUEST,
#             )

#         exam.status = "completed"
#         exam.save()

#         # Generate statistics
#         self._generate_exam_statistics(exam)
#         return Response({"message": "Exam ended successfully"})

#     @action(detail=True, methods=["post"])
#     def cancel_exam(self, request, pk=None):
#         """Cancel an exam"""
#         exam = self.get_object()

#         if exam.status == "completed":
#             return Response(
#                 {"error": "Cannot cancel completed exam"},
#                 status=status.HTTP_400_BAD_REQUEST,
#             )

#         exam.status = "cancelled"
#         exam.cancellation_reason = request.data.get("reason", "")
#         exam.save()
#         return Response({"message": "Exam cancelled successfully"})

#     @action(detail=True, methods=["post"])
#     def postpone_exam(self, request, pk=None):
#         """Postpone an exam"""
#         exam = self.get_object()
#         new_date = request.data.get("new_date")
#         new_start_time = request.data.get("new_start_time")
#         new_end_time = request.data.get("new_end_time")
#         reason = request.data.get("reason", "")

#         if not new_date:
#             return Response(
#                 {"error": "New date is required"}, status=status.HTTP_400_BAD_REQUEST
#             )

#         if exam.status == "completed":
#             return Response(
#                 {"error": "Cannot postpone completed exam"},
#                 status=status.HTTP_400_BAD_REQUEST,
#             )

#         exam.exam_date = new_date
#         if new_start_time:
#             exam.start_time = new_start_time
#         if new_end_time:
#             exam.end_time = new_end_time

#         exam.postponement_reason = reason
#         exam.save()

#         return Response({"message": "Exam postponed successfully"})

#     # Approval Workflow
#     @action(detail=True, methods=["post"])
#     def approve(self, request, pk=None):
#         """Approve an exam"""
#         exam = self.get_object()

#         if exam.status != "pending_approval":
#             return Response(
#                 {"error": "Only exams pending approval can be approved"},
#                 status=status.HTTP_400_BAD_REQUEST,
#             )

#         # Get approver - try to get Teacher from User, or use None if not available
#         approver = None
#         if hasattr(request, "user") and request.user.is_authenticated:
#             try:
#                 from teacher.models import Teacher

#                 approver = Teacher.objects.get(user=request.user)
#             except Teacher.DoesNotExist:
#                 # If user is not a teacher, we'll leave approver as None
#                 pass

#         notes = request.data.get("notes", "")

#         exam.approve(approver, notes)

#         return Response(
#             {
#                 "message": "Exam approved successfully",
#                 "status": exam.status,
#                 "approved_at": exam.approved_at,
#                 "approved_by": exam.approved_by.id if exam.approved_by else None,
#             }
#         )

#     @action(detail=True, methods=["post"])
#     def reject(self, request, pk=None):
#         """Reject an exam"""
#         exam = self.get_object()

#         if exam.status != "pending_approval":
#             return Response(
#                 {"error": "Only exams pending approval can be rejected"},
#                 status=status.HTTP_400_BAD_REQUEST,
#             )

#         # Get approver - try to get Teacher from User, or use None if not available
#         approver = None
#         if hasattr(request, "user") and request.user.is_authenticated:
#             try:
#                 from teacher.models import Teacher

#                 approver = Teacher.objects.get(user=request.user)
#             except Teacher.DoesNotExist:
#                 # If user is not a teacher, we'll leave approver as None
#                 pass

#         reason = request.data.get("reason", "")

#         exam.reject(approver, reason)

#         return Response(
#             {
#                 "message": "Exam rejected successfully",
#                 "status": exam.status,
#                 "rejected_at": exam.approved_at,
#                 "rejected_by": exam.approved_by.id if exam.approved_by else None,
#                 "rejection_reason": exam.rejection_reason,
#             }
#         )

#     @action(detail=True, methods=["post"])
#     def submit_for_approval(self, request, pk=None):
#         """Submit exam for approval"""
#         exam = self.get_object()

#         if exam.status not in ["draft", "rejected"]:
#             return Response(
#                 {"error": "Only draft or rejected exams can be submitted for approval"},
#                 status=status.HTTP_400_BAD_REQUEST,
#             )

#         exam.submit_for_approval()

#         return Response(
#             {
#                 "message": "Exam submitted for approval successfully",
#                 "status": exam.status,
#             }
#         )

#     # Student Registration
#     @action(detail=True, methods=["post"])
#     def register_student(self, request, pk=None):
#         """Register a student for an exam"""
#         exam = self.get_object()
#         student_id = request.data.get("student_id")

#         if not student_id:
#             return Response(
#                 {"error": "Student ID is required"}, status=status.HTTP_400_BAD_REQUEST
#             )

#         try:
#             student = Student.objects.get(id=student_id)
#         except Student.DoesNotExist:
#             return Response(
#                 {"error": "Student not found"}, status=status.HTTP_404_NOT_FOUND
#             )

#         # Check if already registered
#         if ExamRegistration.objects.filter(exam=exam, student=student).exists():
#             return Response(
#                 {"error": "Student already registered for this exam"},
#                 status=status.HTTP_400_BAD_REQUEST,
#             )

#         registration = ExamRegistration.objects.create(
#             exam=exam, student=student, registration_date=timezone.now()
#         )

#         serializer = ExamRegistrationSerializer(registration)
#         return Response(serializer.data, status=status.HTTP_201_CREATED)

#     @action(detail=True, methods=["delete"])
#     def unregister_student(self, request, pk=None):
#         """Unregister a student from an exam"""
#         exam = self.get_object()
#         student_id = request.data.get("student_id")

#         try:
#             registration = ExamRegistration.objects.get(
#                 exam=exam, student_id=student_id
#             )
#             registration.delete()
#             return Response({"message": "Student unregistered successfully"})
#         except ExamRegistration.DoesNotExist:
#             return Response(
#                 {"error": "Registration not found"}, status=status.HTTP_404_NOT_FOUND
#             )

#     @action(detail=True, methods=["get"])
#     def registrations(self, request, pk=None):
#         """Get all registrations for an exam"""
#         exam = self.get_object()
#         registrations = ExamRegistration.objects.filter(exam=exam).select_related(
#             "student"
#         )
#         serializer = ExamRegistrationSerializer(registrations, many=True)
#         return Response(serializer.data)

#     @action(detail=True, methods=["get"])
#     def get_registrations(self, request, pk=None):
#         """Get all registrations for an exam (alias for registrations)"""
#         return self.registrations(request, pk)

#     @action(detail=True, methods=["get"])
#     def get_results(self, request, pk=None):
#         """Get results for an exam (alias for results)"""
#         return self.results(request, pk)

#     @action(detail=True, methods=["get"])
#     def get_statistics(self, request, pk=None):
#         """Get statistics for an exam (alias for statistics)"""
#         return self.statistics(request, pk)

#     # Results Management
#     @action(detail=True, methods=["get"])
#     def results(self, request, pk=None):
#         """Get results for an exam"""
#         exam = self.get_object()
#         results = StudentResult.objects.filter(exam=exam).select_related("student")
#         serializer = ResultSerializer(results, many=True)
#         return Response(serializer.data)

#     @action(detail=True, methods=["post"])
#     def bulk_create_results(self, request, pk=None):
#         """Bulk create results for an exam"""
#         exam = self.get_object()
#         results_data = request.data.get("results", [])

#         if not results_data:
#             return Response(
#                 {"error": "Results data is required"},
#                 status=status.HTTP_400_BAD_REQUEST,
#             )

#         created_results = []
#         errors = []

#         with transaction.atomic():
#             for i, result_data in enumerate(results_data):
#                 result_data["exam"] = exam.id
#                 result_data["subject"] = exam.subject.id

#                 serializer = ResultCreateUpdateSerializer(data=result_data)
#                 if serializer.is_valid():
#                     result = serializer.save(recorded_by=request.user)
#                     created_results.append(result.id)
#                 else:
#                     errors.append({"index": i, "errors": serializer.errors})

#             if errors:
#                 transaction.set_rollback(True)
#                 return Response({"errors": errors}, status=status.HTTP_400_BAD_REQUEST)

#         return Response(
#             {
#                 "message": f"Created {len(created_results)} results",
#                 "created_ids": created_results,
#             },
#             status=status.HTTP_201_CREATED,
#         )

#     @action(detail=True, methods=["get"])
#     def statistics(self, request, pk=None):
#         """Get statistics for an exam"""
#         exam = self.get_object()
#         stats, created = ExamStatistics.objects.get_or_create(
#             exam=exam, defaults={"calculated_at": timezone.now()}
#         )

#         # Recalculate if stats are older than 1 hour
#         if not created and stats.calculated_at < timezone.now() - timedelta(hours=1):
#             self._generate_exam_statistics(exam)
#             stats.refresh_from_db()

#         serializer = ExamStatisticsSerializer(stats)
#         return Response(serializer.data)

#     # Essential Filters
#     @action(detail=False, methods=["get"])
#     def upcoming(self, request):
#         """Get upcoming exams"""
#         today = timezone.now().date()
#         exams = (
#             self.get_queryset()
#             .filter(exam_date__gte=today, status="scheduled")
#             .order_by("exam_date", "start_time")
#         )

#         serializer = self.get_serializer(exams, many=True)
#         return Response(serializer.data)

#     @action(detail=False, methods=["get"])
#     def by_schedule(self, request):
#         """Get exams by schedule"""
#         schedule_id = request.GET.get("schedule_id")
#         if not schedule_id:
#             return Response(
#                 {"error": "Schedule ID is required"}, status=status.HTTP_400_BAD_REQUEST
#             )

#         exams = self.get_queryset().filter(exam_schedule_id=schedule_id)
#         serializer = self.get_serializer(exams, many=True)
#         return Response(serializer.data)

#     @action(detail=False, methods=["get"])
#     def by_teacher(self, request, teacher_id=None):
#         try:
#             teacher = Teacher.objects.get(id=teacher_id)
#         except Teacher.DoesNotExist:
#             return Response(
#                 {"error": "Teacher not found"}, status=status.HTTP_404_NOT_FOUND
#             )

#         exams = self.get_queryset().filter(teacher_id=teacher.id)
#         serializer = self.get_serializer(exams, many=True)
#         return Response(serializer.data)

#     @action(detail=False, methods=["get"])
#     def by_subject(self, request, subject_id=None):
#         """Get exams by subject"""
#         if not subject_id:
#             return Response(
#                 {"error": "Subject ID is required"}, status=status.HTTP_400_BAD_REQUEST
#             )

#         exams = self.get_queryset().filter(subject_id=subject_id)
#         serializer = self.get_serializer(exams, many=True)
#         return Response(serializer.data)

#     @action(detail=False, methods=["get"])
#     def by_grade(self, request, grade_id=None):
#         """Get exams by grade level"""
#         if not grade_id:
#             return Response(
#                 {"error": "Grade ID is required"}, status=status.HTTP_400_BAD_REQUEST
#             )

#         exams = self.get_queryset().filter(grade_level_id=grade_id)
#         serializer = self.get_serializer(exams, many=True)
#         return Response(serializer.data)

#     @action(detail=False, methods=["get"])
#     def completed(self, request):
#         """Get completed exams"""
#         exams = self.get_queryset().filter(status="completed")
#         serializer = self.get_serializer(exams, many=True)
#         return Response(serializer.data)

#     @action(detail=False, methods=["get"])
#     def ongoing(self, request):
#         """Get ongoing exams"""
#         exams = self.get_queryset().filter(status="in_progress")
#         serializer = self.get_serializer(exams, many=True)
#         return Response(serializer.data)

#     @action(detail=False, methods=["get"])
#     def calendar_view(self, request):
#         """Get exams in calendar format"""
#         start_date = request.GET.get("start_date")
#         end_date = request.GET.get("end_date")

#         queryset = self.get_queryset()

#         if start_date:
#             queryset = queryset.filter(exam_date__gte=start_date)
#         if end_date:
#             queryset = queryset.filter(exam_date__lte=end_date)

#         exams = queryset.order_by("exam_date", "start_time")
#         serializer = self.get_serializer(exams, many=True)
#         return Response(serializer.data)

#     @action(detail=False, methods=["get"])
#     def summary_list(self, request):
#         """Get exam summary list"""
#         exams = self.get_queryset().annotate(
#             registered_students_count=Count("examregistration", distinct=True)
#         )
#         serializer = self.get_serializer(exams, many=True)
#         return Response(serializer.data)

#     @action(detail=False, methods=["post"])
#     def bulk_update(self, request):
#         """Bulk update exams"""
#         exam_ids = request.data.get("exam_ids", [])
#         update_data = request.data.get("update_data", {})

#         if not exam_ids:
#             return Response(
#                 {"error": "Exam IDs are required"}, status=status.HTTP_400_BAD_REQUEST
#             )

#         updated_count = 0
#         errors = []

#         with transaction.atomic():
#             for exam_id in exam_ids:
#                 try:
#                     exam = Exam.objects.get(id=exam_id)
#                     for field, value in update_data.items():
#                         if hasattr(exam, field):
#                             setattr(exam, field, value)
#                     exam.save()
#                     updated_count += 1
#                 except Exam.DoesNotExist:
#                     errors.append(f"Exam {exam_id} not found")
#                 except Exception as e:
#                     errors.append(f"Exam {exam_id}: {str(e)}")

#         return Response(
#             {
#                 "message": f"Updated {updated_count} exams",
#                 "updated_count": updated_count,
#                 "errors": errors,
#             }
#         )

#     @action(detail=False, methods=["post"])
#     def bulk_delete(self, request):
#         """Bulk delete exams"""
#         exam_ids = request.data.get("exam_ids", [])

#         if not exam_ids:
#             return Response(
#                 {"error": "Exam IDs are required"}, status=status.HTTP_400_BAD_REQUEST
#             )

#         deleted_count = 0
#         errors = []

#         with transaction.atomic():
#             for exam_id in exam_ids:
#                 try:
#                     exam = Exam.objects.get(id=exam_id)
#                     exam.delete()
#                     deleted_count += 1
#                 except Exam.DoesNotExist:
#                     errors.append(f"Exam {exam_id} not found")
#                 except Exception as e:
#                     errors.append(f"Exam {exam_id}: {str(e)}")

#         return Response(
#             {
#                 "message": f"Deleted {deleted_count} exams",
#                 "deleted_count": deleted_count,
#                 "errors": errors,
#             }
#         )

#     # Import/Export
#     @action(detail=False, methods=["post"])
#     def import_csv(self, request):
#         """Import exams from CSV"""
#         file = request.FILES.get("file")
#         if not file or not file.name.endswith(".csv"):
#             return Response(
#                 {"error": "Valid CSV file is required"},
#                 status=status.HTTP_400_BAD_REQUEST,
#             )

#         try:
#             decoded_file = TextIOWrapper(file.file, encoding="utf-8")
#             reader = csv.DictReader(decoded_file)

#             required_headers = [
#                 "title",
#                 "subject",
#                 "grade_level",
#                 "exam_date",
#                 "start_time",
#                 "end_time",
#             ]
#             missing_headers = [
#                 h for h in required_headers if h not in reader.fieldnames
#             ]

#             if missing_headers:
#                 return Response(
#                     {
#                         "error": f'Missing required columns: {", ".join(missing_headers)}'
#                     },
#                     status=status.HTTP_400_BAD_REQUEST,
#                 )

#             created_exams = []
#             errors = []

#             with transaction.atomic():
#                 for row_num, row in enumerate(reader, start=2):
#                     try:
#                         exam_data = self._process_csv_row(row, row_num)
#                         if "error" in exam_data:
#                             errors.append(exam_data["error"])
#                             continue

#                         serializer = ExamCreateUpdateSerializer(data=exam_data)
#                         if serializer.is_valid():
#                             exam = serializer.save(created_by=request.user)
#                             created_exams.append(exam.id)
#                         else:
#                             errors.append(f"Row {row_num}: {serializer.errors}")

#                     except Exception as e:
#                         errors.append(f"Row {row_num}: {str(e)}")

#                 if errors:
#                     transaction.set_rollback(True)
#                     return Response(
#                         {"error": "CSV import failed", "details": errors},
#                         status=status.HTTP_400_BAD_REQUEST,
#                     )

#             return Response(
#                 {
#                     "message": f"Successfully imported {len(created_exams)} exams",
#                     "created_exam_ids": created_exams,
#                 },
#                 status=status.HTTP_201_CREATED,
#             )

#         except Exception as e:
#             logger.error(f"CSV import error: {str(e)}")
#             return Response(
#                 {"error": f"Import failed: {str(e)}"},
#                 status=status.HTTP_500_INTERNAL_SERVER_ERROR,
#             )

#     @action(detail=False, methods=["get"])
#     def export_csv(self, request):
#         """Export exams to CSV"""
#         response = HttpResponse(content_type="text/csv")
#         response["Content-Disposition"] = 'attachment; filename="exams.csv"'

#         writer = csv.writer(response)
#         writer.writerow(
#             [
#                 "id",
#                 "title",
#                 "code",
#                 "subject_name",
#                 "grade_level_name",
#                 "section_name",
#                 "teacher_name",
#                 "exam_date",
#                 "start_time",
#                 "end_time",
#                 "duration_minutes",
#                 "total_marks",
#                 "pass_marks",
#                 "venue",
#                 "status",
#                 "exam_type",
#             ]
#         )

#         for exam in self.filter_queryset(self.get_queryset()).select_related(
#             "subject", "grade_level", "section", "teacher"
#         ):
#             writer.writerow(
#                 [
#                     exam.id,
#                     exam.title,
#                     exam.code,
#                     exam.subject.name,
#                     exam.grade_level.name,
#                     exam.section.name if exam.section else "",
#                     exam.teacher.full_name if exam.teacher else "",
#                     exam.exam_date.strftime("%Y-%m-%d"),
#                     exam.start_time.strftime("%H:%M"),
#                     exam.end_time.strftime("%H:%M"),
#                     exam.duration_minutes,
#                     exam.total_marks,
#                     exam.pass_marks,
#                     exam.venue,
#                     exam.status,
#                     exam.exam_type,
#                 ]
#             )

#         return response

#     # Helper Methods
#     def _process_csv_row(self, row, row_num):
#         """Process a single CSV row"""
#         try:
#             # Get related objects
#             subject = Subject.objects.get(name=row["subject"].strip())
#             grade_level = GradeLevel.objects.get(name=row["grade_level"].strip())

#             section = None
#             if row.get("section") and row["section"].strip():
#                 section = Section.objects.get(name=row["section"].strip())

#             teacher = None
#             if row.get("teacher") and row["teacher"].strip():
#                 teacher = Teacher.objects.get(full_name=row["teacher"].strip())

#             # Parse dates
#             exam_date = datetime.strptime(row["exam_date"], "%Y-%m-%d").date()
#             start_time = datetime.strptime(row["start_time"], "%H:%M").time()
#             end_time = datetime.strptime(row["end_time"], "%H:%M").time()

#             return {
#                 "title": row["title"].strip(),
#                 "subject": subject.id,
#                 "grade_level": grade_level.id,
#                 "section": section.id if section else None,
#                 "teacher": teacher.id if teacher else None,
#                 "exam_date": exam_date,
#                 "start_time": start_time,
#                 "end_time": end_time,
#                 "description": row.get("description", "").strip(),
#                 "total_marks": int(row.get("total_marks", 100)),
#                 "pass_marks": int(row.get("pass_marks", 40)),
#                 "venue": row.get("venue", "").strip(),
#                 "exam_type": row.get("exam_type", "written"),
#                 "status": row.get("status", "scheduled"),
#             }
#         except Exception as e:
#             return {"error": f"Row {row_num}: {str(e)}"}

#     def _generate_exam_statistics(self, exam):
#         """Generate statistics for an exam"""
#         results = StudentResult.objects.filter(exam=exam)

#         if not results.exists():
#             return

#         total_registered = ExamRegistration.objects.filter(exam=exam).count()
#         total_appeared = results.count()

#         stats_data = {
#             "total_registered": total_registered,
#             "total_appeared": total_appeared,
#             "total_absent": total_registered - total_appeared,
#             "highest_score": results.aggregate(Max("score"))["score__max"] or 0,
#             "lowest_score": results.aggregate(Min("score"))["score__min"] or 0,
#             "average_score": results.aggregate(Avg("score"))["score__avg"] or 0,
#             "total_passed": results.filter(is_pass=True).count(),
#             "total_failed": results.filter(is_pass=False).count(),
#         }

#         stats_data["pass_percentage"] = (
#             (stats_data["total_passed"] / stats_data["total_appeared"] * 100)
#             if stats_data["total_appeared"] > 0
#             else 0
#         )

#         ExamStatistics.objects.update_or_create(
#             exam=exam, defaults={**stats_data, "calculated_at": timezone.now()}
#         )


# # class ExamScheduleViewSet(AutoSectionFilterMixin, viewsets.ModelViewSet):
# #     """ViewSet for exam schedules"""

# #     queryset = ExamSchedule.objects.all()
# #     serializer_class = ExamScheduleSerializer
# #     ordering = ["-created_at"]
# #     permission_classes = [permissions.IsAuthenticated]

# #     def get_queryset(self):
# #         """Apply section-based filtering for authenticated users"""
# #         queryset = super().get_queryset()

# #         # Apply section-based filtering for authenticated users
# #         if self.request.user.is_authenticated:
# #             # Filter exam schedules by exams that belong to allowed education levels
# #             section_access = self.get_user_section_access()
# #             education_levels = self.get_education_levels_for_sections(section_access)

# #             if not education_levels:
# #                 return queryset.none()

# #             # Filter schedules that have exams in allowed education levels
# #             queryset = queryset.filter(
# #                 exams__grade_level__education_level__in=education_levels
# #             ).distinct()

# #         return queryset

# #     @action(detail=True, methods=["get"])
# #     def exams(self, request, pk=None):
# #         """Get exams for a schedule"""
# #         schedule = self.get_object()
# #         exams = Exam.objects.filter(exam_schedule=schedule)
# #         from .serializers import ExamListSerializer

# #         serializer = ExamListSerializer(exams, many=True)
# #         return Response(serializer.data)

# #     @action(detail=True, methods=["get"])
# #     def get_exams(self, request, pk=None):
# #         """Get exams for a schedule (alias for exams)"""
# #         return self.exams(request, pk)

# #     @action(detail=True, methods=["post"])
# #     def toggle_active(self, request, pk=None):
# #         """Toggle schedule active status"""
# #         schedule = self.get_object()
# #         schedule.is_active = not schedule.is_active
# #         schedule.save()

# #         status_text = "activated" if schedule.is_active else "deactivated"
# #         return Response({"message": f"Schedule {status_text}"})


# class ExamScheduleViewSet(viewsets.ModelViewSet):
#     """ViewSet for exam schedules"""

#     queryset = ExamSchedule.objects.all()
#     serializer_class = ExamScheduleSerializer
#     ordering = ["-created_at"]
#     permission_classes = [permissions.IsAuthenticated]

#     def get_queryset(self):
#         """
#         Return all exam schedules.
#         Admin/Staff see everything, others see based on permissions.
#         """
#         queryset = super().get_queryset()
#         user = self.request.user

#         # 🟢 ADMINS/STAFF: See all schedules
#         if user.is_superuser or user.is_staff:
#             return queryset

#         # 🟢 For other users, return all schedules
#         # They can view schedules, but exams will be filtered separately
#         return queryset

#     @action(detail=True, methods=["get"])
#     def exams(self, request, pk=None):
#         """Get exams for a schedule"""
#         schedule = self.get_object()
#         exams = Exam.objects.filter(exam_schedule=schedule)
#         from .serializers import ExamListSerializer

#         serializer = ExamListSerializer(exams, many=True)
#         return Response(serializer.data)

#     @action(detail=True, methods=["get"])
#     def get_exams(self, request, pk=None):
#         """Get exams for a schedule (alias for exams)"""
#         return self.exams(request, pk)

#     @action(detail=True, methods=["post"])
#     def set_default(self, request, pk=None):
#         """Set a schedule as the default schedule"""
#         schedule = self.get_object()

#         # Remove default flag from all other schedules
#         ExamSchedule.objects.exclude(pk=schedule.pk).update(is_default=False)

#         # Set this schedule as default
#         schedule.is_default = True
#         schedule.save()

#         serializer = self.get_serializer(schedule)
#         return Response(
#             {
#                 "message": "Default schedule updated successfully",
#                 "schedule": serializer.data,
#             }
#         )

#     @action(detail=True, methods=["post"])
#     def toggle_active(self, request, pk=None):
#         """Toggle schedule active status"""
#         schedule = self.get_object()
#         schedule.is_active = not schedule.is_active
#         schedule.save()

#         status_text = "activated" if schedule.is_active else "deactivated"
#         return Response(
#             {"message": f"Schedule {status_text}", "is_active": schedule.is_active}
#         )


# class ExamRegistrationViewSet(AutoSectionFilterMixin, viewsets.ModelViewSet):
#     """ViewSet for exam registrations"""

#     queryset = ExamRegistration.objects.select_related("exam", "student")
#     serializer_class = ExamRegistrationSerializer
#     ordering = ["-registration_date"]
#     permission_classes = [permissions.IsAuthenticated]

#     def get_queryset(self):
#         """Filter by student or exam if provided, with section filtering"""
#         queryset = super().get_queryset()
#         student_id = self.request.query_params.get("student_id")
#         exam_id = self.request.query_params.get("exam_id")

#         if student_id:
#             queryset = queryset.filter(student_id=student_id)
#         if exam_id:
#             queryset = queryset.filter(exam_id=exam_id)

#         # Apply section-based filtering for authenticated users
#         if self.request.user.is_authenticated:
#             # Filter exam registrations by exams that belong to allowed education levels
#             section_access = self.get_user_section_access()
#             education_levels = self.get_education_levels_for_sections(section_access)

#             if not education_levels:
#                 return queryset.none()

#             # Filter registrations for exams in allowed education levels
#             queryset = queryset.filter(
#                 exam__grade_level__education_level__in=education_levels
#             )

#         return queryset

#     @action(detail=False, methods=["post"])
#     def bulk_register(self, request):
#         """Bulk register students for an exam"""
#         exam_id = request.data.get("exam_id")
#         student_ids = request.data.get("student_ids", [])

#         if not exam_id or not student_ids:
#             return Response(
#                 {"error": "Exam ID and student IDs are required"},
#                 status=status.HTTP_400_BAD_REQUEST,
#             )

#         try:
#             exam = Exam.objects.get(id=exam_id)
#         except Exam.DoesNotExist:
#             return Response(
#                 {"error": "Exam not found"}, status=status.HTTP_404_NOT_FOUND
#             )

#         created_registrations = []
#         errors = []

#         with transaction.atomic():
#             for student_id in student_ids:
#                 try:
#                     student = Student.objects.get(id=student_id)

#                     # Check if already registered
#                     if ExamRegistration.objects.filter(
#                         exam=exam, student=student
#                     ).exists():
#                         errors.append(f"Student {student_id} already registered")
#                         continue

#                     registration = ExamRegistration.objects.create(
#                         exam=exam, student=student, registration_date=timezone.now()
#                     )
#                     created_registrations.append(registration.id)

#                 except Student.DoesNotExist:
#                     errors.append(f"Student {student_id} not found")
#                 except Exception as e:
#                     errors.append(f"Student {student_id}: {str(e)}")

#         return Response(
#             {
#                 "message": f"Registered {len(created_registrations)} students",
#                 "created_registrations": created_registrations,
#                 "errors": errors,
#             }
#         )

#     @action(detail=False, methods=["get"])
#     def by_student(self, request, student_id=None):
#         """Get registrations by student"""
#         if not student_id:
#             return Response(
#                 {"error": "Student ID is required"}, status=status.HTTP_400_BAD_REQUEST
#             )

#         registrations = self.get_queryset().filter(student_id=student_id)
#         serializer = self.get_serializer(registrations, many=True)
#         return Response(serializer.data)

#     @action(detail=False, methods=["get"])
#     def by_exam(self, request, exam_id=None):
#         """Get registrations by exam"""
#         if not exam_id:
#             return Response(
#                 {"error": "Exam ID is required"}, status=status.HTTP_400_BAD_REQUEST
#             )

#         registrations = self.get_queryset().filter(exam_id=exam_id)
#         serializer = self.get_serializer(registrations, many=True)
#         return Response(serializer.data)

#     @action(detail=False, methods=["post"])
#     def mark_attendance(self, request):
#         """Mark attendance for exam registrations"""
#         attendance_data = request.data.get("attendance", [])

#         if not attendance_data:
#             return Response(
#                 {"error": "Attendance data is required"},
#                 status=status.HTTP_400_BAD_REQUEST,
#             )

#         updated_count = 0
#         errors = []

#         with transaction.atomic():
#             for item in attendance_data:
#                 registration_id = item.get("registration_id")
#                 is_present = item.get("is_present", False)

#                 if not registration_id:
#                     errors.append("Registration ID is required")
#                     continue

#                 try:
#                     registration = ExamRegistration.objects.get(id=registration_id)
#                     registration.is_present = is_present
#                     registration.save()
#                     updated_count += 1
#                 except ExamRegistration.DoesNotExist:
#                     errors.append(f"Registration {registration_id} not found")
#                 except Exception as e:
#                     errors.append(f"Registration {registration_id}: {str(e)}")

#         return Response(
#             {
#                 "message": f"Updated attendance for {updated_count} registrations",
#                 "updated_count": updated_count,
#                 "errors": errors,
#             }
#         )


# class ResultViewSet(AutoSectionFilterMixin, viewsets.ModelViewSet):
#     """ViewSet for exam results"""

#     queryset = StudentResult.objects.select_related("exam", "student", "subject")
#     serializer_class = ResultSerializer
#     ordering = ["-created_at"]
#     permission_classes = [permissions.IsAuthenticated]

#     def get_queryset(self):
#         """Filter by exam, student, or subject if provided, with section filtering"""
#         queryset = super().get_queryset()
#         exam_id = self.request.query_params.get("exam_id")
#         student_id = self.request.query_params.get("student_id")
#         subject_id = self.request.query_params.get("subject_id")

#         if exam_id:
#             queryset = queryset.filter(exam_id=exam_id)
#         if student_id:
#             queryset = queryset.filter(student_id=student_id)
#         if subject_id:
#             queryset = queryset.filter(subject_id=subject_id)

#         # Apply section-based filtering for authenticated users
#         if self.request.user.is_authenticated:
#             # Filter results by student's education level
#             section_access = self.get_user_section_access()
#             education_levels = self.get_education_levels_for_sections(section_access)

#             if not education_levels:
#                 return queryset.none()

#             queryset = queryset.filter(student__education_level__in=education_levels)

#         return queryset

#     def get_serializer_class(self):
#         if self.action in ["create", "update", "partial_update"]:
#             return ResultCreateUpdateSerializer
#         return ResultSerializer

#     def perform_create(self, serializer):
#         serializer.save(recorded_by=self.request.user)

#     def perform_update(self, serializer):
#         serializer.save(recorded_by=self.request.user)


# # Add this ExamStatisticsViewSet class to your views.py file


# class ExamStatisticsViewSet(SectionFilterMixin, viewsets.ReadOnlyModelViewSet):
#     """ViewSet for exam statistics (read-only)"""

#     queryset = ExamStatistics.objects.select_related("exam")
#     serializer_class = ExamStatisticsSerializer
#     ordering = ["-calculated_at"]
#     permission_classes = [permissions.IsAuthenticated]

#     def get_queryset(self):
#         """Filter by exam if provided, with section filtering"""
#         queryset = super().get_queryset()
#         exam_id = self.request.query_params.get("exam_id")

#         if exam_id:
#             queryset = queryset.filter(exam_id=exam_id)

#         # Apply section-based filtering for authenticated users
#         if self.request.user.is_authenticated:
#             # Filter exam statistics by exams that belong to allowed education levels
#             section_access = self.get_user_section_access()
#             education_levels = self.get_education_levels_for_sections(section_access)

#             if not education_levels:
#                 return queryset.none()

#             # Filter statistics for exams in allowed education levels
#             queryset = queryset.filter(
#                 exam__grade_level__education_level__in=education_levels
#             )

#         return queryset

#     @action(detail=False, methods=["get"])
#     def summary(self, request):
#         """Get statistics summary across all exams"""
#         stats = self.get_queryset()

#         if not stats.exists():
#             return Response({"message": "No statistics available", "total_exams": 0})

#         summary_data = {
#             "total_exams": stats.count(),
#             "total_students_registered": sum(s.total_registered for s in stats),
#             "total_students_appeared": sum(s.total_appeared for s in stats),
#             "average_pass_rate": stats.aggregate(avg_pass=Avg("pass_percentage"))[
#                 "avg_pass"
#             ]
#             or 0,
#             "highest_average_score": stats.aggregate(max_avg=Max("average_score"))[
#                 "max_avg"
#             ]
#             or 0,
#         }

#         return Response(summary_data)

#     @action(detail=True, methods=["post"])
#     def recalculate(self, request, pk=None):
#         """Recalculate statistics for a specific exam"""
#         stats = self.get_object()
#         exam = stats.exam

#         # Use the helper method from ExamViewSet
#         exam_viewset = ExamViewSet()
#         exam_viewset._generate_exam_statistics(exam)

#         # Refresh the statistics object
#         stats.refresh_from_db()
#         serializer = self.get_serializer(stats)

#         return Response(
#             {
#                 "message": "Statistics recalculated successfully",
#                 "statistics": serializer.data,
#             }
#         )
# from rest_framework import viewsets, filters, status, permissions
# from rest_framework.decorators import action
# from rest_framework.response import Response
# from django_filters.rest_framework import DjangoFilterBackend
# from django.http import HttpResponse
# from django.core.exceptions import ValidationError
# from django.db import transaction
# from django.db.models import Q, Count, Avg, Max, Min
# from django.utils import timezone
# from io import TextIOWrapper
# import csv
# from datetime import datetime, timedelta
# from utils.section_filtering import SectionFilterMixin, AutoSectionFilterMixin
# import logging

# # Import models
# from .models import Exam, ExamSchedule, ExamRegistration, ExamStatistics
# from result.models import StudentResult
# from classroom.models import GradeLevel, Section
# from subject.models import Subject
# from teacher.models import Teacher
# from students.models import Student
# from django.shortcuts import render, redirect
# from django.contrib import messages
# from .forms import ExamForm, ExamScheduleForm


# # Import serializers
# from .serializers import (
#     ExamListSerializer,
#     ExamDetailSerializer,
#     ExamCreateUpdateSerializer,
#     ExamScheduleSerializer,
#     ExamRegistrationSerializer,
#     ResultSerializer,
#     ResultCreateUpdateSerializer,
#     ExamStatisticsSerializer,
# )

# # Import filters
# from .filters import ExamFilter

# logger = logging.getLogger(__name__)


# def create_exam(request):
#     if request.method == "POST":
#         form = ExamForm(request.POST)
#         if form.is_valid():
#             exam = form.save()
#             messages.success(request, f'Exam "{exam.title}" created successfully!')
#             return redirect("exam_list")
#     else:
#         form = ExamForm()

#     return render(request, "exams/exam_form.html", {"form": form})


# def create_exam_schedule(request):
#     if request.method == "POST":
#         form = ExamScheduleForm(request.POST)
#         if form.is_valid():
#             schedule = form.save()
#             messages.success(
#                 request, f'Exam schedule "{schedule.name}" created successfully!'
#             )
#             return redirect("exam_schedule_list")
#     else:
#         form = ExamScheduleForm()

#     return render(request, "exams/exam_schedule_form.html", {"form": form})


# class ExamViewSet(AutoSectionFilterMixin, viewsets.ModelViewSet):
#     """
#     Streamlined ViewSet for managing exams with section-based filtering
#     """

#     queryset = Exam.objects.select_related(
#         "subject", "grade_level", "section", "teacher"
#     ).prefetch_related("invigilators")

#     filter_backends = [
#         DjangoFilterBackend,
#         filters.SearchFilter,
#         filters.OrderingFilter,
#     ]
#     filterset_class = ExamFilter
#     search_fields = ["title", "description", "code", "subject__name", "venue"]
#     ordering_fields = ["exam_date", "start_time", "title", "created_at"]
#     ordering = ["-exam_date", "start_time"]
#     permission_classes = [permissions.IsAuthenticated]

#     def get_serializer_class(self):
#         """Return appropriate serializer based on action"""
#         if self.action == "list":
#             return ExamListSerializer
#         elif self.action in ["create", "update", "partial_update"]:
#             return ExamCreateUpdateSerializer
#         return ExamDetailSerializer

#     def _get_section_education_levels(self, user):
#         """
#         Helper method to get education levels based on user's section/role
#         Returns a list of education levels the user can access
#         """
#         # Map user sections to education levels
#         SECTION_TO_EDUCATION_LEVEL = {
#             "nursery": ["NURSERY"],
#             "primary": ["PRIMARY"],
#             "junior_secondary": ["JUNIOR_SECONDARY"],
#             "senior_secondary": ["SENIOR_SECONDARY"],
#             "secondary": ["JUNIOR_SECONDARY", "SENIOR_SECONDARY"],  # Both JSS and SSS
#         }

#         # Map user roles to sections (for backward compatibility)
#         ROLE_TO_SECTION = {
#             "nursery_admin": "nursery",
#             "primary_admin": "primary",
#             "junior_secondary_admin": "junior_secondary",
#             "senior_secondary_admin": "senior_secondary",
#             "secondary_admin": "secondary",
#         }

#         # Get section from user.section first, fallback to role mapping
#         user_section = user.section
#         if not user_section and user.role in ROLE_TO_SECTION:
#             user_section = ROLE_TO_SECTION[user.role]

#         # Return education levels for the user's section
#         return SECTION_TO_EDUCATION_LEVEL.get(user_section, [])

#     def get_queryset(self):
#         """Optimize queryset for list view with section filtering"""
#         queryset = super().get_queryset()

#         if self.action == "list":
#             queryset = queryset.annotate(
#                 registered_students_count=Count("examregistration", distinct=True)
#             )

#         # Apply section-based filtering for authenticated users
#         if self.request.user.is_authenticated:
#             user = self.request.user

#             # 🟢 SUPERADMIN: See all exams
#             if user.is_superuser:
#                 logger.info(f"Superadmin {user.username} accessing all exams")
#                 return queryset

#             # 🟢 SECTION ADMINS: See only their section's exams
#             if user.is_staff and user.is_section_admin:
#                 education_levels = self._get_section_education_levels(user)
#                 if not education_levels:
#                     logger.warning(
#                         f"Section admin {user.username} has no valid section, returning empty queryset"
#                     )
#                     return queryset.none()

#                 logger.info(
#                     f"Section admin {user.username} ({user.role}) accessing exams for: {education_levels}"
#                 )
#                 return queryset.filter(
#                     grade_level__education_level__in=education_levels
#                 )

#             # 🟢 TEACHERS: See only their own exams
#             if hasattr(user, "teacher"):
#                 logger.info(f"Teacher {user.username} accessing their own exams")
#                 return queryset.filter(teacher_id=user.teacher.id)

#             # 🟢 REGULAR STAFF (non-section admins): See all exams
#             if user.is_staff:
#                 logger.info(f"Staff {user.username} accessing all exams")
#                 return queryset

#             # 🟢 STUDENTS/PARENTS: Filter by section access
#             section_access = self.get_user_section_access()
#             education_levels = self.get_education_levels_for_sections(section_access)

#             if not education_levels:
#                 return queryset.none()

#             queryset = queryset.filter(
#                 grade_level__education_level__in=education_levels
#             )

#         return queryset

#     def perform_create(self, serializer):
#         serializer.save(created_by=self.request.user)

#     def perform_update(self, serializer):
#         serializer.save(updated_by=self.request.user)

#     @action(detail=False, methods=["post"])
#     def bulk_create(self, request):
#         """Bulk create results"""
#         results_data = request.data.get("results", [])

#         if not results_data:
#             return Response(
#                 {"error": "Results data is required"},
#                 status=status.HTTP_400_BAD_REQUEST,
#             )

#         created_results = []
#         errors = []

#         with transaction.atomic():
#             for i, result_data in enumerate(results_data):
#                 serializer = ResultCreateUpdateSerializer(data=result_data)
#                 if serializer.is_valid():
#                     result = serializer.save(recorded_by=request.user)
#                     created_results.append(result.id)
#                 else:
#                     errors.append({"index": i, "errors": serializer.errors})

#             if errors:
#                 transaction.set_rollback(True)
#                 return Response({"errors": errors}, status=status.HTTP_400_BAD_REQUEST)

#         return Response(
#             {
#                 "message": f"Created {len(created_results)} results",
#                 "created_ids": created_results,
#             },
#             status=status.HTTP_201_CREATED,
#         )

#     @action(detail=False, methods=["post"])
#     def bulk_update(self, request):
#         """Bulk update results"""
#         results_data = request.data.get("results", [])

#         if not results_data:
#             return Response(
#                 {"error": "Results data is required"},
#                 status=status.HTTP_400_BAD_REQUEST,
#             )

#         updated_count = 0
#         errors = []

#         with transaction.atomic():
#             for i, result_data in enumerate(results_data):
#                 result_id = result_data.get("id")
#                 if not result_id:
#                     errors.append({"index": i, "error": "Result ID is required"})
#                     continue

#                 try:
#                     result = StudentResult.objects.get(id=result_id)
#                     serializer = ResultCreateUpdateSerializer(
#                         result, data=result_data, partial=True
#                     )
#                     if serializer.is_valid():
#                         serializer.save(updated_by=request.user)
#                         updated_count += 1
#                     else:
#                         errors.append({"index": i, "errors": serializer.errors})
#                 except StudentResult.DoesNotExist:
#                     errors.append(
#                         {"index": i, "error": f"Result {result_id} not found"}
#                     )
#                 except Exception as e:
#                     errors.append({"index": i, "error": str(e)})

#             if errors:
#                 transaction.set_rollback(True)
#                 return Response({"errors": errors}, status=status.HTTP_400_BAD_REQUEST)

#         return Response(
#             {
#                 "message": f"Updated {updated_count} results",
#                 "updated_count": updated_count,
#             }
#         )

#     @action(detail=False, methods=["get"])
#     def by_student(self, request, student_id=None):
#         """Get results by student"""
#         if not student_id:
#             return Response(
#                 {"error": "Student ID is required"}, status=status.HTTP_400_BAD_REQUEST
#             )

#         results = self.get_queryset().filter(student_id=student_id)
#         serializer = self.get_serializer(results, many=True)
#         return Response(serializer.data)

#     @action(detail=False, methods=["get"])
#     def by_exam(self, request, exam_id=None):
#         """Get results by exam"""
#         if not exam_id:
#             return Response(
#                 {"error": "Exam ID is required"}, status=status.HTTP_400_BAD_REQUEST
#             )

#         results = self.get_queryset().filter(exam_id=exam_id)
#         serializer = self.get_serializer(results, many=True)
#         return Response(serializer.data)

#     @action(detail=False, methods=["get"])
#     def by_subject(self, request, subject_id=None):
#         """Get results by subject"""
#         if not subject_id:
#             return Response(
#                 {"error": "Subject ID is required"}, status=status.HTTP_400_BAD_REQUEST
#             )

#         results = self.get_queryset().filter(subject_id=subject_id)
#         serializer = self.get_serializer(results, many=True)
#         return Response(serializer.data)

#     @action(detail=False, methods=["get"])
#     def by_grade(self, request, grade_id=None):
#         """Get results by grade level"""
#         if not grade_id:
#             return Response(
#                 {"error": "Grade ID is required"}, status=status.HTTP_400_BAD_REQUEST
#             )

#         results = self.get_queryset().filter(grade_level_id=grade_id)
#         serializer = self.get_serializer(results, many=True)
#         return Response(serializer.data)

#     @action(detail=False, methods=["get"])
#     def student_transcript(self, request, student_id=None):
#         """Get student transcript"""
#         if not student_id:
#             return Response(
#                 {"error": "Student ID is required"}, status=status.HTTP_400_BAD_REQUEST
#             )

#         results = (
#             self.get_queryset()
#             .filter(student_id=student_id)
#             .order_by("exam__exam_date")
#         )
#         serializer = self.get_serializer(results, many=True)
#         return Response(serializer.data)

#     @action(detail=False, methods=["get"])
#     def grade_sheet(self, request, exam_id=None):
#         """Get grade sheet for an exam"""
#         if not exam_id:
#             return Response(
#                 {"error": "Exam ID is required"}, status=status.HTTP_400_BAD_REQUEST
#             )

#         results = (
#             self.get_queryset()
#             .filter(exam_id=exam_id)
#             .order_by("student__user__first_name")
#         )
#         serializer = self.get_serializer(results, many=True)
#         return Response(serializer.data)

#     # Core Exam Management
#     @action(detail=True, methods=["post"])
#     def start_exam(self, request, pk=None):
#         """Start an exam"""
#         exam = self.get_object()

#         if exam.status != "scheduled":
#             return Response(
#                 {"error": "Only scheduled exams can be started"},
#                 status=status.HTTP_400_BAD_REQUEST,
#             )

#         exam.status = "in_progress"
#         exam.save()
#         return Response({"message": "Exam started successfully"})

#     @action(detail=True, methods=["post"])
#     def end_exam(self, request, pk=None):
#         """End an exam and generate statistics"""
#         exam = self.get_object()

#         if exam.status != "in_progress":
#             return Response(
#                 {"error": "Only exams in progress can be ended"},
#                 status=status.HTTP_400_BAD_REQUEST,
#             )

#         exam.status = "completed"
#         exam.save()

#         # Generate statistics
#         self._generate_exam_statistics(exam)
#         return Response({"message": "Exam ended successfully"})

#     @action(detail=True, methods=["post"])
#     def cancel_exam(self, request, pk=None):
#         """Cancel an exam"""
#         exam = self.get_object()

#         if exam.status == "completed":
#             return Response(
#                 {"error": "Cannot cancel completed exam"},
#                 status=status.HTTP_400_BAD_REQUEST,
#             )

#         exam.status = "cancelled"
#         exam.cancellation_reason = request.data.get("reason", "")
#         exam.save()
#         return Response({"message": "Exam cancelled successfully"})

#     @action(detail=True, methods=["post"])
#     def postpone_exam(self, request, pk=None):
#         """Postpone an exam"""
#         exam = self.get_object()
#         new_date = request.data.get("new_date")
#         new_start_time = request.data.get("new_start_time")
#         new_end_time = request.data.get("new_end_time")
#         reason = request.data.get("reason", "")

#         if not new_date:
#             return Response(
#                 {"error": "New date is required"}, status=status.HTTP_400_BAD_REQUEST
#             )

#         if exam.status == "completed":
#             return Response(
#                 {"error": "Cannot postpone completed exam"},
#                 status=status.HTTP_400_BAD_REQUEST,
#             )

#         exam.exam_date = new_date
#         if new_start_time:
#             exam.start_time = new_start_time
#         if new_end_time:
#             exam.end_time = new_end_time

#         exam.postponement_reason = reason
#         exam.save()

#         return Response({"message": "Exam postponed successfully"})

#     # Approval Workflow
#     @action(detail=True, methods=["post"])
#     def approve(self, request, pk=None):
#         """Approve an exam"""
#         exam = self.get_object()

#         if exam.status != "pending_approval":
#             return Response(
#                 {"error": "Only exams pending approval can be approved"},
#                 status=status.HTTP_400_BAD_REQUEST,
#             )

#         approver = None
#         if hasattr(request, "user") and request.user.is_authenticated:
#             try:
#                 from teacher.models import Teacher

#                 approver = Teacher.objects.get(user=request.user)
#             except Teacher.DoesNotExist:
#                 pass

#         notes = request.data.get("notes", "")
#         exam.approve(approver, notes)

#         return Response(
#             {
#                 "message": "Exam approved successfully",
#                 "status": exam.status,
#                 "approved_at": exam.approved_at,
#                 "approved_by": exam.approved_by.id if exam.approved_by else None,
#             }
#         )

#     @action(detail=True, methods=["post"])
#     def reject(self, request, pk=None):
#         """Reject an exam"""
#         exam = self.get_object()

#         if exam.status != "pending_approval":
#             return Response(
#                 {"error": "Only exams pending approval can be rejected"},
#                 status=status.HTTP_400_BAD_REQUEST,
#             )

#         approver = None
#         if hasattr(request, "user") and request.user.is_authenticated:
#             try:
#                 from teacher.models import Teacher

#                 approver = Teacher.objects.get(user=request.user)
#             except Teacher.DoesNotExist:
#                 pass

#         reason = request.data.get("reason", "")
#         exam.reject(approver, reason)

#         return Response(
#             {
#                 "message": "Exam rejected successfully",
#                 "status": exam.status,
#                 "rejected_at": exam.approved_at,
#                 "rejected_by": exam.approved_by.id if exam.approved_by else None,
#                 "rejection_reason": exam.rejection_reason,
#             }
#         )

#     @action(detail=True, methods=["post"])
#     def submit_for_approval(self, request, pk=None):
#         """Submit exam for approval"""
#         exam = self.get_object()

#         if exam.status not in ["draft", "rejected"]:
#             return Response(
#                 {"error": "Only draft or rejected exams can be submitted for approval"},
#                 status=status.HTTP_400_BAD_REQUEST,
#             )

#         exam.submit_for_approval()

#         return Response(
#             {
#                 "message": "Exam submitted for approval successfully",
#                 "status": exam.status,
#             }
#         )

#     # Student Registration
#     @action(detail=True, methods=["post"])
#     def register_student(self, request, pk=None):
#         """Register a student for an exam"""
#         exam = self.get_object()
#         student_id = request.data.get("student_id")

#         if not student_id:
#             return Response(
#                 {"error": "Student ID is required"}, status=status.HTTP_400_BAD_REQUEST
#             )

#         try:
#             student = Student.objects.get(id=student_id)
#         except Student.DoesNotExist:
#             return Response(
#                 {"error": "Student not found"}, status=status.HTTP_404_NOT_FOUND
#             )

#         if ExamRegistration.objects.filter(exam=exam, student=student).exists():
#             return Response(
#                 {"error": "Student already registered for this exam"},
#                 status=status.HTTP_400_BAD_REQUEST,
#             )

#         registration = ExamRegistration.objects.create(
#             exam=exam, student=student, registration_date=timezone.now()
#         )

#         serializer = ExamRegistrationSerializer(registration)
#         return Response(serializer.data, status=status.HTTP_201_CREATED)

#     @action(detail=True, methods=["delete"])
#     def unregister_student(self, request, pk=None):
#         """Unregister a student from an exam"""
#         exam = self.get_object()
#         student_id = request.data.get("student_id")

#         try:
#             registration = ExamRegistration.objects.get(
#                 exam=exam, student_id=student_id
#             )
#             registration.delete()
#             return Response({"message": "Student unregistered successfully"})
#         except ExamRegistration.DoesNotExist:
#             return Response(
#                 {"error": "Registration not found"}, status=status.HTTP_404_NOT_FOUND
#             )

#     @action(detail=True, methods=["get"])
#     def registrations(self, request, pk=None):
#         """Get all registrations for an exam"""
#         exam = self.get_object()
#         registrations = ExamRegistration.objects.filter(exam=exam).select_related(
#             "student"
#         )
#         serializer = ExamRegistrationSerializer(registrations, many=True)
#         return Response(serializer.data)

#     @action(detail=True, methods=["get"])
#     def get_registrations(self, request, pk=None):
#         """Get all registrations for an exam (alias for registrations)"""
#         return self.registrations(request, pk)

#     @action(detail=True, methods=["get"])
#     def get_results(self, request, pk=None):
#         """Get results for an exam (alias for results)"""
#         return self.results(request, pk)

#     @action(detail=True, methods=["get"])
#     def get_statistics(self, request, pk=None):
#         """Get statistics for an exam (alias for statistics)"""
#         return self.statistics(request, pk)

#     # Results Management
#     @action(detail=True, methods=["get"])
#     def results(self, request, pk=None):
#         """Get results for an exam"""
#         exam = self.get_object()
#         results = StudentResult.objects.filter(exam=exam).select_related("student")
#         serializer = ResultSerializer(results, many=True)
#         return Response(serializer.data)

#     @action(detail=True, methods=["post"])
#     def bulk_create_results(self, request, pk=None):
#         """Bulk create results for an exam"""
#         exam = self.get_object()
#         results_data = request.data.get("results", [])

#         if not results_data:
#             return Response(
#                 {"error": "Results data is required"},
#                 status=status.HTTP_400_BAD_REQUEST,
#             )

#         created_results = []
#         errors = []

#         with transaction.atomic():
#             for i, result_data in enumerate(results_data):
#                 result_data["exam"] = exam.id
#                 result_data["subject"] = exam.subject.id

#                 serializer = ResultCreateUpdateSerializer(data=result_data)
#                 if serializer.is_valid():
#                     result = serializer.save(recorded_by=request.user)
#                     created_results.append(result.id)
#                 else:
#                     errors.append({"index": i, "errors": serializer.errors})

#             if errors:
#                 transaction.set_rollback(True)
#                 return Response({"errors": errors}, status=status.HTTP_400_BAD_REQUEST)

#         return Response(
#             {
#                 "message": f"Created {len(created_results)} results",
#                 "created_ids": created_results,
#             },
#             status=status.HTTP_201_CREATED,
#         )

#     @action(detail=True, methods=["get"])
#     def statistics(self, request, pk=None):
#         """Get statistics for an exam"""
#         exam = self.get_object()
#         stats, created = ExamStatistics.objects.get_or_create(
#             exam=exam, defaults={"calculated_at": timezone.now()}
#         )

#         if not created and stats.calculated_at < timezone.now() - timedelta(hours=1):
#             self._generate_exam_statistics(exam)
#             stats.refresh_from_db()

#         serializer = ExamStatisticsSerializer(stats)
#         return Response(serializer.data)

#     # Essential Filters
#     @action(detail=False, methods=["get"])
#     def upcoming(self, request):
#         """Get upcoming exams"""
#         today = timezone.now().date()
#         exams = (
#             self.get_queryset()
#             .filter(exam_date__gte=today, status="scheduled")
#             .order_by("exam_date", "start_time")
#         )

#         serializer = self.get_serializer(exams, many=True)
#         return Response(serializer.data)

#     @action(detail=False, methods=["get"])
#     def by_schedule(self, request):
#         """Get exams by schedule"""
#         schedule_id = request.GET.get("schedule_id")
#         if not schedule_id:
#             return Response(
#                 {"error": "Schedule ID is required"}, status=status.HTTP_400_BAD_REQUEST
#             )

#         exams = self.get_queryset().filter(exam_schedule_id=schedule_id)
#         serializer = self.get_serializer(exams, many=True)
#         return Response(serializer.data)

#     @action(detail=False, methods=["get"])
#     def by_teacher(self, request, teacher_id=None):
#         try:
#             teacher = Teacher.objects.get(id=teacher_id)
#         except Teacher.DoesNotExist:
#             return Response(
#                 {"error": "Teacher not found"}, status=status.HTTP_404_NOT_FOUND
#             )

#         exams = self.get_queryset().filter(teacher_id=teacher.id)
#         serializer = self.get_serializer(exams, many=True)
#         return Response(serializer.data)

#     @action(detail=False, methods=["get"])
#     def by_subject(self, request, subject_id=None):
#         """Get exams by subject"""
#         if not subject_id:
#             return Response(
#                 {"error": "Subject ID is required"}, status=status.HTTP_400_BAD_REQUEST
#             )

#         exams = self.get_queryset().filter(subject_id=subject_id)
#         serializer = self.get_serializer(exams, many=True)
#         return Response(serializer.data)

#     @action(detail=False, methods=["get"])
#     def by_grade(self, request, grade_id=None):
#         """Get exams by grade level"""
#         if not grade_id:
#             return Response(
#                 {"error": "Grade ID is required"}, status=status.HTTP_400_BAD_REQUEST
#             )

#         exams = self.get_queryset().filter(grade_level_id=grade_id)
#         serializer = self.get_serializer(exams, many=True)
#         return Response(serializer.data)

#     @action(detail=False, methods=["get"])
#     def completed(self, request):
#         """Get completed exams"""
#         exams = self.get_queryset().filter(status="completed")
#         serializer = self.get_serializer(exams, many=True)
#         return Response(serializer.data)

#     @action(detail=False, methods=["get"])
#     def ongoing(self, request):
#         """Get ongoing exams"""
#         exams = self.get_queryset().filter(status="in_progress")
#         serializer = self.get_serializer(exams, many=True)
#         return Response(serializer.data)

#     @action(detail=False, methods=["get"])
#     def calendar_view(self, request):
#         """Get exams in calendar format"""
#         start_date = request.GET.get("start_date")
#         end_date = request.GET.get("end_date")

#         queryset = self.get_queryset()

#         if start_date:
#             queryset = queryset.filter(exam_date__gte=start_date)
#         if end_date:
#             queryset = queryset.filter(exam_date__lte=end_date)

#         exams = queryset.order_by("exam_date", "start_time")
#         serializer = self.get_serializer(exams, many=True)
#         return Response(serializer.data)

#     @action(detail=False, methods=["get"])
#     def summary_list(self, request):
#         """Get exam summary list"""
#         exams = self.get_queryset().annotate(
#             registered_students_count=Count("examregistration", distinct=True)
#         )
#         serializer = self.get_serializer(exams, many=True)
#         return Response(serializer.data)

#     @action(detail=False, methods=["post"])
#     def bulk_update(self, request):
#         """Bulk update exams"""
#         exam_ids = request.data.get("exam_ids", [])
#         update_data = request.data.get("update_data", {})

#         if not exam_ids:
#             return Response(
#                 {"error": "Exam IDs are required"}, status=status.HTTP_400_BAD_REQUEST
#             )

#         updated_count = 0
#         errors = []

#         with transaction.atomic():
#             for exam_id in exam_ids:
#                 try:
#                     exam = Exam.objects.get(id=exam_id)
#                     for field, value in update_data.items():
#                         if hasattr(exam, field):
#                             setattr(exam, field, value)
#                     exam.save()
#                     updated_count += 1
#                 except Exam.DoesNotExist:
#                     errors.append(f"Exam {exam_id} not found")
#                 except Exception as e:
#                     errors.append(f"Exam {exam_id}: {str(e)}")

#         return Response(
#             {
#                 "message": f"Updated {updated_count} exams",
#                 "updated_count": updated_count,
#                 "errors": errors,
#             }
#         )

#     @action(detail=False, methods=["post"])
#     def bulk_delete(self, request):
#         """Bulk delete exams"""
#         exam_ids = request.data.get("exam_ids", [])

#         if not exam_ids:
#             return Response(
#                 {"error": "Exam IDs are required"}, status=status.HTTP_400_BAD_REQUEST
#             )

#         deleted_count = 0
#         errors = []

#         with transaction.atomic():
#             for exam_id in exam_ids:
#                 try:
#                     exam = Exam.objects.get(id=exam_id)
#                     exam.delete()
#                     deleted_count += 1
#                 except Exam.DoesNotExist:
#                     errors.append(f"Exam {exam_id} not found")
#                 except Exception as e:
#                     errors.append(f"Exam {exam_id}: {str(e)}")

#         return Response(
#             {
#                 "message": f"Deleted {deleted_count} exams",
#                 "deleted_count": deleted_count,
#                 "errors": errors,
#             }
#         )

#     # Import/Export
#     @action(detail=False, methods=["post"])
#     def import_csv(self, request):
#         """Import exams from CSV"""
#         file = request.FILES.get("file")
#         if not file or not file.name.endswith(".csv"):
#             return Response(
#                 {"error": "Valid CSV file is required"},
#                 status=status.HTTP_400_BAD_REQUEST,
#             )

#         try:
#             decoded_file = TextIOWrapper(file.file, encoding="utf-8")
#             reader = csv.DictReader(decoded_file)

#             required_headers = [
#                 "title",
#                 "subject",
#                 "grade_level",
#                 "exam_date",
#                 "start_time",
#                 "end_time",
#             ]
#             missing_headers = [
#                 h for h in required_headers if h not in reader.fieldnames
#             ]

#             if missing_headers:
#                 return Response(
#                     {
#                         "error": f'Missing required columns: {", ".join(missing_headers)}'
#                     },
#                     status=status.HTTP_400_BAD_REQUEST,
#                 )

#             created_exams = []
#             errors = []

#             with transaction.atomic():
#                 for row_num, row in enumerate(reader, start=2):
#                     try:
#                         exam_data = self._process_csv_row(row, row_num)
#                         if "error" in exam_data:
#                             errors.append(exam_data["error"])
#                             continue

#                         serializer = ExamCreateUpdateSerializer(data=exam_data)
#                         if serializer.is_valid():
#                             exam = serializer.save(created_by=request.user)
#                             created_exams.append(exam.id)
#                         else:
#                             errors.append(f"Row {row_num}: {serializer.errors}")

#                     except Exception as e:
#                         errors.append(f"Row {row_num}: {str(e)}")

#                 if errors:
#                     transaction.set_rollback(True)
#                     return Response(
#                         {"error": "CSV import failed", "details": errors},
#                         status=status.HTTP_400_BAD_REQUEST,
#                     )

#             return Response(
#                 {
#                     "message": f"Successfully imported {len(created_exams)} exams",
#                     "created_exam_ids": created_exams,
#                 },
#                 status=status.HTTP_201_CREATED,
#             )

#         except Exception as e:
#             logger.error(f"CSV import error: {str(e)}")
#             return Response(
#                 {"error": f"Import failed: {str(e)}"},
#                 status=status.HTTP_500_INTERNAL_SERVER_ERROR,
#             )
from rest_framework import viewsets, filters, status, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend
from django.http import HttpResponse
from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models import Q, Count, Avg, Max, Min
from django.utils import timezone
from io import TextIOWrapper
import csv
from datetime import datetime, timedelta
from utils.section_filtering import SectionFilterMixin, AutoSectionFilterMixin
from tenants.mixins import TenantFilterMixin
from utils.pagination import LargeResultsPagination, StandardResultsPagination
import logging

# Import models
from .models import (
    Exam,
    ExamSchedule,
    ExamRegistration,
    ExamStatistics,
    QuestionBank,
    ExamTemplate,
    ExamReview,
    ExamReviewer,
    ExamReviewComment,
)
from result.models import StudentResult
from classroom.models import GradeLevel, Section
from subject.models import Subject
from teacher.models import Teacher
from students.models import Student
from django.shortcuts import render, redirect
from django.contrib import messages
from .forms import ExamForm, ExamScheduleForm


# Import serializers
from .serializers import (
    ExamListSerializer,
    ExamDetailSerializer,
    ExamCreateUpdateSerializer,
    ExamScheduleSerializer,
    ExamRegistrationSerializer,
    ResultSerializer,
    ResultCreateUpdateSerializer,
    ExamStatisticsSerializer,
    # EXAM-003 serializers
    QuestionBankListSerializer,
    QuestionBankDetailSerializer,
    QuestionBankCreateUpdateSerializer,
    ExamTemplateListSerializer,
    ExamTemplateDetailSerializer,
    ExamTemplateCreateUpdateSerializer,
    ExamReviewListSerializer,
    ExamReviewDetailSerializer,
    ExamReviewSubmitSerializer,
    ExamReviewDecisionSerializer,
    ExamReviewerSerializer,
    ExamReviewCommentSerializer,
    ExamReviewCommentCreateSerializer,
)

# Import filters
from .filters import ExamFilter

logger = logging.getLogger(__name__)


def create_exam(request):
    if request.method == "POST":
        form = ExamForm(request.POST)
        if form.is_valid():
            exam = form.save()
            messages.success(request, f'Exam "{exam.title}" created successfully!')
            return redirect("exam_list")
    else:
        form = ExamForm()

    return render(request, "exams/exam_form.html", {"form": form})


def create_exam_schedule(request):
    if request.method == "POST":
        form = ExamScheduleForm(request.POST)
        if form.is_valid():
            schedule = form.save()
            messages.success(
                request, f'Exam schedule "{schedule.name}" created successfully!'
            )
            return redirect("exam_schedule_list")
    else:
        form = ExamScheduleForm()

    return render(request, "exams/exam_schedule_form.html", {"form": form})


class ExamViewSet(TenantFilterMixin, AutoSectionFilterMixin, viewsets.ModelViewSet):
    """
    CRITICAL: TenantFilterMixin MUST be first to ensure tenant isolation.
    Streamlined ViewSet for managing exams with section-based filtering
    """

    queryset = Exam.objects.select_related(
        "subject", "grade_level", "section", "teacher"
    ).prefetch_related("invigilators")

    filter_backends = [
        DjangoFilterBackend,
        filters.SearchFilter,
        filters.OrderingFilter,
    ]
    filterset_class = ExamFilter
    search_fields = ["title", "description", "code", "subject__name", "venue"]
    ordering_fields = ["exam_date", "start_time", "title", "created_at"]
    ordering = ["-exam_date", "start_time"]
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = StandardResultsPagination  # PERFORMANCE: Paginate exams

    def get_serializer_class(self):
        """Return appropriate serializer based on action"""
        if self.action == "list":
            return ExamListSerializer
        elif self.action in ["create", "update", "partial_update"]:
            return ExamCreateUpdateSerializer
        return ExamDetailSerializer

    def _get_section_education_levels(self, user_or_section):
        """
        Universal helper method to get education levels
        """
        SECTION_TO_EDUCATION_LEVEL = {
            "nursery": ["NURSERY"],
            "primary": ["PRIMARY"],
            "junior_secondary": ["JUNIOR_SECONDARY"],
            "senior_secondary": ["SENIOR_SECONDARY"],
            "secondary": ["JUNIOR_SECONDARY", "SENIOR_SECONDARY"],
        }

        ROLE_TO_SECTION = {
            "nursery_admin": "nursery",
            "primary_admin": "primary",
            "junior_secondary_admin": "junior_secondary",
            "senior_secondary_admin": "senior_secondary",
            "secondary_admin": "secondary",
        }

        # User object
        if hasattr(user_or_section, "section") and hasattr(user_or_section, "role"):
            user_section = user_or_section.section
            if not user_section and user_or_section.role in ROLE_TO_SECTION:
                user_section = ROLE_TO_SECTION[user_or_section.role]
            return SECTION_TO_EDUCATION_LEVEL.get(user_section, [])

        # Section model instance OR string containing section/classroom name
        section_name = None
        if hasattr(user_or_section, "name"):
            section_name = str(user_or_section.name).lower()
        else:
            section_name = str(user_or_section).lower()

        # First try the exact match in our mapping
        if section_name in SECTION_TO_EDUCATION_LEVEL:
            return SECTION_TO_EDUCATION_LEVEL[section_name]

        # If not an exact match, parse the name to detect education level
        # Handle names like "Primary 1 - Section A", "Nursery 2 - Section B", etc.
        if (
            "nursery" in section_name
            or "pre-nursery" in section_name
            or "pre nursery" in section_name
        ):
            return ["NURSERY"]
        elif "primary" in section_name:
            return ["PRIMARY"]
        elif (
            "jss" in section_name
            or "junior secondary" in section_name
            or "js" in section_name
        ):
            return ["JUNIOR_SECONDARY"]
        elif (
            "sss" in section_name
            or "senior secondary" in section_name
            or "ss" in section_name
        ):
            return ["SENIOR_SECONDARY"]

        # Last resort: log and return empty list
        logger.warning(
            f"Could not determine education level for section: {section_name}"
        )
        return []

    def get_queryset(self):
        """Apply section filtering"""
        queryset = super().get_queryset()
        user = self.request.user

        if not user.is_authenticated:
            return queryset.none()

        # Super admin sees everything
        if user.is_superuser:
            logger.info(f"✅ Superuser {user.username} - Full access to all exams")
            return queryset

        # Get user role
        role = (
            self.get_user_role()
            if hasattr(self, "get_user_role")
            else getattr(user, "role", None)
        )

        logger.info(f"📋 User {user.username} has role: {role}")

        # Admin/Principal sees everything
        if role in ["admin", "superadmin", "principal"]:
            logger.info(f"✅ Admin {user.username} - Full access to all exams")
            return queryset

        # Section admin filtering - FIXED
        if role in [
            "nursery_admin",
            "primary_admin",
            "junior_secondary_admin",
            "senior_secondary_admin",
            "secondary_admin",
        ]:
            education_levels = self._get_section_education_levels(user)
            logger.info(
                f"🔒 Section admin '{role}' - restricted to: {education_levels}"
            )

            if not education_levels:
                logger.warning(f"❌ No education levels for {user.username}")
                return queryset.none()

            filtered = queryset.filter(
                grade_level__education_level__in=education_levels
            )
            logger.info(f"✅ Filtered Exams: {filtered.count()} of {queryset.count()}")
            return filtered

        # Teacher filtering
        if role == "teacher" or hasattr(user, "teacher"):
            try:
                from teacher.models import Teacher

                teacher = Teacher.objects.get(user=user)
                filtered = queryset.filter(teacher_id=teacher.id)
                logger.info(f"✅ Teacher can see {filtered.count()} exams")
                return filtered
            except Teacher.DoesNotExist:
                logger.warning(f"❌ Teacher object not found for {user.username}")
                return queryset.none()

        # Staff access (general staff without specific role)
        if user.is_staff:
            logger.info(f"✅ Staff {user.username} - Full access")
            return queryset

        # Student/Parent filtering
        if hasattr(self, "get_user_section_access"):
            section_access = self.get_user_section_access()
            education_levels = []
            for section in section_access:
                education_levels.extend(self._get_section_education_levels(section))
            education_levels = list(set(education_levels))

            if not education_levels:
                logger.warning(f"❌ No education level access for {user.username}")
                return queryset.none()

            filtered = queryset.filter(
                grade_level__education_level__in=education_levels
            )
            logger.info(f"✅ Student/Parent can see {filtered.count()} exams")
            return filtered

        # Default: no access
        logger.warning(f"❌ No access rules matched for {user.username}")
        return queryset.none()

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    def perform_update(self, serializer):
        serializer.save(updated_by=self.request.user)

    @action(detail=False, methods=["post"])
    def bulk_create(self, request):
        """Bulk create results"""
        results_data = request.data.get("results", [])

        if not results_data:
            return Response(
                {"error": "Results data is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        created_results = []
        errors = []

        with transaction.atomic():
            for i, result_data in enumerate(results_data):
                serializer = ResultCreateUpdateSerializer(data=result_data)
                if serializer.is_valid():
                    result = serializer.save(recorded_by=request.user)
                    created_results.append(result.id)
                else:
                    errors.append({"index": i, "errors": serializer.errors})

            if errors:
                transaction.set_rollback(True)
                return Response({"errors": errors}, status=status.HTTP_400_BAD_REQUEST)

        return Response(
            {
                "message": f"Created {len(created_results)} results",
                "created_ids": created_results,
            },
            status=status.HTTP_201_CREATED,
        )

    @action(detail=False, methods=["post"])
    def bulk_update(self, request):
        """Bulk update results"""
        results_data = request.data.get("results", [])

        if not results_data:
            return Response(
                {"error": "Results data is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        updated_count = 0
        errors = []

        with transaction.atomic():
            for i, result_data in enumerate(results_data):
                result_id = result_data.get("id")
                if not result_id:
                    errors.append({"index": i, "error": "Result ID is required"})
                    continue

                try:
                    result = StudentResult.objects.get(id=result_id)
                    serializer = ResultCreateUpdateSerializer(
                        result, data=result_data, partial=True
                    )
                    if serializer.is_valid():
                        serializer.save(updated_by=request.user)
                        updated_count += 1
                    else:
                        errors.append({"index": i, "errors": serializer.errors})
                except StudentResult.DoesNotExist:
                    errors.append(
                        {"index": i, "error": f"Result {result_id} not found"}
                    )
                except Exception as e:
                    errors.append({"index": i, "error": str(e)})

            if errors:
                transaction.set_rollback(True)
                return Response({"errors": errors}, status=status.HTTP_400_BAD_REQUEST)

        return Response(
            {
                "message": f"Updated {updated_count} results",
                "updated_count": updated_count,
            }
        )

    @action(detail=False, methods=["get"])
    def by_student(self, request, student_id=None):
        """Get results by student"""
        if not student_id:
            return Response(
                {"error": "Student ID is required"}, status=status.HTTP_400_BAD_REQUEST
            )

        results = self.get_queryset().filter(student_id=student_id)
        serializer = self.get_serializer(results, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=["get"])
    def by_exam(self, request, exam_id=None):
        """Get results by exam"""
        if not exam_id:
            return Response(
                {"error": "Exam ID is required"}, status=status.HTTP_400_BAD_REQUEST
            )

        results = self.get_queryset().filter(exam_id=exam_id)
        serializer = self.get_serializer(results, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=["get"])
    def by_subject(self, request, subject_id=None):
        """Get results by subject"""
        if not subject_id:
            return Response(
                {"error": "Subject ID is required"}, status=status.HTTP_400_BAD_REQUEST
            )

        results = self.get_queryset().filter(subject_id=subject_id)
        serializer = self.get_serializer(results, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=["get"])
    def by_grade(self, request, grade_id=None):
        """Get results by grade level"""
        if not grade_id:
            return Response(
                {"error": "Grade ID is required"}, status=status.HTTP_400_BAD_REQUEST
            )

        results = self.get_queryset().filter(grade_level_id=grade_id)
        serializer = self.get_serializer(results, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=["get"])
    def student_transcript(self, request, student_id=None):
        """Get student transcript"""
        if not student_id:
            return Response(
                {"error": "Student ID is required"}, status=status.HTTP_400_BAD_REQUEST
            )

        results = (
            self.get_queryset()
            .filter(student_id=student_id)
            .order_by("exam__exam_date")
        )
        serializer = self.get_serializer(results, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=["get"])
    def grade_sheet(self, request, exam_id=None):
        """Get grade sheet for an exam"""
        if not exam_id:
            return Response(
                {"error": "Exam ID is required"}, status=status.HTTP_400_BAD_REQUEST
            )

        results = (
            self.get_queryset()
            .filter(exam_id=exam_id)
            .order_by("student__user__first_name")
        )
        serializer = self.get_serializer(results, many=True)
        return Response(serializer.data)

    # Core Exam Management
    @action(detail=True, methods=["post"])
    def start_exam(self, request, pk=None):
        """Start an exam"""
        exam = self.get_object()

        if exam.status != "scheduled":
            return Response(
                {"error": "Only scheduled exams can be started"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        exam.status = "in_progress"
        exam.save()
        return Response({"message": "Exam started successfully"})

    @action(detail=True, methods=["post"])
    def end_exam(self, request, pk=None):
        """End an exam and generate statistics"""
        exam = self.get_object()

        if exam.status != "in_progress":
            return Response(
                {"error": "Only exams in progress can be ended"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        exam.status = "completed"
        exam.save()

        # Generate statistics
        self._generate_exam_statistics(exam)
        return Response({"message": "Exam ended successfully"})

    @action(detail=True, methods=["post"])
    def cancel_exam(self, request, pk=None):
        """Cancel an exam"""
        exam = self.get_object()

        if exam.status == "completed":
            return Response(
                {"error": "Cannot cancel completed exam"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        exam.status = "cancelled"
        exam.cancellation_reason = request.data.get("reason", "")
        exam.save()
        return Response({"message": "Exam cancelled successfully"})

    @action(detail=True, methods=["post"])
    def postpone_exam(self, request, pk=None):
        """Postpone an exam"""
        exam = self.get_object()
        new_date = request.data.get("new_date")
        new_start_time = request.data.get("new_start_time")
        new_end_time = request.data.get("new_end_time")
        reason = request.data.get("reason", "")

        if not new_date:
            return Response(
                {"error": "New date is required"}, status=status.HTTP_400_BAD_REQUEST
            )

        if exam.status == "completed":
            return Response(
                {"error": "Cannot postpone completed exam"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        exam.exam_date = new_date
        if new_start_time:
            exam.start_time = new_start_time
        if new_end_time:
            exam.end_time = new_end_time

        exam.postponement_reason = reason
        exam.save()

        return Response({"message": "Exam postponed successfully"})

    # Approval Workflow
    @action(detail=True, methods=["post"])
    def approve(self, request, pk=None):
        """Approve an exam"""
        exam = self.get_object()

        if exam.status != "pending_approval":
            return Response(
                {"error": "Only exams pending approval can be approved"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        approver = None
        if hasattr(request, "user") and request.user.is_authenticated:
            try:
                from teacher.models import Teacher

                approver = Teacher.objects.get(user=request.user)
            except Teacher.DoesNotExist:
                pass

        notes = request.data.get("notes", "")
        exam.approve(approver, notes)

        return Response(
            {
                "message": "Exam approved successfully",
                "status": exam.status,
                "approved_at": exam.approved_at,
                "approved_by": exam.approved_by.id if exam.approved_by else None,
            }
        )

    @action(detail=True, methods=["post"])
    def reject(self, request, pk=None):
        """Reject an exam"""
        exam = self.get_object()

        if exam.status != "pending_approval":
            return Response(
                {"error": "Only exams pending approval can be rejected"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        approver = None
        if hasattr(request, "user") and request.user.is_authenticated:
            try:
                from teacher.models import Teacher

                approver = Teacher.objects.get(user=request.user)
            except Teacher.DoesNotExist:
                pass

        reason = request.data.get("reason", "")
        exam.reject(approver, reason)

        return Response(
            {
                "message": "Exam rejected successfully",
                "status": exam.status,
                "rejected_at": exam.approved_at,
                "rejected_by": exam.approved_by.id if exam.approved_by else None,
                "rejection_reason": exam.rejection_reason,
            }
        )

    @action(detail=True, methods=["post"])
    def submit_for_approval(self, request, pk=None):
        """Submit exam for approval"""
        exam = self.get_object()

        if exam.status not in ["draft", "rejected"]:
            return Response(
                {"error": "Only draft or rejected exams can be submitted for approval"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        exam.submit_for_approval()

        return Response(
            {
                "message": "Exam submitted for approval successfully",
                "status": exam.status,
            }
        )

    # Student Registration
    @action(detail=True, methods=["post"])
    def register_student(self, request, pk=None):
        """Register a student for an exam"""
        exam = self.get_object()
        student_id = request.data.get("student_id")

        if not student_id:
            return Response(
                {"error": "Student ID is required"}, status=status.HTTP_400_BAD_REQUEST
            )

        try:
            student = Student.objects.get(id=student_id)
        except Student.DoesNotExist:
            return Response(
                {"error": "Student not found"}, status=status.HTTP_404_NOT_FOUND
            )

        if ExamRegistration.objects.filter(exam=exam, student=student).exists():
            return Response(
                {"error": "Student already registered for this exam"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        registration = ExamRegistration.objects.create(
            exam=exam, student=student, registration_date=timezone.now()
        )

        serializer = ExamRegistrationSerializer(registration)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["delete"])
    def unregister_student(self, request, pk=None):
        """Unregister a student from an exam"""
        exam = self.get_object()
        student_id = request.data.get("student_id")

        try:
            registration = ExamRegistration.objects.get(
                exam=exam, student_id=student_id
            )
            registration.delete()
            return Response({"message": "Student unregistered successfully"})
        except ExamRegistration.DoesNotExist:
            return Response(
                {"error": "Registration not found"}, status=status.HTTP_404_NOT_FOUND
            )

    @action(detail=True, methods=["get"])
    def registrations(self, request, pk=None):
        """Get all registrations for an exam"""
        exam = self.get_object()
        registrations = ExamRegistration.objects.filter(exam=exam).select_related(
            "student"
        )
        serializer = ExamRegistrationSerializer(registrations, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=["get"])
    def get_registrations(self, request, pk=None):
        """Get all registrations for an exam (alias for registrations)"""
        return self.registrations(request, pk)

    @action(detail=True, methods=["get"])
    def get_results(self, request, pk=None):
        """Get results for an exam (alias for results)"""
        return self.results(request, pk)

    @action(detail=True, methods=["get"])
    def get_statistics(self, request, pk=None):
        """Get statistics for an exam (alias for statistics)"""
        return self.statistics(request, pk)

    # Results Management
    @action(detail=True, methods=["get"])
    def results(self, request, pk=None):
        """Get results for an exam"""
        exam = self.get_object()
        results = StudentResult.objects.filter(exam=exam).select_related("student")
        serializer = ResultSerializer(results, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=["post"])
    def bulk_create_results(self, request, pk=None):
        """Bulk create results for an exam"""
        exam = self.get_object()
        results_data = request.data.get("results", [])

        if not results_data:
            return Response(
                {"error": "Results data is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        created_results = []
        errors = []

        with transaction.atomic():
            for i, result_data in enumerate(results_data):
                result_data["exam"] = exam.id
                result_data["subject"] = exam.subject.id

                serializer = ResultCreateUpdateSerializer(data=result_data)
                if serializer.is_valid():
                    result = serializer.save(recorded_by=request.user)
                    created_results.append(result.id)
                else:
                    errors.append({"index": i, "errors": serializer.errors})

            if errors:
                transaction.set_rollback(True)
                return Response({"errors": errors}, status=status.HTTP_400_BAD_REQUEST)

        return Response(
            {
                "message": f"Created {len(created_results)} results",
                "created_ids": created_results,
            },
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=["get"])
    def statistics(self, request, pk=None):
        """Get statistics for an exam"""
        exam = self.get_object()
        stats, created = ExamStatistics.objects.get_or_create(
            exam=exam, defaults={"calculated_at": timezone.now()}
        )

        if not created and stats.calculated_at < timezone.now() - timedelta(hours=1):
            self._generate_exam_statistics(exam)
            stats.refresh_from_db()

        serializer = ExamStatisticsSerializer(stats)
        return Response(serializer.data)

    # Essential Filters
    @action(detail=False, methods=["get"])
    def upcoming(self, request):
        """Get upcoming exams"""
        today = timezone.now().date()
        exams = (
            self.get_queryset()
            .filter(exam_date__gte=today, status="scheduled")
            .order_by("exam_date", "start_time")
        )

        serializer = self.get_serializer(exams, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=["get"])
    def by_schedule(self, request):
        """Get exams by schedule"""
        schedule_id = request.GET.get("schedule_id")
        if not schedule_id:
            return Response(
                {"error": "Schedule ID is required"}, status=status.HTTP_400_BAD_REQUEST
            )

        exams = self.get_queryset().filter(exam_schedule_id=schedule_id)
        serializer = self.get_serializer(exams, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=["get"])
    def by_teacher(self, request, teacher_id=None):
        try:
            teacher = Teacher.objects.get(id=teacher_id)
        except Teacher.DoesNotExist:
            return Response(
                {"error": "Teacher not found"}, status=status.HTTP_404_NOT_FOUND
            )

        exams = self.get_queryset().filter(teacher_id=teacher.id)
        serializer = self.get_serializer(exams, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=["get"])
    def by_subject(self, request, subject_id=None):
        """Get exams by subject"""
        if not subject_id:
            return Response(
                {"error": "Subject ID is required"}, status=status.HTTP_400_BAD_REQUEST
            )

        exams = self.get_queryset().filter(subject_id=subject_id)
        serializer = self.get_serializer(exams, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=["get"])
    def by_grade(self, request, grade_id=None):
        """Get exams by grade level"""
        if not grade_id:
            return Response(
                {"error": "Grade ID is required"}, status=status.HTTP_400_BAD_REQUEST
            )

        exams = self.get_queryset().filter(grade_level_id=grade_id)
        serializer = self.get_serializer(exams, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=["get"])
    def completed(self, request):
        """Get completed exams"""
        exams = self.get_queryset().filter(status="completed")
        serializer = self.get_serializer(exams, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=["get"])
    def ongoing(self, request):
        """Get ongoing exams"""
        exams = self.get_queryset().filter(status="in_progress")
        serializer = self.get_serializer(exams, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=["get"])
    def calendar_view(self, request):
        """Get exams in calendar format"""
        start_date = request.GET.get("start_date")
        end_date = request.GET.get("end_date")

        queryset = self.get_queryset()

        if start_date:
            queryset = queryset.filter(exam_date__gte=start_date)
        if end_date:
            queryset = queryset.filter(exam_date__lte=end_date)

        exams = queryset.order_by("exam_date", "start_time")
        serializer = self.get_serializer(exams, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=["get"])
    def summary_list(self, request):
        """Get exam summary list"""
        exams = self.get_queryset().annotate(
            registered_students_count=Count("examregistration", distinct=True)
        )
        serializer = self.get_serializer(exams, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=["post"])
    def bulk_update(self, request):
        """Bulk update exams"""
        exam_ids = request.data.get("exam_ids", [])
        update_data = request.data.get("update_data", {})

        if not exam_ids:
            return Response(
                {"error": "Exam IDs are required"}, status=status.HTTP_400_BAD_REQUEST
            )

        updated_count = 0
        errors = []

        with transaction.atomic():
            for exam_id in exam_ids:
                try:
                    exam = Exam.objects.get(id=exam_id)
                    for field, value in update_data.items():
                        if hasattr(exam, field):
                            setattr(exam, field, value)
                    exam.save()
                    updated_count += 1
                except Exam.DoesNotExist:
                    errors.append(f"Exam {exam_id} not found")
                except Exception as e:
                    errors.append(f"Exam {exam_id}: {str(e)}")

        return Response(
            {
                "message": f"Updated {updated_count} exams",
                "updated_count": updated_count,
                "errors": errors,
            }
        )

    @action(detail=False, methods=["post"])
    def bulk_delete(self, request):
        """Bulk delete exams"""
        exam_ids = request.data.get("exam_ids", [])

        if not exam_ids:
            return Response(
                {"error": "Exam IDs are required"}, status=status.HTTP_400_BAD_REQUEST
            )

        deleted_count = 0
        errors = []

        with transaction.atomic():
            for exam_id in exam_ids:
                try:
                    exam = Exam.objects.get(id=exam_id)
                    exam.delete()
                    deleted_count += 1
                except Exam.DoesNotExist:
                    errors.append(f"Exam {exam_id} not found")
                except Exception as e:
                    errors.append(f"Exam {exam_id}: {str(e)}")

        return Response(
            {
                "message": f"Deleted {deleted_count} exams",
                "deleted_count": deleted_count,
                "errors": errors,
            }
        )

    # Import/Export
    @action(detail=False, methods=["post"])
    def import_csv(self, request):
        """Import exams from CSV"""
        file = request.FILES.get("file")
        if not file or not file.name.endswith(".csv"):
            return Response(
                {"error": "Valid CSV file is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            decoded_file = TextIOWrapper(file.file, encoding="utf-8")
            reader = csv.DictReader(decoded_file)

            required_headers = [
                "title",
                "subject",
                "grade_level",
                "exam_date",
                "start_time",
                "end_time",
            ]
            missing_headers = [
                h for h in required_headers if h not in reader.fieldnames
            ]

            if missing_headers:
                return Response(
                    {
                        "error": f'Missing required columns: {", ".join(missing_headers)}'
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            created_exams = []
            errors = []

            with transaction.atomic():
                for row_num, row in enumerate(reader, start=2):
                    try:
                        exam_data = self._process_csv_row(row, row_num)
                        if "error" in exam_data:
                            errors.append(exam_data["error"])
                            continue

                        serializer = ExamCreateUpdateSerializer(data=exam_data)
                        if serializer.is_valid():
                            exam = serializer.save(created_by=request.user)
                            created_exams.append(exam.id)
                        else:
                            errors.append(f"Row {row_num}: {serializer.errors}")

                    except Exception as e:
                        errors.append(f"Row {row_num}: {str(e)}")

                if errors:
                    transaction.set_rollback(True)
                    return Response(
                        {"error": "CSV import failed", "details": errors},
                        status=status.HTTP_400_BAD_REQUEST,
                    )

            return Response(
                {
                    "message": f"Successfully imported {len(created_exams)} exams",
                    "created_exam_ids": created_exams,
                },
                status=status.HTTP_201_CREATED,
            )

        except Exception as e:
            logger.error(f"CSV import error: {str(e)}")
            return Response(
                {"error": f"Import failed: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    @action(detail=False, methods=["get"])
    def export_csv(self, request):
        """Export exams to CSV"""
        response = HttpResponse(content_type="text/csv")
        response["Content-Disposition"] = 'attachment; filename="exams.csv"'

        writer = csv.writer(response)
        writer.writerow(
            [
                "id",
                "title",
                "code",
                "subject_name",
                "grade_level_name",
                "section_name",
                "teacher_name",
                "exam_date",
                "start_time",
                "end_time",
                "duration_minutes",
                "total_marks",
                "pass_marks",
                "venue",
                "status",
                "exam_type",
            ]
        )

        for exam in self.filter_queryset(self.get_queryset()).select_related(
            "subject", "grade_level", "section", "teacher"
        ):
            writer.writerow(
                [
                    exam.id,
                    exam.title,
                    exam.code,
                    exam.subject.name,
                    exam.grade_level.name,
                    exam.section.name if exam.section else "",
                    exam.teacher.full_name if exam.teacher else "",
                    exam.exam_date.strftime("%Y-%m-%d"),
                    exam.start_time.strftime("%H:%M"),
                    exam.end_time.strftime("%H:%M"),
                    exam.duration_minutes,
                    exam.total_marks,
                    exam.pass_marks,
                    exam.venue,
                    exam.status,
                    exam.exam_type,
                ]
            )

        return response

    # Helper Methods
    def _process_csv_row(self, row, row_num):
        """Process a single CSV row"""
        try:
            subject = Subject.objects.get(name=row["subject"].strip())
            grade_level = GradeLevel.objects.get(name=row["grade_level"].strip())

            section = None
            if row.get("section") and row["section"].strip():
                section = Section.objects.get(name=row["section"].strip())

            teacher = None
            if row.get("teacher") and row["teacher"].strip():
                teacher = Teacher.objects.get(full_name=row["teacher"].strip())

            exam_date = datetime.strptime(row["exam_date"], "%Y-%m-%d").date()
            start_time = datetime.strptime(row["start_time"], "%H:%M").time()
            end_time = datetime.strptime(row["end_time"], "%H:%M").time()

            return {
                "title": row["title"].strip(),
                "subject": subject.id,
                "grade_level": grade_level.id,
                "section": section.id if section else None,
                "teacher": teacher.id if teacher else None,
                "exam_date": exam_date,
                "start_time": start_time,
                "end_time": end_time,
                "description": row.get("description", "").strip(),
                "total_marks": int(row.get("total_marks", 100)),
                "pass_marks": int(row.get("pass_marks", 40)),
                "venue": row.get("venue", "").strip(),
                "exam_type": row.get("exam_type", "written"),
                "status": row.get("status", "scheduled"),
            }
        except Exception as e:
            return {"error": f"Row {row_num}: {str(e)}"}

    def _generate_exam_statistics(self, exam):
        """Generate statistics for an exam"""
        results = StudentResult.objects.filter(exam=exam)

        if not results.exists():
            return

        total_registered = ExamRegistration.objects.filter(exam=exam).count()
        total_appeared = results.count()

        stats_data = {
            "total_registered": total_registered,
            "total_appeared": total_appeared,
            "total_absent": total_registered - total_appeared,
            "highest_score": results.aggregate(Max("score"))["score__max"] or 0,
            "lowest_score": results.aggregate(Min("score"))["score__min"] or 0,
            "average_score": results.aggregate(Avg("score"))["score__avg"] or 0,
            "total_passed": results.filter(is_pass=True).count(),
            "total_failed": results.filter(is_pass=False).count(),
        }

        stats_data["pass_percentage"] = (
            (stats_data["total_passed"] / stats_data["total_appeared"] * 100)
            if stats_data["total_appeared"] > 0
            else 0
        )

        ExamStatistics.objects.update_or_create(
            exam=exam, defaults={**stats_data, "calculated_at": timezone.now()}
        )


class ExamScheduleViewSet(TenantFilterMixin, viewsets.ModelViewSet):
    """
    CRITICAL: TenantFilterMixin ensures tenant isolation.
    ViewSet for exam schedules
    """

    queryset = ExamSchedule.objects.all()
    serializer_class = ExamScheduleSerializer
    ordering = ["-created_at"]
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = StandardResultsPagination  # PERFORMANCE: Paginate schedules

    def get_queryset(self):
        """Apply section filtering"""
        queryset = super().get_queryset()
        user = self.request.user

        if not user.is_authenticated:
            return queryset.none()

        # Super admin sees everything
        if user.is_superuser:
            logger.info(f"✅ Superuser {user.username} - Full access to all exams")
            return queryset

        # Get user role
        role = (
            self.get_user_role()
            if hasattr(self, "get_user_role")
            else getattr(user, "role", None)
        )

        logger.info(f"📋 User {user.username} has role: {role}")

        # Admin/Principal sees everything
        if role in ["admin", "superadmin", "principal"]:
            logger.info(f"✅ Admin {user.username} - Full access to all exams")
            return queryset

        # Section admin filtering - FIXED
        if role in [
            "nursery_admin",
            "primary_admin",
            "junior_secondary_admin",
            "senior_secondary_admin",
            "secondary_admin",
        ]:
            education_levels = self._get_section_education_levels(user)
            logger.info(
                f"🔒 Section admin '{role}' - restricted to: {education_levels}"
            )

            if not education_levels:
                logger.warning(f"❌ No education levels for {user.username}")
                return queryset.none()

            filtered = queryset.filter(
                grade_level__education_level__in=education_levels
            )
            logger.info(f"✅ Filtered Exams: {filtered.count()} of {queryset.count()}")
            return filtered

        # Teacher filtering
        if role == "teacher" or hasattr(user, "teacher"):
            try:
                from teacher.models import Teacher

                teacher = Teacher.objects.get(user=user)
                filtered = queryset.filter(teacher_id=teacher.id)
                logger.info(f"✅ Teacher can see {filtered.count()} exams")
                return filtered
            except Teacher.DoesNotExist:
                logger.warning(f"❌ Teacher object not found for {user.username}")
                return queryset.none()

        # Staff access (general staff without specific role)
        if user.is_staff:
            logger.info(f"✅ Staff {user.username} - Full access")
            return queryset

        # Student/Parent filtering
        if hasattr(self, "get_user_section_access"):
            section_access = self.get_user_section_access()
            education_levels = []
            for section in section_access:
                education_levels.extend(self._get_section_education_levels(section))
            education_levels = list(set(education_levels))

            if not education_levels:
                logger.warning(f"❌ No education level access for {user.username}")
                return queryset.none()

            filtered = queryset.filter(
                grade_level__education_level__in=education_levels
            )
            logger.info(f"✅ Student/Parent can see {filtered.count()} exams")
            return filtered

        # Default: no access
        logger.warning(f"❌ No access rules matched for {user.username}")
        return queryset.none()

    @action(detail=True, methods=["get"])
    def exams(self, request, pk=None):
        """Get exams for a schedule"""
        schedule = self.get_object()
        exams = Exam.objects.filter(exam_schedule=schedule)
        from .serializers import ExamListSerializer

        serializer = ExamListSerializer(exams, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=["get"])
    def get_exams(self, request, pk=None):
        """Get exams for a schedule (alias for exams)"""
        return self.exams(request, pk)

    @action(detail=True, methods=["post"])
    def set_default(self, request, pk=None):
        """Set a schedule as the default schedule"""
        schedule = self.get_object()

        ExamSchedule.objects.exclude(pk=schedule.pk).update(is_default=False)

        schedule.is_default = True
        schedule.save()

        serializer = self.get_serializer(schedule)
        return Response(
            {
                "message": "Default schedule updated successfully",
                "schedule": serializer.data,
            }
        )

    @action(detail=True, methods=["post"])
    def toggle_active(self, request, pk=None):
        """Toggle schedule active status"""
        schedule = self.get_object()
        schedule.is_active = not schedule.is_active
        schedule.save()

        status_text = "activated" if schedule.is_active else "deactivated"
        return Response(
            {"message": f"Schedule {status_text}", "is_active": schedule.is_active}
        )


class ExamRegistrationViewSet(TenantFilterMixin, AutoSectionFilterMixin, viewsets.ModelViewSet):
    """
    CRITICAL: TenantFilterMixin MUST be first to ensure tenant isolation.
    ViewSet for exam registrations with section filtering
    """

    queryset = ExamRegistration.objects.select_related("exam", "student")
    serializer_class = ExamRegistrationSerializer
    ordering = ["-registration_date"]
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = LargeResultsPagination  # PERFORMANCE: Paginate large registrations

    def _get_section_education_levels(self, user_or_section):
        """
        Universal helper method to get education levels
        """
        SECTION_TO_EDUCATION_LEVEL = {
            "nursery": ["NURSERY"],
            "primary": ["PRIMARY"],
            "junior_secondary": ["JUNIOR_SECONDARY"],
            "senior_secondary": ["SENIOR_SECONDARY"],
            "secondary": ["JUNIOR_SECONDARY", "SENIOR_SECONDARY"],
        }

        ROLE_TO_SECTION = {
            "nursery_admin": "nursery",
            "primary_admin": "primary",
            "junior_secondary_admin": "junior_secondary",
            "senior_secondary_admin": "senior_secondary",
            "secondary_admin": "secondary",
        }

        # User object
        if hasattr(user_or_section, "section") and hasattr(user_or_section, "role"):
            user_section = user_or_section.section
            if not user_section and user_or_section.role in ROLE_TO_SECTION:
                user_section = ROLE_TO_SECTION[user_or_section.role]
            return SECTION_TO_EDUCATION_LEVEL.get(user_section, [])

        # Section model instance OR string containing section/classroom name
        section_name = None
        if hasattr(user_or_section, "name"):
            section_name = str(user_or_section.name).lower()
        else:
            section_name = str(user_or_section).lower()

        # First try the exact match in our mapping
        if section_name in SECTION_TO_EDUCATION_LEVEL:
            return SECTION_TO_EDUCATION_LEVEL[section_name]

        # If not an exact match, parse the name to detect education level
        # Handle names like "Primary 1 - Section A", "Nursery 2 - Section B", etc.
        if (
            "nursery" in section_name
            or "pre-nursery" in section_name
            or "pre nursery" in section_name
        ):
            return ["NURSERY"]
        elif "primary" in section_name:
            return ["PRIMARY"]
        elif (
            "jss" in section_name
            or "junior secondary" in section_name
            or "js" in section_name
        ):
            return ["JUNIOR_SECONDARY"]
        elif (
            "sss" in section_name
            or "senior secondary" in section_name
            or "ss" in section_name
        ):
            return ["SENIOR_SECONDARY"]

        # Last resort: log and return empty list
        logger.warning(
            f"Could not determine education level for section: {section_name}"
        )
        return []

    def get_queryset(self):
        """Apply section filtering"""
        queryset = super().get_queryset()
        user = self.request.user

        if not user.is_authenticated:
            return queryset.none()

        # Super admin sees everything
        if user.is_superuser:
            logger.info(f"✅ Superuser {user.username} - Full access to all exams")
            return queryset

        # Get user role
        role = (
            self.get_user_role()
            if hasattr(self, "get_user_role")
            else getattr(user, "role", None)
        )

        logger.info(f"📋 User {user.username} has role: {role}")

        # Admin/Principal sees everything
        if role in ["admin", "superadmin", "principal"]:
            logger.info(f"✅ Admin {user.username} - Full access to all exams")
            return queryset

        # Section admin filtering - FIXED
        if role in [
            "nursery_admin",
            "primary_admin",
            "junior_secondary_admin",
            "senior_secondary_admin",
            "secondary_admin",
        ]:
            education_levels = self._get_section_education_levels(user)
            logger.info(
                f"🔒 Section admin '{role}' - restricted to: {education_levels}"
            )

            if not education_levels:
                logger.warning(f"❌ No education levels for {user.username}")
                return queryset.none()

            filtered = queryset.filter(
                grade_level__education_level__in=education_levels
            )
            logger.info(f"✅ Filtered Exams: {filtered.count()} of {queryset.count()}")
            return filtered

        # Teacher filtering
        if role == "teacher" or hasattr(user, "teacher"):
            try:
                from teacher.models import Teacher

                teacher = Teacher.objects.get(user=user)
                filtered = queryset.filter(teacher_id=teacher.id)
                logger.info(f"✅ Teacher can see {filtered.count()} exams")
                return filtered
            except Teacher.DoesNotExist:
                logger.warning(f"❌ Teacher object not found for {user.username}")
                return queryset.none()

        # Staff access (general staff without specific role)
        if user.is_staff:
            logger.info(f"✅ Staff {user.username} - Full access")
            return queryset

        # Student/Parent filtering
        if hasattr(self, "get_user_section_access"):
            section_access = self.get_user_section_access()
            education_levels = []
            for section in section_access:
                education_levels.extend(self._get_section_education_levels(section))
            education_levels = list(set(education_levels))

            if not education_levels:
                logger.warning(f"❌ No education level access for {user.username}")
                return queryset.none()

            filtered = queryset.filter(
                grade_level__education_level__in=education_levels
            )
            logger.info(f"✅ Student/Parent can see {filtered.count()} exams")
            return filtered

        # Default: no access
        logger.warning(f"❌ No access rules matched for {user.username}")
        return queryset.none()

    @action(detail=False, methods=["post"])
    def bulk_register(self, request):
        """Bulk register students for an exam"""
        exam_id = request.data.get("exam_id")
        student_ids = request.data.get("student_ids", [])

        if not exam_id or not student_ids:
            return Response(
                {"error": "Exam ID and student IDs are required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            exam = Exam.objects.get(id=exam_id)
        except Exam.DoesNotExist:
            return Response(
                {"error": "Exam not found"}, status=status.HTTP_404_NOT_FOUND
            )

        created_registrations = []
        errors = []

        with transaction.atomic():
            for student_id in student_ids:
                try:
                    student = Student.objects.get(id=student_id)

                    if ExamRegistration.objects.filter(
                        exam=exam, student=student
                    ).exists():
                        errors.append(f"Student {student_id} already registered")
                        continue

                    registration = ExamRegistration.objects.create(
                        exam=exam, student=student, registration_date=timezone.now()
                    )
                    created_registrations.append(registration.id)

                except Student.DoesNotExist:
                    errors.append(f"Student {student_id} not found")
                except Exception as e:
                    errors.append(f"Student {student_id}: {str(e)}")

        return Response(
            {
                "message": f"Registered {len(created_registrations)} students",
                "created_registrations": created_registrations,
                "errors": errors,
            }
        )

    @action(detail=False, methods=["get"])
    def by_student(self, request, student_id=None):
        """Get registrations by student"""
        if not student_id:
            return Response(
                {"error": "Student ID is required"}, status=status.HTTP_400_BAD_REQUEST
            )

        registrations = self.get_queryset().filter(student_id=student_id)
        serializer = self.get_serializer(registrations, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=["get"])
    def by_exam(self, request, exam_id=None):
        """Get registrations by exam"""
        if not exam_id:
            return Response(
                {"error": "Exam ID is required"}, status=status.HTTP_400_BAD_REQUEST
            )

        registrations = self.get_queryset().filter(exam_id=exam_id)
        serializer = self.get_serializer(registrations, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=["post"])
    def mark_attendance(self, request):
        """Mark attendance for exam registrations"""
        attendance_data = request.data.get("attendance", [])

        if not attendance_data:
            return Response(
                {"error": "Attendance data is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        updated_count = 0
        errors = []

        with transaction.atomic():
            for item in attendance_data:
                registration_id = item.get("registration_id")
                is_present = item.get("is_present", False)

                if not registration_id:
                    errors.append("Registration ID is required")
                    continue

                try:
                    registration = ExamRegistration.objects.get(id=registration_id)
                    registration.is_present = is_present
                    registration.save()
                    updated_count += 1
                except ExamRegistration.DoesNotExist:
                    errors.append(f"Registration {registration_id} not found")
                except Exception as e:
                    errors.append(f"Registration {registration_id}: {str(e)}")

        return Response(
            {
                "message": f"Updated attendance for {updated_count} registrations",
                "updated_count": updated_count,
                "errors": errors,
            }
        )


class ResultViewSet(TenantFilterMixin, AutoSectionFilterMixin, viewsets.ModelViewSet):
    """
    CRITICAL: TenantFilterMixin MUST be first to ensure tenant isolation.
    ViewSet for exam results with section filtering
    """

    queryset = StudentResult.objects.select_related("exam", "student", "subject")
    serializer_class = ResultSerializer
    ordering = ["-created_at"]
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = LargeResultsPagination  # PERFORMANCE: Paginate large result datasets

    def _get_section_education_levels(self, user_or_section):
        """
        Universal helper method to get education levels
        """
        SECTION_TO_EDUCATION_LEVEL = {
            "nursery": ["NURSERY"],
            "primary": ["PRIMARY"],
            "junior_secondary": ["JUNIOR_SECONDARY"],
            "senior_secondary": ["SENIOR_SECONDARY"],
            "secondary": ["JUNIOR_SECONDARY", "SENIOR_SECONDARY"],
        }

        ROLE_TO_SECTION = {
            "nursery_admin": "nursery",
            "primary_admin": "primary",
            "junior_secondary_admin": "junior_secondary",
            "senior_secondary_admin": "senior_secondary",
            "secondary_admin": "secondary",
        }

        # User object
        if hasattr(user_or_section, "section") and hasattr(user_or_section, "role"):
            user_section = user_or_section.section
            if not user_section and user_or_section.role in ROLE_TO_SECTION:
                user_section = ROLE_TO_SECTION[user_or_section.role]
            return SECTION_TO_EDUCATION_LEVEL.get(user_section, [])

        # Section model instance OR string containing section/classroom name
        section_name = None
        if hasattr(user_or_section, "name"):
            section_name = str(user_or_section.name).lower()
        else:
            section_name = str(user_or_section).lower()

        # First try the exact match in our mapping
        if section_name in SECTION_TO_EDUCATION_LEVEL:
            return SECTION_TO_EDUCATION_LEVEL[section_name]

        # If not an exact match, parse the name to detect education level
        # Handle names like "Primary 1 - Section A", "Nursery 2 - Section B", etc.
        if (
            "nursery" in section_name
            or "pre-nursery" in section_name
            or "pre nursery" in section_name
        ):
            return ["NURSERY"]
        elif "primary" in section_name:
            return ["PRIMARY"]
        elif (
            "jss" in section_name
            or "junior secondary" in section_name
            or "js" in section_name
        ):
            return ["JUNIOR_SECONDARY"]
        elif (
            "sss" in section_name
            or "senior secondary" in section_name
            or "ss" in section_name
        ):
            return ["SENIOR_SECONDARY"]

        # Last resort: log and return empty list
        logger.warning(
            f"Could not determine education level for section: {section_name}"
        )
        return []

    def get_queryset(self):
        """Apply section filtering"""
        queryset = super().get_queryset()
        user = self.request.user

        if not user.is_authenticated:
            return queryset.none()

        # Super admin sees everything
        if user.is_superuser:
            logger.info(f"✅ Superuser {user.username} - Full access to all exams")
            return queryset

        # Get user role
        role = (
            self.get_user_role()
            if hasattr(self, "get_user_role")
            else getattr(user, "role", None)
        )

        logger.info(f"📋 User {user.username} has role: {role}")

        # Admin/Principal sees everything
        if role in ["admin", "superadmin", "principal"]:
            logger.info(f"✅ Admin {user.username} - Full access to all exams")
            return queryset

        # Section admin filtering - FIXED
        if role in [
            "nursery_admin",
            "primary_admin",
            "junior_secondary_admin",
            "senior_secondary_admin",
            "secondary_admin",
        ]:
            education_levels = self._get_section_education_levels(user)
            logger.info(
                f"🔒 Section admin '{role}' - restricted to: {education_levels}"
            )

            if not education_levels:
                logger.warning(f"❌ No education levels for {user.username}")
                return queryset.none()

            filtered = queryset.filter(
                grade_level__education_level__in=education_levels
            )
            logger.info(f"✅ Filtered Exams: {filtered.count()} of {queryset.count()}")
            return filtered

        # Teacher filtering
        if role == "teacher" or hasattr(user, "teacher"):
            try:
                from teacher.models import Teacher

                teacher = Teacher.objects.get(user=user)
                filtered = queryset.filter(teacher_id=teacher.id)
                logger.info(f"✅ Teacher can see {filtered.count()} exams")
                return filtered
            except Teacher.DoesNotExist:
                logger.warning(f"❌ Teacher object not found for {user.username}")
                return queryset.none()

        # Staff access (general staff without specific role)
        if user.is_staff:
            logger.info(f"✅ Staff {user.username} - Full access")
            return queryset

        # Student/Parent filtering
        if hasattr(self, "get_user_section_access"):
            section_access = self.get_user_section_access()
            education_levels = []
            for section in section_access:
                education_levels.extend(self._get_section_education_levels(section))
            education_levels = list(set(education_levels))

            if not education_levels:
                logger.warning(f"❌ No education level access for {user.username}")
                return queryset.none()

            filtered = queryset.filter(
                grade_level__education_level__in=education_levels
            )
            logger.info(f"✅ Student/Parent can see {filtered.count()} exams")
            return filtered

        # Default: no access
        logger.warning(f"❌ No access rules matched for {user.username}")
        return queryset.none()

    def get_serializer_class(self):
        if self.action in ["create", "update", "partial_update"]:
            return ResultCreateUpdateSerializer
        return ResultSerializer

    def perform_create(self, serializer):
        serializer.save(recorded_by=self.request.user)

    def perform_update(self, serializer):
        serializer.save(recorded_by=self.request.user)


class ExamStatisticsViewSet(TenantFilterMixin, SectionFilterMixin, viewsets.ReadOnlyModelViewSet):
    """
    CRITICAL: TenantFilterMixin MUST be first to ensure tenant isolation.
    ViewSet for exam statistics (read-only) with section filtering
    """

    queryset = ExamStatistics.objects.select_related("exam")
    serializer_class = ExamStatisticsSerializer
    ordering = ["-calculated_at"]
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = StandardResultsPagination  # PERFORMANCE: Paginate statistics

    def _get_section_education_levels(self, user_or_section):
        """
        Universal helper method to get education levels
        """
        SECTION_TO_EDUCATION_LEVEL = {
            "nursery": ["NURSERY"],
            "primary": ["PRIMARY"],
            "junior_secondary": ["JUNIOR_SECONDARY"],
            "senior_secondary": ["SENIOR_SECONDARY"],
            "secondary": ["JUNIOR_SECONDARY", "SENIOR_SECONDARY"],
        }

        ROLE_TO_SECTION = {
            "nursery_admin": "nursery",
            "primary_admin": "primary",
            "junior_secondary_admin": "junior_secondary",
            "senior_secondary_admin": "senior_secondary",
            "secondary_admin": "secondary",
        }

        # User object
        if hasattr(user_or_section, "section") and hasattr(user_or_section, "role"):
            user_section = user_or_section.section
            if not user_section and user_or_section.role in ROLE_TO_SECTION:
                user_section = ROLE_TO_SECTION[user_or_section.role]
            return SECTION_TO_EDUCATION_LEVEL.get(user_section, [])

        # Section model instance OR string containing section/classroom name
        section_name = None
        if hasattr(user_or_section, "name"):
            section_name = str(user_or_section.name).lower()
        else:
            section_name = str(user_or_section).lower()

        # First try the exact match in our mapping
        if section_name in SECTION_TO_EDUCATION_LEVEL:
            return SECTION_TO_EDUCATION_LEVEL[section_name]

        # If not an exact match, parse the name to detect education level
        # Handle names like "Primary 1 - Section A", "Nursery 2 - Section B", etc.
        if (
            "nursery" in section_name
            or "pre-nursery" in section_name
            or "pre nursery" in section_name
        ):
            return ["NURSERY"]
        elif "primary" in section_name:
            return ["PRIMARY"]
        elif (
            "jss" in section_name
            or "junior secondary" in section_name
            or "js" in section_name
        ):
            return ["JUNIOR_SECONDARY"]
        elif (
            "sss" in section_name
            or "senior secondary" in section_name
            or "ss" in section_name
        ):
            return ["SENIOR_SECONDARY"]

        # Last resort: log and return empty list
        logger.warning(
            f"Could not determine education level for section: {section_name}"
        )
        return []

    def get_queryset(self):
        """Apply section filtering"""
        queryset = super().get_queryset()
        user = self.request.user

        if not user.is_authenticated:
            return queryset.none()

        # Super admin sees everything
        if user.is_superuser:
            logger.info(f"✅ Superuser {user.username} - Full access to all exams")
            return queryset

        # Get user role
        role = (
            self.get_user_role()
            if hasattr(self, "get_user_role")
            else getattr(user, "role", None)
        )

        logger.info(f"📋 User {user.username} has role: {role}")

        # Admin/Principal sees everything
        if role in ["admin", "superadmin", "principal"]:
            logger.info(f"✅ Admin {user.username} - Full access to all exams")
            return queryset

        # Section admin filtering - FIXED
        if role in [
            "nursery_admin",
            "primary_admin",
            "junior_secondary_admin",
            "senior_secondary_admin",
            "secondary_admin",
        ]:
            education_levels = self._get_section_education_levels(user)
            logger.info(
                f"🔒 Section admin '{role}' - restricted to: {education_levels}"
            )

            if not education_levels:
                logger.warning(f"❌ No education levels for {user.username}")
                return queryset.none()

            filtered = queryset.filter(
                grade_level__education_level__in=education_levels
            )
            logger.info(f"✅ Filtered Exams: {filtered.count()} of {queryset.count()}")
            return filtered

        # Teacher filtering
        if role == "teacher" or hasattr(user, "teacher"):
            try:
                from teacher.models import Teacher

                teacher = Teacher.objects.get(user=user)
                filtered = queryset.filter(teacher_id=teacher.id)
                logger.info(f"✅ Teacher can see {filtered.count()} exams")
                return filtered
            except Teacher.DoesNotExist:
                logger.warning(f"❌ Teacher object not found for {user.username}")
                return queryset.none()

        # Staff access (general staff without specific role)
        if user.is_staff:
            logger.info(f"✅ Staff {user.username} - Full access")
            return queryset

        # Student/Parent filtering
        if hasattr(self, "get_user_section_access"):
            section_access = self.get_user_section_access()
            education_levels = []
            for section in section_access:
                education_levels.extend(self._get_section_education_levels(section))
            education_levels = list(set(education_levels))

            if not education_levels:
                logger.warning(f"❌ No education level access for {user.username}")
                return queryset.none()

            filtered = queryset.filter(
                grade_level__education_level__in=education_levels
            )
            logger.info(f"✅ Student/Parent can see {filtered.count()} exams")
            return filtered

        # Default: no access
        logger.warning(f"❌ No access rules matched for {user.username}")
        return queryset.none()

    @action(detail=False, methods=["get"])
    def summary(self, request):
        """Get statistics summary across all exams"""
        stats = self.get_queryset()

        if not stats.exists():
            return Response({"message": "No statistics available", "total_exams": 0})

        summary_data = {
            "total_exams": stats.count(),
            "total_students_registered": sum(s.total_registered for s in stats),
            "total_students_appeared": sum(s.total_appeared for s in stats),
            "average_pass_rate": stats.aggregate(avg_pass=Avg("pass_percentage"))[
                "avg_pass"
            ]
            or 0,
            "highest_average_score": stats.aggregate(max_avg=Max("average_score"))[
                "max_avg"
            ]
            or 0,
        }

        return Response(summary_data)

    @action(detail=True, methods=["post"])
    def recalculate(self, request, pk=None):
        """Recalculate statistics for a specific exam"""
        stats = self.get_object()
        exam = stats.exam

        exam_viewset = ExamViewSet()
        exam_viewset._generate_exam_statistics(exam)

        stats.refresh_from_db()
        serializer = self.get_serializer(stats)

        return Response(
            {
                "message": "Statistics recalculated successfully",
                "statistics": serializer.data,
            }
        )


# ============================================
# EXAM-003: NEW EXAM FEATURES VIEWSETS
# ============================================


class QuestionBankViewSet(TenantFilterMixin, AutoSectionFilterMixin, viewsets.ModelViewSet):
    """
    CRITICAL: TenantFilterMixin MUST be first to ensure tenant isolation.
    ViewSet for managing Question Bank

    Features:
    - List questions with filtering (subject, difficulty, type, shared status)
    - Create new questions
    - Update existing questions
    - Delete questions
    - Import questions to exam
    - Search by question text, topic, tags
    """

    queryset = QuestionBank.objects.select_related(
        "created_by", "subject", "grade_level"
    ).all()

    filter_backends = [
        DjangoFilterBackend,
        filters.SearchFilter,
        filters.OrderingFilter,
    ]
    search_fields = ["question", "topic", "subtopic", "tags"]
    ordering_fields = ["created_at", "usage_count", "last_used", "difficulty"]
    ordering = ["-created_at"]
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = LargeResultsPagination  # PERFORMANCE: Paginate question bank

    def get_serializer_class(self):
        """Return appropriate serializer based on action"""
        if self.action == "list":
            return QuestionBankListSerializer
        elif self.action in ["create", "update", "partial_update"]:
            return QuestionBankCreateUpdateSerializer
        return QuestionBankDetailSerializer

    def get_queryset(self):
        """
        Filter questions based on user permissions
        Teachers see own questions + shared questions
        Admins see all questions
        """
        queryset = super().get_queryset()
        user = self.request.user

        # Apply filtering
        params = self.request.query_params

        # Filter by question type
        question_type = params.get("question_type")
        if question_type:
            queryset = queryset.filter(question_type=question_type)

        # Filter by subject
        subject_id = params.get("subject")
        if subject_id:
            queryset = queryset.filter(subject_id=subject_id)

        # Filter by grade level
        grade_level_id = params.get("grade_level")
        if grade_level_id:
            queryset = queryset.filter(grade_level_id=grade_level_id)

        # Filter by difficulty
        difficulty = params.get("difficulty")
        if difficulty:
            queryset = queryset.filter(difficulty=difficulty)

        # Filter by topic
        topic = params.get("topic")
        if topic:
            queryset = queryset.filter(topic__icontains=topic)

        # Filter by tags
        tags = params.get("tags")
        if tags:
            tag_list = tags.split(",")
            for tag in tag_list:
                queryset = queryset.filter(tags__contains=[tag.strip()])

        # Filter by ownership (my questions vs shared)
        show_only_mine = params.get("only_mine") == "true"
        show_shared = params.get("show_shared") == "true"

        if hasattr(user, "teacher"):
            teacher = user.teacher
            if show_only_mine:
                # Only my questions
                queryset = queryset.filter(created_by=teacher)
            elif show_shared:
                # Only shared questions from others
                queryset = queryset.filter(is_shared=True).exclude(created_by=teacher)
            else:
                # My questions + shared questions
                queryset = queryset.filter(
                    Q(created_by=teacher) | Q(is_shared=True)
                )
        elif not user.is_staff:
            # Non-teachers only see shared questions
            queryset = queryset.filter(is_shared=True)

        return queryset

    def perform_create(self, serializer):
        """Set created_by to current user's teacher"""
        user = self.request.user
        if hasattr(user, "teacher"):
            serializer.save(created_by=user.teacher)
        else:
            raise ValidationError("Only teachers can create questions in the bank.")

    @action(detail=False, methods=["post"])
    def import_to_exam(self, request):
        """
        Import selected questions into an exam

        POST data:
        {
            "exam_id": 123,
            "question_ids": [1, 2, 3],
            "section_type": "objective"  # objective, theory, or practical
        }
        """
        exam_id = request.data.get("exam_id")
        question_ids = request.data.get("question_ids", [])
        section_type = request.data.get("section_type")

        if not exam_id or not question_ids or not section_type:
            return Response(
                {"error": "exam_id, question_ids, and section_type are required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            exam = Exam.objects.get(id=exam_id)
        except Exam.DoesNotExist:
            return Response(
                {"error": "Exam not found"}, status=status.HTTP_404_NOT_FOUND
            )

        # Get questions
        questions = QuestionBank.objects.filter(id__in=question_ids)
        if questions.count() != len(question_ids):
            return Response(
                {"error": "Some questions not found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        # Convert questions to exam format and append to exam
        imported_count = 0
        with transaction.atomic():
            for question in questions:
                question_data = {
                    "question": question.question,
                    "marks": question.marks,
                    "images": question.images,
                    "table": question.table_data,
                }

                if question.question_type == "objective":
                    question_data["options"] = question.options
                    question_data["correctAnswer"] = question.correct_answer
                    if section_type == "objective":
                        if not exam.objective_questions:
                            exam.objective_questions = []
                        exam.objective_questions.append(question_data)
                        imported_count += 1

                elif question.question_type == "theory":
                    question_data["expectedPoints"] = question.expected_points
                    if section_type == "theory":
                        if not exam.theory_questions:
                            exam.theory_questions = []
                        exam.theory_questions.append(question_data)
                        imported_count += 1

                elif question.question_type == "practical":
                    question_data["task"] = question.question
                    question_data["expectedOutcome"] = question.expected_points
                    if section_type == "practical":
                        if not exam.practical_questions:
                            exam.practical_questions = []
                        exam.practical_questions.append(question_data)
                        imported_count += 1

                # Increment usage count
                question.increment_usage()

            exam.save()

        return Response(
            {
                "message": f"Successfully imported {imported_count} questions to exam",
                "imported_count": imported_count,
            },
            status=status.HTTP_200_OK,
        )

    @action(detail=True, methods=["post"])
    def duplicate(self, request, pk=None):
        """Duplicate a question"""
        question = self.get_object()
        user = request.user

        if not hasattr(user, "teacher"):
            return Response(
                {"error": "Only teachers can duplicate questions"},
                status=status.HTTP_403_FORBIDDEN,
            )

        # Create duplicate
        question.pk = None
        question.created_by = user.teacher
        question.usage_count = 0
        question.last_used = None
        question.save()

        serializer = QuestionBankDetailSerializer(question)
        return Response(
            {
                "message": "Question duplicated successfully",
                "question": serializer.data,
            },
            status=status.HTTP_201_CREATED,
        )

    @action(detail=False, methods=["get"])
    def statistics(self, request):
        """Get question bank statistics"""
        queryset = self.get_queryset()

        stats = {
            "total_questions": queryset.count(),
            "by_type": {
                "objective": queryset.filter(question_type="objective").count(),
                "theory": queryset.filter(question_type="theory").count(),
                "practical": queryset.filter(question_type="practical").count(),
            },
            "by_difficulty": {
                "easy": queryset.filter(difficulty="easy").count(),
                "medium": queryset.filter(difficulty="medium").count(),
                "hard": queryset.filter(difficulty="hard").count(),
            },
            "shared_questions": queryset.filter(is_shared=True).count(),
            "most_used": queryset.order_by("-usage_count")[:5].values(
                "id", "question", "usage_count"
            ),
        }

        return Response(stats)


class ExamTemplateViewSet(TenantFilterMixin, AutoSectionFilterMixin, viewsets.ModelViewSet):
    """
    CRITICAL: TenantFilterMixin MUST be first to ensure tenant isolation.
    ViewSet for managing Exam Templates

    Features:
    - List templates with filtering
    - Create new templates
    - Update existing templates
    - Delete templates
    - Apply template to create new exam
    - Duplicate template
    """

    queryset = ExamTemplate.objects.select_related(
        "created_by", "grade_level", "subject"
    ).all()

    filter_backends = [
        DjangoFilterBackend,
        filters.SearchFilter,
        filters.OrderingFilter,
    ]
    search_fields = ["name", "description"]
    ordering_fields = ["created_at", "usage_count", "name"]
    ordering = ["-created_at"]
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = StandardResultsPagination  # PERFORMANCE: Paginate templates

    def get_serializer_class(self):
        """Return appropriate serializer based on action"""
        if self.action == "list":
            return ExamTemplateListSerializer
        elif self.action in ["create", "update", "partial_update"]:
            return ExamTemplateCreateUpdateSerializer
        return ExamTemplateDetailSerializer

    def get_queryset(self):
        """
        Filter templates based on user permissions
        Teachers see own templates + shared templates
        Admins see all templates
        """
        queryset = super().get_queryset()
        user = self.request.user
        params = self.request.query_params

        # Filter by grade level
        grade_level_id = params.get("grade_level")
        if grade_level_id:
            queryset = queryset.filter(grade_level_id=grade_level_id)

        # Filter by subject
        subject_id = params.get("subject")
        if subject_id:
            queryset = queryset.filter(subject_id=subject_id)

        # Filter by ownership
        show_only_mine = params.get("only_mine") == "true"
        show_shared = params.get("show_shared") == "true"

        if hasattr(user, "teacher"):
            teacher = user.teacher
            if show_only_mine:
                queryset = queryset.filter(created_by=teacher)
            elif show_shared:
                queryset = queryset.filter(is_shared=True).exclude(created_by=teacher)
            else:
                # My templates + shared templates
                queryset = queryset.filter(
                    Q(created_by=teacher) | Q(is_shared=True)
                )
        elif not user.is_staff:
            # Non-teachers only see shared templates
            queryset = queryset.filter(is_shared=True)

        return queryset

    def perform_create(self, serializer):
        """Set created_by to current user's teacher"""
        user = self.request.user
        if hasattr(user, "teacher"):
            serializer.save(created_by=user.teacher)
        else:
            raise ValidationError("Only teachers can create templates.")

    @action(detail=True, methods=["post"])
    def apply(self, request, pk=None):
        """
        Apply template to create a new exam

        POST data:
        {
            "title": "Mathematics Mid-Term Exam",
            "exam_date": "2024-03-15",
            "start_time": "09:00",
            "end_time": "11:00",
            "subject": 1,
            "exam_schedule": 1,
            ... other exam fields
        }
        """
        template = self.get_object()

        # Create new exam with template structure
        exam_data = request.data.copy()

        # Set structure from template
        if "total_marks" not in exam_data:
            exam_data["total_marks"] = template.total_marks
        if "duration_minutes" not in exam_data:
            exam_data["duration_minutes"] = template.duration_minutes
        if "grade_level" not in exam_data:
            exam_data["grade_level"] = template.grade_level.id

        # Set default instructions from template
        if template.default_instructions:
            if "objective_instructions" not in exam_data:
                exam_data["objective_instructions"] = template.default_instructions.get("objective", "")
            if "theory_instructions" not in exam_data:
                exam_data["theory_instructions"] = template.default_instructions.get("theory", "")
            if "practical_instructions" not in exam_data:
                exam_data["practical_instructions"] = template.default_instructions.get("practical", "")
            if "instructions" not in exam_data:
                exam_data["instructions"] = template.default_instructions.get("general", "")

        # Create exam
        exam_serializer = ExamCreateUpdateSerializer(data=exam_data, context={"request": request})
        if exam_serializer.is_valid():
            exam = exam_serializer.save()

            # Increment template usage
            template.increment_usage()

            # Return created exam
            detail_serializer = ExamDetailSerializer(exam)
            return Response(
                {
                    "message": "Exam created successfully from template",
                    "exam": detail_serializer.data,
                    "template": ExamTemplateDetailSerializer(template).data,
                },
                status=status.HTTP_201_CREATED,
            )
        else:
            return Response(
                exam_serializer.errors, status=status.HTTP_400_BAD_REQUEST
            )

    @action(detail=True, methods=["post"])
    def duplicate(self, request, pk=None):
        """Duplicate a template"""
        template = self.get_object()
        user = request.user

        if not hasattr(user, "teacher"):
            return Response(
                {"error": "Only teachers can duplicate templates"},
                status=status.HTTP_403_FORBIDDEN,
            )

        # Create duplicate
        template.pk = None
        template.created_by = user.teacher
        template.name = f"{template.name} (Copy)"
        template.usage_count = 0
        template.save()

        serializer = ExamTemplateDetailSerializer(template)
        return Response(
            {
                "message": "Template duplicated successfully",
                "template": serializer.data,
            },
            status=status.HTTP_201_CREATED,
        )


class ExamReviewViewSet(TenantFilterMixin, AutoSectionFilterMixin, viewsets.ModelViewSet):
    """
    CRITICAL: TenantFilterMixin MUST be first to ensure tenant isolation.
    ViewSet for managing Exam Reviews

    Features:
    - List reviews with filtering
    - Get review details
    - Submit exam for review
    - Approve/reject/request changes
    - Add comments
    - Resolve comments
    """

    queryset = ExamReview.objects.select_related(
        "exam", "submitted_by", "approved_by"
    ).prefetch_related("reviewers", "comments").all()

    filter_backends = [
        DjangoFilterBackend,
        filters.SearchFilter,
        filters.OrderingFilter,
    ]
    search_fields = ["exam__title", "exam__code", "submission_note"]
    ordering_fields = ["created_at", "submitted_at", "status"]
    ordering = ["-created_at"]
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = StandardResultsPagination  # PERFORMANCE: Paginate reviews

    def get_serializer_class(self):
        """Return appropriate serializer based on action"""
        if self.action == "list":
            return ExamReviewListSerializer
        elif self.action == "submit_for_review":
            return ExamReviewSubmitSerializer
        elif self.action == "make_decision":
            return ExamReviewDecisionSerializer
        return ExamReviewDetailSerializer

    def get_queryset(self):
        """
        Filter reviews based on user permissions
        Teachers see reviews they submitted or are assigned to
        Admins see all reviews
        """
        queryset = super().get_queryset()
        user = self.request.user
        params = self.request.query_params

        # Filter by status
        review_status = params.get("status")
        if review_status:
            queryset = queryset.filter(status=review_status)

        # Filter by permissions
        if hasattr(user, "teacher") and not user.is_staff:
            teacher = user.teacher
            # Show reviews submitted by teacher or where teacher is a reviewer
            queryset = queryset.filter(
                Q(submitted_by=teacher) | Q(reviewers__reviewer=teacher)
            ).distinct()

        return queryset

    @action(detail=False, methods=["post"])
    def submit_for_review(self, request):
        """
        Submit an exam for review

        POST data:
        {
            "exam_id": 123,
            "reviewer_ids": [1, 2],
            "submission_note": "Please review before Friday"
        }
        """
        serializer = ExamReviewSubmitSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        exam_id = request.data.get("exam_id")
        reviewer_ids = serializer.validated_data["reviewer_ids"]
        submission_note = serializer.validated_data.get("submission_note", "")

        try:
            exam = Exam.objects.get(id=exam_id)
        except Exam.DoesNotExist:
            return Response(
                {"error": "Exam not found"}, status=status.HTTP_404_NOT_FOUND
            )

        user = request.user
        if not hasattr(user, "teacher"):
            return Response(
                {"error": "Only teachers can submit exams for review"},
                status=status.HTTP_403_FORBIDDEN,
            )

        # Check if review already exists
        if hasattr(exam, "review"):
            return Response(
                {"error": "This exam already has a review"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Create review
        with transaction.atomic():
            review = ExamReview.objects.create(
                exam=exam,
                submitted_by=user.teacher,
                submission_note=submission_note,
            )

            # Add reviewers
            for reviewer_id in reviewer_ids:
                try:
                    reviewer = Teacher.objects.get(id=reviewer_id)
                    ExamReviewer.objects.create(review=review, reviewer=reviewer)
                except Teacher.DoesNotExist:
                    pass

            # Submit the review
            review.submit()

        serializer = ExamReviewDetailSerializer(review)
        return Response(
            {
                "message": "Exam submitted for review successfully",
                "review": serializer.data,
            },
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=["post"])
    def make_decision(self, request, pk=None):
        """
        Make a decision on the review (approve/reject/request changes)

        POST data:
        {
            "decision": "approve",  # or "reject" or "request_changes"
            "notes": "Looks good",
            "reason": "Missing answer key"  # required for reject
        }
        """
        review = self.get_object()
        serializer = ExamReviewDecisionSerializer(data=request.data)

        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        user = request.user
        if not hasattr(user, "teacher"):
            return Response(
                {"error": "Only teachers can make review decisions"},
                status=status.HTTP_403_FORBIDDEN,
            )

        decision = serializer.validated_data["decision"]
        notes = serializer.validated_data.get("notes", "")
        reason = serializer.validated_data.get("reason", "")

        # Check if user is a reviewer
        is_reviewer = review.reviewers.filter(reviewer=user.teacher).exists()
        if not is_reviewer and not user.is_staff:
            return Response(
                {"error": "You are not assigned as a reviewer for this exam"},
                status=status.HTTP_403_FORBIDDEN,
            )

        # Process decision
        with transaction.atomic():
            if decision == "approve":
                review.approve(user.teacher, notes)
                message = "Exam approved successfully"
            elif decision == "reject":
                review.reject(user.teacher, reason)
                message = "Exam rejected"
            elif decision == "request_changes":
                review.request_changes()
                message = "Changes requested"

            # Update reviewer status
            reviewer_obj = review.reviewers.filter(reviewer=user.teacher).first()
            if reviewer_obj:
                reviewer_obj.submit_review(decision)

        detail_serializer = ExamReviewDetailSerializer(review)
        return Response(
            {
                "message": message,
                "review": detail_serializer.data,
            },
            status=status.HTTP_200_OK,
        )

    @action(detail=True, methods=["post"])
    def add_comment(self, request, pk=None):
        """
        Add a comment to the review

        POST data:
        {
            "comment": "Please clarify question 5",
            "question_index": 4,
            "section": "objective"
        }
        """
        review = self.get_object()
        serializer = ExamReviewCommentCreateSerializer(data=request.data)

        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        user = request.user
        if not hasattr(user, "teacher"):
            return Response(
                {"error": "Only teachers can add comments"},
                status=status.HTTP_403_FORBIDDEN,
            )

        # Create comment
        comment = ExamReviewComment.objects.create(
            review=review,
            author=user.teacher,
            **serializer.validated_data
        )

        comment_serializer = ExamReviewCommentSerializer(comment)
        return Response(
            {
                "message": "Comment added successfully",
                "comment": comment_serializer.data,
            },
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=["post"], url_path="comments/(?P<comment_id>[^/.]+)/resolve")
    def resolve_comment(self, request, pk=None, comment_id=None):
        """Resolve a comment"""
        review = self.get_object()

        try:
            comment = review.comments.get(id=comment_id)
        except ExamReviewComment.DoesNotExist:
            return Response(
                {"error": "Comment not found"}, status=status.HTTP_404_NOT_FOUND
            )

        user = request.user
        if not hasattr(user, "teacher"):
            return Response(
                {"error": "Only teachers can resolve comments"},
                status=status.HTTP_403_FORBIDDEN,
            )

        comment.resolve(user.teacher)

        serializer = ExamReviewCommentSerializer(comment)
        return Response(
            {
                "message": "Comment resolved successfully",
                "comment": serializer.data,
            },
            status=status.HTTP_200_OK,
        )

    @action(detail=False, methods=["get"])
    def queue(self, request):
        """Get review queue (pending reviews for current user)"""
        user = request.user

        if not hasattr(user, "teacher"):
            return Response(
                {"error": "Only teachers have review queues"},
                status=status.HTTP_403_FORBIDDEN,
            )

        # Get reviews where user is a reviewer and status is submitted or in_review
        reviews = ExamReview.objects.filter(
            reviewers__reviewer=user.teacher,
            status__in=["submitted", "in_review"]
        ).select_related("exam", "submitted_by").distinct()

        serializer = ExamReviewListSerializer(reviews, many=True)
        return Response(
            {
                "queue": serializer.data,
                "count": reviews.count(),
            },
            status=status.HTTP_200_OK,
        )
