import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";

const VeroUiContext = createContext(undefined);

/**
 * Shared Vero drawer open state + left-page browsing context
 * (flights/hotels/packages the user is looking at).
 */
export function VeroUiProvider({ children }) {
  const [isOpen, setIsOpen] = useState(false);
  const [pageContext, setPageContextState] = useState(null);
  const [pendingPrompt, setPendingPrompt] = useState(null);
  const [pendingNonce, setPendingNonce] = useState(0);
  const pendingPromptRef = useRef(null);
  const pendingMetaRef = useRef(null);
  const uiActionHandlerRef = useRef(null);

  const openVero = useCallback((opts) => {
    const prompt =
      typeof opts === "string"
        ? opts.trim()
        : typeof opts?.prompt === "string"
          ? opts.prompt.trim()
          : "";
    const meta =
      typeof opts === "object" && opts
        ? {
            forceNew: Boolean(opts.forceNew),
            topic: opts.topic || null,
            intent: opts.intent || null,
            source: opts.source || null,
          }
        : null;
    if (prompt) {
      pendingPromptRef.current = prompt;
      pendingMetaRef.current = meta;
      setPendingPrompt(prompt);
      setPendingNonce((n) => n + 1);
    } else {
      pendingMetaRef.current = meta;
    }
    setIsOpen(true);
  }, []);

  const closeVero = useCallback(() => setIsOpen(false), []);

  const consumePendingPrompt = useCallback(() => {
    const taken = pendingPromptRef.current;
    const meta = pendingMetaRef.current;
    pendingPromptRef.current = null;
    pendingMetaRef.current = null;
    setPendingPrompt(null);
    return taken ? { prompt: taken, ...(meta || {}) } : null;
  }, []);

  const setPageContext = useCallback((next) => {
    setPageContextState((prev) => {
      if (next == null) return null;
      const serialized = JSON.stringify(next);
      if (prev && JSON.stringify(prev) === serialized) return prev;
      return next;
    });
  }, []);

  const clearPageContext = useCallback(() => setPageContextState(null), []);

  const setUiActionHandler = useCallback((fn) => {
    uiActionHandlerRef.current = typeof fn === "function" ? fn : null;
  }, []);

  const applyUiAction = useCallback(async (action) => {
    const handler = uiActionHandlerRef.current;
    if (!handler || !action) return { ok: false, message: "No page handler." };
    try {
      return (await handler(action)) || { ok: true };
    } catch (err) {
      return { ok: false, message: err?.message || "Action failed." };
    }
  }, []);

  const value = useMemo(
    () => ({
      isOpen,
      openVero,
      closeVero,
      pendingPrompt,
      pendingNonce,
      consumePendingPrompt,
      pageContext,
      setPageContext,
      clearPageContext,
      setUiActionHandler,
      applyUiAction,
    }),
    [
      isOpen,
      openVero,
      closeVero,
      pendingPrompt,
      pendingNonce,
      consumePendingPrompt,
      pageContext,
      setPageContext,
      clearPageContext,
      setUiActionHandler,
      applyUiAction,
    ]
  );

  return <VeroUiContext.Provider value={value}>{children}</VeroUiContext.Provider>;
}

export function useVeroUi() {
  const ctx = useContext(VeroUiContext);
  if (!ctx) {
    throw new Error("useVeroUi must be used within VeroUiProvider");
  }
  return ctx;
}

/** Safe for layouts that may render outside the provider during tests. */
export function useVeroUiOptional() {
  return useContext(VeroUiContext);
}
