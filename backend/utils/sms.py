"""
SMS utility functions using Twilio

Every send is scoped to a tenant. Twilio credentials live on
CommunicationSettings, which is one row per tenant, so a send without a
tenant has no way to know whose account to bill or whose number to send
from. `tenant` is therefore keyword-only and required, and a missing or
unconfigured tenant fails closed rather than falling back to another
school's credentials.
"""
import logging

logger = logging.getLogger(__name__)


def _get_comm_settings(tenant):
    """
    Resolve this tenant's CommunicationSettings.

    Returns
    -------
    tuple: (settings_or_None, error_message_or_None)
    """
    if tenant is None:
        return None, "No tenant supplied — refusing to send SMS"

    # Imported here to avoid a circular import at module load.
    from schoolSettings.models import CommunicationSettings

    comm_settings = CommunicationSettings.objects.filter(tenant=tenant).first()
    if not comm_settings or not comm_settings.twilio_configured:
        return None, "Twilio is not configured for this school"
    return comm_settings, None


def send_sms_via_twilio(to_number, message_body, *, tenant, from_number=None):
    """
    Send SMS via Twilio using the given tenant's credentials.
    
    Args:
        to_number (str): Recipient phone number
        message_body (str): SMS message content
        tenant (Tenant): School the message is sent on behalf of. Required —
            supplies the Twilio account and sender number.
        from_number (str, optional): Override the tenant's sender number.
    
    Returns:
        tuple: (success: bool, response: str, message_sid: str or None)
    """
    try:
        from twilio.rest import Client
        from twilio.base.exceptions import TwilioRestException
    except ImportError:
        error_msg = "Twilio SDK not installed"
        logger.error(error_msg)
        return False, error_msg, None

    comm_settings, error = _get_comm_settings(tenant)
    if error:
        logger.warning("SMS to %s not sent: %s", to_number, error)
        return False, error, None

    sender_number = from_number or comm_settings.twilio_phone_number
    if not sender_number:
        return False, "No sender phone number configured", None

    try:
        client = Client(
            comm_settings.twilio_account_sid, comm_settings.twilio_auth_token)

        message = client.messages.create(
            body=message_body,
            from_=sender_number,
            to=to_number
        )

        logger.info(
            "SMS sent to %s for tenant %s. SID: %s",
            to_number, tenant, message.sid,
        )
        return True, "SMS sent successfully", message.sid

    except TwilioRestException as e:
        error_msg = f"Twilio SMS error: {e.msg}"
        logger.error(f"{error_msg} (Code: {e.code})")
        return False, error_msg, None
    except Exception as e:
        error_msg = f"Failed to send SMS: {str(e)}"
        logger.error(error_msg)
        return False, error_msg, None


def send_attendance_alert_sms(student_phone, student_name, date, status, *, tenant):
    """
    Send attendance alert SMS to parent/guardian
    
    Args:
        student_phone (str): Parent/guardian phone number
        student_name (str): Student's name
        date (str): Attendance date
        status (str): Attendance status (Present, Absent, Late, etc.)
        tenant (Tenant): School the message is sent on behalf of.
    
    Returns:
        tuple: (success: bool, response: str)
    """
    message_body = f"Attendance Alert: {student_name} was marked as {status} on {date}. - School Management System"
    return send_sms_via_twilio(student_phone, message_body, tenant=tenant)


def send_exam_result_sms(student_phone, student_name, exam_name, score, total_score, *, tenant):
    """
    Send exam result SMS
    
    Args:
        student_phone (str): Parent/guardian phone number
        student_name (str): Student's name
        exam_name (str): Exam name
        score (float): Student's score
        total_score (float): Total possible score
        tenant (Tenant): School the message is sent on behalf of.
    
    Returns:
        tuple: (success: bool, response: str)
    """
    percentage = (score / total_score) * 100 if total_score > 0 else 0
    message_body = f"Exam Result: {student_name} scored {score}/{total_score} ({percentage:.1f}%) in {exam_name}. - School Management System"
    return send_sms_via_twilio(student_phone, message_body, tenant=tenant)


def send_fee_reminder_sms(parent_phone, student_name, amount_due, due_date, *, tenant):
    """
    Send fee reminder SMS
    
    Args:
        parent_phone (str): Parent phone number
        student_name (str): Student's name
        amount_due (float): Amount due
        due_date (str): Due date
        tenant (Tenant): School the message is sent on behalf of.
    
    Returns:
        tuple: (success: bool, response: str)
    """
    message_body = f"Fee Reminder: {student_name} has a fee payment of ${amount_due:.2f} due on {due_date}. Please make payment to avoid late fees. - School Management System"
    return send_sms_via_twilio(parent_phone, message_body, tenant=tenant)


def send_emergency_alert_sms(phone_numbers, message, *, tenant):
    """
    Send emergency alert SMS to multiple recipients
    
    Args:
        phone_numbers (list): List of phone numbers
        message (str): Emergency message
        tenant (Tenant): School the message is sent on behalf of.
    
    Returns:
        dict: Results for each phone number
    """
    results = {}
    for phone in phone_numbers:
        success, response, message_sid = send_sms_via_twilio(
            phone, message, tenant=tenant)
        results[phone] = {
            'success': success,
            'response': response,
            'message_sid': message_sid
        }
    return results


def test_twilio_connection(account_sid, auth_token, phone_number):
    """
    Test Twilio connection with provided credentials
    
    Args:
        account_sid (str): Twilio Account SID
        auth_token (str): Twilio Auth Token
        phone_number (str): Twilio phone number
    
    Returns:
        tuple: (success: bool, message: str)
    """
    try:
        from twilio.rest import Client
        from twilio.base.exceptions import TwilioRestException
        
        # Create Twilio client
        client = Client(account_sid, auth_token)
        
        # Test by getting account info
        account = client.api.accounts(account_sid).fetch()
        
        if account.status == 'active':
            return True, "Twilio connection successful"
        else:
            return False, f"Twilio account status: {account.status}"
            
    except ImportError:
        return False, "Twilio SDK not installed"
    except TwilioRestException as e:
        return False, f"Twilio authentication failed: {e.msg}"
    except Exception as e:
        return False, f"Connection test failed: {str(e)}"
