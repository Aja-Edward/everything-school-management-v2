"""
Cookie-based JWT Authentication for Django REST Framework.

This module provides secure httpOnly cookie-based authentication,
protecting against XSS attacks while maintaining a good developer experience.
"""

from django.conf import settings
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework.request import Request
import logging

logger = logging.getLogger(__name__)


class CookieJWTAuthentication(JWTAuthentication):
    """
    Custom JWT authentication that reads tokens from httpOnly cookies.

    Falls back to header-based authentication if no cookie is present,
    allowing both methods to work during migration or for special cases.
    """

    def authenticate(self, request: Request):
        """
        Attempt to authenticate using cookie first, then fall back to header.
        """
        # Try to get token from cookie first
        raw_token = request.COOKIES.get(settings.AUTH_COOKIE_ACCESS)

        logger.warning(f"🍪 All cookies: {list(request.COOKIES.keys())}")
        logger.warning(f"🍪 Looking for cookie: '{settings.AUTH_COOKIE_ACCESS}'")
        logger.warning(f"🍪 Found token: {bool(raw_token)}")

        if raw_token is None:
            # Fall back to header-based authentication
            return super().authenticate(request)

        try:
            validated_token = self.get_validated_token(raw_token)
            user = self.get_user(validated_token)
            logger.debug(f"Cookie authentication successful for user: {user.email}")
            return (user, validated_token)
        except (InvalidToken, TokenError) as e:
            logger.debug(f"Cookie token validation failed: {e}")
            # Don't raise here - fall back to header authentication
            return super().authenticate(request)


def set_auth_cookies(response, access_token: str, refresh_token: str = None):
    """
    Set JWT tokens as httpOnly cookies on the response.

    Args:
        response: Django/DRF response object
        access_token: JWT access token string
        refresh_token: JWT refresh token string (optional)
    """
    # Set access token cookie
    response.set_cookie(
        key=settings.AUTH_COOKIE_ACCESS,
        value=access_token,
        max_age=settings.AUTH_COOKIE_ACCESS_MAX_AGE,
        expires=None,
        path=settings.AUTH_COOKIE_PATH,
        domain=settings.AUTH_COOKIE_DOMAIN,
        secure=settings.AUTH_COOKIE_SECURE,
        httponly=settings.AUTH_COOKIE_HTTP_ONLY,
        samesite=settings.AUTH_COOKIE_SAMESITE,
    )

    # Set refresh token cookie (if provided)
    if refresh_token:
        response.set_cookie(
            key=settings.AUTH_COOKIE_REFRESH,
            value=refresh_token,
            max_age=settings.AUTH_COOKIE_REFRESH_MAX_AGE,
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
    """
    Clear JWT cookies from the response (for logout).

    Args:
        response: Django/DRF response object
    """
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
    """
    Attempt to refresh the access token using the refresh token from cookie.

    Args:
        request: Django request object

    Returns:
        tuple: (new_access_token, new_refresh_token) or (None, None) if refresh fails
    """
    refresh_token = request.COOKIES.get(settings.AUTH_COOKIE_REFRESH)

    if not refresh_token:
        logger.debug("No refresh token cookie found")
        return None, None

    try:
        refresh = RefreshToken(refresh_token)
        new_access = str(refresh.access_token)

        # If rotation is enabled, get new refresh token
        if settings.SIMPLE_JWT.get('ROTATE_REFRESH_TOKENS', False):
            new_refresh = str(refresh)
        else:
            new_refresh = refresh_token

        logger.debug("Access token refreshed successfully from cookie")
        return new_access, new_refresh

    except (InvalidToken, TokenError) as e:
        logger.warning(f"Failed to refresh token from cookie: {e}")
        return None, None
