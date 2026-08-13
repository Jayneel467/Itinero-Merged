/**
 * Supported UI languages - single source of truth (RegionalModal, Navbar, Vero).
 */
export const LANG_STORAGE_KEY = "itinero_language";

/** Full registry. */
export const LANGUAGES = [
  { code: "en-US", name: "English (US)", flag: "https://flagcdn.com/w40/us.png", rtl: false },
  { code: "en-GB", name: "English (UK)", flag: "https://flagcdn.com/w40/gb.png", rtl: false },
  { code: "en-IN", name: "English (India)", flag: "https://flagcdn.com/w40/in.png", rtl: false },
  { code: "en-AU", name: "English (Australia)", flag: "https://flagcdn.com/w40/au.png", rtl: false },
  { code: "en-CA", name: "English (Canada)", flag: "https://flagcdn.com/w40/ca.png", rtl: false },
  { code: "hi-IN", name: "हिन्दी", flag: "https://flagcdn.com/w40/in.png", rtl: false },
  { code: "bn-IN", name: "বাংলা", flag: "https://flagcdn.com/w40/in.png", rtl: false },
  { code: "ta-IN", name: "தமிழ்", flag: "https://flagcdn.com/w40/in.png", rtl: false },
  { code: "te-IN", name: "తెలుగు", flag: "https://flagcdn.com/w40/in.png", rtl: false },
  { code: "mr-IN", name: "मराठी", flag: "https://flagcdn.com/w40/in.png", rtl: false },
  { code: "gu-IN", name: "ગુજરાતી", flag: "https://flagcdn.com/w40/in.png", rtl: false },
  { code: "es-ES", name: "Español", flag: "https://flagcdn.com/w40/es.png", rtl: false },
  { code: "es-MX", name: "Español (México)", flag: "https://flagcdn.com/w40/mx.png", rtl: false },
  { code: "fr-FR", name: "Français", flag: "https://flagcdn.com/w40/fr.png", rtl: false },
  { code: "fr-CA", name: "Français (Canada)", flag: "https://flagcdn.com/w40/ca.png", rtl: false },
  { code: "de-DE", name: "Deutsch", flag: "https://flagcdn.com/w40/de.png", rtl: false },
  { code: "it-IT", name: "Italiano", flag: "https://flagcdn.com/w40/it.png", rtl: false },
  { code: "pt-BR", name: "Português (BR)", flag: "https://flagcdn.com/w40/br.png", rtl: false },
  { code: "pt-PT", name: "Português (PT)", flag: "https://flagcdn.com/w40/pt.png", rtl: false },
  { code: "nl-NL", name: "Nederlands", flag: "https://flagcdn.com/w40/nl.png", rtl: false },
  { code: "pl-PL", name: "Polski", flag: "https://flagcdn.com/w40/pl.png", rtl: false },
  { code: "sv-SE", name: "Svenska", flag: "https://flagcdn.com/w40/se.png", rtl: false },
  { code: "no-NO", name: "Norsk", flag: "https://flagcdn.com/w40/no.png", rtl: false },
  { code: "da-DK", name: "Dansk", flag: "https://flagcdn.com/w40/dk.png", rtl: false },
  { code: "fi-FI", name: "Suomi", flag: "https://flagcdn.com/w40/fi.png", rtl: false },
  { code: "cs-CZ", name: "Čeština", flag: "https://flagcdn.com/w40/cz.png", rtl: false },
  { code: "ro-RO", name: "Română", flag: "https://flagcdn.com/w40/ro.png", rtl: false },
  { code: "hu-HU", name: "Magyar", flag: "https://flagcdn.com/w40/hu.png", rtl: false },
  { code: "el-GR", name: "Ελληνικά", flag: "https://flagcdn.com/w40/gr.png", rtl: false },
  { code: "uk-UA", name: "Українська", flag: "https://flagcdn.com/w40/ua.png", rtl: false },
  { code: "ru-RU", name: "Русский", flag: "https://flagcdn.com/w40/ru.png", rtl: false },
  { code: "tr-TR", name: "Türkçe", flag: "https://flagcdn.com/w40/tr.png", rtl: false },
  { code: "ar-SA", name: "العربية", flag: "https://flagcdn.com/w40/sa.png", rtl: true },
  { code: "he-IL", name: "עברית", flag: "https://flagcdn.com/w40/il.png", rtl: true },
  { code: "ja-JP", name: "日本語", flag: "https://flagcdn.com/w40/jp.png", rtl: false },
  { code: "zh-CN", name: "简体中文", flag: "https://flagcdn.com/w40/cn.png", rtl: false },
  { code: "zh-TW", name: "繁體中文", flag: "https://flagcdn.com/w40/tw.png", rtl: false },
  { code: "ko-KR", name: "한국어", flag: "https://flagcdn.com/w40/kr.png", rtl: false },
  { code: "id-ID", name: "Bahasa Indonesia", flag: "https://flagcdn.com/w40/id.png", rtl: false },
  { code: "ms-MY", name: "Bahasa Malaysia", flag: "https://flagcdn.com/w40/my.png", rtl: false },
  { code: "th-TH", name: "ภาษาไทย", flag: "https://flagcdn.com/w40/th.png", rtl: false },
  { code: "vi-VN", name: "Tiếng Việt", flag: "https://flagcdn.com/w40/vn.png", rtl: false },
  { code: "fil-PH", name: "Filipino", flag: "https://flagcdn.com/w40/ph.png", rtl: false },
];

/** Languages shown in the Regional modal (searchable). */
export const MODAL_LANGUAGES = LANGUAGES;

export const DEFAULT_LANGUAGE = "en-US";

const BY_CODE = Object.fromEntries(LANGUAGES.map((l) => [l.code, l]));

/** Map UI locale → Vero / browser speech tag. */
const SPOKEN_MAP = {
  "en-US": "en-US",
  "en-GB": "en-GB",
  "en-IN": "en-IN",
  "en-AU": "en-AU",
  "en-CA": "en-CA",
  "hi-IN": "hi-IN",
  "bn-IN": "bn-IN",
  "ta-IN": "ta-IN",
  "te-IN": "te-IN",
  "mr-IN": "mr-IN",
  "gu-IN": "gu-IN",
  "es-ES": "es-ES",
  "es-MX": "es-MX",
  "fr-FR": "fr-FR",
  "fr-CA": "fr-CA",
  "de-DE": "de-DE",
  "it-IT": "it-IT",
  "pt-BR": "pt-BR",
  "pt-PT": "pt-PT",
  "nl-NL": "nl-NL",
  "pl-PL": "pl-PL",
  "sv-SE": "sv-SE",
  "no-NO": "nb-NO",
  "da-DK": "da-DK",
  "fi-FI": "fi-FI",
  "cs-CZ": "cs-CZ",
  "ro-RO": "ro-RO",
  "hu-HU": "hu-HU",
  "el-GR": "el-GR",
  "uk-UA": "uk-UA",
  "ru-RU": "ru-RU",
  "tr-TR": "tr-TR",
  "ar-SA": "ar-SA",
  "he-IL": "he-IL",
  "ja-JP": "ja-JP",
  "zh-CN": "zh-CN",
  "zh-TW": "zh-TW",
  "ko-KR": "ko-KR",
  "id-ID": "id-ID",
  "ms-MY": "ms-MY",
  "th-TH": "th-TH",
  "vi-VN": "vi-VN",
  "fil-PH": "fil-PH",
};

export function getLanguageMeta(code) {
  return BY_CODE[code] || BY_CODE[DEFAULT_LANGUAGE];
}

/** Highlight in modal when stored code maps to a listed row. */
export function modalSelectionCode(code) {
  if (BY_CODE[code]) return code;
  return DEFAULT_LANGUAGE;
}

export function toSpokenLanguage(code) {
  return SPOKEN_MAP[code] || SPOKEN_MAP[DEFAULT_LANGUAGE];
}

export function readStoredLanguage() {
  try {
    const raw = localStorage.getItem(LANG_STORAGE_KEY);
    if (raw && BY_CODE[raw]) return raw;
  } catch {
    /* ignore */
  }
  return DEFAULT_LANGUAGE;
}

export function writeStoredLanguage(code) {
  try {
    localStorage.setItem(LANG_STORAGE_KEY, code);
  } catch {
    /* ignore */
  }
}
