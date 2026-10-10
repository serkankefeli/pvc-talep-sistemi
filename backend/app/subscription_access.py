"""Server-side entitlement gate, including already authenticated sessions."""
from starlette.concurrency import run_in_threadpool
from starlette.responses import JSONResponse
from sqlmodel import Session

from .company import subscription_expired
from .models import CompanyAccount


class SubscriptionAccessMiddleware:
    ALLOWED = {
        ("POST", "/api/v1/admin/login"),
        ("GET", "/api/v1/admin/company"),
        ("GET", "/api/v1/admin/session-status"),
        ("GET", "/api/v1/admin/users/me"),
        ("POST", "/api/v1/admin/users/me/password"),
        ("GET", "/api/v1/health"),
        ("GET", "/api/v1/site-branding"),
        ("GET", "/api/v1/site-logo"),
        ("GET", "/api/v1/landing-page"),
        ("GET", "/api/v1/subscription-offer"),
        ("POST", "/api/v1/subscription-checkout"),
        ("GET", "/api/v1/legal/privacy"),
        ("GET", "/api/v1/legal/refund"),
        ("GET", "/api/v1/legal/distance_sales"),
        ("GET", "/api/v1/admin/billing"),
        ("POST", "/api/v1/admin/checkout-link"),
    }

    def __init__(self, app, *, engine):
        self.app, self.engine = app, engine

    def expired(self):
        with Session(self.engine) as session:
            account = session.get(CompanyAccount, 1)
            return account is not None and subscription_expired(account)

    async def __call__(self, scope, receive, send):
        if scope["type"] == "http" and scope["method"] != "OPTIONS":
            path = scope["path"].rstrip("/")
            public_media = scope['method'] == 'GET' and path.startswith('/api/v1/landing-media/')
            if not public_media and (scope["method"], path) not in self.ALLOWED and await run_in_threadpool(self.expired):
                await JSONResponse({"detail": "SUBSCRIPTION_EXPIRED"}, status_code=403)(scope, receive, send)
                return
        await self.app(scope, receive, send)
