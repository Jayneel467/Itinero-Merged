import React from "react";
import formatMarkdownLite from "../utils/formatMarkdownLite";
import "./VeroMessageBubble.css";

const VERO_AVATAR = `${import.meta.env.BASE_URL}vero-chatbot.png`;

function avatarFallback(e) {
  e.currentTarget.onerror = null;
  e.currentTarget.src =
    "https://ui-avatars.com/api/?name=Vero+AI&background=F97211&color=fff";
}

export function formatChatTime(value) {
  if (!value) return "";
  if (typeof value === "string" && /^\d{1,2}:\d{2}/.test(value.trim())) return value.trim();
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/**
 * Chat bubble matching Vero message UI:
 * bot = avatar + white bordered pill + timestamp
 * user = orange pill, right aligned, no avatar
 */
export default function VeroMessageBubble({
  sender = "bot",
  text = "",
  time,
  applied,
  typing = false,
  typingNode = null,
  hasCards = false,
  children,
}) {
  const isUser = sender === "user";
  const stamp = formatChatTime(time);

  return (
    <div
      className={`vero-m ${isUser ? "vero-m--user" : "vero-m--bot"}${
        hasCards ? " vero-m--cards" : ""
      }`}
    >
      {!isUser && (
        <img
          src={VERO_AVATAR}
          alt=""
          className="vero-m__avatar"
          onError={avatarFallback}
        />
      )}
      <div className="vero-m__col">
        <div className={`vero-m__bubble${typing ? " vero-m__bubble--typing" : ""}`}>
          {typing ? (
            typingNode
          ) : isUser ? (
            <p className="vero-m__text">{text}</p>
          ) : (
            formatMarkdownLite(text)
          )}
          {stamp && !typing ? <time className="vero-m__time">{stamp}</time> : null}
        </div>
        {isUser && applied ? <span className="vero-applied-pill">{applied}</span> : null}
        {children}
      </div>
    </div>
  );
}
