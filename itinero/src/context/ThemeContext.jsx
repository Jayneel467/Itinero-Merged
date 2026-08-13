import React, { createContext, useCallback, useContext, useEffect, useMemo } from "react";
import useLocalStorage from "@/hooks/useLocalStorage";

/**
 * Theme context for dark/light mode.
 * Persists to localStorage key "theme" and syncs html.dark for Tailwind + CSS.
 *
 * Usage:
 *   const { theme, isDark, toggleTheme, setTheme } = useTheme();
 */

const ThemeContext = createContext(undefined);

function applyDomTheme(theme) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const dark = theme === "dark";
  root.classList.toggle("dark", dark);
  root.dataset.theme = dark ? "dark" : "light";
  root.style.colorScheme = dark ? "dark" : "light";
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useLocalStorage("theme", "light");

  useEffect(() => {
    applyDomTheme(theme === "dark" ? "dark" : "light");
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === "light" ? "dark" : "light"));
  }, [setTheme]);

  const setThemeSafe = useCallback(
    (next) => {
      setTheme(next === "dark" ? "dark" : "light");
    },
    [setTheme]
  );

  const value = useMemo(
    () => ({
      theme: theme === "dark" ? "dark" : "light",
      isDark: theme === "dark",
      setTheme: setThemeSafe,
      toggleTheme,
    }),
    [theme, setThemeSafe, toggleTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}

export function useThemeOptional() {
  return useContext(ThemeContext) || null;
}
