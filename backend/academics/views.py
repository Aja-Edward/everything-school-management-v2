# academics/views.py
from rest_framework import viewsets, status, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.filters import SearchFilter, OrderingFilter
from django_filters.rest_framework import DjangoFilterBackend
from django.db.models import Q
from rest_framework.permissions import IsAuthenticated
from django.db import transaction
from datetime import date
import logging

logger = logging.getLogger(__name__)

from .models import (
    TermType,
    CalendarEventType,
    EducationLevel,
    AcademicSession,
    Term,
    SubjectAllocation,
    Curriculum,
    AcademicCalendar,
)

from subject.models import Subject

from .serializers import (
    TermTypeSerializer,
    CalendarEventTypeSerializer,
    EducationLevelSerializer,
    AcademicSessionSerializer,
    TermSerializer,
    SubjectSerializer,
    SubjectAllocationSerializer,
    CurriculumSerializer,
    AcademicCalendarSerializer,
)


# ==============================================================================
# TENANT AWARE MIXIN
# ==============================================================================

class TenantAwareMixin:
    """Mixin to handle tenant filtering and assignment"""

    def get_tenant(self):
        """
        Resolve the current tenant via multiple fallback strategies.
        Returns a Tenant instance or None.
        """

        # Strategy 1: middleware set request.tenant (PRIMARY)
        if hasattr(self.request, "tenant") and self.request.tenant:
            logger.info(f"✅ Tenant found from middleware: {self.request.tenant}")
            return self.request.tenant

        user = self.request.user

        # Strategy 2: user.tenant attribute
        if user.is_authenticated and hasattr(user, "tenant") and user.tenant:
            logger.info(f"✅ Tenant found from user.tenant: {user.tenant}")
            return user.tenant

        # Strategy 3: user.userprofile.tenant
        if (
            user.is_authenticated
            and hasattr(user, "userprofile")
            and hasattr(user.userprofile, "tenant")
        ):
            tenant = user.userprofile.tenant
            if tenant:
                logger.info(f"✅ Tenant found from user.userprofile.tenant: {tenant}")
                return tenant

        # Strategy 4: user.tenant_users relationship
        if (
            user.is_authenticated
            and hasattr(user, "tenant_users")
            and user.tenant_users.exists()
        ):
            tenant = user.tenant_users.first().tenant
            logger.info(f"✅ Tenant found from user.tenant_users: {tenant}")
            return tenant

        # Strategy 5: request headers
        tenant_id = self.request.headers.get("X-Tenant-ID")
        tenant_slug = self.request.headers.get("X-Tenant-Slug")

        if tenant_id:
            try:
                from tenants.models import Tenant
                import uuid

                uuid.UUID(str(tenant_id))
                tenant = Tenant.objects.filter(id=tenant_id, is_active=True).first()
                if tenant:
                    logger.info(f"✅ Tenant found from X-Tenant-ID header: {tenant}")
                    return tenant
            except (ValueError, Exception) as e:
                logger.warning(
                    f"⚠️ Invalid tenant ID in header: {tenant_id}, error: {e}"
                )

        if tenant_slug:
            try:
                from tenants.models import Tenant

                tenant = Tenant.objects.filter(slug=tenant_slug, is_active=True).first()
                if tenant:
                    logger.info(f"✅ Tenant found from X-Tenant-Slug header: {tenant}")
                    return tenant
            except Exception as e:
                logger.warning(
                    f"⚠️ Error looking up tenant slug: {tenant_slug}, error: {e}"
                )

        # Strategy 6: session
        if hasattr(self.request, "session"):
            session_tenant_id = self.request.session.get("tenant_id")
            if session_tenant_id:
                try:
                    from tenants.models import Tenant

                    tenant = Tenant.objects.filter(
                        id=session_tenant_id, is_active=True
                    ).first()
                    if tenant:
                        logger.info(f"✅ Tenant found from session: {tenant}")
                        return tenant
                except Exception as e:
                    logger.warning(f"⚠️ Error looking up tenant from session: {e}")

        # No tenant found — log diagnostics
        logger.error("❌ NO TENANT FOUND - Debugging information:")
        logger.error(
            f"  - User authenticated: {user.is_authenticated if hasattr(self.request, 'user') else 'N/A'}"
        )
        logger.error(f"  - User: {user if hasattr(self.request, 'user') else 'N/A'}")
        logger.error(f"  - Has request.tenant: {hasattr(self.request, 'tenant')}")
        logger.error(
            f"  - request.tenant: {getattr(self.request, 'tenant', 'NOT SET')}"
        )
        logger.error(
            f"  - X-Tenant-ID: {self.request.headers.get('X-Tenant-ID', 'NOT SET')}"
        )
        logger.error(
            f"  - X-Tenant-Slug: {self.request.headers.get('X-Tenant-Slug', 'NOT SET')}"
        )
        logger.error(f"  - Host: {self.request.get_host()}")
        logger.error(f"  - Path: {self.request.path}")

        return None

    def get_queryset(self):
        """Filter queryset by tenant"""
        queryset = super().get_queryset()
        tenant = self.get_tenant()
        if tenant:
            logger.debug(f"Filtering queryset for tenant: {tenant}")
            return queryset.filter(tenant=tenant)
        logger.warning("No tenant found in get_queryset — returning empty queryset")
        return queryset.none()

    def perform_create(self, serializer):
        """
        Save new instance scoped to the current tenant.
        Single save — avoids the double-save bug in the original implementation.
        """
        tenant = self.get_tenant()
        if not tenant:
            raise ValueError(
                "No tenant found. This could be because:\n"
                "1. You're not accessing through a valid subdomain\n"
                "2. The X-Tenant-ID header is missing or invalid\n"
                "3. Your user account is not associated with a tenant\n"
                "Please ensure you're logged in with a valid tenant account."
            )
        logger.info(f"Creating object with tenant: {tenant}")
        serializer.save(tenant=tenant)

    def perform_update(self, serializer):
        """Ensure tenant doesn't change on update"""
        tenant = self.get_tenant()
        if not tenant:
            raise ValueError("No tenant found.")
        if serializer.instance.tenant != tenant:
            raise PermissionError("Cannot update records from another tenant.")
        logger.info(f"Updating object for tenant: {tenant}")
        serializer.save()


# ==============================================================================
# NEW FK MODEL VIEWSETS
# ==============================================================================


class TermTypeViewSet(TenantAwareMixin, viewsets.ModelViewSet):
    """
    ViewSet for TermType.
    Allows schools to manage their own term definitions
    (e.g. First/Second/Third Term, or Semester 1/2).
    """

    queryset = TermType.objects.all()
    serializer_class = TermTypeSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ["is_active"]
    search_fields = ["name", "code"]
    ordering_fields = ["display_order", "name"]
    ordering = ["display_order", "name"]


class CalendarEventTypeViewSet(TenantAwareMixin, viewsets.ModelViewSet):
    """
    ViewSet for CalendarEventType.
    Allows schools to define their own calendar event categories.
    """

    queryset = CalendarEventType.objects.all()
    serializer_class = CalendarEventTypeSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ["is_active"]
    search_fields = ["name", "code"]
    ordering_fields = ["display_order", "name"]
    ordering = ["display_order", "name"]


class EducationLevelViewSet(TenantAwareMixin, viewsets.ModelViewSet):
    """
    ViewSet for EducationLevel.
    Allows schools to define their education levels
    (e.g. Nursery, Primary, Junior Secondary, Senior Secondary).
    """

    queryset = EducationLevel.objects.all()
    serializer_class = EducationLevelSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ["is_active"]
    search_fields = ["name", "code"]
    ordering_fields = ["display_order", "name"]
    ordering = ["display_order", "name"]


# ==============================================================================
# ACADEMIC SESSION VIEWSET
# ==============================================================================

class AcademicSessionViewSet(TenantAwareMixin, viewsets.ModelViewSet):
    """ViewSet for Academic Sessions"""

    queryset = AcademicSession.objects.all().order_by("-start_date")
    serializer_class = AcademicSessionSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ["is_current", "is_active"]
    search_fields = ["name"]
    ordering_fields = ["start_date", "end_date", "name", "created_at"]
    ordering = ["-start_date"]

    @action(detail=False, methods=["get"])
    def current(self, request):
        """Get the currently active academic session"""
        tenant = self.get_tenant()
        if not tenant:
            return Response(
                {"error": "No tenant found"}, status=status.HTTP_400_BAD_REQUEST
            )

        current_session = AcademicSession.objects.filter(
            tenant=tenant, is_current=True
        ).first()

        if current_session:
            return Response(self.get_serializer(current_session).data)

        return Response(
            {"message": "No current academic session set"},
            status=status.HTTP_404_NOT_FOUND,
        )

    @action(detail=True, methods=["post"])
    def set_current(self, request, pk=None):
        """Set this session as the current active session"""
        session = self.get_object()
        tenant = self.get_tenant()
        if not tenant:
            return Response(
                {"error": "No tenant found"}, status=status.HTTP_400_BAD_REQUEST
            )

        with transaction.atomic():
            AcademicSession.objects.filter(tenant=tenant).exclude(id=session.id).update(
                is_current=False
            )
            session.is_current = True
            session.is_active = True
            session.save()

        return Response(
            {
                "message": f'Academic session "{session.name}" is now current',
                "session": self.get_serializer(session).data,
            }
        )

    @action(detail=True, methods=["get"])
    def terms(self, request, pk=None):
        """Get all terms for this academic session"""
        session = self.get_object()
        terms = session.terms.select_related("term_type").order_by(
            "term_type__display_order"
        )
        return Response(TermSerializer(terms, many=True).data)

    @action(detail=True, methods=["get"])
    def statistics(self, request, pk=None):
        """Get statistics for this academic session"""
        session = self.get_object()
        stats = {
            "classrooms": (
                session.classrooms.count() if hasattr(session, "classrooms") else 0
            ),
            "terms": session.terms.count(),
            "students": (
                session.student_fees.values("student").distinct().count()
                if hasattr(session, "student_fees")
                else 0
            ),
            "is_current": session.is_current,
            "is_active": session.is_active,
        }
        return Response(stats)

    def perform_create(self, serializer):
        """Handle creation: deactivate other current sessions if needed, then save."""
        tenant = self.get_tenant()
        if not tenant:
            raise ValueError(
                "No tenant found. Please ensure you're logged in with a valid tenant account."
            )

        if serializer.validated_data.get("is_current", False):
            AcademicSession.objects.filter(tenant=tenant).update(is_current=False)

        session = serializer.save(tenant=tenant)

        # Auto-set as current if it's the only session for this tenant
        if AcademicSession.objects.filter(tenant=tenant).count() == 1:
            session.is_current = True
            session.is_active = True
            session.save()

    def perform_update(self, serializer):
        """Handle updates: deactivate sibling current sessions if needed."""
        tenant = self.get_tenant()
        if not tenant:
            raise ValueError("No tenant found.")

        if serializer.instance.tenant != tenant:
            raise PermissionError("Cannot update records from another tenant.")

        if serializer.validated_data.get("is_current", False):
            AcademicSession.objects.filter(tenant=tenant).exclude(
                id=serializer.instance.id
            ).update(is_current=False)

        serializer.save()


# ==============================================================================
# TERM VIEWSET
# ==============================================================================

class TermViewSet(TenantAwareMixin, viewsets.ModelViewSet):
    """ViewSet for Academic Terms"""

    queryset = (
        Term.objects.select_related(
            "academic_session", "term_type"  # UPDATED: select term_type FK
        )
        .all()
        .order_by("academic_session", "term_type__display_order")
    )

    serializer_class = TermSerializer
    permission_classes = [permissions.IsAuthenticated]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    # UPDATED: filter by term_type FK instead of old name CharField
    filterset_fields = ["academic_session", "term_type", "is_current", "is_active"]
    search_fields = ["term_type__name", "academic_session__name"]
    ordering_fields = [
        "start_date",
        "end_date",
        "created_at",
        "term_type__display_order",
    ]
    ordering = ["academic_session", "term_type__display_order"]

    @action(detail=False, methods=["get"])
    def by_session(self, request):
        """Get terms filtered by academic session"""
        session_id = request.query_params.get("session_id")
        tenant = self.get_tenant()
        if not tenant:
            return Response(
                {"error": "No tenant found"}, status=status.HTTP_400_BAD_REQUEST
            )

        queryset = self.get_queryset()
        if session_id:
            queryset = queryset.filter(academic_session_id=session_id)

        return Response(self.get_serializer(queryset, many=True).data)

    @action(detail=True, methods=["post"])
    def set_current(self, request, pk=None):
        """Set this term as the current active term"""
        term = self.get_object()
        tenant = self.get_tenant()
        if not tenant:
            return Response(
                {"error": "No tenant found"}, status=status.HTTP_400_BAD_REQUEST
            )

        with transaction.atomic():
            Term.objects.filter(
                tenant=tenant, academic_session=term.academic_session
            ).update(is_current=False)
            term.is_current = True
            term.is_active = True
            term.save()

        return Response(
            {
                # UPDATED: use backward-compat get_name_display() which reads from FK
                "message": f'Term "{term.get_name_display()}" is now the current active term',
                "term": self.get_serializer(term).data,
            }
        )

    @action(detail=False, methods=["get"])
    def current(self, request):
        """Get the currently active term"""
        tenant = self.get_tenant()
        if not tenant:
            return Response(
                {"error": "No tenant found"}, status=status.HTTP_400_BAD_REQUEST
            )

        current_term = Term.objects.filter(tenant=tenant, is_current=True).first()
        if current_term:
            return Response(self.get_serializer(current_term).data)

        return Response(
            {"message": "No current term found"}, status=status.HTTP_404_NOT_FOUND
        )

    @action(detail=True, methods=["get"])
    def subjects(self, request, pk=None):
        """Get all subjects allocated for this term's academic session"""
        term = self.get_object()
        tenant = self.get_tenant()

        allocations = SubjectAllocation.objects.filter(
            tenant=tenant, academic_session=term.academic_session, is_active=True
        ).select_related("subject", "teacher", "teacher__user", "education_level")

        subjects = Subject.objects.filter(
            id__in=allocations.values_list("subject_id", flat=True)
        ).distinct()

        return Response(
            {
                "term": self.get_serializer(term).data,
                "subjects": SubjectSerializer(subjects, many=True).data,
                "allocations": SubjectAllocationSerializer(allocations, many=True).data,
                "total_subjects": subjects.count(),
                "total_allocations": allocations.count(),
            }
        )

    def perform_create(self, serializer):
        """Handle current term logic and tenant on create."""
        tenant = self.get_tenant()
        if not tenant:
            raise ValueError(
                "No tenant found. Please ensure you're logged in with a valid tenant account."
            )

        # UPDATED: current-term deduplication uses term_type FK field
        if serializer.validated_data.get("is_current", False):
            Term.objects.filter(
                tenant=tenant,
                academic_session=serializer.validated_data["academic_session"],
            ).update(is_current=False)

        term = serializer.save(tenant=tenant)

        # Auto-set as current if it's the first term for this session
        if (
            Term.objects.filter(
                tenant=tenant, academic_session=term.academic_session
            ).count()
            == 1
        ):
            term.is_current = True
            term.is_active = True
            term.save()

    def perform_update(self, serializer):
        """Handle current term logic and tenant on update."""
        tenant = self.get_tenant()
        if not tenant:
            raise ValueError("No tenant found.")

        if serializer.instance.tenant != tenant:
            raise PermissionError("Cannot update records from another tenant.")

        if serializer.validated_data.get("is_current", False):
            Term.objects.filter(
                tenant=tenant,
                academic_session=serializer.instance.academic_session,
            ).exclude(id=serializer.instance.id).update(is_current=False)

        serializer.save()


# ==============================================================================
# SUBJECT VIEWSET
# ==============================================================================

class SubjectViewSet(viewsets.ModelViewSet):
    """ViewSet for Subjects — no FK changes in this model"""

    queryset = Subject.objects.all().order_by("name")
    serializer_class = SubjectSerializer
    permission_classes = [permissions.IsAuthenticated]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ["subject_type", "is_compulsory", "is_active"]
    search_fields = ["name", "code", "description"]
    ordering_fields = ["name", "code", "created_at"]
    ordering = ["name"]


# ==============================================================================
# SUBJECT ALLOCATION VIEWSET
# ==============================================================================

class SubjectAllocationViewSet(TenantAwareMixin, viewsets.ModelViewSet):
    """
    ViewSet for Subject Allocations.
    UPDATED: education_level is now a FK — filtering and select_related updated.
    """

    queryset = (
        SubjectAllocation.objects.select_related(
            "subject", "teacher", "academic_session", "education_level"  # UPDATED
        )
        .all()
        .order_by("-created_at")
    )

    serializer_class = SubjectAllocationSerializer
    permission_classes = [permissions.IsAuthenticated]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    # UPDATED: filterset uses FK field directly (Django handles FK id lookup)
    filterset_fields = [
        "subject",
        "teacher",
        "academic_session",
        "education_level",  # UPDATED: was CharField, now FK
        "is_active",
    ]
    search_fields = [
        "subject__name",
        "teacher__user__first_name",
        "teacher__user__last_name",
        "education_level__name",  # UPDATED: traverse FK for search
        "student_class",
    ]
    ordering_fields = ["created_at", "education_level__name"]  # UPDATED
    ordering = ["-created_at"]


# ==============================================================================
# CURRICULUM VIEWSET
# ==============================================================================

class CurriculumViewSet(TenantAwareMixin, viewsets.ModelViewSet):
    """
    ViewSet for Curriculum.
    UPDATED: education_level is now a FK — filtering and select_related updated.
    """

    queryset = (
        Curriculum.objects.select_related(
            "academic_session", "education_level"  # UPDATED
        )
        .all()
        .order_by("-created_at")
    )

    serializer_class = CurriculumSerializer
    permission_classes = [permissions.IsAuthenticated]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    # UPDATED: education_level is now a FK
    filterset_fields = ["education_level", "academic_session", "is_active"]
    search_fields = ["name", "description", "education_level__name"]  # UPDATED
    ordering_fields = ["name", "created_at", "education_level__name"]  # UPDATED
    ordering = ["-created_at"]


# ==============================================================================
# ACADEMIC CALENDAR VIEWSET
# ==============================================================================

class AcademicCalendarViewSet(TenantAwareMixin, viewsets.ModelViewSet):
    """
    ViewSet for Academic Calendar Events.
    UPDATED: event_type is now a FK — filtering and select_related updated.
    """

    queryset = (
        AcademicCalendar.objects.select_related(
            "academic_session", "term", "term__term_type", "event_type"  # UPDATED
        )
        .all()
        .order_by("start_date")
    )

    serializer_class = AcademicCalendarSerializer
    permission_classes = [permissions.IsAuthenticated]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    # UPDATED: event_type is now a FK (DjangoFilterBackend handles FK id lookups)
    filterset_fields = [
        "event_type",  # UPDATED: FK
        "academic_session",
        "term",
        "is_public",
        "is_active",
    ]
    search_fields = [
        "title",
        "description",
        "location",
        "event_type__name",  # UPDATED: traverse FK for search
    ]
    ordering_fields = [
        "start_date",
        "end_date",
        "created_at",
        "event_type__name",
    ]  # UPDATED
    ordering = ["start_date"]

    @action(detail=False, methods=["get"])
    def upcoming(self, request):
        """Get upcoming events"""
        tenant = self.get_tenant()
        if not tenant:
            return Response(
                {"error": "No tenant found"}, status=status.HTTP_400_BAD_REQUEST
            )

        queryset = (
            self.get_queryset()
            .filter(start_date__gte=date.today(), is_active=True)
            .order_by("start_date")[:10]
        )

        return Response(self.get_serializer(queryset, many=True).data)

    @action(detail=False, methods=["get"])
    def by_event_type(self, request):
        """
        Filter calendar events by event type code.
        UPDATED: filters via event_type__code (FK) instead of event_type string.
        Usage: GET /academic-calendar/by_event_type/?code=holiday
        """
        code = request.query_params.get("code")
        if not code:
            return Response(
                {"error": "code query parameter is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # UPDATED: filter via FK traversal
        queryset = self.get_queryset().filter(event_type__code=code)
        return Response(self.get_serializer(queryset, many=True).data)
