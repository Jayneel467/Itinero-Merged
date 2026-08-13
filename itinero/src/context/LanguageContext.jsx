import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  DEFAULT_LANGUAGE,
  getLanguageMeta,
  readStoredLanguage,
  toSpokenLanguage,
  writeStoredLanguage,
} from "@/constants/languages";

const LanguageContext = createContext(null);

function applyDocumentLanguage(code) {
  const meta = getLanguageMeta(code);
  if (typeof document === "undefined") return;
  document.documentElement.lang = code;
  document.documentElement.dir = meta.rtl ? "rtl" : "ltr";
}

export function LanguageProvider({ children }) {
  const [language, setLanguageState] = useState(() => readStoredLanguage());

  useEffect(() => {
    applyDocumentLanguage(language);
  }, [language]);

  const setLanguage = useCallback((code) => {
    const meta = getLanguageMeta(code);
    if (!meta) return;
    setLanguageState(meta.code);
    writeStoredLanguage(meta.code);
    applyDocumentLanguage(meta.code);
  }, []);

  const value = useMemo(() => {
    const meta = getLanguageMeta(language);
    return {
      language: meta.code,
      languageName: meta.name,
      languageFlag: meta.flag,
      rtl: meta.rtl,
      spokenLanguage: toSpokenLanguage(meta.code),
      setLanguage,
    };
  }, [language, setLanguage]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    throw new Error("useLanguage must be used within LanguageProvider");
  }
  return ctx;
}

export function useLanguageOptional() {
  return useContext(LanguageContext);
}

export { DEFAULT_LANGUAGE };
