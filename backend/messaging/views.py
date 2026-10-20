from rest_framework import viewsets, permissions, status
from rest_framework.response import Response
from rest_framework.decorators import action
from django.db import transaction
from django.db.models import Q, Count, Sum
from django.utils import timezone
from tenants.mixins import TenantFilterMixin
from utils.pagination import StandardResultsPagination
from .delivery import AUDIENCES, bulk_recipients, deliver, is_school_admin, school_users
from .models import Message, MessageTemplate, BulkMessage
from .serializers import (
    MessageSerializer, MessageCreateSerializer, MessageUpdateSerializer,
    MessageTemplateSerializer, BulkMessageSerializer, UserSerializer
)
from .permissions import IsParentTeacherOrAdmin
from users.models import CustomUser
from rest_framework.exceptions import PermissionDenied, ValidationError
from common.admin_access import in_same_school
from tenants.membership import in_school_q, user_school_id


class MessageViewSet(TenantFilterMixin, viewsets.ModelViewSet):
    """CRITICAL: TenantFilterMixin ensures tenant isolation."""
    queryset = Message.objects.all()  # Base queryset - will be filtered by mixins and get_queryset()
    serializer_class = MessageSerializer
    permission_classes = [permissions.IsAuthenticated, IsParentTeacherOrAdmin]
    pagination_class = StandardResultsPagination  # PERFORMANCE: Paginate messages

    def get_queryset(self):
        # CRITICAL: Call super() to get tenant-filtered queryset first
        queryset = super().get_queryset()

        # PERFORMANCE: Optimize queries by selecting related users
        queryset = queryset.select_related('sender', 'recipient')

        user = self.request.user
        msg_type = self.request.query_params.get("type", None)
        is_archived = self.request.query_params.get("archived", "false").lower() == "true"
        is_deleted = self.request.query_params.get("deleted", "false").lower() == "true"

        queryset = queryset.filter(is_deleted=is_deleted)

        if msg_type == "inbox":
            queryset = queryset.filter(recipient=user, is_archived=is_archived)
        elif msg_type == "sent":
            queryset = queryset.filter(sender=user, is_archived=is_archived)
        elif msg_type == "drafts":
            queryset = queryset.filter(sender=user, status='draft')
        elif msg_type == "archived":
            queryset = queryset.filter(
                Q(sender=user) | Q(recipient=user), 
                is_archived=True
            )
        else:
            # Return all messages where user is sender or recipient
            queryset = queryset.filter(
                Q(sender=user) | Q(recipient=user),
                is_archived=is_archived
            )

        return queryset

    def get_serializer_class(self):
        if self.action == 'create':
            return MessageCreateSerializer
        elif self.action in ['update', 'partial_update']:
            return MessageUpdateSerializer
        return MessageSerializer

    def perform_create(self, serializer):
        # Any user id used to be accepted, so a message could go to anyone on
        # the platform. The recipient has to be in the sender's school.
        recipient = serializer.validated_data.get("recipient")
        if recipient is not None and not in_same_school(self.request.user, recipient):
            raise ValidationError({"recipient": "No such user in your school."})
        if serializer.validated_data.get("message_type") in ("sms", "bulk"):
            raise ValidationError({"message_type": "Send it in the app or by email."})
        tenant = getattr(self.request, "tenant", None)
        message = serializer.save(sender=self.request.user, tenant=tenant)
        # Saved as a draft by default; nothing marked it sent or told the
        # recipient until this.
        deliver([message], tenant)

    @action(detail=True, methods=['post'])
    def mark_as_read(self, request, pk=None):
        """Mark a message as read"""
        message = self.get_object()
        message.mark_as_read()
        return Response({'status': 'Message marked as read'})

    @action(detail=True, methods=['post'])
    def mark_as_unread(self, request, pk=None):
        """Mark a message as unread"""
        message = self.get_object()
        message.is_read = False
        message.read_at = None
        message.save(update_fields=['is_read', 'read_at'])
        return Response({'status': 'Message marked as unread'})

    @action(detail=True, methods=['post'])
    def archive(self, request, pk=None):
        """Archive a message"""
        message = self.get_object()
        message.is_archived = True
        message.save(update_fields=['is_archived'])
        return Response({'status': 'Message archived'})

    @action(detail=True, methods=['post'])
    def unarchive(self, request, pk=None):
        """Unarchive a message"""
        message = self.get_object()
        message.is_archived = False
        message.save(update_fields=['is_archived'])
        return Response({'status': 'Message unarchived'})

    @action(detail=True, methods=['post'])
    def delete_message(self, request, pk=None):
        """Soft delete a message"""
        message = self.get_object()
        message.is_deleted = True
        message.save(update_fields=['is_deleted'])
        return Response({'status': 'Message deleted'})

    @action(detail=False, methods=['get'])
    def stats(self, request):
        """Get message statistics for the current user"""
        user = request.user
        total_inbox = Message.objects.filter(recipient=user, is_deleted=False).count()
        unread_inbox = Message.objects.filter(recipient=user, is_read=False, is_deleted=False).count()
        total_sent = Message.objects.filter(sender=user, is_deleted=False).count()
        total_drafts = Message.objects.filter(sender=user, status='draft', is_deleted=False).count()
        total_archived = Message.objects.filter(
            Q(sender=user) | Q(recipient=user), 
            is_archived=True, 
            is_deleted=False
        ).count()

        return Response({
            'total_inbox': total_inbox,
            'unread_inbox': unread_inbox,
            'total_sent': total_sent,
            'total_drafts': total_drafts,
            'total_archived': total_archived,
        })

    @action(detail=False, methods=['get'])
    def users(self, request):
        """Get list of users for message composition"""
        users = CustomUser.objects.filter(is_active=True).exclude(id=request.user.id)
        # This listed every active user on the platform, names and emails,
        # to anyone signed in. Platform staff still see everyone.
        if not getattr(request.user, "is_platform_staff", False):
            school_id = user_school_id(request.user)
            users = (
                users.filter(in_school_q(school_id)).distinct()
                if school_id is not None
                else users.none()
            )
        serializer = UserSerializer(users, many=True)
        return Response(serializer.data)


class MessageTemplateViewSet(TenantFilterMixin, viewsets.ModelViewSet):
    """CRITICAL: TenantFilterMixin ensures tenant isolation."""
    queryset = MessageTemplate.objects.filter(is_active=True)
    serializer_class = MessageTemplateSerializer
    permission_classes = [permissions.IsAuthenticated, IsParentTeacherOrAdmin]
    pagination_class = StandardResultsPagination  # PERFORMANCE: Paginate templates

    def get_queryset(self):
        # CRITICAL: Call super() to get tenant-filtered queryset first
        queryset = super().get_queryset()

        # PERFORMANCE: Optimize queries by selecting related created_by user
        queryset = queryset.select_related('created_by')

        return queryset

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    @action(detail=True, methods=['post'])
    def use_template(self, request, pk=None):
        """Use a template to create a new message"""
        template = self.get_object()
        return Response({
            'subject': template.subject,
            'content': template.content,
            'message_type': template.message_type,
        })


class BulkMessageViewSet(TenantFilterMixin, viewsets.ModelViewSet):
    """
    An admin's message to a whole group (all teachers, all parents, ...) in
    their school. Sending stores one Message per recipient, so each finds it
    in their own Messages inbox, and rings their notification bell.

    CRITICAL: TenantFilterMixin ensures tenant isolation.
    """
    queryset = BulkMessage.objects.all()  # Base queryset - will be filtered by mixins and get_queryset()
    serializer_class = BulkMessageSerializer
    permission_classes = [permissions.IsAuthenticated, IsParentTeacherOrAdmin]
    pagination_class = StandardResultsPagination  # PERFORMANCE: Paginate bulk messages

    def check_permissions(self, request):
        super().check_permissions(request)
        # Any teacher or parent could reach this before, and so message the
        # whole school.
        if not is_school_admin(request.user):
            raise PermissionDenied("Only school admins send bulk messages.")

    def get_queryset(self):
        # CRITICAL: Call super() to get tenant-filtered queryset first
        queryset = super().get_queryset()

        # PERFORMANCE: Optimize queries by selecting related sender
        queryset = queryset.select_related('sender')

        return queryset.filter(sender=self.request.user)

    def perform_create(self, serializer):
        data = serializer.validated_data
        unknown = set(data.get("recipient_roles") or []) - set(AUDIENCES)
        if unknown:
            raise ValidationError({"recipient_roles": f"Choose from {', '.join(sorted(AUDIENCES))}."})
        if data.get("recipient_groups"):
            raise ValidationError({"recipient_groups": "Sending to a class is not available yet."})
        if data.get("message_type") in ("sms", "bulk"):
            raise ValidationError({"message_type": "Send it in the app or by email."})

        named = {int(pk) for pk in data.get("custom_recipients") or [] if str(pk).isdigit()}
        in_school = set(school_users(self.request.user).filter(pk__in=named).values_list("pk", flat=True))
        if named - in_school:
            raise ValidationError({"custom_recipients": "Some of these people are not in your school."})

        # Checked before saving, so a refused request leaves no draft behind.
        probe = BulkMessage(
            sender=self.request.user, recipient_roles=data.get("recipient_roles") or [],
            custom_recipients=data.get("custom_recipients") or [],
        )
        total = bulk_recipients(probe).count()
        if not total:
            raise ValidationError({"recipient_roles": "Nobody in your school matches these recipients."})
        serializer.save(
            sender=self.request.user, tenant=getattr(self.request, "tenant", None), total_recipients=total,
        )

    @action(detail=True, methods=['post'])
    def send_now(self, request, pk=None):
        """Send a draft bulk message: one Message per recipient, each delivered."""
        bulk_message = self.get_object()

        if bulk_message.status != 'draft':
            return Response(
                {'error': 'Only draft messages can be sent'},
                status=status.HTTP_400_BAD_REQUEST
            )

        tenant = getattr(request, "tenant", None) or bulk_message.tenant
        recipients = list(bulk_recipients(bulk_message))
        with transaction.atomic():
            messages = Message.objects.bulk_create([
                Message(
                    tenant=tenant, sender=request.user, recipient=user,
                    subject=bulk_message.subject, content=bulk_message.content,
                    message_type=bulk_message.message_type, priority=bulk_message.priority,
                )
                for user in recipients
            ], batch_size=500)
            deliver(messages, tenant)

            bulk_message.status = 'sent'
            bulk_message.sent_at = timezone.now()
            bulk_message.total_recipients = bulk_message.sent_count = len(messages)
            bulk_message.save(update_fields=['status', 'sent_at', 'total_recipients', 'sent_count'])

        return Response(self.get_serializer(bulk_message).data)

    @action(detail=True, methods=['post'])
    def schedule(self, request, pk=None):
        """Schedule a bulk message for later sending"""
        bulk_message = self.get_object()
        scheduled_at = request.data.get('scheduled_at')
        
        if not scheduled_at:
            return Response(
                {'error': 'scheduled_at is required'}, 
                status=status.HTTP_400_BAD_REQUEST
            )
        
        bulk_message.scheduled_at = scheduled_at
        bulk_message.status = 'pending'
        bulk_message.save(update_fields=['scheduled_at', 'status'])
        
        return Response({'status': 'Bulk message scheduled'})

    @action(detail=False, methods=['get'])
    def stats(self, request):
        """Get bulk message statistics"""
        user = request.user
        total_bulk_messages = BulkMessage.objects.filter(sender=user).count()
        total_recipients = BulkMessage.objects.filter(sender=user).aggregate(
            total=Sum('total_recipients')
        )['total'] or 0
        total_sent = BulkMessage.objects.filter(sender=user, status='sent').count()
        total_pending = BulkMessage.objects.filter(sender=user, status='pending').count()
        
        return Response({
            'total_bulk_messages': total_bulk_messages,
            'total_recipients': total_recipients,
            'total_sent': total_sent,
            'total_pending': total_pending,
        })
