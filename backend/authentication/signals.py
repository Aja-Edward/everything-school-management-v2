# authentication/signals.py
from django.conf import settings
from django.dispatch import receiver
from django.db.models.signals import post_save, pre_save
from django.utils import timezone
import logging

logger = logging.getLogger(__name__)
@receiver(pre_save, sender=settings.AUTH_USER_MODEL)
def store_previous_state(sender, instance=None, **kwargs):
    """Snapshot old is_active BEFORE the save so post_save can detect changes."""
    if instance.pk:
        try:
            old = sender.objects.get(pk=instance.pk)
            instance._old_is_active = old.is_active
        except sender.DoesNotExist:
            instance._old_is_active = None
    else:
        instance._old_is_active = None


@receiver(post_save, sender=settings.AUTH_USER_MODEL)
def handle_user_verification(sender, instance=None, created=False, **kwargs):
    """Send welcome email when a user is activated for the first time."""
    if created:
        return  # New user — not verified yet
    old_active = getattr(instance, "_old_is_active", None)
    # Fired only when is_active flipped False -> True
    if old_active is False and instance.is_active is True:
        send_welcome_email(instance)


@receiver(post_save, sender=settings.AUTH_USER_MODEL)
def cleanup_expired_verification_codes(sender, instance=None, created=False, **kwargs):
    if not created and instance:
        if (
            getattr(instance, "verification_code_expires", None)
            and instance.verification_code_expires < timezone.now()
        ):
            sender.objects.filter(pk=instance.pk).update(
                verification_code=None,
                verification_code_expires=None,
            )


def send_welcome_email(user):
    from utils.email import send_email_via_brevo

    subject = "Welcome to SchoolMS!"
    html_content = f"""
    <div style='font-family:Arial,sans-serif;max-width:600px;margin:0 auto'>
      <h2>Welcome, {user.first_name}!</h2>
      <p>Your account has been verified. You can now log in.</p>
    </div>"""
    try:
        send_email_via_brevo(subject, html_content, user.email)
        logger.info(f"Welcome email sent to {user.email}")
    except Exception as e:
        logger.error(f"Welcome email failed for {user.email}: {e}")
