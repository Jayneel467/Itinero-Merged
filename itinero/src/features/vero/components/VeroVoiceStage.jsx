import { useEffect, useState } from "react";
import { X } from "lucide-react";
import VeroCardsDeck from "./VeroCardsDeck";
import VeroPlaceCards from "./VeroPlaceCards";
import { getVoiceStatusLines } from "../utils/statusLines";
import "./VeroVoiceStage.css";
import "./VeroCardsDeck.css";

const VERO_AVATAR = `${import.meta.env.BASE_URL}vero-chatbot.png`;

/**
 * Voice overlay - Vero mascot + branded glow, live captions, cards.
 */
export default function VeroVoiceStage({
  phase = "listening",
  level = 0,
  hint = "",
  heard = "",
  liveCaption = "",
  reply = "",
  spokenLang = "",
  cards = null,
  places = null,
  compact = false,
  showLeftHint = false,
  onToggle,
  onEnd,
  onSelectCard,
}) {
  const [thinkLine, setThinkLine] = useState("");

  useEffect(() => {
    if (phase !== "thinking") {
      setThinkLine("");
      return undefined;
    }
    const lines = getVoiceStatusLines(heard || liveCaption, spokenLang);
    let index = 0;
    setThinkLine(lines[0] || hint || "Thinking…");
    const timer = window.setInterval(() => {
      index = (index + 1) % Math.max(1, lines.length);
      setThinkLine(lines[index] || lines[0]);
    }, 2000);
    return () => window.clearInterval(timer);
  }, [phase, heard, liveCaption, spokenLang, hint]);

  const energy = Math.min(1, Math.max(0.18, Number(level) * 10 || 0.22));
  const youSaid = (liveCaption || heard || "").trim();
  const hasCards = Boolean(cards?.items?.length) || Boolean(places?.length);
  const leftHint = showLeftHint || hasCards;
  const status =
    phase === "thinking"
      ? thinkLine || hint || "Thinking…"
      : hint ||
        (phase === "speaking" ? "Vero is speaking…" : phase === "listening" ? "Listening…" : "");

  return (
    <div
      className={`vero-voice-stage is-${phase}${hasCards ? " has-cards" : ""}${compact ? " is-compact" : ""}`}
      style={{ "--voice-energy": energy }}
    >
      <button type="button" className="vero-voice-stage__close" onClick={onEnd} aria-label="End voice">
        <X size={18} />
      </button>

      <button
        type="button"
        className="vero-voice-stage__orb-hit"
        onClick={onToggle}
        aria-label={phase === "speaking" ? "Interrupt Vero" : "End voice"}
      >
        <span className="vero-voice-stage__halo" aria-hidden />
        <span className="vero-voice-stage__halo vero-voice-stage__halo--2" aria-hidden />
        <span className="vero-voice-stage__ring" aria-hidden />
        <span className="vero-voice-stage__dash" aria-hidden />
        <span className="vero-voice-stage__face">
          <img src={VERO_AVATAR} alt="" />
        </span>
      </button>

      <p className="vero-voice-stage__hint">{status}</p>
      {leftHint ? (
        <p className="vero-voice-stage__left-hint">Live results are on the left</p>
      ) : null}

      {youSaid ? (
        <div className="vero-voice-stage__said">
          <span>You</span>
          <p>{youSaid}</p>
        </div>
      ) : null}

      {phase === "speaking" && reply ? (
        <div className="vero-voice-stage__said vero-voice-stage__said--vero">
          <span>Vero</span>
          <p>{reply}</p>
        </div>
      ) : null}

      {cards?.items?.length ? (
        <div className="vero-voice-stage__cards">
          <VeroCardsDeck cards={cards} onSelect={onSelectCard} />
        </div>
      ) : null}
      {places?.length ? (
        <div className="vero-voice-stage__cards">
          <VeroPlaceCards places={places} />
        </div>
      ) : null}

      <p className="vero-voice-stage__sub">
        {phase === "speaking" ? "Tap Vero to interrupt" : "Just talk - tap End to hang up"}
      </p>
      <button type="button" className="vero-voice-stage__end" onClick={onEnd}>
        End
      </button>
    </div>
  );
}
