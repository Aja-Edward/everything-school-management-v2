"""
The PDFs of a school's Nuventa Cloud invoice, and of the receipts for what it
has paid towards one.

A school admin downloads the invoice to pass to whoever approves the payment -
often a proprietor who is rarely on site - so it carries everything they need
to decide without signing in: who is billed, what for, what is still owed, how
to pay, and a space to sign it off. A platform admin issues the receipt once a
payment is confirmed.
"""

import io
import logging
from pathlib import Path
from xml.sax.saxutils import escape

from django.utils import timezone

from .models import PlatformContent

logger = logging.getLogger(__name__)

# The account schools pay into by transfer. The Pay Now screen shows the same
# account (frontend/src/components/billing/BankTransferInfo.tsx): change both.
PLATFORM_BANK_ACCOUNT = {
    "bank": "Fidelity Bank PLC",
    "name": "Nuventa Limited",
    "number": "4011611294",
}


# The standard PDF fonts have no Naira sign, so amounts are written "NGN".
def _money(value):
    return f"NGN {value:,.2f}"


def _date(value):
    return value.strftime("%d %B %Y") if value else "Not set"


def period_label(invoice):
    if invoice.term:
        return f"{invoice.term.get_name_display()}, {invoice.academic_session.name}"
    return f"{invoice.academic_session.name} session"


def invoice_filename(invoice):
    return f"{invoice.invoice_number}.pdf"


LOGO_PATH = Path(__file__).resolve().parent / "assets" / "nuventa-logo.png"


def _logo(size):
    """The Nuventa Cloud logo, size across, for the top of every invoice and receipt."""
    from reportlab.platypus import Image

    if not LOGO_PATH.exists():
        logger.error("Nuventa Cloud logo missing at %s; PDF made without it", LOGO_PATH)
        return None
    return Image(str(LOGO_PATH), width=size, height=size)


class _Page:
    """The paper, colours and type the invoice and the receipt share."""

    def __init__(self, title):
        from reportlab.lib import colors
        from reportlab.lib.enums import TA_RIGHT
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
        from reportlab.lib.units import mm
        from reportlab.platypus import SimpleDocTemplate

        self.buf = io.BytesIO()
        self.doc = SimpleDocTemplate(
            self.buf, pagesize=A4,
            leftMargin=18*mm, rightMargin=18*mm, topMargin=18*mm, bottomMargin=18*mm,
            title=title, author="Nuventa Cloud",
        )
        self.width = self.doc.width

        self.NAVY = colors.HexColor("#1F4E79")
        self.GREY = colors.HexColor("#64748B")
        self.LINE = colors.HexColor("#CBD5E1")
        self.STRIPE = colors.HexColor("#F8FAFC")

        styles = getSampleStyleSheet()
        self.body = ParagraphStyle("B", parent=styles["Normal"], fontSize=9, leading=13)
        self.small = ParagraphStyle("Sm", parent=self.body, fontSize=8, leading=11,
                                    textColor=self.GREY)
        self.label = ParagraphStyle("L", parent=self.small, fontName="Helvetica-Bold")
        self.brand = ParagraphStyle("Br", parent=self.body, fontName="Helvetica-Bold",
                                    fontSize=18, leading=22, textColor=self.NAVY)
        self.title = ParagraphStyle("T", parent=self.body, fontName="Helvetica-Bold",
                                    fontSize=18, leading=22, alignment=TA_RIGHT)
        self.right = ParagraphStyle("R", parent=self.body, alignment=TA_RIGHT)
        self.h2 = ParagraphStyle("H2", parent=self.body, fontName="Helvetica-Bold",
                                 fontSize=11, textColor=self.NAVY, spaceBefore=6, spaceAfter=4)

    def header(self, kind, number, status_line):
        """Nuventa Cloud on the left; what this is, its number and status on the right."""
        from reportlab.lib.units import mm
        from reportlab.platypus import HRFlowable, Paragraph, Spacer, Table, TableStyle

        platform = PlatformContent.load()
        details = [Paragraph("Nuventa Cloud", self.brand)]
        for line in (platform.contact_address, platform.contact_email, platform.contact_phone):
            if line:
                details.append(Paragraph(escape(line).replace("\n", "<br/>"), self.small))
        issuer = details
        logo = _logo(22*mm)
        if logo is not None:
            issuer = Table([[logo, details]], colWidths=[26*mm, self.width * 0.6 - 26*mm])
            issuer.setStyle(TableStyle([
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
            ]))
        heading = [
            Paragraph(kind, self.title),
            Paragraph(escape(number), self.right),
            Paragraph(escape(status_line), self.right),
        ]
        header = Table([[issuer, heading]], colWidths=[self.width * 0.6, self.width * 0.4])
        header.setStyle(TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LEFTPADDING", (0, 0), (-1, -1), 0),
            ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ]))
        return [header, Spacer(1, 4*mm),
                HRFlowable(width="100%", thickness=1.5, color=self.NAVY), Spacer(1, 4*mm)]

    def school(self, caption, tenant, name=None):
        """The school's name and contact details, under a caption."""
        from reportlab.platypus import Paragraph

        lines = [Paragraph(caption, self.label),
                 Paragraph(f"<b>{escape(name or tenant.name)}</b>", self.body)]
        if name and name != tenant.name:
            lines.append(Paragraph(escape(tenant.name), self.body))
        school_settings = getattr(tenant, "settings", None)
        if school_settings:
            place = ", ".join(p for p in (school_settings.address, school_settings.city,
                                          school_settings.state) if p)
            for line in (place, school_settings.email, school_settings.phone):
                if line:
                    lines.append(Paragraph(escape(line), self.small))
        return lines

    def build(self, elements):
        self.doc.build(elements)
        return self.buf.getvalue()


def render_invoice_pdf(invoice):
    """The invoice as PDF bytes."""
    from reportlab.lib import colors
    from reportlab.lib.units import mm
    from reportlab.platypus import Paragraph, Spacer, Table, TableStyle

    page = _Page(f"Invoice {invoice.invoice_number}")
    width = page.width
    NAVY, GREY, LINE, STRIPE = page.NAVY, page.GREY, page.LINE, page.STRIPE
    body, small, label, h2 = page.body, page.small, page.label, page.h2

    elements = page.header(
        "INVOICE", invoice.invoice_number, f"Status: {invoice.get_status_display()}")

    # -- Billed to, and the dates ------------------------------------------------
    billed_to = page.school("BILLED TO", invoice.tenant)

    facts = [
        ["Billed for", period_label(invoice)],
        ["Billing", "Whole session (3 terms)" if invoice.billing_period == "session" else "One term"],
        ["Issued", _date(invoice.issue_date)],
        ["Due", _date(invoice.due_date)],
        ["Students billed", str(invoice.student_count)],
    ]
    if invoice.paid_at:
        facts.append(["Paid on", _date(invoice.paid_at)])
    facts_tbl = Table(
        [[Paragraph(k, label), Paragraph(escape(v), body)] for k, v in facts],
        colWidths=[28*mm, width * 0.45 - 28*mm])
    facts_tbl.setStyle(TableStyle([
        ("TOPPADDING", (0, 0), (-1, -1), 1),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 1),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
    ]))
    parties = Table([[billed_to, facts_tbl]], colWidths=[width * 0.55, width * 0.45])
    parties.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
    ]))
    elements += [parties, Spacer(1, 6*mm)]

    # -- Line items --------------------------------------------------------------
    rows = [["Description", "Quantity", "Unit price", "Amount"]]
    for item in invoice.line_items.all():
        # SMS is billed per text sent; every other line per student.
        per_sms = item.service == "sms_notifications"
        kind = ("Every service except add-ons" if item.item_type == "base"
                else "Add-on, per SMS sent" if per_sms else "Add-on")
        rows.append([
            [Paragraph(escape(item.description), body), Paragraph(kind, small)],
            f"{item.quantity} {'SMS' if per_sms else 'students'}",
            _money(item.unit_price),
            _money(item.amount),
        ])
    items = Table(rows, colWidths=[width * 0.43, width * 0.17, width * 0.2, width * 0.2],
                  repeatRows=1)
    items.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), NAVY),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("ALIGN", (1, 0), (-1, -1), "RIGHT"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, STRIPE]),
        ("LINEBELOW", (0, 0), (-1, -1), 0.3, LINE),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    elements += [items, Spacer(1, 4*mm)]

    # -- Totals ------------------------------------------------------------------
    totals = [["Basic package", _money(invoice.base_amount)]]
    if invoice.services_amount > 0:
        totals.append(["Add-ons", _money(invoice.services_amount)])
    if invoice.discount_amount > 0:
        reason = f" ({invoice.discount_reason})" if invoice.discount_reason else ""
        totals.append([f"Discount{reason}", f"-{_money(invoice.discount_amount)}"])
    totals.append(["Total", _money(invoice.total_amount)])
    total_row = len(totals) - 1
    if invoice.amount_paid > 0:
        totals.append(["Amount paid", _money(invoice.amount_paid)])
    totals.append(["Balance due", _money(invoice.balance_due)])
    totals_tbl = Table(totals, colWidths=[width * 0.3, width * 0.2], hAlign="RIGHT")
    totals_tbl.setStyle(TableStyle([
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("ALIGN", (1, 0), (1, -1), "RIGHT"),
        ("LINEABOVE", (0, total_row), (-1, total_row), 0.8, NAVY),
        ("FONTNAME", (0, total_row), (-1, total_row), "Helvetica-Bold"),
        ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
        ("FONTSIZE", (0, -1), (-1, -1), 11),
        ("TEXTCOLOR", (0, -1), (-1, -1), NAVY),
        ("LINEABOVE", (0, -1), (-1, -1), 0.8, NAVY),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]))
    elements += [totals_tbl, Spacer(1, 6*mm)]

    # -- Payments already made ---------------------------------------------------
    # Abandoned card attempts would only muddle what has actually been paid.
    payments = [p for p in invoice.payments.all() if p.status in ("confirmed", "pending")]
    if payments:
        elements.append(Paragraph("Payments", h2))
        pay_rows = [["Date", "Method", "Reference", "Status", "Amount"]]
        for p in payments:
            pay_rows.append([
                _date(p.created_at), p.get_payment_method_display(),
                Paragraph(escape(p.reference or "-"), small),
                p.get_status_display(), _money(p.amount),
            ])
        pay_tbl = Table(pay_rows, colWidths=[width * 0.2, width * 0.18, width * 0.3,
                                             width * 0.14, width * 0.18])
        pay_tbl.setStyle(TableStyle([
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 8),
            ("ALIGN", (-1, 0), (-1, -1), "RIGHT"),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("LINEBELOW", (0, 0), (-1, -1), 0.3, LINE),
        ]))
        elements += [pay_tbl, Spacer(1, 6*mm)]

    if invoice.notes:
        elements += [Paragraph("Notes", h2),
                     Paragraph(escape(invoice.notes).replace("\n", "<br/>"), body), Spacer(1, 4*mm)]

    # -- How to pay, and the approval ------------------------------------------
    if invoice.balance_due > 0 and invoice.status != "cancelled":
        account = PLATFORM_BANK_ACCOUNT
        bank = Table(
            [[Paragraph(k, label), Paragraph(v, body)] for k, v in (
                ("Bank", account["bank"]),
                ("Account name", account["name"]),
                ("Account number", f"<b>{account['number']}</b>"),
                ("Amount", f"<b>{_money(invoice.balance_due)}</b>"),
                ("Narration", f"<b>PAY-{escape(invoice.invoice_number)}</b>"),
            )],
            colWidths=[32*mm, width * 0.5], hAlign="LEFT")
        bank.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), STRIPE),
            ("BOX", (0, 0), (-1, -1), 0.5, LINE),
            ("TOPPADDING", (0, 0), (-1, -1), 3),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ]))
        elements += [
            Paragraph("How to pay", h2),
            Paragraph(
                "By bank transfer to the account below, using the narration shown, "
                "or by card from the Billing page in Nuventa Cloud.", body),
            Spacer(1, 2*mm),
            bank,
            Spacer(1, 10*mm),
        ]
        sign = Table(
            [["", "", ""], ["Approved by (name and signature)", "", "Date"]],
            colWidths=[width * 0.55, width * 0.1, width * 0.35], rowHeights=[12*mm, None])
        sign.setStyle(TableStyle([
            ("LINEABOVE", (0, 1), (0, 1), 0.6, colors.black),
            ("LINEABOVE", (2, 1), (2, 1), 0.6, colors.black),
            ("FONTSIZE", (0, 1), (-1, 1), 8),
            ("TEXTCOLOR", (0, 1), (-1, 1), GREY),
            ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ]))
        elements.append(sign)

    elements += [
        Spacer(1, 8*mm),
        Paragraph(f"Downloaded {timezone.localtime():%d %B %Y, %H:%M}.", small),
    ]

    return page.build(elements)


def _settled(invoice):
    """The invoice's confirmed payments, oldest first: the ones a receipt counts."""
    return sorted((p for p in invoice.payments.all() if p.status == "confirmed"),
                  key=lambda p: (p.confirmed_at or p.created_at, p.created_at))


def receipt_number(payment):
    """
    RCT-<invoice number>-<n>, n counting the invoice's confirmed payments, so a
    receipt downloaded again keeps its number.
    """
    invoice = payment.invoice
    n = next(i for i, p in enumerate(_settled(invoice), 1) if p.pk == payment.pk)
    return f"RCT-{invoice.invoice_number.removeprefix('INV-')}-{n}"


def receipt_filename(payment):
    return f"{receipt_number(payment)}.pdf"


def render_receipt_pdf(payment, received_from="", note="", issued_by=""):
    """
    A Nuventa Cloud receipt for one confirmed payment. It says whether that
    payment left the invoice part paid or paid in full, counting only the
    payments confirmed up to and including it, so an early part payment's
    receipt still reads as a part payment once the rest is paid.
    """
    from reportlab.lib import colors
    from reportlab.lib.units import mm
    from reportlab.platypus import Paragraph, Spacer, Table, TableStyle

    invoice = payment.invoice
    number = receipt_number(payment)
    received_on = payment.confirmed_at or payment.created_at

    settled = _settled(invoice)
    paid_to_date = sum((p.amount for p in settled[:settled.index(payment) + 1]), 0)
    balance_after = max(invoice.total_amount - paid_to_date, 0)
    in_full = balance_after == 0

    page = _Page(f"Receipt {number}")
    width = page.width
    body, label, h2 = page.body, page.label, page.h2

    elements = page.header("RECEIPT", number, "Paid in full" if in_full else "Part payment")

    # -- Who paid, and when --------------------------------------------------------
    from_block = page.school("RECEIVED FROM", invoice.tenant, received_from.strip() or None)
    facts = [
        ["Date received", _date(received_on)],
        ["Method", payment.get_payment_method_display()],
        ["Reference", payment.reference or payment.paystack_reference or "-"],
        ["For invoice", invoice.invoice_number],
        ["Billed for", period_label(invoice)],
    ]
    facts_tbl = Table(
        [[Paragraph(k, label), Paragraph(escape(v), body)] for k, v in facts],
        colWidths=[28*mm, width * 0.45 - 28*mm])
    facts_tbl.setStyle(TableStyle([
        ("TOPPADDING", (0, 0), (-1, -1), 1),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 1),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
    ]))
    parties = Table([[from_block, facts_tbl]], colWidths=[width * 0.55, width * 0.45])
    parties.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
    ]))
    elements += [parties, Spacer(1, 8*mm)]

    # -- The amount received -------------------------------------------------------
    amount = Table(
        [["Amount received", _money(payment.amount)]],
        colWidths=[width * 0.5, width * 0.5])
    amount.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), page.NAVY),
        ("TEXTCOLOR", (0, 0), (-1, -1), colors.white),
        ("FONTNAME", (0, 0), (-1, -1), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (0, 0), 11),
        ("FONTSIZE", (1, 0), (1, 0), 16),
        ("ALIGN", (1, 0), (1, 0), "RIGHT"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 10),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
    ]))
    elements += [amount, Spacer(1, 4*mm)]

    # -- Where the invoice stands after it -----------------------------------------
    standing = [
        ["Invoice total", _money(invoice.total_amount)],
        ["Paid to date", _money(paid_to_date)],
        ["Balance remaining", _money(balance_after)],
    ]
    standing_tbl = Table(standing, colWidths=[width * 0.3, width * 0.2], hAlign="RIGHT")
    standing_tbl.setStyle(TableStyle([
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("ALIGN", (1, 0), (1, -1), "RIGHT"),
        ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
        ("TEXTCOLOR", (0, -1), (-1, -1), page.NAVY),
        ("LINEABOVE", (0, -1), (-1, -1), 0.8, page.NAVY),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]))
    elements += [standing_tbl, Spacer(1, 6*mm)]

    if in_full:
        line = f"This payment settles invoice {invoice.invoice_number} in full. Thank you."
    else:
        line = (f"This is a part payment towards invoice {invoice.invoice_number}. "
                f"{_money(balance_after)} remains to be paid.")
    elements.append(Paragraph(escape(line), body))

    if note.strip():
        elements += [Paragraph("Note", h2),
                     Paragraph(escape(note.strip()).replace("\n", "<br/>"), body)]

    elements.append(Spacer(1, 8*mm))
    issued_by = (issued_by or "").strip()
    issued = f"Issued by Nuventa Cloud{f' ({issued_by})' if issued_by else ''}"
    elements.append(Paragraph(
        escape(f"{issued} on {timezone.localtime():%d %B %Y}."), page.small))

    return page.build(elements)
