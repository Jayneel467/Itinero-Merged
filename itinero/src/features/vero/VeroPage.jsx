import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowUp,
  Building2,
  Briefcase,
  CalendarDays,
  Globe2,
  Menu,
  Mic,
  Plane,
  Plus,
  Share2,
  UserRound,
  X,
} from "lucide-react";
import { PageLayout } from "@/components/layout";
import { AI_BUDDY_IMAGES, NAVBAR_IMAGES } from "@/constants/images";
import useVeroChat from "./hooks/useVeroChat";
import {
  ClarificationOverlay,
  ClarificationWidgets,
  SuggestionChips,
  VeroFlightCards,
  VeroPlaceCards,
  VeroTypingStatus,
} from "./components";
import { suggestFollowUps } from "./utils/suggestFollowUps";
import { needsFlightClarification } from "./utils/statusLines";
import "./VeroPage.css";

const QUICK_ACTIONS = [
  {
    id: "flights",
    title: "Flights",
    subtitle: "Search & Book Flights",
    Icon: Plane,
    action: "seed",
    prompt: "I want to search and book flights",
  },
  {
    id: "hotels",
    title: "Hotels",
    subtitle: "Find & Book Hotels",
    Icon: Building2,
    action: "navigate",
    to: "/hotels",
  },
  {
    id: "trips",
    title: "My Trips",
    subtitle: "View & Manage Your Trip",
    Icon: Briefcase,
    action: "seed",
    prompt: "Help me view and manage my trips",
  },
  {
    id: "explore",
    title: "Explore",
    subtitle: "Discover New Destinations",
    Icon: Globe2,
    action: "navigate",
    to: "/",
  },
];

/**
 * Full-page Vero AI chat — wired to supervisor /api/chat.
 * Sidebar shell + empty-state tiles matching product reference.
 */
export default function VeroPage() {
  const navigate = useNavigate();
  const {
    messages,
    isTyping,
    sendMessage,
    submitSlotAnswers,
    clearSession,
    error,
    sessionId,
  } = useVeroChat();
  const [draft, setDraft] = useState("");
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [dismissedPromptKey, setDismissedPromptKey] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [listening, setListening] = useState(false);
  const [shareHint, setShareHint] = useState("");
  const threadRef = useRef(null);
  const inputRef = useRef(null);
  const bottomRef = useRef(null);
  const recognitionRef = useRef(null);
  const fileInputRef = useRef(null);

  const hasMessages = messages.length > 0;

  const latestPromptMsg = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const m = messages[i];
      if (m.role === "assistant" && Array.isArray(m.ui_prompts) && m.ui_prompts.length) {
        return m;
      }
    }
    return null;
  }, [messages]);

  const latestPromptKey = useMemo(() => {
    if (!latestPromptMsg) return null;
    const types = (latestPromptMsg.ui_prompts || []).map((p) => p.type).join(",");
    return `${messages.indexOf(latestPromptMsg)}:${types}`;
  }, [latestPromptMsg, messages]);

  useEffect(() => {
    if (!latestPromptKey) {
      setOverlayOpen(false);
      return;
    }
    if (latestPromptKey !== dismissedPromptKey) {
      setOverlayOpen(true);
    }
  }, [latestPromptKey, dismissedPromptKey]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, isTyping]);

  useEffect(() => {
    return () => {
      try {
        recognitionRef.current?.stop?.();
      } catch {
        /* ignore */
      }
    };
  }, []);

  function onSubmit(e) {
    e.preventDefault();
    const text = draft;
    setDraft("");
    sendMessage(text);
    inputRef.current?.focus();
  }

  function onWidgetSubmit(answers, label) {
    setOverlayOpen(false);
    setDismissedPromptKey(latestPromptKey);
    submitSlotAnswers(answers, label);
  }

  function closeOverlay() {
    setOverlayOpen(false);
    if (latestPromptKey) setDismissedPromptKey(latestPromptKey);
  }

  function handleNewChat() {
    clearSession();
    setDraft("");
    setDismissedPromptKey(null);
    setOverlayOpen(false);
    setSidebarOpen(false);
    inputRef.current?.focus();
  }

  function handleQuickAction(action) {
    setSidebarOpen(false);
    if (action.action === "navigate" && action.to) {
      navigate(action.to);
      return;
    }
    if (action.prompt) sendMessage(action.prompt);
  }

  async function handleShare() {
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({
          title: "Chat with Vero — Itinero",
          text: "Plan your trip with Vero, Itinero’s AI travel assistant.",
          url,
        });
        return;
      }
      await navigator.clipboard.writeText(url);
      setShareHint("Link copied");
      window.setTimeout(() => setShareHint(""), 2000);
    } catch {
      setShareHint("");
    }
  }

  function handleMic() {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setShareHint("Voice not supported here");
      window.setTimeout(() => setShareHint(""), 2200);
      return;
    }
    if (listening && recognitionRef.current) {
      recognitionRef.current.stop();
      setListening(false);
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = "en-IN";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event) => {
      const transcript = event.results?.[0]?.[0]?.transcript || "";
      if (transcript) {
        setDraft((prev) => (prev ? `${prev.trim()} ${transcript}` : transcript));
        inputRef.current?.focus();
      }
    };
    recognition.onerror = () => setListening(false);
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    setListening(true);
    recognition.start();
  }

  function onAttachFile(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.type.startsWith("text/") || /\.(txt|md|csv)$/i.test(file.name)) {
      const reader = new FileReader();
      reader.onload = () => {
        const text = String(reader.result || "").trim().slice(0, 1200);
        if (text) {
          setDraft((prev) =>
            prev ? `${prev.trim()}\n\n${text}` : `Here are my trip notes:\n${text}`
          );
          inputRef.current?.focus();
        }
      };
      reader.readAsText(file);
      return;
    }
    setDraft((prev) =>
      prev
        ? `${prev.trim()} (attached: ${file.name})`
        : `I have a file ready: ${file.name}. Help me plan with it.`
    );
    inputRef.current?.focus();
  }

  const hasLiveFlights = useMemo(
    () => messages.some((m) => m.role === "assistant" && Array.isArray(m.flights) && m.flights.length > 0),
    [messages]
  );

  // Auto-dismiss slot prompts once live flights arrive (stops orphan reopen chip).
  useEffect(() => {
    if (hasLiveFlights && latestPromptKey) {
      setDismissedPromptKey(latestPromptKey);
      setOverlayOpen(false);
    }
  }, [hasLiveFlights, latestPromptKey]);

  const showReopenPicker =
    Boolean(
      latestPromptMsg &&
        latestPromptKey &&
        !overlayOpen &&
        !isTyping &&
        latestPromptKey !== dismissedPromptKey &&
        !hasLiveFlights
    );

  const latestUserMessage = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      if (messages[i].role === "user") return messages[i].content || "";
    }
    return "";
  }, [messages]);

  /** Clarify vs live-search loading copy — skip airline jokes when only asking for a date. */
  const typingMode = useMemo(() => {
    if (!isTyping) return undefined;
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const m = messages[i];
      if (m.role !== "user") continue;
      if (m.meta?.slotAnswers) return "search";
      if (needsFlightClarification(m.content || "")) return "clarify";
      return undefined;
    }
    return undefined;
  }, [isTyping, messages]);

  const latestAssistantIndex = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      if (messages[i].role === "assistant") return i;
    }
    return -1;
  }, [messages]);

  function followUpsForMessage(msg, index) {
    let userText = "";
    for (let j = index - 1; j >= 0; j -= 1) {
      if (messages[j].role === "user") {
        userText = messages[j].content || "";
        break;
      }
    }
    return suggestFollowUps({
      userText,
      replyText: msg.content || "",
      apiSuggestions: msg.suggestions,
    });
  }

  const mascotSrc = AI_BUDDY_IMAGES.chatAvatar || NAVBAR_IMAGES.veroAvatar;

  return (
    <PageLayout showNavbar={false} showFooter={false} className="vero-shell-main">
      <div className={`vero-shell${sidebarOpen ? " vero-shell--nav-open" : ""}`}>
        {sidebarOpen && (
          <button
            type="button"
            className="vero-shell__scrim"
            aria-label="Close menu"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        <aside className="vero-sidebar" aria-label="Vero navigation">
          <div className="vero-sidebar__brand">
            <img
              src={mascotSrc}
              alt=""
              className="vero-sidebar__avatar"
              width={40}
              height={40}
            />
            <div className="vero-sidebar__brand-text">
              <span className="vero-sidebar__name">Itinero</span>
              <span className="vero-sidebar__tag">AI travel buddy</span>
            </div>
          </div>

          <nav className="vero-sidebar__nav">
            <button
              type="button"
              className="vero-sidebar__item vero-sidebar__item--active"
              onClick={handleNewChat}
            >
              <Plane size={18} strokeWidth={2} aria-hidden />
              <span>New Chat</span>
            </button>
            <button
              type="button"
              className="vero-sidebar__item"
              onClick={() => {
                setSidebarOpen(false);
                sendMessage("Help me view and manage my trips");
              }}
            >
              <Briefcase size={18} strokeWidth={2} aria-hidden />
              <span>My Trips</span>
            </button>
            <Link
              to="/flights"
              className="vero-sidebar__item"
              onClick={() => setSidebarOpen(false)}
            >
              <CalendarDays size={18} strokeWidth={2} aria-hidden />
              <span>Booking</span>
            </Link>
            <button
              type="button"
              className="vero-sidebar__item"
              onClick={() => {
                setSidebarOpen(false);
                sendMessage("Help me set my travel profile and preferences");
              }}
            >
              <UserRound size={18} strokeWidth={2} aria-hidden />
              <span>Profile</span>
            </button>
          </nav>
        </aside>

        <section className="vero-page" aria-labelledby="vero-heading">
          <header className="vero-page__topbar">
            <button
              type="button"
              className="vero-page__icon-btn vero-page__menu-btn"
              aria-label="Open menu"
              aria-expanded={sidebarOpen}
              onClick={() => setSidebarOpen(true)}
            >
              <Menu size={20} strokeWidth={2} />
            </button>

            <div className="vero-page__topbar-actions">
              {shareHint && (
                <span className="vero-page__share-hint" role="status">
                  {shareHint}
                </span>
              )}
              <button
                type="button"
                className="vero-page__icon-btn"
                aria-label="Share Vero chat"
                onClick={handleShare}
              >
                <Share2 size={18} strokeWidth={2} />
              </button>
              <button
                type="button"
                className="vero-page__icon-btn"
                aria-label="Close and go home"
                onClick={() => navigate("/")}
              >
                <X size={18} strokeWidth={2} />
              </button>
            </div>
          </header>

          <div
            className={`vero-page__thread${hasMessages ? "" : " vero-page__thread--empty"}`}
            role="log"
            aria-live="polite"
            aria-relevant="additions"
            ref={threadRef}
          >
            {!hasMessages && (
              <div className="vero-page__empty">
                <img
                  src={mascotSrc}
                  alt=""
                  className="vero-page__hero-avatar"
                  width={88}
                  height={88}
                />
                <h1 id="vero-heading" className="vero-page__hello">
                  Hi! I&apos;m Vero
                </h1>
                <p className="vero-page__role">Your AI travel assistant</p>
                <p className="vero-page__hint">
                  Tell me your travel plans or explore suggestions,
                  <br />
                  and I&apos;ll help create unforgettable journeys.
                </p>

                <div className="vero-page__tiles" role="group" aria-label="Quick actions">
                  {QUICK_ACTIONS.map(({ id, title, subtitle, Icon, ...action }) => (
                    <button
                      key={id}
                      type="button"
                      className="vero-tile"
                      disabled={isTyping}
                      onClick={() => handleQuickAction({ id, title, subtitle, Icon, ...action })}
                    >
                      <span className="vero-tile__icon" aria-hidden>
                        <Icon size={22} strokeWidth={2} />
                      </span>
                      <span className="vero-tile__title">{title}</span>
                      <span className="vero-tile__subtitle">{subtitle}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {hasMessages && (
              <h1 id="vero-heading" className="vero-page__sr-only">
                Vero chat
              </h1>
            )}

            {messages.map((m, i) => (
              <div
                key={`${m.role}-${i}-${(m.content || "").slice(0, 12)}`}
                className={
                  m.role === "user"
                    ? "vero-page__bubble vero-page__bubble--user"
                    : "vero-page__bubble"
                }
              >
                <span className="vero-page__who">{m.role === "user" ? "You" : "Vero"}</span>
                <div className="vero-page__text">{formatMarkdownLite(m.content)}</div>
                {m.role === "assistant" && Array.isArray(m.flights) && m.flights.length > 0 && (
                  <VeroFlightCards flights={m.flights} sessionId={sessionId} />
                )}
                {m.role === "assistant" && Array.isArray(m.places) && m.places.length > 0 && (
                  <VeroPlaceCards places={m.places} />
                )}
                {m.role === "assistant" &&
                  i === latestAssistantIndex &&
                  !isTyping &&
                  !m.meta?.error &&
                  !(Array.isArray(m.ui_prompts) && m.ui_prompts.length > 0) && (
                    <SuggestionChips
                      suggestions={followUpsForMessage(m, i)}
                      onSelect={sendMessage}
                      disabled={isTyping}
                    />
                  )}
              </div>
            ))}

            <VeroTypingStatus
              active={isTyping}
              userMessage={latestUserMessage}
              mode={typingMode}
            />
            <div ref={bottomRef} />
          </div>

          {error && (
            <p className="vero-page__error" role="alert">
              {error}
            </p>
          )}

          {showReopenPicker && (
            <button
              type="button"
              className="vero-page__reopen-picker"
              onClick={() => setOverlayOpen(true)}
            >
              Continue — pick missing details
            </button>
          )}

          <form className="vero-page__composer" onSubmit={onSubmit}>
            <div className="vero-page__composer-shell">
              <input
                ref={fileInputRef}
                type="file"
                className="vero-page__sr-only"
                accept=".txt,.md,.csv,text/plain,image/*"
                onChange={onAttachFile}
                tabIndex={-1}
              />
              <button
                type="button"
                className="vero-page__composer-tool"
                aria-label="Attach a note or file"
                onClick={() => fileInputRef.current?.click()}
                disabled={isTyping}
              >
                <Plus size={18} strokeWidth={2.25} />
              </button>
              <input
                ref={inputRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Where to Next?"
                aria-label="Message Vero"
                disabled={isTyping}
                autoComplete="off"
              />
              <button
                type="button"
                className={`vero-page__composer-tool${listening ? " is-listening" : ""}`}
                aria-label={listening ? "Stop listening" : "Dictate message"}
                aria-pressed={listening}
                onClick={handleMic}
                disabled={isTyping}
              >
                <Mic size={18} strokeWidth={2.25} />
              </button>
              <button
                type="submit"
                className="vero-page__send"
                disabled={isTyping || !draft.trim()}
                aria-label="Send message to Vero"
              >
                <ArrowUp size={18} strokeWidth={2.5} />
              </button>
            </div>
          </form>
        </section>
      </div>

      <ClarificationOverlay
        open={Boolean(latestPromptMsg && overlayOpen && !isTyping)}
        onClose={closeOverlay}
      >
        {latestPromptMsg && (
          <ClarificationWidgets
            prompts={latestPromptMsg.ui_prompts}
            clarification={latestPromptMsg.clarification}
            onSubmit={onWidgetSubmit}
            disabled={isTyping}
          />
        )}
      </ClarificationOverlay>
    </PageLayout>
  );
}

/**
 * Lightweight markdown: **bold**, *italic*, and `- ` / `* ` bullet lines.
 */
function formatMarkdownLite(text) {
  if (!text) return null;
  const lines = String(text).split("\n");
  const blocks = [];
  let listItems = [];

  function flushList() {
    if (!listItems.length) return;
    blocks.push(
      <ul key={`ul-${blocks.length}`} className="vero-page__list">
        {listItems.map((item, i) => (
          <li key={i}>{formatInline(item)}</li>
        ))}
      </ul>
    );
    listItems = [];
  }

  lines.forEach((line, idx) => {
    const bullet = line.match(/^\s*[-*]\s+(.+)$/);
    if (bullet) {
      listItems.push(bullet[1]);
      return;
    }
    flushList();
    if (line.trim() === "") {
      blocks.push(<div key={`sp-${idx}`} className="vero-page__break" />);
      return;
    }
    blocks.push(
      <p key={`p-${idx}`} className="vero-page__para">
        {formatInline(line)}
      </p>
    );
  });
  flushList();
  return blocks;
}

function formatInline(text) {
  // Links first, then bold/italic — so `[Maps](url)` never leaks as raw markdown.
  const parts = String(text).split(/(\[[^\]]+\]\([^)]+\)|\*\*[^*]+\*\*|\*[^*]+\*)/g);
  return parts.map((part, i) => {
    const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (link) {
      const href = link[2].trim();
      const safe =
        href.startsWith("http://") ||
        href.startsWith("https://") ||
        href.startsWith("mailto:");
      if (safe) {
        return (
          <a
            key={i}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="vero-page__md-link"
          >
            {link[1]}
          </a>
        );
      }
    }
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("*") && part.endsWith("*") && part.length > 2 && !part.startsWith("**")) {
      return <em key={i}>{part.slice(1, -1)}</em>;
    }
    return <React.Fragment key={i}>{part}</React.Fragment>;
  });
}
