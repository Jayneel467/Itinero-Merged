"""Phone or email OTP login + account create (2FA). Sessions in Neon."""

from __future__ import annotations

import asyncio
import hashlib
import hmac
import os
import re
import secrets
import traceback
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx

from supervisor.db import configured, connection, normalize_device_id

OTP_TTL_MIN = 10
OTP_COOLDOWN_SEC = 45
OTP_MAX_SEND_15M = 4
OTP_MAX_ATTEMPTS = 5
SESSION_DAYS = 30
PENDING_MIN = 20
_PHONE_RE = re.compile(r"^[6-9]\d{9}$")
_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _auth_secret() -> str:
    return (os.getenv("AUTH_SECRET") or os.getenv("ITINERO_AUTH_SECRET") or "").strip()


def dev_mode() -> bool:
    return (os.getenv("ITINERO_AUTH_DEV") or "").strip().lower() in {"1", "true", "yes"}


def normalize_in_phone(raw: str | None) -> str | None:
    digits = re.sub(r"\D", "", raw or "")
    if digits.startswith("91") and len(digits) == 12:
        digits = digits[2:]
    if digits.startswith("0") and len(digits) == 11:
        digits = digits[1:]
    if not _PHONE_RE.match(digits):
        return None
    return digits


def normalize_email(raw: str | None) -> str | None:
    mail = (raw or "").strip().lower()
    if not mail or len(mail) > 120 or not _EMAIL_RE.match(mail):
        return None
    return mail


def parse_identifier(
    *,
    identifier: str | None = None,
    phone: str | None = None,
    email: str | None = None,
) -> tuple[str | None, str | None]:
    """Return (channel, target) where channel is sms|email."""
    mail = normalize_email(email) if email else None
    if mail:
        return "email", mail
    digits = normalize_in_phone(phone) if phone else None
    if digits:
        return "sms", digits
    text = (identifier or "").strip()
    if not text:
        return None, None
    if "@" in text:
        mail = normalize_email(text)
        return ("email", mail) if mail else (None, None)
    digits = normalize_in_phone(text)
    return ("sms", digits) if digits else (None, None)


def _hash_code(target: str, code: str) -> str:
    secret = _auth_secret() or "itinero-dev-otp"
    return hashlib.sha256(f"{secret}:{target}:{code}".encode()).hexdigest()


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _merge_loyalty(user: dict[str, Any] | None) -> None:
    if not user or not user.get("id"):
        return
    try:
        from supervisor.loyalty_ledger import merge_guest_email

        merge_guest_email(user_id=str(user["id"]), email=user.get("email"))
    except Exception:
        traceback.print_exc()


def _public_user(row: dict[str, Any]) -> dict[str, Any]:
    name = (row.get("name") or "").strip() or None
    phone = row.get("phone")
    out = {
        "id": row.get("id"),
        "name": name or "Itinero member",
        "displayName": name,
        "email": row.get("email") or None,
        "phone": phone,
        "mobileNumber": phone,
        "newsletter": bool(row.get("newsletter", True)),
        "needs_setup": not bool(name),
        "veroFree": True,
    }
    try:
        from supervisor.billing import snapshot_for_user

        out["plan"] = snapshot_for_user(out.get("id"))
    except Exception:
        out["plan"] = {
            "plan": "free",
            "veroFree": True,
            "loyaltyMultiplier": 1.0,
            "status": "inactive",
        }
    return out


def _row_user(row) -> dict[str, Any]:
    return {
        "id": row[0],
        "phone": row[1],
        "email": row[2],
        "name": row[3],
        "newsletter": row[4],
    }


def _fetch_user_by_phone(phone: str) -> dict[str, Any] | None:
    with connection() as conn:
        row = conn.execute(
            "SELECT id, phone, email, name, newsletter FROM users WHERE phone = %s",
            (phone,),
        ).fetchone()
    return _row_user(row) if row else None


def _fetch_user_by_email(email: str) -> dict[str, Any] | None:
    with connection() as conn:
        row = conn.execute(
            "SELECT id, phone, email, name, newsletter FROM users WHERE lower(email) = %s",
            (email.lower(),),
        ).fetchone()
    return _row_user(row) if row else None


def _fetch_user_by_id(user_id: str) -> dict[str, Any] | None:
    with connection() as conn:
        row = conn.execute(
            "SELECT id, phone, email, name, newsletter FROM users WHERE id = %s",
            (user_id,),
        ).fetchone()
    return _row_user(row) if row else None


def _fetch_user_by_target(channel: str, target: str) -> dict[str, Any] | None:
    if channel == "email":
        return _fetch_user_by_email(target)
    return _fetch_user_by_phone(target)


def _link_device(device_id: str | None, user_id: str) -> None:
    did = normalize_device_id(device_id)
    if not did or not user_id:
        return
    with connection() as conn:
        conn.execute(
            """
            INSERT INTO devices (id, user_id, last_seen_at)
            VALUES (%s, %s, now())
            ON CONFLICT (id) DO UPDATE SET user_id = EXCLUDED.user_id, last_seen_at = now()
            """,
            (did, user_id),
        )
        conn.commit()


def _issue_session(user_id: str, device_id: str | None = None) -> str:
    token = "itn_" + secrets.token_urlsafe(32)
    sid = str(uuid.uuid4())
    exp = _now() + timedelta(days=SESSION_DAYS)
    did = normalize_device_id(device_id)
    with connection() as conn:
        conn.execute(
            """
            INSERT INTO auth_sessions (id, user_id, token_hash, device_id, expires_at)
            VALUES (%s, %s, %s, %s, %s)
            """,
            (sid, user_id, _hash_token(token), did, exp),
        )
        conn.commit()
    _link_device(did, user_id)
    try:
        from supervisor.ledger import claim_device_for_user

        claim_device_for_user(did, user_id)
    except Exception:
        traceback.print_exc()
    return token


def user_from_token(token: str | None) -> dict[str, Any] | None:
    raw = (token or "").strip()
    if not raw or not configured():
        return None
    with connection() as conn:
        row = conn.execute(
            """
            SELECT s.user_id
            FROM auth_sessions s
            WHERE s.token_hash = %s AND s.expires_at > now()
            """,
            (_hash_token(raw),),
        ).fetchone()
    if not row:
        return None
    user = _fetch_user_by_id(row[0])
    return _public_user(user) if user else None


def user_from_request(request) -> dict[str, Any] | None:
    auth = (request.headers.get("authorization") or "").strip()
    if auth.lower().startswith("bearer "):
        return user_from_token(auth[7:].strip())
    return None


def revoke_token(token: str | None) -> None:
    raw = (token or "").strip()
    if not raw or not configured():
        return
    with connection() as conn:
        conn.execute("DELETE FROM auth_sessions WHERE token_hash = %s", (_hash_token(raw),))
        conn.commit()


async def _send_sms(phone: str, code: str) -> dict[str, Any]:
    msg91 = (os.getenv("MSG91_AUTHKEY") or "").strip()
    template = (os.getenv("MSG91_TEMPLATE_ID") or "").strip()
    if msg91 and template:
        try:
            async with httpx.AsyncClient(timeout=20.0) as client:
                r = await client.post(
                    "https://control.msg91.com/api/v5/otp",
                    headers={"authkey": msg91, "Content-Type": "application/json"},
                    json={"template_id": template, "mobile": f"91{phone}", "otp": code},
                )
            if r.status_code >= 400:
                return {"ok": False, "message": "Could not send SMS. Try again."}
            return {"ok": True, "channel": "msg91"}
        except Exception:
            traceback.print_exc()
            return {"ok": False, "message": "Could not send SMS. Try again."}

    sid = (os.getenv("TWILIO_ACCOUNT_SID") or "").strip()
    token = (os.getenv("TWILIO_AUTH_TOKEN") or "").strip()
    from_num = (os.getenv("TWILIO_FROM") or "").strip()
    if sid and token and from_num:
        try:
            async with httpx.AsyncClient(timeout=20.0) as client:
                r = await client.post(
                    f"https://api.twilio.com/2010-04-01/Accounts/{sid}/Messages.json",
                    auth=(sid, token),
                    data={
                        "From": from_num,
                        "To": f"+91{phone}",
                        "Body": f"Itinero code: {code}. Valid 10 minutes. Don't share it.",
                    },
                )
            if r.status_code >= 400:
                return {"ok": False, "message": "Could not send SMS. Try again."}
            return {"ok": True, "channel": "twilio"}
        except Exception:
            traceback.print_exc()
            return {"ok": False, "message": "Could not send SMS. Try again."}

    if dev_mode():
        print(f"[itinero-auth] DEV OTP SMS +91{phone}: {code}", flush=True)
        return {"ok": True, "channel": "dev"}
    return {
        "ok": False,
        "message": "SMS is not configured. Set MSG91 or Twilio, or ITINERO_AUTH_DEV=true.",
    }


async def _send_email(to: str, code: str) -> dict[str, Any]:
    from supervisor.email_service import send_otp_email

    return await send_otp_email(to=to, code=code)


def send_otp(
    *,
    identifier: str | None = None,
    phone: str | None = None,
    email: str | None = None,
) -> dict[str, Any]:
    if not configured():
        return {"ok": False, "error": "db_unset", "message": "Database is not ready."}
    if not _auth_secret() and not dev_mode():
        return {"ok": False, "error": "auth_secret", "message": "Auth is not configured."}
    channel, target = parse_identifier(identifier=identifier, phone=phone, email=email)
    if not channel or not target:
        return {
            "ok": False,
            "error": "invalid_identifier",
            "message": "Enter a valid email address.",
        }
    phone_enabled = (os.getenv("ITINERO_AUTH_PHONE") or "").strip().lower() in {"1", "true", "yes"}
    if channel == "sms" and not phone_enabled:
        return {
            "ok": False,
            "error": "phone_disabled",
            "message": "Phone sign-in is not available yet. Use Google or email.",
        }

    with connection() as conn:
        recent = conn.execute(
            """
            SELECT created_at FROM otp_challenges
            WHERE phone = %s AND created_at > now() - interval '15 minutes'
            ORDER BY created_at DESC
            """,
            (target,),
        ).fetchall()
        if len(recent) >= OTP_MAX_SEND_15M:
            return {
                "ok": False,
                "error": "rate_limited",
                "message": "Too many codes. Wait a few minutes and try again.",
            }
        if recent:
            last = recent[0][0]
            if last.tzinfo is None:
                last = last.replace(tzinfo=timezone.utc)
            wait = OTP_COOLDOWN_SEC - int((_now() - last).total_seconds())
            if wait > 0:
                return {
                    "ok": False,
                    "error": "cooldown",
                    "retry_after": wait,
                    "message": f"Wait {wait}s before requesting another code.",
                }

    code = f"{secrets.randbelow(1_000_000):06d}"
    cid = str(uuid.uuid4())
    exp = _now() + timedelta(minutes=OTP_TTL_MIN)
    with connection() as conn:
        conn.execute(
            """
            INSERT INTO otp_challenges (id, phone, channel, code_hash, expires_at)
            VALUES (%s, %s, %s, %s, %s)
            """,
            (cid, target, channel, _hash_code(target, code), exp),
        )
        conn.commit()
    return {
        "ok": True,
        "channel": channel,
        "target": target,
        "phone": target if channel == "sms" else None,
        "email": target if channel == "email" else None,
        "challenge_id": cid,
        "expires_in": OTP_TTL_MIN * 60,
        "code": code,
    }


async def request_otp(
    *,
    identifier: str | None = None,
    phone: str | None = None,
    email: str | None = None,
) -> dict[str, Any]:
    issued = send_otp(identifier=identifier, phone=phone, email=email)
    if not issued.get("ok"):
        return issued
    code = issued.pop("code")
    channel = issued["channel"]
    target = issued["target"]
    delivered = await (_send_email(target, code) if channel == "email" else _send_sms(target, code))
    if not delivered.get("ok"):
        return {
            "ok": False,
            "error": "delivery_failed",
            "message": delivered.get("message") or "Could not send the code.",
        }
    label = target if channel == "email" else f"+91 {target}"
    kind = "email" if channel == "email" else "phone"
    out = {
        "ok": True,
        "channel": channel,
        "target": target,
        "phone": issued.get("phone"),
        "email": issued.get("email"),
        "expires_in": issued["expires_in"],
        "message": f"Code sent to {label}. Valid 10 minutes.",
    }
    # Local/dev: always surface the code so login works without inbox access
    # (SMTP may still deliver when configured).
    if dev_mode():
        out["dev_otp"] = code
        if delivered.get("channel") == "dev":
            out["message"] = f"Local test code for {label}: {code}"
        else:
            out["message"] = f"Code sent to {label}. Local test code: {code}"
    out["kind"] = kind
    return out


def _create_pending(*, phone: str | None = None, email: str | None = None) -> str:
    pid = secrets.token_urlsafe(24)
    exp = _now() + timedelta(minutes=PENDING_MIN)
    with connection() as conn:
        conn.execute(
            "INSERT INTO pending_signups (id, phone, email, expires_at) VALUES (%s, %s, %s, %s)",
            (pid, phone, email, exp),
        )
        conn.commit()
    return pid


def verify_otp(
    *,
    identifier: str | None = None,
    phone: str | None = None,
    email: str | None = None,
    code: str | None = None,
    device_id: str | None = None,
) -> dict[str, Any]:
    if not configured():
        return {"ok": False, "error": "db_unset", "message": "Database is not ready."}
    channel, target = parse_identifier(identifier=identifier, phone=phone, email=email)
    digits = re.sub(r"\D", "", code or "")
    if not channel or not target:
        return {
            "ok": False,
            "error": "invalid_identifier",
            "message": "Enter a valid 10-digit Indian mobile or email.",
        }
    if len(digits) != 6:
        return {"ok": False, "error": "invalid_code", "message": "Enter the 6-digit code."}

    with connection() as conn:
        row = conn.execute(
            """
            SELECT id, code_hash, attempts, expires_at, consumed_at
            FROM otp_challenges
            WHERE phone = %s
            ORDER BY created_at DESC
            LIMIT 1
            """,
            (target,),
        ).fetchone()
        if not row:
            return {"ok": False, "error": "no_challenge", "message": "Request a new code first."}
        cid, code_hash, attempts, expires_at, consumed = row
        if consumed:
            return {"ok": False, "error": "used", "message": "That code was already used. Request a new one."}
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        if expires_at < _now():
            return {"ok": False, "error": "expired", "message": "Code expired. Request a new one."}
        if attempts >= OTP_MAX_ATTEMPTS:
            return {"ok": False, "error": "locked", "message": "Too many tries. Request a new code."}
        if not hmac.compare_digest(code_hash, _hash_code(target, digits)):
            conn.execute(
                "UPDATE otp_challenges SET attempts = attempts + 1 WHERE id = %s",
                (cid,),
            )
            conn.commit()
            left = OTP_MAX_ATTEMPTS - attempts - 1
            return {
                "ok": False,
                "error": "mismatch",
                "message": f"Wrong code. {max(0, left)} tries left.",
            }
        conn.execute(
            "UPDATE otp_challenges SET consumed_at = now(), attempts = attempts + 1 WHERE id = %s",
            (cid,),
        )
        conn.commit()

    user = _fetch_user_by_target(channel, target)
    if user and (user.get("name") or "").strip():
        token = _issue_session(user["id"], device_id)
        pub = _public_user(user)
        _merge_loyalty(user)
        return {
            "ok": True,
            "created": False,
            "needs_setup": False,
            "channel": channel,
            "token": token,
            "user": pub,
            "message": "Signed in.",
        }

    pending = _create_pending(
        phone=target if channel == "sms" else None,
        email=target if channel == "email" else None,
    )
    return {
        "ok": True,
        "created": not bool(user),
        "needs_setup": True,
        "channel": channel,
        "pending_token": pending,
        "user": {
            "phone": target if channel == "sms" else None,
            "mobileNumber": target if channel == "sms" else None,
            "email": target if channel == "email" else None,
            "needs_setup": True,
        },
        "message": "Verified. Finish creating your account.",
    }


def complete_signup(
    pending_token: str,
    *,
    name: str | None = None,
    email: str | None = None,
    phone: str | None = None,
    newsletter: bool = True,
    device_id: str | None = None,
) -> dict[str, Any]:
    if not configured():
        return {"ok": False, "error": "db_unset", "message": "Database is not ready."}
    pid = (pending_token or "").strip()
    if not pid:
        return {"ok": False, "error": "missing_pending", "message": "Verify OTP again."}
    display = (name or "").strip()[:80]
    extra_mail = normalize_email(email)
    extra_phone = normalize_in_phone(phone)
    if email and not extra_mail:
        return {"ok": False, "error": "invalid_email", "message": "Enter a valid email or leave it blank."}
    if phone and not extra_phone:
        return {"ok": False, "error": "invalid_phone", "message": "Enter a valid 10-digit mobile or leave it blank."}

    with connection() as conn:
        row = conn.execute(
            "SELECT phone, email, expires_at FROM pending_signups WHERE id = %s",
            (pid,),
        ).fetchone()
        if not row:
            return {"ok": False, "error": "invalid_pending", "message": "Session expired. Verify OTP again."}
        pending_phone, pending_email, exp = row
        if exp.tzinfo is None:
            exp = exp.replace(tzinfo=timezone.utc)
        if exp < _now():
            return {"ok": False, "error": "expired_pending", "message": "Session expired. Verify OTP again."}
        conn.execute("DELETE FROM pending_signups WHERE id = %s", (pid,))
        conn.commit()

    final_phone = pending_phone or extra_phone
    final_email = pending_email or extra_mail
    user = _fetch_user_by_phone(final_phone) if final_phone else None
    if not user and final_email:
        user = _fetch_user_by_email(final_email)

    if not user:
        uid = "usr_" + uuid.uuid4().hex[:20]
        with connection() as conn:
            conn.execute(
                """
                INSERT INTO users (id, phone, email, name, newsletter)
                VALUES (%s, %s, %s, %s, %s)
                """,
                (uid, final_phone, final_email, display or None, bool(newsletter)),
            )
            conn.commit()
        user = _fetch_user_by_id(uid)
        created = True
    else:
        with connection() as conn:
            conn.execute(
                """
                UPDATE users
                SET name = COALESCE(NULLIF(%s, ''), name),
                    email = COALESCE(%s, email),
                    phone = COALESCE(%s, phone),
                    newsletter = %s,
                    updated_at = now()
                WHERE id = %s
                """,
                (display, final_email, final_phone, bool(newsletter), user["id"]),
            )
            conn.commit()
        user = _fetch_user_by_id(user["id"])
        created = False

    assert user is not None
    token = _issue_session(user["id"], device_id)
    _merge_loyalty(user)
    # Marketing OS: interest row + signup onboarding drip
    try:
        from supervisor.marketing_workflows import enroll_signup_onboarding
        from supervisor import marketing_store as mstore

        mstore.ensure_user_marketing_row(user["id"])
        if created:
            enroll_signup_onboarding(user["id"], newsletter=bool(user.get("newsletter", True)))
    except Exception:
        pass
    return {
        "ok": True,
        "created": created,
        "token": token,
        "user": _public_user(user),
        "message": "Account created." if created else "You're signed in.",
    }


def update_profile(
    token: str | None,
    *,
    name: str | None = None,
    phone: str | None = None,
    newsletter: bool | None = None,
) -> dict[str, Any]:
    if not configured():
        return {"ok": False, "error": "db_unset", "message": "Database is not ready."}
    user = user_from_token(token)
    if not user:
        return {"ok": False, "error": "unauthorized", "message": "Sign in required."}

    display = None if name is None else (name or "").strip()[:80]
    next_phone = None
    if phone is not None:
        raw = (phone or "").strip()
        if raw:
            next_phone = normalize_in_phone(raw)
            if not next_phone:
                return {
                    "ok": False,
                    "error": "invalid_phone",
                    "message": "Enter a valid 10-digit Indian mobile.",
                }
        else:
            next_phone = ""

    with connection() as conn:
        if next_phone:
            clash = conn.execute(
                "SELECT id FROM users WHERE phone = %s AND id <> %s",
                (next_phone, user["id"]),
            ).fetchone()
            if clash:
                return {
                    "ok": False,
                    "error": "phone_taken",
                    "message": "That mobile is already on another account.",
                }
        sets = []
        args: list[Any] = []
        if display is not None:
            sets.append("name = %s")
            args.append(display or None)
        if phone is not None:
            sets.append("phone = %s")
            args.append(next_phone or None)
        if newsletter is not None:
            sets.append("newsletter = %s")
            args.append(bool(newsletter))
        if not sets:
            return {"ok": True, "user": user, "message": "Nothing to update."}
        sets.append("updated_at = NOW()")
        args.append(user["id"])
        conn.execute(
            f"UPDATE users SET {', '.join(sets)} WHERE id = %s",
            tuple(args),
        )
        conn.commit()

    refreshed = _fetch_user_by_id(user["id"])
    return {
        "ok": True,
        "user": _public_user(refreshed or user),
        "message": "Profile updated.",
    }


def logout(token: str | None) -> dict[str, Any]:
    revoke_token(token)
    return {"ok": True}


def login_with_google(*, id_token_str: str, device_id: str | None = None) -> dict[str, Any]:
    if not configured():
        return {"ok": False, "error": "db_unset", "message": "Database is not ready."}
    client_id = (os.getenv("GOOGLE_OAUTH_CLIENT_ID") or "").strip()
    if not client_id:
        return {
            "ok": False,
            "error": "google_unconfigured",
            "message": "Google sign-in is not configured on the server.",
        }
    raw = (id_token_str or "").strip()
    if not raw:
        return {"ok": False, "error": "missing_token", "message": "Google sign-in failed. Try again."}

    try:
        from google.oauth2 import id_token
        from google.auth.transport import requests as google_requests

        info = id_token.verify_oauth2_token(raw, google_requests.Request(), client_id)
    except Exception:
        traceback.print_exc()
        return {"ok": False, "error": "invalid_token", "message": "Google sign-in failed. Try again."}

    if not info.get("email_verified"):
        return {
            "ok": False,
            "error": "email_unverified",
            "message": "Your Google email is not verified.",
        }

    email = normalize_email(info.get("email"))
    if not email:
        return {
            "ok": False,
            "error": "invalid_email",
            "message": "Could not read your Google email.",
        }

    name = (info.get("name") or "").strip()[:80] or None
    user = _fetch_user_by_email(email)
    created = False

    if not user:
        uid = "usr_" + uuid.uuid4().hex[:20]
        with connection() as conn:
            conn.execute(
                """
                INSERT INTO users (id, phone, email, name, newsletter)
                VALUES (%s, %s, %s, %s, %s)
                """,
                (uid, None, email, name, True),
            )
            conn.commit()
        user = _fetch_user_by_id(uid)
        created = True
    elif name and not (user.get("name") or "").strip():
        with connection() as conn:
            conn.execute(
                "UPDATE users SET name = %s, updated_at = now() WHERE id = %s",
                (name, user["id"]),
            )
            conn.commit()
        user = _fetch_user_by_id(user["id"])

    if not user:
        return {"ok": False, "error": "user_create", "message": "Could not create your account."}

    token = _issue_session(user["id"], device_id)
    pub = _public_user(user)
    _merge_loyalty(user)
    try:
        from supervisor.marketing_workflows import enroll_signup_onboarding
        from supervisor import marketing_store as mstore

        mstore.ensure_user_marketing_row(user["id"])
        if created:
            enroll_signup_onboarding(user["id"], newsletter=True)
    except Exception:
        pass
    return {
        "ok": True,
        "created": created,
        "needs_setup": bool(pub.get("needs_setup")),
        "token": token,
        "user": pub,
        "message": "Signed in with Google.",
    }
