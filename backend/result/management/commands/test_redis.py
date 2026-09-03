from django.core.management.base import BaseCommand


class Command(BaseCommand):
    def handle(self, *args, **kwargs):
        import redis
        import os
        url = os.environ.get("REDIS_URL")
        self.stdout.write(f"REDIS_URL: {url}")
        self.stdout.write(
            f"CELERY_WORKER_AVAILABLE: {os.environ.get('CELERY_WORKER_AVAILABLE')}")

        try:
            r = redis.from_url(url)
            r.ping()
            self.stdout.write("✅ Redis PING successful")
        except Exception as e:
            self.stdout.write(f"❌ Redis connection failed: {e}")

        # Test Celery broker
        from celery import current_app
        self.stdout.write(f"Broker URL: {current_app.conf.broker_url}")
        self.stdout.write(
            f"Always Eager: {current_app.conf.task_always_eager}")
