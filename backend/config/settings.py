"""
COMPLETE SETTINGS.PY FIX
Replace your entire settings.py with this corrected version
"""

from pathlib import Path
import os
import sys
from dotenv import load_dotenv
from datetime import timedelta
import dj_database_url
import cloudinary

ENV = os.getenv("ENV", "dev")
# Build paths
BASE_DIR = Path(__file__).resolve().parent.parent

env_file = BASE_DIR / f".env.{ENV}"
if env_file.exists():
    load_dotenv(dotenv_path=env_file)
else:
    raise RuntimeError(f"Missing environment file: .env.{ENV}")

if ENV == "prod":
    # Production: Use PROD_DATABASE_URL for Neon
    DATABASE_URL = os.getenv("PROD_DATABASE_URL")
    if not DATABASE_URL:
        raise ValueError("Missing PROD_DATABASE_URL for production environment")

    DATABASES = {
        "default": dj_database_url.parse(
            DATABASE_URL, conn_max_age=600, conn_health_checks=True, ssl_require=True
        )
    }
    # Ensure SSL is required for production
    DATABASES["default"]["OPTIONS"] = {"sslmode": "require"}
    print(f"Using PRODUCTION database: {DATABASE_URL[:30]}...")

else:
    # Local Development: Use LOCAL_DATABASE_URL
    LOCAL_DATABASE_URL = os.getenv("LOCAL_DATABASE_URL")
    if not LOCAL_DATABASE_URL:
        raise ValueError("Missing LOCAL_DATABASE_URL for local development")

    DATABASES = {
        "default": dj_database_url.parse(
            LOCAL_DATABASE_URL, conn_max_age=60, ssl_require=False
        )
    }
    print(f"Using LOCAL database: {LOCAL_DATABASE_URL[:30]}...")


# ============================================
# SECURITY SETTINGS
# ============================================

# Secret Key - FIXED to work with SIMPLE_JWT and Render builds
# Use a consistent development key in DEBUG mode, otherwise require env var
_is_debug = os.getenv("DEBUG", "False").lower() in ["true", "1", "yes"]
_dev_secret_key = "django-insecure-dev-key-for-local-development-only-do-not-use-in-production"

SECRET_KEY = os.getenv("DJANGO_SECRET_KEY", "")

# Allow dummy SECRET_KEY during collectstatic OR if explicitly building
# Handle missing SECRET_KEY during build
if not SECRET_KEY:
    # Allow temporary key during collectstatic or on Render build
    is_collectstatic = "collectstatic" in sys.argv
    is_render_build = os.getenv("RENDER") is not None

    if is_collectstatic or is_render_build:
        print("Using temporary SECRET_KEY for build/collectstatic")
        SECRET_KEY = "django-insecure-temporary-key-for-build-only-not-for-production"
    elif _is_debug:
        # Use consistent development key for local development
        print("Using development SECRET_KEY - DO NOT use in production!")
        SECRET_KEY = _dev_secret_key
    else:
        raise ValueError(
            "DJANGO_SECRET_KEY environment variable is required. "
            "Set it in Render dashboard > Environment tab."
        )

DJANGO_SECRET_KEY = SECRET_KEY  # Keep as alias for compatibility

# Debug mode
DEBUG = os.getenv("DEBUG", "False").lower() in ["true", "1", "yes"]
# Force token return in development for cross-origin HTTP
if DEBUG:
    AUTH_RETURN_TOKENS_IN_BODY = True
else:
    # In production with HTTPS, cookies work fine
    AUTH_RETURN_TOKENS_IN_BODY = False

# Frontend URL
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")

# Allowed hosts
ALLOWED_HOSTS = [
    host.strip()
    for host in os.getenv(
        "ALLOWED_HOSTS",
        "localhost,127.0.0.1,backend,school-project-with-edward.onrender.com",
    ).split(",")
]

# Production security settingsay
if not DEBUG:
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")  # CRITICAL for Render
    SECURE_SSL_REDIRECT = True
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    SECURE_BROWSER_XSS_FILTER = True
    SECURE_CONTENT_TYPE_NOSNIFF = True
    X_FRAME_OPTIONS = "DENY"
    SECURE_HSTS_SECONDS = 31536000
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True
    SECURE_HSTS_PRELOAD = True


# ============================================
# INSTALLED APPS
# ============================================

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "django_filters",
    "django.contrib.sites",
    "django_extensions",
    # Third-party apps
    "corsheaders",
    "rest_framework",
    "rest_framework.authtoken",
    "rest_framework_simplejwt.token_blacklist",
    "cloudinary",  # ✅ ADD THIS LINE - Important for Django integration
    "cloudinary_storage",
    # Auth apps
    "allauth",
    "allauth.account",
    "allauth.socialaccount",
    "allauth.socialaccount.providers.google",
    "allauth.socialaccount.providers.facebook",
    "dj_rest_auth",
    "dj_rest_auth.registration",
    # Your apps
    "messaging",
    "debug_toolbar",
    "utils",
    "userprofile.apps.UserprofileConfig",
    "students.apps.StudentsConfig",
    "dashboard",
    "users",
    "authentication",
    "classroom",
    "schoolSettings",
    "subject",
    "academics.apps.AcademicsConfig",
    "teacher",
    "timetable",
    "attendance",
    "exam",
    "result",
    "assignment",
    "notice",
    "fee",
    "parent",
    "schoolterm",
    "invitations",
    "events",
    "lesson",
    "tenants",
    "student_promotions",
]

SITE_ID = 1

# ============================================
# MIDDLEWARE
# ============================================

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",  # FIRST
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",  # Before auth
    "debug_toolbar.middleware.DebugToolbarMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",  # Before tenant
    "allauth.account.middleware.AccountMiddleware",
    "tenants.middleware.TenantMiddleware",  # AFTER auth
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

# ============================================
# TENANT MIDDLEWARE - PUBLIC PATHS
# ============================================

# These paths should be accessible without tenant or authentication
TENANT_PUBLIC_PATHS = [
    "/api/auth/register/",
    "/api/auth/login/",
    "/api/auth/verify/",
    "/api/auth/resend-verification/",
    "/api/auth/refresh/",
    "/api/auth/status/",
    "/api/auth/csrf/",
    "/api/auth/password-reset/",
    "/api/auth/check-email/",
    "/api/tenants/settings/",  # For public landing page info
    "/api/school-settings/school-settings/",  # For tenant registration
    "/admin/",
    "/static/",
    "/media/",
]


# ============================================
# SESSION SETTINGS
# ============================================

# Ensure sessions work properly for tenant storage
SESSION_ENGINE = "django.contrib.sessions.backends.db"
SESSION_COOKIE_NAME = "sessionid"
SESSION_COOKIE_AGE = 1209600  # 2 weeks
SESSION_SAVE_EVERY_REQUEST = False  # Only save when modified
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = "Lax"
SESSION_COOKIE_SECURE = not DEBUG  # True in production
# ============================================
# CSRF & COOKIE SETTINGS FOR AUTHENTICATION
# ============================================

# CSRF cookie settings for cross-subdomain support
CSRF_COOKIE_HTTPONLY = False  # Allow JavaScript to read CSRF token (needed for API calls)
CSRF_COOKIE_SAMESITE = "Lax"  # Allow CSRF cookie on same-site requests
CSRF_USE_SESSIONS = False  # Use cookie-based CSRF, not session-based

# In development, allow cookies across subdomains
if DEBUG:
    CSRF_COOKIE_DOMAIN = None  # Don't restrict domain in development
    SESSION_COOKIE_DOMAIN = None

# ============================================
# CORS SETTINGS (CRITICAL FIX)
# ============================================

CSRF_TRUSTED_ORIGINS = [
    origin.strip()
    for origin in os.getenv(
        "CSRF_TRUSTED_ORIGINS",
        "http://localhost:3000,http://localhost:5173,http://localhost:5174,"
        "http://bay-school.localhost:5173,"  # Add subdomain pattern for dev
        "https://www.al-qolamulmuwaffaq.com,"
        "https://al-qolamulmuwaffaq.com,"
        "https://school-project-with-edward.vercel.app",
    ).split(",")
    if origin.strip()
]

CORS_ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.getenv(
        "CORS_ALLOWED_ORIGINS",
        "http://localhost:3000,http://localhost:5173,http://localhost:5174,"
        "https://www.al-qolamulmuwaffaq.com,"
        "https://al-qolamulmuwaffaq.com,"
        "https://school-project-with-edward.vercel.app",
    ).split(",")
    if origin.strip()
]

# Allow subdomain patterns for multi-tenant support
CORS_ALLOWED_ORIGIN_REGEXES = [
    # Development: allow any subdomain of localhost
    r"^http://[\w-]+\.localhost:\d+$",
    # Production: allow any subdomain of schoolplatform.com
    r"^https://[\w-]+\.schoolplatform\.com$",
]

print(" CORS Allowed Origins:", CORS_ALLOWED_ORIGINS)
print(" CORS Allowed Origin Regexes:", CORS_ALLOWED_ORIGIN_REGEXES)

# Celery + Redis
CELERY_BROKER_URL = "redis://127.0.0.1:6379/0"
CELERY_RESULT_BACKEND = "redis://127.0.0.1:6379/0"
CELERY_ACCEPT_CONTENT = ["json"]
CELERY_TASK_SERIALIZER = "json"
CELERY_RESULT_SERIALIZER = "json"
CELERY_TIMEZONE = "Africa/Lagos"
CELERY_WORKER_POOL = "solo"  # for dev on Windows
# CELERY_WORKER_POOL = "threads"     # for production
CELERY_WORKER_CONCURRENCY = 1  # solo only supports 1

CORS_ALLOW_CREDENTIALS = True

CORS_ALLOW_HEADERS = [
    "accept",
    "accept-encoding",
    "authorization",
    "content-type",
    "dnt",
    "origin",
    "user-agent",
    "x-csrftoken",
    "x-requested-with",
    "x-tenant-id",
    "x-tenant-slug",
]

CORS_EXPOSE_HEADERS = [
    "content-type",
    "authorization",
]

CORS_ALLOW_METHODS = [
    "DELETE",
    "GET",
    "OPTIONS",
    "PATCH",
    "POST",
    "PUT",
]

# Ensure CORS headers are added to all responses including errors
CORS_PREFLIGHT_MAX_AGE = 86400

# For debugging in development - allow all origins
if DEBUG:
    CORS_ALLOW_ALL_ORIGINS = True

# ============================================
# TEMPLATES
# ============================================

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"


# Cloudinary Configuration
# ============================================
# CLOUDINARY CONFIGURATION
# ============================================

CLOUDINARY_CLOUD_NAME = os.getenv("CLOUDINARY_CLOUD_NAME")
CLOUDINARY_API_KEY = os.getenv("CLOUDINARY_API_KEY")
CLOUDINARY_API_SECRET = os.getenv("CLOUDINARY_API_SECRET")

# Validate Cloudinary credentials
if not all([CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET]):
    print("WARNING: Cloudinary credentials not fully configured")
    print(f"   Cloud Name: {'✓' if CLOUDINARY_CLOUD_NAME else '✗'}")
    print(f"   API Key: {'✓' if CLOUDINARY_API_KEY else '✗'}")
    print(f"   API Secret: {'✓' if CLOUDINARY_API_SECRET else '✗'}")
else:
    cloudinary.config(
        cloud_name=CLOUDINARY_CLOUD_NAME,
        api_key=CLOUDINARY_API_KEY,
        api_secret=CLOUDINARY_API_SECRET,
        secure=True,
    )
    print(f"Cloudinary configured: {CLOUDINARY_CLOUD_NAME}")

# Use Cloudinary for media file storage
if not DEBUG:
    DEFAULT_FILE_STORAGE = "cloudinary_storage.storage.MediaCloudinaryStorage"

# ============================================
# PASSWORD VALIDATION
# ============================================

AUTH_PASSWORD_VALIDATORS = [
    {
        "NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"
    },
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

# ============================================
# INTERNATIONALIZATION
# ============================================

LANGUAGE_CODE = "en-us"
TIME_ZONE = "Africa/Lagos"
USE_I18N = True
USE_TZ = True

# ============================================
# STATIC & MEDIA FILES
# ============================================

STATIC_URL = "/static/"
STATIC_ROOT = os.path.join(BASE_DIR, "staticfiles")
STATICFILES_DIRS = [os.path.join(BASE_DIR, "static")]

WEASYPRINT_BASEURL = os.path.join(BASE_DIR, "static")


MEDIA_URL = "/media/"
MEDIA_ROOT = os.path.join(BASE_DIR, "media")

# ============================================
# DEFAULT SETTINGS
# ============================================

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
AUTH_USER_MODEL = "users.CustomUser"

# ============================================
# AUTHENTICATION BACKENDS
# ============================================

AUTHENTICATION_BACKENDS = [
    "django.contrib.auth.backends.ModelBackend",
    "authentication.backends.EmailBackend",
]

# ============================================
# REST FRAMEWORK
# ============================================

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "authentication.cookie_auth.CookieJWTAuthentication",  # Cookie-based JWT (primary)
        "rest_framework_simplejwt.authentication.JWTAuthentication",  # Header-based JWT (fallback)
    ),
    # CRITICAL FIX: Don't require authentication by default
    # Individual views will specify their own permission classes
    "DEFAULT_PERMISSION_CLASSES": (
        "rest_framework.permissions.AllowAny",  # Changed from IsAuthenticated
    ),
    "DEFAULT_FILTER_BACKENDS": ["django_filters.rest_framework.DjangoFilterBackend"],
    # Add exception handler to provide better error messages
    "EXCEPTION_HANDLER": "rest_framework.views.exception_handler",
    # Ensure unauthenticated users get proper responses
    "UNAUTHENTICATED_USER": "django.contrib.auth.models.AnonymousUser",
}

# ============================================
# SIMPLE JWT - HttpOnly Cookie Configuration
# ============================================

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=60),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=7),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
    "UPDATE_LAST_LOGIN": True,
    "ALGORITHM": "HS256",
    "SIGNING_KEY": SECRET_KEY,
    "AUTH_HEADER_TYPES": ("Bearer",),
    "AUTH_HEADER_NAME": "HTTP_AUTHORIZATION",
    "USER_ID_FIELD": "id",
    "USER_ID_CLAIM": "user_id",
    "SLIDING_TOKEN_REFRESH_EXP_CLAIM": "refresh_exp",
    "TOKEN_TYPE_CLAIM": "token_type",
    "TOKEN_OBTAIN_SERIALIZER": "authentication.serializers.CustomTokenObtainPairSerializer",
}

# ============================================
# COOKIE SETTINGS FOR JWT AUTH
# ============================================

# Cookie names
AUTH_COOKIE_ACCESS = "access_token"
AUTH_COOKIE_REFRESH = "refresh_token"

# Cookie settings for cross-origin authentication
# Production: SameSite=None + Secure=True allows cross-origin cookies over HTTPS
# Development: Cookies won't work cross-origin over HTTP, so we also return tokens in body
AUTH_COOKIE_HTTP_ONLY = True  # Prevents JavaScript access (XSS protection)
AUTH_COOKIE_SECURE = not DEBUG  # Only send over HTTPS in production
AUTH_COOKIE_SAMESITE = "None" if not DEBUG else "Lax"  # None for cross-origin in production
AUTH_COOKIE_PATH = "/"
AUTH_COOKIE_DOMAIN = None

# Access token cookie max age (in seconds) - matches ACCESS_TOKEN_LIFETIME
AUTH_COOKIE_ACCESS_MAX_AGE = 60 * 60  # 1 hour

# Refresh token cookie max age (in seconds) - matches REFRESH_TOKEN_LIFETIME
AUTH_COOKIE_REFRESH_MAX_AGE = 60 * 60 * 24 * 7  # 7 days

# In development, also return tokens in response body for cross-origin support
AUTH_RETURN_TOKENS_IN_BODY = DEBUG  # Only in development

# ============================================
# DJANGO-ALLAUTH SETTINGS
# ============================================

REST_USE_JWT = True

ACCOUNT_USER_MODEL_USERNAME_FIELD = "username"
ACCOUNT_EMAIL_VERIFICATION = "mandatory"
ACCOUNT_CONFIRM_EMAIL_ON_GET = True
ACCOUNT_LOGIN_METHOD = {"username"}
ACCOUNT_SIGNUP_FIELDS = ["username*", "email*"]
# ACCOUNT_LOGIN_METHODS = ["username"]
ACCOUNT_EMAIL_CONFIRMATION_EXPIRE_DAYS = 3
ACCOUNT_LOGOUT_REDIRECT_URL = "/"
ACCOUNT_LOGOUT_ON_GET = False
ACCOUNT_DEFAULT_HTTP_PROTOCOL = "https" if not DEBUG else "http"  # FIXED
ACCOUNT_EMAIL_CONFIRMATION_HMAC = True
ACCOUNT_LOGIN_ON_EMAIL_CONFIRMATION = True
ACCOUNT_SESSION_REMEMBER = True
ACCOUNT_PRESERVE_USERNAME_CASING = False
ACCOUNT_UNIQUE_EMAIL = True

# Email confirmation URLs - FIXED to use FRONTEND_URL
ACCOUNT_EMAIL_CONFIRMATION_ANONYMOUS_REDIRECT_URL = f"{FRONTEND_URL}/email-confirmed/"
ACCOUNT_EMAIL_CONFIRMATION_AUTHENTICATED_REDIRECT_URL = f"{FRONTEND_URL}/dashboard/"

SOCIALACCOUNT_EMAIL_VERIFICATION = "none"
SOCIALACCOUNT_AUTO_SIGNUP = True
SOCIALACCOUNT_QUERY_EMAIL = True
SOCIALACCOUNT_ADAPTER = "authentication.adapters.CustomSocialAccountAdapter"


# ============================================
# SOCIAL AUTH PROVIDERS
# ============================================

SOCIALACCOUNT_PROVIDERS = {
    "google": {
        "SCOPE": ["profile", "email"],
        "AUTH_PARAMS": {"access_type": "online"},
        "OAUTH_PKCE_ENABLED": True,
        "FETCH_USERINFO": True,
        "APP": {
            "client_id": os.getenv("GOOGLE_CLIENT_ID", ""),
            "secret": os.getenv("GOOGLE_SECRET", ""),
        },
    },
    "facebook": {
        "METHOD": "oauth2",
        "SCOPE": ["email", "public_profile"],
        "AUTH_PARAMS": {"auth_type": "reauthenticate"},
        "INIT_PARAMS": {"cookie": True},
        "FIELDS": [
            "id",
            "first_name",
            "last_name",
            "middle_name",
            "name",
            "name_format",
            "picture",
            "short_name",
            "email",
        ],
        "EXCHANGE_TOKEN": True,
        "LOCALE_FUNC": "path.to.callable",
        "VERIFIED_EMAIL": False,
        "VERSION": "v13.0",
        "APP": {
            "client_id": os.getenv("FACEBOOK_CLIENT_ID", ""),
            "secret": os.getenv("FACEBOOK_SECRET", ""),
        },
    },
}

# ============================================
# DJ-REST-AUTH SERIALIZERS
# ============================================

REST_AUTH_SERIALIZERS = {
    # "LOGIN_SERIALIZER": "authentication.serializers.CustomTokenObtainPairSerializer",
    "USER_DETAILS_SERIALIZER": "authentication.serializers.UserDetailsSerializer",
}

# REST_AUTH_REGISTER_SERIALIZERS = {
#     "REGISTER_SERIALIZER": "dj_rest_auth.registration.serializers.RegisterSerializer",
# }
REST_AUTH_REGISTER_SERIALIZERS = {
    "REGISTER_SERIALIZER": "authentication.serializers.CustomRegisterSerializer",
}

# ============================================
# EMAIL SETTINGS
# ============================================

EMAIL_BACKEND = "django.core.mail.backends.console.EmailBackend"
EMAIL_HOST_USER = os.getenv("EMAIL_HOST_USER", "edwardaja750@gmail.com")
EMAIL_HOST_PASSWORD = os.getenv("EMAIL_HOST_PASSWORD", "your-brevo-smtp-password")
DEFAULT_FROM_EMAIL = os.getenv("DEFAULT_FROM_EMAIL", "edwardaja750@gmail.com")
BREVO_API_KEY = os.getenv("BREVO_API_KEY", "your-brevo-api-key-here")

# ============================================
# MULTI-TENANT SETTINGS
# ============================================

PLATFORM_DOMAIN = os.getenv("PLATFORM_DOMAIN", "schoolplatform.com")
PLATFORM_IP = os.getenv("PLATFORM_IP", "0.0.0.0")

# ============================================
# PAYMENT SETTINGS
# ============================================

PAYSTACK_SECRET_KEY = os.getenv("PAYSTACK_SECRET_KEY")
PAYSTACK_PUBLIC_KEY = os.getenv("PAYSTACK_PUBLIC_KEY")

# ============================================
# LOGGING
# ============================================

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "verbose": {
            "format": "{levelname} {asctime} {module} {message}",
            "style": "{",
        },
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "formatter": "verbose",
        },
    },
    "root": {
        "handlers": ["console"],
        "level": "INFO",
    },
    "loggers": {
        "django.request": {
            "handlers": ["console"],
            "level": "DEBUG",
            "propagate": False,
        },
        "rest_framework_simplejwt": {
            "handlers": ["console"],
            "level": "DEBUG",
            "propagate": False,
        },
        "tenants": {
            "handlers": ["console"],
            "level": "DEBUG",
            "propagate": False,
        },
    },
}
