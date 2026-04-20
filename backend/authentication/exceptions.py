# authentication/exceptions.py
from django_ratelimit.exceptions import Ratelimited
from rest_framework.views import exception_handler
from rest_framework.response import Response
def ratelimit_exception_handler(exc, context):
    if isinstance(exc, Ratelimited):
        return Response(
            {'detail': 'Too many requests. Please wait before trying again.'},
            status=429
        )
    return exception_handler(exc, context)