# integrations/clients.py
import requests
from django.conf import settings


class ProvisioningError(Exception):
    """Raised when a Vercel or Cloudflare API call fails."""
    pass


class VercelClient:
    BASE_URL = "https://api.vercel.com"

    def __init__(self):
        self.token = settings.VERCEL_API_TOKEN
        self.project_id = settings.VERCEL_PROJECT_ID
        self.team_id = getattr(settings, "VERCEL_TEAM_ID", None)

    def _headers(self):
        return {"Authorization": f"Bearer {self.token}"}

    def _params(self):
        return {"teamId": self.team_id} if self.team_id else {}

    def add_domain(self, domain: str) -> dict:
        """Add a domain (subdomain or custom domain) to the Vercel project."""
        url = f"{self.BASE_URL}/v10/projects/{self.project_id}/domains"
        resp = requests.post(
            url,
            headers=self._headers(),
            params=self._params(),
            json={"name": domain},
            timeout=15,
        )
        if resp.status_code not in (200, 201):
            # Vercel returns 409 if domain already exists elsewhere - treat as non-fatal
            if resp.status_code == 409:
                return {"already_exists": True, "raw": resp.json()}
            raise ProvisioningError(
                f"Vercel add_domain failed: {resp.status_code} {resp.text}")
        return resp.json()

    def get_domain(self, domain: str) -> dict:
        url = f"{self.BASE_URL}/v9/projects/{self.project_id}/domains/{domain}"
        resp = requests.get(url, headers=self._headers(),
                            params=self._params(), timeout=15)
        if resp.status_code != 200:
            raise ProvisioningError(
                f"Vercel get_domain failed: {resp.status_code} {resp.text}")
        return resp.json()

    def remove_domain(self, domain: str) -> None:
        url = f"{self.BASE_URL}/v9/projects/{self.project_id}/domains/{domain}"
        resp = requests.delete(url, headers=self._headers(),
                               params=self._params(), timeout=15)
        if resp.status_code not in (200, 204, 404):
            raise ProvisioningError(
                f"Vercel remove_domain failed: {resp.status_code} {resp.text}")


class CloudflareClient:
    BASE_URL = "https://api.cloudflare.com/client/v4"

    def __init__(self):
        self.token = settings.CLOUDFLARE_API_TOKEN
        self.zone_id = settings.CLOUDFLARE_ZONE_ID

    def _headers(self):
        return {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json",
        }

    def create_cname_record(self, name: str, target: str, proxied: bool = False) -> dict:
        """
        Create a CNAME record under the zone.
        `name` should be just the subdomain label, e.g. 'greenwood' (not the full domain).
        """
        url = f"{self.BASE_URL}/zones/{self.zone_id}/dns_records"
        payload = {
            "type": "CNAME",
            "name": name,
            "content": target,
            "proxied": proxied,
            "ttl": 1,  # auto
        }
        resp = requests.post(url, headers=self._headers(),
                             json=payload, timeout=15)
        data = resp.json()
        if not data.get("success"):
            # 81057 = record already exists - treat as non-fatal
            errors = data.get("errors", [])
            if any(e.get("code") == 81057 for e in errors):
                return {"already_exists": True, "raw": data}
            raise ProvisioningError(
                f"Cloudflare create_cname_record failed: {data}")
        return data["result"]

    def delete_dns_record(self, record_id: str) -> None:
        url = f"{self.BASE_URL}/zones/{self.zone_id}/dns_records/{record_id}"
        resp = requests.delete(url, headers=self._headers(), timeout=15)
        data = resp.json()
        if not data.get("success"):
            raise ProvisioningError(
                f"Cloudflare delete_dns_record failed: {data}")

    def create_custom_hostname(self, hostname: str) -> dict:
        """
        Register a school's custom domain as a Cloudflare Custom Hostname
        (Cloudflare for SaaS). Mirrors the setup already working for
        kebiinternationalacademy.com.
        """
        url = f"{self.BASE_URL}/zones/{self.zone_id}/custom_hostnames"
        payload = {
            "hostname": hostname,
            "ssl": {
                "method": "http",
                "type": "dv",
            },
        }
        resp = requests.post(url, headers=self._headers(),
                             json=payload, timeout=15)
        data = resp.json()
        if not data.get("success"):
            raise ProvisioningError(
                f"Cloudflare create_custom_hostname failed: {data}")
        return data["result"]

    def get_custom_hostname_status(self, hostname_id: str) -> dict:
        url = f"{self.BASE_URL}/zones/{self.zone_id}/custom_hostnames/{hostname_id}"
        resp = requests.get(url, headers=self._headers(), timeout=15)
        data = resp.json()
        if not data.get("success"):
            raise ProvisioningError(
                f"Cloudflare get_custom_hostname_status failed: {data}")
        return data["result"]

    def delete_custom_hostname(self, hostname_id: str) -> None:
        url = f"{self.BASE_URL}/zones/{self.zone_id}/custom_hostnames/{hostname_id}"
        resp = requests.delete(url, headers=self._headers(), timeout=15)
        data = resp.json()
        if not data.get("success"):
            raise ProvisioningError(
                f"Cloudflare delete_custom_hostname failed: {data}")
