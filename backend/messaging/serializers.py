from rest_framework import serializers
from .models import Message, MessageTemplate, BulkMessage
from users.models import CustomUser
from common.admin_identity import AuthorEmailField, AuthorNameField


class MessageSerializer(serializers.ModelSerializer):
    sender_name = AuthorNameField(source="sender")
    recipient_name = AuthorNameField(source="recipient")
    sender_email = AuthorEmailField(source="sender")
    recipient_email = AuthorEmailField(source="recipient")
    message_type_display = serializers.CharField(source="get_message_type_display", read_only=True)
    priority_display = serializers.CharField(source="get_priority_display", read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)

    class Meta:
        model = Message
        fields = [
            "id",
            "sender",
            "sender_name",
            "sender_email",
            "recipient",
            "recipient_name",
            "recipient_email",
            "subject",
            "content",
            "message_type",
            "message_type_display",
            "priority",
            "priority_display",
            "status",
            "status_display",
            "is_read",
            "is_archived",
            "is_deleted",
            "sent_at",
            "delivered_at",
            "read_at",
            "external_id",
            "delivery_status",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id", "sender", "sender_name", "sender_email", "created_at", 
            "updated_at", "sent_at", "delivered_at", "read_at", "external_id", 
            "delivery_status", "message_type_display", "priority_display", "status_display"
        ]


class MessageCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Message
        fields = [
            "recipient",
            "subject",
            "content",
            "message_type",
            "priority",
        ]


class MessageUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Message
        fields = [
            "subject",
            "content",
            "message_type",
            "priority",
            "is_archived",
            "is_deleted",
        ]


class MessageTemplateSerializer(serializers.ModelSerializer):
    created_by_name = AuthorNameField(source="created_by")
    message_type_display = serializers.CharField(source="get_message_type_display", read_only=True)

    class Meta:
        model = MessageTemplate
        fields = [
            "id",
            "name",
            "subject",
            "content",
            "message_type",
            "message_type_display",
            "is_active",
            "created_by",
            "created_by_name",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_by", "created_by_name", "created_at", "updated_at", "message_type_display"]


class BulkMessageSerializer(serializers.ModelSerializer):
    sender_name = AuthorNameField(source="sender")
    message_type_display = serializers.CharField(source="get_message_type_display", read_only=True)
    priority_display = serializers.CharField(source="get_priority_display", read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)

    class Meta:
        model = BulkMessage
        fields = [
            "id",
            "sender",
            "sender_name",
            "subject",
            "content",
            "message_type",
            "message_type_display",
            "priority",
            "priority_display",
            "recipient_roles",
            "recipient_groups",
            "custom_recipients",
            "total_recipients",
            "sent_count",
            "delivered_count",
            "failed_count",
            "status",
            "status_display",
            "scheduled_at",
            "sent_at",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id", "sender", "sender_name", "total_recipients", "sent_count", 
            "delivered_count", "failed_count", "sent_at", "created_at", "updated_at",
            "message_type_display", "priority_display", "status_display"
        ]


class UserSerializer(serializers.ModelSerializer):
    """Serializer for user selection in messaging"""
    # Who can be messaged: an admin is listed by title, as they sign.
    full_name = AuthorNameField(source="*")
    email = AuthorEmailField(source="*")
    role_display = serializers.CharField(source="get_role_display", read_only=True)

    class Meta:
        model = CustomUser
        fields = ["id", "email", "full_name", "role", "role_display"]
