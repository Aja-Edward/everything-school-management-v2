from django.utils import timezone
from rest_framework import mixins, serializers, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import Notification

# The bell shows the latest few; older ones are not worth paging through.
LIST_LIMIT = 30


class NotificationSerializer(serializers.ModelSerializer):
    is_read = serializers.SerializerMethodField()

    class Meta:
        model = Notification
        fields = ["id", "kind", "title", "body", "link", "is_read", "read_at", "created_at"]

    def get_is_read(self, obj):
        return obj.read_at is not None


class NotificationViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    """
    The signed-in user's own notifications in this school, newest first.
    Nobody reads or marks anyone else's.
    """

    serializer_class = NotificationSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = None

    def get_queryset(self):
        tenant = getattr(self.request, "tenant", None)
        if tenant is None:
            return Notification.objects.none()
        return Notification.objects.filter(tenant=tenant, recipient=self.request.user)

    def list(self, request, *args, **kwargs):
        rows = self.get_queryset()[:LIST_LIMIT]
        return Response({
            "unread": self.get_queryset().filter(read_at__isnull=True).count(),
            "results": self.get_serializer(rows, many=True).data,
        })

    @action(detail=False, methods=["get"], url_path="unread-count")
    def unread_count(self, request):
        return Response({"unread": self.get_queryset().filter(read_at__isnull=True).count()})

    @action(detail=True, methods=["post"])
    def read(self, request, pk=None):
        updated = self.get_queryset().filter(pk=pk, read_at__isnull=True).update(read_at=timezone.now())
        if not updated and not self.get_queryset().filter(pk=pk).exists():
            return Response({"detail": "Not found."}, status=404)
        return Response({"unread": self.get_queryset().filter(read_at__isnull=True).count()})

    @action(detail=False, methods=["post"], url_path="read-all")
    def read_all(self, request):
        self.get_queryset().filter(read_at__isnull=True).update(read_at=timezone.now())
        return Response({"unread": 0})
