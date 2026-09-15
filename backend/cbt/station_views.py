"""
cbt/station_views.py

Endpoints that exist only on an exam station (CBT_STATION=true). Everywhere
else they answer 404. See cbt/station.py.

    GET  /api/cbt/station/                               what the station holds (public)
    POST /api/cbt/station/sign-in/                       {"package", "number", "pin"}: a student signs in
    POST /api/cbt/station/sign-out/                      forget the signed-in account on this computer
    POST /api/cbt/station/staff/key/                     {"key"}: whether the station key is right
    POST /api/cbt/station/staff/sign-in/                 {"key"}: staff sign in, for the invigilation board
    POST /api/cbt/station/packages/                      the package file, to load it (station key)
    GET  /api/cbt/station/packages/<package>/results/    the results file (station key)
    POST /api/cbt/station/packages/<package>/window/     {"opens_at", "closes_at"}: move the window (station key)

The station key goes in the X-Station-Key header.
"""

from datetime import timedelta

from django.contrib.auth.models import update_last_login
from django.http import Http404, JsonResponse
from django.utils import timezone
from django_ratelimit.core import get_usage
from django_ratelimit.decorators import ALL
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken

from authentication.cookie_auth import clear_auth_cookies, set_auth_cookies

from . import station
from .engine import Refused
from .models import CBTOfflinePackage

SESSION_MINUTES = 12 * 60

# Only wrong guesses count, so a whole class signing in at once is never held up.
WRONG_KEYS = "10/m"             # from one address, across every endpoint that takes the key
WRONG_PINS_PER_SLIP = "10/10m"  # at one slip number: a million PINs can't be worked through
WRONG_PINS_PER_ADDRESS = "30/m"  # from one computer, across slips


def client_address(request):
    """
    Where a request came from, for rate limits (settings.RATELIMIT_IP_META_KEY
    on a station). The station's nginx overwrites X-Real-IP with the lab
    computer's address, and only nginx can reach the backend.
    """
    return request.META.get("HTTP_X_REAL_IP") or request.META["REMOTE_ADDR"]


def _usage(request, group, key, rate, increment=False):
    return get_usage(request._request, group=group, key=key, rate=rate, method=ALL, increment=increment)


def _refuse_if_too_many(request, limits, message):
    for group, key, rate in limits:
        usage = _usage(request, group, key, rate)
        if usage and usage["count"] >= usage["limit"]:
            raise Refused(message, status=429, code="rate_limited")


def _count_wrong_guess(request, limits):
    for group, key, rate in limits:
        _usage(request, group, key, rate, increment=True)


class StationView(APIView):
    """No accounts are needed to reach these; each checks what it needs itself."""

    permission_classes = [AllowAny]
    authentication_classes = []

    def initial(self, request, *args, **kwargs):
        if not station.is_station():
            raise Http404()
        super().initial(request, *args, **kwargs)

    def handle_exception(self, exc):
        if isinstance(exc, Refused):
            return Response({"detail": exc.message, "code": exc.code}, status=exc.status)
        return super().handle_exception(exc)

    def require_key(self, request, key=None):
        """
        Refuse a request without the station key. Wrong keys from one address
        count towards one limit across every endpoint that takes the key, so
        it can't be guessed through the endpoints that aren't signing in.
        """
        limits = [("cbt-station-key", "ip", WRONG_KEYS)]
        _refuse_if_too_many(request, limits, "Too many wrong keys. Wait a minute, then try again.")
        if station.key_matches(request.headers.get("X-Station-Key") if key is None else key):
            return
        _count_wrong_guess(request, limits)
        raise Refused("The station key isn't right.", status=403, code="station_key")

    def package(self, package_id):
        package = CBTOfflinePackage.objects.filter(pk=package_id).select_related("paper__exam").first()
        if package is None:
            raise Refused("That paper isn't on this station.", status=404, code="not_found")
        return package


def _signed_in(request, user, body):
    """A response that signs `user` in on this computer, the way the normal login does."""
    refresh = RefreshToken.for_user(user)
    access = refresh.access_token
    access.set_exp(from_time=timezone.now(), lifetime=timedelta(minutes=SESSION_MINUTES))
    for claim, value in (("id", user.id), ("email", user.email), ("role", user.role), ("is_staff", user.is_staff)):
        access[claim] = value
    update_last_login(None, user)
    if hasattr(request, "session"):
        request.session["tenant_id"] = str(user.tenant_id)
    response = Response({**body, "tenant_slug": user.tenant.slug})
    return set_auth_cookies(response, str(access), str(refresh), max_age_minutes=SESSION_MINUTES)


class StatusView(StationView):
    def get(self, request):
        return Response(station.status())


class StudentSignInView(StationView):
    def post(self, request):
        data = request.data
        slip = f"{data.get('package')}:{str(data.get('number') or '').strip()}"
        limits = [("cbt-station-pin-slip", lambda group, _request: slip, WRONG_PINS_PER_SLIP),
                  ("cbt-station-pin-address", "ip", WRONG_PINS_PER_ADDRESS)]
        _refuse_if_too_many(request, limits, "Too many wrong PINs. Wait a few minutes, or ask the invigilator.")
        student = station.student_for_pin(data.get("package"), data.get("number"), data.get("pin"))
        if student is None:
            _count_wrong_guess(request, limits)
            raise Refused("That number and PIN don't match. Check the slip, or ask the invigilator.",
                          status=403, code="wrong_pin")
        package = self.package(data.get("package"))
        return _signed_in(request, student.user, {
            "student": {"name": student.full_name, "registration_number": student.registration_number or ""},
            "paper": package.paper_id,
        })


class SignOutView(StationView):
    def post(self, request):
        return clear_auth_cookies(Response({"signed_out": True}))


class StaffKeyView(StationView):
    def post(self, request):
        self.require_key(request, key=request.data.get("key") or "")
        return Response({"key": "right"})


class StaffSignInView(StationView):
    def post(self, request):
        self.require_key(request, key=request.data.get("key") or "")
        staff = station.staff_user()
        if staff is None:
            raise Refused("Load a paper onto the station first.", status=409, code="no_package")
        return _signed_in(request, staff, {"staff": True})


class PackagesView(StationView):
    def post(self, request):
        self.require_key(request)
        package = station.import_package(request.data)
        return Response(station.status() | {"loaded": str(package.id)}, status=201)


class ResultsView(StationView):
    def get(self, request, package_id):
        self.require_key(request)
        package = self.package(package_id)
        response = JsonResponse(station.export_results(package))
        stamp = timezone.localtime().strftime("%Y%m%d-%H%M")
        response["Content-Disposition"] = f'attachment; filename="cbt-results-{package.paper.exam_id}-{stamp}.json"'
        return response


class WindowView(StationView):
    def post(self, request, package_id):
        self.require_key(request)
        station.set_window(self.package(package_id), request.data.get("opens_at"), request.data.get("closes_at"))
        return Response(station.status())
