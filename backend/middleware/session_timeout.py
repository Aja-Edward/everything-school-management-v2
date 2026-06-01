# middleware/session_timeout.py
from django.utils import timezone
from django.conf import settings
from datetime import timedelta


class SessionTimeoutMiddleware:
    """
    Enforces per-tenant session timeout stored in TenantSettings.
    Falls back to settings.SESSION_COOKIE_AGE if no tenant setting found.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if request.user.is_authenticated:
            self._check_session_timeout(request)
        return self.get_response(request)

    def _check_session_timeout(self, request):
        from tenants.models import TenantSettings

        # Get timeout for this tenant (in minutes)
        timeout_minutes = None
        tenant = getattr(request, 'tenant', None) or getattr(
            request.user, 'tenant', None)

        if tenant:
            try:
                tenant_settings = TenantSettings.objects.get(tenant=tenant)
                timeout_minutes = tenant_settings.session_timeout_minutes
            except TenantSettings.DoesNotExist:
                pass

        if timeout_minutes is None:
            timeout_minutes = getattr(
                settings, 'SESSION_COOKIE_AGE', 1800) // 60

        timeout_delta = timedelta(minutes=timeout_minutes)
        now = timezone.now()

        last_activity_str = request.session.get('last_activity')

        if last_activity_str:
            last_activity = timezone.datetime.fromisoformat(last_activity_str)
            # Make timezone-aware if needed
            if timezone.is_naive(last_activity):
                last_activity = timezone.make_aware(last_activity)

            if now - last_activity > timeout_delta:
                # Session expired — flush it
                request.session.flush()
                return  # User is now anonymous for this request

        # Update last activity timestamp
        request.session['last_activity'] = now.isoformat()
