"""LLM layer — Groq Qwen primary, Groq Llama + OpenAI fallbacks."""

from datetime import date

from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages import SystemMessage
from langchain_groq import ChatGroq
from langchain_openai import ChatOpenAI

from flight_agent.config import Settings, get_settings
from flight_agent.exceptions import FlightAgentError
from flight_agent.llm.prompts import AGENT_SYSTEM
from flight_agent.llm.query_understanding import QueryHints, format_hints_for_llm
from flight_agent.llm.user_copy import next_step_hint
from flight_agent.logging_config import get_logger
from flight_agent.models.agent import SessionContext

logger = get_logger(__name__)


class FlightNLP:
    """LLM for tool-calling flight assistance — Groq Qwen first, fast Groq/OpenAI fallbacks."""

    def __init__(self, settings: Settings | None = None) -> None:
        self._settings = settings or get_settings()
        self._groq = self._build_groq(self._settings.groq_model)
        self._groq_backup = self._build_groq_backup()
        self._openai = self._build_openai()
        if not self._groq and not self._openai:
            raise FlightAgentError(
                "No LLM configured. Set GROQ_API_KEY (gsk_...) and/or OPENAI_API_KEY (sk-...) in .env."
            )
        self._primary = self._settings.primary_llm_provider
        logger.info(
            "llm_configured",
            primary=self._primary,
            groq_model=self._settings.groq_model,
            groq_fallback=self._settings.groq_fallback_model if self._groq_backup else None,
            openai_model=self._settings.openai_model if self._openai else None,
            fallback=self._settings.llm_fallback,
        )

    def _build_groq(self, model: str) -> ChatGroq | None:
        api_key = self._settings.resolved_groq_api_key
        if not api_key:
            return None
        return ChatGroq(
            model=model,
            temperature=self._settings.groq_temperature,
            max_retries=self._settings.groq_max_retries,
            groq_api_key=api_key,
        )

    def _build_groq_backup(self) -> ChatGroq | None:
        fallback_model = self._settings.groq_fallback_model.strip()
        if not fallback_model or fallback_model == self._settings.groq_model:
            return None
        return self._build_groq(fallback_model)

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

    def _groq_stack(self, tools: list) -> BaseChatModel | None:
        """Groq primary model, then Groq backup model (same API key, immediate failover)."""
        if not self._groq:
            return None
        primary = self._groq.bind_tools(tools)
        if self._groq_backup:
            backup = self._groq_backup.bind_tools(tools)
            logger.debug("llm_groq_stack", primary=self._settings.groq_model, backup=self._settings.groq_fallback_model)
            return primary.with_fallbacks([backup])
        return primary

    def _with_optional_openai(self, model: BaseChatModel, tools: list) -> BaseChatModel:
        if not self._settings.llm_fallback or not self._openai:
            return model
        openai = self._openai.bind_tools(tools)
        logger.debug("llm_openai_fallback", model=self._settings.openai_model)
        return model.with_fallbacks([openai])

    def bind_tools(self, tools: list) -> BaseChatModel:
        """Return LLM with flight tools bound; Groq Qwen first, Groq Llama if Qwen fails, OpenAI last."""
        groq_stack = self._groq_stack(tools)

        if self._primary == "groq" and groq_stack:
            return self._with_optional_openai(groq_stack, tools)

        if self._openai:
            openai = self._openai.bind_tools(tools)
            if self._settings.llm_fallback and groq_stack:
                logger.debug("llm_chain", primary="openai", fallback="groq")
                return openai.with_fallbacks([groq_stack])
            return openai

        if groq_stack:
            return groq_stack

        raise FlightAgentError("No usable LLM provider for tool calling.")

    def system_message(
        self,
        session: SessionContext,
        *,
        user_message: str = "",
        query_hints: QueryHints | None = None,
    ) -> SystemMessage:
        """Build system prompt with session context and user query analysis."""
        session_ctx = session.model_dump(
            exclude={"last_search_results", "traveler_draft", "available_services", "selected_services"},
            exclude_none=True,
        )
        analysis = ""
        if user_message and query_hints:
            analysis = format_hints_for_llm(query_hints, user_message)
        content = AGENT_SYSTEM.format(
            today=date.today().isoformat(),
            next_step=next_step_hint(session),
            query_analysis=analysis,
            session_context=session_ctx,
            search_context=session.search_context or "(none yet)",
            booking_requirements=session.booking_requirements or "(verify a flight first)",
            traveler_draft=session.traveler_draft or "(none yet)",
            passengers_confirmed=session.passengers_confirmed,
            service_preference=session.service_preference or "(not asked yet)",
        )
        return SystemMessage(content=content)
