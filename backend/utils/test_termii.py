"""
Sending a text through Termii: the number as Termii wants it, the request it
is sent, and what comes back when Termii refuses.
"""
from unittest.mock import Mock, patch

import requests
from django.test import SimpleTestCase, override_settings

from utils import termii

CONFIGURED = dict(
    TERMII_API_KEY="termii-key", TERMII_BASE_URL="https://termii.example/",
    TERMII_SENDER_ID="Alpha", TERMII_CHANNEL="generic")


def termii_response(status_code, body):
    response = Mock(status_code=status_code, text=str(body))
    response.json.return_value = body
    return response


class NormalizeNumberTest(SimpleTestCase):
    def test_a_nigerian_local_number_becomes_international(self):
        self.assertEqual(termii.normalize_number("0803 123 4567"), "2348031234567")

    def test_an_international_number_loses_its_plus_and_separators(self):
        self.assertEqual(termii.normalize_number("+234-803-123-4567"), "2348031234567")


@override_settings(**CONFIGURED)
class SendSmsTest(SimpleTestCase):
    def test_a_text_is_sent_from_the_sender_id_on_the_configured_channel(self):
        with patch("utils.termii.requests.post", return_value=termii_response(
                200, {"code": "ok", "message_id": "3017544054459083819856413",
                      "message": "Successfully Sent", "balance": 1047.57})) as post:
            ok, detail, message_id = termii.send_sms("08031234567", "Ada arrived at 07:45.")

        self.assertTrue(ok)
        self.assertEqual(message_id, "3017544054459083819856413")
        url, = post.call_args.args
        self.assertEqual(url, "https://termii.example/api/sms/send")
        self.assertEqual(post.call_args.kwargs["json"], {
            "api_key": "termii-key", "to": "2348031234567", "from": "Alpha",
            "sms": "Ada arrived at 07:45.", "type": "plain", "channel": "generic",
        })

    @override_settings(TERMII_CHANNEL="dnd")
    def test_the_dnd_route_is_a_setting(self):
        with patch("utils.termii.requests.post", return_value=termii_response(
                200, {"code": "ok", "message_id": "1"})) as post:
            termii.send_sms("2348031234567", "Hello")

        self.assertEqual(post.call_args.kwargs["json"]["channel"], "dnd")

    def test_a_refusal_comes_back_with_termiis_reason(self):
        with patch("utils.termii.requests.post", return_value=termii_response(
                400, {"message": "Insufficient balance"})):
            ok, detail, message_id = termii.send_sms("08031234567", "Hello")

        self.assertFalse(ok)
        self.assertIn("Insufficient balance", detail)
        self.assertIsNone(message_id)

    def test_an_unreachable_termii_is_reported_not_raised(self):
        with patch("utils.termii.requests.post",
                   side_effect=requests.exceptions.ConnectionError("timed out")):
            ok, detail, _ = termii.send_sms("08031234567", "Hello")

        self.assertFalse(ok)
        self.assertIn("could not be reached", detail)

    def test_something_that_is_not_a_phone_number_is_not_sent(self):
        with patch("utils.termii.requests.post") as post:
            ok, _, _ = termii.send_sms("n/a", "Hello")

        self.assertFalse(ok)
        post.assert_not_called()


@override_settings(TERMII_API_KEY="", TERMII_SENDER_ID="")
class UnconfiguredTest(SimpleTestCase):
    def test_nothing_is_sent_without_a_key_and_a_sender_id(self):
        with patch("utils.termii.requests.post") as post:
            ok, detail, _ = termii.send_sms("08031234567", "Hello")

        self.assertFalse(ok)
        self.assertIn("not set up", detail)
        post.assert_not_called()
