"""Company-local screen/action permissions. No permission is trusted from a JWT."""
from __future__ import annotations

import re

PERMISSION_GROUPS = (
    {"key": "requests", "label": "Talep Merkezi", "actions": [
        {"key": "requests.view", "label": "Görüntüle / PDF"},
        {"key": "requests.edit", "label": "Düzenle / revizyon"},
        {"key": "requests.email", "label": "Müşteriye e-posta gönder"},
    ]},
    {"key": "catalog", "label": "Form kataloğu", "actions": [
        {"key": "catalog.view", "label": "Görüntüle"},
        {"key": "catalog.edit", "label": "Ekle / düzenle / yayından kaldır"},
    ]},
    {"key": "branding", "label": "Marka / Logo", "actions": [
        {"key": "branding.view", "label": "Görüntüle"},
        {"key": "branding.edit", "label": "Düzenle / logo yükle"},
    ]},
    {"key": "landing", "label": "Tanıtım sayfası", "actions": [
        {"key": "landing.view", "label": "Görüntüle"},
        {"key": "landing.edit", "label": "Düzenle / yayınla"},
    ]},
    {"key": "company", "label": "Firma / Paket", "actions": [
        {"key": "company.view", "label": "Firma ve kullanım bilgilerini görüntüle"},
    ]},
    {"key": "commerce", "label": "Sözleşmeler / Ödeme ayarları", "actions": [
        {"key": "commerce.view", "label": "Ayarları ve abonelik başvurularını görüntüle"},
        {"key": "commerce.edit", "label": "Fiyat / sözleşme / ödeme ayarlarını düzenle"},
    ]},
    {"key": "billing", "label": "Abonelik ödemesi", "actions": [
        {"key": "billing.view", "label": "Ödeme ekranını görüntüle"},
        {"key": "billing.use", "label": "Ödeme bağlantısı oluştur"},
    ]},
)
PERMISSIONS = frozenset(action["key"] for group in PERMISSION_GROUPS for action in group["actions"])
# Existing staff retain the access they had before the permission migration.
# New API-created staff start with no business permissions unless explicitly assigned.
LEGACY_PERMISSIONS = (
    "requests.view", "requests.edit", "requests.email", "catalog.view", "catalog.edit",
    "branding.view", "branding.edit", "company.view", "billing.view", "billing.use",
)


def normalize_permissions(values: list[str]) -> list[str]:
    unknown = set(values) - PERMISSIONS
    if unknown:
        raise ValueError("Unknown permission")
    result = set(values)
    for permission in tuple(result):
        if permission.endswith((".edit", ".email", ".use")):
            result.add(permission.split(".")[0] + ".view")
    return sorted(result)


def effective_permissions(user) -> tuple[str, ...]:
    if user.is_superuser:
        return tuple(sorted(PERMISSIONS))
    values = user.permissions
    if values is None:
        values = LEGACY_PERMISSIONS
    return tuple(sorted(set(values) & PERMISSIONS))


def required_permission(method: str, path: str) -> str | None:
    """Explicit API allowlist. Unknown protected routes fail closed."""
    path = path.rstrip("/")
    if (method, path) in {
        ("GET", "/api/v1/admin/users/me"),
        ("POST", "/api/v1/admin/users/me/password"),
        ("GET", "/api/v1/admin/session-status"),
    }:
        return None
    if path.startswith("/api/v1/admin/users"):
        return "superuser"
    if path.startswith("/api/v1/admin/catalog/"):
        return "catalog.view" if method == "GET" else "catalog.edit"
    if path == "/api/v1/admin/site-branding" or path.startswith("/api/v1/admin/site-branding/"):
        return "branding.view" if method == "GET" else "branding.edit"
    if path in {"/api/v1/admin/landing-page", "/api/v1/admin/landing-media"}:
        return "landing.view" if method == "GET" else "landing.edit"
    if path == "/api/v1/admin/company" and method == "GET":
        return "company.view"
    if path in {"/api/v1/admin/commerce", "/api/v1/admin/subscription-purchases"}:
        return "commerce.view" if method == "GET" else "commerce.edit"
    if path == "/api/v1/admin/billing" and method == "GET":
        return "billing.view"
    if path == "/api/v1/admin/checkout-link" and method == "POST":
        return "billing.use"
    if path == "/api/v1/admin/requests" and method == "GET":
        return "requests.view"
    if re.fullmatch(r"/api/v1/admin/requests/\d+(?:/(?:favorite|revisions|send-email))?", path):
        if path.endswith("/send-email"):
            return "requests.email"
        if method == "GET" or path.endswith("/favorite"):
            return "requests.view"
        return "requests.edit"
    return "superuser"
