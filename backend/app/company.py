from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.engine import Engine
from sqlmodel import Session, select

from .config import Settings
from .models import AdminUser, CompanyAccount, QuoteRequest
from .security import AdminPrincipal, build_admin_dependency


def month_start() -> datetime:
    now = datetime.now(timezone.utc)
    return now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


def utc(value: datetime) -> datetime:
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value


def lock_account(session: Session) -> CompanyAccount | None:
    # PostgreSQL serializes admissions across API workers for quota enforcement.
    return session.exec(
        select(CompanyAccount).where(CompanyAccount.id == 1).with_for_update()
    ).first()


def subscription_expired(account: CompanyAccount, now: datetime | None = None) -> bool:
    deadline = account.trial_ends_at if account.plan == "trial" else account.subscription_ends_at
    if account.plan not in {"trial", "legacy"} and deadline is None:
        return True  # Old paid records without a term cannot grant unlimited access.
    return deadline is not None and utc(deadline) <= (now or datetime.now(timezone.utc))


def annual_end(start: datetime) -> datetime:
    try:
        return start.replace(year=start.year + 1)
    except ValueError:  # 29 February -> 28 February in the next calendar year.
        return start.replace(year=start.year + 1, day=28)


def assert_account_access(account: CompanyAccount | None, *, allow_expired: bool = False) -> None:
    if account is None:
        raise HTTPException(status_code=503, detail="Company account is not initialized.")
    if account.status != "active":
        raise HTTPException(status_code=403, detail="Company account is suspended.")
    if not allow_expired and account.plan == "trial" and (
        account.trial_ends_at is None
        or utc(account.trial_ends_at) <= datetime.now(timezone.utc)
    ):
        raise HTTPException(status_code=403, detail="Company trial has expired.")
    if not allow_expired and subscription_expired(account):
        raise HTTPException(status_code=403, detail="SUBSCRIPTION_EXPIRED")


def active_seats(session: Session) -> int:
    return int(session.exec(
        select(func.count()).select_from(AdminUser).where(AdminUser.is_active.is_(True))
    ).one())


def monthly_requests(session: Session) -> int:
    return int(session.exec(
        select(func.count()).select_from(QuoteRequest)
        .where(QuoteRequest.created_at >= month_start())
    ).one())


def enforce_seat_limit(session: Session) -> None:
    account = lock_account(session)
    assert_account_access(account)
    if account.seat_limit is not None and active_seats(session) >= account.seat_limit:
        raise HTTPException(status_code=409, detail="Company active-user limit reached.")


def enforce_request_limit(session: Session) -> None:
    account = lock_account(session)
    assert_account_access(account)
    if (
        account.monthly_request_limit is not None
        and monthly_requests(session) >= account.monthly_request_limit
    ):
        raise HTTPException(status_code=429, detail="Company monthly request limit reached.")


class CompanyResponse(BaseModel):
    slug: str
    name: str
    plan: str
    status: str
    seat_limit: int | None
    monthly_request_limit: int | None
    trial_ends_at: datetime | None
    active_users: int
    requests_this_month: int
    usage_month: str
    saas_enabled: bool
    subscription_starts_at: datetime | None
    subscription_ends_at: datetime | None
    subscription_email: str | None
    access_mode: str


def build_company_router(*, settings: Settings, engine: Engine) -> APIRouter:
    router = APIRouter(prefix="/api/v1/admin", tags=["company account"])
    require_admin = build_admin_dependency(settings, engine)

    @router.get("/session-status")
    def session_status(_: AdminPrincipal = Depends(require_admin)):
        with Session(engine) as session:
            account = session.get(CompanyAccount, 1)
            assert_account_access(account, allow_expired=True)
            return {"access_mode": "expired" if subscription_expired(account) else "active"}

    @router.get("/company", response_model=CompanyResponse)
    def company(
        _: AdminPrincipal = Depends(require_admin),
    ) -> CompanyResponse:
        with Session(engine) as session:
            account = session.get(CompanyAccount, 1)
            assert_account_access(account, allow_expired=True)
            return CompanyResponse(
                slug=account.slug,
                name=account.name,
                plan=account.plan,
                status=account.status,
                seat_limit=account.seat_limit,
                monthly_request_limit=account.monthly_request_limit,
                trial_ends_at=account.trial_ends_at,
                active_users=active_seats(session),
                requests_this_month=monthly_requests(session),
                usage_month=month_start().strftime("%Y-%m"),
                saas_enabled=settings.tenant_saas,
                subscription_starts_at=utc(account.subscription_starts_at) if account.subscription_starts_at else None,
                subscription_ends_at=utc(account.subscription_ends_at) if account.subscription_ends_at else None,
                subscription_email=account.subscription_email,
                access_mode="expired" if subscription_expired(account) else "active",
            )

    return router
