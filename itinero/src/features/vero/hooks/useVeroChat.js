import { useState, useCallback, useRef, useEffect } from "react";
import { veroService } from "../services/veroService";
import { useBillingOptional } from "@/features/billing/BillingContext";
import { useVeroUiOptional } from "@/context/VeroUiContext";
import { detectSpokenLang } from "../utils/spokenLanguage";
import { useLanguageOptional } from "@/context/LanguageContext";
import { persistPreferredName, travelerAddressPayload } from "../utils/travelerAddress";
import { isBookingAffirmative, isHotelDeclined, isFlightDeclined, isTrainPreferred, isBusPreferred, isCampusGoIntent } from "../utils/pageFilterIntent";
import { extractItineroActions, stripItineroActions } from "../utils/pageContext";
import {
  getThread,
  upsertThread,
  listThreads,
  newThreadId,
  setActiveId,
  hasUserTurn,
  deleteThread,
} from "../utils/chatStore";

/**
 * Hook for Vero AI chat - posts to supervisor POST /api/chat.
 * Supports structured slot_answers from clarification widgets.
 * session_id / session_context are kept in refs so rapid follow-ups
 * always round-trip the same session (avoids welcome-reset races).
 * Threads are saved to localStorage for History - open always starts fresh.
 */
export default function useVeroChat({ onItineroActions } = {}) {
  const billing = useBillingOptional();
  const applyCreditsRef = useRef(billing?.applyCredits);
  applyCreditsRef.current = billing?.applyCredits;
  const veroUi = useVeroUiOptional();
  const pageContextRef = useRef(veroUi?.pageContext || null);
  pageContextRef.current = veroUi?.pageContext || null;
  const langCtx = useLanguageOptional();
  const preferredSpoken = langCtx?.spokenLanguage || "en-IN";
  const onActionsRef = useRef(onItineroActions);
  onActionsRef.current = onItineroActions;
  const [messages, setMessages] = useState([]);
  const [isTyping, setIsTyping] = useState(false);
  const [sessionId, setSessionId] = useState(() => newThreadId());
  const [sessionContext, setSessionContext] = useState(null);
  const [error, setError] = useState("");
  const [savedThreads, setSavedThreads] = useState(() => listThreads());
  const historyRef = useRef([]);
  const sessionIdRef = useRef(sessionId);
  const sessionContextRef = useRef(null);
  const declinedHotelRef = useRef(false);
  const declinedFlightRef = useRef(false);
  const messagesRef = useRef([]);
  messagesRef.current = messages;

  useEffect(() => {
    if (!hasUserTurn(messages)) return;
    const id = sessionIdRef.current || newThreadId();
    if (!sessionIdRef.current) {
      sessionIdRef.current = id;
      setSessionId(id);
    }
    upsertThread({
      id,
      messages,
      sessionId: id,
      sessionContext: sessionContextRef.current,
    });
    setSavedThreads(listThreads());
  }, [messages]);

  const sendMessage = useCallback(async (text, options = {}) => {
    const trimmed = (text || "").trim();
    const slotAnswers = options.slotAnswers || null;
    if (!trimmed && !slotAnswers) return "";

    const lastFull = [...(messagesRef.current || [])].reverse().find((m) => m.role === "assistant");
    const flightItems =
      lastFull?.cards?.type === "flights" && Array.isArray(lastFull.cards.items)
        ? lastFull.cards.items
        : null;
    let outbound = trimmed;
    if (isHotelDeclined(trimmed)) declinedHotelRef.current = true;
    if (isFlightDeclined(trimmed) || isTrainPreferred(trimmed) || isBusPreferred(trimmed)) declinedFlightRef.current = true;
    if (flightItems?.length && isBookingAffirmative(trimmed) && !declinedFlightRef.current) {
      const pick = flightItems[0];
      outbound =
        `I'll take option 1 - ${pick.airline || ""} ${pick.flight_code || ""} (flight_id=${pick.flight_id}). ` +
        `Proceed to BOOK this flight only (scope=flights_only). Do not add a hotel unless I ask.`;
    } else if (isHotelDeclined(trimmed)) {
      outbound = `${trimmed}\n\n[User declined hotels. scope=flights_only. Do not offer or book a hotel.]`;
    } else if (isCampusGoIntent(trimmed)) {
      outbound =
        `${trimmed}\n\n[Campus/city GO. Call search_buses immediately (CATA/Sitilink) and get_route mode=TRANSIT. ` +
        `Do NOT ask walking vs driving vs transit. ` +
        `Patty Pattern / Petty Paterno = Pattee-Paterno Library. IIM Building = IM/Intramural Building. Polok = Pollock.]`;
    } else if (isBusPreferred(trimmed)) {
      outbound =
        `${trimmed}\n\n[User wants BUS, not flights. transport_mode=bus. ` +
        `Call search_buses. Do NOT search_flights or search_trains.]`;
    } else if (isTrainPreferred(trimmed) || (declinedFlightRef.current && isFlightDeclined(trimmed))) {
      outbound =
        `${trimmed}\n\n[User wants TRAIN/bus, not flights. transport_mode=train. ` +
        `Call search_trains. Do NOT search_flights. Ambaji = Abu Road + taxi.]`;
    } else if (isFlightDeclined(trimmed)) {
      outbound = `${trimmed}\n\n[User declined flights. Do not search_flights.]`;
    } else if (declinedFlightRef.current) {
      outbound =
        `${trimmed}\n\n[Still TRAIN only. Keep origin/destination/date. Do not re-ask where to go.]`;
    } else if (declinedHotelRef.current && isBookingAffirmative(trimmed)) {
      outbound = `${trimmed}\n\n[Still flights only - user already refused hotels. scope=flights_only.]`;
    }

    const displayText =
      trimmed || (slotAnswers ? formatSlotAnswersLabel(slotAnswers) : "");

    const stamp = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const userMsg = {
      role: "user",
      content: displayText,
      time: stamp,
      meta: slotAnswers ? { slotAnswers } : undefined,
    };

    setMessages((prev) => {
      const next = [...prev, userMsg];
      historyRef.current = next.map((m) => ({ role: m.role, content: m.content }));
      return next;
    });
    setIsTyping(true);
    setError("");

    try {
      const res = await veroService.chat({
        message: outbound || displayText || "Continue with the details I picked.",
        session_id: sessionIdRef.current || undefined,
        session_context: sessionContextRef.current || undefined,
        page_context: pageContextRef.current || undefined,
        history: historyRef.current.slice(0, -1).map((m) => ({
          role: m.role,
          content: m.content,
        })),
        slot_answers: slotAnswers || undefined,
        voice_mode: Boolean(options.voiceMode),
        spoken_language:
          options.spokenLanguage ||
          detectSpokenLang(displayText, preferredSpoken) ||
          preferredSpoken,
        traveler: travelerAddressPayload(),
      });

      if (res.session_id) {
        sessionIdRef.current = res.session_id;
        setSessionId(res.session_id);
      }
      if (res.session_context) {
        sessionContextRef.current = res.session_context;
        setSessionContext(res.session_context);
      }
      if (typeof res.preferred_name === "string") {
        persistPreferredName(res.preferred_name);
      }
      if (res.credits) applyCreditsRef.current?.(res.credits);

      const rawReply = res.reply || res.response || "Sorry - I couldn't reply just now.";
      const actions = extractItineroActions(rawReply);
      if (actions.length || res.cards) {
        try {
          onActionsRef.current?.(actions, res.cards);
        } catch {
          /* ignore nav errors */
        }
      }
      const assistantMsg = {
        role: "assistant",
        content: stripItineroActions(rawReply) || rawReply,
        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        flights: Array.isArray(res.flights) ? res.flights : null,
        places: Array.isArray(res.places)
          ? res.places
          : (["places", "events"].includes(res.cards?.type) ? res.cards.items : null),
        ui_prompts: Array.isArray(res.ui_prompts) ? res.ui_prompts : null,
        clarification: res.clarification || null,
        suggestions: Array.isArray(res.suggestions) ? res.suggestions : null,
        cards: res.cards || null,
        meta: {
          architecture_stage: res.architecture_stage,
          route_path: res.route_path,
          mode: res.mode,
          error: res.error || null,
        },
      };

      if (res.thread_id) {
        sessionIdRef.current = res.thread_id;
        setSessionId(res.thread_id);
      }

      setMessages((prev) => {
        const next = [...prev, assistantMsg];
        historyRef.current = next.map((m) => ({ role: m.role, content: m.content }));
        return next;
      });
      return assistantMsg.content;
    } catch (err) {
      const msg =
        err?.message ||
        "Vero is taking a break - check that the API is running, then try again.";
      setError(msg);
      setMessages((prev) => {
        const next = [
          ...prev,
          {
            role: "assistant",
            content: msg,
            time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
            meta: { mode: "degraded", error: true },
          },
        ];
        historyRef.current = next.map((m) => ({ role: m.role, content: m.content }));
        return next;
      });
      return msg;
    } finally {
      setIsTyping(false);
    }
  }, []);

  const submitSlotAnswers = useCallback(
    (answers, label) => {
      return sendMessage(label || formatSlotAnswersLabel(answers), {
        slotAnswers: answers,
      });
    },
    [sendMessage]
  );

  const clearSession = useCallback(() => {
    if (hasUserTurn(messages)) {
      upsertThread({
        id: sessionIdRef.current || newThreadId(),
        messages,
        sessionId: sessionIdRef.current,
        sessionContext: sessionContextRef.current,
      });
    }
    const id = newThreadId();
    setMessages([]);
    setIsTyping(false);
    setSessionId(id);
    setSessionContext(null);
    sessionIdRef.current = id;
    sessionContextRef.current = null;
    setError("");
    historyRef.current = [];
    setActiveId(id);
    setSavedThreads(listThreads());
  }, [messages]);

  const loadThread = useCallback((id) => {
    const thread = getThread(id);
    if (!thread) return;
    const msgs = thread.messages || [];
    setMessages(msgs);
    historyRef.current = msgs.map((m) => ({ role: m.role, content: m.content }));
    sessionIdRef.current = thread.sessionId || thread.id;
    sessionContextRef.current = thread.sessionContext || null;
    setSessionId(sessionIdRef.current);
    setSessionContext(thread.sessionContext || null);
    setError("");
    setIsTyping(false);
    setActiveId(thread.id);
  }, []);

  const deleteSavedThread = useCallback((id) => {
    if (!id) return;
    const wasActive = sessionIdRef.current === id;
    deleteThread(id);
    setSavedThreads(listThreads());
    if (!wasActive) return;
    const nextId = newThreadId();
    setMessages([]);
    setIsTyping(false);
    setSessionId(nextId);
    setSessionContext(null);
    sessionIdRef.current = nextId;
    sessionContextRef.current = null;
    setError("");
    historyRef.current = [];
    setActiveId(nextId);
  }, []);

  return {
    messages,
    isTyping,
    sendMessage,
    submitSlotAnswers,
    clearSession,
    loadThread,
    deleteSavedThread,
    savedThreads,
    error,
    sessionId,
  };
}

function formatSlotAnswersLabel(answers) {
  if (!answers || typeof answers !== "object") return "Continue";
  const parts = [];
  if (answers.origin) parts.push(`from ${answers.origin}`);
  if (answers.destination) parts.push(`to ${answers.destination}`);
  if (answers.depart_date) parts.push(`on ${answers.depart_date}`);
  if (answers.adults) parts.push(`${answers.adults} adult${answers.adults > 1 ? "s" : ""}`);
  if (answers.children) parts.push(`${answers.children} child${answers.children > 1 ? "ren" : ""}`);
  if (answers.cabin) parts.push(String(answers.cabin).toLowerCase().replace(/_/g, " "));
  return parts.length ? parts.join(", ") : "Continue with my picks";
}
