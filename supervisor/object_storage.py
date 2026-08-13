"""Optional Cloudflare R2 (S3-compatible) object storage.

Requires boto3 + env:
  R2_ACCOUNT_ID
  R2_ACCESS_KEY_ID or AWS_ACCESS_KEY_ID
  R2_SECRET_ACCESS_KEY or AWS_SECRET_ACCESS_KEY
  R2_BUCKET
  R2_PUBLIC_BASE_URL  (CDN / public bucket URL prefix)
"""

from __future__ import annotations

import logging
import os
from typing import Any

logger = logging.getLogger(__name__)


def _account_id() -> str:
    return (os.getenv("R2_ACCOUNT_ID") or "").strip()


def _access_key() -> str:
    return (
        os.getenv("R2_ACCESS_KEY_ID")
        or os.getenv("AWS_ACCESS_KEY_ID")
        or ""
    ).strip()


def _secret_key() -> str:
    return (
        os.getenv("R2_SECRET_ACCESS_KEY")
        or os.getenv("AWS_SECRET_ACCESS_KEY")
        or ""
    ).strip()


def _bucket() -> str:
    return (os.getenv("R2_BUCKET") or "").strip()


def _public_base() -> str:
    return (os.getenv("R2_PUBLIC_BASE_URL") or "").strip().rstrip("/")


def enabled() -> bool:
    return bool(_account_id() and _access_key() and _secret_key() and _bucket())


def _client():
    import boto3
    from botocore.config import Config

    account = _account_id()
    endpoint = f"https://{account}.r2.cloudflarestorage.com"
    return boto3.client(
        "s3",
        endpoint_url=endpoint,
        aws_access_key_id=_access_key(),
        aws_secret_access_key=_secret_key(),
        region_name="auto",
        config=Config(signature_version="s3v4"),
    )


def put_bytes(
    key: str,
    data: bytes,
    content_type: str = "application/octet-stream",
) -> dict[str, Any]:
    """Upload bytes to R2. Returns {ok, url?} or {ok: False, error}."""
    key = (key or "").lstrip("/")
    if not key:
        return {"ok": False, "error": "key is required"}
    if not enabled():
        logger.warning("object_storage.put_bytes called but R2 is not configured")
        return {
            "ok": False,
            "error": "R2 not configured (set R2_ACCOUNT_ID, keys, R2_BUCKET)",
        }
    try:
        import boto3  # noqa: F401
    except ImportError:
        return {"ok": False, "error": "boto3 is not installed"}

    try:
        client = _client()
        client.put_object(
            Bucket=_bucket(),
            Key=key,
            Body=data,
            ContentType=content_type or "application/octet-stream",
        )
    except Exception as exc:
        logger.exception("R2 put_object failed for key=%s", key)
        return {"ok": False, "error": str(exc)}

    base = _public_base()
    url = f"{base}/{key}" if base else None
    return {"ok": True, "key": key, "url": url, "bucket": _bucket()}
