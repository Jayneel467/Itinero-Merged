import { useEffect, useState } from "react";
import { getStatusLines } from "../utils/statusLines";

/** Cycle interval: ~1.5–2.5s with slight jitter so it feels alive. */
const BASE_MS = 1800;
const JITTER_MS = 700;

/**
 * Rotating status line while /api/chat is in flight.
 * Clears itself when `active` becomes false (done / error).
 *
 * `mode`: "clarify" | "search" | undefined — overrides airline-joke lines
 * when we're only collecting a date / airport.
 */
export default function VeroTypingStatus({ active, userMessage, mode }) {
  const [line, setLine] = useState("");
  const [fadeKey, setFadeKey] = useState(0);

  useEffect(() => {
    if (!active) {
      setLine("");
      return undefined;
    }

    const lines = getStatusLines(userMessage, {
      forceClarify: mode === "clarify",
      forceSearch: mode === "search",
    });
    let index = 0;
    let cancelled = false;
    setLine(lines[0] || "Vero is searching…");
    setFadeKey((k) => k + 1);

    let timerId;
    function scheduleNext() {
      const delay = BASE_MS + Math.floor(Math.random() * JITTER_MS);
      timerId = window.setTimeout(() => {
        if (cancelled) return;
        index = (index + 1) % lines.length;
        setLine(lines[index]);
        setFadeKey((k) => k + 1);
        scheduleNext();
      }, delay);
    }
    scheduleNext();

    return () => {
      cancelled = true;
      window.clearTimeout(timerId);
    };
  }, [active, userMessage, mode]);

  if (!active || !line) return null;

  return (
    <div className="vero-page__typing" role="status" aria-live="polite" aria-atomic="true">
      <span className="vero-page__dots" aria-hidden>
        <i />
        <i />
        <i />
      </span>
      <span key={fadeKey} className="vero-page__status-line">
        {line}
      </span>
    </div>
  );
}
