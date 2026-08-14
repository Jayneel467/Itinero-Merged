import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowUp,
  Building2,
  Briefcase,
  Gift,
  Globe2,
  Menu,
  Mic,
  Plane,
  Plus,
  Share2,
  Ticket,
  X,
} from "lucide-react";
import { PageLayout } from "@/components/layout";
import VeroCreditMeter from "@/features/billing/VeroCreditMeter";
import { NAVBAR_IMAGES } from "@/constants/images";
import useVeroChat from "./hooks/useVeroChat";
import useVeroVoice from "./hooks/useVeroVoice";
import {
  ClarificationOverlay,
  ClarificationWidgets,
  VeroCardsDeck,
  VeroFlightCards,
  VeroPlaceCards,
  VeroVisaSources,
  VeroTypingStatus,
  VeroVoiceStage,
  SuggestionChips,
  VeroMessageBubble,
  VeroSidebar,
} from "./components";
import { suggestFollowUps } from "./utils/suggestFollowUps";
import { starterChipsFromPageContext, welcomeFromPageContext } from "./utils/pageContext";
import { getActiveThread } from "./utils/chatStore";
import {
  trainsSearchPath,
  busesSearchPath,
  flightsSearchPath,
  hotelsSearchPath,
  packagesSearchPath,
  trackTrainPath,
  trackFlightPath,
  trackAirportPath,
  openTripsPath,
  pnrPath,
  trainFoodPath,
  navActionFromVeroCards,
  pageNavActionFromMessage,
} from "./utils/pageFilterIntent";
import { useVeroUiOptional } from "@/context/VeroUiContext";
import { needsFlightClarification } from "./utils/statusLines";
import "./VeroPage.css";
import "./components/VeroSidebar.css";
import "./components/VeroCardsDeck.css";

const QUICK_ACTIONS = [
  {
    id: "flights",
    title: "Flights",
    subtitle: "Search & Book Flights",
    Icon: Plane,
    action: "navigate",
    to: "/flights",
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
    id: "packages",
    title: "Packages",
    subtitle: "Build a trip with Vero",
    Icon: Gift,
    action: "navigate",
    to: "/packages",
  },
  {
    id: "explore",
    title: "Explore",
    subtitle: "Discover destinations",
    Icon: Globe2,
    action: "navigate",
    to: "/explore",
  },
  {
    id: "events",
    title: "Events",
    subtitle: "Concerts & live tickets",
    Icon: Ticket,
    action: "navigate",
    to: "/events",
  },
  {
    id: "trips",
    title: "My Trips",
    subtitle: "View & manage bookings",
    Icon: Briefcase,
    action: "navigate",
    to: "/trips",
  },
];

/**
 * Full-page Vero AI chat - wired to supervisor /api/chat.
 * Sidebar shell + empty-state tiles matching product reference.
 */
export default function VeroPage() {
  const navigate = useNavigate();
  const veroUi = useVeroUiOptional();
  const handleItineroActions = useCallback(
    (actions, cards) => {
      const list = [...(actions || [])];
      const cardNav = navActionFromVeroCards(cards);
      if (cardNav) list.push(cardNav);
      for (const action of list) {
        if (!action?.type) continue;
        if (
          action.type === "search_trains" &&
          (action.origin || action.from_code) &&
          (action.destination || action.to_code)
        ) {
          navigate(trainsSearchPath(action));
          veroUi?.openVero?.();
          return;
        }
        if (
          action.type === "search_buses" &&
          (action.origin || action.from) &&
          (action.destination || action.to)
        ) {
          navigate(busesSearchPath(action));
          veroUi?.openVero?.();
          return;
        }
        if (action.type === "search_flights" && action.origin && action.destination) {
          navigate(flightsSearchPath(action));
          veroUi?.openVero?.();
          return;
        }
        if (action.type === "search_hotels" && action.city) {
          navigate(hotelsSearchPath(action));
          veroUi?.openVero?.();
          return;
        }
        if (action.type === "search_packages") {
          navigate(packagesSearchPath(action));
          veroUi?.openVero?.();
          return;
        }
        if (action.type === "track_train" && action.number) {
          navigate(trackTrainPath(action));
          veroUi?.openVero?.();
          return;
        }
        if (action.type === "track_airport" && action.airport) {
          navigate(trackAirportPath(action));
          veroUi?.openVero?.();
          return;
        }
        if (action.type === "track_flight" && action.flight) {
          navigate(trackFlightPath(action));
          veroUi?.openVero?.();
          return;
        }
        if (action.type === "check_pnr" && action.pnr) {
          navigate(pnrPath(action));
          veroUi?.openVero?.();
          return;
        }
        if (action.type === "order_train_food") {
          navigate(trainFoodPath(action));
          veroUi?.openVero?.();
          return;
        }
        if (action.type === "open_trips" || action.type === "open_cancel") {
          navigate(openTripsPath(action));
          veroUi?.openVero?.();
          return;
        }
        if (action.type === "open_profile") {
          navigate("/profile");
          veroUi?.openVero?.();
          return;
        }
        if (action.type === "open_plus") {
          navigate("/plus");
          veroUi?.openVero?.();
          return;
        }
      }
    },
    [navigate, veroUi]
  );
  const {
    messages,
    isTyping,
    sendMessage: sendChatMessage,
    submitSlotAnswers,
    clearSession,
    loadThread,
    deleteSavedThread,
    savedThreads,
    error,
    sessionId,
  } = useVeroChat({ onItineroActions: handleItineroActions });
  const pageContext = veroUi?.pageContext || null;
  const mascotSrc = NAVBAR_IMAGES.veroAvatar;
  const welcome = useMemo(() => {
    const w = welcomeFromPageContext(pageContext);
    if (!pageContext?.screen) {
      return {
        ...w,
        desc: "Tell me the trip - I'll pull hotels, flights, or a full plan while we talk.",
      };
    }
    return w;
  }, [pageContext]);

  const sendMessage = useCallback(
    (text, options) => {
      const trimmed = String(text || "").trim();
      if (trimmed) {
        const localNav = pageNavActionFromMessage(trimmed, pageContext);
        if (localNav) {
          handleItineroActions([localNav]);
        }
      }
      return sendChatMessage(text, options);
    },
    [sendChatMessage, handleItineroActions, pageContext]
  );
  const [draft, setDraft] = useState("");
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [dismissedPromptKey, setDismissedPromptKey] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [shareHint, setShareHint] = useState("");
  const threadRef = useRef(null);
  const inputRef = useRef(null);
  const bottomRef = useRef(null);
  const fileInputRef = useRef(null);
  const voice = useVeroVoice({
    onTranscript: (text, meta) => sendMessage(text, meta),
  });

  const hasMessages = messages.length > 0;

  // Resume thread when arriving from the floating widget's fullscreen button.
  useEffect(() => {
    const active = getActiveThread();
    if (active?.id && active.messages?.length) {
      loadThread(active.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
          title: "Chat with Vero - Itinero",
          text: "Plan your trip with Vero, Itinero’s travel agent.",
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
    voice.toggleVoice();
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

  /** Clarify vs live-search loading copy - skip airline jokes when only asking for a date. */
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

  const followUpChips = useMemo(() => {
    if (isTyping) return [];
    if (!hasMessages) return starterChipsFromPageContext(pageContext) || [];
    const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
    return suggestFollowUps({
      userText: latestUserMessage,
      replyText: lastAssistant?.content,
      apiSuggestions: lastAssistant?.suggestions,
      hasCards: Boolean(lastAssistant?.cards?.items?.length),
    });
  }, [isTyping, hasMessages, messages, latestUserMessage, pageContext]);

  return (
    <PageLayout showNavbar={false} showFooter={false} showVeroBot={false} className="vero-shell-main">
      <div className={`vero-shell${sidebarOpen ? " vero-shell--nav-open" : ""}`}>
        {sidebarOpen && (
          <button
            type="button"
            className="vero-shell__scrim"
            aria-label="Close menu"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        <VeroSidebar
          mascotSrc={mascotSrc}
          logoSrc={NAVBAR_IMAGES.logo}
          savedThreads={savedThreads}
          activeThreadId={sessionId}
          newChatActive={!hasMessages}
          onNewChat={handleNewChat}
          onLoadThread={(id) => {
            loadThread(id);
            setSidebarOpen(false);
          }}
          onDeleteThread={deleteSavedThread}
          onNavClick={() => setSidebarOpen(false)}
        />

        <section className={`vero-page${voice.voiceMode ? " is-voice" : ""}`} aria-labelledby="vero-heading">
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

            <VeroCreditMeter compact />
            <div className="vero-page__topbar-actions">
              <button
                type="button"
                className="vero-page__icon-btn"
                aria-label="New chat"
                title="New chat"
                onClick={handleNewChat}
              >
                <Plus size={18} strokeWidth={2} />
              </button>
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

          {voice.voiceMode ? (
            <VeroVoiceStage
              phase={voice.phase}
              level={voice.level}
              hint={voice.hint}
              heard={voice.heardText}
              liveCaption={voice.liveCaption}
              reply={voice.replyText}
              spokenLang={voice.spokenLang}
              cards={(() => {
                const a = [...messages].reverse().find((m) => m.role === "assistant");
                return ["places", "events", "visa_sources", "trains", "buses"].includes(a?.cards?.type)
                  ? null
                  : a?.cards;
              })()}
              places={(() => {
                const a = [...messages].reverse().find((m) => m.role === "assistant");
                return a?.places || (["places", "events"].includes(a?.cards?.type) ? a.cards.items : null);
              })()}
              showLeftHint={(() => {
                const a = [...messages].reverse().find((m) => m.role === "assistant");
                return a?.cards?.type === "trains" || a?.cards?.type === "buses";
              })()}
              onToggle={handleMic}
              onEnd={voice.stopVoice}
              onSelectCard={(text) =>
                voice.injectUtterance?.(text) || sendMessage(text, { voiceMode: true, spokenLanguage: voice.spokenLang })
              }
            />
          ) : null}
          <div
            className={`vero-page__thread${hasMessages ? "" : " vero-page__thread--empty"}`}
            role="log"
            aria-live="polite"
            aria-relevant="additions"
            ref={threadRef}
          >
            {!hasMessages && (
              <div className="vero-page__empty">
                <div className="vero-page__hero">
                  <img
                    src={mascotSrc}
                    alt=""
                    className="vero-page__hero-avatar"
                    width={96}
                    height={96}
                    onError={(e) => {
                      e.currentTarget.onerror = null;
                      e.currentTarget.src = `${import.meta.env.BASE_URL}vero-chatbot.png`;
                    }}
                  />
                  <h1 id="vero-heading" className="vero-page__hello">
                    {welcome.title || "Vero"}
                  </h1>
                  <p className="vero-page__role">{welcome.subtitle || "Your travel agent"}</p>
                  <p className="vero-page__hint">
                    {welcome.desc ||
                      "Tell me the trip - I'll pull hotels, flights, or a full plan while we talk."}
                  </p>
                </div>

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
                        <Icon size={20} strokeWidth={2.25} />
                      </span>
                      <span className="vero-tile__copy">
                        <span className="vero-tile__title">{title}</span>
                        <span className="vero-tile__subtitle">{subtitle}</span>
                      </span>
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
              <VeroMessageBubble
                key={`${m.role}-${i}-${(m.content || "").slice(0, 12)}`}
                sender={m.role === "user" ? "user" : "bot"}
                text={m.content}
                time={m.time}
                hasCards={Boolean(
                  (m.cards?.items?.length && !["trains", "buses"].includes(m.cards?.type)) ||
                    m.flights?.length ||
                    m.places?.length
                )}
              >
                {m.role === "assistant" && m.cards?.items?.length > 0 && !["places", "events", "visa_sources", "trains", "buses"].includes(m.cards.type) && (
                  <VeroCardsDeck cards={m.cards} onSelect={sendMessage} />
                )}
                {m.role === "assistant" && m.cards?.type === "visa_sources" ? (
                  <VeroVisaSources cards={m.cards} />
                ) : null}
                {m.role === "assistant" && Array.isArray(m.flights) && m.flights.length > 0 && (
                  <VeroFlightCards flights={m.flights} sessionId={sessionId} />
                )}
                {m.role === "assistant" && Array.isArray(m.places) && m.places.length > 0 && (
                  <VeroPlaceCards places={m.places} />
                )}
              </VeroMessageBubble>
            ))}

            {isTyping ? (
              <VeroMessageBubble
                sender="bot"
                typing
                typingNode={
                  <VeroTypingStatus
                    active
                    userMessage={latestUserMessage}
                    mode={typingMode}
                  />
                }
              />
            ) : null}
            {hasMessages && (
              <SuggestionChips
                suggestions={followUpChips}
                onSelect={sendMessage}
                disabled={isTyping}
              />
            )}
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
              Continue - pick missing details
            </button>
          )}

          <div className="vero-page__dock">
            {!hasMessages ? (
              <SuggestionChips
                suggestions={followUpChips}
                onSelect={sendMessage}
                disabled={isTyping}
              />
            ) : null}
            <form className="vero-page__composer" onSubmit={onSubmit}>
              {voice.voiceMode ? (
                <div className="vero-voice-call">
                  <button
                    type="button"
                    className={`vero-voice-orb is-${voice.phase}`}
                    style={{ "--level": Math.min(1, (voice.level || 0) * 8) }}
                    onClick={handleMic}
                    aria-label={voice.phase === "speaking" ? "Interrupt Vero" : "End voice"}
                  >
                    <Mic size={22} strokeWidth={2.25} />
                  </button>
                  <p className="vero-page__voice-hint" role="status">
                    {voice.hint || "Listening…"}
                  </p>
                  <button type="button" className="vero-voice-end" onClick={voice.stopVoice}>
                    End
                  </button>
                </div>
              ) : (
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
                    placeholder="Tell Vero the trip…"
                    aria-label="Message Vero"
                    disabled={isTyping}
                    autoComplete="off"
                  />
                  <button
                    type="button"
                    className="vero-page__composer-tool"
                    aria-label="Talk to Vero"
                    aria-pressed={false}
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
              )}
            </form>
          </div>
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
