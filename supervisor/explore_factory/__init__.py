"""Explore destination factory: Author → Checker → Reverifier → Publisher.

Keeps Explore from freezing as a hand-edited India-heavy JS list.
Statuses: draft → checked → reverified → published | rejected | needs_review
"""

from __future__ import annotations

STATUS_DRAFT = "draft"
STATUS_CHECKED = "checked"
STATUS_REVERIFIED = "reverified"
STATUS_PUBLISHED = "published"
STATUS_REJECTED = "rejected"
STATUS_NEEDS_REVIEW = "needs_review"

KNOWN_CONTINENTS = (
    "india",
    "asia",
    "middle_east",
    "europe",
    "americas",
    "africa",
    "oceania",
)

REQUIRED_DEST_FIELDS = (
    "id",
    "slug",
    "city",
    "country",
    "continent",
    "themes",
    "blurb",
    "markets",
)
