from rest_framework import viewsets, status, filters
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django_filters.rest_framework import DjangoFilterBackend
from django.db.models import Q, Prefetch, Count, Avg
from django.utils.decorators import method_decorator
from django.views.decorators.cache import cache_page
from django.core.cache import cache
from django.db import transaction
from django.utils import timezone
from datetime import datetime, timedelta
from .models import Lesson, LessonAttendance, LessonResource, LessonAssessment
from .serializers import (
    LessonSerializer,
    LessonListSerializer,
    LessonCreateSerializer,
    LessonUpdateSerializer,
    LessonStatusUpdateSerializer,
    LessonBulkCreateSerializer,
    LessonAttendanceSerializer,
    LessonResourceSerializer,
    LessonAssessmentSerializer,
)
from teacher.models import Teacher, TeacherSchedule
from parent.models import (
    ParentProfile as Parent,
    ParentStudentRelationship as StudentParentRelationship,
)
from teacher.serializers import TeacherSerializer
from subject.models import Subject
from subject.serializers import SubjectSerializer
from classroom.models import Classroom
from classroom.serializers import ClassroomSerializer, SectionSerializer
import logging

logger = logging.getLogger(__name__)


class LessonViewSet(viewsets.ModelViewSet):
    """
    Multi-role ViewSet for Lesson CRUD operations with comprehensive access control.

    Access Control:
    - Superadmin: See all lessons from all teachers
    - Section Admin: See only lessons in their section
    - Teacher: See only lessons they created
    - Student: See lessons for their enrolled classes and subjects
    - Parent: See lessons for their children's enrolled classes and subjects
    """

    queryset = Lesson.objects.all()
    permission_classes = [IsAuthenticated]

    filter_backends = [
        DjangoFilterBackend,
        filters.SearchFilter,
        filters.OrderingFilter,
    ]

    filterset_fields = {
        "status": ["exact", "in"],
        "lesson_type": ["exact", "in"],
        "difficulty_level": ["exact", "in"],
        "date": ["exact", "gte", "lte", "range"],
        "teacher_id": ["exact", "in"],
        "classroom_id": ["exact", "in"],
        "subject_id": ["exact", "in"],
        "is_recurring": ["exact"],
        "requires_special_equipment": ["exact"],
        "is_online_lesson": ["exact"],
        "is_active": ["exact"],
        "completion_percentage": ["exact", "gte", "lte"],
    }

    search_fields = [
        "title",
        "description",
        "teacher__user__first_name",
        "teacher__user__last_name",
        "classroom__name",
        "subject__name",
        "teacher_notes",
        "lesson_notes",
    ]

    ordering_fields = [
        "date",
        "start_time",
        "title",
        "status",
        "completion_percentage",
        "created_at",
        "updated_at",
    ]

    ordering = ["-date", "start_time"]

    def get_serializer_class(self):
        """Return appropriate serializer based on action"""
        serializer_map = {
            "list": LessonListSerializer,
            "create": LessonCreateSerializer,
            "update": LessonUpdateSerializer,
            "partial_update": LessonUpdateSerializer,
            "bulk_create": LessonBulkCreateSerializer,
            "update_status": LessonStatusUpdateSerializer,
            "calendar": LessonListSerializer,
            "statistics": LessonListSerializer,
        }
        return serializer_map.get(self.action, LessonSerializer)

    def _get_section_education_levels(self, user):
        """
        Helper method to get education levels based on user's section/role
        Returns a list of education levels the user can access
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

        user_section = getattr(user, "section", None)
        user_role = getattr(user, "role", None)

        if not user_section and user_role in ROLE_TO_SECTION:
            user_section = ROLE_TO_SECTION[user_role]

        return SECTION_TO_EDUCATION_LEVEL.get(user_section, [])

    def get_user_role_info(self):
        """
        Determine user role and get relevant instances.
        Returns tuple: (role, instance, additional_info)
        """
        user = self.request.user

        # Check Superadmin role FIRST
        if user.is_superuser:
            return ("superadmin", None, {})

        # Check Section Admin role
        if user.is_staff and getattr(user, "is_section_admin", False):
            education_levels = self._get_section_education_levels(user)
            return ("section_admin", None, {"education_levels": education_levels})

        # Check Regular Admin/Staff
        if user.is_staff:
            return ("admin", None, {})

        # Check Teacher role
        try:
            teacher = Teacher.objects.get(user=user, is_active=True)
            return ("teacher", teacher, {})
        except Teacher.DoesNotExist:
            pass

        # Check Student role
        try:
            from students.models import Student, StudentEnrollment

            student = Student.objects.get(user=user, is_active=True)

            enrollments = StudentEnrollment.objects.filter(
                student=student, is_active=True
            ).select_related("classroom", "classroom__section__grade_level")

            enrolled_classrooms = [enrollment.classroom for enrollment in enrollments]

            return (
                "student",
                student,
                {
                    "enrolled_classrooms": enrolled_classrooms,
                    "enrollments": enrollments,
                },
            )
        except Exception:
            pass

        # Check Parent role
        try:
            parent = Parent.objects.get(user=user, is_active=True)

            relationships = StudentParentRelationship.objects.filter(
                parent=parent, is_active=True
            ).select_related("student")

            children = [rel.student for rel in relationships if rel.student.is_active]

            from students.models import StudentEnrollment

            children_classrooms = []
            children_enrollments = []

            for child in children:
                child_enrollments = StudentEnrollment.objects.filter(
                    student=child, is_active=True
                ).select_related("classroom", "classroom__section__grade_level")

                children_enrollments.extend(child_enrollments)
                children_classrooms.extend(
                    [enrollment.classroom for enrollment in child_enrollments]
                )

            return (
                "parent",
                parent,
                {
                    "children": children,
                    "children_classrooms": list(set(children_classrooms)),
                    "children_enrollments": children_enrollments,
                },
            )
        except Exception:
            pass

        return ("unknown", None, {})

    def get_queryset(self):
        """
        Multi-role queryset filtering with optimized prefetching.
        """
        queryset = Lesson.objects.select_related(
            "teacher__user",
            "classroom__section__grade_level",
            "subject",
            "created_by",
            "last_modified_by",
        ).prefetch_related("attendances__student__user")

        role, instance, additional_info = self.get_user_role_info()

        # Apply role-based filtering
        if role == "superadmin":
            logger.info(
                f"Superadmin {self.request.user.username} accessing all lessons"
            )

        elif role == "section_admin":
            education_levels = additional_info.get("education_levels", [])
            if education_levels:
                queryset = queryset.filter(
                    classroom__section__grade_level__education_level__in=education_levels
                )
                logger.info(
                    f"Section admin {self.request.user.username} "
                    f"accessing lessons for education levels: {education_levels}"
                )
            else:
                queryset = queryset.none()
                logger.warning(
                    f"Section admin {self.request.user.username} has no valid section"
                )

        elif role == "admin":
            logger.info(
                f"Admin/Staff {self.request.user.username} accessing all lessons"
            )

        elif role == "teacher":
            queryset = queryset.filter(teacher=instance)
            logger.info(
                f"Teacher {self.request.user.username} accessing their lessons only"
            )

        elif role == "student":
            enrolled_classrooms = additional_info.get("enrolled_classrooms", [])
            if enrolled_classrooms:
                queryset = queryset.filter(classroom__in=enrolled_classrooms)
                logger.info(
                    f"Student {self.request.user.username} accessing lessons for "
                    f"{len(enrolled_classrooms)} classrooms"
                )
            else:
                queryset = queryset.none()
                logger.warning(
                    f"Student {self.request.user.username} has no active enrollments"
                )

        elif role == "parent":
            children_classrooms = additional_info.get("children_classrooms", [])
            if children_classrooms:
                queryset = queryset.filter(classroom__in=children_classrooms)
                logger.info(
                    f"Parent {self.request.user.username} accessing lessons for "
                    f"{len(children_classrooms)} children's classrooms"
                )
            else:
                queryset = queryset.none()
                logger.warning(
                    f"Parent {self.request.user.username} has no active children or enrollments"
                )

        else:
            logger.warning(
                f"User {self.request.user.username} has unknown role, returning empty queryset"
            )
            queryset = queryset.none()

        # Apply additional filters
        if hasattr(self.request, "query_params"):
            date_from = self.request.query_params.get("date_from")
            date_to = self.request.query_params.get("date_to")
            if date_from:
                queryset = queryset.filter(date__gte=date_from)
            if date_to:
                queryset = queryset.filter(date__lte=date_to)

            date_filter = self.request.query_params.get("date_filter")
            if date_filter:
                today = timezone.now().date()
                if date_filter == "today":
                    queryset = queryset.filter(date=today)
                elif date_filter == "tomorrow":
                    tomorrow = today + timedelta(days=1)
                    queryset = queryset.filter(date=tomorrow)
                elif date_filter == "this_week":
                    week_start = today - timedelta(days=today.weekday())
                    week_end = week_start + timedelta(days=6)
                    queryset = queryset.filter(date__range=[week_start, week_end])
                elif date_filter == "next_week":
                    next_week_start = today + timedelta(days=7 - today.weekday())
                    next_week_end = next_week_start + timedelta(days=6)
                    queryset = queryset.filter(
                        date__range=[next_week_start, next_week_end]
                    )
                elif date_filter == "overdue":
                    queryset = queryset.filter(
                        date__lt=today, status__in=["scheduled", "in_progress"]
                    )

            status_filter = self.request.query_params.get("status_filter")
            if status_filter:
                if status_filter == "active":
                    queryset = queryset.filter(status__in=["scheduled", "in_progress"])
                elif status_filter == "completed":
                    queryset = queryset.filter(status="completed")
                elif status_filter == "cancelled":
                    queryset = queryset.filter(status="cancelled")

            teacher_id = self.request.query_params.get("teacher_id")
            if teacher_id and role in ["superadmin", "admin", "section_admin"]:
                queryset = queryset.filter(teacher_id=teacher_id)

            classroom_id = self.request.query_params.get("classroom_id")
            if classroom_id:
                queryset = queryset.filter(classroom_id=classroom_id)

            subject_id = self.request.query_params.get("subject_id")
            if subject_id:
                queryset = queryset.filter(subject_id=subject_id)

            stream_filter = self.request.query_params.get("stream_filter")
            if stream_filter:
                queryset = queryset.filter(classroom__stream__name=stream_filter)

        return queryset

    def can_modify_lesson(self, lesson):
        """Check if user can modify a specific lesson"""
        role, instance, additional_info = self.get_user_role_info()

        if role in ["superadmin", "admin"]:
            return True
        elif role == "section_admin":
            education_levels = additional_info.get("education_levels", [])
            if hasattr(lesson, "classroom") and hasattr(lesson.classroom, "section"):
                lesson_education_level = (
                    lesson.classroom.section.grade_level.education_level
                )
                return lesson_education_level in education_levels
            return False
        elif role == "teacher" and lesson.teacher == instance:
            return True
        else:
            return False

    def perform_create(self, serializer):
        """Create with role-based validation and automatic assignments"""
        role, instance, _ = self.get_user_role_info()

        if role not in ["superadmin", "admin", "section_admin", "teacher"]:
            from rest_framework.exceptions import PermissionDenied

            raise PermissionDenied(
                "Only administrators and teachers can create lessons"
            )

        with transaction.atomic():
            if role == "teacher":
                serializer.validated_data["teacher"] = instance

            lesson = serializer.save()
            logger.info(
                f"Lesson '{lesson.title}' created by {self.request.user.username} ({role})"
            )

    def perform_update(self, serializer):
        """Update with role-based restrictions"""
        lesson = serializer.instance

        if not self.can_modify_lesson(lesson):
            from rest_framework.exceptions import PermissionDenied

            raise PermissionDenied("You can only modify lessons you have access to")

        with transaction.atomic():
            old_status = serializer.instance.status
            lesson = serializer.save()
            logger.info(
                f"Lesson '{lesson.title}' updated by {self.request.user.username} "
                f"(Status: {old_status} -> {lesson.status})"
            )

    def perform_destroy(self, instance):
        """Delete with role-based restrictions"""
        if not self.can_modify_lesson(instance):
            from rest_framework.exceptions import PermissionDenied

            raise PermissionDenied("You can only delete lessons you have access to")

        try:
            logger.info(
                f"Lesson '{instance.title}' deleted by {self.request.user.username}"
            )
            super().perform_destroy(instance)
        except Exception as e:
            logger.error(f"Failed to delete lesson '{instance.title}': {e}")
            raise

    @action(detail=True, methods=["post"])
    def start_lesson(self, request, pk=None):
        """Start a lesson"""
        lesson = self.get_object()

        if not self.can_modify_lesson(lesson):
            return Response(
                {"error": "You can only start lessons you have access to"},
                status=status.HTTP_403_FORBIDDEN,
            )

        if lesson.start_lesson():
            serializer = self.get_serializer(lesson)
            logger.info(f"Lesson '{lesson.title}' started by {request.user.username}")
            return Response(
                {"message": "Lesson started successfully", "lesson": serializer.data}
            )

        return Response(
            {"error": "Lesson cannot be started"}, status=status.HTTP_400_BAD_REQUEST
        )

    @action(detail=True, methods=["post"])
    def complete_lesson(self, request, pk=None):
        """Complete a lesson"""
        lesson = self.get_object()

        if not self.can_modify_lesson(lesson):
            return Response(
                {"error": "You can only complete lessons you have access to"},
                status=status.HTTP_403_FORBIDDEN,
            )

        if lesson.complete_lesson():
            serializer = self.get_serializer(lesson)
            logger.info(f"Lesson '{lesson.title}' completed by {request.user.username}")
            return Response(
                {"message": "Lesson completed successfully", "lesson": serializer.data}
            )

        return Response(
            {"error": "Lesson cannot be completed"}, status=status.HTTP_400_BAD_REQUEST
        )

    @action(detail=True, methods=["post"])
    def cancel_lesson(self, request, pk=None):
        """Cancel a lesson"""
        lesson = self.get_object()

        if not self.can_modify_lesson(lesson):
            return Response(
                {"error": "You can only cancel lessons you have access to"},
                status=status.HTTP_403_FORBIDDEN,
            )

        if not lesson.can_cancel():
            return Response(
                {"error": "Lesson cannot be cancelled"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        lesson.status = "cancelled"
        lesson.save()
        logger.info(f"Lesson '{lesson.title}' cancelled by {request.user.username}")
        serializer = self.get_serializer(lesson)
        return Response(
            {"message": "Lesson cancelled successfully", "lesson": serializer.data}
        )

    @action(detail=True, methods=["get"])
    def get_progress(self, request, pk=None):
        """Get current progress of a lesson"""
        lesson = self.get_object()
        progress = lesson.update_progress()
        serializer = self.get_serializer(lesson)
        return Response({"progress": progress, "lesson": serializer.data})

    @action(detail=True, methods=["post"])
    def update_progress(self, request, pk=None):
        """Manually update lesson progress"""
        lesson = self.get_object()
        progress = lesson.update_progress()
        serializer = self.get_serializer(lesson)
        return Response({"progress": progress, "lesson": serializer.data})

    @action(detail=False, methods=["get"])
    def my_lessons(self, request):
        """Get lessons for the current user based on their role"""
        role, instance, additional_info = self.get_user_role_info()

        if role in ["superadmin", "admin", "section_admin"]:
            return Response(
                {
                    "message": "Admins can use the main lesson list endpoint",
                    "role": role,
                }
            )

        queryset = self.get_queryset()
        serializer = self.get_serializer(queryset, many=True)

        response_data = {
            "role": role,
            "count": queryset.count(),
            "lessons": serializer.data,
        }

        if role == "teacher":
            response_data["teacher_info"] = {
                "teacher_id": instance.id,
                "teacher_name": f"{instance.user.first_name} {instance.user.last_name}",
            }
        elif role == "student":
            response_data["student_info"] = {
                "student_id": instance.id,
                "enrolled_classrooms": len(
                    additional_info.get("enrolled_classrooms", [])
                ),
            }
        elif role == "parent":
            response_data["parent_info"] = {
                "parent_id": instance.id,
                "children_count": len(additional_info.get("children", [])),
                "children_classrooms": len(
                    additional_info.get("children_classrooms", [])
                ),
            }

        return Response(response_data)

    @action(detail=False, methods=["get"])
    def role_info(self, request):
        """Get current user's role and access information"""
        role, instance, additional_info = self.get_user_role_info()

        response_data = {
            "role": role,
            "user_id": request.user.id,
            "username": request.user.username,
        }

        if role == "section_admin":
            response_data["section_admin_info"] = {
                "section": getattr(request.user, "section", None),
                "section_display": getattr(request.user, "section_display", None),
                "education_levels": additional_info.get("education_levels", []),
            }
        elif role == "teacher":
            from classroom.models import ClassroomTeacherAssignment

            assignments = ClassroomTeacherAssignment.objects.filter(
                teacher=instance, is_active=True
            ).select_related("subject", "classroom")

            response_data["teacher_info"] = {
                "teacher_id": instance.id,
                "teacher_name": f"{instance.user.first_name} {instance.user.last_name}",
                "subjects_taught": sorted({a.subject.name for a in assignments}),
                "classrooms_taught": sorted({a.classroom.name for a in assignments}),
            }
        elif role == "student":
            response_data["student_info"] = {
                "student_id": instance.id,
                "student_name": f"{instance.user.first_name} {instance.user.last_name}",
                "enrolled_classrooms": [
                    classroom.name
                    for classroom in additional_info.get("enrolled_classrooms", [])
                ],
            }
        elif role == "parent":
            children = additional_info.get("children", [])
            response_data["parent_info"] = {
                "parent_id": instance.id,
                "parent_name": f"{instance.user.first_name} {instance.user.last_name}",
                "children": [
                    f"{child.user.first_name} {child.user.last_name}"
                    for child in children
                ],
                "children_classrooms": [
                    classroom.name
                    for classroom in additional_info.get("children_classrooms", [])
                ],
            }

        return Response(response_data)

    @action(detail=False, methods=["get"])
    def statistics(self, request):
        """Get role-based lesson statistics"""
        role, _, _ = self.get_user_role_info()
        queryset = self.get_queryset()

        total_lessons = queryset.count()
        completed_lessons = queryset.filter(status="completed").count()
        scheduled_lessons = queryset.filter(status="scheduled").count()
        in_progress_lessons = queryset.filter(status="in_progress").count()
        cancelled_lessons = queryset.filter(status="cancelled").count()

        avg_completion = (
            queryset.aggregate(avg_completion=Avg("completion_percentage"))[
                "avg_completion"
            ]
            or 0
        )

        lessons_by_type = queryset.values("lesson_type").annotate(count=Count("id"))
        lessons_by_status = queryset.values("status").annotate(count=Count("id"))

        today = timezone.now().date()
        week_from_now = today + timedelta(days=7)
        upcoming_lessons = queryset.filter(
            date__range=[today, week_from_now], status="scheduled"
        ).count()

        overdue_lessons = queryset.filter(
            date__lt=today, status__in=["scheduled", "in_progress"]
        ).count()

        return Response(
            {
                "role": role,
                "total_lessons": total_lessons,
                "completed_lessons": completed_lessons,
                "scheduled_lessons": scheduled_lessons,
                "in_progress_lessons": in_progress_lessons,
                "cancelled_lessons": cancelled_lessons,
                "avg_completion_percentage": round(avg_completion, 2),
                "upcoming_lessons": upcoming_lessons,
                "overdue_lessons": overdue_lessons,
                "lessons_by_type": list(lessons_by_type),
                "lessons_by_status": list(lessons_by_status),
            }
        )

    @action(detail=True, methods=["post"])
    def update_status(self, request, pk=None):
        """Update lesson status"""
        lesson = self.get_object()

        if not self.can_modify_lesson(lesson):
            return Response(
                {"error": "You can only update status of lessons you have access to"},
                status=status.HTTP_403_FORBIDDEN,
            )

        serializer = LessonStatusUpdateSerializer(
            lesson, data=request.data, partial=True
        )

        if serializer.is_valid():
            serializer.save()
            logger.info(
                f"Lesson '{lesson.title}' status updated to '{lesson.status}' "
                f"by {request.user.username}"
            )
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=["get"])
    def calendar(self, request):
        """Get lessons for calendar view"""
        start_date = request.query_params.get("start_date")
        end_date = request.query_params.get("end_date")

        queryset = self.get_queryset()

        if start_date and end_date:
            queryset = queryset.filter(date__range=[start_date, end_date])

        serializer = self.get_serializer(queryset, many=True)
        role, _, _ = self.get_user_role_info()

        return Response({"role": role, "lessons": serializer.data})

    @action(detail=False, methods=["get"])
    def teacher_subjects(self, request):
        """Get subjects for a selected teacher"""
        teacher_id = request.query_params.get("teacher_id")
        if not teacher_id:
            return Response(
                {"error": "teacher_id parameter is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            teacher = Teacher.objects.get(id=teacher_id)
        except Teacher.DoesNotExist:
            return Response(
                {"error": "Teacher not found"}, status=status.HTTP_404_NOT_FOUND
            )

        from classroom.models import ClassroomTeacherAssignment

        assignments = ClassroomTeacherAssignment.objects.filter(
            teacher=teacher, is_active=True
        ).select_related("subject")

        subjects = {a.subject for a in assignments}
        filtered_subjects = set()

        for subj in subjects:
            try:
                if (
                    hasattr(subj, "component_subjects")
                    and subj.component_subjects.exists()
                ):
                    components = subj.component_subjects.filter(
                        education_levels=["JUNIOR_SECONDARY"]
                    )
                    if components.exists():
                        filtered_subjects.update(list(components))
                        continue
                filtered_subjects.add(subj)
            except Exception:
                filtered_subjects.add(subj)

        subjects_list = (
            list(filtered_subjects)
            if filtered_subjects
            else list(Subject.objects.filter(is_active=True))
        )
        serializer = SubjectSerializer(subjects_list, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=["get"])
    def subject_teachers(self, request):
        """Get teachers for a selected subject"""
        subject_id = request.query_params.get("subject_id")
        if not subject_id:
            return Response(
                {"error": "subject_id parameter is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            subject = Subject.objects.get(id=subject_id)
        except Subject.DoesNotExist:
            return Response(
                {"error": "Subject not found"}, status=status.HTTP_404_NOT_FOUND
            )

        from classroom.models import ClassroomTeacherAssignment

        assignments = ClassroomTeacherAssignment.objects.filter(
            subject=subject, is_active=True
        ).select_related("teacher__user")
        teachers = {a.teacher for a in assignments}

        if getattr(subject, "parent_subject", None):
            parent_assignments = ClassroomTeacherAssignment.objects.filter(
                subject=subject.parent_subject, is_active=True
            )
            teachers.update({a.teacher for a in parent_assignments})

        if not teachers:
            teachers = set(Teacher.objects.filter(is_active=True))

        serializer = TeacherSerializer(list(teachers), many=True)
        return Response(serializer.data)

    @action(detail=False, methods=["get"])
    def teacher_classrooms(self, request):
        """Get classrooms for a selected teacher"""
        teacher_id = request.query_params.get("teacher_id")
        subject_id = request.query_params.get("subject_id")

        if not teacher_id:
            return Response(
                {"error": "teacher_id parameter is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            teacher = Teacher.objects.get(id=teacher_id)
        except Teacher.DoesNotExist:
            return Response(
                {"error": "Teacher not found"}, status=status.HTTP_404_NOT_FOUND
            )

        from classroom.models import ClassroomTeacherAssignment

        assignments = ClassroomTeacherAssignment.objects.filter(
            teacher=teacher, is_active=True
        ).select_related("classroom")

        if subject_id:
            assignments = assignments.filter(subject_id=subject_id)

        classrooms = sorted({a.classroom for a in assignments}, key=lambda c: c.name)
        if not classrooms:
            classrooms = list(Classroom.objects.filter(is_active=True))

        serializer = ClassroomSerializer(classrooms, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=["get"])
    def classroom_sections(self, request):
        """Get all classroom sections"""
        from classroom.models import Section

        sections = Section.objects.filter(is_active=True)
        serializer = SectionSerializer(sections, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=["get"])
    def subjects_by_level(self, request):
        """Get subjects filtered by education level"""
        education_level = request.query_params.get("education_level")
        grade_level_id = request.query_params.get("grade_level_id")
        stream = request.query_params.get("stream")

        if not education_level:
            return Response(
                {"error": "education_level parameter is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        subjects = Subject.get_subjects_by_education_level(education_level)

        if grade_level_id:
            subjects = [
                s for s in subjects if s.grade_levels.filter(id=grade_level_id).exists()
            ]
        if stream:
            subjects = [
                s for s in subjects if s.compatible_streams.filter(name=stream).exists()
            ]

        serializer = SubjectSerializer(subjects, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=["get"])
    def download_report(self, request, pk=None):
        """Download lesson report as JSON"""
        try:
            lesson = self.get_object()
            report_data = lesson.generate_lesson_report()
            from django.http import JsonResponse

            response = JsonResponse(report_data, json_dumps_params={"indent": 2})
            response["Content-Disposition"] = (
                f'attachment; filename="lesson_report_{lesson.id}_{lesson.date}.json"'
            )
            return response
        except Lesson.DoesNotExist:
            return Response({"error": "Lesson not found"}, status=404)

    @action(detail=True, methods=["get"])
    def enrolled_students(self, request, pk=None):
        """Get list of students enrolled in the lesson's classroom"""
        try:
            lesson = self.get_object()
            enrolled_students = lesson.get_enrolled_students()
            from students.serializers import (
                StudentDetailSerializer as StudentSerializer,
            )

            serializer = StudentSerializer(enrolled_students, many=True)
            return Response(
                {
                    "count": getattr(
                        lesson, "enrolled_students_count", len(enrolled_students)
                    ),
                    "students": serializer.data,
                }
            )
        except Lesson.DoesNotExist:
            return Response({"error": "Lesson not found"}, status=404)


class LessonAttendanceViewSet(viewsets.ModelViewSet):
    """ViewSet for lesson attendance management with multi-role access"""

    queryset = LessonAttendance.objects.all()
    serializer_class = LessonAttendanceSerializer
    permission_classes = [IsAuthenticated]

    filterset_fields = ["lesson_id", "student_id", "status"]
    search_fields = ["student__user__first_name", "student__user__last_name", "notes"]

    def _get_section_education_levels(self, user):
        """Helper method to get education levels based on user's section/role"""
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

        user_section = getattr(user, "section", None)
        user_role = getattr(user, "role", None)

        if not user_section and user_role in ROLE_TO_SECTION:
            user_section = ROLE_TO_SECTION[user_role]

        return SECTION_TO_EDUCATION_LEVEL.get(user_section, [])

    def get_queryset(self):
        """Filter attendance records based on user role"""
        queryset = LessonAttendance.objects.select_related("lesson", "student__user")

        user = self.request.user

        # Superadmin - see all
        if user.is_superuser:
            return queryset

        # Section Admin - see only their section's attendance
        if user.is_staff and getattr(user, "is_section_admin", False):
            education_levels = self._get_section_education_levels(user)
            if not education_levels:
                return queryset.none()
            return queryset.filter(
                lesson__classroom__section__grade_level__education_level__in=education_levels
            )

        # Regular Admin/Staff - see all
        if user.is_staff:
            return queryset

        # Teacher - see attendance for their lessons only
        try:
            teacher = Teacher.objects.get(user=user, is_active=True)
            return queryset.filter(lesson__teacher=teacher)
        except Teacher.DoesNotExist:
            pass

        # Student - see only their own attendance
        try:
            from students.models import Student

            student = Student.objects.get(user=user, is_active=True)
            return queryset.filter(student=student)
        except Exception:
            pass

        # Parent - see attendance for their children
        try:
            parent = Parent.objects.get(user=user, is_active=True)
            relationships = StudentParentRelationship.objects.filter(
                parent=parent, is_active=True
            )
            children_ids = [
                rel.student.id for rel in relationships if rel.student.is_active
            ]
            return queryset.filter(student_id__in=children_ids)
        except Exception:
            pass

        return queryset.none()


class LessonResourceViewSet(viewsets.ModelViewSet):
    """ViewSet for lesson resources management with multi-role access"""

    queryset = LessonResource.objects.all()
    serializer_class = LessonResourceSerializer
    permission_classes = [IsAuthenticated]

    filterset_fields = ["lesson_id", "resource_type", "is_required"]
    search_fields = ["title", "description"]

    def _get_section_education_levels(self, user):
        """Helper method to get education levels based on user's section/role"""
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

        user_section = getattr(user, "section", None)
        user_role = getattr(user, "role", None)

        if not user_section and user_role in ROLE_TO_SECTION:
            user_section = ROLE_TO_SECTION[user_role]

        return SECTION_TO_EDUCATION_LEVEL.get(user_section, [])

    def get_queryset(self):
        queryset = LessonResource.objects.select_related("lesson")

        user = self.request.user

        # Superadmin - see all
        if user.is_superuser:
            return queryset

        # Section Admin - see only their section's resources
        if user.is_staff and getattr(user, "is_section_admin", False):
            education_levels = self._get_section_education_levels(user)
            if not education_levels:
                return queryset.none()
            return queryset.filter(
                lesson__classroom__section__grade_level__education_level__in=education_levels
            )

        # Regular Admin/Staff - see all
        if user.is_staff:
            return queryset

        # Teacher - see resources for their lessons only
        try:
            teacher = Teacher.objects.get(user=user, is_active=True)
            return queryset.filter(lesson__teacher=teacher)
        except Teacher.DoesNotExist:
            pass

        # Student - see resources for lessons in their classrooms
        try:
            from students.models import Student, StudentEnrollment

            student = Student.objects.get(user=user, is_active=True)
            enrollments = StudentEnrollment.objects.filter(
                student=student, is_active=True
            )
            classrooms = [enrollment.classroom for enrollment in enrollments]
            return queryset.filter(lesson__classroom__in=classrooms)
        except Exception:
            pass

        # Parent - see resources for their children's classrooms
        try:
            parent = Parent.objects.get(user=user)
            relationships = StudentParentRelationship.objects.filter(parent=parent)
            children = [rel.student for rel in relationships]
            classrooms = []
            for child in children:
                from students.models import StudentEnrollment

                classrooms.extend(
                    [
                        e.classroom
                        for e in StudentEnrollment.objects.filter(
                            student=child, is_active=True
                        )
                    ]
                )
            return queryset.filter(lesson__classroom__in=classrooms)
        except Exception:
            pass

        return queryset.none()


class LessonAssessmentViewSet(viewsets.ModelViewSet):
    """ViewSet for lesson assessments management with multi-role access"""

    queryset = LessonAssessment.objects.all()
    serializer_class = LessonAssessmentSerializer
    permission_classes = [IsAuthenticated]

    filterset_fields = ["lesson_id", "assessment_type", "due_date"]
    search_fields = ["title", "description"]
    ordering_fields = ["due_date", "total_points", "weight_percentage"]
    ordering = ["due_date"]

    def _get_section_education_levels(self, user):
        """Helper method to get education levels based on user's section/role"""
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

        user_section = getattr(user, "section", None)
        user_role = getattr(user, "role", None)

        if not user_section and user_role in ROLE_TO_SECTION:
            user_section = ROLE_TO_SECTION[user_role]

        return SECTION_TO_EDUCATION_LEVEL.get(user_section, [])

    def get_queryset(self):
        queryset = LessonAssessment.objects.select_related("lesson")

        user = self.request.user

        # Superadmin - see all
        if user.is_superuser:
            return queryset

        # Section Admin - see only their section's assessments
        if user.is_staff and getattr(user, "is_section_admin", False):
            education_levels = self._get_section_education_levels(user)
            if not education_levels:
                return queryset.none()
            return queryset.filter(
                lesson__classroom__section__grade_level__education_level__in=education_levels
            )

        # Regular Admin/Staff - see all
        if user.is_staff:
            return queryset

        # Teacher - see assessments for their lessons only
        try:
            teacher = Teacher.objects.get(user=user, is_active=True)
            return queryset.filter(lesson__teacher=teacher)
        except Teacher.DoesNotExist:
            pass

        # Student - see assessments for lessons in their classrooms
        try:
            from students.models import Student, StudentEnrollment

            student = Student.objects.get(user=user, is_active=True)
            enrollments = StudentEnrollment.objects.filter(
                student=student, is_active=True
            )
            classrooms = [enrollment.classroom for enrollment in enrollments]
            return queryset.filter(lesson__classroom__in=classrooms)
        except Exception:
            pass

        # Parent - see assessments for their children's classrooms
        try:
            parent = Parent.objects.get(user=user)
            relationships = StudentParentRelationship.objects.filter(parent=parent)
            children = [rel.student for rel in relationships]
            classrooms = []
            for child in children:
                from students.models import StudentEnrollment

                classrooms.extend(
                    [
                        e.classroom
                        for e in StudentEnrollment.objects.filter(
                            student=child, is_active=True
                        )
                    ]
                )
            return queryset.filter(lesson__classroom__in=classrooms)
        except Exception:
            pass

        return queryset.none()
