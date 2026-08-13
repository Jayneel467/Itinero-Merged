"""Vero trip-planning benchmark: 300 prompts + 20 metrics + 50 killers."""

from .killers_50 import all_killers
from .metrics import METRICS, fail_hard
from .personas import PERSONAS, page_context
from .prompts_300 import BY_BUCKET, all_prompts

__all__ = [
    "METRICS",
    "PERSONAS",
    "BY_BUCKET",
    "all_prompts",
    "all_killers",
    "page_context",
    "fail_hard",
]
