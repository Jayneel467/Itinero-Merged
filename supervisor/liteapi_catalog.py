"""LiteAPI / Nuitee Connect capability catalog — what we use vs what Lite offers.

Returned by GET /api/integrations/liteapi for ops / launch status.
Status values:
  wired     — live in Itinero app or supervisor
  partial   — code or PBO install exists; incomplete vs full Lite surface
  pbo_only  — configure in connect.nuitee.com; no app UI required
  unused    — available from Lite; not integrated yet (optional)
"""

from __future__ import annotations

import os
from typing import Any


def _webhook_configured() -> bool:
    return bool(
        (os.getenv("LITEAPI_WEBHOOK_SECRET") or os.getenv("LITEAPI_WEBHOOK_TOKEN") or "").strip()
    )


def _wl_payment_key() -> bool:
    return bool(
        (
            os.getenv("LITEAPI_WL_PAYMENT_PRIVATE_KEY")
            or os.getenv("LITEAPI_CMI_PAYMENT_PRIVATE_KEY")
            or ""
        ).strip()
    )


def build_liteapi_catalog(*, loyalty: dict[str, Any] | None = None) -> dict[str, Any]:
    loyalty = loyalty or {}
    loyalty_on = bool(loyalty.get("enabled"))

    return {
        "ok": True,
        "provider": "LiteAPI / Nuitee Connect",
        "docs": "https://docs.liteapi.travel/",
        "pbo": "https://connect.nuitee.com/",
        "summary": {
            "wired": [
                "hotels",
                "flights",
                "packages",
                "paymentSdk",
                "esimply",
                "uberVouchers",
                "reviews",
                "cancel",
                "promoVoucherCode",
                "itineroRewards",
                "webhooks",
            ],
            "partial": [
                "loyaltyLiteApi",
                "flightAncillaries",
                "googleHotelCenter",
                "thirdPartyPayment",
            ],
            "pboOnly": [
                "emails",
                "automations",
                "analytics",
                "apiKeys",
                "apiPlayground",
                "workbench",
            ],
            "unusedOptional": [
                "bookingAmendments",
                "semanticHotelSearch",
                "visualRoomSearch",
                "roomMapping",
                "vouchersApi",
                "externalCheckout",
                "whitelabelSite",
                "uiWidgets",
                "mcpServer",
                "aiChatbotWidget",
                "liteapiPlaces",
            ],
        },
        "capabilities": {
            # ── Core booking APIs ───────────────────────────────────────
            "hotels": {
                "status": "wired",
                "usage": "Search → rates → prebook → book via supervisor hotel_structured + itinero hotel flow.",
                "apis": ["POST /hotels/rates", "POST /rates/prebook", "POST /rates/book", "GET /data/hotels"],
            },
            "flights": {
                "status": "wired",
                "usage": "Search → select → prebook → complete via flight_structured + itinero flight checkout.",
                "apis": ["flights search/prebook/book via Travel_Agent LiteAPI provider"],
            },
            "packages": {
                "status": "wired",
                "usage": "One Itinero Stripe charge for full total; hotel + flights fulfilled on LiteAPI credit after payment.",
            },
            "reviews": {
                "status": "wired",
                "usage": "GET /data/reviews — hotel detail + homepage featured reviews.",
            },
            "cancel": {
                "status": "wired",
                "usage": "Hotel + flight cancel from Trips; LiteAPI refunds Payment SDK / Stripe.",
            },
            "promoVoucherCode": {
                "status": "wired",
                "usage": "Optional voucherCode on hotel/flight prebook (guest-details / booking popup).",
            },
            # ── Payments ────────────────────────────────────────────────
            "paymentSdk": {
                "status": "wired",
                "usage": "LiteAPI Payment SDK (Stripe) for hotel + flight user-payment path.",
            },
            "agencyCredit": {
                "status": "wired",
                "usage": "Package single-payment fulfillment + sandbox mock book via LiteAPI credit line.",
                "note": "Production packages need LiteAPI credit/billing configured in PBO.",
            },
            "thirdPartyPayment": {
                "status": "partial",
                "enabled": _wl_payment_key(),
                "usage": "RSA JWT for payment.method=THIRD_PARTY (whitelabel/CMI merchant-of-record).",
                "env": "LITEAPI_WL_PAYMENT_PRIVATE_KEY",
            },
            "externalCheckout": {
                "status": "unused",
                "usage": "Nuitee redirects guests to your checkout; you confirm booking S2S. Not needed — we use Payment SDK + Itinero Stripe.",
            },
            # ── Add-ons & loyalty ───────────────────────────────────────
            "esimply": {
                "status": "wired",
                "usage": "Hotel guest-details → GET /api/hotels/addons/esim/{CC} → prebook addons[] → confirmation QR.",
            },
            "uberVouchers": {
                "status": "wired",
                "usage": "Hotel guest-details → $10–$100 USD ride credit in prebook addons[].",
            },
            "loyaltyLiteApi": {
                "status": "partial",
                "enabled": loyalty_on,
                "cashbackRate": loyalty.get("cashbackRate"),
                "usage": "GET /loyalties/ cashback rate drives earn estimates. Redeem is Itinero ledger, not LiteAPI native redeem.",
            },
            "itineroRewards": {
                "status": "wired",
                "usage": "Postgres ledger — earn on hotel/package book; redeem on package checkout; /rewards UI.",
                "apis": ["/api/loyalty/*"],
            },
            "vouchersApi": {
                "status": "unused",
                "usage": "LiteAPI Vouchers API to create/manage promo codes. We accept codes at prebook only.",
            },
            # ── Webhooks & lifecycle ────────────────────────────────────
            "webhooks": {
                "status": "wired",
                "enabled": _webhook_configured(),
                "endpoint": "/api/webhooks/liteapi",
                "usage": "booking.book / cancel → loyalty earn/clawback + Itinero SMTP confirm/cancel (deduped). Secret required in production.",
                "env": "LITEAPI_WEBHOOK_SECRET",
            },
            "bookingAmendments": {
                "status": "wired",
                "usage": "POST /api/hotels/bookings/amend — guest name/email (PUT Lite amend) + date quote/confirm (alternative-prebooks). Trips UI.",
            },
            "flightAncillaries": {
                "status": "wired",
                "usage": "attach-services (seats/bags) on BookingPopup and main FlightPaymentPage checkout.",
            },
            # ── Distribution ────────────────────────────────────────────
            "googleHotelCenter": {
                "status": "partial",
                "usage": "Installed in PBO Integrations. Full Google live requires GHC partner feed + pricing XML bridge (Lite docs). Not auto-live from install alone.",
                "docs": "https://docs.liteapi.travel/reference/google-hotel-center-integration",
            },
            # ── Search / AI betas ───────────────────────────────────────
            "semanticHotelSearch": {
                "status": "unused",
                "usage": "Beta GET semantic hotel search — natural language e.g. 'romantic getaway in London'.",
            },
            "visualRoomSearch": {
                "status": "unused",
                "usage": "Beta visual/text room search by style and amenities.",
            },
            "roomMapping": {
                "status": "partial",
                "usage": "roomMapping:true improves room IDs/names (needed for GHC deep links). Used in itinerary agent; not on main supervisor hotel rates.",
            },
            "liteapiPlaces": {
                "status": "unused",
                "usage": "LiteAPI Places for hotel search boundaries. We use Google Places for Vero/landmarks instead.",
            },
            # ── PBO developer tools (no app UI) ─────────────────────────
            "emails": {
                "status": "pbo_only",
                "recommendation": "disable",
                "usage": "Transactional booking confirmation/cancellation. Disable if Itinero SMTP is on (avoid duplicate guest emails).",
            },
            "automations": {
                "status": "pbo_only",
                "usage": "Event-driven workflows (Slack/Teams, wait, LiteAPI tools). Use for ops alerts only — not guest loyalty or checkout.",
            },
            "analytics": {
                "status": "pbo_only",
                "usage": "Reports, Signals, API Performance in connect.nuitee.com.",
            },
            "apiKeys": {
                "status": "pbo_only",
                "usage": "Sandbox vs live keys — map to API_KEY / LITEAPI_KEY in supervisor env.",
            },
            "apiPlayground": {
                "status": "pbo_only",
                "usage": "Interactive API tester in PBO.",
            },
            "workbench": {
                "status": "pbo_only",
                "usage": "PBO developer workbench.",
            },
            "mcpServer": {
                "status": "unused",
                "usage": "https://mcp.liteapi.travel — MCP tools for AI agents. Vero uses custom REST tools instead.",
                "url": "https://mcp.liteapi.travel/api/mcp?apiKey=YOUR_API_KEY",
            },
            "aiChatbotWidget": {
                "status": "unused",
                "usage": "Embeddable LiteAPI booking chatbot. Replaced by Vero.",
            },
            "whitelabelSite": {
                "status": "unused",
                "usage": "Hosted Nuitee white-label OTA. Not used — custom itinero React app.",
            },
            "uiWidgets": {
                "status": "unused",
                "usage": "Embeddable search bar / map / hotels-list widgets for marketing pages.",
            },
        },
        # Keep flat "integrations" for older clients that only read eSimply/Uber/etc.
        "integrations": {
            "esimply": {
                "enabled": True,
                "status": "wired",
                "usage": "Hotel checkout add-on — eSIM plans via GET /api/hotels/addons/esim/{CC}, attached at prebook.",
            },
            "uberVouchers": {
                "enabled": True,
                "status": "wired",
                "usage": "Hotel checkout add-on — $10–$100 USD ride credit bundled in prebook total.",
            },
            "webhooks": {
                "enabled": _webhook_configured(),
                "status": "wired",
                "endpoint": "/api/webhooks/liteapi",
                "usage": "LiteAPI PBO → book/cancel events → loyalty earn backup + cancel clawback.",
            },
            "googleHotelCenter": {
                "enabled": True,
                "status": "partial",
                "usage": "Distribution — PBO install only; GHC feed + pricing bridge still required for Google live rates.",
            },
            "loyalty": {
                "enabled": loyalty_on,
                "status": "wired",
                "cashbackRate": loyalty.get("cashbackRate"),
                "usage": "Earn/redeem Itinero Rewards — see /api/loyalty/* and /rewards.",
            },
            "automations": {
                "enabled": False,
                "status": "pbo_only",
                "usage": "Ops Slack/Teams recipes in PBO — do not duplicate guest emails or loyalty earn.",
            },
            "emails": {
                "enabled": False,
                "status": "pbo_only",
                "recommendation": "disable",
                "usage": "Prefer Itinero SMTP; disable LiteAPI transactional emails to avoid duplicates.",
            },
        },
    }
