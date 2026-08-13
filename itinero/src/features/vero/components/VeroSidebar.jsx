import React, { useMemo } from "react";
import { Link } from "react-router-dom";
import {
  Plus,
  Briefcase,
  Plane,
  Bookmark,
  LifeBuoy,
  UserRound,
  Trash2,
  MessageSquare,
} from "lucide-react";
import { NAVBAR_IMAGES } from "@/constants/images";
import "./VeroSidebar.css";

function chatTitle(raw) {
  return String(raw || "Chat").replace(/\s+/g, " ").trim() || "Chat";
}

function relativeTime(ts) {
  const n = Number(ts);
  if (!n) return "";
  const diff = Date.now() - n;
  if (diff < 60_000) return "Just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)}d ago`;
  try {
    return new Date(n).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  } catch {
    return "";
  }
}

/**
 * Shared Vero sidebar - used on /vero full page (and matches expand-from-widget layout).
 */
export default function VeroSidebar({
  mascotSrc,
  logoSrc = NAVBAR_IMAGES.logo,
  savedThreads = [],
  activeThreadId = "",
  newChatActive = false,
  onNewChat,
  onLoadThread,
  onDeleteThread,
  onNavClick,
}) {
  const chatCount = savedThreads.length;
  const threads = useMemo(() => savedThreads, [savedThreads]);

  return (
    <aside className="vero-sidebar" aria-label="Vero navigation">
      <div className="vero-sidebar__brand">
        <div className="vero-sidebar__brand-mark">
          <img
            src={logoSrc}
            alt="itinero"
            className="vero-sidebar__logo"
            width={118}
            height={24}
            onError={(e) => {
              e.currentTarget.onerror = null;
              e.currentTarget.src = `${import.meta.env.BASE_URL}itinero-logo.png`;
            }}
          />
          <div className="vero-sidebar__vero-chip">
            <img
              src={mascotSrc}
              alt=""
              className="vero-sidebar__avatar"
              width={22}
              height={22}
              onError={(e) => {
                e.currentTarget.onerror = null;
                e.currentTarget.src = `${import.meta.env.BASE_URL}vero-chatbot.png`;
              }}
            />
            <span>Vero</span>
          </div>
        </div>
        <p className="vero-sidebar__tagline">Your travel agent, always on</p>
      </div>

      <div className="vero-sidebar__top">
        <button
          type="button"
          className={`vero-sidebar__new${newChatActive ? " vero-sidebar__new--active" : ""}`}
          onClick={onNewChat}
        >
          <span className="vero-sidebar__new-icon" aria-hidden>
            <Plus size={18} strokeWidth={2.5} />
          </span>
          <span>New chat</span>
        </button>
      </div>

      <div className="vero-sidebar__chats" aria-label="Saved chats">
        <div className="vero-sidebar__chats-head">
          <p className="vero-sidebar__chats-label">Recent</p>
          {chatCount ? (
            <span className="vero-sidebar__chats-count">{chatCount}</span>
          ) : null}
        </div>
        <div className="vero-sidebar__chats-list" role="listbox">
          {threads.length ? (
            threads.map((thread) => {
              const isActive =
                thread.id === activeThreadId || thread.sessionId === activeThreadId;
              const label = chatTitle(thread.title);
              const when = relativeTime(thread.updatedAt || thread.createdAt);
              return (
                <div
                  key={thread.id}
                  className={`vero-sidebar__chat-row${
                    isActive ? " vero-sidebar__chat-row--active" : ""
                  }`}
                >
                  <button
                    type="button"
                    role="option"
                    aria-selected={isActive}
                    className="vero-sidebar__chat"
                    onClick={() => onLoadThread?.(thread.id)}
                    title={label}
                  >
                    <span className="vero-sidebar__chat-icon" aria-hidden>
                      <MessageSquare size={14} strokeWidth={2} />
                    </span>
                    <span className="vero-sidebar__chat-copy">
                      <span className="vero-sidebar__chat-title">{label}</span>
                      {when ? (
                        <span className="vero-sidebar__chat-meta">{when}</span>
                      ) : null}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="vero-sidebar__chat-delete"
                    aria-label={`Delete chat: ${label}`}
                    title="Delete chat"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteThread?.(thread.id);
                    }}
                  >
                    <Trash2 size={14} strokeWidth={2} aria-hidden />
                  </button>
                </div>
              );
            })
          ) : (
            <div className="vero-sidebar__chats-empty">
              <MessageSquare size={18} strokeWidth={1.75} aria-hidden />
              <p>No chats yet</p>
              <span>Start one - Vero keeps the thread here.</span>
            </div>
          )}
        </div>
      </div>

      <nav className="vero-sidebar__nav" aria-label="App shortcuts">
        <p className="vero-sidebar__nav-label">Explore</p>
        <div className="vero-sidebar__nav-grid">
          <Link to="/trips" className="vero-sidebar__nav-item" onClick={onNavClick}>
            <Briefcase size={16} strokeWidth={2} aria-hidden />
            <span>Trips</span>
          </Link>
          <Link to="/flights" className="vero-sidebar__nav-item" onClick={onNavClick}>
            <Plane size={16} strokeWidth={2} aria-hidden />
            <span>Flights</span>
          </Link>
          <Link to="/saved" className="vero-sidebar__nav-item" onClick={onNavClick}>
            <Bookmark size={16} strokeWidth={2} aria-hidden />
            <span>Saved</span>
          </Link>
          <Link to="/help" className="vero-sidebar__nav-item" onClick={onNavClick}>
            <LifeBuoy size={16} strokeWidth={2} aria-hidden />
            <span>Help</span>
          </Link>
          <Link
            to="/profile"
            className="vero-sidebar__nav-item vero-sidebar__nav-item--wide"
            onClick={onNavClick}
          >
            <UserRound size={16} strokeWidth={2} aria-hidden />
            <span>Profile</span>
          </Link>
        </div>
      </nav>
    </aside>
  );
}
