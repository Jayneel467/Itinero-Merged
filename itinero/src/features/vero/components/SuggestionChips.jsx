/**
 * Pill/chip row under an assistant reply. Click sends the label as the next message.
 */
export default function SuggestionChips({ suggestions, onSelect, disabled }) {
  const chips = Array.isArray(suggestions)
    ? suggestions.map((s) => String(s || "").trim()).filter(Boolean).slice(0, 4)
    : [];
  if (!chips.length) return null;

  return (
    <div className="vero-page__followups" role="group" aria-label="Suggested follow-ups">
      {chips.map((label) => (
        <button
          key={label}
          type="button"
          className="vero-page__followup"
          onClick={() => onSelect?.(label)}
          disabled={disabled}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
