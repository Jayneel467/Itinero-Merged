import { useState, useEffect, useRef, useCallback } from 'react'
import {
  ArrowUp, Briefcase, CalendarDays, Globe2,
  MessageSquare, Mic, Plane, Plus, Share2,
  UserRound, X,
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import './index.css'

// ── Quick actions on empty state ──────────────────────────────────────
const QUICK_ACTIONS = [
  { id: 'flights', title: 'Flights',  sub: 'Search & Book',    Icon: Plane,       prompt: 'I want to search and book flights' },
  { id: 'hotels',  title: 'Hotels',   sub: 'Find & Book',      Icon: Briefcase,   prompt: 'I want to find and book hotels' },
  { id: 'trips',   title: 'My Trips', sub: 'View & Manage',    Icon: CalendarDays,prompt: 'Show my upcoming trips' },
  { id: 'explore', title: 'Explore',  sub: 'Discover Places',  Icon: Globe2,      prompt: 'Suggest me some amazing travel destinations' },
]

// ── API call to general_agent via FastAPI proxy ───────────────────────
async function chatWithVero(message, threadId) {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, thread_id: threadId }),
  })
  if (!res.ok) throw new Error(`Server error: ${res.status}`)
  const data = await res.json()
  return {
    reply: data.reply || data.message || data.content || '',
    cards: data.cards || null,
  }
}

// ── Currency symbol resolver ─────────────────────────────────────────
function getCurrencySymbol(code) {
  const map = {
    INR: '₹', USD: '$', EUR: '€', GBP: '£',
    AED: 'AED ', SGD: 'S$', THB: '฿', JPY: '¥',
    AUD: 'A$', CAD: 'C$', CHF: 'CHF ', MYR: 'RM ',
  }
  return map[code] || (code ? code + ' ' : '$')
}

// ── Markdown renderer ──────────────────────────────────────────────────
// Real CommonMark (react-markdown + remark-gfm: nested lists, tables, links,
// code blocks) instead of a hand-rolled parser, themed to match the app's
// existing look (orange accent, spacing) via component overrides.
const MARKDOWN_COMPONENTS = {
  h1: (props) => <h1 style={{ margin: '12px 0 4px', fontSize: '1.1em', fontWeight: 700, color: '#f97211' }} {...props} />,
  h2: (props) => <h2 style={{ margin: '12px 0 4px', fontSize: '1em', fontWeight: 700, color: '#f97211', letterSpacing: '0.01em' }} {...props} />,
  h3: (props) => <h3 style={{ margin: '8px 0 2px', fontSize: '0.92em', fontWeight: 600, color: '#e5e7eb' }} {...props} />,
  hr: () => <hr style={{ border: 'none', borderTop: '1px solid rgba(255,255,255,0.08)', margin: '8px 0' }} />,
  ul: (props) => <ul style={{ margin: '4px 0 4px 18px', padding: 0 }} {...props} />,
  ol: (props) => <ol style={{ margin: '4px 0 4px 18px', padding: 0 }} {...props} />,
  li: (props) => <li style={{ lineHeight: '1.6', marginBottom: 2 }} {...props} />,
  p: (props) => <p style={{ margin: '0 0 0.4em', lineHeight: '1.58' }} {...props} />,
  em: (props) => <em style={{ opacity: 0.8 }} {...props} />,
  a: (props) => <a style={{ color: '#f97211' }} target="_blank" rel="noreferrer" {...props} />,
  table: (props) => (
    <div style={{ overflowX: 'auto', margin: '6px 0' }}>
      <table style={{ borderCollapse: 'collapse', width: '100%' }} {...props} />
    </div>
  ),
  th: (props) => <th style={{ textAlign: 'left', padding: '6px 10px', borderBottom: '1px solid rgba(255,255,255,0.15)', color: '#f97211' }} {...props} />,
  td: (props) => <td style={{ padding: '6px 10px', borderBottom: '1px solid rgba(255,255,255,0.06)' }} {...props} />,
  code: (props) => <code style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 4, padding: '1px 5px', fontSize: '0.9em' }} {...props} />,
}

function renderMarkdown(text) {
  if (!text) return null
  // Strip any leaked internal JSON blocks
  const cleanText = text.replace(/\[CARDS_DATA:[\s\S]*?\]/g, '').trim()
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={MARKDOWN_COMPONENTS}>
      {cleanText}
    </ReactMarkdown>
  )
}

// ── Cards renderer (Flight & Hotel cards deck) ───────────────────────────
function CardsDeck({ cards, onSelectCard }) {
  if (!cards || !Array.isArray(cards.items) || cards.items.length === 0) return null

  if (cards.type === 'flights') {
    return (
      <div className="card-section">
        <div className="card-section__header">
          <span className="card-section__title">
            <Plane size={15} color="#f97211" />
            {cards.title || 'Available Flights'}
          </span>
          {cards.subtitle && <span className="card-section__subtitle">{cards.subtitle}</span>}
        </div>
        <div className="card-deck">
          {cards.items.map((item, idx) => (
            <div key={idx} className="flight-card">
              <div className="flight-card__top">
                <div className="flight-card__airline">
                  <div className="flight-card__logo">
                    {(item.airline || 'FL')[0].toUpperCase()}
                  </div>
                  <div>
                    <div className="flight-card__name">{item.airline || 'Airline'}</div>
                    <div className="flight-card__code">{item.flight_code}</div>
                  </div>
                </div>
                {item.refundable && <span className="card-badge card-badge--green">Refundable</span>}
              </div>

              <div className="flight-card__route">
                <div className="flight-card__time-block">
                  <div className="flight-card__time">{item.dep_time}</div>
                  <div className="flight-card__iata">{item.origin}</div>
                </div>

                <div className="flight-card__duration-block">
                  <span className="flight-card__duration">{item.duration}</span>
                  <div className="flight-card__line" />
                  <span className="flight-card__stops">{item.stops}</span>
                </div>

                <div className="flight-card__time-block">
                  <div className="flight-card__time">{item.arr_time}</div>
                  <div className="flight-card__iata">{item.dest}</div>
                </div>
              </div>

              <div className="flight-card__tags">
                {item.has_checked_bag && <span className="card-badge">🧳 Checked Bag</span>}
                {item.fare_family && <span className="card-badge">{item.fare_family}</span>}
              </div>

              <div className="flight-card__bottom">
                <div className="flight-card__price">
                  {item.currency === 'INR' ? '₹' : item.currency + ' '}
                  {typeof item.price === 'number' ? item.price.toLocaleString() : item.price}
                  <span>/person</span>
                </div>
                <button
                  type="button"
                  className="flight-card__btn"
                  onClick={() => onSelectCard(`I'll select the ${item.airline} flight ${item.flight_code} (${item.dep_time} - ${item.arr_time}) for ${item.currency === 'INR' ? '₹' : ''}${item.price}`)}
                >
                  Select
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (cards.type === 'hotels') {
    return (
      <div className="card-section">
        <div className="card-section__header">
          <span className="card-section__title">
            <Briefcase size={15} color="#f97211" />
            {cards.title || 'Recommended Hotels'}
          </span>
          {cards.subtitle && <span className="card-section__subtitle">{cards.subtitle}</span>}
        </div>
        <div className="card-deck">
          {cards.items.map((item, idx) => (
            <div key={idx} className="hotel-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                {item.rating ? (
                  <span className="hotel-card__rating">★ {item.rating}</span>
                ) : (
                  <span className="card-badge">Hotel</span>
                )}
                {item.refundable && <span className="card-badge card-badge--green">Refundable</span>}
              </div>

              <div>
                <div className="hotel-card__name">{item.name}</div>
                {item.address && <div className="hotel-card__address">{item.address}</div>}
              </div>

              {item.room_name && (
                <div className="hotel-card__room">
                  {item.room_name} {item.board ? `(${item.board})` : ''}
                </div>
              )}

              <div className="hotel-card__bottom">
                <div className="hotel-card__price">
                  {getCurrencySymbol(item.currency)}{typeof item.price === 'number' ? item.price.toLocaleString() : item.price}
                  <span> total</span>
                </div>
                <button
                  type="button"
                  className="flight-card__btn"
                  onClick={() => onSelectCard(`I want to choose ${item.name} (${item.room_name || 'Room'}) for ${getCurrencySymbol(item.currency)}${item.price}`)}
                >
                  Select
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return null
}

export default function App() {
  const [messages,   setMessages]   = useState([])
  const [draft,      setDraft]      = useState('')
  const [isTyping,   setIsTyping]   = useState(false)
  const [error,      setError]      = useState('')
  const [listening,  setListening]  = useState(false)
  const [shareHint,  setShareHint]  = useState('')
  const [threadId,   setThreadId]   = useState(() => `t-${Date.now()}`)

  // Chat history (localStorage)
  const [chatHistory, setChatHistory] = useState(() => {
    try { return JSON.parse(localStorage.getItem('vero_history') || '[]') } catch { return [] }
  })

  const bottomRef    = useRef(null)
  const inputRef     = useRef(null)
  const recognRef    = useRef(null)

  // Auto-scroll on new message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, isTyping])

  // ── Send message ────────────────────────────────────────────────────
  const sendMessage = useCallback(async (text) => {
    const content = (text || draft).trim()
    if (!content || isTyping) return
    setDraft('')
    setError('')
    setMessages(prev => [...prev, { role: 'user', content }])
    setIsTyping(true)
    try {
      const { reply, cards } = await chatWithVero(content, threadId)
      // Each message permanently owns its card deck.
      // The backend already ensures cards are only returned for the current
      // turn's tool calls — so stale flight/hotel cards never re-appear.
      setMessages(prev => [...prev, { role: 'assistant', content: reply, cards }])
    } catch (err) {
      setError(err.message || 'Could not reach Vero. Is the API server running?')
    } finally {
      setIsTyping(false)
      inputRef.current?.focus()
    }
  }, [draft, isTyping, threadId])

  // ── New chat ─────────────────────────────────────────────────────────
  const handleNewChat = useCallback(() => {
    if (messages.length > 0) {
      const firstUser = messages.find(m => m.role === 'user')
      const title = firstUser
        ? (firstUser.content || '').slice(0, 44) + (firstUser.content?.length > 44 ? '…' : '')
        : 'Chat session'
      const entry = { id: threadId, title, ts: Date.now() }
      const updated = [entry, ...chatHistory.filter(h => h.id !== threadId)].slice(0, 30)
      setChatHistory(updated)
      try { localStorage.setItem('vero_history', JSON.stringify(updated)) } catch {}
    }
    setMessages([])
    setDraft('')
    setError('')
    setIsTyping(false)
    setThreadId(`t-${Date.now()}`)
    setTimeout(() => inputRef.current?.focus(), 50)
  }, [messages, threadId, chatHistory])

  // ── Share ─────────────────────────────────────────────────────────────
  async function handleShare() {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setShareHint('Link copied')
      setTimeout(() => setShareHint(''), 2000)
    } catch {}
  }

  // ── Mic ──────────────────────────────────────────────────────────────
  function handleMic() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) { setShareHint('Voice not supported'); setTimeout(() => setShareHint(''), 2000); return }
    if (listening && recognRef.current) { recognRef.current.stop(); setListening(false); return }
    const r = new SR()
    r.lang = 'en-IN'; r.interimResults = false
    r.onresult = (e) => { const t = e.results?.[0]?.[0]?.transcript || ''; if (t) setDraft(p => p ? `${p} ${t}` : t) }
    r.onerror = r.onend = () => setListening(false)
    recognRef.current = r
    setListening(true)
    r.start()
  }

  // ── Submit ────────────────────────────────────────────────────────────
  function onSubmit(e) {
    e.preventDefault()
    sendMessage()
  }

  const hasMessages = messages.length > 0

  return (
    <div className="shell">
      {/* ── Sidebar ── */}
      <aside className="sidebar">
        {/* Brand */}
        <div className="sidebar__brand">
          <div className="sidebar__logo">V</div>
          <div>
            <div className="sidebar__name">Itinero</div>
            <div className="sidebar__tag">AI travel buddy</div>
          </div>
        </div>

        {/* New Chat */}
        <button className="sidebar__new-chat" onClick={handleNewChat}>
          <Plus size={15} strokeWidth={2.5} />
          New Chat
        </button>

        {/* Nav */}
        <nav className="sidebar__nav">
          <button className="sidebar__item active">
            <Plane size={17} strokeWidth={2} />
            <span>Vero Chat</span>
          </button>
          <button className="sidebar__item" onClick={() => sendMessage('Show my upcoming trips')}>
            <Briefcase size={17} strokeWidth={2} />
            <span>My Trips</span>
          </button>
          <button className="sidebar__item" onClick={() => sendMessage('I want to book flight or hotel')}>
            <CalendarDays size={17} strokeWidth={2} />
            <span>Booking</span>
          </button>
          <button className="sidebar__item" onClick={() => sendMessage('Help me set my travel profile')}>
            <UserRound size={17} strokeWidth={2} />
            <span>Profile</span>
          </button>
        </nav>

        {/* Chat history */}
        {chatHistory.length > 0 && (
          <div className="sidebar__section">
            <p className="sidebar__section-label">Recent</p>
            <div className="sidebar__history">
              {chatHistory.slice(0, 14).map(entry => (
                <button key={entry.id} className="sidebar__history-item" title={entry.title}>
                  <MessageSquare size={13} strokeWidth={1.8} />
                  <span>{entry.title}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </aside>

      {/* ── Main ── */}
      <div className="main">
        {/* Topbar */}
        <div className="topbar">
          {shareHint && <span style={{ fontSize: 12, color: '#6b7280', marginRight: 4 }}>{shareHint}</span>}
          <button className="topbar__btn" onClick={handleShare} title="Copy link">
            <Share2 size={17} strokeWidth={2} />
          </button>
          <button className="topbar__btn" onClick={handleNewChat} title="New chat">
            <X size={17} strokeWidth={2} />
          </button>
        </div>

        {/* Thread */}
        <div className="thread" role="log" aria-live="polite">
          {/* Empty state */}
          {!hasMessages && (
            <div className="empty">
              <div className="empty__logo">V</div>
              <h1 className="empty__title">Hi! I'm Vero</h1>
              <p className="empty__sub">Your AI travel assistant</p>
              <p className="empty__hint">
                Tell me your travel plans and I'll help<br />create unforgettable journeys.
              </p>
              <div className="tiles" role="group">
                {QUICK_ACTIONS.map(({ id, title, sub, Icon, prompt }) => (
                  <button
                    key={id}
                    className="tile"
                    onClick={() => sendMessage(prompt)}
                    disabled={isTyping}
                  >
                    <span className="tile__icon"><Icon size={20} strokeWidth={2} /></span>
                    <span className="tile__title">{title}</span>
                    <span className="tile__sub">{sub}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Messages */}
          {messages.map((m, i) => (
            <div key={i} className={`bubble${m.role === 'user' ? ' bubble--user' : ''}`}>
              <span className="bubble__who">{m.role === 'user' ? 'You' : 'Vero'}</span>
              <div className="bubble__text">
                {renderMarkdown(m.content)}
                {m.cards && <CardsDeck cards={m.cards} onSelectCard={(prompt) => sendMessage(prompt)} />}
              </div>
            </div>
          ))}

          {/* Typing indicator */}
          {isTyping && (
            <div className="typing">
              <div className="typing__dots">
                <i /><i /><i />
              </div>
              <span style={{ fontSize: 12, color: '#9ca3af' }}>Vero is thinking…</span>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Error */}
        {error && <div className="error-bar">{error}</div>}

        {/* Composer */}
        <form className="composer" onSubmit={onSubmit}>
          <div className="composer__shell">
            <button
              type="button"
              className="composer__tool"
              title="Attach file"
              disabled={isTyping}
              onClick={() => {}}
            >
              <Plus size={17} strokeWidth={2.25} />
            </button>
            <input
              ref={inputRef}
              className="composer__input"
              value={draft}
              onChange={e => setDraft(e.target.value)}
              placeholder="Where to Next?"
              disabled={isTyping}
              autoComplete="off"
              aria-label="Message Vero"
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
              }}
            />
            <button
              type="button"
              className={`composer__tool${listening ? ' listening' : ''}`}
              onClick={handleMic}
              disabled={isTyping}
              title={listening ? 'Stop' : 'Voice input'}
            >
              <Mic size={17} strokeWidth={2.25} />
            </button>
            <button
              type="submit"
              className="composer__send"
              disabled={isTyping || !draft.trim()}
              aria-label="Send"
            >
              <ArrowUp size={17} strokeWidth={2.5} />
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
