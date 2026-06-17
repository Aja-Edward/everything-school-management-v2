# security/authentication.py
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import TokenError, InvalidToken
from rest_framework.exceptions import AuthenticationFailed
from security.models import RevokedToken


class SecureJWTAuthentication(JWTAuthentication):
    """
    Extends SimpleJWT to also check:
    1. Token is not in the revoked list (jti check)
    2. Token version matches current user token_version
    """

    def get_validated_token(self, raw_token):
        token = super().get_validated_token(raw_token)

        # Check revocation list by jti
        jti = token.get('jti')
        if jti and RevokedToken.objects.filter(jti=jti).exists():
            raise InvalidToken('Token has been revoked')

        return token

    def get_user(self, validated_token):
        user = super().get_user(validated_token)

        # Check token_version matches
        token_version = validated_token.get('token_version', 0)
        if token_version != user.token_version:
            raise AuthenticationFailed(
                'Token is no longer valid. Please log in again.'
            )

        return user
