import { useNavigate } from "react-router-dom";

/**
 * Pill/chip row under an assistant reply.
 * Billing / search chips navigate; everything else sends as the next message.
 */
const CHIP_ROUTES = [
  { test: /buy.*credit|get more credit|vero credit|open plus/i, to: "/plus" },
  { test: /^search flights$/i, to: "/flights" },
  { test: /^search hotels$/i, to: "/hotels" },
  { test: /^search packages$/i, to: "/packages" },
  { test: /^my trips$/i, to: "/trips" },
];

export default function SuggestionChips({ suggestions, onSelect, disabled }) {
  const navigate = useNavigate();
  const chips = Array.isArray(suggestions)
    ? suggestions.map((s) => String(s || "").trim()).filter(Boolean).slice(0, 4)
    : [];
  if (!chips.length) return null;

  const activate = (label) => {
    const route = CHIP_ROUTES.find((r) => r.test.test(label));
    if (route) {
      navigate(route.to);
      return;
    }
    onSelect?.(label);
  };

  return (
    <div className="vero-page__followups" role="group" aria-label="Suggested follow-ups">
      {chips.map((label) => (
        <button
          key={label}
          type="button"
          className="vero-page__followup"
          onClick={() => activate(label)}
          disabled={disabled}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
