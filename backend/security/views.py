# security/views.py
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status
from django.utils import timezone
from datetime import timedelta
from .models import AuditLog, LoginAttempt


def _security_enabled(user) -> bool:
    try:
        from tenants.models import TenantSettings
        s = TenantSettings.objects.get(tenant=user.tenant)
        return s.security_features_enabled
    except Exception:
        return False


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def audit_logs(request):
    """Return audit logs for the current tenant. Admins only."""
    user = request.user
    if not user.is_admin:
        return Response({'error': 'Forbidden'}, status=403)
    if not _security_enabled(user):
        return Response({'error': 'Security features are not enabled for this school.'}, status=403)
    logs = AuditLog.objects.filter(
        tenant=user.tenant).order_by('-timestamp')[:200]
    data = [
        {
            'id': log.id,
            'action': log.action,
            'user': log.user.email if log.user else 'System',
            'target_user': log.target_user.email if log.target_user else None,
            'ip_address': log.ip_address,
            'timestamp': log.timestamp.isoformat(),
            'metadata': log.metadata,
        }
        for log in logs
    ]
    return Response(data)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def login_attempts(request):
    """Return recent failed login attempts for the tenant."""
    user = request.user
    if not user.is_admin:
        return Response({'error': 'Forbidden'}, status=403)

    window = timezone.now() - timedelta(hours=24)
    attempts = LoginAttempt.objects.filter(
        tenant=user.tenant,
        timestamp__gte=window
    ).order_by('-timestamp')[:100]

    data = [
        {
            'email': a.email,
            'ip_address': a.ip_address,
            'success': a.success,
            'timestamp': a.timestamp.isoformat(),
        }
        for a in attempts
    ]
    return Response(data)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def unlock_account(request):
    """Allow admin to manually unlock a locked account."""
    from django.contrib.auth import get_user_model
    from security.utils import log_action
    User = get_user_model()

    if not request.user.is_admin:
        return Response({'error': 'Forbidden'}, status=403)

    user_id = request.data.get('user_id')
    if not user_id:
        return Response({'error': 'user_id required'}, status=400)

    try:
        target = User.objects.get(id=user_id, tenant=request.user.tenant)
        target.is_active = True
        target.save(update_fields=['is_active'])
        log_action('user_activated', request=request,
                   user=request.user, target_user=target,
                   metadata={'reason': 'manual_unlock'})
        return Response({'message': f'{target.email} has been unlocked.'})
    except User.DoesNotExist:
        return Response({'error': 'User not found'}, status=404)
