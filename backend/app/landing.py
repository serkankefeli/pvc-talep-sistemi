"""Tenant-scoped, plain-text landing-page CMS. Never fetches arbitrary URLs."""
import os
import secrets
from pathlib import Path
from typing import Annotated, Literal
from urllib.parse import urlsplit

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import FileResponse
from pydantic import EmailStr, Field, field_validator, model_validator
from sqlalchemy.engine import Engine
from sqlmodel import Session, select

from .branding_api import _verified_logo_type
from .config import Settings
from .models import LandingMedia, LandingPage
from .schemas import PlainText, StrictModel
from .security import AdminPrincipal, build_admin_dependency

Short = Annotated[PlainText, Field(max_length=160)]
Text = Annotated[str, Field(max_length=3000)]
SectionKey = Literal["features", "deployment", "process", "gallery", "faq", "contact"]
Target = Literal["/talep-olustur", "/satin-al", "/admin/giris", "#iletisim", "#ozellikler"]


def media_url(value: str) -> str:
    if not value:
        return value
    if value.startswith('/api/v1/landing-media/'):
        token = value.rsplit('/', 1)[-1]
        if len(token) == 40 and all(c in '0123456789abcdef' for c in token):
            return value
    url = urlsplit(value)
    if (url.scheme != 'https' or not url.hostname or url.username or url.password
            or any(c.isspace() or ord(c) < 32 for c in value) or '\\' in value):
        raise ValueError('Görseller yüklenen dosya veya HTTPS adresi olmalıdır.')
    return value


class Card(StrictModel):
    title: Short
    description: Text
    image_url: str = Field(default='', max_length=500)
    image_alt: Short = ''
    _image = field_validator('image_url')(media_url)


class FAQ(StrictModel):
    question: Short
    answer: Text


class Section(StrictModel):
    key: SectionKey
    enabled: bool = True
    title: Short
    description: Text = ''


class LandingInput(StrictModel):
    revision: int = Field(ge=1)
    published: bool = True
    seo_title: Short
    seo_description: Annotated[PlainText, Field(max_length=320)]
    eyebrow: Short
    hero_title: Annotated[PlainText, Field(min_length=3, max_length=200)]
    hero_description: Text
    hero_image_url: str = Field(default='', max_length=500)
    hero_image_alt: Short = ''
    primary_label: Short
    primary_target: Target = '/talep-olustur'
    secondary_label: Short
    secondary_target: Target = '#iletisim'
    purchase_visible: bool = True
    purchase_label: Short = 'Satın al'
    badges: list[Short] = Field(default_factory=list, max_length=8)
    features: list[Card] = Field(default_factory=list, max_length=16)
    deployment: list[Card] = Field(default_factory=list, max_length=8)
    process: list[Card] = Field(default_factory=list, max_length=10)
    gallery: list[Card] = Field(default_factory=list, max_length=16)
    faq: list[FAQ] = Field(default_factory=list, max_length=20)
    sections: list[Section] = Field(max_length=6)
    contact_title: Short
    contact_description: Text
    contact_email: EmailStr | None = None
    contact_phone: str = Field(default='', max_length=40, pattern=r'^[+0-9 ()-]*$')
    contact_address: Text = ''
    closing_title: Short
    closing_description: Text
    closing_label: Short
    closing_target: Target = '/talep-olustur'
    _image = field_validator('hero_image_url')(media_url)

    @model_validator(mode='after')
    def unique_sections(self):
        keys = [section.key for section in self.sections]
        if len(keys) != len(set(keys)):
            raise ValueError('Aynı bölüm birden fazla eklenemez.')
        return self


def default_data() -> dict:
    card = lambda title, description: Card(title=title, description=description)
    return LandingInput(revision=1, seo_title='Doğrama projeleri için görsel talep sistemi',
        seo_description='PVC ve alüminyum doğrama ihtiyaçlarını ölçülendirin, görselleştirin ve tek bir talepte toplayın.',
        eyebrow='PVC + ALÜMİNYUM · GÖRSEL TALEP SİSTEMİ',
        hero_title='Ölçüden görsele. Fikirden projeye.',
        hero_description='Kapı, pencere ve balkon projelerini anlaşılır çizimlere dönüştürün. Ölçüleri ve seçenekleri belirleyin; uzman ekibin değerlendireceği talebinizi oluşturun.',
        primary_label='Çizimi deneyin', secondary_label='Bilgi alın',
        badges=['Ölçüye göre çizim', 'Bir talepte çoklu ürün', 'Uzman değerlendirmesi'],
        features=[card('Projenizi görerek anlatın', 'Girilen ölçüler, kanat düzeni ve ürün seçenekleri çizime yansır.'),
            card('PVC ve alüminyum bir arada', 'Pencere, kapı, sürme, pivot ve katlanır sistemleri ihtiyaçlarınıza göre seçin.'),
            card('Tek bir proje dosyası', 'Birden fazla ürün çizimini aynı talepte toplayın; ekibinizle daha anlaşılır iletişim kurun.'),
            card('Kontrol sizde', 'Ürünler, form seçenekleri, profil bilgileri ve site kimliği yönetim panelinden düzenlenir.')],
        deployment=[card('Firmanıza özel sayfa', 'Firmanızın kendi marka, logo, tanıtım ve talep sayfası olur. Aynı firmadaki kullanıcılar ortak firma alanında çalışır.'),
            card('Web sitenize entegre', 'Talep ekranını mevcut web sitenizden bağlantı ile açabilir veya uygun güvenlik ve alan adı yapılandırmasıyla sitenize gömebilirsiniz. Entegrasyon kurulumu ayrıca planlanır.'),
            card('Bağımsız kullanım', 'Mevcut bir web siteniz olmasa da firmanıza ayrılan bağlantıdan çalışabilirsiniz. Alan adı veya alt alan adı kurulumu hizmet yöneticisiyle planlanır.')],
        process=[card('Ürünü seçin', 'İhtiyacınıza uygun kategori ve modeli belirleyin.'),
            card('Ölçülendirin ve kişiselleştirin', 'Ölçüleri girin; renk, cam, kanat ve açılım tercihlerini çizimde inceleyin.'),
            card('Talebi ekibe iletin', 'İletişim bilgilerinizi bırakın. Ekibiniz teknik uygunluğu değerlendirip sizinle iletişime geçsin.')],
        gallery=[card('Kapı ve pencere', 'Kanat düzeni, açılım yönü ve dolgu seçenekleri.'),
            card('Sürme ve katlanır sistemler', 'Model seçimiyle başlayıp ölçülerle şekillenen ön çizimler.'),
            card('Balkon ve özel açıklıklar', 'Birden fazla cepheyi birlikte değerlendiren görsel talepler.')],
        faq=[FAQ(question='Sistem otomatik fiyat verir mi?', answer='Hayır. Talep yönetim paneline iletilir. Teknik değerlendirme ve teklif ekip tarafından hazırlanır.'),
            FAQ(question='Çizim kesin imalat projesi midir?', answer='Hayır. Çizim ön değerlendirme içindir. Kesin ölçü ve teknik uygunluk uzman kontrolüyle belirlenir.'),
            FAQ(question='Aynı talebe birden fazla ürün ekleyebilir miyim?', answer='Evet. Birden fazla kapı veya pencere çizimini aynı proje talebinde toplayabilirsiniz.')],
        sections=[Section(key=key, title=title) for key, title in (
            ('features', 'Projenin her aşamasında daha anlaşılır iletişim'),
            ('deployment', 'Sizin sayfanız. Sizin çalışma biçiminiz.'),
            ('process', 'Üç adımda görsel talep'), ('gallery', 'Farklı ihtiyaçlar. Tek bir çalışma alanı.'),
            ('faq', 'Merak edilenler'), ('contact', 'Projenizi konuşalım'))],
        contact_title='İhtiyacınızı birlikte şekillendirelim.',
        contact_description='Ürünleri ve çizim akışını deneyin; uygulama ve hizmet hakkında bilgi almak için iletişim bilgilerini kullanın.',
        closing_title='Bir sonraki projeyi daha net anlatın.',
        closing_description='Ölçülerinizi girerek başlayın. Çiziminizi oluşturun, talebinizi ekibe iletin.',
        closing_label='Görsel talep oluştur').model_dump(mode='json', exclude={'revision'})


def seed_landing(session: Session):
    row = session.get(LandingPage, 1)
    if row is None:
        session.add(LandingPage(data=default_data()))
    else:
        # Add the new managed block once; preserve custom copy and deliberate removals.
        defaults = default_data()
        missing = {key: defaults[key] for key in ('purchase_visible', 'purchase_label', 'deployment')
                   if key not in row.data}
        if missing:
            data = {**row.data, **missing}
            if 'deployment' in missing and not any(s['key'] == 'deployment' for s in data['sections']):
                data['sections'] = list(data['sections'])
                data['sections'].insert(1, next(s for s in defaults['sections'] if s['key'] == 'deployment'))
            row.data = data
            row.revision += 1
            session.add(row)


def build_landing_router(*, settings: Settings, engine: Engine) -> APIRouter:
    router = APIRouter(prefix='/api/v1', tags=['landing page'])
    require_admin = build_admin_dependency(settings, engine)

    def require_editor(user: AdminPrincipal = Depends(require_admin)):
        return user

    @router.get('/landing-page')
    def public_page():
        with Session(engine) as session:
            row = session.get(LandingPage, 1)
            if not row.data['published']:
                return {'published': False}
            return {**row.data, 'revision': row.revision}

    @router.get('/admin/landing-page')
    def admin_page(_: AdminPrincipal = Depends(require_editor)):
        with Session(engine) as session:
            row = session.get(LandingPage, 1)
            return {**row.data, 'revision': row.revision}

    @router.put('/admin/landing-page')
    def save(data: LandingInput, _: AdminPrincipal = Depends(require_editor)):
        with Session(engine) as session:
            row = session.exec(select(LandingPage).where(LandingPage.id == 1).with_for_update()).one()
            if row.revision != data.revision:
                raise HTTPException(409, 'Sayfa başka bir oturumda değişti; yeniden yükleyin.')
            for url in [data.hero_image_url, *[card.image_url for card in data.features + data.deployment + data.process + data.gallery]]:
                if url.startswith('/api/v1/landing-media/') and session.get(LandingMedia, url.rsplit('/', 1)[-1]) is None:
                    raise HTTPException(422, 'Yüklenen görsel bu firmada bulunamadı.')
            row.data = data.model_dump(mode='json', exclude={'revision'})
            row.revision += 1
            session.add(row)
            session.commit()
            return {**row.data, 'revision': row.revision}

    @router.post('/admin/landing-media')
    async def upload(request: Request, _: AdminPrincipal = Depends(require_editor)):
        raw = await request.body()
        if not raw:
            raise HTTPException(400, 'Dosya boş olamaz.')
        if len(raw) > settings.max_branding_logo_bytes:
            raise HTTPException(413, 'Görsel boyutu sınırı aşıldı.')
        content_type, extension = _verified_logo_type(raw, request.headers.get('content-type', ''))
        directory = (Path(settings.branding_upload_dir).resolve() / 'landing').resolve()
        directory.mkdir(parents=True, exist_ok=True)
        token = secrets.token_hex(20)
        path = directory / (token + extension)
        temporary = directory / ('.' + token + '.upload')
        try:
            temporary.write_bytes(raw)
            os.replace(temporary, path)
            with Session(engine) as session:
                session.add(LandingMedia(id=token, filename=path.name, content_type=content_type))
                session.commit()
        except Exception:
            path.unlink(missing_ok=True)
            raise
        finally:
            temporary.unlink(missing_ok=True)
        return {'url': '/api/v1/landing-media/' + token}

    @router.get('/landing-media/{token}')
    def image(token: str):
        with Session(engine) as session:
            media = session.get(LandingMedia, token)
            if media is None:
                raise HTTPException(404, 'Görsel bulunamadı.')
            directory = Path(settings.branding_upload_dir).resolve() / 'landing'
            path = (directory / media.filename).resolve()
            if not path.is_relative_to(directory.resolve()) or not path.is_file():
                raise HTTPException(404, 'Görsel bulunamadı.')
            return FileResponse(path, media_type=media.content_type)

    return router
