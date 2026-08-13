"""Package factory pipeline: Author → Checker → Reverifier → Publisher.

Solves regional catalog bias by generating market-tagged packages through
gates, instead of shipping one India-heavy JSON forever.

Statuses:
  draft → checked → reverified → published | rejected | needs_review
"""

from __future__ import annotations

STATUS_DRAFT = "draft"
STATUS_CHECKED = "checked"
STATUS_REVERIFIED = "reverified"
STATUS_PUBLISHED = "published"
STATUS_REJECTED = "rejected"
STATUS_NEEDS_REVIEW = "needs_review"

# Markets a package is allowed to show in. "*" = all markets.
KNOWN_MARKETS = ("IN", "US", "GB", "AE", "SG", "AU", "CA", "JP", "GLOBAL")

REQUIRED_TEMPLATE_FIELDS = (
    "id",
    "slug",
    "title",
    "theme",
    "region",
    "destinations",
    "durationDays",
    "durationNights",
    "markets",
)
