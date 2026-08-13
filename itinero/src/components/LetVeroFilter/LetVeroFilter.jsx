import React, { useState } from "react";
import styles from "./LetVeroFilter.module.css";

/**
 * Shared “Let Vero Filter” card - natural-language filter input
 * matching the hotels design (avatar + orange border + Ask Vero).
 * onApply may return a string or a Promise<string>.
 */
export default function LetVeroFilter({
  subtitle = "Describe what you want.",
  placeholder = 'Try: “non-stop under 25000, morning”',
  buttonLabel = "Ask Vero",
  onApply,
  onClear,
  note: controlledNote,
}) {
  const [query, setQuery] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const shownNote = controlledNote ?? note;

  async function apply() {
    if (!onApply || busy) return;
    setBusy(true);
    setNote("Vero is reading that…");
    try {
      const result = await onApply(query);
      if (typeof result === "string") setNote(result);
    } catch (err) {
      setNote(err?.message || "Vero couldn't filter that - try again.");
    } finally {
      setBusy(false);
    }
  }

  function clear() {
    setQuery("");
    setNote("");
    if (onClear) onClear();
    else if (onApply) onApply("");
  }

  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <div className={styles.avatar}>
          <img
            src={`${import.meta.env.BASE_URL}vero-chatbot.png`}
            alt="Vero"
            onError={(e) => {
              e.currentTarget.src =
                "https://ui-avatars.com/api/?name=V&background=dfb17f&color=fff";
            }}
          />
        </div>
        <div>
          <h3 className={styles.title}>Let Vero Filter</h3>
          <p className={styles.subtitle}>{subtitle}</p>
        </div>
      </div>

      <textarea
        className={styles.textarea}
        placeholder={placeholder}
        value={query}
        disabled={busy}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            apply();
          }
        }}
        aria-label="Let Vero Filter"
        rows={3}
      />

      <div className={styles.actions}>
        <button type="button" className={styles.applyBtn} onClick={apply} disabled={busy}>
          {busy ? "Thinking…" : buttonLabel}
        </button>
        {(query || shownNote) && (
          <button type="button" className={styles.clearBtn} onClick={clear} disabled={busy}>
            Clear
          </button>
        )}
      </div>

      {shownNote ? <p className={styles.note}>{shownNote}</p> : null}
    </div>
  );
}
