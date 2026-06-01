def get_tenant_session_timeout(user):
    try:
        if hasattr(user, "tenant") and user.tenant:
            settings_obj = getattr(user.tenant, "settings", None)
            if settings_obj and settings_obj.session_timeout_minutes:
                return int(settings_obj.session_timeout_minutes)
    except Exception:
        pass
    return 60  # fallback
