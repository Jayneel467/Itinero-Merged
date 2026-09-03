import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { X, CreditCard, CheckCircle2, ExternalLink, Download } from "lucide-react";
import { scrubProviderCopy } from "@/utils/scrubProviderCopy";
import {
  readLocalStripePublishableKey,
  resolveLiteApiPublishableKey,
} from "@/features/booking/services/liteApiPaymentSdk";
import { loadStripeJs, resetStripeJsLoader } from "@/features/booking/services/loadStripeJs";
import { flightService } from "@/features/flights/services/flightService";
import { downloadBookingConfirmationPdf } from "@/features/booking/utils/bookingConfirmationPdf";
import { tripService } from "@/features/trips/tripService";
import {
  saveFlightConfirmation,
  bookingRefFromPayment,
} from "@/features/flights/utils/flightCheckout";
import { persistSelectedFlight } from "@/features/flights/utils/persistSelectedFlight";
import {
  emptyTraveller,
  loadSavedPaxStore,
  saveSavedPaxStore,
} from "@/features/booking/utils/savedTravellers";
import FlightExtrasStep from "./FlightExtrasStep";
import { LoadingDots, LoadingState } from "@/components/shared";
import { NAVBAR_IMAGES } from "@/constants/images";
import styles from "./BookingPopup.module.css";

const BOOKING_STEPS = [
  { id: "form", label: "Passengers" },
  { id: "review", label: "Review" },
  { id: "payment", label: "Pay" },
  { id: "done", label: "Done" },
];

const INDIAN_AIRPORTS = new Set([
  "BOM", "DEL", "BLR", "MAA", "CCU", "HYD", "PNQ", "GOI", "AMD", "COK",
  "JAI", "LKO", "GAU", "IXC", "BBI", "TRV", "VNS", "PAT", "IDR", "NAG", "STV",
]);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[0-9]{8,15}$/;
const PLACEHOLDER_PHONES = new Set([
  "0000000000",
  "1111111111",
  "1234567890",
  "0123456789",
  "9876543210",
  "9999999999",
  "8888888888",
  "7777777777",
  "6666666666",
  "5555555555",
  "4444444444",
  "3333333333",
  "2222222222",
  "1010101010",
  "1212121212",
]);

function isPlaceholderPhone(digits) {
  const d = String(digits || "").replace(/\D/g, "");
  if (!d) return true;
  const national = d.length >= 10 ? d.slice(-10) : d;
  if (PLACEHOLDER_PHONES.has(d) || PLACEHOLDER_PHONES.has(national)) return true;
  if (national.length >= 8 && new Set(national).size === 1) return true;
  if (national.length >= 8) {
    let asc = true;
    let desc = true;
    for (let i = 1; i < national.length; i += 1) {
      const prev = Number(national[i - 1]);
      const cur = Number(national[i]);
      if (cur !== (prev + 1) % 10) asc = false;
      if (cur !== (prev - 1 + 10) % 10) desc = false;
    }
    if (asc || desc) return true;
  }
  return false;
}

function travelDateIso(flight) {
  const raw =
    flight?.departure?.date ||
    flight?.departure_date ||
    flight?.depart_date ||
    flight?.segments?.[0]?.departure ||
    "";
  const s = String(raw);
  const m = s.match(/(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

function ageOnDate(dobIso, onIso) {
  if (!dobIso) return null;
  const b = new Date(`${dobIso}T00:00:00`);
  const t = onIso ? new Date(`${onIso}T00:00:00`) : new Date();
  if (Number.isNaN(b.getTime()) || Number.isNaN(t.getTime())) return null;
  let years = t.getFullYear() - b.getFullYear();
  const beforeBirthday =
    t.getMonth() < b.getMonth() ||
    (t.getMonth() === b.getMonth() && t.getDate() < b.getDate());
  if (beforeBirthday) years -= 1;
  return years;
}


function softenBookingError(message) {
  const raw = String(message || "");
  const lower = raw.toLowerCase();
  if (/liteapierror\s*:/i.test(raw) || lower.includes("unable to process prebook")) {
    if (lower.includes("phone") || lower.includes("placeholder") || lower.includes("sequential")) {
      return (
        "That phone number looks invalid or like a test placeholder " +
        "(e.g. 9876543210). Enter a real mobile number and try again."
      );
    }
    if (lower.includes("birthday") || lower.includes("age") || lower.includes("dob")) {
      return (
        "Date of birth does not match this traveller type. " +
        "Adults must be 12+ on the travel date - update DOB and try again."
      );
    }
    return (
      "We couldn't hold this fare. Check name, phone, email, date of birth, and ID - then try again."
    );
  }
  return scrubProviderCopy(raw.replace(/^LiteAPIError:\s*/i, "").trim()) || "Booking failed.";
}

function emptyPassenger(type = 0) {
  const { id: _id, ...rest } = emptyTraveller(type);
  return rest;
}

function offerIdOf(flight) {
  if (!flight) return "";
  return String(flight.offer_id || flight.offerId || flight.id || "");
}

function loadSavedPax() {
  return loadSavedPaxStore();
}

function savePaxLocal({ passengers, email, phone, phoneCc }) {
  saveSavedPaxStore({ passengers, email, phone, phoneCc });
}

/** Prefer local pk_…; otherwise null (caller resolves via LiteAPI Payment SDK). */
function resolveStripePublishableKey(raw) {
  return readLocalStripePublishableKey(raw);
}

async function withResolvedStripeKeys(pb) {
  if (!pb || typeof pb !== "object") return pb;
  const localEnvKey = String(import.meta.env?.VITE_STRIPE_PUBLISHABLE_KEY || "").trim();
  const hasPk = pb.publishable_key && String(pb.publishable_key).trim().startsWith("pk_");
  const isLocalKey = hasPk && String(pb.publishable_key).trim() === localEnvKey;

  // If it has a key that is NOT our local env key, trust it.
  if (hasPk && !isLocalKey) {
    return pb;
  }
  // Otherwise, if it has a client secret, we must fetch the real LiteAPI key.
  if (!pb.client_secret) return pb;
  try {
    const pk = await resolveLiteApiPublishableKey(pb);
    return { ...pb, publishable_key: pk };
  } catch {
    return pb;
  }
}

function formatDobDisplay(iso) {
  if (!iso) return "-";
  try {
    const d = new Date(`${iso}T00:00:00`);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function hasConfValue(val) {
  if (val == null) return false;
  if (typeof val === "string") return val.trim().length > 0;
  if (Array.isArray(val)) return val.length > 0;
  return true;
}

function formatBookingMoney(amount, currency) {
  if (amount == null || amount === "") return null;
  const n = Number(amount);
  if (Number.isNaN(n)) return String(amount);
  const cur = (currency || "").toUpperCase();
  try {
    return new Intl.NumberFormat("en-IN", {
      style: cur ? "currency" : "decimal",
      currency: cur || undefined,
      maximumFractionDigits: 2,
    }).format(n);
  } catch {
    return `${cur ? `${cur} ` : ""}${n.toLocaleString("en-IN")}`;
  }
}

function passengerDisplayName(p) {
  if (!p || typeof p !== "object") return null;
  const parts = [p.title, p.first_name || p.firstName, p.last_name || p.lastName].filter(Boolean);
  return parts.join(" ").trim() || null;
}

function segmentDisplay(seg) {
  if (!seg || typeof seg !== "object") return null;
  const route = [seg.from, seg.to].filter(Boolean).join(" → ");
  const flight = [seg.airline || seg.airline_code, seg.flight_number].filter(Boolean).join(" ");
  const dep = seg.departure || "";
  const arr = seg.arrival || "";
  return { route, flight, dep, arr };
}

/** Prefer LiteAPI booking fields; fill passengers/contact/flight only if the complete payload omitted them. */
function mergeConfirmationBooking(apiBooking, { passengers, email, phone, phoneCc, flight }) {
  const b = apiBooking && typeof apiBooking === "object" ? { ...apiBooking } : {};
  if (!Array.isArray(b.passengers) || b.passengers.length === 0) {
    b.passengers = (passengers || [])
      .map((p) => ({
        title: p.title || undefined,
        first_name: p.firstName || undefined,
        last_name: p.lastName || undefined,
        date_of_birth: p.dob || undefined,
        gender: p.gender || undefined,
        passenger_type: p.passengerType,
      }))
      .filter((p) => p.first_name || p.last_name);
  }
  const contact = b.contact && typeof b.contact === "object" ? { ...b.contact } : {};
  if (!hasConfValue(contact.email) && hasConfValue(email)) contact.email = email;
  if (!hasConfValue(contact.phone) && hasConfValue(phone)) {
    contact.phone = phone;
    if (hasConfValue(phoneCc)) contact.phone_country_code = phoneCc;
  }
  b.contact = contact;

  // Surface the selected offer on sandbox holds so confirmation isn't a blank card.
  if ((!Array.isArray(b.segments_summary) || b.segments_summary.length === 0) && flight) {
    b.segments_summary = [
      {
        airline: flight.airline?.name || flight.airlineName,
        flight_number: flight.flightNumber || flight.airline?.flightNumber,
        origin: flight.departure?.airport || flight.origin,
        destination: flight.arrival?.airport || flight.destination,
        departure: flight.departure?.time || flight.departTime,
        arrival: flight.arrival?.time || flight.arriveTime,
      },
    ];
  }
  if (!hasConfValue(b.airline) && flight?.airline?.name) {
    b.airline = flight.airline.name;
  }
  if (b.total_price == null && b.price == null && flight?.price != null) {
    b.total_price = flight.price;
    b.price = flight.price;
    b.currency = flight.currency || b.currency || "INR";
  }
  return b;
}

/**
 * Shared booking modal for manual flights + Vero in-chat Book Now.
 * Steps: passenger → review → hold → extras (seats/bags) → payment → confirmation.
 */
export default function BookingPopup({
  isOpen,
  onClose,
  flight,
  sessionId,
  adults = 1,
  childrenCount = 0,
  infants = 0,
  origin = "",
  destination = "",
  onSuccess,
}) {
  const navigate = useNavigate();
  const domestic = useMemo(() => {
    const o = (origin || flight?.departure?.airport || "").toUpperCase();
    const d = (destination || flight?.arrival?.airport || "").toUpperCase();
    return INDIAN_AIRPORTS.has(o) && INDIAN_AIRPORTS.has(d);
  }, [origin, destination, flight]);

  const docType = domestic ? "id" : "passport";
  const defaultExpiry = "2030-12-31";

  const passengerPlan = useMemo(() => {
    const plan = [];
    const a = Math.max(1, Number(adults) || 1);
    const c = Math.max(0, Number(childrenCount) || 0);
    const i = Math.max(0, Number(infants) || 0);
    for (let n = 0; n < a; n += 1) plan.push({ type: 0, label: `Traveller ${n + 1} (Adult)` });
    for (let n = 0; n < c; n += 1) plan.push({ type: 1, label: `Traveller ${n + 1} (Child)` });
    for (let n = 0; n < i; n += 1) plan.push({ type: 2, label: `Traveller ${n + 1} (Infant)` });
    return plan;
  }, [adults, childrenCount, infants]);

  const [passengers, setPassengers] = useState(() =>
    passengerPlan.map((p) => emptyPassenger(p.type))
  );
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [phoneCc, setPhoneCc] = useState("91");
  const [saveDetails, setSaveDetails] = useState(true);
  const [errors, setErrors] = useState({});
  const [step, setStep] = useState("form"); // form | review | extras | payment | confirmation
  const [payMethod, setPayMethod] = useState("card"); // upi | card | debit
  const [submitting, setSubmitting] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");
  const [apiError, setApiError] = useState("");
  const [cardReady, setCardReady] = useState(false);
  const [cardMountKey, setCardMountKey] = useState(0);
  /** When Stripe.js is blocked (ad blocker), fall back to sandbox mock card fields. */
  const [stripeBlocked, setStripeBlocked] = useState(false);
  const [hold, setHold] = useState(null);
  const [booking, setBooking] = useState(null);

  const visibleSteps = useMemo(() => {
    return BOOKING_STEPS.filter((s) => {
      if (s.id === "done") return step === "done";
      return s.id !== "done";
    });
  }, [step]);
  const [pdfError, setPdfError] = useState("");
  const [selectedExtras, setSelectedExtras] = useState([]);
  const [voucherCode, setVoucherCode] = useState("");
  const [mockCard, setMockCard] = useState({
    number: "",
    expiry: "",
    cvc: "",
    name: "",
  });

  const cardMountRef = useRef(null);
  const stripeRef = useRef(null);
  const cardRef = useRef(null);

  // Flights use LiteAPI Payment SDK (Stripe) only.
  const useMockCard =
    !!hold &&
    (stripeBlocked ||
      hold.payment_mode === "mock_sandbox" ||
      hold.allow_mock_payment === true ||
      (import.meta.env.DEV && !hold.client_secret));

  useEffect(() => {
    if (!isOpen) return;
    const saved = loadSavedPax();
    const base = passengerPlan.map((p) => emptyPassenger(p.type));
    if (saved?.passengers?.length) {
      saved.passengers.forEach((sp, idx) => {
        if (base[idx]) base[idx] = { ...base[idx], ...sp, passengerType: base[idx].passengerType };
      });
    }
    setPassengers(base);
    setEmail(saved?.email || "");
    setPhone(saved?.phone || "");
    setPhoneCc(saved?.phoneCc || "91");
    setSaveDetails(true);
    setErrors({});
    setStep("form");
    setPayMethod("card");
    setSubmitting(false);
    setStatusMsg("");
    setApiError("");
    setHold(null);
    setBooking(null);
    setPdfError("");
    setSelectedExtras([]);
    setStripeBlocked(false);
    setCardReady(false);
    setCardMountKey(0);
    setMockCard({ number: "", expiry: "", cvc: "", name: "" });

    // Auto-create / refresh draft trip when booking starts
    if (flight) {
      tripService.ensureFlightDraft({
        flight,
        sessionId,
        origin,
        destination,
        adults,
        children: childrenCount,
        infants,
        departDate: flight?.departureAt || undefined,
      });
    }
  }, [isOpen, passengerPlan, flight, sessionId, origin, destination, adults, childrenCount, infants]);

  useEffect(() => {
    const secret = hold?.client_secret;
    const pkRaw = hold?.publishable_key;
    if (
      !isOpen ||
      step !== "payment" ||
      useMockCard ||
      !secret ||
      payMethod === "upi"
    ) {
      setCardReady(false);
      return undefined;
    }

    let cancelled = false;
    let card = null;

    (async () => {
      try {
        setCardReady(false);
        let pk = null;
        if (hold?.client_secret) {
          // If this is a LiteAPI hold, we MUST use LiteAPI's publishable key.
          const localEnvKey = String(import.meta.env?.VITE_STRIPE_PUBLISHABLE_KEY || "").trim();
          const hasPk = pkRaw && String(pkRaw).trim().startsWith("pk_");
          const isLocalKey = hasPk && String(pkRaw).trim() === localEnvKey;

          if (hasPk && !isLocalKey) {
            pk = pkRaw;
          } else {
            pk = await resolveLiteApiPublishableKey({
              publishable_key: pkRaw,
              sdk_public_key: hold?.sdk_public_key,
            });
          }
        } else {
          // Fallback for non-LiteAPI payments (e.g., local mock/test).
          pk = resolveStripePublishableKey(pkRaw);
        }
        if (cancelled) return;
        if (!pk) {
          setApiError("Card checkout could not load. Try again in a moment.");
          return;
        }

        const Stripe = await loadStripeJs();
        // Wait a frame so the mount node is in the DOM after payment step paints.
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        if (cancelled || !cardMountRef.current) return;

        if (cardRef.current) {
          try {
            cardRef.current.destroy();
          } catch {
            /* ignore */
          }
          cardRef.current = null;
        }
        // Clear stale Stripe iframe / "Too Many Requests" text from prior mounts.
        cardMountRef.current.innerHTML = "";

        console.log("Loading Stripe with key:", pk, "pkRaw was:", pkRaw);
        const stripe = Stripe(pk);
        const elements = stripe.elements();
        card = elements.create("card", {
          style: {
            base: {
              fontSize: "16px",
              color: "#001439",
              "::placeholder": { color: "#98a2b3" },
            },
            invalid: { color: "#b42318" },
          },
        });
        card.on("ready", () => {
          if (!cancelled) {
            setCardReady(true);
            setApiError((prev) =>
              /Element|Too Many Requests|retrieve data/i.test(String(prev || ""))
                ? ""
                : prev
            );
          }
        });
        card.on("change", (ev) => {
          if (cancelled) return;
          if (ev?.error?.message) setApiError(ev.error.message);
          else {
            setApiError((prev) =>
              /Element|incomplete|invalid/i.test(String(prev || "")) ? "" : prev
            );
          }
        });
        card.mount(cardMountRef.current);
        stripeRef.current = stripe;
        cardRef.current = card;
      } catch (err) {
        if (cancelled) return;
        const msg = String(err?.message || "");
        if (/429|too many requests|rate-limited/i.test(msg)) {
          setApiError(
            "Payment form hit a rate limit. Wait a few seconds, then tap Retry card form."
          );
        } else if (/Stripe\.js|ad blocker|js\.stripe\.com/i.test(msg)) {
          // Opera / ad blockers often block js.stripe.com - keep checkout usable in sandbox.
          setStripeBlocked(true);
          setApiError(
            "Stripe.js was blocked in this browser. Using the sandbox card form instead - enter 4242 4242 4242 4242, or allow js.stripe.com and tap Retry."
          );
        } else {
          setApiError(msg || "Could not load card payment form.");
        }
        setCardReady(false);
      }
    })();

    return () => {
      cancelled = true;
      setCardReady(false);
      if (cardRef.current) {
        try {
          cardRef.current.destroy();
        } catch {
          /* ignore */
        }
        cardRef.current = null;
      } else if (card) {
        try {
          card.destroy();
        } catch {
          /* ignore */
        }
      }
      stripeRef.current = null;
    };
    // Depend on stable payment fields + remount key - not the whole hold object.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isOpen,
    step,
    useMockCard,
    payMethod,
    hold?.client_secret,
    hold?.publishable_key,
    hold?.sdk_public_key,
    cardMountKey,
  ]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape" && !submitting) onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, submitting, onClose]);

  if (!isOpen || !flight) return null;

  function updatePassenger(idx, patch) {
    setPassengers((prev) => prev.map((p, i) => (i === idx ? { ...p, ...patch } : p)));
  }

  function validate() {
    const next = { travelers: {} };
    let ok = true;
    const onDate = travelDateIso(flight);
    passengers.forEach((p, idx) => {
      const e = {};
      const plan = passengerPlan[idx];
      if (!p.firstName.trim()) e.firstName = "Required";
      if (!p.lastName.trim()) e.lastName = "Required";
      if (!p.gender) e.gender = "Required";
      if (!p.dob) e.dob = "Required";
      else {
        const age = ageOnDate(p.dob, onDate);
        const ptype = Number(p.passengerType ?? plan?.type ?? 0);
        if (age == null) e.dob = "Use YYYY-MM-DD";
        else if (ptype === 0 && age < 12) {
          e.dob = "Adults must be 12+ on the travel date";
        } else if (ptype === 1 && (age < 2 || age > 11)) {
          e.dob = "Children must be 2-11 on the travel date";
        } else if (ptype === 2 && age >= 2) {
          e.dob = "Infants must be under 2 on the travel date";
        }
      }
      if (!p.nationality.trim()) e.nationality = "Required";
      const doc = p.documentNumber.replace(/\s+/g, "");
      if (!doc) e.documentNumber = domestic ? "ID required for booking" : "Required";
      else if (doc.length > 15) e.documentNumber = "Max 15 characters";
      if (!domestic && !p.documentExpiry) e.documentExpiry = "Passport expiry required";
      if (Object.keys(e).length) {
        next.travelers[idx] = e;
        ok = false;
      }
    });
    if (!email.trim()) {
      next.email = "Email is required";
      ok = false;
    } else if (!EMAIL_RE.test(email.trim())) {
      next.email = "Enter a valid email";
      ok = false;
    }
    const phoneDigits = phone.replace(/\D/g, "");
    if (!phoneDigits) {
      next.phone = "Phone is required";
      ok = false;
    } else if (!PHONE_RE.test(phoneDigits)) {
      next.phone = "Enter a valid phone number";
      ok = false;
    } else if (isPlaceholderPhone(phoneDigits)) {
      next.phone = "Use a real mobile number (not 9876543210 / 1234567890)";
      ok = false;
    }
    setErrors(next);
    return ok;
  }

  function buildPayload() {
    const lead = passengers[0];
    const pax = passengers.map((p) => ({
      first_name: p.firstName.trim(),
      last_name: p.lastName.trim(),
      birthday: p.dob,
      gender: String(p.gender).toUpperCase().slice(0, 1),
      nationality: (p.nationality || "IN").toUpperCase().slice(0, 2),
      document_type: docType,
      document_number: p.documentNumber.replace(/\s+/g, "").slice(0, 15),
      document_expiry: p.documentExpiry || defaultExpiry,
      document_issue_country: (p.documentIssueCountry || "IN").toUpperCase().slice(0, 2),
      passenger_type: p.passengerType,
    }));
    const contact = {
      first_name: lead.firstName.trim(),
      last_name: lead.lastName.trim(),
      email: email.trim(),
      phone_country_code: String(phoneCc || "91").replace(/\D/g, "") || "91",
      phone_number: phone.replace(/\D/g, ""),
    };
    return { pax, contact };
  }

  function goToReview() {
    if (!validate()) {
      setApiError("Please fill all required passenger details.");
      return;
    }
    setApiError("");
    if (saveDetails) {
      savePaxLocal({ passengers, email, phone, phoneCc });
    }
    setStep("review");
  }

  async function openPaymentFromHold(pb, prebookRes) {
    const resolved = await withResolvedStripeKeys(pb);
    const hasStripe = Boolean(
      resolved.prebook_id &&
        resolved.client_secret &&
        resolveStripePublishableKey(resolved.publishable_key)
    );
    const canMock =
      Boolean(resolved.prebook_id) &&
      (resolved.allow_mock_payment ||
        resolved.payment_mode === "mock_sandbox" ||
        prebookRes?.payment_ready === true ||
        (!resolved.client_secret && Boolean(resolved.prebook_id)));

    if (hasStripe || canMock) {
      if (hasStripe) {
        setHold((h) => ({
          ...(h || {}),
          ...resolved,
          payment_mode: "stripe",
          allow_mock_payment: false,
        }));
      } else {
        setHold((h) => ({
          ...(h || {}),
          ...resolved,
          allow_mock_payment: true,
          payment_mode: "mock_sandbox",
        }));
      }
      setStep("payment");
      return true;
    }
    if (resolved.prebook_id) {
      throw new Error(
        `Hold created, but card checkout keys are missing. Try again in a moment. Hold ID: ${resolved.prebook_id}`
      );
    }
    throw new Error(prebookRes?.message || "Prebook succeeded but no hold ID was returned.");
  }

  function servicesAvailable(pb) {
    const svc = pb?.services;
    if (!svc || svc.available === false) return false;
    const groups = Array.isArray(svc.groups) ? svc.groups : [];
    return groups.some((g) => Array.isArray(g.options) && g.options.length > 0);
  }

  async function goToPayment() {
    if (!sessionId) {
      setApiError("Missing search session - search flights again, then Book Now.");
      return;
    }
    const oid = offerIdOf(flight);
    if (!oid) {
      setApiError("This offer has no ID - pick another flight.");
      return;
    }

    setSubmitting(true);
    setApiError("");
    setStatusMsg("Verifying fare…");
    try {
      const selectRes = await flightService.select({
        session_id: sessionId,
        offer_id: oid,
      });
      if (selectRes?.ok === false) {
        throw new Error(selectRes.error || "Could not select this fare.");
      }
      const verify = selectRes?.verify;
      if (verify && verify.verified === false && verify.error) {
        throw new Error(
          verify.error || "This fare is no longer available. Pick another flight."
        );
      }

      setStatusMsg("Creating booking hold…");
      const { pax, contact } = buildPayload();
      const prebookRes = await flightService.prebook({
        session_id: sessionId,
        passengers: pax,
        contact,
        voucher_code: voucherCode.trim() || undefined,
      });
      if (!prebookRes?.ok) {
        const code = prebookRes?.error_code || "";
        const msg = softenBookingError(
          prebookRes?.error ||
            prebookRes?.message ||
            "We couldn't hold this fare. Check passenger details and try again."
        );
        if (code === "invalid_phone" || code === "invalid_dob" || /phone|dob|birth|age/i.test(msg)) {
          setStep("form");
        }
        throw new Error(msg);
      }

      const rawPb = prebookRes.prebook || {};
      const basePbPrice = Number(rawPb.price ?? flight?.price ?? 0);
      const pb = await withResolvedStripeKeys({
        ...rawPb,
        base_prebook_price: basePbPrice,
        allow_mock_payment:
          rawPb.allow_mock_payment === true ||
          prebookRes?.payment_ready === true ||
          rawPb.payment_mode === "mock_sandbox",
        payment_mode:
          rawPb.payment_mode ||
          (rawPb.client_secret ? "stripe" : "mock_sandbox"),
      });
      setHold(pb);
      setSelectedExtras([]);
      setStatusMsg("");

      tripService.markFlightHeld({
        sessionId,
        offerId: offerIdOf(flight),
        prebookId: pb.prebook_id,
        price: Number(pb.price ?? flight?.price) || null,
        currency: pb.currency || flight?.currency,
      });

      await openPaymentFromHold(pb, prebookRes);
    } catch (err) {
      setApiError(softenBookingError(err?.message || "Booking failed."));
      setStatusMsg("");
    } finally {
      setSubmitting(false);
    }
  }

  async function finishExtras(selections) {
    if (!hold?.prebook_id || !sessionId) {
      setApiError("Booking hold expired. Go back and create the hold again.");
      return;
    }

    const list = Array.isArray(selections) ? selections : [];
    setSelectedExtras(list);

    const extrasTotal = list.reduce(
      (sum, item) => sum + (Number(item?.price) || 0),
      0
    );
    const base = Number(hold.base_prebook_price || hold.price || flight?.price || 0);

    // Filter only real LiteAPI external ancillary service IDs to send to backend API
    const liteapiServices = list.filter(
      (item) => item?.service_id && !String(item.service_id).startsWith("seat_")
    );

    if (!liteapiServices.length) {
      // All selected extras are client-side seat preferences — save locally and proceed directly to payment
      try {
        const pb = {
          ...hold,
          price: base + extrasTotal,
          selected_services: list,
        };
        setHold(pb);
        await openPaymentFromHold(pb, { payment_ready: true });
      } catch (err) {
        setApiError(softenBookingError(err?.message || "Could not open payment."));
      }
      return;
    }

    setSubmitting(true);
    setApiError("");
    setStatusMsg("Adding extras to your hold…");
    try {
      const res = await flightService.attachServices({
        session_id: sessionId,
        prebook_id: hold.prebook_id,
        selected_services: liteapiServices,
      });
      if (!res?.ok && !res?.skipped) {
        throw new Error(
          res?.error || res?.message || "Could not add those extras. Try again or skip."
        );
      }
      const serverPrice = res?.prebook?.price != null ? Number(res.prebook.price) : null;
      const effectivePrice = serverPrice && serverPrice > base ? serverPrice : base + extrasTotal;

      const pb = await withResolvedStripeKeys({
        ...hold,
        ...(res.prebook || {}),
        price: effectivePrice,
        selected_services: list,
        allow_mock_payment:
          res?.prebook?.allow_mock_payment === true ||
          res?.payment_ready === true ||
          hold.allow_mock_payment,
        payment_mode:
          res?.prebook?.payment_mode ||
          (res?.prebook?.client_secret ? "stripe" : hold.payment_mode),
      });
      setHold(pb);
      setStatusMsg("");
      await openPaymentFromHold(pb, res);
    } catch (err) {
      // If attach services fails, don't block user — proceed with saved seats
      try {
        const pb = {
          ...hold,
          price: base + extrasTotal,
          selected_services: list,
        };
        setHold(pb);
        await openPaymentFromHold(pb, { payment_ready: true });
      } catch {
        setApiError(softenBookingError(err?.message || "Could not attach extras."));
      }
      setStatusMsg("");
    } finally {
      setSubmitting(false);
    }
  }

  async function handlePayAndComplete() {
    if (!hold?.prebook_id) {
      setApiError("Booking hold expired. Go back, pick the flight again, then continue to payment.");
      return;
    }
    if (!sessionId) {
      setApiError("Missing booking session. Close this, search again, then Book Now.");
      return;
    }

    if (payMethod === "upi") {
      setPayMethod("card");
    }

    if (!useMockCard && !cardReady) {
      setApiError("Card form is still loading. Wait a second, or tap Retry card form.");
      return;
    }

    setSubmitting(true);
    setApiError("");
    setStatusMsg(useMockCard ? "Recording demo payment…" : "Processing card…");
    try {
      let mockPayment = false;
      let payRef = hold.transaction_id || hold.prebook_id || `pay_${Date.now()}`;
      if (useMockCard) {
        const digits = String(mockCard.number || "").replace(/\D/g, "");
        if (digits.length < 16) {
          throw new Error(
            `Card number is incomplete (${digits.length}/16 digits). Enter the full test card 4242 4242 4242 4242.`
          );
        }
        if (digits !== "4242424242424242") {
          throw new Error(
            "Sandbox only accepts test card 4242 4242 4242 4242 (any future MM/YY · any CVC)."
          );
        }
        if (!(mockCard.name || "").trim()) {
          throw new Error("Enter the name on the card.");
        }
        const exp = String(mockCard.expiry || "").replace(/\s/g, "");
        if (!/^\d{2}\/\d{2}$/.test(exp)) {
          throw new Error("Enter expiry as MM/YY (e.g. 11/28).");
        }
        const [mm, yy] = exp.split("/").map((x) => Number(x));
        const now = new Date();
        const expOk =
          mm >= 1 &&
          mm <= 12 &&
          (yy + 2000 > now.getFullYear() ||
            (yy + 2000 === now.getFullYear() && mm >= now.getMonth() + 1));
        if (!expOk) {
          throw new Error("Use any future expiry (MM/YY).");
        }
        if (!String(mockCard.cvc || "").replace(/\D/g, "").match(/^\d{3,4}$/)) {
          throw new Error("Enter a 3-4 digit CVC.");
        }
        mockPayment = true;
        payRef = `mock_${Date.now()}`;
      } else if (stripeRef.current && cardRef.current && hold.client_secret) {
        const result = await stripeRef.current.confirmCardPayment(hold.client_secret, {
          payment_method: { card: cardRef.current },
        });
        if (result.error) {
          const msg = String(result.error.message || "Card payment failed.");
          if (/Element|mounted|ready event|Too Many Requests/i.test(msg)) {
            setCardMountKey((k) => k + 1);
            throw new Error(
              "Card form needed a refresh. Enter the card again, then tap Pay."
            );
          }
          throw new Error(msg);
        }
        payRef = result.paymentIntent?.id || hold.transaction_id || hold.prebook_id || `pay_${Date.now()}`;
      } else {
        throw new Error(
          "Card form isn’t ready yet. Wait for it to load, or tap Retry card form."
        );
      }

      setStatusMsg(mockPayment ? "Finalizing sandbox booking…" : "Issuing ticket…");
      const done = await flightService.complete({
        session_id: sessionId,
        prebook_id: hold.prebook_id,
        transaction_id: hold.transaction_id || undefined,
        mock_payment: mockPayment || undefined,
      });
      if (!done?.ok) {
        throw new Error(
          done?.error ||
            "Payment was recorded but ticketing did not finish. Your fare may still be on hold."
        );
      }

      const lite = done.booking || done;
      const paidAmount =
        Number(lite.price ?? hold.price ?? calculatedCombinedPrice ?? priceNum) ||
        (calculatedCombinedPrice || priceNum);
      const paidCurrency = String(lite.currency || hold.currency || currency || "INR").toUpperCase();
      const bookingRef =
        lite.airline_pnr ||
        lite.booking_ref ||
        (lite.booking_id && !String(lite.booking_id).includes("-")
          ? lite.booking_id
          : null) ||
        bookingRefFromPayment(payRef);
      const confirmation = {
        flight,
        travelers: passengers,
        contact: { email: email.trim(), phone: phone.replace(/\D/g, "") },
        paymentId: payRef,
        bookingRef,
        amount: paidAmount,
        currency: paidCurrency,
        paidAt: new Date().toISOString(),
        sessionId,
        prebookId: hold.prebook_id,
        liteapi: lite,
        supplierBookingId: lite.booking_id || null,
        paymentProvider: mockPayment ? "sandbox" : "stripe",
      };
      saveFlightConfirmation(confirmation);
      try {
        tripService.recordPaidFlight(confirmation);
      } catch {
        /* best-effort */
      }
      tripService.markFlightConfirmed({
        sessionId,
        offerId: offerIdOf(flight),
        booking: {
          ...lite,
          payment_id: payRef,
          booking_id: lite.booking_id || bookingRef,
        },
        contact: {
          email,
          phone: phoneCc ? `+${phoneCc}${phone}` : phone,
          name: [passengers[0]?.firstName, passengers[0]?.lastName]
            .filter(Boolean)
            .join(" "),
        },
        passengers,
      });

      // Same full confirmation page as passenger checkout - not the popup step.
      const base = String(import.meta.env.BASE_URL || "/").replace(/\/?$/, "/");
      window.location.assign(`${base}flights/booking-success`);
      return;
    } catch (err) {
      setApiError(err?.message || "Payment / ticket issue failed.");
      setStatusMsg("");
      // Keep error visible near the Pay button (body may be scrolled).
      requestAnimationFrame(() => {
        document.getElementById("bp-pay-error")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      });
    } finally {
      setSubmitting(false);
    }
  }

  function fillSandboxTestCard() {
    const first =
      passengers[0]?.firstName ||
      passengers[0]?.first_name ||
      "";
    const last =
      passengers[0]?.lastName ||
      passengers[0]?.last_name ||
      "";
    const fromPax = `${first} ${last}`.trim();
    setMockCard({
      number: "4242 4242 4242 4242",
      expiry: "12/28",
      cvc: "123",
      name: (mockCard.name || fromPax || "Test User").toString().trim(),
    });
    setApiError("");
    setPayMethod("card");
  }

  async function handleDownloadPdf() {
    if (!booking) return;
    setPdfError("");
    try {
      await downloadBookingConfirmationPdf(booking);
    } catch (err) {
      setPdfError(err?.message || "Could not generate PDF.");
    }
  }

  const isRoundTrip = Boolean(
    flight?.selectedReturn ||
      flight?.returnSummary ||
      (Array.isArray(flight?.returnSegments) && flight.returnSegments.length > 0)
  );

  const outboundFlight = flight?.selectedOutbound || flight;
  const returnFlight =
    flight?.selectedReturn ||
    (flight?.returnSummary
      ? {
          airline: flight.airline,
          flightNumber: flight.flightNumber,
          cabin: flight.cabin,
          departure: flight.returnSummary.departure,
          arrival: flight.returnSummary.arrival,
          duration: flight.returnSummary.duration,
          stops: flight.returnSummary.stops,
          price: flight.selectedReturn?.price || null,
        }
      : null);

  const outboundPrice = Number(outboundFlight?.price || 0);
  const returnPrice = Number(returnFlight?.price || 0);
  const calculatedCombinedPrice =
    isRoundTrip && returnPrice > 0 && !flight?.isRoundTripPackage
      ? outboundPrice + returnPrice
      : Number(flight?.price || 0);

  const priceNum =
    hold?.price != null
      ? Number(hold.price)
      : calculatedCombinedPrice || Number(flight.price || 0);
  const currency = (hold?.currency || flight.currencyCode || "INR").toUpperCase();
  const currencySym = flight.currency || (currency === "INR" ? "₹" : `${currency} `);
  const priceLabel = `${currencySym}${priceNum.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const baseFare =
    flight.price_base != null
      ? Number(flight.price_base)
      : isRoundTrip && returnPrice > 0
        ? calculatedCombinedPrice
        : null;
  const taxes =
    flight.price_taxes != null || flight.price_fees != null
      ? Number(flight.price_taxes || 0) + Number(flight.price_fees || 0)
      : null;

  const numAdults = Math.max(1, Number(adults) || 1);
  const numChildren = Math.max(0, Number(childrenCount) || 0);
  const numInfants = Math.max(0, Number(infants) || 0);
  const totalPassengers =
    passengers?.length ||
    passengerPlan?.length ||
    numAdults + numChildren + numInfants;

  const paxParts = [];
  if (numAdults > 0) paxParts.push(`${numAdults} Adult${numAdults > 1 ? "s" : ""}`);
  if (numChildren > 0) paxParts.push(`${numChildren} Child${numChildren > 1 ? "ren" : ""}`);
  if (numInfants > 0) paxParts.push(`${numInfants} Infant${numInfants > 1 ? "s" : ""}`);
  const paxBreakdownText =
    paxParts.join(", ") ||
    `${totalPassengers} Passenger${totalPassengers > 1 ? "s" : ""}`;

  const confPassengers = Array.isArray(booking?.passengers) ? booking.passengers : [];
  const confSegments = Array.isArray(booking?.segments_summary) ? booking.segments_summary : [];
  const confLocators = Array.isArray(booking?.airline_locators) ? booking.airline_locators : [];
  const confTickets = Array.isArray(booking?.ticket_numbers)
    ? booking.ticket_numbers.filter(hasConfValue)
    : [];
  const confTicketData =
    booking?.ticket_data && typeof booking.ticket_data === "object" ? booking.ticket_data : {};
  const confTotal =
    booking?.total_price != null
      ? booking.total_price
      : booking?.price != null
        ? booking.price
        : booking?.payment?.amount != null
          ? booking.payment.amount
          : booking?.pricing?.total ?? booking?.pricing?.totalAmount;
  const confCurrency =
    booking?.currency || booking?.payment?.currency || booking?.pricing?.currency || currency;
  const confPaidLabel = formatBookingMoney(confTotal, confCurrency);

  const stepTitle =
    step === "form"
      ? "Passenger details"
      : step === "review"
        ? isRoundTrip ? "Review round-trip itinerary" : "Review your booking"
        : step === "extras"
          ? "Seats & bags"
          : step === "payment"
            ? "Payment"
            : "Booking confirmed";

  const stepSubtitle =
    step === "form"
      ? "Names must match the passport or ID you’ll fly with."
      : step === "review"
        ? isRoundTrip
          ? "Confirm both departing & return flights, then we’ll hold this fare."
          : "Confirm the itinerary, then we’ll hold this fare."
        : step === "extras"
          ? "Optional add-ons before you pay."
          : step === "payment"
            ? isRoundTrip
              ? `Secure checkout for round trip · ${priceLabel}`
              : "Secure checkout - fare held until you finish."
            : "You’re set. Keep your reference handy.";


  const stepIndex = Math.max(
    0,
    visibleSteps.findIndex((s) => s.id === step)
  );

  return (
    <div
      className={styles.overlay}
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose?.();
      }}
    >
      <div
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="booking-popup-title"
        data-step={step}
        data-holding={submitting && step === "review" ? "1" : "0"}
      >
        <header className={styles.header}>
          <div className={styles.brandRow}>
            <img
              className={styles.brandLogo}
              src={NAVBAR_IMAGES.logo}
              alt="itinero"
              width={120}
              height={24}
            />
            <button
              type="button"
              className={styles.close}
              aria-label="Close"
              disabled={submitting}
              onClick={() => onClose?.()}
            >
              <X size={18} />
            </button>
          </div>
          <div className={styles.headerText}>
            <h2 id="booking-popup-title">{stepTitle}</h2>
            <p>{stepSubtitle}</p>
          </div>
          {step !== "done" ? (
            <nav className={styles.stepStrip} aria-label="Booking steps">
              {visibleSteps
                .filter((s) => s.id !== "done")
                .map((s, idx) => {
                  const active = s.id === step;
                  const done = idx < stepIndex;
                  return (
                    <React.Fragment key={s.id}>
                      {idx > 0 ? <span className={styles.stepLine} aria-hidden /> : null}
                      <span
                        className={[
                          styles.stepPill,
                          active ? styles.stepPillActive : "",
                          done ? styles.stepPillDone : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        aria-current={active ? "step" : undefined}
                      >
                        <em>{idx + 1}</em>
                        {s.label}
                      </span>
                    </React.Fragment>
                  );
                })}
            </nav>
          ) : null}
        </header>

        <div className={styles.body}>
          {apiError && step !== "payment" ? (
            <div className={`${styles.banner} ${styles.bannerError}`}>{apiError}</div>
          ) : null}
          {statusMsg || submitting ? (
            <div className={styles.holdBanner} role="status" aria-live="polite">
              <LoadingState
                variant="inline"
                title={statusMsg || "Working on your booking…"}
                message={
                  submitting
                    ? "Please keep this window open - don’t refresh until we confirm."
                    : ""
                }
              />
            </div>
          ) : null}

          {step === "form" && (
            <>
              {/* 1. Departing Flight Card */}
              <div className={styles.reviewFlight}>
                {isRoundTrip && (
                  <div className={styles.legBadge}>
                    <span className={styles.legBadgeNumber}>1</span>
                    <span>Departing Flight</span>
                    {outboundFlight.departure?.date ? (
                      <span className={styles.legDate}>· {outboundFlight.departure.date}</span>
                    ) : null}
                  </div>
                )}
                <div className={styles.reviewAirline}>
                  {outboundFlight.airline?.logo ? (
                    <img src={outboundFlight.airline.logo} alt="" />
                  ) : (
                    <span>{(outboundFlight.airline?.name || "FL").slice(0, 2)}</span>
                  )}
                  <div>
                    <strong>{outboundFlight.airline?.name || "Flight"}</strong>
                    <em>{outboundFlight.flightNumber || ""}</em>
                  </div>
                  <span className={styles.cabinChip}>
                    {outboundFlight.cabin || "Economy"}
                  </span>
                </div>
                <div className={styles.reviewSchedule}>
                  <div>
                    <strong>{outboundFlight.departure?.time || "--:--"}</strong>
                    <span>{outboundFlight.departure?.airport || origin || "-"}</span>
                  </div>
                  <div className={styles.reviewMid}>
                    <span>{outboundFlight.duration || "-"}</span>
                    <i />
                    <span>{outboundFlight.stops || "Direct"}</span>
                  </div>
                  <div>
                    <strong>{outboundFlight.arrival?.time || "--:--"}</strong>
                    <span>{outboundFlight.arrival?.airport || destination || "-"}</span>
                  </div>
                </div>
                <p className={styles.reviewMeta}>
                  {outboundFlight.departure?.date || ""}
                  {passengerPlan.length
                    ? ` · ${passengerPlan.length} traveller${passengerPlan.length > 1 ? "s" : ""}`
                    : ""}
                </p>
              </div>

              {/* 2. Return Flight Card (When Round Trip) */}
              {isRoundTrip && returnFlight && (
                <div className={`${styles.reviewFlight} ${styles.returnReviewFlight}`}>
                  <div className={styles.legBadge}>
                    <span className={`${styles.legBadgeNumber} ${styles.returnLegBadgeNumber}`}>2</span>
                    <span>Return Flight</span>
                    {returnFlight.departure?.date ? (
                      <span className={styles.legDate}>· {returnFlight.departure.date}</span>
                    ) : null}
                  </div>
                  <div className={styles.reviewAirline}>
                    {returnFlight.airline?.logo ? (
                      <img src={returnFlight.airline.logo} alt="" />
                    ) : (
                      <span>{(returnFlight.airline?.name || "FL").slice(0, 2)}</span>
                    )}
                    <div>
                      <strong>{returnFlight.airline?.name || "Flight"}</strong>
                      <em>{returnFlight.flightNumber || ""}</em>
                    </div>
                    <span className={styles.cabinChip}>
                      {returnFlight.cabin || "Economy"}
                    </span>
                  </div>
                  <div className={styles.reviewSchedule}>
                    <div>
                      <strong>{returnFlight.departure?.time || "--:--"}</strong>
                      <span>{returnFlight.departure?.airport || destination || "-"}</span>
                    </div>
                    <div className={styles.reviewMid}>
                      <span>{returnFlight.duration || "-"}</span>
                      <i />
                      <span>{returnFlight.stops || "Direct"}</span>
                    </div>
                    <div>
                      <strong>{returnFlight.arrival?.time || "--:--"}</strong>
                      <span>{returnFlight.arrival?.airport || origin || "-"}</span>
                    </div>
                  </div>
                  <p className={styles.reviewMeta}>
                    {returnFlight.departure?.date || ""}
                    {passengerPlan.length
                      ? ` · ${passengerPlan.length} traveller${passengerPlan.length > 1 ? "s" : ""}`
                      : ""}
                  </p>
                </div>
              )}

              {passengers.map((p, idx) => {
                const te = errors.travelers?.[idx] || {};
                return (
                  <div key={idx} className={styles.paxBlock}>
                    <h3>{passengerPlan[idx]?.label || `Traveller ${idx + 1}`}</h3>
                    <div className={styles.grid}>
                      <div className={styles.field}>
                        <label htmlFor={`bp-title-${idx}`}>Title</label>
                        <select
                          id={`bp-title-${idx}`}
                          value={p.title || "Mr"}
                          onChange={(e) => {
                            const title = e.target.value;
                            const gender =
                              title === "Mr" ? "M" : title === "Mrs" || title === "Ms" ? "F" : p.gender;
                            updatePassenger(idx, { title, gender: gender || p.gender });
                          }}
                        >
                          <option value="Mr">Mr</option>
                          <option value="Ms">Ms</option>
                          <option value="Mrs">Mrs</option>
                        </select>
                      </div>
                      <div className={`${styles.field} ${te.firstName ? styles.fieldError : ""}`}>
                        <label htmlFor={`bp-fn-${idx}`}>First Name</label>
                        <input
                          id={`bp-fn-${idx}`}
                          value={p.firstName}
                          autoComplete="given-name"
                          onChange={(e) => updatePassenger(idx, { firstName: e.target.value })}
                        />
                        {te.firstName ? <span className={styles.err}>{te.firstName}</span> : null}
                      </div>
                      <div className={`${styles.field} ${te.lastName ? styles.fieldError : ""}`}>
                        <label htmlFor={`bp-ln-${idx}`}>Last Name</label>
                        <input
                          id={`bp-ln-${idx}`}
                          value={p.lastName}
                          autoComplete="family-name"
                          onChange={(e) => updatePassenger(idx, { lastName: e.target.value })}
                        />
                        {te.lastName ? <span className={styles.err}>{te.lastName}</span> : null}
                      </div>
                      <div className={`${styles.field} ${te.dob ? styles.fieldError : ""}`}>
                        <label htmlFor={`bp-dob-${idx}`}>Date Of Birth</label>
                        <input
                          id={`bp-dob-${idx}`}
                          type="date"
                          value={p.dob}
                          onChange={(e) => updatePassenger(idx, { dob: e.target.value })}
                        />
                        {te.dob ? <span className={styles.err}>{te.dob}</span> : null}
                      </div>
                      <div className={`${styles.field} ${te.gender ? styles.fieldError : ""}`}>
                        <label htmlFor={`bp-g-${idx}`}>Gender</label>
                        <select
                          id={`bp-g-${idx}`}
                          value={p.gender}
                          onChange={(e) => updatePassenger(idx, { gender: e.target.value })}
                        >
                          <option value="">Select</option>
                          <option value="M">Male</option>
                          <option value="F">Female</option>
                        </select>
                        {te.gender ? <span className={styles.err}>{te.gender}</span> : null}
                      </div>
                      <div
                        className={`${styles.field} ${styles.gridFull} ${
                          errors.phone ? styles.fieldError : ""
                        }`}
                      >
                        <label htmlFor="bp-phone">Mobile Number</label>
                        <div className={styles.phoneRow}>
                          <span className={styles.phoneCc}>+{phoneCc}</span>
                          <input
                            id="bp-phone"
                            type="tel"
                            value={phone}
                            autoComplete="tel"
                            onChange={(e) => setPhone(e.target.value)}
                          />
                        </div>
                        {errors.phone ? <span className={styles.err}>{errors.phone}</span> : null}
                      </div>
                      <div
                        className={`${styles.field} ${styles.gridFull} ${
                          errors.email ? styles.fieldError : ""
                        }`}
                      >
                        <label htmlFor="bp-email">Email Address</label>
                        <input
                          id="bp-email"
                          type="email"
                          value={email}
                          autoComplete="email"
                          onChange={(e) => setEmail(e.target.value)}
                        />
                        {errors.email ? <span className={styles.err}>{errors.email}</span> : null}
                      </div>
                      <div
                        className={`${styles.field} ${styles.gridFull} ${
                          te.documentNumber ? styles.fieldError : ""
                        }`}
                      >
                        <label htmlFor={`bp-doc-${idx}`}>
                          {domestic ? "Govt ID / Aadhaar (for ticket)" : "Passport number"}
                        </label>
                        <input
                          id={`bp-doc-${idx}`}
                          value={p.documentNumber}
                          maxLength={15}
                          onChange={(e) => updatePassenger(idx, { documentNumber: e.target.value })}
                        />
                        {te.documentNumber ? (
                          <span className={styles.err}>{te.documentNumber}</span>
                        ) : null}
                      </div>
                      {!domestic ? (
                        <div
                          className={`${styles.field} ${
                            te.documentExpiry ? styles.fieldError : ""
                          } ${styles.gridFull}`}
                        >
                          <label htmlFor={`bp-exp-${idx}`}>Passport expiry</label>
                          <input
                            id={`bp-exp-${idx}`}
                            type="date"
                            value={p.documentExpiry}
                            onChange={(e) =>
                              updatePassenger(idx, { documentExpiry: e.target.value })
                            }
                          />
                          {te.documentExpiry ? (
                            <span className={styles.err}>{te.documentExpiry}</span>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })}

              <div className={styles.field} style={{ marginTop: 12 }}>
                <label htmlFor="bp-voucher">Voucher code (optional)</label>
                <input
                  id="bp-voucher"
                  value={voucherCode}
                  disabled={submitting}
                  placeholder="Promo / voucher"
                  onChange={(e) => setVoucherCode(e.target.value)}
                />
              </div>

              <label className={styles.saveCheck}>
                <input
                  type="checkbox"
                  checked={saveDetails}
                  onChange={(e) => setSaveDetails(e.target.checked)}
                />
                Save details for fast booking
              </label>
            </>
          )}

          {step === "review" && (
            <div className={styles.review}>
              {/* Outbound Leg Card */}
              <div className={styles.reviewFlight}>
                {isRoundTrip && (
                  <div className={styles.legBadge}>
                    <span className={styles.legBadgeNumber}>1</span>
                    <span>Departing Flight</span>
                    {outboundFlight.departure?.date ? (
                      <span className={styles.legDate}>· {outboundFlight.departure.date}</span>
                    ) : null}
                  </div>
                )}
                <div className={styles.reviewAirline}>
                  {outboundFlight.airline?.logo ? (
                    <img src={outboundFlight.airline.logo} alt="" />
                  ) : (
                    <span>{(outboundFlight.airline?.name || "FL").slice(0, 2)}</span>
                  )}
                  <div>
                    <strong>{outboundFlight.airline?.name || "Flight"}</strong>
                    <em>{outboundFlight.flightNumber || ""}</em>
                  </div>
                  <span className={styles.cabinChip}>
                    {outboundFlight.cabin || "Economy"}
                  </span>
                </div>
                <div className={styles.reviewSchedule}>
                  <div>
                    <strong>{outboundFlight.departure?.time || "--:--"}</strong>
                    <span>{outboundFlight.departure?.airport || origin || "-"}</span>
                  </div>
                  <div className={styles.reviewMid}>
                    <span>{outboundFlight.duration || "-"}</span>
                    <i />
                    <span>{outboundFlight.stops || "Direct"}</span>
                  </div>
                  <div>
                    <strong>{outboundFlight.arrival?.time || "--:--"}</strong>
                    <span>{outboundFlight.arrival?.airport || destination || "-"}</span>
                  </div>
                </div>
                {!isRoundTrip && (
                  <p className={styles.reviewMeta}>
                    {outboundFlight.departure?.date || ""}
                    {passengerPlan.length
                      ? ` · ${passengerPlan.length} traveller${passengerPlan.length > 1 ? "s" : ""}`
                      : ""}
                  </p>
                )}
              </div>

              {/* Return Leg Card (When Round Trip) */}
              {isRoundTrip && returnFlight && (
                <div className={`${styles.reviewFlight} ${styles.returnReviewFlight}`}>
                  <div className={styles.legBadge}>
                    <span className={`${styles.legBadgeNumber} ${styles.returnLegBadgeNumber}`}>2</span>
                    <span>Return Flight</span>
                    {returnFlight.departure?.date ? (
                      <span className={styles.legDate}>· {returnFlight.departure.date}</span>
                    ) : null}
                  </div>
                  <div className={styles.reviewAirline}>
                    {returnFlight.airline?.logo ? (
                      <img src={returnFlight.airline.logo} alt="" />
                    ) : (
                      <span>{(returnFlight.airline?.name || "FL").slice(0, 2)}</span>
                    )}
                    <div>
                      <strong>{returnFlight.airline?.name || "Flight"}</strong>
                      <em>{returnFlight.flightNumber || ""}</em>
                    </div>
                    <span className={styles.cabinChip}>
                      {returnFlight.cabin || "Economy"}
                    </span>
                  </div>
                  <div className={styles.reviewSchedule}>
                    <div>
                      <strong>{returnFlight.departure?.time || "--:--"}</strong>
                      <span>{returnFlight.departure?.airport || destination || "-"}</span>
                    </div>
                    <div className={styles.reviewMid}>
                      <span>{returnFlight.duration || "-"}</span>
                      <i />
                      <span>{returnFlight.stops || "Direct"}</span>
                    </div>
                    <div>
                      <strong>{returnFlight.arrival?.time || "--:--"}</strong>
                      <span>{returnFlight.arrival?.airport || origin || "-"}</span>
                    </div>
                  </div>
                </div>
              )}

              {isRoundTrip && (
                <div className={styles.tripMetaPill}>
                  <span>Round trip ({passengerPlan.length} {passengerPlan.length > 1 ? "travellers" : "traveller"})</span>
                </div>
              )}

              <div className={styles.reviewBlock}>
                <div className={styles.reviewBlockHead}>
                  <h4>Passengers</h4>
                  <button
                    type="button"
                    className={styles.linkBtn}
                    disabled={submitting}
                    onClick={() => {
                      setApiError("");
                      setStep("form");
                    }}
                  >
                    Edit
                  </button>
                </div>
                <ul className={styles.paxList}>
                  {passengers.map((p, idx) => {
                    const tMap = { M: "Mr", F: "Ms" };
                    const t = p.title || tMap[String(p.gender).toUpperCase()] || "Mr";
                    const genderLabel =
                      p.gender === "M" ? "Male" : p.gender === "F" ? "Female" : "";
                    return (
                      <li key={`review-pax-${idx}`}>
                        <strong>
                          {t}. {p.firstName} {p.lastName}
                        </strong>
                        <span>
                          {[
                            formatDobDisplay(p.dob),
                            genderLabel,
                            passengerPlan[idx]?.label,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </li>
                    );
                  })}
                </ul>
                <p className={styles.contactLine}>
                  +{phoneCc} {phone}
                  <span aria-hidden> · </span>
                  {email}
                </p>
              </div>

              <div className={`${styles.reviewBlock} ${styles.fareBlock}`}>
                <div className={styles.reviewBlockHead}>
                  <h4>Fare summary</h4>
                  <span className={styles.paxTag}>
                    {paxBreakdownText} · Total
                  </span>
                </div>
                {isRoundTrip && outboundPrice > 0 && returnPrice > 0 ? (
                  <>
                    <div className={styles.fareRow}>
                      <span>
                        Departing flight ({outboundFlight.airline?.name || "Outbound"}) ·{" "}
                        <small style={{ color: "#64748b", fontWeight: 500 }}>
                          ({paxBreakdownText})
                        </small>
                      </span>
                      <span>
                        {currencySym}
                        {outboundPrice.toLocaleString("en-IN")}
                      </span>
                    </div>
                    <div className={styles.fareRow}>
                      <span>
                        Return flight ({returnFlight.airline?.name || "Return"}) ·{" "}
                        <small style={{ color: "#64748b", fontWeight: 500 }}>
                          ({paxBreakdownText})
                        </small>
                      </span>
                      <span>
                        {currencySym}
                        {returnPrice.toLocaleString("en-IN")}
                      </span>
                    </div>
                  </>
                ) : (
                  baseFare != null && (
                    <div className={styles.fareRow}>
                      <span>
                        {isRoundTrip ? "Round-trip base fare" : "Base fare"}{" "}
                        <small style={{ color: "#64748b", fontWeight: 500 }}>
                          ({paxBreakdownText})
                        </small>
                      </span>
                      <span>
                        {currencySym}
                        {baseFare.toLocaleString("en-IN")}
                      </span>
                    </div>
                  )
                )}
                {taxes != null && taxes > 0 && (
                  <div className={styles.fareRow}>
                    <span>
                      Taxes & fees{" "}
                      <small style={{ color: "#64748b", fontWeight: 500 }}>
                        ({paxBreakdownText})
                      </small>
                    </span>
                    <span>
                      {currencySym}
                      {taxes.toLocaleString("en-IN")}
                    </span>
                  </div>
                )}
                <div className={`${styles.fareRow} ${styles.fareTotal}`}>
                  <div>
                    <span>Total</span>
                    {totalPassengers > 1 && (
                      <span style={{ display: "block", fontSize: "0.78rem", fontWeight: 500, color: "#64748b" }}>
                        All fares & taxes for {paxBreakdownText}
                      </span>
                    )}
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <span>{priceLabel}</span>
                    {totalPassengers > 1 && priceNum > 0 && (
                      <span style={{ display: "block", fontSize: "0.78rem", fontWeight: 600, color: "#f97211" }}>
                        ≈ {currencySym}{Math.round(priceNum / totalPassengers).toLocaleString("en-IN")} / person
                      </span>
                    )}
                  </div>
                </div>
                <p className={styles.fareNote}>
                  Holding locks this total price briefly so you can finish payment for all {paxBreakdownText}.
                </p>
              </div>
            </div>
          )}

          {step === "payment" && (
            <div className={styles.payment}>
              <div className={styles.payTotal}>
                <div>
                  <span>Total Amount {isRoundTrip ? "(Round Trip)" : ""}</span>
                  <strong>{priceLabel}</strong>
                </div>
                <button
                  type="button"
                  className={styles.linkBtn}
                  onClick={() =>
                    setStep(servicesAvailable(hold) ? "extras" : "review")
                  }
                >
                  {servicesAvailable(hold) ? "Edit extras" : "Review booking"}
                </button>
              </div>
              {selectedExtras.length > 0 ? (
                <p className={styles.muted} style={{ marginTop: -4 }}>
                  Includes {selectedExtras.length} selected add-on
                  {selectedExtras.length > 1 ? "s" : ""}.
                </p>
              ) : null}

              <h4>Secure card checkout</h4>
              <p className={styles.muted} style={{ marginBottom: 12 }}>
                Secure card checkout (sandbox test card{" "}
                <code>4242 4242 4242 4242</code>).
              </p>

              {(payMethod === "card" || payMethod === "debit" || !payMethod) && (
                useMockCard ? (
                  <div className={styles.mockCardForm}>
                    <p className={styles.mockHint}>
                      {stripeBlocked
                        ? "Stripe.js was blocked - sandbox card form. Use 4242 4242 4242 4242 · any future MM/YY · any CVC. Allow js.stripe.com to use the live Stripe field."
                        : "Sandbox demo - payment keys were not returned. Use the full test card 4242 4242 4242 4242 (16 digits) · any future MM/YY · any CVC."}
                    </p>
                    {stripeBlocked ? (
                      <button
                        type="button"
                        className={styles.retryCard}
                        onClick={() => {
                          resetStripeJsLoader();
                          setStripeBlocked(false);
                          setApiError("");
                          setCardMountKey((k) => k + 1);
                        }}
                      >
                        Retry Stripe card form
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className={styles.fillTestCard}
                      onClick={fillSandboxTestCard}
                    >
                      Fill test card 4242…
                    </button>
                    <div className={styles.field}>
                      <label htmlFor="bp-card-name">Name on card</label>
                      <input
                        id="bp-card-name"
                        autoComplete="cc-name"
                        placeholder="As on card"
                        value={mockCard.name}
                        onChange={(e) => setMockCard((m) => ({ ...m, name: e.target.value }))}
                      />
                    </div>
                    <div className={styles.field}>
                      <label htmlFor="bp-card-number">
                        Card number{" "}
                        <span className={styles.muted}>
                          ({String(mockCard.number || "").replace(/\D/g, "").length}/16)
                        </span>
                      </label>
                      <input
                        id="bp-card-number"
                        inputMode="numeric"
                        autoComplete="cc-number"
                        placeholder="4242 4242 4242 4242"
                        value={mockCard.number}
                        onChange={(e) => {
                          const raw = e.target.value.replace(/\D/g, "").slice(0, 16);
                          const grouped = raw.replace(/(\d{4})(?=\d)/g, "$1 ").trim();
                          setMockCard((m) => ({ ...m, number: grouped }));
                          setApiError("");
                        }}
                      />
                    </div>
                    <div className={styles.mockCardRow}>
                      <div className={styles.field}>
                        <label htmlFor="bp-card-exp">Expiry</label>
                        <input
                          id="bp-card-exp"
                          inputMode="numeric"
                          autoComplete="cc-exp"
                          placeholder="MM/YY"
                          value={mockCard.expiry}
                          onChange={(e) => {
                            let v = e.target.value.replace(/[^\d]/g, "").slice(0, 5);
                            if (v.length >= 3 && !v.includes("/")) {
                              v = `${v.slice(0, 2)}/${v.slice(2)}`;
                            }
                            setMockCard((m) => ({ ...m, expiry: v }));
                          }}
                        />
                      </div>
                      <div className={styles.field}>
                        <label htmlFor="bp-card-cvc">CVC</label>
                        <input
                          id="bp-card-cvc"
                          inputMode="numeric"
                          autoComplete="cc-csc"
                          placeholder="123"
                          value={mockCard.cvc}
                          onChange={(e) =>
                            setMockCard((m) => ({
                              ...m,
                              cvc: e.target.value.replace(/\D/g, "").slice(0, 4),
                            }))
                          }
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className={styles.cardPanel}>
                    <div className={styles.cardPanelHead}>
                      <CreditCard size={18} aria-hidden />
                      <span>
                        <strong>Card</strong>
                        <em>Visa, Mastercard · Stripe</em>
                      </span>
                    </div>
                    {!cardReady ? (
                      <p className={styles.cardLoading}>Loading secure card form…</p>
                    ) : null}
                    <div
                      className={styles.stripeMount}
                      ref={cardMountRef}
                      data-ready={cardReady ? "1" : "0"}
                    />
                    {/rate limit|Too Many Requests|Element|could not load/i.test(
                      String(apiError || "")
                    ) ? (
                      <button
                        type="button"
                        className={styles.retryCard}
                        onClick={() => {
                          resetStripeJsLoader();
                          setStripeBlocked(false);
                          setApiError("");
                          setCardMountKey((k) => k + 1);
                        }}
                      >
                        Retry card form
                      </button>
                    ) : null}
                  </div>
                )
              )}
            </div>
          )}

          {step === "confirmation" && (
            <div className={styles.confirmBox}>
              <div className={styles.confirmHero}>
                <CheckCircle2 size={28} aria-hidden className={styles.confirmIcon} />
                <div>
                  <h3>
                    {booking?.sandbox_hold
                      ? "Fare held (sandbox)"
                      : hasConfValue(booking?.airline_pnr) || hasConfValue(booking?.ticket_numbers)
                        ? "Booking confirmed"
                        : "Booking recorded"}
                  </h3>
                  <p className={styles.muted}>
                    {booking?.sandbox_hold
                      ? booking?.honest_status ||
                        "Demo payment accepted. No airline ticket was invented - only the hold ID is shown."
                      : hasConfValue(booking?.airline_pnr) ||
                          (Array.isArray(booking?.ticket_numbers) && booking.ticket_numbers.length)
                        ? "Your payment succeeded and the ticket was issued from the live booking response."
                        : "Payment step finished. Status below reflects the live booking response - no ticket numbers are invented."}
                  </p>
                </div>
              </div>

              <div className={styles.confirmGrid}>
                {hasConfValue(booking?.booking_id) ? (
                  <div className={styles.confirmField}>
                    <span>Booking ID</span>
                    <strong>
                      <code>{booking.booking_id}</code>
                    </strong>
                  </div>
                ) : null}
                {hasConfValue(booking?.prebook_id) ? (
                  <div className={styles.confirmField}>
                    <span>Hold ID</span>
                    <strong>
                      <code>{booking.prebook_id}</code>
                    </strong>
                  </div>
                ) : null}
                {hasConfValue(booking?.honest_status) ? (
                  <div className={styles.confirmField}>
                    <span>Status</span>
                    <strong>{booking.honest_status}</strong>
                  </div>
                ) : hasConfValue(booking?.status) ? (
                  <div className={styles.confirmField}>
                    <span>Status</span>
                    <strong>{booking.status}</strong>
                  </div>
                ) : null}
                {hasConfValue(booking?.payment_status) ? (
                  <div className={styles.confirmField}>
                    <span>Payment</span>
                    <strong>{booking.payment_status}</strong>
                  </div>
                ) : null}
                {hasConfValue(booking?.booking_ref) ? (
                  <div className={styles.confirmField}>
                    <span>Booking reference</span>
                    <strong>
                      <code>{booking.booking_ref}</code>
                    </strong>
                  </div>
                ) : null}
                {hasConfValue(booking?.airline_pnr) ? (
                  <div className={styles.confirmField}>
                    <span>Airline PNR</span>
                    <strong>
                      <code>{booking.airline_pnr}</code>
                    </strong>
                  </div>
                ) : null}
                {confPaidLabel ? (
                  <div className={styles.confirmField}>
                    <span>Total paid</span>
                    <strong>{confPaidLabel}</strong>
                  </div>
                ) : null}
              </div>

              {confLocators.length > 0 ? (
                <div className={styles.confirmSection}>
                  <h4>Airline locators</h4>
                  <ul>
                    {confLocators.map((loc, idx) => (
                      <li key={`loc-${idx}`}>
                        {[loc.airline_code || loc.airline_name, loc.airline_pnr]
                          .filter(Boolean)
                          .join(" · ")}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {confTickets.length > 0 ||
              hasConfValue(confTicketData.confirmation_id) ||
              hasConfValue(confTicketData.ticketed_at) ? (
                <div className={styles.confirmSection}>
                  <h4>Tickets</h4>
                  <ul>
                    {confTickets.map((t) => (
                      <li key={t}>
                        Ticket number: <code>{t}</code>
                      </li>
                    ))}
                    {hasConfValue(confTicketData.confirmation_id) ? (
                      <li>
                        Confirmation ID: <code>{confTicketData.confirmation_id}</code>
                      </li>
                    ) : null}
                    {hasConfValue(confTicketData.ticketed_at) ? (
                      <li>Ticketed at: {confTicketData.ticketed_at}</li>
                    ) : null}
                  </ul>
                </div>
              ) : null}

              {hasConfValue(booking?.eticket_url) ? (
                <div className={styles.confirmSection}>
                  <h4>E-ticket</h4>
                  <a
                    className={styles.eticketLink}
                    href={booking.eticket_url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Open e-ticket <ExternalLink size={14} aria-hidden />
                  </a>
                </div>
              ) : null}

              {confPassengers.length > 0 ? (
                <div className={styles.confirmSection}>
                  <h4>Passengers</h4>
                  <ul>
                    {confPassengers.map((p, idx) => {
                      const name = passengerDisplayName(p);
                      const extras = [
                        p.date_of_birth || p.dob
                          ? formatDobDisplay(p.date_of_birth || p.dob)
                          : null,
                        p.ticket_number ? `Ticket ${p.ticket_number}` : null,
                      ].filter(hasConfValue);
                      return (
                        <li key={`pax-${idx}`}>
                          {name || `Passenger ${idx + 1}`}
                          {extras.length ? (
                            <span className={styles.muted}> · {extras.join(" · ")}</span>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : null}

              {confSegments.length > 0 ? (
                <div className={styles.confirmSection}>
                  <h4>Flight segments</h4>
                  <ul className={styles.segmentList}>
                    {confSegments.map((seg, idx) => {
                      const s = segmentDisplay(seg);
                      if (!s) return null;
                      return (
                        <li key={`seg-${idx}`}>
                          <strong>{s.route || `Segment ${idx + 1}`}</strong>
                          {s.flight ? <span>{s.flight}</span> : null}
                          {s.dep || s.arr ? (
                            <span className={styles.muted}>
                              {[s.dep, s.arr].filter(Boolean).join(" → ")}
                            </span>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : null}

              {pdfError ? (
                <div className={`${styles.banner} ${styles.bannerError}`}>{pdfError}</div>
              ) : null}
            </div>
          )}
        </div>

        <footer className={styles.footer}>
          {step === "form" ? (
            <button
              type="button"
              className={styles.btnPrimary}
              disabled={submitting}
              onClick={goToReview}
            >
              Continue
            </button>
          ) : null}
          {step === "review" ? (
            <button
              type="button"
              className={styles.btnPrimary}
              disabled={submitting}
              onClick={goToPayment}
            >
              {submitting ? <LoadingDots label="Holding fare" /> : "Hold fare & continue to pay"}
            </button>
          ) : null}
          {step === "payment" ? (
            <div className={styles.payFooter}>
              {apiError ? (
                <div id="bp-pay-error" className={`${styles.banner} ${styles.bannerError}`}>
                  {apiError}
                </div>
              ) : null}
              <button
                type="button"
                className={styles.btnPrimary}
                disabled={
                  submitting || (!useMockCard && !cardReady)
                }
                onClick={handlePayAndComplete}
              >
                {submitting ? (
                  <LoadingDots label="Processing card" />
                ) : !cardReady && !useMockCard ? (
                  "Loading card form…"
                ) : (
                  `Pay ${priceLabel}`
                )}
              </button>
            </div>
          ) : null}
          {step === "confirmation" ? (
            <div className={styles.confirmActions}>
              <button
                type="button"
                className={styles.btnSecondary}
                onClick={handleDownloadPdf}
                disabled={!booking}
              >
                <Download size={16} aria-hidden />
                Download as PDF
              </button>
              <button
                type="button"
                className={styles.btnSecondary}
                onClick={() => {
                  if (typeof onClose === "function") onClose();
                  navigate("/trips");
                }}
              >
                View in Trips
              </button>
              <button
                type="button"
                className={styles.btnPrimary}
                onClick={() => {
                  if (typeof onSuccess === "function") onSuccess(booking);
                  if (typeof onClose === "function") onClose();
                }}
              >
                Done
              </button>
            </div>
          ) : null}
        </footer>
      </div>
    </div>
  );
}
