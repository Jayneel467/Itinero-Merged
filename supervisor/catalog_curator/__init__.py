"""Catalog curator - final agent that keeps Explore + Packages updated and healthy.

Loop:
  1. Refresh factories (author → check → reverify → publish) per market
  2. Audit live catalogs (markets, fields, regional sanity)
  3. Verify Explore + Packages page contracts (API shape + SPA routes)

Statuses:
  healthy | degraded | failed
"""

from __future__ import annotations

STATUS_HEALTHY = "healthy"
STATUS_DEGRADED = "degraded"
STATUS_FAILED = "failed"

DEFAULT_MARKETS = ("GLOBAL", "US", "IN", "GB", "AE", "SG", "AU", "JP", "CA", "EU")
