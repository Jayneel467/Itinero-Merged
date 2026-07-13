"""Async HTTP client for LiteAPI flight operations (production retries)."""

from __future__ import annotations

import asyncio
import time
from typing import Any

import httpx

from flight_agent.config import Settings, get_settings
from flight_agent.exceptions import LiteAPIError
from flight_agent.logging_config import get_logger
from flight_agent.models.liteapi import (
    AttachServicesRequest,
    CompleteBookingRequest,
    FlightSearchRequest,
    LiteAPIErrorResponse,
    PrebookRequest,
    VerifyOfferRequest,
)

logger = get_logger(__name__)

_SYNC_CLIENTS: dict[str, httpx.Client] = {}

# Safe to retry: GET and search. Complete/cancel use retries=0 by default.
_RETRYABLE_STATUS = frozenset({408, 425, 429, 500, 502, 503, 504})


class LiteAPIProvider:
    """Low-level client for LiteAPI Flights endpoints with backoff retries."""

    def __init__(self, settings: Settings | None = None) -> None:
        self._settings = settings or get_settings()
        self._base_url = self._settings.resolved_liteapi_base_url
        self._api_key = self._settings.resolved_liteapi_api_key
        read_timeout = self._settings.liteapi_timeout_seconds
        self._timeout = httpx.Timeout(read_timeout, connect=5.0, write=10.0, pool=3.0)
        self._max_retries = max(0, self._settings.liteapi_max_retries)
        self._client_key = f"{self._base_url}|{self._api_key[:12]}"

    def _headers(self) -> dict[str, str]:
        return {
            "X-API-Key": self._api_key,
            "Content-Type": "application/json",
            "Accept": "application/json",
            "Accept-Encoding": "gzip, deflate",
        }

    def _get_client(self) -> httpx.Client:
        client = _SYNC_CLIENTS.get(self._client_key)
        if client is None or client.is_closed:
            client = httpx.Client(
                timeout=self._timeout,
                follow_redirects=True,
                limits=httpx.Limits(max_connections=20, max_keepalive_connections=10),
            )
            _SYNC_CLIENTS[self._client_key] = client
        return client

    async def warm_up(self) -> None:
        if not self._api_key:
            return
        try:
            await self._request("GET", "/data/flights/airports", params={"q": "DEL"})
        except LiteAPIError:
            pass

    async def _request(
        self,
        method: str,
        path: str,
        *,
        json_body: dict[str, Any] | None = None,
        params: dict[str, Any] | None = None,
        retries: int | None = None,
        idempotent: bool = True,
    ) -> dict[str, Any]:
        url = f"{self._base_url}{path}"
        if not self._api_key:
            raise LiteAPIError("LiteAPI API key is not configured")

        max_attempts = (retries if retries is not None else self._max_retries) + 1
        if not idempotent:
            max_attempts = 1

        client = self._get_client()
        last_exc: Exception | None = None

        for attempt in range(max_attempts):
            started = time.perf_counter()
            try:
                response = await asyncio.to_thread(
                    client.request,
                    method,
                    url,
                    headers=self._headers(),
                    json=json_body,
                    params=params,
                )
                elapsed = round(time.perf_counter() * 1000 - started * 1000) / 1000
                logger.info(
                    "liteapi_request",
                    method=method,
                    path=path,
                    status=response.status_code,
                    seconds=elapsed,
                    attempt=attempt + 1,
                )
                if (
                    response.status_code in _RETRYABLE_STATUS
                    and attempt < max_attempts - 1
                    and idempotent
                ):
                    delay = min(2 ** attempt * 0.4, 4.0)
                    logger.warning(
                        "liteapi_retry_status",
                        path=path,
                        status=response.status_code,
                        delay=delay,
                    )
                    await asyncio.sleep(delay)
                    continue
                return self._parse_response(response, path)
            except httpx.TimeoutException as exc:
                last_exc = exc
                logger.warning("liteapi_timeout", path=path, attempt=attempt + 1)
                if attempt < max_attempts - 1 and idempotent:
                    await asyncio.sleep(min(2 ** attempt * 0.4, 4.0))
                    continue
            except httpx.HTTPError as exc:
                last_exc = exc
                if attempt < max_attempts - 1 and idempotent:
                    logger.warning("liteapi_retry", path=path, error=str(exc)[:120])
                    await asyncio.sleep(min(2 ** attempt * 0.4, 4.0))
                    continue
                raise LiteAPIError(
                    f"LiteAPI HTTP error: {exc}",
                    details={"path": path},
                ) from exc

        raise LiteAPIError(
            f"LiteAPI request timed out after {self._timeout.read}s",
            details={"path": path},
        ) from last_exc

    def _parse_response(self, response: httpx.Response, path: str) -> dict[str, Any]:
        body: dict[str, Any] = {}
        if response.content:
            try:
                parsed = response.json()
                if isinstance(parsed, dict):
                    body = parsed
            except ValueError:
                raise LiteAPIError(
                    "LiteAPI returned non-JSON response",
                    status_code=response.status_code,
                    details={"path": path, "text": response.text[:500]},
                )

        if response.is_success:
            return body

        error_detail = None
        try:
            error_detail = LiteAPIErrorResponse.model_validate(body).error
        except Exception:
            pass

        message = (
            error_detail.message
            if error_detail and error_detail.message
            else f"LiteAPI error ({response.status_code})"
        )
        description = error_detail.description if error_detail else response.text[:500]

        logger.warning(
            "liteapi_error",
            path=path,
            status=response.status_code,
            message=message,
            description=(description or "")[:200],
        )

        raise LiteAPIError(
            message,
            status_code=response.status_code,
            error_code=error_detail.code if error_detail else None,
            error_key=error_detail.key if error_detail else None,
            details={"description": description, "path": path, "body": body},
        )

    async def search_flights(self, request: FlightSearchRequest) -> dict[str, Any]:
        payload = request.model_dump(by_alias=True, exclude_none=True)
        return await self._request("POST", "/flights/rates", json_body=payload, idempotent=True)

    async def verify_offer(self, request: VerifyOfferRequest) -> dict[str, Any]:
        payload = request.model_dump(by_alias=True)
        return await self._request("POST", "/flights/verify", json_body=payload, idempotent=True)

    async def prebook(self, request: PrebookRequest) -> dict[str, Any]:
        payload = request.model_dump(by_alias=True, exclude_none=True)
        # Prebook creates a hold — do not auto-retry (could double-hold)
        return await self._request(
            "POST", "/flights/prebooks", json_body=payload, idempotent=False
        )

    async def attach_services(
        self,
        prebook_id: str,
        request: AttachServicesRequest,
    ) -> dict[str, Any]:
        payload = request.model_dump(by_alias=True, exclude_none=True)
        return await self._request(
            "POST",
            f"/flights/prebooks/{prebook_id}/services",
            json_body=payload,
            idempotent=False,
        )

    async def complete_booking(self, request: CompleteBookingRequest) -> dict[str, Any]:
        payload = request.model_dump(by_alias=True, exclude_none=True)
        return await self._request(
            "POST", "/flights/bookings/", json_body=payload, idempotent=False
        )

    async def get_booking(self, booking_id: str) -> dict[str, Any]:
        return await self._request("GET", f"/flights/bookings/{booking_id}", idempotent=True)

    async def list_bookings(
        self,
        *,
        airline_pnr: str | None = None,
        last_name: str | None = None,
    ) -> dict[str, Any]:
        params: dict[str, str] = {}
        if airline_pnr:
            params["airlinePnr"] = airline_pnr
        if last_name:
            params["lastName"] = last_name
        return await self._request("GET", "/flights/bookings", params=params or None, idempotent=True)

    async def cancel_booking(self, booking_id: str) -> dict[str, Any]:
        return await self._request(
            "PUT", f"/flights/bookings/{booking_id}", idempotent=False
        )

    async def search_airports(self, query: str) -> dict[str, Any]:
        return await self._request(
            "GET", "/data/flights/airports", params={"q": query}, idempotent=True
        )

    async def close(self) -> None:
        pass

    @staticmethod
    def close_all() -> None:
        for key, client in list(_SYNC_CLIENTS.items()):
            if not client.is_closed:
                client.close()
            _SYNC_CLIENTS.pop(key, None)
