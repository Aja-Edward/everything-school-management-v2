import logging
import os

from rest_framework import serializers

from classroom.models import Classroom
from subject.models import Subject

from . import storage
from .access import classrooms_taught_by, leads_classroom, subjects_for
from .models import Assignment, AssignmentSubmission

logger = logging.getLogger(__name__)


class AttachmentMixin:
    """
    The optional file an assignment or a submission carries: write-only
    `attachment` and `remove_attachment` fields, validated and uploaded to
    Cloudinary before the row is saved.
    """

    upload_folder = ""

    def validate_attachment(self, value):
        ext = os.path.splitext(value.name)[1].lower()
        if ext not in storage.ALLOWED_EXTENSIONS:
            raise serializers.ValidationError(
                "Attach a PDF, Word, Excel, PowerPoint, text or image file."
            )
        if value.size > storage.MAX_ATTACHMENT_BYTES:
            raise serializers.ValidationError("Attachments can be at most 10 MB.")
        return value

    def _store_attachment(self, validated_data, instance=None):
        """
        Upload a new file, or drop the old one, before the row is saved.
        Returns the public id of a file the save replaces, to delete after.
        """
        upload = validated_data.pop("attachment", None)
        remove = validated_data.pop("remove_attachment", False)
        old_public_id = getattr(instance, "attachment_public_id", "")

        if upload is not None:
            try:
                url, public_id = storage.upload_attachment(
                    upload, self.context["tenant"], folder=self.upload_folder
                )
            except Exception as exc:
                logger.error("Assignment attachment upload failed: %s", exc)
                raise serializers.ValidationError(
                    {"attachment": "The file could not be uploaded. Please try again."}
                )
            validated_data.update(
                attachment_url=url,
                attachment_name=os.path.basename(upload.name)[:255],
                attachment_public_id=public_id,
            )
        elif remove:
            validated_data.update(attachment_url="", attachment_name="", attachment_public_id="")
        else:
            return None
        return old_public_id

    def create(self, validated_data):
        self._store_attachment(validated_data)
        return super().create(validated_data)

    def update(self, instance, validated_data):
        replaced = self._store_attachment(validated_data, instance)
        instance = super().update(instance, validated_data)
        if replaced:
            storage.delete_attachment(replaced)
        return instance


class SubmissionSerializer(AttachmentMixin, serializers.ModelSerializer):
    """
    A student's hand-in. The student writes `text` and the attachment; the
    grade and feedback are the teacher's and read-only here (GradeSerializer
    writes them).
    """

    upload_folder = "submissions"

    student_name = serializers.SerializerMethodField()
    is_late = serializers.BooleanField(read_only=True)
    is_graded = serializers.BooleanField(read_only=True)
    graded_by_name = serializers.SerializerMethodField()

    attachment = serializers.FileField(write_only=True, required=False)
    remove_attachment = serializers.BooleanField(write_only=True, required=False, default=False)

    class Meta:
        model = AssignmentSubmission
        fields = [
            "id", "assignment", "student", "student_name",
            "text", "attachment", "remove_attachment", "attachment_url", "attachment_name",
            "submitted_at", "is_late",
            "grade", "feedback", "is_graded", "graded_by_name", "graded_at",
        ]
        read_only_fields = [
            "assignment", "student", "attachment_url", "attachment_name", "submitted_at",
            "grade", "feedback", "graded_at",
        ]

    def get_student_name(self, obj):
        user = obj.student.user
        return user.get_full_name() or user.username

    def get_graded_by_name(self, obj):
        if obj.graded_by_id and obj.graded_by.user_id:
            return obj.graded_by.user.get_full_name() or obj.graded_by.user.username
        return None

    def validate(self, attrs):
        has_text = bool(attrs.get("text", getattr(self.instance, "text", "")).strip())
        keeps_file = bool(getattr(self.instance, "attachment_url", "")) and not attrs.get("remove_attachment")
        if not (has_text or attrs.get("attachment") or keeps_file):
            raise serializers.ValidationError("Write an answer or attach a file before submitting.")
        return attrs


class GradeSerializer(serializers.Serializer):
    """A teacher's mark. Both blank hands the work back to the student."""

    submission = serializers.IntegerField()
    grade = serializers.CharField(max_length=20, allow_blank=True, required=False, default="")
    feedback = serializers.CharField(allow_blank=True, required=False, default="")


class AssignmentSerializer(AttachmentMixin, serializers.ModelSerializer):
    """
    Reads for everyone who may see an assignment; writes only for a teacher,
    who the view passes in context as `teacher`. The classroom and subject
    choices are narrowed to what that teacher teaches, so a class of another
    teacher or another school reads as not existing at all.
    """

    classroom = serializers.PrimaryKeyRelatedField(queryset=Classroom.objects.none())
    subject = serializers.PrimaryKeyRelatedField(
        queryset=Subject.objects.none(), required=False, allow_null=True
    )
    classroom_name = serializers.CharField(source="classroom.name", read_only=True)
    section_name = serializers.CharField(source="classroom.section.name", read_only=True)
    subject_name = serializers.CharField(source="subject.name", read_only=True, default=None)
    teacher_name = serializers.SerializerMethodField()
    is_overdue = serializers.BooleanField(read_only=True)
    can_edit = serializers.SerializerMethodField()
    can_delete = serializers.SerializerMethodField()
    # One pupil's hand-in: the viewer's own for a student, or the child the
    # view was asked about. The view decides whose, in context.
    submission = serializers.SerializerMethodField()
    # Teachers and admins only: how many of the class have handed it in.
    submission_count = serializers.SerializerMethodField()
    student_count = serializers.SerializerMethodField()

    attachment = serializers.FileField(write_only=True, required=False)
    remove_attachment = serializers.BooleanField(write_only=True, required=False, default=False)

    class Meta:
        model = Assignment
        fields = [
            "id", "classroom", "classroom_name", "section_name",
            "subject", "subject_name", "teacher_name",
            "title", "instructions", "due_date", "is_overdue",
            "attachment", "remove_attachment", "attachment_url", "attachment_name",
            "can_edit", "can_delete", "submission", "submission_count", "student_count",
            "created_at", "updated_at",
        ]
        read_only_fields = ["attachment_url", "attachment_name", "created_at", "updated_at"]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        teacher = self.context.get("teacher")
        tenant = self.context.get("tenant")
        if teacher is not None and tenant is not None:
            self.fields["classroom"].queryset = classrooms_taught_by(teacher, tenant)
            self.fields["subject"].queryset = Subject.objects.filter(tenant=tenant)

    def get_teacher_name(self, obj):
        if obj.teacher_id and obj.teacher.user_id:
            return obj.teacher.user.get_full_name() or obj.teacher.user.username
        return None

    def get_can_edit(self, obj):
        teacher = self.context.get("teacher")
        return teacher is not None and obj.teacher_id == teacher.pk

    def get_can_delete(self, obj):
        return bool(self.context.get("is_admin")) or self.get_can_edit(obj)

    def get_submission(self, obj):
        return self.context.get("submissions", {}).get(obj.id)

    def _staff(self):
        return bool(self.context.get("is_admin")) or self.context.get("teacher") is not None

    def get_submission_count(self, obj):
        return getattr(obj, "submission_count", None) if self._staff() else None

    def get_student_count(self, obj):
        return getattr(obj, "student_count", None) if self._staff() else None

    def validate(self, attrs):
        teacher = self.context["teacher"]
        if self.instance is not None and not {"classroom", "subject"} & attrs.keys():
            # Editing the text or due date alone: the class and subject were
            # checked when they were set.
            return attrs
        classroom = attrs.get("classroom") or getattr(self.instance, "classroom", None)
        subject = attrs["subject"] if "subject" in attrs else getattr(self.instance, "subject", None)

        if subject is not None and not subjects_for(teacher, classroom).filter(pk=subject.pk).exists():
            raise serializers.ValidationError(
                {"subject": "You don't teach this subject in this class."}
            )
        if subject is None and not leads_classroom(teacher, classroom):
            raise serializers.ValidationError(
                {"subject": "Choose the subject you teach this class."}
            )
        return attrs
