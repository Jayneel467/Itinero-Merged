import { storage } from "@/utils/storage";

const KEY = "vero_chats";
const MAX_THREADS = 40;
const MAX_MSGS = 100;

function emptyState() {
  return { activeId: null, threads: [] };
}

export function loadChatState() {
  const raw = storage.get(KEY, null);
  if (!raw || !Array.isArray(raw.threads)) return emptyState();
  return { activeId: raw.activeId || null, threads: raw.threads };
}

function persist(state) {
  storage.set(KEY, {
    activeId: state.activeId,
    threads: (state.threads || []).slice(0, MAX_THREADS),
  });
}

export function newThreadId() {
  return `vero-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function titleFromMessages(messages) {
  const firstUser = (messages || []).find((m) => m.role === "user" || m.sender === "user");
  const text = firstUser?.content || firstUser?.text || "";
  const clean = String(text).replace(/\s+/g, " ").trim();
  if (!clean) return "New chat";
  return clean.length > 42 ? `${clean.slice(0, 42)}…` : clean;
}

export function hasUserTurn(messages) {
  return (messages || []).some((m) => m.role === "user" || m.sender === "user");
}

export function fromWidgetMessages(messages) {
  return (messages || []).map((m) => ({
    id: m.id,
    role: m.sender === "user" || m.role === "user" ? "user" : "assistant",
    content: m.text || m.content || "",
    time: m.time || "",
    cards: m.cards || null,
    suggestions: m.suggestions || null,
    flights: m.flights || null,
    places: m.places || null,
    ui_prompts: m.ui_prompts || null,
    clarification: m.clarification || null,
    meta: m.meta || null,
  }));
}

export function toWidgetMessages(messages) {
  return (messages || []).map((m, i) => ({
    id: m.id || i + 1,
    sender: m.role === "user" || m.sender === "user" ? "user" : "bot",
    text: m.content || m.text || "",
    time: m.time || "",
    cards: m.cards || m.extra?.cards || null,
    suggestions: m.suggestions || m.extra?.suggestions || null,
    flights: m.flights || m.extra?.flights || null,
    places: m.places || m.extra?.places || null,
    ui_prompts: m.ui_prompts || m.extra?.ui_prompts || null,
    clarification: m.clarification || m.extra?.clarification || null,
    meta: m.meta || m.extra?.meta || null,
  }));
}

export function upsertThread({ id, messages, sessionId, sessionContext, title }) {
  if (!id) return null;
  const state = loadChatState();
  const now = Date.now();
  const slim = (messages || []).slice(-MAX_MSGS);
  if (!hasUserTurn(slim)) return null;
  const existing = state.threads.find((t) => t.id === id);
  const thread = {
    id,
    title: title || titleFromMessages(slim),
    updatedAt: now,
    createdAt: existing?.createdAt || now,
    sessionId: sessionId || existing?.sessionId || id,
    sessionContext: sessionContext ?? existing?.sessionContext ?? null,
    messages: slim,
  };
  persist({
    activeId: id,
    threads: [thread, ...state.threads.filter((t) => t.id !== id)],
  });
  return thread;
}

export function listThreads() {
  return [...loadChatState().threads].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

export function getThread(id) {
  if (!id) return null;
  return loadChatState().threads.find((t) => t.id === id) || null;
}

export function getActiveThread() {
  const state = loadChatState();
  if (!state.activeId) return null;
  return state.threads.find((t) => t.id === state.activeId) || null;
}

export function setActiveId(id) {
  const state = loadChatState();
  persist({ ...state, activeId: id || null });
}

export function deleteThread(id) {
  const state = loadChatState();
  const threads = state.threads.filter((t) => t.id !== id);
  persist({
    activeId: state.activeId === id ? threads[0]?.id || null : state.activeId,
    threads,
  });
}
