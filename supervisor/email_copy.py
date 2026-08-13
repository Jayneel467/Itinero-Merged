"""Email copy hygiene — no em dashes / en dashes in guest-facing mail."""

from __future__ import annotations

import re

# Em dash, en dash, figure dash, horizontal bar, HTML entities
_EM_MARKS = re.compile(
    r"(?:\u2014|\u2013|\u2012|\u2015|&mdash;|&#8212;|&ndash;|&#8211;|&#x2014;|&#x2013;)",
    re.IGNORECASE,
)


def scrub_em_marks(text: str | None) -> str:
    """Replace em/en dashes with a plain hyphen so mail never renders '—'."""
    if not text:
        return ""
    # Prefer " - " when the mark sits between words with spaces
    out = re.sub(r"\s*(?:\u2014|\u2013|\u2012|\u2015)\s*", " - ", text)
    out = _EM_MARKS.sub(" - ", out)
    out = re.sub(r" {2,}", " ", out)
    return out
