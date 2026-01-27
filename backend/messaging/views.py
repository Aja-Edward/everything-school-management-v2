from rest_framework import viewsets, permissions, status
from rest_framework.response import Response
from rest_framework.decorators import action
from django.db.models import Q, Count
from django.utils import timezone
from tenants.mixins import TenantFilterMixin
from utils.pagination import StandardResultsPagination
from .models import Message, MessageTemplate, BulkMessage
from .serializers import (
    MessageSerializer, MessageCreateSerializer, MessageUpdateSerializer,
    MessageTemplateSerializer, BulkMessageSerializer, UserSerializer
)
from .permissions import IsParentTeacherOrAdmin
from users.models import CustomUser


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
        serializer.save(sender=self.request.user)

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
    """CRITICAL: TenantFilterMixin ensures tenant isolation."""
    queryset = BulkMessage.objects.all()  # Base queryset - will be filtered by mixins and get_queryset()
    serializer_class = BulkMessageSerializer
    permission_classes = [permissions.IsAuthenticated, IsParentTeacherOrAdmin]
    pagination_class = StandardResultsPagination  # PERFORMANCE: Paginate bulk messages

    def get_queryset(self):
        # CRITICAL: Call super() to get tenant-filtered queryset first
        queryset = super().get_queryset()

        # PERFORMANCE: Optimize queries by selecting related sender
        queryset = queryset.select_related('sender')

        return queryset.filter(sender=self.request.user)

    def perform_create(self, serializer):
        bulk_message = serializer.save(sender=self.request.user)
        
        # Calculate total recipients
        total_recipients = 0
        
        # Count recipients by roles
        if bulk_message.recipient_roles:
            role_count = CustomUser.objects.filter(
                role__in=bulk_message.recipient_roles,
                is_active=True
            ).exclude(id=self.request.user.id).count()
            total_recipients += role_count
        
        # Count custom recipients
        if bulk_message.custom_recipients:
            total_recipients += len(bulk_message.custom_recipients)
        
        # Update total recipients count
        bulk_message.total_recipients = total_recipients
        bulk_message.save(update_fields=['total_recipients'])

    @action(detail=True, methods=['post'])
    def send_now(self, request, pk=None):
        """Send bulk message immediately"""
        bulk_message = self.get_object()
        
        if bulk_message.status != 'draft':
            return Response(
                {'error': 'Only draft messages can be sent'}, 
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Here you would implement the actual sending logic
        # For now, we'll just mark it as sent
        bulk_message.status = 'sent'
        bulk_message.sent_at = timezone.now()
        bulk_message.save(update_fields=['status', 'sent_at'])
        
        return Response({'status': 'Bulk message sent'})

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
            total=Count('total_recipients')
        )['total'] or 0
        total_sent = BulkMessage.objects.filter(sender=user, status='sent').count()
        total_pending = BulkMessage.objects.filter(sender=user, status='pending').count()
        
        return Response({
            'total_bulk_messages': total_bulk_messages,
            'total_recipients': total_recipients,
            'total_sent': total_sent,
            'total_pending': total_pending,
        })
