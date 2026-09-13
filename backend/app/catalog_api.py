from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.engine import Engine
from sqlmodel import Session, select

from .catalog import required_select_fields_without_options
from .config import Settings
from .models import (
    CatalogField,
    CatalogOption,
    CatalogOptionDetail,
    CatalogOptionProfileSpec,
    CatalogOptionVisual,
    CatalogProduct,
    CatalogProductMaterial,
)
from .schemas import (
    CatalogFieldAdmin,
    CatalogFieldCreate,
    CatalogFieldPublic,
    CatalogFieldUpdate,
    CatalogMeasurementPublic,
    CatalogOptionAdmin,
    CatalogOptionCreate,
    CatalogOptionPublic,
    CatalogOptionUpdate,
    CatalogProductAdmin,
    CatalogProductCreate,
    CatalogProductPublic,
    CatalogProductUpdate,
    ProfileSpec,
    PublicCatalogResponse,
)
from .security import AdminPrincipal, build_admin_dependency


MAX_FIELDS_PER_PRODUCT = 30
MAX_OPTIONS_PER_FIELD = 50
RESERVED_DYNAMIC_FIELD_KEYS = {"notes"}
OPTION_DETAIL_FIELDS = {"description", "features", "section_image_urls"}
OPTION_PROFILE_SPEC_FIELD = "profile_spec"
OPTION_VISUAL_FIELD = "visual_icon_url"
OPTION_AUXILIARY_FIELDS = OPTION_DETAIL_FIELDS | {
    OPTION_PROFILE_SPEC_FIELD,
    OPTION_VISUAL_FIELD,
}

# These values change the generated drawing or panel layout. The current
# renderer supports only the listed values, so administrators must not be able
# to publish an option that the public client would silently replace.
VISUAL_BEHAVIOR_OPTION_VALUES: dict[str, dict[str, frozenset[str]]] = {
    "pvc_window": {
        "layout": frozenset(
            {
                "fixed",
                "single_sash",
                "double_sash",
                "tilt_turn",
                "transom",
                "custom_grid",
                "window_door",
                "door_window",
                "window_door_window",
            }
        ),
        "opening_direction": frozenset(
            {"none", "left", "right", "inward", "outward"}
        ),
        "opening_mechanism": frozenset(
            {"fixed", "turn", "tilt", "tilt_turn", "sliding"}
        ),
    },
    "pvc_door": {
        "layout": frozenset(
            {
                "single",
                "double",
                "balcony",
                "sliding",
                "window_door",
                "door_window",
                "window_door_window",
            }
        ),
        "opening_direction": frozenset(
            {"left", "right", "inward", "outward", "sliding"}
        ),
        "opening_mechanism": frozenset(
            {"fixed", "turn", "tilt", "tilt_turn", "sliding"}
        ),
    },
    "flyscreen": {
        "screen_type": frozenset(
            {"fixed", "hinged", "sliding", "roller", "pleated"}
        ),
    },
    "guillotine_glass": {
        "panel_count": frozenset({"2", "3", "4"}),
    },
    "facade_cladding": {
        "panel_orientation": frozenset({"horizontal", "vertical", "mixed"}),
    },
    "balcony_enclosure": {
        "system_type": frozenset(
            {"sliding", "folding", "guillotine", "pvc_joinery"}
        ),
    },
}


def _assert_supported_visual_option(field: CatalogField, value: str) -> None:
    supported = VISUAL_BEHAVIOR_OPTION_VALUES.get(field.product_key, {}).get(
        field.key
    )
    if supported is not None and value not in supported:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=(
                "This option value is not supported by the current visual "
                "renderer."
            ),
        )


def _material_group(session: Session, product_key: str) -> str:
    material = session.get(CatalogProductMaterial, product_key)
    return material.material_group if material is not None else "pvc"


def _product_admin(session: Session, model: CatalogProduct) -> CatalogProductAdmin:
    return CatalogProductAdmin(
        **model.model_dump(),
        material_group=_material_group(session, model.key),
    )


def _field_admin(model: CatalogField) -> CatalogFieldAdmin:
    return CatalogFieldAdmin.model_validate(model, from_attributes=True)


def _apply_field_update(model: CatalogField, payload: CatalogFieldUpdate) -> None:
    """Apply a patch while keeping numeric metadata internally consistent."""

    next_type = payload.field_type if "field_type" in payload.model_fields_set else model.field_type
    if next_type != "number":
        for field_name in payload.model_fields_set:
            setattr(model, field_name, getattr(payload, field_name))
        model.unit = ""
        model.min_value = None
        model.max_value = None
        model.step = None
        return

    candidate = {
        name: getattr(payload, name) if name in payload.model_fields_set else getattr(model, name)
        for name in ("unit", "min_value", "max_value", "step")
    }
    if any(candidate[name] is None for name in ("min_value", "max_value", "step")):
        raise HTTPException(
            status_code=422,
            detail="Number fields require min_value, max_value and step.",
        )
    if candidate["min_value"] > candidate["max_value"]:
        raise HTTPException(status_code=422, detail="min_value cannot exceed max_value.")
    for field_name in payload.model_fields_set:
        setattr(model, field_name, getattr(payload, field_name))


def _detail_values(
    detail: CatalogOptionDetail | None,
) -> tuple[str, list[str], list[str]]:
    if detail is None:
        return "", [], []
    return (
        detail.description,
        [item for item in detail.features_text.splitlines() if item],
        [item for item in detail.section_images_text.splitlines() if item],
    )


def _option_admin(
    model: CatalogOption,
    detail: CatalogOptionDetail | None = None,
    profile_spec: CatalogOptionProfileSpec | None = None,
    visual: CatalogOptionVisual | None = None,
) -> CatalogOptionAdmin:
    description, features, section_image_urls = _detail_values(detail)
    return CatalogOptionAdmin(
        id=model.id,
        field_id=model.field_id,
        value=model.value,
        label=model.label,
        description=description,
        features=features,
        visual_icon_url=visual.icon_url if visual is not None else None,
        section_image_urls=section_image_urls,
        profile_spec=(
            ProfileSpec.model_validate(profile_spec, from_attributes=True)
            if profile_spec is not None
            else None
        ),
        active=model.active,
        sort_order=model.sort_order,
    )


def _details_by_option(
    session: Session,
    option_ids: list[int],
) -> dict[int, CatalogOptionDetail]:
    if not option_ids:
        return {}
    details = session.exec(
        select(CatalogOptionDetail).where(
            CatalogOptionDetail.option_id.in_(option_ids)
        )
    ).all()
    return {detail.option_id: detail for detail in details}


def _profile_specs_by_option(
    session: Session,
    option_ids: list[int],
) -> dict[int, CatalogOptionProfileSpec]:
    if not option_ids:
        return {}
    profile_specs = session.exec(
        select(CatalogOptionProfileSpec).where(
            CatalogOptionProfileSpec.option_id.in_(option_ids)
        )
    ).all()
    return {profile_spec.option_id: profile_spec for profile_spec in profile_specs}


def _visuals_by_option(
    session: Session,
    option_ids: list[int],
) -> dict[int, CatalogOptionVisual]:
    if not option_ids:
        return {}
    visuals = session.exec(
        select(CatalogOptionVisual).where(CatalogOptionVisual.option_id.in_(option_ids))
    ).all()
    return {visual.option_id: visual for visual in visuals}


def _write_option_visual(
    session: Session,
    option_id: int,
    icon_url: str,
) -> CatalogOptionVisual:
    visual = session.get(CatalogOptionVisual, option_id)
    if visual is None:
        visual = CatalogOptionVisual(option_id=option_id, icon_url=icon_url)
    else:
        visual.icon_url = icon_url
    session.add(visual)
    return visual


def _write_option_detail(
    session: Session,
    option_id: int,
    *,
    description: str,
    features: list[str],
    section_image_urls: list[str],
) -> CatalogOptionDetail:
    detail = session.get(CatalogOptionDetail, option_id)
    if detail is None:
        detail = CatalogOptionDetail(option_id=option_id)
    detail.description = description
    detail.features_text = "\n".join(features)
    detail.section_images_text = "\n".join(section_image_urls)
    session.add(detail)
    return detail


def _write_option_profile_spec(
    session: Session,
    option_id: int,
    profile_spec: ProfileSpec,
) -> CatalogOptionProfileSpec:
    model = session.get(CatalogOptionProfileSpec, option_id)
    if model is None:
        model = CatalogOptionProfileSpec(option_id=option_id, **profile_spec.model_dump())
    else:
        for field_name, value in profile_spec.model_dump().items():
            setattr(model, field_name, value)
    session.add(model)
    return model


def _assert_product_publishable(session: Session, product_key: str) -> None:
    product = session.get(CatalogProduct, product_key)
    if product is None or not product.active:
        return
    missing = required_select_fields_without_options(session, product_key)
    if missing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "Every active required select field needs at least one active "
                "option before it can be published."
            ),
        )


def _public_catalog(session: Session) -> PublicCatalogResponse:
    products = session.exec(
        select(CatalogProduct)
        .where(CatalogProduct.active == True)  # noqa: E712
        .order_by(CatalogProduct.sort_order, CatalogProduct.key)
    ).all()
    products = [
        product
        for product in products
        if not required_select_fields_without_options(session, product.key)
    ]
    product_keys = [product.key for product in products]
    materials = (
        session.exec(
            select(CatalogProductMaterial).where(
                CatalogProductMaterial.product_key.in_(product_keys)
            )
        ).all()
        if product_keys
        else []
    )
    materials_by_product = {
        material.product_key: material.material_group for material in materials
    }
    fields = (
        session.exec(
            select(CatalogField)
            .where(
                CatalogField.product_key.in_(product_keys),
                CatalogField.active == True,  # noqa: E712
            )
            .order_by(
                CatalogField.product_key,
                CatalogField.sort_order,
                CatalogField.id,
            )
        ).all()
        if product_keys
        else []
    )
    field_ids = [field.id for field in fields]
    options = (
        session.exec(
            select(CatalogOption)
            .where(
                CatalogOption.field_id.in_(field_ids),
                CatalogOption.active == True,  # noqa: E712
            )
            .order_by(
                CatalogOption.field_id,
                CatalogOption.sort_order,
                CatalogOption.id,
            )
        ).all()
        if field_ids
        else []
    )

    options_by_field: dict[int, list[CatalogOptionPublic]] = {}
    option_details = _details_by_option(
        session,
        [option.id for option in options if option.id is not None],
    )
    option_profile_specs = _profile_specs_by_option(
        session,
        [option.id for option in options if option.id is not None],
    )
    option_visuals = _visuals_by_option(
        session,
        [option.id for option in options if option.id is not None],
    )
    for option in options:
        description, features, section_image_urls = _detail_values(
            option_details.get(option.id)
        )
        options_by_field.setdefault(option.field_id, []).append(
            CatalogOptionPublic(
                id=option.id,
                value=option.value,
                label=option.label,
                description=description,
                features=features,
                visual_icon_url=(
                    option_visuals[option.id].icon_url
                    if option.id in option_visuals
                    else None
                ),
                section_image_urls=section_image_urls,
                profile_spec=(
                    ProfileSpec.model_validate(
                        option_profile_specs[option.id],
                        from_attributes=True,
                    )
                    if option.id in option_profile_specs
                    else None
                ),
                sort_order=option.sort_order,
            )
        )

    fields_by_product: dict[str, list[CatalogFieldPublic]] = {}
    for field in fields:
        fields_by_product.setdefault(field.product_key, []).append(
            CatalogFieldPublic(
                id=field.id,
                key=field.key,
                label=field.label,
                help_text=field.help_text,
                placeholder=field.placeholder,
                field_type=field.field_type,
                unit=field.unit,
                min_value=field.min_value,
                max_value=field.max_value,
                step=field.step,
                required=field.required,
                sort_order=field.sort_order,
                options=(
                    options_by_field.get(field.id, [])
                    if field.field_type == "select"
                    else []
                ),
            )
        )

    return PublicCatalogResponse(
        products=[
            CatalogProductPublic(
                key=product.key,
                material_group=materials_by_product.get(product.key, "pvc"),
                name=product.name,
                description=product.description,
                mark=product.mark,
                sort_order=product.sort_order,
                measurement=CatalogMeasurementPublic(
                    variant=product.measurement_variant,
                    width_instruction=product.width_instruction,
                    height_instruction=product.height_instruction,
                    short_width_label=product.short_width_label,
                    short_height_label=product.short_height_label,
                ),
                fields=fields_by_product.get(product.key, []),
            )
            for product in products
        ]
    )


def build_catalog_router(*, settings: Settings, engine: Engine) -> APIRouter:
    router = APIRouter(prefix="/api/v1")
    require_admin = build_admin_dependency(settings)

    def get_session():
        with Session(engine) as session:
            yield session

    @router.get(
        "/catalog",
        response_model=PublicCatalogResponse,
        tags=["public catalog"],
    )
    def get_public_catalog(
        session: Session = Depends(get_session),
    ) -> PublicCatalogResponse:
        return _public_catalog(session)

    @router.get(
        "/admin/catalog/products",
        response_model=list[CatalogProductAdmin],
        tags=["admin catalog"],
    )
    def list_products(
        _: Annotated[AdminPrincipal, Depends(require_admin)],
        session: Session = Depends(get_session),
    ) -> list[CatalogProductAdmin]:
        models = session.exec(
            select(CatalogProduct).order_by(
                CatalogProduct.sort_order,
                CatalogProduct.key,
            )
        ).all()
        return [_product_admin(session, model) for model in models]

    @router.post(
        "/admin/catalog/products",
        response_model=CatalogProductAdmin,
        status_code=status.HTTP_201_CREATED,
        tags=["admin catalog"],
    )
    def create_product(
        payload: CatalogProductCreate,
        _: Annotated[AdminPrincipal, Depends(require_admin)],
        session: Session = Depends(get_session),
    ) -> CatalogProductAdmin:
        if session.get(CatalogProduct, payload.key) is not None:
            raise HTTPException(status_code=409, detail="Product key already exists.")
        if payload.active:
            raise HTTPException(
                status_code=409,
                detail="New products must be saved as drafts before publishing.",
            )
        model = CatalogProduct(**payload.model_dump(exclude={"material_group"}))
        session.add(model)
        session.add(
            CatalogProductMaterial(
                product_key=payload.key,
                material_group=payload.material_group,
            )
        )
        session.commit()
        session.refresh(model)
        return _product_admin(session, model)

    @router.patch(
        "/admin/catalog/products/{product_key}",
        response_model=CatalogProductAdmin,
        tags=["admin catalog"],
    )
    def update_product(
        product_key: str,
        payload: CatalogProductUpdate,
        _: Annotated[AdminPrincipal, Depends(require_admin)],
        session: Session = Depends(get_session),
    ) -> CatalogProductAdmin:
        model = session.get(CatalogProduct, product_key)
        if model is None:
            raise HTTPException(status_code=404, detail="Catalog product not found.")
        for field_name in payload.model_fields_set:
            if field_name == "material_group":
                material = session.get(CatalogProductMaterial, product_key)
                if material is None:
                    material = CatalogProductMaterial(product_key=product_key)
                material.material_group = payload.material_group or "pvc"
                session.add(material)
            else:
                setattr(model, field_name, getattr(payload, field_name))
        session.add(model)
        session.flush()
        _assert_product_publishable(session, product_key)
        session.commit()
        session.refresh(model)
        return _product_admin(session, model)

    @router.delete(
        "/admin/catalog/products/{product_key}",
        status_code=status.HTTP_204_NO_CONTENT,
        tags=["admin catalog"],
    )
    def deactivate_product(
        product_key: str,
        _: Annotated[AdminPrincipal, Depends(require_admin)],
        session: Session = Depends(get_session),
    ) -> Response:
        model = session.get(CatalogProduct, product_key)
        if model is None:
            raise HTTPException(status_code=404, detail="Catalog product not found.")
        if model.active:
            model.active = False
            session.add(model)
            session.commit()
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    @router.get(
        "/admin/catalog/products/{product_key}/fields",
        response_model=list[CatalogFieldAdmin],
        tags=["admin catalog"],
    )
    def list_fields(
        product_key: str,
        _: Annotated[AdminPrincipal, Depends(require_admin)],
        session: Session = Depends(get_session),
    ) -> list[CatalogFieldAdmin]:
        if session.get(CatalogProduct, product_key) is None:
            raise HTTPException(status_code=404, detail="Catalog product not found.")
        models = session.exec(
            select(CatalogField)
            .where(CatalogField.product_key == product_key)
            .order_by(CatalogField.sort_order, CatalogField.id)
        ).all()
        return [_field_admin(model) for model in models]

    @router.post(
        "/admin/catalog/products/{product_key}/fields",
        response_model=CatalogFieldAdmin,
        status_code=status.HTTP_201_CREATED,
        tags=["admin catalog"],
    )
    def create_field(
        product_key: str,
        payload: CatalogFieldCreate,
        _: Annotated[AdminPrincipal, Depends(require_admin)],
        session: Session = Depends(get_session),
    ) -> CatalogFieldAdmin:
        if session.get(CatalogProduct, product_key) is None:
            raise HTTPException(status_code=404, detail="Catalog product not found.")
        if payload.key in RESERVED_DYNAMIC_FIELD_KEYS:
            raise HTTPException(
                status_code=422,
                detail="This field key is reserved by the core request form.",
            )
        if payload.key == "profile_series" and payload.field_type != "select":
            raise HTTPException(
                status_code=422,
                detail="The profile_series field must use the select type.",
            )
        fields = session.exec(
            select(CatalogField).where(CatalogField.product_key == product_key)
        ).all()
        if len(fields) >= MAX_FIELDS_PER_PRODUCT:
            raise HTTPException(status_code=409, detail="Product field limit reached.")
        if any(field.key == payload.key for field in fields):
            raise HTTPException(status_code=409, detail="Field key already exists.")
        model = CatalogField(product_key=product_key, **payload.model_dump())
        session.add(model)
        session.flush()
        _assert_product_publishable(session, product_key)
        session.commit()
        session.refresh(model)
        return _field_admin(model)

    @router.patch(
        "/admin/catalog/fields/{field_id}",
        response_model=CatalogFieldAdmin,
        tags=["admin catalog"],
    )
    def update_field(
        field_id: int,
        payload: CatalogFieldUpdate,
        _: Annotated[AdminPrincipal, Depends(require_admin)],
        session: Session = Depends(get_session),
    ) -> CatalogFieldAdmin:
        model = session.get(CatalogField, field_id)
        if model is None:
            raise HTTPException(status_code=404, detail="Catalog field not found.")
        if (
            model.key == "profile_series"
            and "field_type" in payload.model_fields_set
            and payload.field_type != "select"
        ):
            raise HTTPException(
                status_code=422,
                detail="The profile_series field must use the select type.",
            )
        _apply_field_update(model, payload)
        session.add(model)
        session.flush()
        _assert_product_publishable(session, model.product_key)
        session.commit()
        session.refresh(model)
        return _field_admin(model)

    @router.delete(
        "/admin/catalog/fields/{field_id}",
        status_code=status.HTTP_204_NO_CONTENT,
        tags=["admin catalog"],
    )
    def deactivate_field(
        field_id: int,
        _: Annotated[AdminPrincipal, Depends(require_admin)],
        session: Session = Depends(get_session),
    ) -> Response:
        model = session.get(CatalogField, field_id)
        if model is None:
            raise HTTPException(status_code=404, detail="Catalog field not found.")
        if model.active:
            model.active = False
            session.add(model)
            session.flush()
            _assert_product_publishable(session, model.product_key)
            session.commit()
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    @router.get(
        "/admin/catalog/fields/{field_id}/options",
        response_model=list[CatalogOptionAdmin],
        tags=["admin catalog"],
    )
    def list_options(
        field_id: int,
        _: Annotated[AdminPrincipal, Depends(require_admin)],
        session: Session = Depends(get_session),
    ) -> list[CatalogOptionAdmin]:
        if session.get(CatalogField, field_id) is None:
            raise HTTPException(status_code=404, detail="Catalog field not found.")
        models = session.exec(
            select(CatalogOption)
            .where(CatalogOption.field_id == field_id)
            .order_by(CatalogOption.sort_order, CatalogOption.id)
        ).all()
        details = _details_by_option(
            session,
            [model.id for model in models if model.id is not None],
        )
        profile_specs = _profile_specs_by_option(
            session,
            [model.id for model in models if model.id is not None],
        )
        visuals = _visuals_by_option(
            session,
            [model.id for model in models if model.id is not None],
        )
        return [
            _option_admin(
                model,
                details.get(model.id),
                profile_specs.get(model.id),
                visuals.get(model.id),
            )
            for model in models
        ]

    @router.post(
        "/admin/catalog/fields/{field_id}/options",
        response_model=CatalogOptionAdmin,
        status_code=status.HTTP_201_CREATED,
        tags=["admin catalog"],
    )
    def create_option(
        field_id: int,
        payload: CatalogOptionCreate,
        _: Annotated[AdminPrincipal, Depends(require_admin)],
        session: Session = Depends(get_session),
    ) -> CatalogOptionAdmin:
        field = session.get(CatalogField, field_id)
        if field is None:
            raise HTTPException(status_code=404, detail="Catalog field not found.")
        if field.field_type != "select":
            raise HTTPException(
                status_code=409,
                detail="Options can only be added to select fields.",
            )
        _assert_supported_visual_option(field, payload.value)
        options = session.exec(
            select(CatalogOption).where(CatalogOption.field_id == field_id)
        ).all()
        if len(options) >= MAX_OPTIONS_PER_FIELD:
            raise HTTPException(status_code=409, detail="Field option limit reached.")
        if any(option.value == payload.value for option in options):
            raise HTTPException(status_code=409, detail="Option value already exists.")
        payload_data = payload.model_dump()
        detail_data = {
            field_name: payload_data.pop(field_name)
            for field_name in OPTION_DETAIL_FIELDS
        }
        profile_spec_data = payload.profile_spec
        payload_data.pop(OPTION_PROFILE_SPEC_FIELD)
        visual_icon_url = payload_data.pop(OPTION_VISUAL_FIELD)
        model = CatalogOption(field_id=field_id, **payload_data)
        session.add(model)
        session.flush()
        assert model.id is not None
        detail = _write_option_detail(
            session,
            model.id,
            description=detail_data["description"],
            features=detail_data["features"],
            section_image_urls=detail_data["section_image_urls"],
        )
        profile_spec = (
            _write_option_profile_spec(session, model.id, profile_spec_data)
            if profile_spec_data is not None
            else None
        )
        visual = (
            _write_option_visual(session, model.id, visual_icon_url)
            if visual_icon_url is not None
            else None
        )
        _assert_product_publishable(session, field.product_key)
        session.commit()
        session.refresh(model)
        session.refresh(detail)
        if profile_spec is not None:
            session.refresh(profile_spec)
        if visual is not None:
            session.refresh(visual)
        return _option_admin(model, detail, profile_spec, visual)

    @router.patch(
        "/admin/catalog/options/{option_id}",
        response_model=CatalogOptionAdmin,
        tags=["admin catalog"],
    )
    def update_option(
        option_id: int,
        payload: CatalogOptionUpdate,
        _: Annotated[AdminPrincipal, Depends(require_admin)],
        session: Session = Depends(get_session),
    ) -> CatalogOptionAdmin:
        model = session.get(CatalogOption, option_id)
        if model is None:
            raise HTTPException(status_code=404, detail="Catalog option not found.")
        detail = session.get(CatalogOptionDetail, option_id)
        profile_spec = session.get(CatalogOptionProfileSpec, option_id)
        visual = session.get(CatalogOptionVisual, option_id)
        if any(
            field_name in OPTION_DETAIL_FIELDS
            for field_name in payload.model_fields_set
        ):
            current_description, current_features, current_images = _detail_values(
                detail
            )
            detail = _write_option_detail(
                session,
                option_id,
                description=(
                    payload.description
                    if "description" in payload.model_fields_set
                    else current_description
                ),
                features=(
                    payload.features
                    if "features" in payload.model_fields_set
                    else current_features
                ),
                section_image_urls=(
                    payload.section_image_urls
                    if "section_image_urls" in payload.model_fields_set
                    else current_images
                ),
            )
        if OPTION_PROFILE_SPEC_FIELD in payload.model_fields_set:
            if payload.profile_spec is None:
                if profile_spec is not None:
                    session.delete(profile_spec)
                profile_spec = None
            else:
                profile_spec = _write_option_profile_spec(
                    session,
                    option_id,
                    payload.profile_spec,
                )
        if OPTION_VISUAL_FIELD in payload.model_fields_set:
            if payload.visual_icon_url is None:
                if visual is not None:
                    session.delete(visual)
                visual = None
            else:
                visual = _write_option_visual(
                    session,
                    option_id,
                    payload.visual_icon_url,
                )
        for field_name in payload.model_fields_set - OPTION_AUXILIARY_FIELDS:
            setattr(model, field_name, getattr(payload, field_name))
        session.add(model)
        session.flush()
        field = session.get(CatalogField, model.field_id)
        if field is not None:
            _assert_product_publishable(session, field.product_key)
        session.commit()
        session.refresh(model)
        if detail is not None:
            session.refresh(detail)
        if profile_spec is not None:
            session.refresh(profile_spec)
        if visual is not None:
            session.refresh(visual)
        return _option_admin(model, detail, profile_spec, visual)

    @router.delete(
        "/admin/catalog/options/{option_id}",
        status_code=status.HTTP_204_NO_CONTENT,
        tags=["admin catalog"],
    )
    def deactivate_option(
        option_id: int,
        _: Annotated[AdminPrincipal, Depends(require_admin)],
        session: Session = Depends(get_session),
    ) -> Response:
        model = session.get(CatalogOption, option_id)
        if model is None:
            raise HTTPException(status_code=404, detail="Catalog option not found.")
        if model.active:
            model.active = False
            session.add(model)
            session.flush()
            field = session.get(CatalogField, model.field_id)
            if field is not None:
                _assert_product_publishable(session, field.product_key)
            session.commit()
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    return router
