from django.db import models
from django.conf import settings
from django.utils import timezone

from tenants.models import TenantMixin


class Event(TenantMixin, models.Model):
    DISPLAY_TYPE_CHOICES = [
        ('banner', 'Banner'),
        ('carousel', 'Carousel'),
        ('ribbon', 'Announcement Ribbon'),
    ]
    
    EVENT_TYPE_CHOICES = [
        ('announcement', 'Announcement'),
        ('enrollment', 'Enrollment'),
        ('event', 'Event'),
        ('achievement', 'Achievement'),
    ]
    
    THEME_CHOICES = [
        ('default', 'Default'),
        ('graduation', 'Graduation'),
        ('enrollment', 'Enrollment'),
        ('achievement', 'Achievement'),
        ('innovation', 'Innovation'),
    ]
    
    # Basic event information
    title = models.CharField(max_length=200)
    subtitle = models.CharField(max_length=200, blank=True)
    description = models.TextField()
    badge_text = models.CharField(max_length=100, default='Special Announcement')
    
    # CTA buttons
    cta_text = models.CharField(max_length=100, default='Begin Your Journey')
    secondary_cta_text = models.CharField(max_length=100, default='Watch Experience')
    
    # Event type and theme
    event_type = models.CharField(max_length=20, choices=EVENT_TYPE_CHOICES, default='announcement')
    background_theme = models.CharField(max_length=20, choices=THEME_CHOICES, default='default')
    display_type = models.CharField(max_length=20, choices=DISPLAY_TYPE_CHOICES, default='banner')
    
    # Dates
    start_date = models.DateTimeField(null=True, blank=True)
    end_date = models.DateTimeField(null=True, blank=True)
    
    # Status
    is_active = models.BooleanField(default=False)
    is_published = models.BooleanField(default=False)
    
    # Ribbon settings (for ribbon display type)
    ribbon_text = models.TextField(blank=True, help_text='Text to display in the announcement ribbon')
    ribbon_speed = models.CharField(max_length=20, choices=[
        ('slow', 'Slow'),
        ('medium', 'Medium'),
        ('fast', 'Fast'),
    ], default='medium')
    
    # Carousel settings (for carousel display type)
    carousel_interval = models.IntegerField(default=5000, help_text='Auto-play interval in milliseconds')
    carousel_speed = models.CharField(max_length=20, choices=[
        ('slow', 'Slow'),
        ('medium', 'Medium'),
        ('fast', 'Fast'),
    ], default='medium')
    show_indicators = models.BooleanField(default=True)
    show_controls = models.BooleanField(default=True)
    auto_play = models.BooleanField(default=True)
    
    # Metadata
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='created_events')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['-created_at']
        verbose_name = 'Event'
        verbose_name_plural = 'Events'
    
    def __str__(self):
        return f"{self.title} ({self.get_event_type_display()})"
    
    @property
    def is_current(self):
        """Check if the event is currently active based on dates"""
        now = timezone.now()
        if self.start_date and self.end_date:
            return self.start_date <= now <= self.end_date
        elif self.start_date:
            return self.start_date <= now
        elif self.end_date:
            return now <= self.end_date
        return True
    
    def activate(self):
        """Activate this event and deactivate all others"""
        Event.objects.update(is_active=False)
        self.is_active = True
        self.save()
    
    def deactivate(self):
        """Deactivate this event"""
        self.is_active = False
        self.save()


class EventImage(TenantMixin, models.Model):
    event = models.ForeignKey(Event, on_delete=models.CASCADE, related_name='images')
    image = models.ImageField(upload_to='event_images/')
    title = models.CharField(max_length=200, blank=True)
    description = models.TextField(blank=True)
    alt_text = models.CharField(max_length=200, blank=True)
    order = models.PositiveIntegerField(default=0)
    
    class Meta:
        ordering = ['order', 'id']
        verbose_name = 'Event Image'
        verbose_name_plural = 'Event Images'
    
    def __str__(self):
        return f"{self.event.title} - Image {self.order + 1}"
    
    def save(self, *args, **kwargs):
        # Auto-generate order if not set
        if not self.order:
            max_order = EventImage.objects.filter(event=self.event).aggregate(
                models.Max('order')
            )['order__max'] or 0
            self.order = max_order + 1
        super().save(*args, **kwargs)
