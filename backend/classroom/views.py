# views.py - FIXED VERSION
from rest_framework import viewsets, status, filters
from rest_framework.views import APIView
from rest_framework.decorators import action, api_view, permission_classes
from django.utils.decorators import method_decorator
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, IsAdminUser
from django_filters.rest_framework import DjangoFilterBackend
from django.views.decorators.cache import cache_page
from django.db.models import Q, Count
from django.utils import timezone
from django.conf import settings
from django.db.models import Prefetch
from django.core.cache import cache
from django.shortcuts import get_object_or_404
import logging

from utils.section_filtering import AutoSectionFilterMixin
from tenants.mixins import TenantFilterMixin
from utils.pagination import StandardResultsPagination, LargeResultsPagination
from .models import (
    GradeLevel,
    Classroom,
    ClassroomTeacherAssignment,
    StudentEnrollment,
    ClassSchedule,
    Section,
    Stream,
)
from students.models import Student
from teacher.models import Teacher
from subject.models import Subject


from .serializers import (
    ClassroomSerializer,
    ClassroomDetailSerializer,
    ClassroomTeacherAssignmentSerializer,
    StudentEnrollmentSerializer,
    ClassScheduleSerializer,
    GradeLevelSerializer,
    SectionSerializer,
    StreamSerializer,
)
from teacher.serializers import TeacherSerializer
from subject.serializers import SubjectSerializer, SubjectEducationLevelSerializer
from subject.models import (
    SUBJECT_CATEGORY_CHOICES,
    EDUCATION_LEVELS,
    NURSERY_LEVELS,
    SS_SUBJECT_TYPES,
)

logger = logging.getLogger(__name__)


# ==============================================================================
# FIXED VIEWSETS
# ==============================================================================


class GradeLevelViewSet(TenantFilterMixin, AutoSectionFilterMixin, viewsets.ModelViewSet):
    """ViewSet for GradeLevel model with automatic section filtering"""

    queryset = GradeLevel.objects.all()
    serializer_class = GradeLevelSerializer
    permission_classes = []  # public access
    pagination_class = StandardResultsPagination  # PERFORMANCE: Paginate grade levels
    filter_backends = [
        DjangoFilterBackend,
        filters.SearchFilter,
        filters.OrderingFilter,
    ]
    filterset_fields = ["education_level", "is_active"]
    search_fields = ["name", "education_level"]
    ordering_fields = ["order", "name"]

    def get_queryset(self):
        # Let mixin handle section filtering
        queryset = super().get_queryset()
        return queryset.order_by("order", "name")

    @action(detail=True, methods=["get"])
    def subjects(self, request, pk=None):
        grade = self.get_object()
        subjects = grade.subject_set.all()
        subjects = self.apply_section_filters(subjects)  # Apply filtering
        serializer = SubjectSerializer(subjects, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=["get"])
    def sections(self, request, pk=None):
        grade = self.get_object()
        sections = Section.objects.filter(grade_level=grade)
        sections = self.apply_section_filters(sections)  # Apply filtering
        serializer = SectionSerializer(sections, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=["get"])
    def nursery_grades(self, request):
        grades = self.get_queryset().filter(education_level="NURSERY")
        serializer = self.get_serializer(grades, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=["get"])
    def primary_grades(self, request):
        grades = self.get_queryset().filter(education_level="PRIMARY")
        serializer = self.get_serializer(grades, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=["get"])
    def junior_secondary_grades(self, request):
        grades = self.get_queryset().filter(education_level="JUNIOR_SECONDARY")
        serializer = self.get_serializer(grades, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=["get"])
    def senior_secondary_grades(self, request):
        grades = self.get_queryset().filter(education_level="SENIOR_SECONDARY")
        serializer = self.get_serializer(grades, many=True)
        return Response(serializer.data)


class SectionViewSet(TenantFilterMixin, AutoSectionFilterMixin, viewsets.ModelViewSet):
    """ViewSet for Section model with automatic section filtering"""

    queryset = Section.objects.all()
    serializer_class = SectionSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = StandardResultsPagination  # PERFORMANCE: Paginate sections
    filter_backends = [
        DjangoFilterBackend,
        filters.SearchFilter,
        filters.OrderingFilter,
    ]
    filterset_fields = ["grade_level", "name", "is_active"]
    search_fields = ["name"]
    ordering_fields = ["name"]

    def get_queryset(self):
        # Let mixin handle section filtering
        queryset = super().get_queryset()
        return queryset.order_by("grade_level__order", "name")

    @action(detail=True, methods=["get"])
    def classrooms(self, request, pk=None):
        section = self.get_object()
        classrooms = Classroom.objects.filter(section=section)
        classrooms = self.apply_section_filters(classrooms)  # Apply filtering
        serializer = ClassroomSerializer(classrooms, many=True)
        return Response(serializer.data)


class StreamViewSet(TenantFilterMixin, AutoSectionFilterMixin, viewsets.ModelViewSet):
    """ViewSet for Stream model"""

    queryset = Stream.objects.all()  # FIXED: Was Section.objects
    permission_classes = []
    serializer_class = StreamSerializer
    pagination_class = StandardResultsPagination  # PERFORMANCE: Paginate streams
    filter_backends = [
        DjangoFilterBackend,
        filters.SearchFilter,
        filters.OrderingFilter,
    ]
    filterset_fields = ["stream_type", "is_active"]
    search_fields = ["name", "code", "description"]
    ordering_fields = ["name", "stream_type", "created_at"]

    def get_queryset(self):
        # Let mixin handle section filtering
        queryset = super().get_queryset()
        return queryset.order_by("name")

    @action(detail=False, methods=["get"])
    def by_type(self, request):
        stream_type = request.query_params.get("stream_type")
        if stream_type:
            queryset = self.get_queryset().filter(
                stream_type=stream_type, is_active=True
            )
        else:
            queryset = self.get_queryset().filter(is_active=True)

        # PERFORMANCE: Add pagination for consistency
        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = StreamSerializer(page, many=True)
            return self.get_paginated_response(serializer.data)

        # Fallback if pagination is disabled
        serializer = StreamSerializer(queryset, many=True)
        return Response(serializer.data)


class ClassroomViewSet(TenantFilterMixin, AutoSectionFilterMixin, viewsets.ModelViewSet):
    """
    ViewSet for Classroom model with automatic section filtering.
    FIXED: Removed duplicate get_queryset() methods
    """

    queryset = Classroom.objects.all().annotate(
        current_enrollment_count=Count(
            "studentenrollment", filter=Q(studentenrollment__is_active=True)
        )
    )
    serializer_class = ClassroomSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = StandardResultsPagination  # PERFORMANCE: Paginate classrooms
    filter_backends = [
        DjangoFilterBackend,
        filters.SearchFilter,
        filters.OrderingFilter,
    ]
    filterset_fields = ["section", "name", "is_active"]
    search_fields = ["name"]
    ordering_fields = ["name"]

    def get_queryset(self):
        """
        FIXED: Single get_queryset() that properly uses the mixin
        """
        # Let AutoSectionFilterMixin handle section filtering
        queryset = super().get_queryset()

        # Add related data prefetching
        queryset = queryset.select_related(
            "section__grade_level",
            "academic_session",
            "term",
            "class_teacher__user",
        ).prefetch_related(
            "students",
            "schedules",
            Prefetch(
                "classroomteacherassignment_set",
                queryset=ClassroomTeacherAssignment.objects.filter(
                    is_active=True
                ).select_related("teacher__user", "subject"),
                to_attr="active_assignments",  # store prefetched data here
            ),
        )

        logger.info(
            f"[ClassroomViewSet] Queryset count after filtering: {queryset.count()}"
        )

        return queryset.order_by("section__grade_level__order", "name")

    def get_serializer_class(self):
        if self.action in ["retrieve", "list"]:
            return ClassroomDetailSerializer
        return ClassroomSerializer

    @action(detail=True, methods=["get"])
    def students(self, request, pk=None):
        """Get students for a specific classroom"""
        try:
            classroom = self.get_object()

            logger.info(
                f"🔍 Fetching students for classroom: {classroom.name} (ID: {classroom.id})"
            )

            # Get active enrollments for this classroom
            enrollments = StudentEnrollment.objects.filter(
                classroom=classroom, is_active=True
            ).select_related("student__user")

            students = [enrollment.student for enrollment in enrollments]

            logger.info(f"✅ Found {len(students)} students via StudentEnrollment")

            from students.serializers import StudentListSerializer

            serializer = StudentListSerializer(students, many=True)
            return Response(serializer.data)

        except Classroom.DoesNotExist:
            return Response(
                {"error": "Classroom not found"}, status=status.HTTP_404_NOT_FOUND
            )
        except Exception as e:
            logger.error(f"Error fetching classroom students: {str(e)}", exc_info=True)
            return Response(
                {"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    @action(detail=True, methods=["get"])
    def teachers(self, request, pk=None):
        classroom = self.get_object()
        assignments = getattr(classroom, "active_assignments", [])
        serializer = ClassroomTeacherAssignmentSerializer(assignments, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=["get"])
    def subjects(self, request, pk=None):
        """Get subjects for a specific classroom"""
        classroom = self.get_object()
        subjects = Subject.objects.filter(
            classroomteacherassignment__classroom=classroom,
            classroomteacherassignment__is_active=True,
        ).distinct()
        # Apply section filtering to subjects
        subjects = self.apply_section_filters(subjects)
        from subject.serializers import SubjectSerializer

        serializer = SubjectSerializer(subjects, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=["get"])
    def schedule(self, request, pk=None):
        """Get schedule for a specific classroom"""
        classroom = self.get_object()
        schedules = classroom.schedules.filter(is_active=True).select_related(
            "subject", "teacher__user"
        )
        serializer = ClassScheduleSerializer(schedules, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=["get"])
    def statistics(self, request):
        """Get classroom statistics based on user's section access"""
        queryset = self.get_queryset()  # Already filtered by section

        total_classrooms = queryset.count()
        active_classrooms = queryset.filter(is_active=True).count()

        # Calculate enrollment from the filtered queryset
        total_enrollment = 0
        for classroom in queryset:
            total_enrollment += classroom.current_enrollment

        avg_enrollment = (
            total_enrollment / total_classrooms if total_classrooms > 0 else 0
        )

        # By education level (from filtered queryset)
        nursery_count = queryset.filter(
            section__grade_level__education_level="NURSERY"
        ).count()
        primary_count = queryset.filter(
            section__grade_level__education_level="PRIMARY"
        ).count()
        junior_secondary_count = queryset.filter(
            section__grade_level__education_level="JUNIOR_SECONDARY"
        ).count()
        senior_secondary_count = queryset.filter(
            section__grade_level__education_level="SENIOR_SECONDARY"
        ).count()

        return Response(
            {
                "total_classrooms": total_classrooms,
                "active_classrooms": active_classrooms,
                "total_enrollment": total_enrollment,
                "average_enrollment": round(avg_enrollment, 1),
                "by_education_level": {
                    "nursery": nursery_count,
                    "primary": primary_count,
                    "junior_secondary": junior_secondary_count,
                    "senior_secondary": senior_secondary_count,
                },
            }
        )

    def destroy(self, request, *args, **kwargs):
        """Override destroy to return proper JSON response"""
        classroom = self.get_object()
        classroom_name = classroom.name
        classroom.delete()
        return Response(
            {
                "message": f"Classroom {classroom_name} has been successfully deleted",
                "status": "success",
            },
            status=status.HTTP_200_OK,
        )

    @action(detail=True, methods=["post"])
    def assign_teacher(self, request, pk=None):
        """Assign a teacher to a classroom for a specific subject"""
        classroom = self.get_object()
        teacher_id = request.data.get("teacher_id")
        subject_id = request.data.get("subject_id")

        if not teacher_id or not subject_id:
            return Response(
                {"error": "Both teacher_id and subject_id are required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            teacher = Teacher.objects.get(id=teacher_id)
            subject = Subject.objects.get(id=subject_id)

            # Check for existing assignment
            existing_assignment = ClassroomTeacherAssignment.objects.filter(
                classroom=classroom, teacher=teacher, subject=subject, is_active=True
            ).first()

            if existing_assignment:
                return Response(
                    {
                        "error": f"Teacher {teacher.user.get_full_name()} is already assigned to {subject.name} in this classroom"
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            # Create assignment
            assignment = ClassroomTeacherAssignment.objects.create(
                classroom=classroom, teacher=teacher, subject=subject
            )

            # For nursery/primary, set class_teacher
            if classroom.section.grade_level.education_level in ["NURSERY", "PRIMARY"]:
                classroom.class_teacher = teacher
                classroom.save()

            serializer = ClassroomTeacherAssignmentSerializer(assignment)
            return Response(serializer.data, status=status.HTTP_201_CREATED)

        except Teacher.DoesNotExist:
            return Response(
                {"error": "Teacher not found"}, status=status.HTTP_404_NOT_FOUND
            )
        except Subject.DoesNotExist:
            return Response(
                {"error": "Subject not found"}, status=status.HTTP_404_NOT_FOUND
            )
        except Exception as e:
            logger.error(f"Error assigning teacher: {str(e)}", exc_info=True)
            return Response(
                {"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    @action(detail=True, methods=["post"])
    def remove_teacher(self, request, pk=None):
        """Remove a teacher assignment from a classroom"""
        classroom = self.get_object()
        teacher_id = request.data.get("teacher_id")
        subject_id = request.data.get("subject_id")

        if not teacher_id or not subject_id:
            return Response(
                {"error": "Both teacher_id and subject_id are required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            assignment = ClassroomTeacherAssignment.objects.get(
                classroom=classroom,
                teacher_id=teacher_id,
                subject_id=subject_id,
                is_active=True,
            )
            assignment.is_active = False
            assignment.save()

            # For nursery/primary, clear class_teacher if no more assignments
            if classroom.section.grade_level.education_level in ["NURSERY", "PRIMARY"]:
                remaining = classroom.classroomteacherassignment_set.filter(
                    is_active=True
                ).count()
                if remaining == 0:
                    classroom.class_teacher = None
                    classroom.save()

            return Response({"message": "Teacher assignment removed successfully"})

        except ClassroomTeacherAssignment.DoesNotExist:
            return Response(
                {"error": "Teacher assignment not found"},
                status=status.HTTP_404_NOT_FOUND,
            )
        except Exception as e:
            logger.error(f"Error removing teacher: {str(e)}", exc_info=True)
            return Response(
                {"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    @action(detail=True, methods=["post"])
    def enroll_student(self, request, pk=None):
        """Enroll a student in this classroom"""
        classroom = self.get_object()
        student_id = request.data.get("student_id")

        if not student_id:
            return Response(
                {"error": "student_id is required"}, status=status.HTTP_400_BAD_REQUEST
            )

        try:
            student = Student.objects.get(id=student_id)

            # Check existing enrollment
            existing = StudentEnrollment.objects.filter(
                student=student, classroom=classroom, is_active=True
            ).first()

            if existing:
                return Response(
                    {
                        "error": f"Student {student.user.get_full_name()} is already enrolled in this classroom"
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            enrollment = StudentEnrollment.objects.create(
                student=student, classroom=classroom
            )

            serializer = StudentEnrollmentSerializer(enrollment)
            return Response(serializer.data, status=status.HTTP_201_CREATED)

        except Student.DoesNotExist:
            return Response(
                {"error": "Student not found"}, status=status.HTTP_404_NOT_FOUND
            )
        except Exception as e:
            logger.error(f"Error enrolling student: {str(e)}", exc_info=True)
            return Response(
                {"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    @action(detail=True, methods=["post"])
    def unenroll_student(self, request, pk=None):
        """Unenroll a student from this classroom"""
        classroom = self.get_object()
        student_id = request.data.get("student_id")

        if not student_id:
            return Response(
                {"error": "student_id is required"}, status=status.HTTP_400_BAD_REQUEST
            )

        try:
            enrollment = StudentEnrollment.objects.get(
                student_id=student_id, classroom=classroom, is_active=True
            )
            enrollment.is_active = False
            enrollment.save()

            return Response({"message": "Student unenrolled successfully"})

        except StudentEnrollment.DoesNotExist:
            return Response(
                {"error": "Student enrollment not found"},
                status=status.HTTP_404_NOT_FOUND,
            )
        except Exception as e:
            logger.error(f"Error unenrolling student: {str(e)}", exc_info=True)
            return Response(
                {"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class ClassroomTeacherAssignmentViewSet(TenantFilterMixin, AutoSectionFilterMixin, viewsets.ModelViewSet):
    """ViewSet for ClassroomTeacherAssignment model"""

    queryset = ClassroomTeacherAssignment.objects.all()
    permission_classes = [IsAuthenticated]
    serializer_class = ClassroomTeacherAssignmentSerializer
    pagination_class = StandardResultsPagination  # PERFORMANCE: Paginate teacher assignments

    def get_queryset(self):
        # Let mixin handle section filtering
        queryset = super().get_queryset()
        return queryset.order_by("classroom__name")

    @action(detail=False, methods=["get"])
    def by_academic_year(self, request):
        """Get assignments by academic session"""
        academic_session_id = request.query_params.get("academic_session_id")
        if not academic_session_id:
            return Response(
                {"error": "academic_session_id parameter is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        queryset = self.get_queryset().filter(
            classroom__academic_session_id=academic_session_id
        )

        # PERFORMANCE: Add pagination to handle large datasets
        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)

        # Fallback if pagination is disabled
        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=["get"])
    def by_subject(self, request):
        """Get assignments by subject"""
        subject_id = request.query_params.get("subject_id")
        if not subject_id:
            return Response(
                {"error": "subject_id parameter is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        queryset = self.get_queryset().filter(subject_id=subject_id)

        # PERFORMANCE: Add pagination to handle large datasets
        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)

        # Fallback if pagination is disabled
        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=["get"])
    def workload_analysis(self, request):
        """Get workload analysis based on user's section access"""
        queryset = self.get_queryset()  # Already filtered

        teacher_workload = queryset.values(
            "teacher__user__first_name", "teacher__user__last_name"
        ).annotate(
            total_assignments=Count("id"),
            total_classrooms=Count("classroom", distinct=True),
            total_subjects=Count("subject", distinct=True),
        )

        return Response(
            {
                "teacher_workload": teacher_workload,
                "total_assignments": queryset.count(),
                "total_teachers": queryset.values("teacher").distinct().count(),
                "total_classrooms": queryset.values("classroom").distinct().count(),
                "total_subjects": queryset.values("subject").distinct().count(),
            }
        )


class StudentEnrollmentViewSet(TenantFilterMixin, AutoSectionFilterMixin, viewsets.ModelViewSet):
    """ViewSet for StudentEnrollment model"""

    queryset = StudentEnrollment.objects.all()
    permission_classes = [IsAuthenticated]
    serializer_class = StudentEnrollmentSerializer
    pagination_class = LargeResultsPagination  # PERFORMANCE: Paginate large enrollment datasets

    def get_queryset(self):
        # Let mixin handle section filtering
        queryset = super().get_queryset()
        return queryset.order_by("student__user__first_name")

    @action(detail=False, methods=["get"])
    def statistics(self, request):
        """Get enrollment statistics based on user's section access"""
        queryset = self.get_queryset()  # Already filtered

        total_enrollments = queryset.count()
        active_students = queryset.filter(student__is_active=True).count()

        # By education level
        nursery_enrollments = queryset.filter(
            classroom__section__grade_level__education_level="NURSERY"
        ).count()
        primary_enrollments = queryset.filter(
            classroom__section__grade_level__education_level="PRIMARY"
        ).count()
        junior_secondary_enrollments = queryset.filter(
            classroom__section__grade_level__education_level="JUNIOR_SECONDARY"
        ).count()
        senior_secondary_enrollments = queryset.filter(
            classroom__section__grade_level__education_level="SENIOR_SECONDARY"
        ).count()

        return Response(
            {
                "total_enrollments": total_enrollments,
                "active_students": active_students,
                "by_education_level": {
                    "nursery": nursery_enrollments,
                    "primary": primary_enrollments,
                    "junior_secondary": junior_secondary_enrollments,
                    "senior_secondary": senior_secondary_enrollments,
                },
            }
        )


class ClassScheduleViewSet(TenantFilterMixin, AutoSectionFilterMixin, viewsets.ModelViewSet):
    """ViewSet for ClassSchedule model"""

    queryset = ClassSchedule.objects.all()
    permission_classes = [IsAuthenticated]
    serializer_class = ClassScheduleSerializer
    pagination_class = StandardResultsPagination  # PERFORMANCE: Paginate schedules

    def get_queryset(self):
        # Let mixin handle section filtering
        queryset = super().get_queryset()
        return queryset.order_by("day_of_week", "start_time")

    @action(detail=False, methods=["get"])
    def by_classroom(self, request):
        """Get schedules by classroom"""
        classroom_id = request.query_params.get("classroom_id")
        if not classroom_id:
            return Response(
                {"error": "classroom_id parameter is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        schedules = self.get_queryset().filter(classroom_id=classroom_id)
        serializer = self.get_serializer(schedules, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=["get"])
    def by_teacher(self, request):
        """Get schedules by teacher"""
        teacher_id = request.query_params.get("teacher_id")
        if not teacher_id:
            return Response(
                {"error": "teacher_id parameter is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        schedules = self.get_queryset().filter(teacher_id=teacher_id)
        serializer = self.get_serializer(schedules, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=["get"])
    def by_subject(self, request):
        """Get schedules by subject"""
        subject_id = request.query_params.get("subject_id")
        if not subject_id:
            return Response(
                {"error": "subject_id parameter is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        schedules = self.get_queryset().filter(subject_id=subject_id)
        serializer = self.get_serializer(schedules, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=["get"])
    def conflicts(self, request):
        """Get schedule conflicts"""
        # Find overlapping schedules
        queryset = self.get_queryset()

        conflicts = []
        schedules = queryset.select_related("classroom", "teacher", "subject")

        for schedule in schedules:
            overlaps = queryset.filter(
                day_of_week=schedule.day_of_week,
                start_time__lt=schedule.end_time,
                end_time__gt=schedule.start_time,
            ).exclude(id=schedule.id)

            # Check for teacher conflicts
            teacher_conflicts = overlaps.filter(teacher=schedule.teacher)
            # Check for classroom conflicts
            classroom_conflicts = overlaps.filter(classroom=schedule.classroom)

            if teacher_conflicts.exists() or classroom_conflicts.exists():
                conflicts.append(
                    {
                        "schedule_id": schedule.id,
                        "day": schedule.day_of_week,
                        "time": f"{schedule.start_time} - {schedule.end_time}",
                        "classroom": schedule.classroom.name,
                        "teacher": schedule.teacher.user.get_full_name(),
                        "subject": schedule.subject.name,
                        "teacher_conflicts": teacher_conflicts.count(),
                        "classroom_conflicts": classroom_conflicts.count(),
                    }
                )

        return Response({"total_conflicts": len(conflicts), "conflicts": conflicts})

    @action(detail=False, methods=["get"])
    def daily_schedule(self, request):
        """Get daily schedule"""
        day = request.query_params.get("day")
        classroom_id = request.query_params.get("classroom_id")
        teacher_id = request.query_params.get("teacher_id")

        if not day:
            return Response(
                {"error": "day parameter is required (e.g., 'monday')"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        schedules = self.get_queryset().filter(day_of_week=day.lower())

        if classroom_id:
            schedules = schedules.filter(classroom_id=classroom_id)
        if teacher_id:
            schedules = schedules.filter(teacher_id=teacher_id)

        schedules = schedules.order_by("start_time")
        serializer = self.get_serializer(schedules, many=True)
        return Response(
            {
                "day": day,
                "total_classes": schedules.count(),
                "schedules": serializer.data,
            }
        )

    @action(detail=False, methods=["get"])
    def weekly_schedule(self, request):
        """Get weekly schedule"""
        classroom_id = request.query_params.get("classroom_id")
        teacher_id = request.query_params.get("teacher_id")

        queryset = self.get_queryset()

        if classroom_id:
            queryset = queryset.filter(classroom_id=classroom_id)
        if teacher_id:
            queryset = queryset.filter(teacher_id=teacher_id)

        # Group by day
        days = [
            "monday",
            "tuesday",
            "wednesday",
            "thursday",
            "friday",
            "saturday",
            "sunday",
        ]
        weekly_data = {}

        for day in days:
            day_schedules = queryset.filter(day_of_week=day).order_by("start_time")
            weekly_data[day] = self.get_serializer(day_schedules, many=True).data

        return Response(weekly_data)


# ==============================================================================
# FIXED: Teacher, Student, and Subject ViewSets from Classroom app
# ==============================================================================


class TeacherViewSet(TenantFilterMixin, AutoSectionFilterMixin, viewsets.ModelViewSet):
    """ViewSet for Teacher model"""

    queryset = Teacher.objects.all()
    permission_classes = [IsAuthenticated]
    serializer_class = TeacherSerializer
    pagination_class = StandardResultsPagination  # PERFORMANCE: Paginate teachers
    filter_backends = [
        DjangoFilterBackend,
        filters.SearchFilter,
        filters.OrderingFilter,
    ]
    filterset_fields = ["is_active", "specialization"]
    search_fields = ["user__first_name", "user__last_name", "employee_id"]
    ordering_fields = ["user__first_name", "user__last_name", "hire_date"]

    def get_queryset(self):
        # Let mixin handle section filtering
        queryset = super().get_queryset()
        return queryset.select_related("user").order_by(
            "user__first_name", "user__last_name"
        )

    @action(detail=True, methods=["get"])
    def classes(self, request, pk=None):
        """Get classes for a specific teacher"""
        teacher = self.get_object()

        # Get primary classes (where teacher is class_teacher)
        primary_classes = Classroom.objects.filter(class_teacher=teacher)
        primary_classes = self.apply_section_filters(primary_classes)

        # Get assigned classes (through ClassroomTeacherAssignment)
        assigned_classes = Classroom.objects.filter(
            classroomteacherassignment__teacher=teacher,
            classroomteacherassignment__is_active=True,
        ).distinct()
        assigned_classes = self.apply_section_filters(assigned_classes)

        primary_serializer = ClassroomSerializer(primary_classes, many=True)
        assigned_serializer = ClassroomSerializer(assigned_classes, many=True)

        return Response(
            {
                "primary_classes": primary_serializer.data,
                "assigned_classes": assigned_serializer.data,
                "total_classes": primary_classes.count() + assigned_classes.count(),
            }
        )

    @action(detail=True, methods=["get"])
    def subjects(self, request, pk=None):
        """Get subjects for a specific teacher"""
        teacher = self.get_object()
        assignments = teacher.classroomteacherassignment_set.filter(
            is_active=True
        ).select_related("subject")

        subjects = [assignment.subject for assignment in assignments]
        # Apply section filtering to subjects
        subjects_qs = Subject.objects.filter(id__in=[s.id for s in subjects])
        subjects_qs = self.apply_section_filters(subjects_qs)

        from subject.serializers import SubjectSerializer

        serializer = SubjectSerializer(subjects_qs, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=["get"])
    def schedule(self, request, pk=None):
        """Get schedule for a specific teacher"""
        teacher = self.get_object()
        schedules = ClassSchedule.objects.filter(
            teacher=teacher, is_active=True
        ).select_related("classroom", "subject")

        # Apply section filtering
        schedules = self.apply_section_filters(schedules)

        serializer = ClassScheduleSerializer(schedules, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=["get"])
    def workload(self, request, pk=None):
        """Get workload for a specific teacher"""
        teacher = self.get_object()

        # Get filtered classes
        primary_classes = Classroom.objects.filter(class_teacher=teacher)
        primary_classes = self.apply_section_filters(primary_classes)

        assigned_classes = Classroom.objects.filter(
            classroomteacherassignment__teacher=teacher,
            classroomteacherassignment__is_active=True,
        ).distinct()
        assigned_classes = self.apply_section_filters(assigned_classes)

        total_subjects = teacher.classroomteacherassignment_set.filter(
            is_active=True
        ).count()

        return Response(
            {
                "primary_classes_count": primary_classes.count(),
                "assigned_classes_count": assigned_classes.count(),
                "total_subjects": total_subjects,
                "total_workload": primary_classes.count() + assigned_classes.count(),
            }
        )


class StudentViewSet(TenantFilterMixin, AutoSectionFilterMixin, viewsets.ModelViewSet):
    """
    ViewSet for Student model
    FIXED: Was using Classroom.objects, now uses Student.objects
    """

    queryset = Student.objects.all()
    permission_classes = [IsAuthenticated]
    serializer_class = None  # You need to add StudentSerializer
    pagination_class = LargeResultsPagination  # PERFORMANCE: Paginate large student datasets
    filter_backends = [
        DjangoFilterBackend,
        filters.SearchFilter,
        filters.OrderingFilter,
    ]
    search_fields = ["user__first_name", "user__last_name", "admission_number"]
    ordering_fields = ["user__first_name", "user__last_name"]

    def get_queryset(self):
        # Let mixin handle section filtering
        queryset = super().get_queryset()
        return queryset.select_related("user").order_by("user__first_name")

    @action(detail=True, methods=["get"])
    def current_class(self, request, pk=None):
        """Get current class for a specific student"""
        student = self.get_object()

        # Get current active enrollment
        enrollment = (
            StudentEnrollment.objects.filter(student=student, is_active=True)
            .select_related("classroom")
            .first()
        )

        if not enrollment:
            return Response({"message": "Student not currently enrolled in any class"})

        classroom = enrollment.classroom
        serializer = ClassroomSerializer(classroom)
        return Response(serializer.data)

    @action(detail=True, methods=["get"])
    def subjects(self, request, pk=None):
        """Get subjects for a specific student based on their classroom"""
        student = self.get_object()

        # Get student's current classroom
        enrollment = (
            StudentEnrollment.objects.filter(student=student, is_active=True)
            .select_related("classroom")
            .first()
        )

        if not enrollment:
            return Response({"message": "Student not currently enrolled"})

        # Get subjects for that classroom
        subjects = Subject.objects.filter(
            classroomteacherassignment__classroom=enrollment.classroom,
            classroomteacherassignment__is_active=True,
        ).distinct()

        from subject.serializers import SubjectSerializer

        serializer = SubjectSerializer(subjects, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=["get"])
    def schedule(self, request, pk=None):
        """Get schedule for a specific student"""
        student = self.get_object()

        # Get student's current classroom
        enrollment = (
            StudentEnrollment.objects.filter(student=student, is_active=True)
            .select_related("classroom")
            .first()
        )

        if not enrollment:
            return Response({"message": "Student not currently enrolled"})

        # Get classroom schedule
        schedules = (
            ClassSchedule.objects.filter(classroom=enrollment.classroom, is_active=True)
            .select_related("subject", "teacher__user")
            .order_by("day_of_week", "start_time")
        )

        serializer = ClassScheduleSerializer(schedules, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=["get"])
    def enrollment_history(self, request, pk=None):
        """Get enrollment history for a specific student"""
        student = self.get_object()

        enrollments = (
            StudentEnrollment.objects.filter(student=student)
            .select_related("classroom__section__grade_level")
            .order_by("-enrollment_date")
        )

        serializer = StudentEnrollmentSerializer(enrollments, many=True)
        return Response(
            {"total_enrollments": enrollments.count(), "enrollments": serializer.data}
        )


class SubjectViewSet(TenantFilterMixin, AutoSectionFilterMixin, viewsets.ModelViewSet):
    """ViewSet for Subject model"""

    queryset = Subject.objects.all()
    permission_classes = [IsAuthenticated]
    serializer_class = SubjectSerializer
    pagination_class = StandardResultsPagination  # PERFORMANCE: Paginate subjects
    filter_backends = [
        DjangoFilterBackend,
        filters.SearchFilter,
        filters.OrderingFilter,
    ]
    filterset_fields = ["category", "is_active", "is_compulsory"]
    search_fields = ["name", "code", "description"]
    ordering_fields = ["name", "code", "subject_order"]

    def get_queryset(self):
        # Let mixin handle section filtering
        queryset = super().get_queryset()
        return queryset.order_by("name")

    @action(detail=False, methods=["get"])
    def by_category(self, request):
        """Get subjects grouped by category"""
        from subject.models import SUBJECT_CATEGORY_CHOICES

        queryset = self.get_queryset()
        grouped = {}

        for category_code, category_name in SUBJECT_CATEGORY_CHOICES:
            subjects = queryset.filter(category=category_code)
            grouped[category_code] = {
                "name": category_name,
                "count": subjects.count(),
                "subjects": self.get_serializer(subjects, many=True).data,
            }

        return Response(grouped)

    @action(detail=False, methods=["get"])
    def by_education_level(self, request):
        """Get subjects grouped by education level"""
        from subject.models import EDUCATION_LEVELS

        queryset = self.get_queryset()
        grouped = {}

        for level_code, level_name in EDUCATION_LEVELS:
            subjects = queryset.filter(education_level=level_code)
            grouped[level_code] = {
                "name": level_name,
                "count": subjects.count(),
                "subjects": self.get_serializer(subjects, many=True).data,
            }

        return Response(grouped)

    @action(detail=False, methods=["get"])
    def nursery_subjects(self, request):
        """Get nursery subjects"""
        subjects = self.get_queryset().filter(education_level="NURSERY")
        serializer = self.get_serializer(subjects, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=["get"])
    def senior_secondary_subjects(self, request):
        """Get senior secondary subjects"""
        subjects = self.get_queryset().filter(education_level="SENIOR_SECONDARY")
        serializer = self.get_serializer(subjects, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=["get"])
    def cross_cutting_subjects(self, request):
        """Get cross-cutting subjects"""
        subjects = self.get_queryset().filter(is_cross_cutting=True)
        serializer = self.get_serializer(subjects, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=["get"])
    def for_grade(self, request):
        """Get subjects for a specific grade"""
        grade_id = request.query_params.get("grade_id")
        if not grade_id:
            return Response(
                {"error": "grade_id parameter is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Get subjects for this grade level
        subjects = (
            self.get_queryset()
            .filter(Q(grade_levels__id=grade_id) | Q(is_cross_cutting=True))
            .distinct()
        )

        serializer = self.get_serializer(subjects, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=["get"])
    def statistics(self, request):
        """Get subject statistics"""
        queryset = self.get_queryset()

        return Response(
            {
                "total_subjects": queryset.count(),
                "active_subjects": queryset.filter(is_active=True).count(),
                "compulsory_subjects": queryset.filter(is_compulsory=True).count(),
                "elective_subjects": queryset.filter(is_compulsory=False).count(),
                "cross_cutting_subjects": queryset.filter(
                    is_cross_cutting=True
                ).count(),
                "with_practicals": queryset.filter(has_practical=True).count(),
            }
        )

    @action(detail=True, methods=["get"])
    def prerequisites(self, request, pk=None):
        """Get prerequisites for a subject"""
        subject = self.get_object()
        prerequisites = subject.prerequisites.all()
        serializer = self.get_serializer(prerequisites, many=True)
        return Response({"subject": subject.name, "prerequisites": serializer.data})


class SubjectAnalyticsViewSet(TenantFilterMixin, AutoSectionFilterMixin, viewsets.ReadOnlyModelViewSet):
    """
    ViewSet for Subject analytics (read-only)
    FIXED: Was using Classroom.objects, now uses Subject.objects
    """

    queryset = Subject.objects.all()
    permission_classes = [IsAuthenticated]
    serializer_class = SubjectSerializer
    pagination_class = StandardResultsPagination  # PERFORMANCE: Paginate subject analytics

    def get_queryset(self):
        # Let mixin handle section filtering
        queryset = super().get_queryset()
        return queryset.order_by("name")


class SubjectManagementViewSet(TenantFilterMixin, AutoSectionFilterMixin, viewsets.ModelViewSet):
    """
    ViewSet for Subject management (admin only)
    FIXED: Was using Classroom.objects, now uses Subject.objects
    """

    queryset = Subject.objects.all()
    permission_classes = [IsAdminUser]
    serializer_class = SubjectSerializer
    pagination_class = StandardResultsPagination  # PERFORMANCE: Paginate subject management

    def get_queryset(self):
        # Let mixin handle section filtering
        queryset = super().get_queryset()
        return queryset.order_by("name")


@api_view(["GET"])
def health_check(request):
    """
    Enhanced health check endpoint for monitoring API status with system information
    """
    try:
        # Basic database connectivity check
        total_subjects = Subject.objects.count()
        active_subjects = Subject.objects.filter(is_active=True).count()

        # Check cache connectivity
        cache_key = "health_check_test"
        cache.set(cache_key, "test", 10)
        cache_working = cache.get(cache_key) == "test"
        cache.delete(cache_key)

        return Response(
            {
                "status": "healthy",
                "timestamp": timezone.now().isoformat(),
                "version": "v2.0",
                "service": "nigerian-education-subjects-api",
                "system_info": {
                    "database": {
                        "connected": True,
                        "total_subjects": total_subjects,
                        "active_subjects": active_subjects,
                    },
                    "cache": {
                        "connected": cache_working,
                        "backend": getattr(settings, "CACHES", {})
                        .get("default", {})
                        .get("BACKEND", "unknown"),
                    },
                    "education_system": {
                        "total_education_levels": len(EDUCATION_LEVELS),
                        "total_subject_categories": len(SUBJECT_CATEGORY_CHOICES),
                        "nursery_levels": len(NURSERY_LEVELS),
                        "ss_subject_types": len(SS_SUBJECT_TYPES),
                    },
                },
                "endpoints": {
                    "subjects": "/api/v1/subjects/",
                    "analytics": "/api/v1/analytics/subjects/",
                    "management": "/api/v1/management/subjects/",
                    "health": "/api/v1/health/",
                },
            }
        )
    except Exception as e:
        logger.error(f"Health check failed: {str(e)}")
        return Response(
            {
                "status": "unhealthy",
                "timestamp": timezone.now().isoformat(),
                "error": str(e),
                "service": "nigerian-education-subjects-api",
            },
            status=500,
        )


class SubjectByEducationLevelView(APIView):
    """
    Enhanced view for retrieving subjects by education level with detailed information
    """

    permission_classes = [IsAuthenticated]

    @method_decorator(cache_page(60 * 10))
    def get(self, request):
        """
        Get subjects filtered by education level with comprehensive information
        """

        level = request.query_params.get("level")
        if not level:
            return Response(
                {
                    "error": "Missing 'level' query parameter.",
                    "valid_levels": [code for code, _ in EDUCATION_LEVELS],
                    "example": "/api/v1/subjects/by-level/?level=PRIMARY",
                },
                status=400,
            )

        # Validate education level
        valid_levels = [code for code, _ in EDUCATION_LEVELS]
        if level not in valid_levels:
            return Response(
                {
                    "error": f"Invalid education level: {level}",
                    "valid_levels": valid_levels,
                },
                status=400,
            )

        # Base queryset
        queryset = Subject.objects.filter(
            education_levels__contains=[level]
        ).prefetch_related("grade_levels", "prerequisites")

        # Additional filters
        active_only = request.query_params.get("active_only", "true").lower() == "true"
        include_discontinued = (
            request.query_params.get("include_discontinued", "false").lower() == "true"
        )

        if active_only:
            queryset = queryset.filter(is_active=True)

        if not include_discontinued:
            queryset = queryset.filter(is_discontinued=False)

        # Nursery level filter
        nursery_level = request.query_params.get("nursery_level")
        if nursery_level and level == "NURSERY":
            valid_nursery_levels = [code for code, _ in NURSERY_LEVELS]
            if nursery_level in valid_nursery_levels:
                queryset = queryset.filter(nursery_levels__contains=[nursery_level])

        # SS subject type filter
        ss_type = request.query_params.get("ss_type")
        if ss_type and level == "SENIOR_SECONDARY":
            valid_ss_types = [code for code, _ in SS_SUBJECT_TYPES]
            if ss_type in valid_ss_types:
                queryset = queryset.filter(ss_subject_type=ss_type)

        # Category filter
        category = request.query_params.get("category")
        if category:
            valid_categories = [code for code, _ in SUBJECT_CATEGORY_CHOICES]
            if category in valid_categories:
                queryset = queryset.filter(category=category)

        queryset = queryset.order_by("category", "subject_order", "name")

        serializer = SubjectEducationLevelSerializer(
            queryset, many=True, context={"request": request}
        )

        response_data = {
            "education_level": {
                "code": level,
                "name": dict(EDUCATION_LEVELS).get(level, level),
            },
            "filters_applied": {
                "active_only": active_only,
                "include_discontinued": include_discontinued,
                "nursery_level": nursery_level,
                "ss_type": ss_type,
                "category": category,
            },
            "summary": {
                "total_count": queryset.count(),
                "compulsory_count": queryset.filter(is_compulsory=True).count(),
                "elective_count": queryset.filter(is_compulsory=False).count(),
                "with_practicals": queryset.filter(has_practical=True).count(),
                "activity_based": queryset.filter(is_activity_based=True).count(),
                "cross_cutting": queryset.filter(is_cross_cutting=True).count(),
                "requires_specialist": queryset.filter(
                    requires_specialist_teacher=True
                ).count(),
            },
            "subjects": serializer.data,
        }

        if level == "NURSERY":
            response_data["nursery_breakdown"] = self._get_nursery_breakdown(queryset)
        elif level == "SENIOR_SECONDARY":
            response_data["ss_breakdown"] = self._get_ss_breakdown(queryset)

        return Response(response_data)

    def _get_nursery_breakdown(self, queryset):
        breakdown = {}
        for level_code, level_name in NURSERY_LEVELS:
            level_subjects = queryset.filter(nursery_levels__contains=[level_code])
            breakdown[level_code] = {
                "name": level_name,
                "count": level_subjects.count(),
                "activity_based_count": level_subjects.filter(
                    is_activity_based=True
                ).count(),
            }
        return breakdown

    def _get_ss_breakdown(self, queryset):
        breakdown = {}
        for type_code, type_name in SS_SUBJECT_TYPES:
            type_subjects = queryset.filter(ss_subject_type=type_code)
            breakdown[type_code] = {
                "name": type_name,
                "count": type_subjects.count(),
                "compulsory_count": type_subjects.filter(is_compulsory=True).count(),
            }
        return breakdown


# ==============================================================================
# QUICK SEARCH VIEW
# ==============================================================================
class SubjectQuickSearchView(APIView):
    """
    Lightweight search endpoint for autocomplete and quick lookups
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        """
        Quick search for subjects with minimal data transfer

        Query Parameters:
        - q: Search query (minimum 2 characters)
        - limit: Maximum results (default: 10, max: 25)
        - education_level: Filter by education level
        - category: Filter by category
        """
        query = request.query_params.get("q", "").strip()
        if len(query) < 2:
            return Response(
                {
                    "error": "Search query must be at least 2 characters long",
                    "suggestions": [],
                }
            )

        # Parse limit
        try:
            limit = min(int(request.query_params.get("limit", 10)), 25)
        except ValueError:
            limit = 10

        # Build search queryset
        search_filter = (
            Q(name__icontains=query)
            | Q(short_name__icontains=query)
            | Q(code__icontains=query)
            | Q(description__icontains=query)
        )

        queryset = Subject.objects.filter(
            search_filter, is_active=True, is_discontinued=False
        )

        # Apply additional filters
        education_level = request.query_params.get("education_level")
        if education_level:
            queryset = queryset.filter(education_levels__contains=[education_level])

        category = request.query_params.get("category")
        if category:
            queryset = queryset.filter(category=category)

        # Get results
        subjects = queryset.values(
            "id",
            "name",
            "short_name",
            "code",
            "category",
            "education_levels",
            "is_compulsory",
            "is_cross_cutting",
            "is_activity_based",
            "credit_hours",
        ).order_by("name")[:limit]

        # Format results
        suggestions = []
        for subject in subjects:
            display_name = subject["short_name"] or subject["name"]

            # Build education levels display
            education_display = []
            if subject["education_levels"]:
                level_dict = dict(EDUCATION_LEVELS)
                education_display = [
                    level_dict.get(level, level)
                    for level in subject["education_levels"]
                ]

            # Build badges
            badges = []
            if subject["is_compulsory"]:
                badges.append("Compulsory")
            if subject["is_cross_cutting"]:
                badges.append("Cross-cutting")
            if subject["is_activity_based"]:
                badges.append("Activity-based")

            suggestions.append(
                {
                    "id": subject["id"],
                    "name": subject["name"],
                    "display_name": display_name,
                    "code": subject["code"],
                    "label": f"{display_name} ({subject['code']})",
                    "category": dict(SUBJECT_CATEGORY_CHOICES).get(subject["category"]),
                    "education_levels": ", ".join(education_display),
                    "credit_hours": subject["credit_hours"],
                    "badges": badges,
                }
            )

        return Response(
            {
                "query": query,
                "count": len(suggestions),
                "total_found": queryset.count(),
                "suggestions": suggestions,
            }
        )


# ==============================================================================
# SUBJECT COMPARISON VIEW
# ==============================================================================
class SubjectComparisonView(APIView):
    """
    Compare multiple subjects side by side
    """

    permission_classes = [IsAuthenticated]

    def post(self, request):
        """
        Compare subjects by their IDs

        Request body:
        {
            "subject_ids": [1, 2, 3, ...]
        }
        """
        subject_ids = request.data.get("subject_ids", [])

        if not subject_ids or not isinstance(subject_ids, list):
            return Response(
                {"error": "Please provide a list of subject_ids in the request body"},
                status=400,
            )

        if len(subject_ids) > 5:
            return Response(
                {"error": "Maximum 5 subjects can be compared at once"}, status=400
            )

        # Get subjects
        subjects = Subject.objects.filter(
            id__in=subject_ids, is_active=True
        ).prefetch_related("prerequisites", "grade_levels")

        if not subjects:
            return Response(
                {"error": "No valid subjects found for the provided IDs"}, status=404
            )

        # Build comparison data
        comparison_data = []
        for subject in subjects:
            comparison_data.append(
                {
                    "id": subject.id,
                    "name": subject.name,
                    "short_name": subject.short_name,
                    "code": subject.code,
                    "category": {
                        "code": subject.category,
                        "name": subject.get_category_display(),
                        "icon": subject.get_category_display_with_icon(),
                    },
                    "education_levels": {
                        "codes": subject.education_levels,
                        "display": subject.education_levels_display,
                    },
                    "academic_info": {
                        "is_compulsory": subject.is_compulsory,
                        "is_core": subject.is_core,
                        "is_cross_cutting": subject.is_cross_cutting,
                        "credit_hours": subject.credit_hours,
                        "practical_hours": subject.practical_hours,
                        "total_weekly_hours": subject.total_weekly_hours,
                        "pass_mark": subject.pass_mark,
                    },
                    "practical_requirements": {
                        "has_practical": subject.has_practical,
                        "requires_lab": subject.requires_lab,
                        "requires_special_equipment": subject.requires_special_equipment,
                        "equipment_notes": subject.equipment_notes,
                    },
                    "teaching_requirements": {
                        "requires_specialist_teacher": subject.requires_specialist_teacher,
                    },
                    "assessment": {
                        "has_continuous_assessment": subject.has_continuous_assessment,
                        "has_final_exam": subject.has_final_exam,
                    },
                    "prerequisites": {
                        "count": subject.prerequisites.count(),
                        "subjects": [
                            {
                                "id": prereq.id,
                                "name": prereq.display_name,
                                "code": prereq.code,
                            }
                            for prereq in subject.prerequisites.all()
                        ],
                    },
                    "special_attributes": {
                        "is_activity_based": subject.is_activity_based,
                        "nursery_levels": (
                            subject.nursery_levels_display
                            if subject.is_nursery_subject
                            else None
                        ),
                        "ss_subject_type": (
                            subject.get_ss_subject_type_display()
                            if subject.ss_subject_type
                            else None
                        ),
                    },
                }
            )

        return Response(
            {
                "comparison_count": len(comparison_data),
                "subjects": comparison_data,
                "summary": {
                    "total_credit_hours": sum(s.credit_hours for s in subjects),
                    "total_practical_hours": sum(s.practical_hours for s in subjects),
                    "subjects_with_practicals": sum(
                        1 for s in subjects if s.has_practical
                    ),
                    "compulsory_subjects": sum(1 for s in subjects if s.is_compulsory),
                    "cross_cutting_subjects": sum(
                        1 for s in subjects if s.is_cross_cutting
                    ),
                },
            }
        )


# ==============================================================================
# UTILITY FUNCTIONS
# ==============================================================================
def clear_subject_caches():
    """
    Enhanced helper function to clear all subject-related caches
    """
    cache_keys = [
        # Legacy cache keys
        "subjects_statistics",
        "subjects_statistics_v2",
        "subjects_by_category",
        "subjects_by_category_v2",
        "active_subjects_count",
        # New cache keys from enhanced model
        "subjects_cache_v1",
        "subjects_by_category_v3",
        "subjects_by_education_level_v2",
        "nursery_subjects_v1",
        "ss_subjects_by_type_v1",
        "cross_cutting_subjects_v1",
        "subject_statistics_v1",
        # Pattern-based cache clearing
        "subject_*",
        "education_level_*",
        "nursery_*",
        "ss_*",
    ]

    try:
        cache.delete_many(cache_keys)

        # If using Redis or similar, also clear pattern-based keys
        if hasattr(cache, "delete_pattern"):
            patterns = ["subject_*", "education_*", "nursery_*", "ss_*"]
            for pattern in patterns:
                cache.delete_pattern(pattern)

        logger.info("Subject caches cleared successfully")
        return True
    except Exception as e:
        logger.error(f"Error clearing subject caches: {str(e)}")
        return False


@api_view(["POST"])
@permission_classes([IsAdminUser])
def clear_caches_endpoint(request):
    """
    API endpoint to manually clear caches (admin only)
    """
    success = clear_subject_caches()

    if success:
        return Response(
            {
                "status": "success",
                "message": "Subject caches cleared successfully",
                "timestamp": timezone.now().isoformat(),
            }
        )
    else:
        return Response(
            {
                "status": "error",
                "message": "Failed to clear some caches",
                "timestamp": timezone.now().isoformat(),
            },
            status=500,
        )


# ==============================================================================
# SYSTEM INFO ENDPOINT
# ==============================================================================
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def system_info(request):
    """
    Get comprehensive system information about the subjects API
    """
    try:
        # Get database statistics
        total_subjects = Subject.objects.count()
        active_subjects = Subject.objects.filter(is_active=True).count()
        discontinued_subjects = Subject.objects.filter(is_discontinued=True).count()

        # Education level statistics
        education_stats = {}
        for level_code, level_name in EDUCATION_LEVELS:
            count = Subject.objects.filter(
                education_levels__contains=[level_code], is_active=True
            ).count()
            education_stats[level_code] = {"name": level_name, "count": count}

        # Category statistics
        category_stats = {}
        for category_code, category_name in SUBJECT_CATEGORY_CHOICES:
            count = Subject.objects.filter(
                category=category_code, is_active=True
            ).count()
            category_stats[category_code] = {"name": category_name, "count": count}

        return Response(
            {
                "system": {
                    "service_name": "Nigerian Education Subjects API",
                    "version": "v2.0",
                    "timestamp": timezone.now().isoformat(),
                },
                "database": {
                    "total_subjects": total_subjects,
                    "active_subjects": active_subjects,
                    "discontinued_subjects": discontinued_subjects,
                    "utilization_rate": (
                        f"{(active_subjects/total_subjects*100):.1f}%"
                        if total_subjects > 0
                        else "0%"
                    ),
                },
                "education_system": {
                    "levels": education_stats,
                    "categories": category_stats,
                    "special_counts": {
                        "cross_cutting": Subject.objects.filter(
                            is_cross_cutting=True, is_active=True
                        ).count(),
                        "activity_based": Subject.objects.filter(
                            is_activity_based=True, is_active=True
                        ).count(),
                        "with_practicals": Subject.objects.filter(
                            has_practical=True, is_active=True
                        ).count(),
                        "requires_specialist": Subject.objects.filter(
                            requires_specialist_teacher=True, is_active=True
                        ).count(),
                    },
                },
                "configuration": {
                    "education_levels": dict(EDUCATION_LEVELS),
                    "nursery_levels": dict(NURSERY_LEVELS),
                    "ss_subject_types": dict(SS_SUBJECT_TYPES),
                    "subject_categories": dict(SUBJECT_CATEGORY_CHOICES),
                },
            }
        )
    except Exception as e:
        logger.error(f"System info endpoint failed: {str(e)}")
        return Response(
            {
                "error": "Failed to retrieve system information",
                "timestamp": timezone.now().isoformat(),
            },
            status=500,
        )
