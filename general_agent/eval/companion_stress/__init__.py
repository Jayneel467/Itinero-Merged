"""Vero on-trip companion stress-test (100 prompts)."""

from .metrics import QA_QUESTIONS, fail_hard
from .prompts_100 import BY_BUCKET, all_prompts

__all__ = ["all_prompts", "BY_BUCKET", "QA_QUESTIONS", "fail_hard"]
