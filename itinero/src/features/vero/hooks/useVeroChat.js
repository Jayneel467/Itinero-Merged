import { useState, useCallback, useRef } from "react";
import { veroService } from "../services/veroService";

/**
 * Hook for Vero AI chat — posts to supervisor POST /api/chat.
 * Supports structured slot_answers from clarification widgets.
 * session_id / session_context are kept in refs so rapid follow-ups
 * always round-trip the same session (avoids welcome-reset races).
 */
export default function useVeroChat() {
  const [messages, setMessages] = useState([]);
  const [isTyping, setIsTyping] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const [sessionContext, setSessionContext] = useState(null);
  const [error, setError] = useState("");
  const historyRef = useRef([]);
  const sessionIdRef = useRef(null);
  const sessionContextRef = useRef(null);

  const sendMessage = useCallback(async (text, options = {}) => {
    const trimmed = (text || "").trim();
    const slotAnswers = options.slotAnswers || null;
    if (!trimmed && !slotAnswers) return;

    const displayText =
      trimmed || (slotAnswers ? formatSlotAnswersLabel(slotAnswers) : "");

    const userMsg = {
      role: "user",
      content: displayText,
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
        message: displayText || "Continue with the details I picked.",
        session_id: sessionIdRef.current || undefined,
        session_context: sessionContextRef.current || undefined,
        history: historyRef.current.slice(0, -1).map((m) => ({
          role: m.role,
          content: m.content,
        })),
        slot_answers: slotAnswers || undefined,
      });

      if (res.session_id) {
        sessionIdRef.current = res.session_id;
        setSessionId(res.session_id);
      }
      if (res.session_context) {
        sessionContextRef.current = res.session_context;
        setSessionContext(res.session_context);
      }

      const assistantMsg = {
        role: "assistant",
        content: res.response || "Sorry — I couldn't reply just now.",
        flights: Array.isArray(res.flights) ? res.flights : null,
        places: Array.isArray(res.places) ? res.places : null,
        ui_prompts: Array.isArray(res.ui_prompts) ? res.ui_prompts : null,
        clarification: res.clarification || null,
        suggestions: Array.isArray(res.suggestions) ? res.suggestions : null,
        meta: {
          architecture_stage: res.architecture_stage,
          route_path: res.route_path,
          mode: res.mode,
          error: res.error || null,
        },
      };

      setMessages((prev) => {
        const next = [...prev, assistantMsg];
        historyRef.current = next.map((m) => ({ role: m.role, content: m.content }));
        return next;
      });
    } catch (err) {
      const msg =
        err?.message ||
        "Vero is taking a break — check that the API is running, then try again.";
      setError(msg);
      setMessages((prev) => {
        const next = [
          ...prev,
          { role: "assistant", content: msg, meta: { mode: "degraded", error: true } },
        ];
        historyRef.current = next.map((m) => ({ role: m.role, content: m.content }));
        return next;
      });
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
    setMessages([]);
    setIsTyping(false);
    setSessionId(null);
    setSessionContext(null);
    sessionIdRef.current = null;
    sessionContextRef.current = null;
    setError("");
    historyRef.current = [];
  }, []);

  return {
    messages,
    isTyping,
    sendMessage,
    submitSlotAnswers,
    clearSession,
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
