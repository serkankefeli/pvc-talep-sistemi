"""Scheduled SaaS renewal reminders. SMTP delivery is never claimed without acceptance."""
from __future__ import annotations

import argparse
import logging
import math
import time
from datetime import datetime, timedelta, timezone

from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select

from .company import utc
from .config import Settings
from .mailer import SmtpMailService
from .models import SubscriptionReminder
from .saas import initialize_tenant, load_manifest, tenant_settings

logger = logging.getLogger(__name__)


def send_due_reminder(engine, tenant, mailer, *, days=(30, 14, 7, 1), now=None):
    now = now or datetime.now(timezone.utc)
    if tenant.status != "active" or not tenant.subscription_ends_at or not tenant.subscription_email:
        return "skipped"
    deadline = utc(tenant.subscription_ends_at).astimezone(timezone.utc)
    remaining = (deadline - now).total_seconds() / 86400
    eligible = [day for day in days if 0 < remaining <= day]
    if not eligible:
        return "skipped"
    # After downtime send only the most relevant checkpoint, not a backlog of mails.
    checkpoint = min(eligible)
    key = deadline.isoformat()
    with Session(engine) as session:
        if session.get(SubscriptionReminder, (key, checkpoint)) is None:
            session.add(SubscriptionReminder(term_key=key, days_before=checkpoint))
            try:
                session.commit()
            except IntegrityError:
                session.rollback()  # Another worker created the same checkpoint.
    with Session(engine) as session:
        reminder = session.exec(select(SubscriptionReminder).where(
            SubscriptionReminder.term_key == key,
            SubscriptionReminder.days_before == checkpoint,
        ).with_for_update()).one()
        if reminder.state == "sent":
            return "already_sent"
        if reminder.last_attempt_at and utc(reminder.last_attempt_at) + timedelta(hours=6) > now:
            return "retry_later"
        reminder.attempts += 1
        reminder.last_attempt_at = now
        try:
            accepted = mailer.send_customer_message(
                recipient=str(tenant.subscription_email),
                subject="Doğrama sistemi yıllık abonelik hatırlatması",
                message=(f"Merhaba {tenant.name},\n\nYıllık aboneliğinizin bitmesine "
                    f"{math.ceil(remaining)} gün kaldı. Bitiş: {deadline:%d.%m.%Y %H:%M} UTC.\n\n"
                    "Abonelik sona erdiğinde giriş yapabilirsiniz, ancak sistem işlemleri "
                    "yenileme yapılana kadar kapalı olacaktır. Verileriniz korunacaktır.\n"
                    "Yenileme için hizmet yöneticinizle iletişime geçin.\n"
                    f"Hesabınız: {tenant.public_url}/admin/firma"),
                quoted_amount=None, quote_currency="TRY",
            )
        except Exception:
            accepted = False
            logger.warning("Subscription reminder delivery failed (company=%s)", tenant.slug)
        reminder.state = "sent" if accepted else "failed"
        reminder.sent_at = now if accepted else None
        session.add(reminder)
        session.commit()
        return reminder.state


def run_once(settings, *, now=None, mailer_factory=SmtpMailService):
    if not settings.saas_enabled:
        return {"disabled": 1}
    counts = {}
    for tenant in load_manifest(settings).tenants:
        if tenant.status != "active" or not tenant.subscription_ends_at:
            continue
        if not tenant.subscription_email:
            counts["missing_contact"] = counts.get("missing_contact", 0) + 1
            logger.warning("Subscription contact missing (company=%s)", tenant.slug)
            continue
        target = None
        try:
            resolved = tenant_settings(settings, tenant)
            target = initialize_tenant(settings, tenant)
            state = send_due_reminder(target.state.engine, tenant, mailer_factory(resolved),
                days=tuple(int(day) for day in settings.subscription_reminder_days.split(",")), now=now)
        except Exception:
            state = "failed"
            logger.warning("Subscription reminder job failed (company=%s)", tenant.slug)
        finally:
            if target is not None:
                target.state.engine.dispose()
        counts[state] = counts.get(state, 0) + 1
    return counts


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--loop", action="store_true")
    parser.add_argument("--interval", type=int, default=3600)
    args = parser.parse_args()
    if args.interval < 60:
        parser.error("Interval must be at least 60 seconds")
    logging.basicConfig(level=logging.INFO)
    settings = Settings()
    while True:
        try:
            logger.info("Subscription reminder results: %s", run_once(settings))
        except Exception:
            logger.warning("Subscription reminder registry unavailable")
        if not args.loop:
            break
        time.sleep(args.interval)


if __name__ == "__main__":
    main()
