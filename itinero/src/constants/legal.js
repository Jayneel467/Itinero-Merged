/**
 * Legal & support copy - single source of truth for Terms, Privacy, Help, Footer.
 * Override via Vite env before public launch (registered entity, address, emails).
 */

function env(key, fallback = "") {
  try {
    const v = String(import.meta.env?.[key] || "").trim();
    return v || fallback;
  } catch {
    return fallback;
  }
}

export const LEGAL = {
  brand: "Itinero",
  /** Registered / operating company name shown on legal pages */
  entityName: env("VITE_LEGAL_ENTITY_NAME", "Itinero Travels Private Limited"),
  /** Optional registered office line */
  registeredAddress: env(
    "VITE_LEGAL_ADDRESS",
    "India (registered office details available on request)"
  ),
  country: "India",
  governingLaw: "the laws of India",
  disputeVenue:
    "the competent courts in India, without prejudice to mandatory consumer protections that apply where you live",
  supportEmail: env("VITE_SUPPORT_EMAIL", "support@itinero.company"),
  legalEmail: env("VITE_LEGAL_EMAIL", "legal@itinero.app"),
  privacyEmail: env("VITE_PRIVACY_EMAIL", "privacy@itinero.app"),
  /** Honest support expectation - do not claim 24/7 phone unless staffed */
  supportHours: "Monday-Friday, 10:00-19:00 IST (excluding public holidays)",
  supportSla: "We aim to reply to email within one business day",
  updated: "12 August 2026",
};

export function supportMailto({ subject = "Itinero support", body = "" } = {}) {
  const q = new URLSearchParams();
  if (subject) q.set("subject", subject);
  if (body) q.set("body", body);
  const qs = q.toString();
  return `mailto:${LEGAL.supportEmail}${qs ? `?${qs}` : ""}`;
}

export function legalMailto(kind = "legal") {
  const email = kind === "privacy" ? LEGAL.privacyEmail : LEGAL.legalEmail;
  const subject = kind === "privacy" ? "Privacy request - Itinero" : "Legal notice - Itinero";
  return `mailto:${email}?subject=${encodeURIComponent(subject)}`;
}
