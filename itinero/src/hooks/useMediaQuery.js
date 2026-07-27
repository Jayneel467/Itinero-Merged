import { useState, useEffect } from "react";

/**
 * Hook to detect responsive breakpoints.
 * Returns true when the window matches the given media query.
 *
 * Usage:
 *   const isMobile = useMediaQuery(`(max-width: ${BREAKPOINTS.MD}px)`);
 *   const isDesktop = useMediaQuery(`(min-width: ${BREAKPOINTS.LG}px)`);
 *
 * @param {string} query - CSS media query string
 * @returns {boolean} Whether the media query matches
 */
export default function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    const mediaQuery = window.matchMedia(query);
    const handler = (event) => setMatches(event.matches);

    mediaQuery.addEventListener("change", handler);
    setMatches(mediaQuery.matches);

    return () => mediaQuery.removeEventListener("change", handler);
  }, [query]);

  return matches;
}
