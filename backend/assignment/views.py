from collections import defaultdict

from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import SAFE_METHODS, IsAuthenticated
from rest_framework.response import Response

from classroom.models import StudentEnrollment
from common.admin_access import admin_level_access
from students.models import Student
from teacher.models import Teacher

from . import storage
from .access import (
    children_of,
    classrooms_taught_by,
    enrolled_classroom_ids,
    leads_classroom,
    subjects_for,
)
from .models import Assignment
from .serializers import AssignmentSerializer


class AssignmentViewSet(viewsets.ModelViewSet):
    """
    Teachers set assignments for the classes they teach; parents see the ones
    for their children's classes, students their own class's, and admins
    every class within their levels. Only the teacher who set an assignment
    edits it; they or an admin may delete it.

    Every query is scoped to request.tenant, whoever is asking.
    """

    serializer_class = AssignmentSerializer
    permission_classes = [IsAuthenticated]
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    # ── Who is asking ────────────────────────────────────────────────────

    def viewer(self):
        """("admin", levels) | ("teacher", Teacher) | ("parent"|"student", None) | (None, None)"""
        if hasattr(self, "_viewer"):
            return self._viewer
        user, tenant = self.request.user, getattr(self.request, "tenant", None)
        self._viewer = (None, None)
        if tenant is not None and user.is_authenticated:
            levels = admin_level_access(user, tenant)
            role = (getattr(user, "role", "") or "").lower()
            if levels is None or levels:
                self._viewer = ("admin", levels)
            elif role == "teacher":
                teacher = Teacher.objects.filter(user=user, tenant=tenant, is_active=True).first()
                if teacher:
                    self._viewer = ("teacher", teacher)
            elif role in ("parent", "student"):
                self._viewer = (role, None)
        return self._viewer

    # ── Reads ────────────────────────────────────────────────────────────

    def get_queryset(self):
        tenant = getattr(self.request, "tenant", None)
        kind, who = self.viewer()
        if kind is None:
            return Assignment.objects.none()

        qs = Assignment.objects.filter(tenant=tenant, classroom__tenant=tenant).select_related(
            "classroom__section", "subject", "teacher__user"
        )
        if kind == "admin":
            if who:  # a section admin, limited to their levels
                qs = qs.filter(classroom__section__class_grade__education_level__level_type__in=who)
        elif kind == "teacher":
            qs = qs.filter(classroom__in=classrooms_taught_by(who, tenant))
        elif kind == "parent":
            children = children_of(self.request.user, tenant).values("id")
            qs = qs.filter(classroom_id__in=enrolled_classroom_ids(children, tenant))
        elif kind == "student":
            me = Student.objects.filter(user=self.request.user, tenant=tenant, is_active=True).values("id")
            qs = qs.filter(classroom_id__in=enrolled_classroom_ids(me, tenant))

        params = self.request.query_params
        if params.get("classroom"):
            qs = qs.filter(classroom_id=params["classroom"])
        if params.get("subject"):
            qs = qs.filter(subject_id=params["subject"])
        if "student" in params:
            # One pupil's current class. This narrows what the viewer may
            # already see; it never widens it.
            student = params["student"]
            if not student.isdigit():
                return qs.none()
            qs = qs.filter(classroom_id__in=enrolled_classroom_ids([int(student)], tenant))
        return qs

    def get_serializer_context(self):
        context = super().get_serializer_context()
        kind, who = self.viewer()
        context["tenant"] = getattr(self.request, "tenant", None)
        context["teacher"] = who if kind == "teacher" else None
        context["is_admin"] = kind == "admin"
        return context

    # ── Writes ───────────────────────────────────────────────────────────

    def check_permissions(self, request):
        super().check_permissions(request)
        if request.method in SAFE_METHODS:
            return
        kind, _ = self.viewer()
        if kind == "teacher" or (kind == "admin" and self.action == "destroy"):
            return
        raise PermissionDenied("Only the class's teachers can set or change assignments.")

    def check_object_permissions(self, request, obj):
        super().check_object_permissions(request, obj)
        if request.method in SAFE_METHODS:
            return
        kind, who = self.viewer()
        if kind == "admin" and self.action == "destroy":
            return
        if kind == "teacher" and obj.teacher_id == who.pk:
            return
        raise PermissionDenied("Only the teacher who set this assignment can change it.")

    def perform_create(self, serializer):
        _, teacher = self.viewer()
        serializer.save(
            tenant=self.request.tenant, teacher=teacher, created_by=self.request.user
        )

    def perform_destroy(self, instance):
        public_id = instance.attachment_public_id
        instance.delete()
        storage.delete_attachment(public_id)

    # ── Extra views ──────────────────────────────────────────────────────

    @action(detail=False, methods=["get"], url_path="teaching-options")
    def teaching_options(self, request):
        """The classes a teacher can set work for, each with its subjects."""
        kind, teacher = self.viewer()
        if kind != "teacher":
            raise PermissionDenied("Only teachers set assignments.")
        classrooms = classrooms_taught_by(teacher, request.tenant).select_related("section")
        return Response([
            {
                "id": c.id,
                "name": c.name,
                "section_name": c.section.name,
                # Whoever leads the class may set work with no subject.
                "leads_class": leads_classroom(teacher, c),
                "subjects": [{"id": s.id, "name": s.name} for s in subjects_for(teacher, c)],
            }
            for c in classrooms.order_by("name")
        ])

    @action(detail=False, methods=["get"])
    def children(self, request):
        """A parent's assignments, one group per child, by the child's current class."""
        kind, _ = self.viewer()
        if kind != "parent":
            raise PermissionDenied("Only parents have children's assignments.")
        tenant = request.tenant
        children = list(children_of(request.user, tenant))

        classrooms_of = defaultdict(list)
        enrollments = StudentEnrollment.objects.filter(
            student__in=children,
            classroom_id__in=enrolled_classroom_ids([c.id for c in children], tenant),
            is_active=True,
        ).select_related("classroom__section")
        for e in enrollments:
            classrooms_of[e.student_id].append(e.classroom)

        by_classroom = defaultdict(list)
        all_classroom_ids = {c.id for rooms in classrooms_of.values() for c in rooms}
        rows = self.get_queryset().filter(classroom_id__in=all_classroom_ids)
        for row in self.get_serializer(rows, many=True).data:
            by_classroom[row["classroom"]].append(row)

        return Response([
            {
                "student_id": child.id,
                "student_name": child.user.get_full_name() or child.user.username,
                "classrooms": [
                    {"id": c.id, "name": c.name, "section_name": c.section.name}
                    for c in classrooms_of[child.id]
                ],
                "assignments": [a for c in classrooms_of[child.id] for a in by_classroom[c.id]],
            }
            for child in children
        ])
