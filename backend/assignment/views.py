from collections import defaultdict

from django.db import IntegrityError, transaction
from django.db.models import Count, IntegerField, OuterRef, Subquery
from django.db.models.functions import Coalesce
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import SAFE_METHODS, IsAuthenticated
from rest_framework.response import Response

from classroom.models import StudentEnrollment
from common.admin_access import admin_level_access
from common.dispatch import dispatch_task
from students.models import Student
from teacher.models import Teacher

from . import storage
from .access import (
    can_grade,
    children_of,
    class_roster,
    classrooms_taught_by,
    enrolled_classroom_ids,
    leads_classroom,
    subjects_for,
)
from .models import Assignment, AssignmentSubmission
from .notifications import bell_handed_in, bell_marked, bell_new_assignment
from .serializers import AssignmentSerializer, GradeSerializer, SubmissionSerializer
from .tasks import notify_parents_of_mark


class AssignmentViewSet(viewsets.ModelViewSet):
    """
    Teachers set assignments for the classes they teach; parents see the ones
    for their children's classes, students their own class's, and admins
    every class within their levels. Only the teacher who set an assignment
    edits it; they or an admin may delete it.

    Students, or parents for them, hand work in through `submit`; the
    class's teachers read the hand-ins with `submissions` and mark them
    with `grade`.

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

        if kind in ("admin", "teacher"):
            enrolled = (
                StudentEnrollment.objects.filter(
                    classroom=OuterRef("classroom"), is_active=True, student__is_active=True
                )
                .order_by()
                .values("classroom")
                .annotate(n=Count("id"))
                .values("n")
            )
            qs = qs.annotate(
                submission_count=Count("submissions", distinct=True),
                student_count=Coalesce(Subquery(enrolled, output_field=IntegerField()), 0),
            )

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
        if self.action in ("list", "retrieve"):
            student_id = self.submission_student_id()
            if student_id is not None:
                context["submissions"] = submissions_by_assignment(context["tenant"], [student_id])[student_id]
        return context

    def submission_student_id(self):
        """
        Whose hand-ins to show on each row: a student's own, or the pupil
        named by ?student=<id> when the viewer may see that pupil's work.
        A parent only ever gets their own children's.
        """
        kind, _ = self.viewer()
        tenant = self.request.tenant
        if kind == "student":
            return (
                Student.objects.filter(user=self.request.user, tenant=tenant, is_active=True)
                .values_list("id", flat=True)
                .first()
            )
        student = self.request.query_params.get("student", "")
        if not student.isdigit():
            return None
        if kind in ("admin", "teacher"):
            return int(student)
        if kind == "parent" and children_of(self.request.user, tenant).filter(id=int(student)).exists():
            return int(student)
        return None

    # ── Writes ───────────────────────────────────────────────────────────

    def check_permissions(self, request):
        super().check_permissions(request)
        if request.method in SAFE_METHODS:
            return
        kind, _ = self.viewer()
        if self.action == "submit":
            if kind in ("student", "parent"):
                return
            raise PermissionDenied("Only students, or their parents, hand in assignments.")
        if self.action == "grade":
            if kind == "teacher":
                return
            raise PermissionDenied("Only the class's teachers mark assignments.")
        if kind == "teacher" or (kind == "admin" and self.action == "destroy"):
            return
        raise PermissionDenied("Only the class's teachers can set or change assignments.")

    def check_object_permissions(self, request, obj):
        super().check_object_permissions(request, obj)
        if request.method in SAFE_METHODS or self.action in ("submit", "grade"):
            # submit and grade check who may act on this one themselves.
            return
        kind, who = self.viewer()
        if kind == "admin" and self.action == "destroy":
            return
        if kind == "teacher" and obj.teacher_id == who.pk:
            return
        raise PermissionDenied("Only the teacher who set this assignment can change it.")

    def perform_create(self, serializer):
        _, teacher = self.viewer()
        assignment = serializer.save(
            tenant=self.request.tenant, teacher=teacher, created_by=self.request.user
        )
        # Bells now; the email waits for the parents' daily digest.
        bell_new_assignment(assignment)

    def perform_destroy(self, instance):
        public_ids = [instance.attachment_public_id]
        public_ids += instance.submissions.exclude(attachment_public_id="").values_list(
            "attachment_public_id", flat=True
        )
        instance.delete()
        for public_id in public_ids:
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
        # Rows are shared by children in the same class; each child's copy
        # carries that child's own hand-in.
        handed_in = submissions_by_assignment(tenant, [c.id for c in children])

        return Response([
            {
                "student_id": child.id,
                "student_name": child.user.get_full_name() or child.user.username,
                "classrooms": [
                    {"id": c.id, "name": c.name, "section_name": c.section.name}
                    for c in classrooms_of[child.id]
                ],
                "assignments": [
                    {**a, "submission": handed_in[child.id].get(a["id"])}
                    for c in classrooms_of[child.id]
                    for a in by_classroom[c.id]
                ],
            }
            for child in children
        ])

    @action(detail=True, methods=["post"])
    def submit(self, request, pk=None):
        """
        A student hands in their work, or replaces it until it is marked. A
        parent may do the same for a child, named by `student`.
        """
        assignment = self.get_object()  # their own (or a child's) class's, or a 404
        student = self.hand_in_student(assignment)
        existing = AssignmentSubmission.objects.filter(assignment=assignment, student=student).first()
        if existing is not None and existing.is_graded:
            raise ValidationError(
                {"detail": "The teacher has already marked this work, so it can't be changed."}
            )

        serializer = SubmissionSerializer(
            existing, data=request.data, partial=existing is not None,
            context={"tenant": request.tenant},
        )
        serializer.is_valid(raise_exception=True)
        try:
            with transaction.atomic():
                submission = serializer.save(
                    assignment=assignment, student=student, tenant=request.tenant,
                    submitted_at=timezone.now(), submitted_by=request.user,
                )
        except IntegrityError:
            # Another tab handed in first.
            raise ValidationError({"detail": "This work was just handed in. Refresh to see it."})
        if existing is None:
            # First hand-in only; changes to it don't ping the teacher again.
            bell_handed_in(submission)
        return Response(
            SubmissionSerializer(submission).data,
            status=status.HTTP_201_CREATED if existing is None else status.HTTP_200_OK,
        )

    def hand_in_student(self, assignment):
        """
        The pupil a hand-in is for: the student themself, or the parent's
        child named by `student`, who must be in the assignment's class.
        """
        kind, _ = self.viewer()
        tenant = self.request.tenant
        if kind == "student":
            student = Student.objects.filter(user=self.request.user, tenant=tenant, is_active=True).first()
            if student is None:
                raise PermissionDenied("Only students, or their parents, hand in assignments.")
            return student

        child_id = str(self.request.data.get("student", ""))
        if not child_id.isdigit():
            raise ValidationError({"student": "Choose which child this work is for."})
        child = children_of(self.request.user, tenant).filter(id=int(child_id)).first()
        in_class = child is not None and enrolled_classroom_ids([child.id], tenant).filter(
            classroom_id=assignment.classroom_id
        ).exists()
        if not in_class:
            # Not their child, or a child in another class: the same answer either way.
            raise ValidationError({"student": "This assignment isn't for that child's class."})
        return child

    @action(detail=True, methods=["get"])
    def submissions(self, request, pk=None):
        """The class list for one assignment, each pupil with their hand-in or none."""
        kind, who = self.viewer()
        if kind not in ("teacher", "admin"):
            raise PermissionDenied("Only the class's teachers and admins see hand-ins.")
        assignment = self.get_object()
        handed_in = {
            s.student_id: s
            for s in assignment.submissions.select_related("assignment", "student__user", "graded_by__user", "submitted_by")
        }
        roster = list(class_roster(assignment.classroom))
        # Someone who handed in and has since left the class still shows.
        on_roster = {pupil.id for pupil in roster}
        roster += [s.student for sid, s in handed_in.items() if sid not in on_roster]
        return Response({
            "can_grade": kind == "teacher" and can_grade(who, assignment),
            "students": [
                {
                    "student_id": pupil.id,
                    "student_name": pupil.user.get_full_name() or pupil.user.username,
                    "submission": (
                        SubmissionSerializer(handed_in[pupil.id]).data if pupil.id in handed_in else None
                    ),
                }
                for pupil in roster
            ],
        })

    @action(detail=True, methods=["post"])
    def grade(self, request, pk=None):
        """Mark a hand-in. A blank grade and feedback hand it back for another try."""
        _, teacher = self.viewer()
        assignment = self.get_object()
        if not can_grade(teacher, assignment):
            raise PermissionDenied(
                "Only the teacher who set this assignment, or the class teacher, can mark it."
            )
        data = GradeSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        submission = (
            assignment.submissions.select_related("assignment", "student__user", "submitted_by")
            .filter(id=data.validated_data["submission"])
            .first()
        )
        if submission is None:
            raise NotFound("No such hand-in for this assignment.")

        was_marked = submission.is_graded
        submission.grade = data.validated_data["grade"].strip()
        submission.feedback = data.validated_data["feedback"].strip()
        if submission.grade or submission.feedback:
            submission.graded_by, submission.graded_at = teacher, timezone.now()
        else:
            submission.graded_by, submission.graded_at = None, None
        submission.save(update_fields=["grade", "feedback", "graded_by", "graded_at"])

        if submission.is_graded and not was_marked:
            # Newly marked, not a correction to a mark: tell the pupil and
            # parents in their bells, and email the parents once the save
            # has committed and off the request.
            bell_marked(submission)
            transaction.on_commit(
                lambda: dispatch_task(notify_parents_of_mark, submission_id=submission.id)
            )
        return Response(SubmissionSerializer(submission).data)


def submissions_by_assignment(tenant, student_ids):
    """{student_id: {assignment_id: hand-in}} for the given pupils of `tenant`."""
    result = {sid: {} for sid in student_ids}
    rows = AssignmentSubmission.objects.filter(
        tenant=tenant, student_id__in=student_ids
    ).select_related("assignment", "student__user", "graded_by__user", "submitted_by")
    for row in rows:
        result[row.student_id][row.assignment_id] = SubmissionSerializer(row).data
    return result
