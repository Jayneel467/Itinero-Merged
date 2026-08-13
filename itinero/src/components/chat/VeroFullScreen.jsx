import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  X,
  Minimize2,
  Wand2,
  Briefcase,
  User,
  Plane,
  Building2,
  Gift,
  Globe,
  ArrowUp,
  Mic,
  Ticket,
} from 'lucide-react';
import VeroCardsDeck from '@/features/vero/components/VeroCardsDeck';
import VeroPlaceCards from '@/features/vero/components/VeroPlaceCards';
import VeroVisaSources from '@/features/vero/components/VeroVisaSources';
import VeroTypingStatus from '@/features/vero/components/VeroTypingStatus';
import SuggestionChips from '@/features/vero/components/SuggestionChips';
import VeroVoiceStage from '@/features/vero/components/VeroVoiceStage';
import VeroMessageBubble from '@/features/vero/components/VeroMessageBubble';
import './VeroFullScreen.css';
import './VeroChatWidget.css';
import '@/features/vero/components/VeroCardsDeck.css';

const VERO_AVATAR = `${import.meta.env.BASE_URL}vero-chatbot.png`;
const LOGO_AVATAR = `${import.meta.env.BASE_URL}vero-chatbot.png`;

function chatTitle(raw) {
  const t = String(raw || 'Chat').replace(/\s+/g, ' ').trim();
  return t.length > 48 ? `${t.slice(0, 45)}…` : t;
}

export default function VeroFullScreen({
  isOpen,
  onMinimize,
  onClose,
  messages = [],
  onSendMessage,
  isTyping = false,
  typingFor = '',
  chips = [],
  voice = null,
  savedThreads = [],
  activeThreadId = '',
  onNewChat,
  onLoadThread,
}) {
  const navigate = useNavigate();
  const [inputValue, setInputValue] = useState("");
  const messagesEndRef = React.useRef(null);
  const isEmpty = messages.length <= 1;

  const go = (path) => {
    onMinimize?.();
    navigate(path);
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  React.useEffect(() => {
    if (isOpen) scrollToBottom();
  }, [messages, isOpen]);

  const handleSendMessage = (text) => {
    const msgText = typeof text === 'string' ? text : inputValue;
    if (!msgText.trim()) return;
    
    if (onSendMessage) {
      onSendMessage(msgText);
    }
    setInputValue("");
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleSendMessage();
    }
  };

  return (
    <div className={`vero-fullscreen-container ${isOpen ? 'open' : ''}`}>
      <div className="vero-fs-layout">
        <aside className="vero-fs-sidebar">
          <div className="vero-fs-brand">
            <img
              src={LOGO_AVATAR}
              alt=""
              className="vero-fs-logo"
              onError={(e) => {
                e.target.src =
                  'https://ui-avatars.com/api/?name=Itinero&background=F97211&color=fff';
              }}
            />
            <div className="vero-fs-logo-text">
              <h2>Itinero</h2>
              <p>Travel agent</p>
            </div>
          </div>

          <nav className="vero-fs-nav" aria-label="Vero">
            <button
              type="button"
              className="vero-fs-nav-item active"
              onClick={() => onNewChat?.()}
            >
              <Wand2 size={18} />
              <span>New Chat</span>
            </button>
            <button className="vero-fs-nav-item" type="button" onClick={() => go('/trips')}>
              <Briefcase size={18} />
              <span>My Trips</span>
            </button>
            <button className="vero-fs-nav-item" type="button" onClick={() => go('/flights')}>
              <Plane size={18} />
              <span>Booking</span>
            </button>
            <button className="vero-fs-nav-item" type="button" onClick={() => go('/profile')}>
              <User size={18} />
              <span>Profile</span>
            </button>
          </nav>

          <div className="vero-fs-history">
            <p className="vero-fs-history-label">Saved chats</p>
            {savedThreads.length ? (
              <div className="vero-fs-history-list" role="listbox" aria-label="Saved chats">
                {savedThreads.map((thread) => (
                  <button
                    key={thread.id}
                    type="button"
                    className={`vero-fs-history-item${thread.id === activeThreadId ? ' is-active' : ''}`}
                    onClick={() => onLoadThread?.(thread.id)}
                    title={thread.title || 'Chat'}
                  >
                    {chatTitle(thread.title)}
                  </button>
                ))}
              </div>
            ) : (
              <p className="vero-fs-history-empty">No saved chats yet</p>
            )}
          </div>
        </aside>

        <main className={`vero-fs-main${voice?.voiceMode ? ' is-voice' : ''}`}>
          <header className="vero-fs-header">
            <div className="vero-fs-header-spacer" />
            <div className="vero-fs-actions">
              <button className="vero-fs-icon-btn" onClick={onMinimize} title="Minimize to drawer">
                <Minimize2 size={18} />
              </button>
              <button className="vero-fs-icon-btn" onClick={onClose} title="Close">
                <X size={20} />
              </button>
            </div>
          </header>

          {voice?.voiceMode ? (
            <VeroVoiceStage
              phase={voice.phase}
              level={voice.level}
              hint={voice.hint}
              heard={voice.heardText}
              liveCaption={voice.liveCaption}
              reply={voice.replyText}
              spokenLang={voice.spokenLang}
              cards={(() => {
                const bot = [...messages].reverse().find((m) => m.sender === 'bot');
                return ['places', 'events', 'visa_sources', 'trains', 'buses'].includes(bot?.cards?.type)
                  ? null
                  : bot?.cards;
              })()}
              places={(() => {
                const bot = [...messages].reverse().find((m) => m.sender === 'bot');
                return bot?.places || (['places', 'events'].includes(bot?.cards?.type) ? bot.cards.items : null);
              })()}
              showLeftHint={(() => {
                const bot = [...messages].reverse().find((m) => m.sender === 'bot');
                return bot?.cards?.type === 'trains' || bot?.cards?.type === 'buses';
              })()}
              onToggle={voice.toggleVoice}
              onEnd={voice.stopVoice}
              onSelectCard={(text) => voice.injectUtterance?.(text) || onSendMessage?.(text, { voiceMode: true, spokenLanguage: voice.spokenLang })}
            />
          ) : null}

          <>
            <div className={`vero-fs-content${isEmpty ? ' is-empty' : ''}`}>
              {isEmpty ? (
                <div className="vero-fs-empty">
                  <div className="vero-fs-welcome">
                    <img
                      src={VERO_AVATAR}
                      alt="Vero AI"
                      className="vero-fs-large-avatar"
                      onError={(e) => {
                        e.target.src =
                          'https://ui-avatars.com/api/?name=Vero+AI&background=F97211&color=fff';
                      }}
                    />
                    <h1 className="vero-fs-title">Vero</h1>
                    <p className="vero-fs-subtitle">Your travel agent</p>
                    <p className="vero-fs-desc">
                      Tell me the trip - I&apos;ll pull hotels, flights,
                      or a full plan while we talk.
                    </p>
                  </div>

                  <div className="vero-fs-cards-grid">
                    <button type="button" className="vero-fs-card" onClick={() => go('/flights')}>
                      <Plane size={22} className="vero-fs-card-icon" />
                      <h3>Flights</h3>
                      <p>Search & book flights</p>
                    </button>
                    <button type="button" className="vero-fs-card" onClick={() => go('/hotels')}>
                      <Building2 size={22} className="vero-fs-card-icon" />
                      <h3>Hotels</h3>
                      <p>Find & book stays</p>
                    </button>
                    <button type="button" className="vero-fs-card" onClick={() => go('/packages')}>
                      <Gift size={22} className="vero-fs-card-icon" />
                      <h3>Packages</h3>
                      <p>Build a trip with Vero</p>
                    </button>
                    <button type="button" className="vero-fs-card" onClick={() => go('/explore')}>
                      <Globe size={22} className="vero-fs-card-icon" />
                      <h3>Explore</h3>
                      <p>Discover destinations</p>
                    </button>
                    <button type="button" className="vero-fs-card" onClick={() => go('/events')}>
                      <Ticket size={22} className="vero-fs-card-icon" />
                      <h3>Events</h3>
                      <p>Concerts & live tickets</p>
                    </button>
                    <button type="button" className="vero-fs-card" onClick={() => go('/trips')}>
                      <Briefcase size={22} className="vero-fs-card-icon" />
                      <h3>My Trips</h3>
                      <p>View & manage bookings</p>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="vero-fs-chat-messages">
                  {messages.map((msg) => (
                    <VeroMessageBubble
                      key={msg.id}
                      sender={msg.sender}
                      text={msg.text}
                      time={msg.time}
                      applied={msg.applied}
                      hasCards={Boolean(
                        (msg.cards?.items?.length && !['trains', 'buses'].includes(msg.cards?.type)) ||
                          msg.places?.length
                      )}
                    >
                      {msg.sender === 'bot' &&
                        msg.cards?.items?.length > 0 &&
                        !['places', 'events', 'visa_sources', 'trains', 'buses'].includes(msg.cards.type) && (
                          <VeroCardsDeck cards={msg.cards} onSelect={handleSendMessage} />
                        )}
                      {msg.sender === 'bot' && msg.cards?.type === 'visa_sources' ? (
                        <VeroVisaSources cards={msg.cards} />
                      ) : null}
                      {msg.sender === 'bot' &&
                      (msg.places?.length || msg.cards?.type === 'places' || msg.cards?.type === 'events') ? (
                        <VeroPlaceCards places={msg.places || msg.cards.items} />
                      ) : null}
                    </VeroMessageBubble>
                  ))}
                  {isTyping && (
                    <VeroMessageBubble
                      sender="bot"
                      typing
                      typingNode={<VeroTypingStatus active userMessage={typingFor} />}
                    />
                  )}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </div>

            <div className="vero-fs-input-section">
              {!isTyping && chips.length > 0 && (
                <SuggestionChips suggestions={chips} onSelect={handleSendMessage} disabled={isTyping} />
              )}
              <div className="vero-fs-input-container">
                <input
                  type="text"
                  className="vero-fs-text-input"
                  placeholder="Tell Vero the trip…"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={handleKeyPress}
                  disabled={isTyping}
                />
                {voice?.toggleVoice ? (
                  <button
                    type="button"
                    className="vero-mic-btn"
                    onClick={voice.toggleVoice}
                    aria-label="Talk to Vero"
                  >
                    <Mic size={18} />
                  </button>
                ) : null}
                <button
                  className="vero-fs-send-btn"
                  onClick={handleSendMessage}
                  disabled={isTyping || !inputValue.trim()}
                  aria-label="Send"
                >
                  <ArrowUp size={18} color="#fff" />
                </button>
              </div>
            </div>
          </>
        </main>
      </div>
    </div>
  );
}
