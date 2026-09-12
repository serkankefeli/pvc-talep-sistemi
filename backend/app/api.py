import logging
import hashlib
import re
import secrets
from datetime import datetime
from decimal import Decimal
from typing import Annotated, Literal

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    HTTPException,
    Query,
    Request,
    status,
)
from sqlalchemy import exists, func, or_, update
from sqlalchemy.engine import Engine
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import selectinload
from sqlmodel import Session, select

from .config import Settings
from .catalog import validate_catalog_submission
from .mailer import AdminNotification, MailService
from .models import (
    AdminRequestFavorite,
    QuoteRequest,
    QuoteRequestItem,
    QuoteRequestRevision,
    utc_now,
)
from .rate_limit import SlidingWindowRateLimiter
from .schemas import (
    AdminLoginRequest,
    AdminRequestDetail,
    AdminRequestFavoriteState,
    AdminRequestList,
    AdminRequestRevision,
    AdminRequestRevisionCreate,
    AdminRequestSummary,
    AdminRequestUpdate,
    AdminTokenResponse,
    CustomerContactCreate,
    CustomProductItemCreate,
    CustomerEmailSend,
    CustomerEmailSent,
    HealthResponse,
    PublicRequestCreate,
    PublicRequestCreated,
    RequestStatus,
)
from .security import (
    AdminPrincipal,
    build_admin_dependency,
    create_access_token,
    verify_admin_credentials,
)


logger = logging.getLogger(__name__)


def _client_key(request: Request, namespace: str) -> str:
    # Intentionally use the socket peer, not spoofable forwarding headers.
    host = request.client.host if request.client else "unknown"
    return f"{namespace}:{host}"


def _contact_key(payload: PublicRequestCreate) -> str:
    contact = payload.contact
    normalized_email = str(contact.email).strip().lower() if contact.email else ""
    normalized_phone = (
        re.sub(r"\D", "", contact.phone)
        if contact.phone
        else ""
    )
    digest = hashlib.sha256(
        f"{normalized_email}|{normalized_phone}".encode("utf-8")
    ).hexdigest()
    return f"public-contact:{digest}"


def _create_request_number(session: Session) -> str:
    for _ in range(10):
        candidate = f"PVC-{secrets.token_hex(8).upper()}"
        exists = session.exec(
            select(QuoteRequest.id).where(QuoteRequest.request_number == candidate)
        ).first()
        if exists is None:
            return candidate
    raise RuntimeError("Could not allocate a unique request reference")


def _contact_from_model(model: QuoteRequest) -> CustomerContactCreate:
    return CustomerContactCreate(
        full_name=model.customer_name,
        company_name=model.company_name,
        email=model.customer_email,
        phone=model.customer_phone,
        preferred_contact=model.preferred_contact,
        city=model.city,
        district=model.district,
    )


def _detail_from_model(
    model: QuoteRequest,
    *,
    favorite: bool,
) -> AdminRequestDetail:
    return AdminRequestDetail(
        id=model.id,
        request_number=model.request_number,
        status=model.status,
        contact=_contact_from_model(model),
        project_note=model.project_note,
        privacy_consent=model.privacy_consent,
        items=[item.configuration_json for item in model.items],
        favorite=favorite,
        internal_notes=model.internal_notes,
        quoted_amount=model.quoted_amount,
        quote_currency=model.quote_currency,
        admin_notification_state=model.admin_notification_state,
        admin_notified_at=model.admin_notified_at,
        customer_email_sent_at=model.customer_email_sent_at,
        created_at=model.created_at,
        updated_at=model.updated_at,
    )


def _summary_from_model(
    model: QuoteRequest,
    *,
    favorite: bool,
) -> AdminRequestSummary:
    return AdminRequestSummary(
        id=model.id,
        request_number=model.request_number,
        status=model.status,
        customer_name=model.customer_name,
        company_name=model.company_name,
        customer_email=model.customer_email,
        customer_phone=model.customer_phone,
        preferred_contact=model.preferred_contact,
        product_count=len(model.items),
        favorite=favorite,
        quoted_amount=model.quoted_amount,
        quote_currency=model.quote_currency,
        created_at=model.created_at,
        updated_at=model.updated_at,
    )


def _is_admin_favorite(
    session: Session,
    *,
    principal: AdminPrincipal,
    request_id: int,
) -> bool:
    return (
        session.get(
            AdminRequestFavorite,
            (principal.username, request_id),
        )
        is not None
    )


def _notify_admin_once(
    *,
    engine: Engine,
    mailer: MailService,
    request_id: int,
    settings: Settings,
) -> None:
    # Claim the notification atomically so retries/process races do not duplicate it.
    with engine.begin() as connection:
        result = connection.execute(
            update(QuoteRequest)
            .where(
                QuoteRequest.id == request_id,
                QuoteRequest.admin_notification_state == "pending",
            )
            .values(admin_notification_state="sending")
        )
        if result.rowcount != 1:
            return

    with Session(engine) as session:
        model = session.get(QuoteRequest, request_id)
        if model is None:
            return
        request_number = model.request_number
        item_count = session.exec(
            select(func.count())
            .select_from(QuoteRequestItem)
            .where(QuoteRequestItem.quote_request_id == request_id)
        ).one()

    notification = AdminNotification(
        request_number=request_number,
        item_count=int(item_count),
        panel_url=f"{settings.admin_panel_base_url}/talepler/{request_id}",
    )

    state = "skipped"
    notified_at: datetime | None = None
    try:
        if mailer.notify_admin(notification):
            state = "sent"
            notified_at = utc_now()
    except Exception:
        # Do not log message bodies, recipients, names, e-mail addresses or phones.
        state = "failed"
        logger.exception("Admin notification failed (request=%s)", request_number)

    with Session(engine) as session:
        model = session.get(QuoteRequest, request_id)
        if model is None:
            return
        model.admin_notification_state = state
        model.admin_notified_at = notified_at
        model.updated_at = utc_now()
        session.add(model)
        session.commit()


def build_router(
    *,
    settings: Settings,
    engine: Engine,
    mailer: MailService,
) -> APIRouter:
    router = APIRouter(prefix="/api/v1")
    public_limiter = SlidingWindowRateLimiter(
        settings.public_rate_limit_requests,
        settings.public_rate_limit_window_seconds,
    )
    contact_limiter = SlidingWindowRateLimiter(
        settings.public_rate_limit_requests,
        settings.public_rate_limit_window_seconds,
    )
    auth_limiter = SlidingWindowRateLimiter(
        settings.auth_rate_limit_requests,
        settings.auth_rate_limit_window_seconds,
    )
    require_admin = build_admin_dependency(settings)

    def get_session():
        with Session(engine) as session:
            yield session

    def enforce_public_limit(request: Request) -> None:
        retry_after = public_limiter.retry_after(_client_key(request, "public-create"))
        if retry_after is not None:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many requests. Please try again later.",
                headers={"Retry-After": str(retry_after)},
            )

    def enforce_auth_limit(request: Request) -> None:
        retry_after = auth_limiter.retry_after(_client_key(request, "admin-login"))
        if retry_after is not None:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many login attempts. Please try again later.",
                headers={"Retry-After": str(retry_after)},
            )

    @router.get("/health", response_model=HealthResponse, tags=["system"])
    def health() -> HealthResponse:
        return HealthResponse()

    @router.post(
        "/requests",
        response_model=PublicRequestCreated,
        status_code=status.HTTP_202_ACCEPTED,
        tags=["public requests"],
        dependencies=[Depends(enforce_public_limit)],
    )
    def create_public_request(
        payload: PublicRequestCreate,
        background_tasks: BackgroundTasks,
        session: Session = Depends(get_session),
    ) -> PublicRequestCreated:
        contact_retry_after = contact_limiter.retry_after(_contact_key(payload))
        if contact_retry_after is not None:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many requests. Please try again later.",
                headers={"Retry-After": str(contact_retry_after)},
            )
        resolved_profile_specs = [
            validate_catalog_submission(session, item) for item in payload.items
        ]
        request_number = _create_request_number(session)
        contact = payload.contact
        model = QuoteRequest(
            request_number=request_number,
            status=RequestStatus.NEW.value,
            customer_name=contact.full_name,
            company_name=contact.company_name,
            customer_email=str(contact.email) if contact.email else None,
            customer_phone=contact.phone,
            preferred_contact=contact.preferred_contact.value,
            city=contact.city,
            district=contact.district,
            project_note=payload.project_note,
            privacy_consent=payload.privacy_consent,
        )
        session.add(model)
        session.flush()

        for item, resolved_profile_spec in zip(
            payload.items,
            resolved_profile_specs,
            strict=True,
        ):
            item_data = item.model_dump(mode="json")
            # Profile dimensions are a server-owned snapshot. Never persist
            # values supplied by the public client as authoritative geometry.
            item_data["profile_spec"] = (
                resolved_profile_spec.model_dump(mode="json")
                if resolved_profile_spec is not None
                else None
            )
            product_type = (
                item.product_type
                if isinstance(item, CustomProductItemCreate)
                else item.product_type.value
            )
            session.add(
                QuoteRequestItem(
                    quote_request_id=model.id,
                    product_type=product_type,
                    width_mm=item.width_mm,
                    height_mm=item.height_mm,
                    quantity=item.quantity,
                    configuration_json=item_data,
                )
            )

        session.commit()
        session.refresh(model)
        background_tasks.add_task(
            _notify_admin_once,
            engine=engine,
            mailer=mailer,
            request_id=model.id,
            settings=settings,
        )
        return PublicRequestCreated(
            request_number=model.request_number,
            message=(
                "Talebiniz alındı. Ekibimiz inceleyerek telefon veya e-posta ile "
                "sizinle iletişime geçecektir."
            ),
        )

    @router.post(
        "/admin/login",
        response_model=AdminTokenResponse,
        tags=["admin"],
        dependencies=[Depends(enforce_auth_limit)],
    )
    def admin_login(payload: AdminLoginRequest) -> AdminTokenResponse:
        if not settings.admin_password_hash:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Administrator authentication is not configured.",
            )
        if not verify_admin_credentials(payload.username, payload.password, settings):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid credentials.",
                headers={"WWW-Authenticate": "Bearer"},
            )
        return AdminTokenResponse(
            access_token=create_access_token(settings),
            expires_in=settings.jwt_expire_minutes * 60,
        )

    @router.get(
        "/admin/requests",
        response_model=AdminRequestList,
        tags=["admin"],
    )
    def list_admin_requests(
        principal: Annotated[AdminPrincipal, Depends(require_admin)],
        session: Session = Depends(get_session),
        request_status: Annotated[
            RequestStatus | None,
            Query(alias="status"),
        ] = None,
        search: Annotated[str | None, Query(min_length=2, max_length=120)] = None,
        favorite: Annotated[bool | None, Query()] = None,
        sort_by: Annotated[
            Literal[
                "created_at",
                "updated_at",
                "request_number",
                "customer_name",
                "status",
                "quoted_amount",
            ],
            Query(),
        ] = "created_at",
        sort_dir: Annotated[Literal["asc", "desc"], Query()] = "desc",
        limit: Annotated[int, Query(ge=1, le=100)] = 25,
        offset: Annotated[int, Query(ge=0)] = 0,
    ) -> AdminRequestList:
        conditions = []
        if request_status is not None:
            conditions.append(QuoteRequest.status == request_status.value)
        if search:
            term = f"%{search}%"
            conditions.append(
                or_(
                    QuoteRequest.request_number.ilike(term),
                    QuoteRequest.customer_name.ilike(term),
                    QuoteRequest.company_name.ilike(term),
                    QuoteRequest.customer_email.ilike(term),
                    QuoteRequest.customer_phone.ilike(term),
                )
            )
        favorite_exists = exists().where(
            AdminRequestFavorite.admin_username == principal.username,
            AdminRequestFavorite.quote_request_id == QuoteRequest.id,
        )
        if favorite is not None:
            conditions.append(favorite_exists if favorite else ~favorite_exists)

        sort_columns = {
            "created_at": QuoteRequest.created_at,
            "updated_at": QuoteRequest.updated_at,
            "request_number": QuoteRequest.request_number,
            "customer_name": QuoteRequest.customer_name,
            "status": QuoteRequest.status,
            "quoted_amount": QuoteRequest.quoted_amount,
        }
        sort_column = sort_columns[sort_by]
        sort_expression = (
            sort_column.asc() if sort_dir == "asc" else sort_column.desc()
        )
        id_tiebreaker = (
            QuoteRequest.id.asc() if sort_dir == "asc" else QuoteRequest.id.desc()
        )

        count_statement = select(func.count()).select_from(QuoteRequest)
        list_statement = (
            select(QuoteRequest)
            .options(selectinload(QuoteRequest.items))
            .order_by(sort_expression, id_tiebreaker)
            .offset(offset)
            .limit(limit)
        )
        for condition in conditions:
            count_statement = count_statement.where(condition)
            list_statement = list_statement.where(condition)

        total = int(session.exec(count_statement).one())
        models = session.exec(list_statement).all()
        request_ids = [model.id for model in models if model.id is not None]
        favorite_ids: set[int] = set()
        if request_ids:
            favorite_ids.update(
                session.exec(
                    select(AdminRequestFavorite.quote_request_id).where(
                        AdminRequestFavorite.admin_username == principal.username,
                        AdminRequestFavorite.quote_request_id.in_(request_ids),
                    )
                ).all()
            )
        return AdminRequestList(
            items=[
                _summary_from_model(
                    model,
                    favorite=model.id in favorite_ids,
                )
                for model in models
            ],
            total=total,
            limit=limit,
            offset=offset,
        )

    @router.get(
        "/admin/requests/{request_id}",
        response_model=AdminRequestDetail,
        tags=["admin"],
    )
    def get_admin_request(
        request_id: int,
        principal: Annotated[AdminPrincipal, Depends(require_admin)],
        session: Session = Depends(get_session),
    ) -> AdminRequestDetail:
        model = session.exec(
            select(QuoteRequest)
            .options(selectinload(QuoteRequest.items))
            .where(QuoteRequest.id == request_id)
        ).one_or_none()
        if model is None:
            raise HTTPException(status_code=404, detail="Request not found.")
        return _detail_from_model(
            model,
            favorite=_is_admin_favorite(
                session,
                principal=principal,
                request_id=request_id,
            ),
        )

    @router.put(
        "/admin/requests/{request_id}/favorite",
        response_model=AdminRequestFavoriteState,
        tags=["admin"],
    )
    def add_admin_request_favorite(
        request_id: int,
        principal: Annotated[AdminPrincipal, Depends(require_admin)],
        session: Session = Depends(get_session),
    ) -> AdminRequestFavoriteState:
        if session.get(QuoteRequest, request_id) is None:
            raise HTTPException(status_code=404, detail="Request not found.")

        favorite_key = (principal.username, request_id)
        if session.get(AdminRequestFavorite, favorite_key) is None:
            session.add(
                AdminRequestFavorite(
                    admin_username=principal.username,
                    quote_request_id=request_id,
                )
            )
            try:
                session.commit()
            except IntegrityError:
                # A concurrent identical PUT may have inserted the same favorite.
                session.rollback()
                if session.get(AdminRequestFavorite, favorite_key) is None:
                    raise
        return AdminRequestFavoriteState(request_id=request_id, favorite=True)

    @router.delete(
        "/admin/requests/{request_id}/favorite",
        response_model=AdminRequestFavoriteState,
        tags=["admin"],
    )
    def remove_admin_request_favorite(
        request_id: int,
        principal: Annotated[AdminPrincipal, Depends(require_admin)],
        session: Session = Depends(get_session),
    ) -> AdminRequestFavoriteState:
        if session.get(QuoteRequest, request_id) is None:
            raise HTTPException(status_code=404, detail="Request not found.")

        favorite = session.get(
            AdminRequestFavorite,
            (principal.username, request_id),
        )
        if favorite is not None:
            session.delete(favorite)
            session.commit()
        return AdminRequestFavoriteState(request_id=request_id, favorite=False)

    @router.patch(
        "/admin/requests/{request_id}",
        response_model=AdminRequestDetail,
        tags=["admin"],
    )
    def update_admin_request(
        request_id: int,
        payload: AdminRequestUpdate,
        principal: Annotated[AdminPrincipal, Depends(require_admin)],
        session: Session = Depends(get_session),
    ) -> AdminRequestDetail:
        model = session.exec(
            select(QuoteRequest)
            .options(selectinload(QuoteRequest.items))
            .where(QuoteRequest.id == request_id)
        ).one_or_none()
        if model is None:
            raise HTTPException(status_code=404, detail="Request not found.")

        supplied = payload.model_fields_set
        if "status" in supplied and payload.status is not None:
            model.status = payload.status.value
        if "internal_notes" in supplied:
            model.internal_notes = payload.internal_notes
        if "quoted_amount" in supplied:
            # This is a manual admin value; no public/API price calculation exists.
            model.quoted_amount = payload.quoted_amount
        model.updated_at = utc_now()
        session.add(model)
        session.commit()
        session.refresh(model)
        return _detail_from_model(
            model,
            favorite=_is_admin_favorite(
                session,
                principal=principal,
                request_id=request_id,
            ),
        )

    @router.post(
        "/admin/requests/{request_id}/send-email",
        response_model=CustomerEmailSent,
        tags=["admin"],
    )
    def send_customer_email(
        request_id: int,
        payload: CustomerEmailSend,
        _: Annotated[AdminPrincipal, Depends(require_admin)],
        session: Session = Depends(get_session),
    ) -> CustomerEmailSent:
        model = session.get(QuoteRequest, request_id)
        if model is None:
            raise HTTPException(status_code=404, detail="Request not found.")
        if not model.customer_email:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="This request has no customer e-mail address.",
            )
        if payload.include_quote and model.quoted_amount is None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="A quote amount must be entered before including it.",
            )

        quoted_amount: Decimal | None = (
            model.quoted_amount if payload.include_quote else None
        )
        try:
            sent = mailer.send_customer_message(
                recipient=model.customer_email,
                subject=payload.subject,
                message=payload.message,
                quoted_amount=quoted_amount,
                quote_currency=model.quote_currency,
            )
        except Exception as exc:
            logger.exception(
                "Explicit customer e-mail delivery failed (request=%s)",
                model.request_number,
            )
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="E-mail delivery failed.",
            ) from exc
        if not sent:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="SMTP delivery is not configured.",
            )

        sent_at = utc_now()
        model.customer_email_sent_at = sent_at
        model.updated_at = sent_at
        session.add(model)
        session.commit()
        return CustomerEmailSent(sent_at=sent_at)

    @router.get(
        "/admin/requests/{request_id}/revisions",
        response_model=list[AdminRequestRevision],
        tags=["admin"],
    )
    def list_request_revisions(
        request_id: int,
        _: Annotated[AdminPrincipal, Depends(require_admin)],
        session: Session = Depends(get_session),
    ) -> list[AdminRequestRevision]:
        if session.get(QuoteRequest, request_id) is None:
            raise HTTPException(status_code=404, detail="Request not found.")
        revisions = session.exec(
            select(QuoteRequestRevision)
            .where(QuoteRequestRevision.quote_request_id == request_id)
            .order_by(QuoteRequestRevision.revision_number.desc())
        ).all()
        return [
            AdminRequestRevision(
                id=revision.id,
                request_id=revision.quote_request_id,
                revision_number=revision.revision_number,
                note=revision.note,
                items=revision.items_json,
                created_by=revision.created_by,
                created_at=revision.created_at,
            )
            for revision in revisions
        ]

    @router.post(
        "/admin/requests/{request_id}/revisions",
        response_model=AdminRequestRevision,
        status_code=status.HTTP_201_CREATED,
        tags=["admin"],
    )
    def create_request_revision(
        request_id: int,
        payload: AdminRequestRevisionCreate,
        principal: Annotated[AdminPrincipal, Depends(require_admin)],
        session: Session = Depends(get_session),
    ) -> AdminRequestRevision:
        request_model = session.exec(
            select(QuoteRequest)
            .options(selectinload(QuoteRequest.items))
            .where(QuoteRequest.id == request_id)
        ).one_or_none()
        if request_model is None:
            raise HTTPException(status_code=404, detail="Request not found.")
        latest = session.exec(
            select(func.max(QuoteRequestRevision.revision_number)).where(
                QuoteRequestRevision.quote_request_id == request_id
            )
        ).one()
        revision = QuoteRequestRevision(
            quote_request_id=request_id,
            revision_number=int(latest or 0) + 1,
            note=payload.note.strip(),
            items_json=[item.configuration_json for item in request_model.items],
            created_by=principal.username,
        )
        session.add(revision)
        session.commit()
        session.refresh(revision)
        return AdminRequestRevision(
            id=revision.id,
            request_id=revision.quote_request_id,
            revision_number=revision.revision_number,
            note=revision.note,
            items=revision.items_json,
            created_by=revision.created_by,
            created_at=revision.created_at,
        )

    return router
