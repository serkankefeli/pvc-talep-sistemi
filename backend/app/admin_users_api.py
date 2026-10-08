from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import func
from sqlalchemy.engine import Engine
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select

from .config import Settings
from .models import AdminUser, utc_now
from .schemas import (
    AdminPasswordChange,
    AdminPasswordReset,
    AdminUserCreate,
    AdminUserResponse,
    AdminUserUpdate,
)
from .security import (
    AdminPrincipal,
    build_admin_dependency,
    hash_password,
    verify_password,
)


def _response(user: AdminUser) -> AdminUserResponse:
    return AdminUserResponse.model_validate(user, from_attributes=True)


def build_admin_users_router(*, settings: Settings, engine: Engine) -> APIRouter:
    router = APIRouter(prefix="/api/v1/admin/users", tags=["admin users"])
    require_admin = build_admin_dependency(settings, engine)

    def get_session():
        with Session(engine) as session:
            yield session

    def require_superuser(
        principal: AdminPrincipal = Depends(require_admin),
    ) -> AdminPrincipal:
        if not principal.is_superuser:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="System administrator permission is required.",
            )
        return principal

    @router.get("/me", response_model=AdminUserResponse)
    def current_user(
        principal: AdminPrincipal = Depends(require_admin),
        session: Session = Depends(get_session),
    ) -> AdminUserResponse:
        user = session.get(AdminUser, principal.id)
        if user is None:
            raise HTTPException(status_code=404, detail="Administrator not found.")
        return _response(user)

    @router.get("", response_model=list[AdminUserResponse])
    def list_users(
        _: AdminPrincipal = Depends(require_superuser),
        session: Session = Depends(get_session),
    ) -> list[AdminUserResponse]:
        users = session.exec(
            select(AdminUser).order_by(AdminUser.created_at.asc(), AdminUser.id.asc())
        ).all()
        return [_response(user) for user in users]

    @router.post(
        "",
        response_model=AdminUserResponse,
        status_code=status.HTTP_201_CREATED,
    )
    def create_user(
        payload: AdminUserCreate,
        _: AdminPrincipal = Depends(require_superuser),
        session: Session = Depends(get_session),
    ) -> AdminUserResponse:
        user = AdminUser(
            username=payload.username.casefold(),
            display_name=payload.display_name,
            password_hash=hash_password(payload.password),
            is_active=True,
            is_superuser=payload.is_superuser,
        )
        session.add(user)
        try:
            session.commit()
        except IntegrityError as exc:
            session.rollback()
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="This username is already in use.",
            ) from exc
        session.refresh(user)
        return _response(user)

    @router.patch("/{user_id:int}", response_model=AdminUserResponse)
    def update_user(
        user_id: int,
        payload: AdminUserUpdate,
        principal: AdminPrincipal = Depends(require_superuser),
        session: Session = Depends(get_session),
    ) -> AdminUserResponse:
        user = session.get(AdminUser, user_id)
        if user is None:
            raise HTTPException(status_code=404, detail="Administrator not found.")
        if user.id == principal.id and (
            payload.is_active is False or payload.is_superuser is False
        ):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="You cannot remove your own access or system administrator role.",
            )
        removes_active_superuser = (
            user.is_active
            and user.is_superuser
            and (payload.is_active is False or payload.is_superuser is False)
        )
        if removes_active_superuser:
            active_superusers = session.exec(
                select(func.count())
                .select_from(AdminUser)
                .where(AdminUser.is_active.is_(True), AdminUser.is_superuser.is_(True))
            ).one()
            if int(active_superusers) <= 1:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="At least one active system administrator is required.",
                )
        if payload.display_name is not None:
            user.display_name = payload.display_name
        if payload.is_active is not None and payload.is_active != user.is_active:
            user.is_active = payload.is_active
            user.token_version += 1
        if payload.is_superuser is not None:
            user.is_superuser = payload.is_superuser
        user.updated_at = utc_now()
        session.add(user)
        session.commit()
        session.refresh(user)
        return _response(user)

    @router.post("/{user_id:int}/password", status_code=status.HTTP_204_NO_CONTENT)
    def reset_user_password(
        user_id: int,
        payload: AdminPasswordReset,
        principal: AdminPrincipal = Depends(require_superuser),
        session: Session = Depends(get_session),
    ) -> Response:
        if user_id == principal.id:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Use the current-password flow for your own account.",
            )
        user = session.get(AdminUser, user_id)
        if user is None:
            raise HTTPException(status_code=404, detail="Administrator not found.")
        user.password_hash = hash_password(payload.new_password)
        user.password_changed_at = utc_now()
        user.updated_at = utc_now()
        user.token_version += 1
        session.add(user)
        session.commit()
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    @router.post("/me/password", status_code=status.HTTP_204_NO_CONTENT)
    def change_own_password(
        payload: AdminPasswordChange,
        principal: AdminPrincipal = Depends(require_admin),
        session: Session = Depends(get_session),
    ) -> Response:
        user = session.get(AdminUser, principal.id)
        if user is None or not verify_password(payload.current_password, user.password_hash):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Current password is incorrect.",
            )
        user.password_hash = hash_password(payload.new_password)
        user.password_changed_at = utc_now()
        user.updated_at = utc_now()
        user.token_version += 1
        session.add(user)
        session.commit()
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    return router
