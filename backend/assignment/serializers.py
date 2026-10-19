import logging
import os

from rest_framework import serializers

from classroom.models import Classroom
from subject.models import Subject

from . import storage
from .access import classrooms_taught_by, leads_classroom, subjects_for
from .models import Assignment

logger = logging.getLogger(__name__)


class AssignmentSerializer(serializers.ModelSerializer):
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

    attachment = serializers.FileField(write_only=True, required=False)
    remove_attachment = serializers.BooleanField(write_only=True, required=False, default=False)

    class Meta:
        model = Assignment
        fields = [
            "id", "classroom", "classroom_name", "section_name",
            "subject", "subject_name", "teacher_name",
            "title", "instructions", "due_date", "is_overdue",
            "attachment", "remove_attachment", "attachment_url", "attachment_name",
            "can_edit", "created_at", "updated_at",
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

    def validate_attachment(self, value):
        ext = os.path.splitext(value.name)[1].lower()
        if ext not in storage.ALLOWED_EXTENSIONS:
            raise serializers.ValidationError(
                "Attach a PDF, Word, Excel, PowerPoint, text or image file."
            )
        if value.size > storage.MAX_ATTACHMENT_BYTES:
            raise serializers.ValidationError("Attachments can be at most 10 MB.")
        return value

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

    def _store_attachment(self, validated_data, instance=None):
        """Upload a new file, or drop the old one, before the row is saved."""
        upload = validated_data.pop("attachment", None)
        remove = validated_data.pop("remove_attachment", False)
        old_public_id = getattr(instance, "attachment_public_id", "")

        if upload is not None:
            try:
                url, public_id = storage.upload_attachment(upload, self.context["tenant"])
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
