import { APP_CONFIG } from "@/app/config";
import { ENDPOINTS } from "@/services/endpoints";

/** Chat can include LiteAPI search - allow longer than a normal REST call. */
const CHAT_TIMEOUT_MS = 120_000;

function chatPath() {
  const path = ENDPOINTS.VERO.CHAT.startsWith("/")
    ? ENDPOINTS.VERO.CHAT
    : `/${ENDPOINTS.VERO.CHAT}`;
  return path;
}

function stripSlash(url) {
  return String(url || "").replace(/\/$/, "");
}

function veroBases() {
  const primary = stripSlash(
    APP_CONFIG.VERO_API_BASE_URL || "http://127.0.0.1:8001"
  );
  // DEV often uses Vite proxy: API_BASE_URL === "" → fetch("/api/chat") → :8000.
  // Never skip that fallback when Vero (:8001) is down.
  const apiConfigured = APP_CONFIG.API_BASE_URL;
  const supervisorRel =
    apiConfigured === "" && import.meta.env.DEV
      ? ""
      : stripSlash(apiConfigured || "http://127.0.0.1:8000");
  const bases = [];
  const push = (b) => {
    if (b == null) return;
    if (!bases.includes(b)) bases.push(b);
  };
  push(primary);
  push(supervisorRel);
  if (primary.includes("8001")) {
    push("http://127.0.0.1:8000");
  }
  return bases.length ? bases : ["http://127.0.0.1:8001", "http://127.0.0.1:8000"];
}

/** Voice STT/TTS live only on Vero (:8001). Never fall back to supervisor (:8000). */
function voiceBases() {
  const vero = stripSlash(APP_CONFIG.VERO_API_BASE_URL || "http://127.0.0.1:8001");
  return vero ? [vero] : ["http://127.0.0.1:8001"];
}

function isUnreachable(err) {
  if (!err) return false;
  if (err.name === "AbortError") return false;
  if (err.code === "unreachable") return true;
  const msg = String(err.message || "");
  return (
    msg.includes("Failed to fetch") ||
    msg.includes("NetworkError") ||
    msg.includes("Load failed") ||
    err.status === 502 ||
    err.status === 503
  );
}

function buildPayload(body) {
  const thread = body.thread_id || body.session_id || body.threadId || "itinero-web";
  const payload = {
    message: body.message || body.text || "",
    thread_id: thread,
    session_id: body.session_id || thread,
  };
  if (Array.isArray(body.history) && body.history.length) {
    payload.history = body.history;
  }
  if (body.session_context && typeof body.session_context === "object") {
    payload.session_context = body.session_context;
  }
  if (body.page_context && typeof body.page_context === "object") {
    payload.page_context = body.page_context;
  }
  if (body.slot_answers && typeof body.slot_answers === "object") {
    payload.slot_answers = body.slot_answers;
  }
  if (body.voice_mode) payload.voice_mode = true;
  if (body.spoken_language) payload.spoken_language = body.spoken_language;
  if (body.traveler && typeof body.traveler === "object") {
    payload.traveler = body.traveler;
  }
  return payload;
}

function normalizeChatResponse(data, fallbackThread) {
  const reply =
    data?.reply || data?.response || data?.message || data?.content || "";
  return {
    reply,
    response: data?.response || reply,
    cards: data?.cards || null,
    flights: Array.isArray(data?.flights) ? data.flights : null,
    places: Array.isArray(data?.places) ? data.places : null,
    ui_prompts: Array.isArray(data?.ui_prompts) ? data.ui_prompts : null,
    clarification: data?.clarification || null,
    suggestions: Array.isArray(data?.suggestions) ? data.suggestions : null,
    session_id: data?.session_id || data?.thread_id || fallbackThread,
    thread_id: data?.thread_id || data?.session_id || fallbackThread,
    session_context: data?.session_context || null,
    routed_to: data?.routed_to || "vero",
    active_specialist: data?.active_specialist || "vero",
    route_path: Array.isArray(data?.route_path) ? data.route_path : ["vero"],
    architecture_stage: data?.architecture_stage || null,
    mode: data?.mode || null,
    error: data?.error || null,
    preferred_name: data?.preferred_name || null,
    address_style: data?.address_style || null,
  };
}

async function postChat(base, payload, signal) {
  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  try {
    const token = localStorage.getItem("itinero_auth_token");
    if (token) headers.Authorization = `Bearer ${token}`;
  } catch {
    /* ignore */
  }

  const response = await fetch(`${base}${chatPath()}`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
    signal,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const detail =
      errorData.message ||
      errorData.detail ||
      (typeof errorData.error === "string" ? errorData.error : null) ||
      `HTTP ${response.status}`;
    const error = new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
    error.status = response.status;
    error.code = `http_${response.status}`;
    throw error;
  }

  return response.json();
}

/**
 * Vero chat → general_agent (8001), then supervisor (8000) if Vero is down.
 */
async function chat(body) {
  const payload = buildPayload(body);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CHAT_TIMEOUT_MS);
  const bases = veroBases();
  let lastUnreachable = null;

  try {
    for (let i = 0; i < bases.length; i += 1) {
      const base = bases[i];
      try {
        const data = await postChat(base, payload, controller.signal);
        return normalizeChatResponse(data, payload.thread_id);
      } catch (err) {
        if (err?.name === "AbortError") {
          const error = new Error(
            "Vero took too long (120s). Try New Chat, then ask again with a date - or use the Flights search bar for the same live fares."
          );
          error.code = "timeout";
          throw error;
        }
        if (isUnreachable(err) && i < bases.length - 1) {
          lastUnreachable = err;
          continue;
        }
        if (isUnreachable(err)) {
          lastUnreachable = err;
          break;
        }
        throw err;
      }
    }

    const error = new Error(
      `Can't reach Vero chat. Tried ${bases
        .map((b) => (b === "" ? "same-origin /api (supervisor)" : b))
        .join(" → ")}. ` +
        `Start supervisor: uvicorn supervisor.main:app --port 8000 · ` +
        `and Vero: uvicorn general_agent.run:app --port 8001`
    );
    error.code = "unreachable";
    error.cause = lastUnreachable;
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

let playback = { audio: null, source: null, resolve: null };
let audioCtx = null;

function httpDetail(data, fallback) {
  const detail = data?.detail ?? data?.message ?? data?.error;
  if (typeof detail === "string" && detail.trim()) return detail.trim();
  if (detail && typeof detail === "object") {
    const msg = detail.message || detail.msg || detail.error;
    if (msg) return String(msg);
  }
  if (Array.isArray(detail) && detail[0]?.msg) return String(detail[0].msg);
  return fallback;
}

function writeStr(view, offset, str) {
  for (let i = 0; i < str.length; i += 1) view.setUint8(offset + i, str.charCodeAt(i));
}

function audioBufferToWav(buffer) {
  const sampleRate = buffer.sampleRate || 22050;
  let samples;
  if (buffer.numberOfChannels === 1) {
    samples = buffer.getChannelData(0);
  } else {
    const left = buffer.getChannelData(0);
    const right = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : left;
    samples = new Float32Array(left.length);
    for (let i = 0; i < left.length; i += 1) samples[i] = (left[i] + right[i]) * 0.5;
  }
  const pcm = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i += 1) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  const bytes = pcm.byteLength;
  const out = new ArrayBuffer(44 + bytes);
  const view = new DataView(out);
  writeStr(view, 0, "RIFF");
  view.setUint32(4, 36 + bytes, true);
  writeStr(view, 8, "WAVE");
  writeStr(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(view, 36, "data");
  view.setUint32(40, bytes, true);
  new Uint8Array(out, 44).set(new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength));
  return new Blob([out], { type: "audio/wav" });
}

async function blobForStt(blob) {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) throw new Error("no-ac");
    if (!audioCtx) audioCtx = new AC();
    if (audioCtx.state === "suspended") await audioCtx.resume();
    const decoded = await audioCtx.decodeAudioData(await blob.arrayBuffer());
    return { blob: audioBufferToWav(decoded), filename: "speech.wav" };
  } catch {
    const type = String(blob.type || "audio/webm").split(";")[0].trim() || "audio/webm";
    const ext = type.includes("wav")
      ? "wav"
      : type.includes("mp4") || type.includes("m4a")
        ? "m4a"
        : type.includes("ogg") || type.includes("opus")
          ? "ogg"
          : "webm";
    return { blob: new Blob([blob], { type }), filename: `speech.${ext}` };
  }
}

async function voiceStatus() {
  const bases = voiceBases();
  for (const base of bases) {
    try {
      const res = await fetch(`${base}/api/voice/status`, { method: "GET" });
      if (!res.ok) continue;
      return await res.json();
    } catch {
      /* try next */
    }
  }
  return { ok: false, stt: false, tts: false, provider: null };
}

async function transcribeAudio(blob, languageCode) {
  const bases = voiceBases();
  const prepared = await blobForStt(blob);
  const form = new FormData();
  form.append("file", prepared.blob, prepared.filename);
  if (languageCode) form.append("language_code", languageCode);
  let lastErr = null;
  for (const base of bases) {
    try {
      const res = await fetch(`${base}/api/voice/stt`, { method: "POST", body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        lastErr = new Error(httpDetail(data, `STT ${res.status}`));
        continue;
      }
      return data;
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error("STT unavailable");
}

function unlockAudio() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!audioCtx) audioCtx = new AC();
    if (audioCtx.state === "suspended") audioCtx.resume();
    const buf = audioCtx.createBuffer(1, 1, 22050);
    const src = audioCtx.createBufferSource();
    src.buffer = buf;
    src.connect(audioCtx.destination);
    src.start(0);
  } catch {
    /* ignore */
  }
}

function stopSpeaking() {
  try {
    playback.audio?.pause();
  } catch {
    /* ignore */
  }
  try {
    playback.source?.stop();
  } catch {
    /* ignore */
  }
  playback.audio = null;
  playback.source = null;
  try {
    window.speechSynthesis?.cancel();
  } catch {
    /* ignore */
  }
  playback.resolve?.();
  playback.resolve = null;
}

async function playBuffer(arrayBuf) {
  unlockAudio();
  const AC = window.AudioContext || window.webkitAudioContext;
  if (AC) {
    if (!audioCtx) audioCtx = new AC();
    if (audioCtx.state === "suspended") await audioCtx.resume();
    try {
      const decoded = await audioCtx.decodeAudioData(arrayBuf.slice(0));
      await new Promise((resolve) => {
        const src = audioCtx.createBufferSource();
        playback.source = src;
        playback.resolve = resolve;
        src.buffer = decoded;
        src.connect(audioCtx.destination);
        src.onended = () => {
          playback.source = null;
          playback.resolve = null;
          resolve();
        };
        src.start(0);
      });
      return;
    } catch {
      /* fall through to HTMLAudio */
    }
  }
  const audio = new Audio(URL.createObjectURL(new Blob([arrayBuf], { type: "audio/wav" })));
  playback.audio = audio;
  await new Promise((resolve, reject) => {
    playback.resolve = resolve;
    audio.onended = () => {
      playback.resolve = null;
      playback.audio = null;
      resolve();
    };
    audio.onerror = () => {
      playback.resolve = null;
      playback.audio = null;
      reject(new Error("Could not play Vero audio"));
    };
    audio.play().catch((err) => {
      playback.resolve = null;
      playback.audio = null;
      reject(err);
    });
  });
}

async function speakText(text, languageCode) {
  stopSpeaking();
  unlockAudio();
  const bases = voiceBases();
  const body = JSON.stringify({ text, language_code: languageCode || undefined });
  let lastErr = null;
  for (const base of bases) {
    try {
      const res = await fetch(`${base}/api/voice/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "audio/wav" },
        body,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        lastErr = new Error(httpDetail(data, `TTS ${res.status}`));
        continue;
      }
      const buf = await res.arrayBuffer();
      if (!buf || buf.byteLength < 64) {
        lastErr = new Error("TTS unavailable");
        continue;
      }
      await playBuffer(buf);
      return;
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error("TTS unavailable");
}

export const veroService = {
  chat,
  getSuggestions: async () => null,
  voiceStatus,
  transcribeAudio,
  speakText,
  stopSpeaking,
  unlockAudio,
};
