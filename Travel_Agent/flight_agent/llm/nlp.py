"""LLM layer — OpenAI GPT only (tool-calling flight assistant)."""

from datetime import date
from typing import Any

from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages import SystemMessage
from langchain_openai import ChatOpenAI

from flight_agent.config import Settings, get_settings
from flight_agent.exceptions import FlightAgentError
from flight_agent.llm.booking_requirements import (
    all_travelers_complete,
    passenger_slot_plan,
    traveler_collection_summary,
)
from flight_agent.llm.prompts import AGENT_SYSTEM
from flight_agent.llm.user_copy import next_step_hint
from flight_agent.logging_config import get_logger
from flight_agent.models.agent import SessionContext

logger = get_logger(__name__)


class FlightNLP:
    """LLM for tool-calling flight assistance — OpenAI GPT only."""

    def __init__(self, settings: Settings | None = None) -> None:
        self._settings = settings or get_settings()
        self._openai = self._build_openai()
        if not self._openai:
            raise FlightAgentError(
                "No OpenAI LLM configured. Set OPENAI_API_KEY (sk-...) in Travel_Agent/.env."
            )
        logger.info(
            "llm_configured",
            primary="openai",
            openai_model=self._settings.openai_model,
        )

    def _build_openai(self) -> ChatOpenAI | None:
        api_key = self._settings.resolved_openai_api_key
        if not api_key:
            return None
        return ChatOpenAI(
            model=self._settings.openai_model,
            temperature=self._settings.openai_temperature,
            max_retries=self._settings.openai_max_retries,
            api_key=api_key,
        )

    @property
    def raw_llm(self) -> ChatOpenAI:
        """Unbound GPT model (intent classification, etc.)."""
        if not self._openai:
            raise FlightAgentError("OpenAI is not configured.")
        return self._openai

    def bind_tools(self, tools: list) -> BaseChatModel:
        """Return GPT with flight tools bound."""
        if not self._openai:
            raise FlightAgentError("OpenAI is not configured.")
        return self._openai.bind_tools(tools)

    def system_message(
        self,
        session: SessionContext,
        *,
        user_message: str = "",
    ) -> SystemMessage:
        """Build system prompt with session context (LLM reads the user message itself)."""
        session_ctx = {
            "selected_offer_index": session.selected_offer_index,
            "passengers_confirmed": session.passengers_confirmed,
            "verified_offer_id": bool(session.verified_offer_id),
            "prebook_id": bool(session.prebook_id),
            "booking_id": bool(session.booking_id),
            "awaiting_service_preference": session.awaiting_service_preference,
            "service_preference": session.service_preference,
            "search_offers_count": len(session.last_search_results or []),
            "awaiting_booking_confirmation": session.awaiting_booking_confirmation,
            "booking_confirmed": session.booking_confirmed,
            "awaiting_payment_confirmation": session.awaiting_payment_confirmation,
            "payment_confirmed": session.payment_confirmed,
        }
        traveler_summary: dict[str, Any] = {}
        if session.travelers_draft and len(session.travelers_draft) > 1:
            traveler_summary["passenger_count"] = len(session.travelers_draft)
            traveler_summary["current_passenger_index"] = session.current_traveler_index + 1
            traveler_summary["saved"] = [
                f"{d.get('passenger_first_name', '')} {d.get('passenger_last_name', '')}".strip()
                for d in session.travelers_draft
                if d.get("passenger_first_name")
            ]
        else:
            traveler_summary = {
                k: session.traveler_draft.get(k)
                for k in (
                    "passenger_first_name",
                    "passenger_last_name",
                    "contact_email",
                    "contact_phone_number",
                    "passenger_birthday",
                    "passenger_gender",
                    "passenger_document_number",
                )
                if session.traveler_draft.get(k)
            }
        req_summary = {}
        if session.booking_requirements:
            req_summary = {
                "route_type": session.booking_requirements.get("route_type"),
                "document_type": session.booking_requirements.get("document_type"),
            }
        passenger_guide = ""
        if (
            session.verified_offer_id
            and not all_travelers_complete(session)
            and len(passenger_slot_plan(session)) > 1
        ):
            passenger_guide = (
                "\nPASSENGER COLLECTION (ask for missing fields only):\n"
                + traveler_collection_summary(session, self._settings.default_country)
            )
        latest = f"\nLatest user message: {user_message}" if user_message else ""
        content = AGENT_SYSTEM.format(
            today=date.today().isoformat(),
            next_step=next_step_hint(session),
            query_analysis=passenger_guide + latest,
            session_context=session_ctx,
            search_context=session.search_context or "(none yet)",
            booking_requirements=req_summary or "(verify a flight first)",
            traveler_draft=traveler_summary or "(none yet)",
            passengers_confirmed=session.passengers_confirmed,
            service_preference=session.service_preference or "(not asked yet)",
        )
        return SystemMessage(content=content)
