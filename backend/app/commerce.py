"""Editable legal notices and a verified-host payment handoff; no card handling."""
from decimal import Decimal
from typing import Literal
from urllib.parse import urlsplit
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator
from sqlalchemy.engine import Engine
from sqlmodel import Session, select

from .config import Settings
from .models import CommerceSettings, PaymentLinkAcceptance, SubscriptionPurchaseIntent
from .rate_limit import SlidingWindowRateLimiter
from .schemas import PlainText
from .security import AdminPrincipal, build_admin_dependency

DocumentKey = Literal["privacy", "refund", "distance_sales"]
TITLES = {"privacy": "Gizlilik ve Kişisel Verilerin Korunması",
          "refund": "İptal ve İade Koşulları", "distance_sales": "Mesafeli Satış Sözleşmesi"}
DRAFTS = {
    "privacy": "TASLAK — Hukuki inceleme ve satıcı bilgileri tamamlanmadan yayımlamayın.\n\n"
        "Veri sorumlusu: {{satıcı unvanı ve adresi}}\nİletişim: {{e-posta ve telefon}}\n\n"
        "İşlenen veriler: iletişim bilgileri, talep/çizim bilgileri, kullanıcı hesabı ve işlem kayıtları.\n"
        "İşleme amaçları: talepleri değerlendirmek, hizmeti sunmak, hesap güvenliği ve destek.\n"
        "Toplama yöntemi ve hukuki sebepler: {{her veri işleme amacı için açıklayın}}\n"
        "Aktarım yapılan taraflar, amaçları ve varsa yurt dışı aktarım şartları: {{açıklayın}}\n"
        "Saklama süreleri ve silme koşulları: {{açıklayın}}\n"
        "KVKK kapsamındaki haklar ve veri sorumlusuna başvuru yöntemi: {{açıklayın}}\n"
        "Ödeme iyzico sayfasında alınır; bu uygulama kart bilgilerini toplamaz.\n"
        "Çerezler ve zorunlu olmayan çerezlerin tercih yönetimi: {{gerçek kullanıma göre açıklayın}}",
    "refund": "TASLAK — Hukuki inceleme gerektirir.\n\n"
        "Satıcı ve iletişim: {{satıcı bilgileri}}\n"
        "Hizmet: yıllık doğrama talep/çizim yazılımı aboneliği; fiziksel doğrama siparişi değildir.\n"
        "İptal/cayma başvurusu, başvuru kanalı ve süreleri: {{açıklayın}}\n"
        "İade şartları, yöntemi ve süreleri: {{açıklayın}}\n"
        "Tüketici ve ticari müşteri ayrımı, mevzuatın uygulanması: {{hukuki incelemeye göre}}\n"
        "Dijital hizmetin başlaması ve cayma hakkı istisnaları varsa gerekli ayrı bilgilendirme/onay: {{açıklayın}}\n"
        "Abonelik sonunda giriş açık kalır, operasyonel kullanım durur; otomatik tahsilat yapılmaz.\n"
        "Uyuşmazlık ve başvuru yolları: {{açıklayın}}",
    "distance_sales": "TASLAK — Hukuki inceleme gerektirir.\n\n"
        "Satıcı unvanı, adresi, vergi/MERSİS bilgileri ve iletişim: {{satıcı bilgileri}}\n"
        "Alıcı ve fatura bilgileri: {{ödeme sürecindeki bilgilerle eşleştirme yöntemi}}\n"
        "Konu: yıllık doğrama talep/çizim yazılımı aboneliği. Fiziksel ürün satışı değildir.\n"
        "Hizmet kapsamı, paket limitleri ve başlangıç/teslim koşulları: {{açıklayın}}\n"
        "Vergiler dahil toplam bedel, ek masraflar ve ödeme koşulları: {{teklife göre açıklayın}}\n"
        "Ödeme: iyzico Link. Ödeme sonucu doğrulanmadan abonelik aktive edilmez.\n"
        "Süre: bir takvim yılı. Yenileme koşulları: {{açıklayın}}\n"
        "Cayma/iptal, iade, istisnalar ve hizmetin erken başlamasına ilişkin ayrı onaylar: {{açıklayın}}\n"
        "Şikâyet, destek ve uyuşmazlık başvuru yolları: {{açıklayın}}",
}


class Document(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: str = Field(min_length=3, max_length=160)
    body: str = Field(min_length=10, max_length=24000)
    published: bool = False
    reviewed: bool = False


class CommerceInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    revision: int = Field(ge=1)
    seller_name: str = Field(default="", max_length=160)
    seller_address: str = Field(default="", max_length=1000)
    tax_information: str = Field(default="", max_length=200)
    support_email: EmailStr | None = None
    support_phone: str = Field(default="", max_length=40)
    service_description: str = Field(default="Yıllık doğrama talep ve çizim yazılımı aboneliği", max_length=2000)
    total_amount: Decimal | None = Field(default=None, gt=0, max_digits=12, decimal_places=2)
    payment_link: str = Field(default="", max_length=500)
    payment_enabled: bool = False
    public_offer_enabled: bool = False
    documents: dict[DocumentKey, Document]

    @field_validator("payment_link")
    @classmethod
    def trusted_link(cls, value: str) -> str:
        value = value.strip()
        if not value:
            return value
        url = urlsplit(value)
        if (url.scheme != "https" or url.netloc != "iyzi.link" or not url.path.strip("/")
                or url.query or url.fragment or "\\" in value or any(c.isspace() for c in value)):
            raise ValueError("Yalnızca https://iyzi.link/... biçimindeki resmî ödeme linki kabul edilir.")
        return value


def default_data() -> dict:
    return CommerceInput(revision=1, documents={key: Document(title=TITLES[key], body=body)
        for key, body in DRAFTS.items()}).model_dump(mode="json", exclude={"revision"})


def seed_commerce(session: Session) -> None:
    if session.get(CommerceSettings, 1) is None:
        session.add(CommerceSettings(data=default_data()))


def validate_publication(data: CommerceInput) -> None:
    if set(data.documents) != set(TITLES):
        raise HTTPException(422, "Üç sözleşmenin tamamı bulunmalıdır.")
    published = [doc for doc in data.documents.values() if doc.published]
    if published and not all((data.seller_name.strip(), data.seller_address.strip(),
                              data.tax_information.strip(), data.support_email, data.support_phone.strip())):
        raise HTTPException(422, "Yayımlamak için satıcı ve iletişim bilgilerini tamamlayın.")
    for doc in published:
        if not doc.reviewed or "{{" in doc.body or "TASLAK" in doc.body.upper():
            raise HTTPException(422, "Taslak/eksik metin yayımlanamaz. Hukuki kontrolü tamamlayın.")
    if data.payment_enabled and (len(published) != 3 or not data.payment_link
            or data.total_amount is None or not data.service_description.strip()):
        raise HTTPException(422, "Ödeme için yayımlanmış sözleşmeler, hizmet, toplam bedel ve iyzico Link gereklidir.")
    if data.public_offer_enabled and (data.total_amount is None or not data.service_description.strip()):
        raise HTTPException(422, "Ana sayfada yıllık fiyat göstermek için yıllık bedel ve hizmet kapsamı gereklidir.")


class CheckoutInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    revision: int = Field(ge=1)
    accepted: Literal[True]


class PublicCheckoutInput(CheckoutInput):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    idempotency_key: UUID
    full_name: PlainText = Field(min_length=2, max_length=120)
    company_name: PlainText = Field(min_length=2, max_length=160)
    email: EmailStr = Field(max_length=254)
    usage_mode: Literal["integrated", "standalone"]


def build_commerce_router(*, settings: Settings, engine: Engine) -> APIRouter:
    router = APIRouter(prefix="/api/v1", tags=["legal and payment link"])
    require_admin = build_admin_dependency(settings, engine)
    purchase_limiter = SlidingWindowRateLimiter(settings.public_rate_limit_requests,
                                                settings.public_rate_limit_window_seconds)

    @router.get("/subscription-offer")
    def public_offer():
        with Session(engine) as session:
            row = session.get(CommerceSettings, 1)
            if not row.data.get("public_offer_enabled", False):
                return {"available": False}
            data = CommerceInput(revision=row.revision, **row.data)
            validate_publication(data)
            return {"available": True, "revision": row.revision,
                "total_amount": str(data.total_amount), "currency": "TRY", "term_months": 12,
                "payment_enabled": data.payment_enabled, "service_description": data.service_description,
                "seller_name": data.seller_name, "seller_address": data.seller_address,
                "support_email": data.support_email, "support_phone": data.support_phone}

    @router.post("/subscription-checkout")
    def public_checkout(data: PublicCheckoutInput, request: Request):
        peer = request.client.host if request.client else "unknown"
        retry = purchase_limiter.retry_after(peer)
        if retry is not None:
            raise HTTPException(429, "Çok fazla başvuru. Bir süre sonra tekrar deneyin.",
                                headers={"Retry-After": str(retry)})
        with Session(engine) as session:
            row = session.exec(select(CommerceSettings).where(CommerceSettings.id == 1).with_for_update()).one()
            if row.revision != data.revision:
                raise HTTPException(409, "Fiyat veya sözleşmeler değişti; yeniden okuyup onaylayın.")
            config = CommerceInput(revision=row.revision, **row.data)
            validate_publication(config)
            if not config.public_offer_enabled or not config.payment_enabled:
                raise HTTPException(409, "Yeni abonelik ödemesi henüz aktif değil.")
            reference = str(data.idempotency_key)
            existing = session.get(SubscriptionPurchaseIntent, reference)
            if existing is not None:
                if (existing.full_name, existing.company_name, existing.email, existing.usage_mode,
                    existing.settings_revision) != (data.full_name, data.company_name, str(data.email),
                                                    data.usage_mode, data.revision):
                    raise HTTPException(409, "Başvuru bilgileri değişti; sayfayı yenileyip tekrar deneyin.")
            else:
                session.add(SubscriptionPurchaseIntent(id=reference, full_name=data.full_name,
                    company_name=data.company_name, email=str(data.email), usage_mode=data.usage_mode,
                    settings_revision=row.revision, snapshot=row.data))
                session.commit()
            return {"url": config.payment_link, "reference": reference,
                    "payment_state": "pending_verification"}

    @router.get("/admin/subscription-purchases")
    def purchases(user: AdminPrincipal = Depends(require_admin)):
        with Session(engine) as session:
            rows = session.exec(select(SubscriptionPurchaseIntent)
                .order_by(SubscriptionPurchaseIntent.created_at.desc()).limit(100)).all()
            return [{"reference": row.id, "full_name": row.full_name, "company_name": row.company_name,
                "email": row.email, "usage_mode": row.usage_mode, "created_at": row.created_at,
                "total_amount": row.snapshot["total_amount"], "settings_revision": row.settings_revision,
                "payment_state": "pending_verification"} for row in rows]

    @router.get("/legal/{key}")
    def legal(key: DocumentKey):
        with Session(engine) as session:
            row = session.get(CommerceSettings, 1)
            doc = row.data["documents"][key]
            if not doc["published"]:
                raise HTTPException(404, "Bu metin henüz yayımlanmadı.")
            return {"key": key, "title": doc["title"], "body": doc["body"], "revision": row.revision}

    @router.get("/admin/commerce")
    def configuration(user: AdminPrincipal = Depends(require_admin)):
        with Session(engine) as session:
            row = session.get(CommerceSettings, 1)
            return {**row.data, "revision": row.revision}

    @router.put("/admin/commerce")
    def update(data: CommerceInput, user: AdminPrincipal = Depends(require_admin)):
        validate_publication(data)
        with Session(engine) as session:
            row = session.exec(select(CommerceSettings).where(CommerceSettings.id == 1).with_for_update()).one()
            if row.revision != data.revision:
                raise HTTPException(409, "Ayarlar değişti; sayfayı yenileyin.")
            row.data = data.model_dump(mode="json", exclude={"revision"})
            row.revision += 1
            session.add(row)
            session.commit()
            return {**row.data, "revision": row.revision}

    @router.get("/admin/billing")
    def billing(_: AdminPrincipal = Depends(require_admin)):
        with Session(engine) as session:
            row = session.get(CommerceSettings, 1)
            data = row.data
            return {"revision": row.revision, "payment_enabled": data["payment_enabled"],
                "seller_name": data["seller_name"], "seller_address": data["seller_address"],
                "support_email": data["support_email"], "support_phone": data["support_phone"],
                "service_description": data["service_description"], "total_amount": data["total_amount"],
                "currency": "TRY"}

    @router.post("/admin/checkout-link")
    def checkout(data: CheckoutInput, user: AdminPrincipal = Depends(require_admin)):
        with Session(engine) as session:
            row = session.exec(select(CommerceSettings).where(CommerceSettings.id == 1).with_for_update()).one()
            if row.revision != data.revision:
                raise HTTPException(409, "Sözleşmeler veya teklif değişti; yeniden okuyup onaylayın.")
            configuration = CommerceInput(revision=row.revision, **row.data)
            validate_publication(configuration)
            if not configuration.payment_enabled:
                raise HTTPException(409, "Ödeme henüz aktif değil.")
            reference = str(uuid4())
            session.add(PaymentLinkAcceptance(id=reference, admin_user_id=user.id,
                settings_revision=row.revision, snapshot=row.data))
            session.commit()
            return {"url": configuration.payment_link, "reference": reference,
                    "payment_state": "pending_verification"}

    return router
