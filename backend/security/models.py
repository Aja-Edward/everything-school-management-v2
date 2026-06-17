# security/models.py
from django.db import models
from django.conf import settings
from django.utils import timezone


class AuditLog(models.Model):
    ACTION_CHOICES = [
        ('login_success', 'Login Success'),
        ('login_failed', 'Login Failed'),
        ('logout', 'Logout'),
        ('password_change', 'Password Change'),
        ('password_reset', 'Password Reset'),
        ('user_created', 'User Created'),
        ('user_activated', 'User Activated'),
        ('user_deactivated', 'User Deactivated'),
        ('permission_change', 'Permission Change'),
        ('settings_update', 'Settings Update'),
        ('token_revoked', 'Token Revoked'),
        ('account_locked', 'Account Locked'),
    ]

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='audit_logs'
    )
    tenant = models.ForeignKey(
        'tenants.Tenant',
        on_delete=models.CASCADE,
        null=True, blank=True,
        related_name='audit_logs'
    )
    action = models.CharField(max_length=50, choices=ACTION_CHOICES)
    target_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='audit_logs_as_target'
    )
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.TextField(blank=True)
    metadata = models.JSONField(default=dict, blank=True)
    timestamp = models.DateTimeField(default=timezone.now, db_index=True)

    class Meta:
        ordering = ['-timestamp']
        indexes = [
            models.Index(fields=['tenant', 'timestamp']),
            models.Index(fields=['user', 'action']),
            models.Index(fields=['action', 'timestamp']),
        ]

    def __str__(self):
        return f"{self.action} by {self.user} at {self.timestamp}"


class LoginAttempt(models.Model):
    """Tracks login attempts per user/IP for suspicious activity detection."""
    email = models.EmailField()
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    tenant = models.ForeignKey(
        'tenants.Tenant',
        on_delete=models.CASCADE,
        null=True, blank=True
    )
    success = models.BooleanField(default=False)
    timestamp = models.DateTimeField(default=timezone.now, db_index=True)
    user_agent = models.TextField(blank=True)

    class Meta:
        ordering = ['-timestamp']
        indexes = [
            models.Index(fields=['email', 'timestamp']),
            models.Index(fields=['ip_address', 'timestamp']),
        ]


class RevokedToken(models.Model):
    """Stores revoked JWT tokens until their natural expiry."""
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='revoked_tokens'
    )
    jti = models.CharField(max_length=255, unique=True)  # JWT ID claim
    revoked_at = models.DateTimeField(default=timezone.now)
    expires_at = models.DateTimeField()  # Natural token expiry
    reason = models.CharField(max_length=50, default='logout')

    class Meta:
        indexes = [models.Index(fields=['jti'])]

    @classmethod
    def purge_expired(cls):
        """Call periodically to clean up expired tokens."""
        cls.objects.filter(expires_at__lt=timezone.now()).delete()