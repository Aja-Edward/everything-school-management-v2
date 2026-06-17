# authentication/cookie_auth.py

from django.conf import settings
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework.request import Request
from security.authentication import SecureJWTAuthentication  # ✅ changed import
import logging

logger = logging.getLogger(__name__)


class CookieJWTAuthentication(SecureJWTAuthentication):  # ✅ changed base class
    """
    Custom JWT authentication that reads tokens from httpOnly cookies.
    Extends SecureJWTAuthentication to enforce token_version and revocation checks.
    Falls back to header-based authentication if no cookie is present.
    """

    def authenticate(self, request: Request):
        raw_token = request.COOKIES.get(settings.AUTH_COOKIE_ACCESS)

        logger.warning(f"🍪 All cookies: {list(request.COOKIES.keys())}")
        logger.warning(
            f"🍪 Looking for cookie: '{settings.AUTH_COOKIE_ACCESS}'")
        logger.warning(f"🍪 Found token: {bool(raw_token)}")

        if raw_token is None:
            return super().authenticate(request)

        try:
            # ✅ now calls SecureJWTAuthentication.get_validated_token
            validated_token = self.get_validated_token(raw_token)
            # ✅ now calls SecureJWTAuthentication.get_user
            user = self.get_user(validated_token)
            logger.debug(
                f"Cookie authentication successful for user: {user.email}")
            return (user, validated_token)
        except (InvalidToken, TokenError) as e:
            logger.debug(f"Cookie token validation failed: {e}")
            return super().authenticate(request)


# set_auth_cookies, clear_auth_cookies, refresh_access_token_from_cookie
# remain exactly the same — no changes needed below this line
def set_auth_cookies(response, access_token: str, refresh_token: str = None, max_age_minutes: int = 60):
    access_max_age = max_age_minutes * 60
    refresh_max_age = max_age_minutes * 60 * 24

    response.set_cookie(
        key=settings.AUTH_COOKIE_ACCESS,
        value=access_token,
        max_age=access_max_age,
        expires=None,
        path=settings.AUTH_COOKIE_PATH,
        domain=settings.AUTH_COOKIE_DOMAIN,
        secure=settings.AUTH_COOKIE_SECURE,
        httponly=settings.AUTH_COOKIE_HTTP_ONLY,
        samesite=settings.AUTH_COOKIE_SAMESITE,
    )

    if refresh_token:
        response.set_cookie(
            key=settings.AUTH_COOKIE_REFRESH,
            value=refresh_token,
            max_age=refresh_max_age,
            expires=None,
            path=settings.AUTH_COOKIE_PATH,
            domain=settings.AUTH_COOKIE_DOMAIN,
            secure=settings.AUTH_COOKIE_SECURE,
            httponly=settings.AUTH_COOKIE_HTTP_ONLY,
            samesite=settings.AUTH_COOKIE_SAMESITE,
        )

    logger.debug("Auth cookies set successfully")
    return response


def clear_auth_cookies(response):
    response.delete_cookie(
        key=settings.AUTH_COOKIE_ACCESS,
        path=settings.AUTH_COOKIE_PATH,
        domain=settings.AUTH_COOKIE_DOMAIN,
        samesite=settings.AUTH_COOKIE_SAMESITE,
    )
    response.delete_cookie(
        key=settings.AUTH_COOKIE_REFRESH,
        path=settings.AUTH_COOKIE_PATH,
        domain=settings.AUTH_COOKIE_DOMAIN,
        samesite=settings.AUTH_COOKIE_SAMESITE,
    )
    logger.debug("Auth cookies cleared")
    return response


def refresh_access_token_from_cookie(request):
    refresh_token = request.COOKIES.get(settings.AUTH_COOKIE_REFRESH)

    if not refresh_token:
        logger.debug("No refresh token cookie found")
        return None, None

    try:
        refresh = RefreshToken(refresh_token)
        new_access = str(refresh.access_token)

        if settings.SIMPLE_JWT.get('ROTATE_REFRESH_TOKENS', False):
            new_refresh = str(refresh)
        else:
            new_refresh = refresh_token

        logger.debug("Access token refreshed successfully from cookie")
        return new_access, new_refresh

    except (InvalidToken, TokenError) as e:
        logger.warning(f"Failed to refresh token from cookie: {e}")
        return None, None
