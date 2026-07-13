"""Domain and provider exceptions for the Flight Agent."""

from typing import Any


class FlightAgentError(Exception):
    """Base exception for all flight agent errors."""

    def __init__(self, message: str, *, details: dict[str, Any] | None = None) -> None:
        super().__init__(message)
        self.message = message
        self.details = details or {}


class LiteAPIError(FlightAgentError):
    """Raised when LiteAPI returns an error response."""

    def __init__(
        self,
        message: str,
        *,
        status_code: int | None = None,
        error_code: int | None = None,
        error_key: str | None = None,
        details: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(message, details=details)
        self.status_code = status_code
        self.error_code = error_code
        self.error_key = error_key


class ValidationError(FlightAgentError):
    """Raised when user input or slot validation fails."""
