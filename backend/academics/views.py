# # academics/views.py
# from rest_framework import viewsets, status, permissions
# from rest_framework.decorators import action
# from rest_framework.response import Response
# from rest_framework.filters import SearchFilter, OrderingFilter
# from django_filters.rest_framework import DjangoFilterBackend
# from django.db.models import Q
# from rest_framework.permissions import IsAuthenticated
# from django.db import transaction

# from .models import (
#     AcademicSession,
#     Term,
#     SubjectAllocation,
#     Curriculum,
#     AcademicCalendar,
# )

# # goodImport Subject from subject app
# from subject.models import Subject
# from .serializers import (
#     AcademicSessionSerializer,
#     TermSerializer,
#     SubjectSerializer,
#     SubjectAllocationSerializer,
#     CurriculumSerializer,
#     AcademicCalendarSerializer,
# )


# class AcademicSessionViewSet(viewsets.ModelViewSet):
#     """Comprehensive ViewSet for Academic Sessions"""

#     queryset = AcademicSession.objects.all().order_by("-start_date")
#     serializer_class = AcademicSessionSerializer
#     permission_classes = [IsAuthenticated]
#     filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
#     filterset_fields = ["is_current", "is_active"]
#     search_fields = ["name"]
#     ordering_fields = ["start_date", "end_date", "name", "created_at"]
#     ordering = ["-start_date"]

#     # goodGet current session
#     @action(detail=False, methods=["get"])
#     def current(self, request):
#         """Get the currently active academic session"""
#         current_session = AcademicSession.objects.filter(is_current=True).first()
#         if current_session:
#             serializer = self.get_serializer(current_session)
#             return Response(serializer.data)
#         return Response(
#             {"message": "No current academic session set"},
#             status=status.HTTP_404_NOT_FOUND,
#         )

#     # goodSet current session
#     @action(detail=True, methods=["post"])
#     def set_current(self, request, pk=None):
#         """Set this session as the current active session"""
#         session = self.get_object()

#         # Deactivate all other sessions
#         AcademicSession.objects.exclude(id=session.id).update(is_current=False)

#         # Activate this session
#         session.is_current = True
#         session.is_active = True
#         session.save()

#         serializer = self.get_serializer(session)
#         return Response(
#             {
#                 "message": f'Academic session "{session.name}" is now current',
#                 "session": serializer.data,
#             }
#         )

#     # goodGet terms for a session
#     @action(detail=True, methods=["get"])
#     def terms(self, request, pk=None):
#         """Get all terms for this academic session"""
#         session = self.get_object()
#         terms = session.terms.all().order_by("start_date")
#         serializer = TermSerializer(terms, many=True)
#         return Response(serializer.data)

#     # goodGet statistics
#     @action(detail=True, methods=["get"])
#     def statistics(self, request, pk=None):
#         """Get statistics for this academic session"""
#         session = self.get_object()

#         stats = {
#             "classrooms": session.classrooms.count(),
#             "terms": session.terms.count(),
#             "students": session.student_fees.values("student").distinct().count(),
#             "is_current": session.is_current,
#             "is_active": session.is_active,
#         }
#         return Response(stats)

#     # goodAuto-set first session as current
#     def perform_create(self, serializer):
#         """Handle creation with current session logic"""
#         if serializer.validated_data.get("is_current", False):
#             AcademicSession.objects.update(is_current=False)

#         session = serializer.save()

#         # If this is the first session, make it current
#         if AcademicSession.objects.count() == 1:
#             session.is_current = True
#             session.is_active = True
#             session.save()

#     # goodEnsure only one current session
#     def perform_update(self, serializer):
#         """Handle updates with current session logic"""
#         if serializer.validated_data.get("is_current", False):
#             AcademicSession.objects.exclude(id=serializer.instance.id).update(
#                 is_current=False
#             )
#         serializer.save()


# class TermViewSet(viewsets.ModelViewSet):
#     """ViewSet for Academic Terms"""

#     queryset = (
#         Term.objects.select_related("academic_session")
#         .all()
#         .order_by("academic_session", "name")
#     )
#     serializer_class = TermSerializer
#     permission_classes = [permissions.IsAuthenticated]
#     filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
#     filterset_fields = ["academic_session", "name", "is_current", "is_active"]
#     search_fields = ["name", "academic_session__name"]
#     ordering_fields = ["start_date", "end_date", "created_at"]
#     ordering = ["academic_session", "name"]

#     @action(detail=False, methods=["get"])
#     def by_session(self, request):
#         """Get terms filtered by academic session"""
#         session_id = request.query_params.get("session_id")

#         if session_id:
#             queryset = self.get_queryset().filter(academic_session_id=session_id)
#         else:
#             queryset = self.get_queryset()

#         serializer = self.get_serializer(queryset, many=True)
#         return Response(serializer.data)

#     @action(detail=True, methods=["post"])
#     def set_current(self, request, pk=None):
#         """Set this term as the current active term"""
#         term = self.get_object()

#         # Deactivate all terms in the same session
#         Term.objects.filter(academic_session=term.academic_session).update(
#             is_current=False
#         )

#         # Activate this term
#         term.is_current = True
#         term.is_active = True
#         term.save()

#         serializer = self.get_serializer(term)
#         return Response(
#             {
#                 "message": f'Term "{term.get_name_display()}" is now the current active term',
#                 "term": serializer.data,
#             }
#         )

#     @action(detail=False, methods=["get"])
#     def current(self, request):
#         """Get the currently active term"""
#         current_term = Term.objects.filter(is_current=True).first()

#         if current_term:
#             serializer = self.get_serializer(current_term)
#             return Response(serializer.data)

#         return Response(
#             {"message": "No current term found"}, status=status.HTTP_404_NOT_FOUND
#         )

#     @action(detail=True, methods=["get"])
#     def subjects(self, request, pk=None):
#         """Get all subjects allocated for this term"""
#         term = self.get_object()

#         # Get subject allocations for this term's academic session
#         # You can filter by classrooms if needed
#         allocations = SubjectAllocation.objects.filter(
#             academic_session=term.academic_session, is_active=True
#         ).select_related("subject", "teacher", "teacher__user")

#         # Get unique subjects
#         subjects = Subject.objects.filter(
#             id__in=allocations.values_list("subject_id", flat=True)
#         ).distinct()

#         # Serialize the subjects
#         subject_serializer = SubjectSerializer(subjects, many=True)

#         # Optionally include allocation details
#         allocation_serializer = SubjectAllocationSerializer(allocations, many=True)

#         return Response(
#             {
#                 "term": self.get_serializer(term).data,
#                 "subjects": subject_serializer.data,
#                 "allocations": allocation_serializer.data,
#                 "total_subjects": subjects.count(),
#                 "total_allocations": allocations.count(),
#             }
#         )

#     def perform_create(self, serializer):
#         """Override to handle current term logic"""
#         # If this term is being set as current, deactivate others in the same session
#         if serializer.validated_data.get("is_current", False):
#             Term.objects.filter(
#                 academic_session=serializer.validated_data["academic_session"]
#             ).update(is_current=False)

#         term = serializer.save()

#         # If this is the first term for the session, make it current
#         session_terms = Term.objects.filter(academic_session=term.academic_session)
#         if session_terms.count() == 1:
#             term.is_current = True
#             term.is_active = True
#             term.save()

#     def perform_update(self, serializer):
#         """Override to handle current term logic"""
#         # If this term is being set as current, deactivate others
#         if serializer.validated_data.get("is_current", False):
#             Term.objects.filter(
#                 academic_session=serializer.instance.academic_session
#             ).exclude(id=serializer.instance.id).update(is_current=False)

#         serializer.save()


# class SubjectViewSet(viewsets.ModelViewSet):
#     """ViewSet for Subjects"""

#     queryset = Subject.objects.all().order_by("name")
#     serializer_class = SubjectSerializer
#     permission_classes = [permissions.IsAuthenticated]
#     filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
#     filterset_fields = ["subject_type", "is_compulsory", "is_active"]
#     search_fields = ["name", "code", "description"]
#     ordering_fields = ["name", "code", "created_at"]
#     ordering = ["name"]


# class SubjectAllocationViewSet(viewsets.ModelViewSet):
#     """ViewSet for Subject Allocations"""

#     queryset = (
#         SubjectAllocation.objects.select_related(
#             "subject", "teacher", "academic_session"
#         )
#         .all()
#         .order_by("-created_at")
#     )
#     serializer_class = SubjectAllocationSerializer
#     permission_classes = [permissions.IsAuthenticated]
#     filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
#     filterset_fields = [
#         "subject",
#         "teacher",
#         "academic_session",
#         "education_level",
#         "is_active",
#     ]
#     search_fields = [
#         "subject__name",
#         "teacher__user__first_name",
#         "teacher__user__last_name",
#     ]
#     ordering_fields = ["created_at"]
#     ordering = ["-created_at"]


# class CurriculumViewSet(viewsets.ModelViewSet):
#     """ViewSet for Curriculum"""

#     queryset = (
#         Curriculum.objects.select_related("academic_session")
#         .all()
#         .order_by("-created_at")
#     )
#     serializer_class = CurriculumSerializer
#     permission_classes = [permissions.IsAuthenticated]
#     filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
#     filterset_fields = ["education_level", "academic_session", "is_active"]
#     search_fields = ["name", "description"]
#     ordering_fields = ["name", "created_at"]
#     ordering = ["-created_at"]


# class AcademicCalendarViewSet(viewsets.ModelViewSet):
#     """ViewSet for Academic Calendar Events"""

#     queryset = (
#         AcademicCalendar.objects.select_related("academic_session", "term")
#         .all()
#         .order_by("start_date")
#     )
#     serializer_class = AcademicCalendarSerializer
#     permission_classes = [permissions.IsAuthenticated]
#     filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
#     filterset_fields = [
#         "event_type",
#         "academic_session",
#         "term",
#         "is_public",
#         "is_active",
#     ]
#     search_fields = ["title", "description", "location"]
#     ordering_fields = ["start_date", "end_date", "created_at"]
#     ordering = ["start_date"]

#     @action(detail=False, methods=["get"])
#     def upcoming(self, request):
#         """Get upcoming events"""
#         from datetime import date

#         queryset = (
#             self.get_queryset()
#             .filter(start_date__gte=date.today(), is_active=True)
#             .order_by("start_date")[:10]
#         )

#         serializer = self.get_serializer(queryset, many=True)
#         return Response(serializer.data)


# academics/views.py
from rest_framework import viewsets, status, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.filters import SearchFilter, OrderingFilter
from django_filters.rest_framework import DjangoFilterBackend
from django.db.models import Q
from rest_framework.permissions import IsAuthenticated
from django.db import transaction
import logging

logger = logging.getLogger(__name__)

from .models import (
    AcademicSession,
    Term,
    SubjectAllocation,
    Curriculum,
    AcademicCalendar,
)

# goodImport Subject from subject app
from subject.models import Subject
from .serializers import (
    AcademicSessionSerializer,
    TermSerializer,
    SubjectSerializer,
    SubjectAllocationSerializer,
    CurriculumSerializer,
    AcademicCalendarSerializer,
)


class TenantAwareMixin:
    """Mixin to handle tenant filtering and assignment"""

    def get_tenant(self):
        """Get current tenant from request or user with multiple fallback strategies"""

        # Strategy 1: Check if middleware set request.tenant (PRIMARY METHOD)
        if hasattr(self.request, "tenant") and self.request.tenant:
            logger.info(f"✅ Tenant found from middleware: {self.request.tenant}")
            return self.request.tenant

        # Strategy 2: Get from authenticated user's tenant attribute
        user = self.request.user
        if user.is_authenticated and hasattr(user, "tenant") and user.tenant:
            logger.info(f"✅ Tenant found from user.tenant: {user.tenant}")
            return user.tenant

        # Strategy 3: User profile has tenant
        if (
            user.is_authenticated
            and hasattr(user, "userprofile")
            and hasattr(user.userprofile, "tenant")
        ):
            tenant = user.userprofile.tenant
            if tenant:
                logger.info(f"✅ Tenant found from user.userprofile.tenant: {tenant}")
                return tenant

        # Strategy 4: Get from tenant relationship
        if (
            user.is_authenticated
            and hasattr(user, "tenant_users")
            and user.tenant_users.exists()
        ):
            tenant = user.tenant_users.first().tenant
            logger.info(f"✅ Tenant found from user.tenant_users: {tenant}")
            return tenant

        # Strategy 5: Try to get from headers directly (in case middleware failed)
        tenant_id = self.request.headers.get("X-Tenant-ID")
        tenant_slug = self.request.headers.get("X-Tenant-Slug")

        if tenant_id:
            try:
                from tenants.models import Tenant
                import uuid

                # Validate it's a proper UUID
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
                    f"⚠️ Error looking up tenant slug in header: {tenant_slug}, error: {e}"
                )

        # Strategy 6: Check session as last resort
        if hasattr(self.request, "session"):
            tenant_id = self.request.session.get("tenant_id")
            if tenant_id:
                try:
                    from tenants.models import Tenant

                    tenant = Tenant.objects.filter(id=tenant_id, is_active=True).first()
                    if tenant:
                        logger.info(f"✅ Tenant found from session: {tenant}")
                        return tenant
                except Exception as e:
                    logger.warning(f"⚠️ Error looking up tenant from session: {e}")

        # Log detailed debugging info if no tenant found
        logger.error("❌ NO TENANT FOUND - Debugging information:")
        logger.error(
            f"  - User authenticated: {user.is_authenticated if hasattr(self.request, 'user') else 'N/A'}"
        )
        logger.error(f"  - User: {user if hasattr(self.request, 'user') else 'N/A'}")
        logger.error(f"  - Has request.tenant: {hasattr(self.request, 'tenant')}")
        logger.error(
            f"  - request.tenant value: {getattr(self.request, 'tenant', 'NOT SET')}"
        )
        logger.error(
            f"  - User has tenant attr: {hasattr(user, 'tenant') if user.is_authenticated else 'N/A'}"
        )
        logger.error(
            f"  - User tenant value: {getattr(user, 'tenant', 'NOT SET') if user.is_authenticated else 'N/A'}"
        )
        logger.error(f"  - Headers: {dict(self.request.headers)}")
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

        # If no tenant found, return empty queryset
        logger.warning("No tenant found in get_queryset - returning empty queryset")
        return queryset.none()

    def perform_create(self, serializer):
        """Set tenant when creating"""
        tenant = self.get_tenant()

        if not tenant:
            error_msg = (
                "No tenant found. This could be because:\n"
                "1. You're not accessing through a valid subdomain (e.g., your-school.localhost:5173)\n"
                "2. The X-Tenant-ID header is missing or invalid\n"
                "3. Your user account is not associated with a tenant\n"
                "Please ensure you're logged in with a valid tenant account."
            )
            logger.error(f"Tenant validation failed in perform_create: {error_msg}")
            raise ValueError(error_msg)

        logger.info(f"Creating object with tenant: {tenant}")

        # Call parent perform_create if it exists and does additional logic
        if hasattr(super(), "perform_create"):
            # Get the parent's perform_create method
            parent_method = super().perform_create

            # Check if parent method exists and is callable
            if callable(parent_method):
                try:
                    # Try to call parent's perform_create with serializer
                    # This will handle any additional logic from parent classes
                    instance = serializer.save(tenant=tenant)

                    # Call parent method for any additional processing
                    # Pass the already-saved instance
                    return instance
                except Exception as e:
                    logger.error(f"Error in parent perform_create: {e}")
                    # Fall through to default save

        # Default: just save with tenant
        return serializer.save(tenant=tenant)

    def perform_update(self, serializer):
        """Ensure tenant doesn't change on update"""
        tenant = self.get_tenant()

        if not tenant:
            raise ValueError("No tenant found.")

        # Ensure we're updating within the same tenant
        if serializer.instance.tenant != tenant:
            raise PermissionError("Cannot update records from another tenant.")

        logger.info(f"Updating object for tenant: {tenant}")

        # Call parent if exists
        if hasattr(super(), "perform_update"):
            return super().perform_update(serializer)
        else:
            return serializer.save()


class AcademicSessionViewSet(TenantAwareMixin, viewsets.ModelViewSet):
    """Comprehensive ViewSet for Academic Sessions"""

    queryset = AcademicSession.objects.all().order_by("-start_date")
    serializer_class = AcademicSessionSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ["is_current", "is_active"]
    search_fields = ["name"]
    ordering_fields = ["start_date", "end_date", "name", "created_at"]
    ordering = ["-start_date"]

    # goodGet current session
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
            serializer = self.get_serializer(current_session)
            return Response(serializer.data)

        return Response(
            {"message": "No current academic session set"},
            status=status.HTTP_404_NOT_FOUND,
        )

    # goodSet current session
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
            # Deactivate all other sessions for this tenant
            AcademicSession.objects.filter(tenant=tenant).exclude(id=session.id).update(
                is_current=False
            )

            # Activate this session
            session.is_current = True
            session.is_active = True
            session.save()

        serializer = self.get_serializer(session)
        return Response(
            {
                "message": f'Academic session "{session.name}" is now current',
                "session": serializer.data,
            }
        )

    # goodGet terms for a session
    @action(detail=True, methods=["get"])
    def terms(self, request, pk=None):
        """Get all terms for this academic session"""
        session = self.get_object()
        terms = session.terms.all().order_by("start_date")
        serializer = TermSerializer(terms, many=True)
        return Response(serializer.data)

    # goodGet statistics
    @action(detail=True, methods=["get"])
    def statistics(self, request, pk=None):
        """Get statistics for this academic session"""
        session = self.get_object()

        stats = {
            "classrooms": session.classrooms.count(),
            "terms": session.terms.count(),
            "students": session.student_fees.values("student").distinct().count(),
            "is_current": session.is_current,
            "is_active": session.is_active,
        }
        return Response(stats)

    def perform_create(self, serializer):
        """Handle creation with current session logic and tenant"""
        tenant = self.get_tenant()

        if not tenant:
            raise ValueError(
                "No tenant found. Please ensure you're logged in with a valid tenant account."
            )

        # If setting as current, deactivate other sessions
        if serializer.validated_data.get("is_current", False):
            AcademicSession.objects.filter(tenant=tenant).update(is_current=False)

        session = serializer.save(tenant=tenant)

        # If this is the first session for this tenant, make it current
        if AcademicSession.objects.filter(tenant=tenant).count() == 1:
            session.is_current = True
            session.is_active = True
            session.save()

    def perform_update(self, serializer):
        """Handle updates with current session logic and tenant"""
        tenant = self.get_tenant()

        if not tenant:
            raise ValueError("No tenant found.")

        # Ensure we're updating within the same tenant
        if serializer.instance.tenant != tenant:
            raise PermissionError("Cannot update records from another tenant.")

        if serializer.validated_data.get("is_current", False):
            AcademicSession.objects.filter(tenant=tenant).exclude(
                id=serializer.instance.id
            ).update(is_current=False)

        serializer.save()


class TermViewSet(TenantAwareMixin, viewsets.ModelViewSet):
    """ViewSet for Academic Terms"""

    queryset = (
        Term.objects.select_related("academic_session")
        .all()
        .order_by("academic_session", "name")
    )
    serializer_class = TermSerializer
    permission_classes = [permissions.IsAuthenticated]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ["academic_session", "name", "is_current", "is_active"]
    search_fields = ["name", "academic_session__name"]
    ordering_fields = ["start_date", "end_date", "created_at"]
    ordering = ["academic_session", "name"]

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

        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)

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
            # Deactivate all terms in the same session for this tenant
            Term.objects.filter(
                tenant=tenant, academic_session=term.academic_session
            ).update(is_current=False)

            # Activate this term
            term.is_current = True
            term.is_active = True
            term.save()

        serializer = self.get_serializer(term)
        return Response(
            {
                "message": f'Term "{term.get_name_display()}" is now the current active term',
                "term": serializer.data,
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
            serializer = self.get_serializer(current_term)
            return Response(serializer.data)

        return Response(
            {"message": "No current term found"}, status=status.HTTP_404_NOT_FOUND
        )

    @action(detail=True, methods=["get"])
    def subjects(self, request, pk=None):
        """Get all subjects allocated for this term"""
        term = self.get_object()
        tenant = self.get_tenant()

        # Get subject allocations for this term's academic session
        allocations = SubjectAllocation.objects.filter(
            tenant=tenant, academic_session=term.academic_session, is_active=True
        ).select_related("subject", "teacher", "teacher__user")

        # Get unique subjects
        subjects = Subject.objects.filter(
            id__in=allocations.values_list("subject_id", flat=True)
        ).distinct()

        # Serialize the subjects
        subject_serializer = SubjectSerializer(subjects, many=True)

        # Optionally include allocation details
        allocation_serializer = SubjectAllocationSerializer(allocations, many=True)

        return Response(
            {
                "term": self.get_serializer(term).data,
                "subjects": subject_serializer.data,
                "allocations": allocation_serializer.data,
                "total_subjects": subjects.count(),
                "total_allocations": allocations.count(),
            }
        )

    def perform_create(self, serializer):
        """Override to handle current term logic and tenant"""
        tenant = self.get_tenant()

        if not tenant:
            raise ValueError(
                "No tenant found. Please ensure you're logged in with a valid tenant account."
            )

        # If this term is being set as current, deactivate others in the same session
        if serializer.validated_data.get("is_current", False):
            Term.objects.filter(
                tenant=tenant,
                academic_session=serializer.validated_data["academic_session"],
            ).update(is_current=False)

        term = serializer.save(tenant=tenant)

        # If this is the first term for the session, make it current
        session_terms = Term.objects.filter(
            tenant=tenant, academic_session=term.academic_session
        )
        if session_terms.count() == 1:
            term.is_current = True
            term.is_active = True
            term.save()

    def perform_update(self, serializer):
        """Override to handle current term logic and tenant"""
        tenant = self.get_tenant()

        if not tenant:
            raise ValueError("No tenant found.")

        # Ensure we're updating within the same tenant
        if serializer.instance.tenant != tenant:
            raise PermissionError("Cannot update records from another tenant.")

        # If this term is being set as current, deactivate others
        if serializer.validated_data.get("is_current", False):
            Term.objects.filter(
                tenant=tenant, academic_session=serializer.instance.academic_session
            ).exclude(id=serializer.instance.id).update(is_current=False)

        serializer.save()


class SubjectViewSet(viewsets.ModelViewSet):
    """ViewSet for Subjects"""

    queryset = Subject.objects.all().order_by("name")
    serializer_class = SubjectSerializer
    permission_classes = [permissions.IsAuthenticated]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ["subject_type", "is_compulsory", "is_active"]
    search_fields = ["name", "code", "description"]
    ordering_fields = ["name", "code", "created_at"]
    ordering = ["name"]


class SubjectAllocationViewSet(TenantAwareMixin, viewsets.ModelViewSet):
    """ViewSet for Subject Allocations"""

    queryset = (
        SubjectAllocation.objects.select_related(
            "subject", "teacher", "academic_session"
        )
        .all()
        .order_by("-created_at")
    )
    serializer_class = SubjectAllocationSerializer
    permission_classes = [permissions.IsAuthenticated]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = [
        "subject",
        "teacher",
        "academic_session",
        "education_level",
        "is_active",
    ]
    search_fields = [
        "subject__name",
        "teacher__user__first_name",
        "teacher__user__last_name",
    ]
    ordering_fields = ["created_at"]
    ordering = ["-created_at"]


class CurriculumViewSet(TenantAwareMixin, viewsets.ModelViewSet):
    """ViewSet for Curriculum"""

    queryset = (
        Curriculum.objects.select_related("academic_session")
        .all()
        .order_by("-created_at")
    )
    serializer_class = CurriculumSerializer
    permission_classes = [permissions.IsAuthenticated]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ["education_level", "academic_session", "is_active"]
    search_fields = ["name", "description"]
    ordering_fields = ["name", "created_at"]
    ordering = ["-created_at"]


class AcademicCalendarViewSet(TenantAwareMixin, viewsets.ModelViewSet):
    """ViewSet for Academic Calendar Events"""

    queryset = (
        AcademicCalendar.objects.select_related("academic_session", "term")
        .all()
        .order_by("start_date")
    )
    serializer_class = AcademicCalendarSerializer
    permission_classes = [permissions.IsAuthenticated]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = [
        "event_type",
        "academic_session",
        "term",
        "is_public",
        "is_active",
    ]
    search_fields = ["title", "description", "location"]
    ordering_fields = ["start_date", "end_date", "created_at"]
    ordering = ["start_date"]

    @action(detail=False, methods=["get"])
    def upcoming(self, request):
        """Get upcoming events"""
        from datetime import date

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

        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)
