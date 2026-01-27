from django.db import models
from django.utils import timezone

from tenants.models import TenantMixin
from users.models import CustomUser


class Message(TenantMixin, models.Model):
    MESSAGE_TYPE_CHOICES = [
        ('in_app', 'In-App Message'),
        ('email', 'Email'),
        ('sms', 'SMS'),
        ('bulk', 'Bulk Message'),
    ]
    
    PRIORITY_CHOICES = [
        ('low', 'Low'),
        ('normal', 'Normal'),
        ('high', 'High'),
        ('urgent', 'Urgent'),
    ]
    
    STATUS_CHOICES = [
        ('draft', 'Draft'),
        ('sent', 'Sent'),
        ('delivered', 'Delivered'),
        ('failed', 'Failed'),
        ('pending', 'Pending'),
    ]
    
    sender = models.ForeignKey(
        CustomUser, on_delete=models.CASCADE, related_name="messaging_sent_messages"
    )
    recipient = models.ForeignKey(
        CustomUser, on_delete=models.CASCADE, related_name="messaging_received_messages"
    )
    subject = models.CharField(max_length=255)
    content = models.TextField()
    message_type = models.CharField(max_length=20, choices=MESSAGE_TYPE_CHOICES, default='in_app')
    priority = models.CharField(max_length=20, choices=PRIORITY_CHOICES, default='normal')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='draft')
    is_read = models.BooleanField(default=False)
    is_archived = models.BooleanField(default=False)
    is_deleted = models.BooleanField(default=False)
    
    # Delivery tracking
    sent_at = models.DateTimeField(null=True, blank=True)
    delivered_at = models.DateTimeField(null=True, blank=True)
    read_at = models.DateTimeField(null=True, blank=True)
    
    # External service tracking
    external_id = models.CharField(max_length=255, blank=True, null=True, help_text="External service message ID")
    delivery_status = models.TextField(blank=True, null=True, help_text="Delivery status from external service")
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"From {self.sender} to {self.recipient}: {self.subject}"

    class Meta:
        ordering = ["-created_at"]
        
    def mark_as_read(self):
        """Mark message as read"""
        if not self.is_read:
            self.is_read = True
            self.read_at = timezone.now()
            self.save(update_fields=['is_read', 'read_at'])
    
    def mark_as_sent(self):
        """Mark message as sent"""
        self.status = 'sent'
        self.sent_at = timezone.now()
        self.save(update_fields=['status', 'sent_at'])
    
    def mark_as_delivered(self):
        """Mark message as delivered"""
        self.status = 'delivered'
        self.delivered_at = timezone.now()
        self.save(update_fields=['status', 'delivered_at'])


class MessageTemplate(TenantMixin, models.Model):
    """Templates for common messages"""
    name = models.CharField(max_length=100)
    subject = models.CharField(max_length=255)
    content = models.TextField()
    message_type = models.CharField(max_length=20, choices=Message.MESSAGE_TYPE_CHOICES, default='in_app')
    is_active = models.BooleanField(default=True)
    created_by = models.ForeignKey(CustomUser, on_delete=models.CASCADE, related_name="messaging_templates")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.name

    class Meta:
        ordering = ['name']


class BulkMessage(TenantMixin, models.Model):
    """For sending messages to multiple recipients"""
    sender = models.ForeignKey(CustomUser, on_delete=models.CASCADE, related_name="messaging_bulk_messages")
    subject = models.CharField(max_length=255)
    content = models.TextField()
    message_type = models.CharField(max_length=20, choices=Message.MESSAGE_TYPE_CHOICES, default='in_app')
    priority = models.CharField(max_length=20, choices=Message.PRIORITY_CHOICES, default='normal')
    
    # Recipient filters
    recipient_roles = models.JSONField(default=list, help_text="List of user roles to send to")
    recipient_groups = models.JSONField(default=list, help_text="List of specific groups/classes")
    custom_recipients = models.JSONField(default=list, help_text="List of specific user IDs")
    
    # Status tracking
    total_recipients = models.IntegerField(default=0)
    sent_count = models.IntegerField(default=0)
    delivered_count = models.IntegerField(default=0)
    failed_count = models.IntegerField(default=0)
    
    status = models.CharField(max_length=20, choices=Message.STATUS_CHOICES, default='draft')
    scheduled_at = models.DateTimeField(null=True, blank=True)
    sent_at = models.DateTimeField(null=True, blank=True)
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    def __str__(self):
        return f"Bulk: {self.subject} ({self.total_recipients} recipients)"
    
    class Meta:
        ordering = ['-created_at']
