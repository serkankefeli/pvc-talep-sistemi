from __future__ import annotations

import logging
import smtplib
from dataclasses import dataclass
from decimal import Decimal
from email.message import EmailMessage
from typing import Protocol

from .config import Settings


logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class AdminNotification:
    request_number: str
    item_count: int
    panel_url: str


class MailService(Protocol):
    def notify_admin(self, notification: AdminNotification) -> bool: ...

    def send_customer_message(
        self,
        *,
        recipient: str,
        subject: str,
        message: str,
        quoted_amount: Decimal | None,
        quote_currency: str,
    ) -> bool: ...


class SmtpMailService:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    @property
    def delivery_configured(self) -> bool:
        return bool(self.settings.smtp_host and self.settings.smtp_from_email)

    @property
    def admin_notification_configured(self) -> bool:
        return self.delivery_configured and bool(self.settings.smtp_admin_email)

    def notify_admin(self, notification: AdminNotification) -> bool:
        if not self.admin_notification_configured:
            logger.info(
                "Admin notification skipped because SMTP is not configured "
                "(request=%s)",
                notification.request_number,
            )
            return False

        # Deliberately omit customer PII and free-form input from the notification.
        body = (
            "Yeni bir görsel teklif talebi alındı.\n\n"
            f"Talep referansı: {notification.request_number}\n"
            f"Ürün adedi: {notification.item_count}\n"
            f"Güvenli yönetim paneli: {notification.panel_url}\n\n"
            "Müşteri bilgileri yalnızca kimlik doğrulamalı yönetim panelinde "
            "görüntülenebilir."
        )
        self._send(
            recipient=self.settings.smtp_admin_email,
            subject=f"Yeni teklif talebi: {notification.request_number}",
            body=body,
        )
        return True

    def send_customer_message(
        self,
        *,
        recipient: str,
        subject: str,
        message: str,
        quoted_amount: Decimal | None,
        quote_currency: str,
    ) -> bool:
        if not self.delivery_configured:
            return False

        body = message
        if quoted_amount is not None:
            body += f"\n\nTeklif tutarı: {quoted_amount:.2f} {quote_currency}"

        # EmailMessage encodes the plain-text body. No customer input is rendered
        # as HTML, and recipient/from addresses are not accepted from public input.
        self._send(recipient=recipient, subject=subject, body=body)
        return True

    def _send(self, *, recipient: str, subject: str, body: str) -> None:
        email = EmailMessage()
        email["From"] = self.settings.smtp_from_email
        email["To"] = recipient
        email["Subject"] = subject
        email.set_content(body)

        with smtplib.SMTP(
            self.settings.smtp_host,
            self.settings.smtp_port,
            timeout=self.settings.smtp_timeout_seconds,
        ) as smtp:
            if self.settings.smtp_starttls:
                smtp.starttls()
            if self.settings.smtp_username:
                smtp.login(
                    self.settings.smtp_username,
                    self.settings.smtp_password,
                )
            smtp.send_message(email)

