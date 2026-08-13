const TTS_LANGS = new Set([
  "en-IN",
  "hi-IN",
  "bn-IN",
  "ta-IN",
  "te-IN",
  "kn-IN",
  "ml-IN",
  "mr-IN",
  "pa-IN",
  "od-IN",
  "gu-IN",
]);

const ALIASES = {
  en: "en-IN",
  "en-us": "en-IN",
  "en-gb": "en-IN",
  hi: "hi-IN",
  gu: "gu-IN",
  bn: "bn-IN",
  ta: "ta-IN",
  te: "te-IN",
  kn: "kn-IN",
  ml: "ml-IN",
  mr: "mr-IN",
  pa: "pa-IN",
  or: "od-IN",
  od: "od-IN",
  ar: "ar",
  es: "es",
  fr: "fr",
  de: "de",
  pt: "pt-BR",
  ru: "ru",
  it: "it",
  ja: "ja-JP",
  ko: "ko-KR",
  zh: "zh-CN",
  th: "th-TH",
  vi: "vi",
  ms: "ms",
  id: "id",
  pl: "pl",
  tr: "tr",
  nl: "nl",
};

const GUJ_ROMAN = /\b(kem|chho|chhe|cho|shu\s+che|su\s+che|baro|barabar|kyare|aavu|avu)\b/i;
const HI_ROMAN = /\b(kya|hai|hain|mujhe|chahiye|kitna|kahan|theek|accha|acha|namaste)\b/i;

export function detectSpokenLang(text, fallback = "en-IN") {
  const sample = String(text || "");
  if (/[\u0A80-\u0AFF]/.test(sample)) return "gu-IN";
  if (/[\u0A00-\u0A7F]/.test(sample)) return "pa-IN";
  if (/[\u0980-\u09FF]/.test(sample)) return "bn-IN";
  if (/[\u0B80-\u0BFF]/.test(sample)) return "ta-IN";
  if (/[\u0C00-\u0C7F]/.test(sample)) return "te-IN";
  if (/[\u0C80-\u0CFF]/.test(sample)) return "kn-IN";
  if (/[\u0D00-\u0D7F]/.test(sample)) return "ml-IN";
  if (/[\u0B00-\u0B7F]/.test(sample)) return "od-IN";
  if (/[\u0900-\u097F]/.test(sample)) return "hi-IN";
  if (/[\u0600-\u06FF]/.test(sample)) return "ar";
  if (/[\u0E00-\u0E7F]/.test(sample)) return "th-TH";
  if (/[\u3040-\u30FF]/.test(sample)) return "ja-JP";
  if (/[\uAC00-\uD7AF]/.test(sample)) return "ko-KR";
  if (/[\u4E00-\u9FFF]/.test(sample)) return "zh-CN";
  if (/[\u0400-\u04FF]/.test(sample)) return "ru";
  if (/[\u0100-\u024F\u1EA0-\u1EF9]/.test(sample)) return "vi";
  if (GUJ_ROMAN.test(sample)) return "gu-IN";
  if (HI_ROMAN.test(sample)) return "hi-IN";
  return fallback;
}

export function normalizeSpokenLang(tag, fallback = "en-IN") {
  const raw = String(tag || "").trim();
  if (!raw) return fallback;
  if (TTS_LANGS.has(raw)) return raw;
  const lower = raw.toLowerCase().replace("_", "-");
  if (ALIASES[lower]) return ALIASES[lower];
  const base = lower.split("-")[0];
  if (ALIASES[base]) return ALIASES[base];
  if (/^[a-z]{2}(-[a-z0-9]+)?$/i.test(raw)) return raw;
  return fallback;
}

export function sarvamCanSpeak(tag) {
  return TTS_LANGS.has(normalizeSpokenLang(tag, ""));
}

export function isNonEnglishLang(tag) {
  const t = String(tag || "").toLowerCase();
  return Boolean(t) && !t.startsWith("en");
}

export function speakableText(text) {
  let out = String(text || "")
    .replace(/```itinero-action[\s\S]*?```/gi, " ")
    .replace(/\[CARDS_DATA:[\s\S]*?\]/gi, " ")
    .replace(/[#*_`>|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (out.length <= 380) return out;
  const parts = out.match(/[^.!?]+[.!?]+/g);
  if (parts?.length) {
    let acc = "";
    for (const s of parts) {
      if (acc && (acc + s).length > 380) break;
      acc += s;
      if (acc.trim().split(/[.!?]/).filter(Boolean).length >= 2) break;
    }
    if (acc.trim()) return acc.trim();
  }
  return out.slice(0, 380).replace(/\s+\S*$/, "").trim();
}

export function voiceHint(phase, lang) {
  const gu = String(lang || "").toLowerCase().startsWith("gu");
  const hi = String(lang || "").toLowerCase().startsWith("hi");
  if (phase === "listening") {
    if (gu) return "સાંભળી રહી છું… બોલો";
    if (hi) return "सुन रही हूँ… बोलिए";
    return "Listening…";
  }
  if (phase === "thinking") {
    if (gu) return "વેરો વિચારે છે…";
    if (hi) return "वेरो सोच रही है…";
    return "Thinking…";
  }
  if (phase === "speaking") {
    if (gu) return "વેરો બોલી રહી છે… દબાવો તો અટકશે";
    if (hi) return "वेरो बोल रही है… टैप करके रोकें";
    return "Vero is speaking… tap to interrupt";
  }
  return "";
}

export function voiceGreeting(lang) {
  const tag = String(lang || "").toLowerCase();
  if (tag.startsWith("gu")) return "હું વેરો છું. ક્યાં જવું છે?";
  if (tag.startsWith("hi")) return "मैं वेरो हूँ. कहाँ चलना है?";
  return "I'm Vero. Where are we going?";
}
