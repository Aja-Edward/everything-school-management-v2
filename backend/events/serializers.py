from rest_framework import serializers
from .models import Event, EventImage


class EventImageSerializer(serializers.ModelSerializer):
    image_url = serializers.SerializerMethodField()
    
    class Meta:
        model = EventImage
        fields = [
            'id', 'image', 'image_url', 'title', 'description', 
            'alt_text', 'order'
        ]
        read_only_fields = ['id', 'order']
    
    def get_image_url(self, obj):
        if obj.image:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.image.url)
            return obj.image.url
        return None


class EventSerializer(serializers.ModelSerializer):
    images = EventImageSerializer(many=True, read_only=True)
    image_count = serializers.SerializerMethodField()
    is_current = serializers.ReadOnlyField()
    
    class Meta:
        model = Event
        fields = [
            'id', 'title', 'subtitle', 'description', 'badge_text',
            'cta_text', 'secondary_cta_text', 'event_type', 'background_theme',
            'display_type', 'start_date', 'end_date', 'is_active', 'is_published',
            'ribbon_text', 'ribbon_speed', 'carousel_interval', 'carousel_speed',
            'show_indicators', 'show_controls', 'auto_play', 'images', 'image_count',
            'is_current', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at', 'is_current']
    
    def get_image_count(self, obj):
        return obj.images.count()
    
    def create(self, validated_data):
        # Set the created_by field to the current user
        validated_data['created_by'] = self.context['request'].user
        return super().create(validated_data)


class EventCreateSerializer(serializers.ModelSerializer):
    images = serializers.ListField(
        child=serializers.FileField(),
        required=False,
        write_only=True
    )
    
    class Meta:
        model = Event
        fields = [
            'title', 'subtitle', 'description', 'badge_text',
            'cta_text', 'secondary_cta_text', 'event_type', 'background_theme',
            'display_type', 'start_date', 'end_date', 'ribbon_text', 'ribbon_speed',
            'carousel_interval', 'carousel_speed', 'show_indicators', 'show_controls',
            'auto_play', 'images'
        ]
    
    def create(self, validated_data):
        images_data = validated_data.pop('images', [])
        # created_by and tenant are injected via perform_create in the ViewSet
        request = self.context.get('request')
        if request and request.user and request.user.is_authenticated:
            validated_data.setdefault('created_by', request.user)
        tenant = getattr(request, 'tenant', None) if request else None
        if tenant:
            validated_data.setdefault('tenant', tenant)
        event = super().create(validated_data)

        for i, image_file in enumerate(images_data):
            EventImage.objects.create(event=event, image=image_file, order=i)

        return event


class EventUpdateSerializer(serializers.ModelSerializer):
    images = serializers.ListField(
        child=serializers.FileField(),
        required=False,
        write_only=True
    )
    
    class Meta:
        model = Event
        fields = [
            'title', 'subtitle', 'description', 'badge_text',
            'cta_text', 'secondary_cta_text', 'event_type', 'background_theme',
            'display_type', 'start_date', 'end_date', 'ribbon_text', 'ribbon_speed',
            'carousel_interval', 'carousel_speed', 'show_indicators', 'show_controls',
            'auto_play', 'images'
        ]
    
    def update(self, instance, validated_data):
        images_data = validated_data.pop('images', None)
        
        # Update the event
        event = super().update(instance, validated_data)
        
        # Handle image updates if provided
        if images_data is not None:
            # Delete existing images
            event.images.all().delete()
            
            # Create new images
            for i, image_file in enumerate(images_data):
                EventImage.objects.create(
                    event=event,
                    image=image_file,
                    order=i
                )
        
        return event


class EventImageUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = EventImage
        fields = ['title', 'description', 'alt_text', 'order']


class EventActivationSerializer(serializers.Serializer):
    event_id = serializers.IntegerField()
    
    def validate_event_id(self, value):
        try:
            Event.objects.get(id=value)
        except Event.DoesNotExist:
            raise serializers.ValidationError("Event not found")
        return value


class ActiveEventSerializer(serializers.ModelSerializer):
    images = EventImageSerializer(many=True, read_only=True)
    
    class Meta:
        model = Event
        fields = [
            'id', 'title', 'subtitle', 'description', 'badge_text',
            'cta_text', 'secondary_cta_text', 'event_type', 'background_theme',
            'display_type', 'ribbon_text', 'ribbon_speed', 'carousel_interval',
            'carousel_speed', 'show_indicators', 'show_controls', 'auto_play',
            'images', 'is_current'
        ] 