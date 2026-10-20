from rest_framework import viewsets, status, permissions, serializers
from rest_framework.decorators import action
from rest_framework.response import Response
from django.shortcuts import get_object_or_404
from django.db import transaction
from .models import Event, EventImage
from .serializers import (
    EventSerializer, EventCreateSerializer, EventUpdateSerializer,
    EventImageSerializer, EventImageUpdateSerializer, EventActivationSerializer, ActiveEventSerializer
)


class EventViewSet(viewsets.ModelViewSet):
    """
    ViewSet for managing events with full CRUD operations.
    """
    queryset = Event.objects.all()
    
    def get_permissions(self):
        """Set permissions based on action"""
        # Temporarily allow unauthenticated access for list and active actions
        if self.action in ["list", "active"]:
            return []  # Allow unauthenticated access for these actions
        return [permissions.IsAuthenticated()]
    
    def get_serializer_class(self):
        if self.action == 'create':
            return EventCreateSerializer
        elif self.action in ['update', 'partial_update']:
            return EventUpdateSerializer
        return EventSerializer
    
    def get_queryset(self):
        return self._filter_by_params(self._visible_events())

    def _visible_events(self):
        tenant = getattr(self.request, 'tenant', None)

        if self.request.user.is_superuser:
            return Event.objects.all().order_by('-created_at')

        if self.request.user.is_authenticated:
            if tenant:
                return Event.objects.filter(tenant=tenant).order_by('-created_at')
            return Event.objects.filter(created_by=self.request.user).order_by('-created_at')

        # Anonymous visitors on a tenant subdomain — return active published events only
        if tenant:
            return Event.objects.filter(
                tenant=tenant,
                is_active=True,
                is_published=True,
            ).order_by('-created_at')

        return Event.objects.none()

    def _filter_by_params(self, queryset):
        """
        The school's site asks for ?is_active=true&is_published=true. The
        filters were ignored, so a signed-in visitor saw inactive events too.
        """
        if self.action != 'list':
            return queryset
        params = self.request.query_params
        for flag in ('is_active', 'is_published'):
            value = params.get(flag)
            if value is not None:
                queryset = queryset.filter(**{flag: value.lower() == 'true'})
        if params.get('display_type'):
            queryset = queryset.filter(display_type=params['display_type'])
        return queryset

    def perform_create(self, serializer):
        """Inject created_by and tenant so neither can ever be null."""
        tenant = getattr(self.request, 'tenant', None)
        serializer.save(created_by=self.request.user, tenant=tenant)
    
    @action(detail=False, methods=['get'], permission_classes=[permissions.AllowAny])
    def active(self, request):
        """
        Get the currently active event for public display.
        This endpoint is accessible without authentication.
        """
        # This looked across every school, so it showed another school's event
        # or failed outright once two schools had one active.
        tenant = getattr(request, 'tenant', None)
        active_event = (
            Event.objects.filter(tenant=tenant, is_active=True, is_published=True).first()
            if tenant else None
        )
        if active_event is None:
            return Response(
                {'message': 'No active event found'},
                status=status.HTTP_404_NOT_FOUND
            )
        serializer = ActiveEventSerializer(active_event, context={'request': request})
        return Response(serializer.data)
    
    @action(detail=True, methods=['post'])
    def activate(self, request, pk=None):
        """
        Activate an event (deactivates all others).
        """
        event = self.get_object()
        event.activate()
        serializer = self.get_serializer(event)
        return Response(serializer.data)
    
    @action(detail=True, methods=['post'])
    def deactivate(self, request, pk=None):
        """
        Deactivate an event.
        """
        event = self.get_object()
        event.deactivate()
        serializer = self.get_serializer(event)
        return Response(serializer.data)
    
    @action(detail=True, methods=['post'])
    def publish(self, request, pk=None):
        """
        Publish an event.
        """
        event = self.get_object()
        event.is_published = True
        event.save()
        serializer = self.get_serializer(event)
        return Response(serializer.data)
    
    @action(detail=True, methods=['post'])
    def unpublish(self, request, pk=None):
        """
        Unpublish an event.
        """
        event = self.get_object()
        event.is_published = False
        event.save()
        serializer = self.get_serializer(event)
        return Response(serializer.data)
    
    @action(detail=False, methods=['get'])
    def my_events(self, request):
        """
        Get events created by the current user.
        """
        if request.user.is_authenticated:
            events = Event.objects.filter(created_by=request.user)
            serializer = self.get_serializer(events, many=True)
            return Response(serializer.data)
        else:
            return Response(
                {'error': 'Authentication required'},
                status=status.HTTP_401_UNAUTHORIZED
            )
    
    @action(detail=False, methods=['get'])
    def published(self, request):
        """
        Get all published events.
        """
        # Every school's published events used to come back here.
        events = self.get_queryset().filter(is_published=True)
        serializer = self.get_serializer(events, many=True)
        return Response(serializer.data)
    
    @action(detail=True, methods=['put'])
    def update_images(self, request, pk=None):
        """
        Update image details for an event.
        """
        event = self.get_object()
        images_data = request.data.get('images', [])
        
        with transaction.atomic():
            for image_data in images_data:
                image_id = image_data.get('id')
                if image_id:
                    try:
                        image = EventImage.objects.get(id=image_id, event=event)
                        serializer = EventImageUpdateSerializer(image, data=image_data, partial=True)
                        if serializer.is_valid():
                            serializer.save()
                    except EventImage.DoesNotExist:
                        continue
        
        event_serializer = self.get_serializer(event)
        return Response(event_serializer.data)
    
    @action(detail=True, methods=['delete'])
    def delete_image(self, request, pk=None):
        """
        Delete a specific image from an event.
        """
        event = self.get_object()
        image_id = request.data.get('image_id')
        
        if not image_id:
            return Response(
                {'error': 'image_id is required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            image = EventImage.objects.get(id=image_id, event=event)
            image.delete()
            return Response({'message': 'Image deleted successfully'})
        except EventImage.DoesNotExist:
            return Response(
                {'error': 'Image not found'},
                status=status.HTTP_404_NOT_FOUND
            )
    
    @action(detail=True, methods=['post'])
    def reorder_images(self, request, pk=None):
        """
        Reorder images for an event.
        """
        event = self.get_object()
        image_order = request.data.get('image_order', [])
        
        if not image_order:
            return Response(
                {'error': 'image_order is required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        with transaction.atomic():
            for index, image_id in enumerate(image_order):
                try:
                    image = EventImage.objects.get(id=image_id, event=event)
                    image.order = index
                    image.save()
                except EventImage.DoesNotExist:
                    continue
        
        event_serializer = self.get_serializer(event)
        return Response(event_serializer.data)


class EventImageViewSet(viewsets.ModelViewSet):
    """
    ViewSet for managing event images.
    """
    queryset = EventImage.objects.all()
    serializer_class = EventImageUpdateSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_serializer_class(self):
        # The update serializer has no image field, so an upload saved no file.
        if self.action == 'create':
            return EventImageSerializer
        return EventImageUpdateSerializer

    def _school_events(self):
        tenant = getattr(self.request, 'tenant', None)
        if self.request.user.is_superuser:
            return Event.objects.all()
        return Event.objects.filter(tenant=tenant) if tenant else Event.objects.none()

    def get_queryset(self):
        """Filter images by event and user permissions"""
        event_id = self.request.query_params.get('event_id')
        if event_id:
            return EventImage.objects.filter(event_id=event_id, event__in=self._school_events())
        return EventImage.objects.none()

    def perform_create(self, serializer):
        """Set the event when creating an image"""
        # The settings screen sends the event as "event"; only "event_id" was
        # read, so an image added while editing an event was refused.
        event_id = self.request.data.get('event_id') or self.request.data.get('event')
        if event_id:
            event = get_object_or_404(self._school_events(), id=event_id)
            serializer.save(event=event, tenant=event.tenant)
        else:
            raise serializers.ValidationError("event_id is required")
