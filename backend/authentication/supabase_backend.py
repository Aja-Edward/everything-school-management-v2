from jose import jwt
from jose import JWTError
from urllib.request import urlopen
import json

from django.conf import settings
from django.contrib.auth import get_user_model
from rest_framework.authentication import BaseAuthentication
from rest_framework.exceptions import AuthenticationFailed

User = get_user_model()

class SupabaseJWTAuthentication(BaseAuthentication):

    """
    Verifies Supabase JWT using JWKS (modern approach)
    """
    def authenticate(self, request):
        auth_header = request.META.get("HTTP_AUTHORIZATION", "")

        if not auth_header.startswith("Bearer "):
            return None

        token = auth_header.split(" ", 1)[1]

        try:
            # Fetch Supabase's public keys
            jwks_url = f"{settings.SUPERBASE_URL}/auth/v1/.well-known/jwks.json"
            jwks = json.loads(urlopen(jwks_url).read())

            # Get header to find secret key id
            unverified_header = jwt.get_unverified_header(token)
            kid = unverified_header.get("kid")

            key = next(
                (k for k in jwks["keys"] if k["kid"] == kid),
                None
            )
            if not key:
                raise AuthenticationFailed("Public key is not found.")
            

            payload = jwt.decode(
                token,
                key,
                algorithms=["RS256"],
            )
        except JWTError as e:
            raise AuthenticationFailed(f"Invalid token: {str(e)}")
        superbase_id = payload.get("sub")

        if not superbase_id:
            raise AuthenticationFailed("Token missing sub claim.")
        
        try:
            user = User.objects.get(superbase_id=superbase_id)
        except User.DoesNotExist:
            raise AuthenticationFailed("No Django user for this superbase ID.")
        
        return (user, payload)
