from rest_framework import viewsets, status, permissions, serializers
from rest_framework.decorators import action
from rest_framework.response import Response
from django.shortcuts import get_object_or_404
from django.db import transaction
from .models import Event, EventImage
from .serializers import (
    EventSerializer, EventCreateSerializer, EventUpdateSerializer,
    EventImageUpdateSerializer, EventActivationSerializer, ActiveEventSerializer
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
        """Filter events by user if not superuser"""
        if self.request.user.is_superuser:
            return Event.objects.all()
        elif self.request.user.is_authenticated:
            return Event.objects.filter(created_by=self.request.user)
        else:
            # For anonymous users, return empty queryset
            return Event.objects.none()
    
    @action(detail=False, methods=['get'], permission_classes=[permissions.AllowAny])
    def active(self, request):
        """
        Get the currently active event for public display.
        This endpoint is accessible without authentication.
        """
        try:
            active_event = Event.objects.get(is_active=True, is_published=True)
            serializer = ActiveEventSerializer(active_event, context={'request': request})
            return Response(serializer.data)
        except Event.DoesNotExist:
            return Response(
                {'message': 'No active event found'},
                status=status.HTTP_404_NOT_FOUND
            )
    
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
        events = Event.objects.filter(is_published=True)
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

    def get_queryset(self):
        """Filter images by event and user permissions"""
        event_id = self.request.query_params.get('event_id')
        if event_id:
            return EventImage.objects.filter(event_id=event_id)
        return EventImage.objects.none()

    def perform_create(self, serializer):
        """Set the event when creating an image"""
        event_id = self.request.data.get('event_id')
        if event_id:
            event = get_object_or_404(Event, id=event_id)
            serializer.save(event=event)
        else:
            raise serializers.ValidationError("event_id is required")
