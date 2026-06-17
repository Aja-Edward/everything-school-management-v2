# security/utils.py
from django.conf import settings
import logging
from django.utils import timezone
from datetime import timedelta

logger = logging.getLogger(__name__)

FAILED_LOGIN_THRESHOLD = getattr(settings, 'FAILED_LOGIN_THRESHOLD', 5)
FAILED_LOGIN_WINDOW_MINUTES = getattr(
    settings, 'FAILED_LOGIN_WINDOW_MINUTES', 10)


def get_client_ip(request):
    x_forwarded = request.META.get('HTTP_X_FORWARDED_FOR')
    if x_forwarded:
        return x_forwarded.split(',')[0].strip()
    return request.META.get('REMOTE_ADDR')


def _is_security_enabled(tenant) -> bool:
    """Check if this tenant has opted into security features."""
    if not tenant:
        return False
    try:
        from tenants.models import TenantSettings
        settings = TenantSettings.objects.get(tenant=tenant)
        return settings.security_features_enabled
    except Exception:
        return False


def log_action(action, request=None, user=None, target_user=None, metadata=None):
    from security.models import AuditLog
    tenant = getattr(user, 'tenant', None) if user else None

    # ✅ Skip logging if tenant hasn't opted in
    if not _is_security_enabled(tenant):
        return

    try:
        ip = get_client_ip(request) if request else None
        user_agent = request.META.get('HTTP_USER_AGENT', '') if request else ''
        AuditLog.objects.create(
            user=user,
            tenant=tenant,
            action=action,
            target_user=target_user,
            ip_address=ip,
            user_agent=user_agent,
            metadata=metadata or {},
        )
    except Exception as e:
        logger.error(f"Audit log failed for action '{action}': {e}")


def record_login_attempt(email, request, success, tenant=None):
    from security.models import LoginAttempt

    # ✅ Skip if tenant hasn't opted in
    if not _is_security_enabled(tenant):
        return

    ip = get_client_ip(request)
    user_agent = request.META.get('HTTP_USER_AGENT', '')
    LoginAttempt.objects.create(
        email=email,
        ip_address=ip,
        tenant=tenant,
        success=success,
        user_agent=user_agent,
    )

    if not success:
        _check_and_handle_brute_force(email, ip, tenant, request)


def record_login_attempt(email, request, success, tenant=None):
    """Record a login attempt and check for suspicious activity."""
    from security.models import LoginAttempt

    ip = get_client_ip(request)
    user_agent = request.META.get('HTTP_USER_AGENT', '')

    LoginAttempt.objects.create(
        email=email,
        ip_address=ip,
        tenant=tenant,
        success=success,
        user_agent=user_agent,
    )

    if not success:
        _check_and_handle_brute_force(email, ip, tenant, request)


def _check_and_handle_brute_force(email, ip, tenant, request):
    """Lock account if too many failed attempts in the time window."""
    from security.models import LoginAttempt
    from django.contrib.auth import get_user_model
    User = get_user_model()

    window_start = timezone.now() - timedelta(minutes=FAILED_LOGIN_WINDOW_MINUTES)

    failed_count = LoginAttempt.objects.filter(
        email=email,
        success=False,
        timestamp__gte=window_start,
    ).count()

    if failed_count >= FAILED_LOGIN_THRESHOLD:
        try:
            user = User.objects.get(email=email)
            if user.is_active:
                user.is_active = False
                user.save(update_fields=['is_active'])
                log_action(
                    'account_locked',
                    request=request,
                    user=user,
                    target_user=user,
                    metadata={
                        'reason': 'brute_force',
                        'failed_attempts': failed_count,
                        'ip_address': ip,
                    }
                )
                logger.warning(
                    f"Account locked for {email} after {failed_count} "
                    f"failed attempts from IP {ip}"
                )
        except User.DoesNotExist:
            pass


def revoke_user_tokens(user, reason='logout'):
    """
    Revoke all active tokens for a user by incrementing token_version.
    Requires token_version field on User model (Step 4).
    """
    from security.models import AuditLog
    user.token_version = (user.token_version or 0) + 1
    user.save(update_fields=['token_version'])
    logger.info(f"Tokens revoked for user {user.email} - reason: {reason}")
