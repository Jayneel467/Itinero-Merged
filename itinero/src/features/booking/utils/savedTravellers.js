/**
 * Saved travellers used at flight checkout + Profile.
 * Stored on-device (localStorage) - same key BookingPopup already uses.
 */

export const SAVED_PAX_KEY = "itinero_vero_saved_pax";
export const MAX_TRAVELLERS = 8;

export const TRAVELLER_TYPES = [
  { value: 0, label: "Adult" },
  { value: 1, label: "Child" },
  { value: 2, label: "Infant" },
];

export function emptyTraveller(type = 0) {
  return {
    id: `pax_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    title: "Mr",
    firstName: "",
    lastName: "",
    gender: "",
    dob: "",
    nationality: "IN",
    documentNumber: "",
    documentExpiry: "",
    documentIssueCountry: "IN",
    passengerType: type,
  };
}

export function travellerDisplayName(p) {
  if (!p) return "";
  const name = [p.firstName || p.first_name, p.lastName || p.last_name]
    .filter(Boolean)
    .join(" ")
    .trim();
  return name || p.name || "";
}

export function travellerTypeLabel(type) {
  const n = Number(type);
  if (n === 1) return "Child";
  if (n === 2) return "Infant";
  return "Adult";
}

export function travellerInitials(p) {
  const name = travellerDisplayName(p);
  if (!name) return "?";
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function normalizeOne(p, idx = 0) {
  if (!p || typeof p !== "object") return null;
  const firstName = String(p.firstName || p.first_name || "").trim();
  const lastName = String(p.lastName || p.last_name || "").trim();
  if (!firstName && !lastName && !p.name) return null;
  return {
    id: p.id || `pax_${idx}_${(firstName || "t").slice(0, 8)}`,
    title: p.title || "Mr",
    firstName: firstName || String(p.name || "").split(/\s+/)[0] || "",
    lastName:
      lastName ||
      String(p.name || "")
        .split(/\s+/)
        .slice(1)
        .join(" ") ||
      "",
    gender: p.gender || "",
    dob: p.dob || p.birthday || "",
    nationality: p.nationality || "IN",
    documentNumber: p.documentNumber || p.document_number || "",
    documentExpiry: p.documentExpiry || p.document_expiry || "",
    documentIssueCountry: p.documentIssueCountry || p.document_issue_country || "IN",
    passengerType: Number.isFinite(Number(p.passengerType ?? p.passenger_type))
      ? Number(p.passengerType ?? p.passenger_type)
      : 0,
  };
}

export function loadSavedPaxStore() {
  try {
    const raw = JSON.parse(localStorage.getItem(SAVED_PAX_KEY) || "null");
    if (!raw || typeof raw !== "object") {
      return { passengers: [], email: "", phone: "", phoneCc: "91" };
    }
    const passengers = (Array.isArray(raw.passengers) ? raw.passengers : [])
      .map(normalizeOne)
      .filter(Boolean)
      .slice(0, MAX_TRAVELLERS);
    return {
      passengers,
      email: String(raw.email || "").trim(),
      phone: String(raw.phone || "").replace(/\D/g, "").slice(-10),
      phoneCc: String(raw.phoneCc || "91"),
    };
  } catch {
    return { passengers: [], email: "", phone: "", phoneCc: "91" };
  }
}

export function saveSavedPaxStore({ passengers, email, phone, phoneCc } = {}) {
  const current = loadSavedPaxStore();
  const next = {
    passengers: (passengers ?? current.passengers)
      .map(normalizeOne)
      .filter(Boolean)
      .slice(0, MAX_TRAVELLERS),
    email: email !== undefined ? String(email || "").trim() : current.email,
    phone:
      phone !== undefined
        ? String(phone || "").replace(/\D/g, "").slice(-10)
        : current.phone,
    phoneCc: phoneCc !== undefined ? String(phoneCc || "91") : current.phoneCc,
  };
  try {
    localStorage.setItem(SAVED_PAX_KEY, JSON.stringify(next));
  } catch {
    /* quota / private mode */
  }
  return next;
}

export function upsertTraveller(traveller) {
  const store = loadSavedPaxStore();
  const next = emptyTraveller(traveller?.passengerType ?? 0);
  Object.assign(next, normalizeOne({ ...next, ...traveller }) || next);
  if (!next.firstName.trim()) {
    throw new Error("First name is required.");
  }
  const list = [...store.passengers];
  const idx = list.findIndex((p) => p.id === next.id);
  if (idx >= 0) list[idx] = next;
  else {
    if (list.length >= MAX_TRAVELLERS) {
      throw new Error(`You can save up to ${MAX_TRAVELLERS} travellers.`);
    }
    list.push(next);
  }
  return saveSavedPaxStore({ passengers: list });
}

export function removeTraveller(id) {
  const store = loadSavedPaxStore();
  return saveSavedPaxStore({
    passengers: store.passengers.filter((p) => p.id !== id),
  });
}
