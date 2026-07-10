"""
Domain-specific exceptions for the Itinero agent.

Providers (providers/) raise these instead of letting raw `requests`
exceptions leak upward. Services (services/) catch them and turn them into
the friendly, LLM-facing strings tools return. Keeping this boundary
explicit makes it easy to tell "a provider call failed" apart from an
actual bug elsewhere in the code.
"""


class ItineroError(Exception):
    """Base class for all Itinero-specific errors."""


class ConfigurationError(ItineroError):
    """Raised when required configuration (e.g. an API key) is missing."""


class ProviderRequestError(ItineroError):
    """Raised when an external API call (LiteAPI, Google Maps, OpenWeather)
    fails - network error, non-2xx response, timeout, etc."""

    def __init__(self, provider: str, message: str):
        self.provider = provider
        super().__init__(f"{provider} request failed: {message}")
