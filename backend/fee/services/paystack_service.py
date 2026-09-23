# fees/services/paystack_service.py
import requests
import json
import logging
from django.conf import settings
from django.utils import timezone
from decimal import Decimal
import uuid

logger = logging.getLogger(__name__)


class PaystackNotConfigured(Exception):
    """This school has not set up Paystack; the message says what is missing."""


class PaystackService:
    """
    Paystack, for one account.

    School fees are collected into the school's own Paystack account, so the
    keys come from that school's PaymentGatewayConfig - `for_school()`. The
    platform's own keys, used for what schools pay Nuventa, are the default
    and belong to nobody else.
    """

    def __init__(self, secret_key=None, public_key=None):
        self.secret_key = (
            secret_key if secret_key is not None
            else getattr(settings, "PAYSTACK_SECRET_KEY", "")) or ""
        self.public_key = (
            public_key if public_key is not None
            else getattr(settings, "PAYSTACK_PUBLIC_KEY", "")) or ""
        self.base_url = "https://api.paystack.co"
        self.headers = {
            "Authorization": f"Bearer {self.secret_key}",
            "Content-Type": "application/json",
        }

    @classmethod
    def for_school(cls, tenant):
        """The school's own Paystack account. Never the platform's."""
        from ..models import PaymentGatewayConfig

        if tenant is None:
            raise PaystackNotConfigured("Name the school.")
        config = PaymentGatewayConfig.objects.filter(
            tenant=tenant, gateway="PAYSTACK", is_active=True).first()
        if config is None:
            raise PaystackNotConfigured(
                "This school has not set up Paystack. Add its keys under "
                "Settings → Finance.")
        return cls.from_config(config)

    @classmethod
    def from_config(cls, config):
        secret = (config.secret_key or "").strip()
        public = (config.public_key or "").strip()
        if not secret or not public:
            raise PaystackNotConfigured(
                "This school's Paystack keys are incomplete: both the public "
                "and the secret key are needed.")
        return cls(secret_key=secret, public_key=public)

    def verify_keys(self):
        """
        Whether Paystack accepts this secret key, and whose account it is.
        Returns (ok, message). Reads only; nothing is charged.
        """
        try:
            response = requests.get(
                f"{self.base_url}/balance", headers=self.headers, timeout=20)
        except requests.exceptions.RequestException as error:
            return False, f"Paystack could not be reached: {error}"

        if response.status_code == 200:
            live = self.secret_key.startswith("sk_live")
            return True, ("Paystack accepted the key ("
                          f"{'live' if live else 'test'} mode).")
        if response.status_code in (401, 403):
            return False, "Paystack refused that secret key."
        try:
            detail = (response.json() or {}).get("message", "")
        except ValueError:
            detail = response.text[:200]
        return False, f"Paystack returned {response.status_code}: {detail}"

    def initialize_payment(
        self, email, amount, reference=None, callback_url=None, metadata=None
    ):
        """
        Initialize payment with Paystack

        Args:
            email (str): Customer email
            amount (Decimal): Amount in Naira (will be converted to kobo)
            reference (str): Unique payment reference
            callback_url (str): URL to redirect after payment
            metadata (dict): Additional payment metadata

        Returns:
            dict: Paystack response
        """
        if not reference:
            reference = str(uuid.uuid4())

        # Convert amount to kobo (Paystack uses kobo)
        amount_in_kobo = int(amount * 100)

        url = f"{self.base_url}/transaction/initialize"

        data = {
            "email": email,
            "amount": amount_in_kobo,
            "reference": reference,
            "currency": "NGN",
        }

        if callback_url:
            data["callback_url"] = callback_url

        if metadata:
            data["metadata"] = metadata

        try:
            response = requests.post(url, headers=self.headers, json=data)
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            logger.error(f"Paystack initialization error: {str(e)}")
            return {"status": False, "message": str(e)}

    def verify_payment(self, reference):
        """
        Verify payment with Paystack

        Args:
            reference (str): Payment reference to verify

        Returns:
            dict: Paystack verification response
        """
        url = f"{self.base_url}/transaction/verify/{reference}"

        try:
            response = requests.get(url, headers=self.headers)
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            logger.error(f"Paystack verification error: {str(e)}")
            return {"status": False, "message": str(e)}

    def list_transactions(
        self,
        per_page=50,
        page=1,
        customer=None,
        status=None,
        from_date=None,
        to_date=None,
    ):
        """
        List transactions from Paystack

        Args:
            per_page (int): Number of transactions per page
            page (int): Page number
            customer (str): Customer ID or email to filter by
            status (str): Transaction status to filter by
            from_date (str): Start date for filtering (YYYY-MM-DD)
            to_date (str): End date for filtering (YYYY-MM-DD)

        Returns:
            dict: Paystack response with transaction list
        """
        url = f"{self.base_url}/transaction"

        params = {
            "perPage": per_page,
            "page": page,
        }

        if customer:
            params["customer"] = customer
        if status:
            params["status"] = status
        if from_date:
            params["from"] = from_date
        if to_date:
            params["to"] = to_date

        try:
            response = requests.get(url, headers=self.headers, params=params)
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            logger.error(f"Paystack list transactions error: {str(e)}")
            return {"status": False, "message": str(e)}

    def create_customer(self, email, first_name, last_name, phone=None):
        """
        Create customer on Paystack

        Args:
            email (str): Customer email
            first_name (str): Customer first name
            last_name (str): Customer last name
            phone (str): Customer phone number

        Returns:
            dict: Paystack response
        """
        url = f"{self.base_url}/customer"

        data = {
            "email": email,
            "first_name": first_name,
            "last_name": last_name,
        }

        if phone:
            data["phone"] = phone

        try:
            response = requests.post(url, headers=self.headers, json=data)
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            logger.error(f"Paystack create customer error: {str(e)}")
            return {"status": False, "message": str(e)}

    def get_customer(self, email_or_code):
        """
        Get customer details from Paystack

        Args:
            email_or_code (str): Customer email or customer code

        Returns:
            dict: Paystack response with customer details
        """
        url = f"{self.base_url}/customer/{email_or_code}"

        try:
            response = requests.get(url, headers=self.headers)
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            logger.error(f"Paystack get customer error: {str(e)}")
            return {"status": False, "message": str(e)}

    def refund_transaction(
        self,
        transaction_id,
        amount=None,
        currency="NGN",
        customer_note=None,
        merchant_note=None,
    ):
        """
        Refund a transaction

        Args:
            transaction_id (str): Transaction ID to refund
            amount (Decimal): Amount to refund (optional, full refund if not provided)
            currency (str): Currency code
            customer_note (str): Note for customer
            merchant_note (str): Internal note

        Returns:
            dict: Paystack response
        """
        url = f"{self.base_url}/refund"

        data = {
            "transaction": transaction_id,
            "currency": currency,
        }

        if amount:
            # Convert amount to kobo
            data["amount"] = int(amount * 100)

        if customer_note:
            data["customer_note"] = customer_note

        if merchant_note:
            data["merchant_note"] = merchant_note

        try:
            response = requests.post(url, headers=self.headers, json=data)
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            logger.error(f"Paystack refund error: {str(e)}")
            return {"status": False, "message": str(e)}

    def get_transaction(self, transaction_id):
        """
        Get transaction details

        Args:
            transaction_id (str): Transaction ID

        Returns:
            dict: Paystack response with transaction details
        """
        url = f"{self.base_url}/transaction/{transaction_id}"

        try:
            response = requests.get(url, headers=self.headers)
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            logger.error(f"Paystack get transaction error: {str(e)}")
            return {"status": False, "message": str(e)}

    def create_plan(
        self, name, amount, interval="monthly", description=None, currency="NGN"
    ):
        """
        Create a subscription plan

        Args:
            name (str): Plan name
            amount (Decimal): Plan amount in Naira
            interval (str): Billing interval (hourly, daily, weekly, monthly, quarterly, biannually, annually)
            description (str): Plan description
            currency (str): Currency code

        Returns:
            dict: Paystack response
        """
        url = f"{self.base_url}/plan"

        data = {
            "name": name,
            "amount": int(amount * 100),  # Convert to kobo
            "interval": interval,
            "currency": currency,
        }

        if description:
            data["description"] = description

        try:
            response = requests.post(url, headers=self.headers, json=data)
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            logger.error(f"Paystack create plan error: {str(e)}")
            return {"status": False, "message": str(e)}

    def create_subscription(
        self, customer_code, plan_code, authorization_code=None, start_date=None
    ):
        """
        Create a subscription

        Args:
            customer_code (str): Customer code
            plan_code (str): Plan code
            authorization_code (str): Authorization code for the subscription
            start_date (str): Start date (YYYY-MM-DD)

        Returns:
            dict: Paystack response
        """
        url = f"{self.base_url}/subscription"

        data = {
            "customer": customer_code,
            "plan": plan_code,
        }

        if authorization_code:
            data["authorization"] = authorization_code

        if start_date:
            data["start_date"] = start_date

        try:
            response = requests.post(url, headers=self.headers, json=data)
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            logger.error(f"Paystack create subscription error: {str(e)}")
            return {"status": False, "message": str(e)}

    def get_banks(self, country="nigeria"):
        """
        Get list of banks

        Args:
            country (str): Country name

        Returns:
            dict: Paystack response with bank list
        """
        url = f"{self.base_url}/bank"
        params = {"country": country}

        try:
            response = requests.get(url, headers=self.headers, params=params)
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            logger.error(f"Paystack get banks error: {str(e)}")
            return {"status": False, "message": str(e)}

    def resolve_account_number(self, account_number, bank_code):
        """
        Resolve account number to get account name

        Args:
            account_number (str): Account number
            bank_code (str): Bank code

        Returns:
            dict: Paystack response with account details
        """
        url = f"{self.base_url}/bank/resolve"
        params = {
            "account_number": account_number,
            "bank_code": bank_code,
        }

        try:
            response = requests.get(url, headers=self.headers, params=params)
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            logger.error(f"Paystack resolve account error: {str(e)}")
            return {"status": False, "message": str(e)}

    def create_transfer_recipient(
        self, account_number, bank_code, name, description=None, currency="NGN"
    ):
        """
        Create transfer recipient

        Args:
            account_number (str): Recipient account number
            bank_code (str): Recipient bank code
            name (str): Recipient name
            description (str): Description
            currency (str): Currency code

        Returns:
            dict: Paystack response
        """
        url = f"{self.base_url}/transferrecipient"

        data = {
            "type": "nuban",
            "name": name,
            "account_number": account_number,
            "bank_code": bank_code,
            "currency": currency,
        }

        if description:
            data["description"] = description

        try:
            response = requests.post(url, headers=self.headers, json=data)
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            logger.error(f"Paystack create transfer recipient error: {str(e)}")
            return {"status": False, "message": str(e)}

    def initiate_transfer(
        self, recipient_code, amount, reason=None, currency="NGN", reference=None
    ):
        """
        Initiate transfer

        Args:
            recipient_code (str): Transfer recipient code
            amount (Decimal): Amount to transfer in Naira
            reason (str): Reason for transfer
            currency (str): Currency code
            reference (str): Transfer reference

        Returns:
            dict: Paystack response
        """
        url = f"{self.base_url}/transfer"

        if not reference:
            reference = str(uuid.uuid4())

        data = {
            "source": "balance",
            "reason": reason or "Transfer",
            "amount": int(amount * 100),  # Convert to kobo
            "recipient": recipient_code,
            "currency": currency,
            "reference": reference,
        }

        try:
            response = requests.post(url, headers=self.headers, json=data)
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            logger.error(f"Paystack initiate transfer error: {str(e)}")
            return {"status": False, "message": str(e)}

    def verify_transfer(self, reference):
        """
        Verify transfer

        Args:
            reference (str): Transfer reference

        Returns:
            dict: Paystack response
        """
        url = f"{self.base_url}/transfer/verify/{reference}"

        try:
            response = requests.get(url, headers=self.headers)
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            logger.error(f"Paystack verify transfer error: {str(e)}")
            return {"status": False, "message": str(e)}

    def get_balance(self):
        """
        Get account balance

        Returns:
            dict: Paystack response with balance information
        """
        url = f"{self.base_url}/balance"

        try:
            response = requests.get(url, headers=self.headers)
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            logger.error(f"Paystack get balance error: {str(e)}")
            return {"status": False, "message": str(e)}

    def create_subaccount(
        self,
        business_name,
        settlement_bank,
        account_number,
        percentage_charge,
        description=None,
        primary_contact_email=None,
        primary_contact_name=None,
        primary_contact_phone=None,
        settlement_schedule="auto",
    ):
        """
        Create subaccount

        Args:
            business_name (str): Business name
            settlement_bank (str): Settlement bank code
            account_number (str): Settlement account number
            percentage_charge (float): Percentage charge for subaccount
            description (str): Subaccount description
            primary_contact_email (str): Primary contact email
            primary_contact_name (str): Primary contact name
            primary_contact_phone (str): Primary contact phone
            settlement_schedule (str): Settlement schedule

        Returns:
            dict: Paystack response
        """
        url = f"{self.base_url}/subaccount"

        data = {
            "business_name": business_name,
            "settlement_bank": settlement_bank,
            "account_number": account_number,
            "percentage_charge": percentage_charge,
            "settlement_schedule": settlement_schedule,
        }

        if description:
            data["description"] = description
        if primary_contact_email:
            data["primary_contact_email"] = primary_contact_email
        if primary_contact_name:
            data["primary_contact_name"] = primary_contact_name
        if primary_contact_phone:
            data["primary_contact_phone"] = primary_contact_phone

        try:
            response = requests.post(url, headers=self.headers, json=data)
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            logger.error(f"Paystack create subaccount error: {str(e)}")
            return {"status": False, "message": str(e)}

    def webhook_signature_valid(self, payload, signature):
        """
        Validate webhook signature

        Args:
            payload (str): Raw webhook payload
            signature (str): Webhook signature from headers

        Returns:
            bool: True if signature is valid
        """
        import hmac
        import hashlib

        computed_signature = hmac.new(
            self.secret_key.encode("utf-8"), payload.encode("utf-8"), hashlib.sha512
        ).hexdigest()

        return hmac.compare_digest(computed_signature, signature)

    def kobo_to_naira(self, amount_in_kobo):
        """
        Convert kobo to naira

        Args:
            amount_in_kobo (int): Amount in kobo

        Returns:
            Decimal: Amount in naira
        """
        return Decimal(amount_in_kobo) / 100

    def naira_to_kobo(self, amount_in_naira):
        """
        Convert naira to kobo

        Args:
            amount_in_naira (Decimal): Amount in naira

        Returns:
            int: Amount in kobo
        """
        return int(amount_in_naira * 100)

    def format_amount(self, amount_in_kobo):
        """
        Format amount for display

        Args:
            amount_in_kobo (int): Amount in kobo

        Returns:
            str: Formatted amount string
        """
        amount_in_naira = self.kobo_to_naira(amount_in_kobo)
        return f"₦{amount_in_naira:,.2f}"
