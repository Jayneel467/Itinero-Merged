import React, { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, CreditCard, Download, ExternalLink, Smartphone, X } from "lucide-react";
import { flightService } from "@/features/flights/services/flightService";
import { downloadBookingConfirmationPdf } from "@/features/booking/utils/bookingConfirmationPdf";
import styles from "./BookingPopup.module.css";

const INDIAN_AIRPORTS = new Set([
  "BOM", "DEL", "BLR", "MAA", "CCU", "HYD", "PNQ", "GOI", "AMD", "COK",
  "JAI", "LKO", "GAU", "IXC", "BBI", "TRV", "VNS", "PAT", "IDR", "NAG", "STV",
]);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[0-9]{8,15}$/;
const SAVED_PAX_KEY = "itinero_vero_saved_pax";
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
        "Adults must be 12+ on the travel date — update DOB and try again."
      );
    }
    return (
      "We couldn't hold this fare. Check name, phone, email, date of birth, and ID — then try again."
    );
  }
  return raw.replace(/^LiteAPIError:\s*/i, "").trim() || "Booking failed.";
}

function emptyPassenger(type = 0) {
  return {
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

function offerIdOf(flight) {
  if (!flight) return "";
  return String(flight.offer_id || flight.offerId || flight.id || "");
}

function loadSavedPax() {
  try {
    const raw = localStorage.getItem(SAVED_PAX_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function savePaxLocal({ passengers, email, phone, phoneCc }) {
  try {
    localStorage.setItem(
      SAVED_PAX_KEY,
      JSON.stringify({ passengers, email, phone, phoneCc })
    );
  } catch {
    /* ignore quota */
  }
}

function loadStripeJs() {
  if (typeof window === "undefined") return Promise.reject(new Error("No window"));
  if (window.Stripe) return Promise.resolve(window.Stripe);
  return new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-itinero-stripe="1"]');
    if (existing) {
      existing.addEventListener("load", () => resolve(window.Stripe));
      existing.addEventListener("error", () => reject(new Error("Stripe.js failed to load")));
      return;
    }
    const script = document.createElement("script");
    script.src = "https://js.stripe.com/v3/";
    script.async = true;
    script.dataset.itineroStripe = "1";
    script.onload = () => resolve(window.Stripe);
    script.onerror = () => reject(new Error("Stripe.js failed to load"));
    document.body.appendChild(script);
  });
}

function formatDobDisplay(iso) {
  if (!iso) return "—";
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
 * Steps: passenger details → review → payment (LiteAPI/Stripe) → confirmation.
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
  const [step, setStep] = useState("form"); // form | review | payment | confirmation
  const [payMethod, setPayMethod] = useState("card"); // upi | card | debit
  const [submitting, setSubmitting] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");
  const [apiError, setApiError] = useState("");
  const [hold, setHold] = useState(null);
  const [booking, setBooking] = useState(null);
  const [pdfError, setPdfError] = useState("");
  const [mockCard, setMockCard] = useState({
    number: "",
    expiry: "",
    cvc: "",
    name: "",
  });

  const cardMountRef = useRef(null);
  const stripeRef = useRef(null);
  const cardRef = useRef(null);

  const useMockCard =
    !!hold &&
    (hold.payment_mode === "mock_sandbox" || hold.allow_mock_payment === true);

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
    setMockCard({ number: "", expiry: "", cvc: "", name: "" });
  }, [isOpen, passengerPlan]);

  useEffect(() => {
    if (!isOpen || step !== "payment" || useMockCard || !hold?.client_secret || !hold?.publishable_key) {
      return undefined;
    }
    if (payMethod === "upi") return undefined;

    let cancelled = false;
    (async () => {
      try {
        const Stripe = await loadStripeJs();
        if (cancelled || !cardMountRef.current) return;
        if (cardRef.current) {
          try {
            cardRef.current.destroy();
          } catch {
            /* ignore */
          }
          cardRef.current = null;
        }
        const stripe = Stripe(hold.publishable_key);
        const elements = stripe.elements();
        const card = elements.create("card", {
          style: {
            base: {
              fontSize: "16px",
              color: "#001439",
              "::placeholder": { color: "#98a2b3" },
            },
          },
        });
        card.mount(cardMountRef.current);
        stripeRef.current = stripe;
        cardRef.current = card;
      } catch (err) {
        setApiError(err?.message || "Could not load card payment form.");
      }
    })();
    return () => {
      cancelled = true;
      if (cardRef.current) {
        try {
          cardRef.current.destroy();
        } catch {
          /* ignore */
        }
        cardRef.current = null;
      }
    };
  }, [isOpen, step, hold, payMethod, useMockCard]);

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
          e.dob = "Children must be 2–11 on the travel date";
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

  async function goToPayment() {
    if (!sessionId) {
      setApiError("Missing search session — search flights again, then Book Now.");
      return;
    }
    const oid = offerIdOf(flight);
    if (!oid) {
      setApiError("This offer has no ID — pick another flight.");
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

      const pb = {
        ...(prebookRes.prebook || {}),
        // Prefer top-level payment_ready from supervisor when nested flags are missing.
        allow_mock_payment:
          prebookRes?.prebook?.allow_mock_payment === true ||
          prebookRes?.payment_ready === true ||
          prebookRes?.prebook?.payment_mode === "mock_sandbox",
        payment_mode:
          prebookRes?.prebook?.payment_mode ||
          (prebookRes?.prebook?.client_secret ? "stripe" : "mock_sandbox"),
      };
      setHold(pb);
      setStatusMsg("");

      const hasStripe = Boolean(pb.prebook_id && pb.client_secret && pb.publishable_key);
      const canMock =
        Boolean(pb.prebook_id) &&
        (pb.allow_mock_payment ||
          pb.payment_mode === "mock_sandbox" ||
          prebookRes?.payment_ready === true ||
          (!pb.client_secret && Boolean(pb.prebook_id)));

      if (hasStripe || canMock) {
        // Ensure mock UI activates when Stripe secrets are absent.
        if (!hasStripe) {
          setHold((h) => ({
            ...h,
            ...pb,
            allow_mock_payment: true,
            payment_mode: "mock_sandbox",
          }));
        }
        setStep("payment");
      } else if (pb.prebook_id) {
        throw new Error(
          "Hold created, but card payment isn’t available for this account yet. " +
            "In sandbox, Payment SDK keys may be missing — set STRIPE_PUBLISHABLE_KEY or enable LiteAPI Payment SDK. " +
            `Hold ID: ${pb.prebook_id}`
        );
      } else {
        throw new Error(
          prebookRes?.message || "Prebook succeeded but no hold ID was returned."
        );
      }
    } catch (err) {
      setApiError(softenBookingError(err?.message || "Booking failed."));
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
      setApiError(
        useMockCard
          ? "UPI isn’t wired in this sandbox demo. Choose Credit or Debit and use test card 4242 4242 4242 4242."
          : "UPI isn’t available through the live Stripe Payment SDK for this hold. Choose Credit or Debit card to pay securely."
      );
      setPayMethod("card");
      return;
    }

    setSubmitting(true);
    setApiError("");
    setStatusMsg(useMockCard ? "Recording demo payment…" : "Processing card…");
    try {
      let mockPayment = false;
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
          throw new Error("Enter a 3–4 digit CVC.");
        }
        mockPayment = true;
      } else if (stripeRef.current && cardRef.current && hold.client_secret) {
        const result = await stripeRef.current.confirmCardPayment(hold.client_secret, {
          payment_method: { card: cardRef.current },
        });
        if (result.error) {
          throw new Error(result.error.message || "Card payment failed.");
        }
      } else {
        // Fall back to sandbox mock if Stripe Elements never mounted.
        mockPayment = true;
        const digits = String(mockCard.number || "").replace(/\D/g, "");
        if (digits !== "4242424242424242") {
          throw new Error(
            "Card form isn’t ready for live Stripe. Use sandbox test card 4242 4242 4242 4242, or wait a second and try again."
          );
        }
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
      setBooking(
        mergeConfirmationBooking(done.booking || done, {
          passengers,
          email,
          phone,
          phoneCc,
          flight,
        })
      );
      setStep("confirmation");
      setStatusMsg("");
      // Do NOT call onSuccess here — that used to close the modal before
      // the confirmation screen was visible. Parent cleans up on Done/Close.
      requestAnimationFrame(() => {
        document.getElementById("booking-popup-title")?.scrollIntoView({
          behavior: "smooth",
          block: "nearest",
        });
      });
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

  function handleDownloadPdf() {
    if (!booking) return;
    setPdfError("");
    try {
      downloadBookingConfirmationPdf(booking);
    } catch (err) {
      setPdfError(err?.message || "Could not generate PDF.");
    }
  }

  const priceNum =
    hold?.price != null ? Number(hold.price) : Number(flight.price || 0);
  const currency = (hold?.currency || flight.currencyCode || "INR").toUpperCase();
  const currencySym = flight.currency || (currency === "INR" ? "₹" : `${currency} `);
  const priceLabel = `${currencySym}${priceNum.toLocaleString("en-IN")}`;
  const baseFare = flight.price_base != null ? Number(flight.price_base) : null;
  const taxes =
    flight.price_taxes != null || flight.price_fees != null
      ? Number(flight.price_taxes || 0) + Number(flight.price_fees || 0)
      : null;
  const lead = passengers[0] || emptyPassenger();
  const titleMap = { M: "Mr", F: "Ms" };
  const displayTitle = lead.title || titleMap[String(lead.gender).toUpperCase()] || "Mr";

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
      ? "Passenger Details"
      : step === "review"
        ? "Review Your Booking"
        : step === "payment"
          ? "Payment Details"
          : "Booking Confirmation";

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
      >
        <header className={styles.header}>
          <div className={styles.headerText}>
            <h2 id="booking-popup-title">{stepTitle}</h2>
          </div>
          <button
            type="button"
            className={styles.close}
            aria-label="Close"
            disabled={submitting}
            onClick={() => onClose?.()}
          >
            <X size={18} />
          </button>
        </header>

        <div className={styles.body}>
          {apiError ? <div className={`${styles.banner} ${styles.bannerError}`}>{apiError}</div> : null}
          {statusMsg ? <div className={`${styles.banner} ${styles.bannerInfo}`}>{statusMsg}</div> : null}

          {step === "form" && (
            <>
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
              <div className={styles.reviewFlight}>
                <div className={styles.reviewAirline}>
                  {flight.airline?.logo ? (
                    <img src={flight.airline.logo} alt="" />
                  ) : (
                    <span>{(flight.airline?.name || "FL").slice(0, 2)}</span>
                  )}
                  <div>
                    <strong>{flight.airline?.name || "Flight"}</strong>
                    <em>{flight.flightNumber || ""}</em>
                  </div>
                </div>
                <div className={styles.reviewSchedule}>
                  <div>
                    <strong>{flight.departure?.time || "--:--"}</strong>
                    <span>{flight.departure?.airport || origin || "—"}</span>
                  </div>
                  <div className={styles.reviewMid}>
                    <span>{flight.duration || "—"}</span>
                    <i />
                    <span>{flight.stops || "Direct"}</span>
                  </div>
                  <div>
                    <strong>{flight.arrival?.time || "--:--"}</strong>
                    <span>{flight.arrival?.airport || destination || "—"}</span>
                  </div>
                </div>
                <p className={styles.reviewMeta}>
                  {flight.departure?.date || ""}
                  {passengerPlan.length ? ` · ${passengerPlan.length} Traveller${passengerPlan.length > 1 ? "s" : ""}` : ""}
                  {flight.cabin ? ` · ${flight.cabin}` : " · Economy"}
                </p>
              </div>

              <div className={styles.reviewBlock}>
                <h4>
                  Passenger Details{" "}
                  <button
                    type="button"
                    className={styles.linkBtn}
                    onClick={() => {
                      setApiError("");
                      setStep("form");
                    }}
                  >
                    Edit
                  </button>
                </h4>
                <p>
                  {displayTitle}. {lead.firstName} {lead.lastName}
                </p>
                <p className={styles.muted}>
                  {formatDobDisplay(lead.dob)}
                  {lead.gender === "M" ? " · Male" : lead.gender === "F" ? " · Female" : ""}
                </p>
                <p className={styles.muted}>
                  +{phoneCc} {phone} · {email}
                </p>
              </div>

              <div className={styles.reviewBlock}>
                <h4>Fare Summary</h4>
                {baseFare != null && (
                  <div className={styles.fareRow}>
                    <span>Base Fare</span>
                    <span>
                      {currencySym}
                      {baseFare.toLocaleString("en-IN")}
                    </span>
                  </div>
                )}
                {taxes != null && taxes > 0 && (
                  <div className={styles.fareRow}>
                    <span>Taxes & Fees</span>
                    <span>
                      {currencySym}
                      {taxes.toLocaleString("en-IN")}
                    </span>
                  </div>
                )}
                <div className={`${styles.fareRow} ${styles.fareTotal}`}>
                  <span>Total Amount</span>
                  <span>{priceLabel}</span>
                </div>
              </div>
            </div>
          )}

          {step === "payment" && (
            <div className={styles.payment}>
              <div className={styles.payTotal}>
                <div>
                  <span>Total Amount</span>
                  <strong>{priceLabel}</strong>
                </div>
                <button type="button" className={styles.linkBtn} onClick={() => setStep("review")}>
                  View Fare Breakup
                </button>
              </div>

              <h4>Select Payment Method</h4>
              <div className={styles.payMethods} role="radiogroup" aria-label="Payment method">
                <button
                  type="button"
                  className={`${styles.payMethod}${payMethod === "upi" ? ` ${styles.payMethodActive}` : ""}`}
                  onClick={() => setPayMethod("upi")}
                >
                  <Smartphone size={18} aria-hidden />
                  <span>
                    <strong>UPI</strong>
                    <em>Pay with UPI</em>
                  </span>
                </button>
                <button
                  type="button"
                  className={`${styles.payMethod}${payMethod === "card" ? ` ${styles.payMethodActive}` : ""}`}
                  onClick={() => setPayMethod("card")}
                >
                  <CreditCard size={18} aria-hidden />
                  <span>
                    <strong>Credit Card</strong>
                    <em>Visa, Mastercard</em>
                  </span>
                </button>
                <button
                  type="button"
                  className={`${styles.payMethod}${payMethod === "debit" ? ` ${styles.payMethodActive}` : ""}`}
                  onClick={() => setPayMethod("debit")}
                >
                  <CreditCard size={18} aria-hidden />
                  <span>
                    <strong>Debit Card</strong>
                    <em>Visa, Mastercard</em>
                  </span>
                </button>
              </div>

              {(payMethod === "card" || payMethod === "debit") && (
                useMockCard ? (
                  <div className={styles.mockCardForm}>
                    <p className={styles.mockHint}>
                      Sandbox demo — LiteAPI Payment SDK keys were not returned. Use the full test card{" "}
                      <code>4242 4242 4242 4242</code> (16 digits) · any future MM/YY · any CVC.
                    </p>
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
                  <div className={styles.stripeMount} ref={cardMountRef} />
                )
              )}
              {payMethod === "upi" && (
                <p className={styles.muted}>
                  {useMockCard
                    ? "UPI isn’t available in this sandbox demo. Select Credit or Debit and use test card 4242 4242 4242 4242."
                    : "Live LiteAPI holds use Stripe card capture. Select Credit or Debit to pay securely — we never mark payment successful without the Payment SDK."}
                </p>
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
                        "Demo payment accepted. No airline ticket was invented — only the LiteAPI hold ID is shown."
                      : hasConfValue(booking?.airline_pnr) ||
                          (Array.isArray(booking?.ticket_numbers) && booking.ticket_numbers.length)
                        ? "Your payment succeeded and the ticket was issued from the live booking response."
                        : "Payment step finished. Status below reflects what LiteAPI returned — no ticket numbers are invented."}
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
              {submitting ? "Working…" : "Continue & Proceed to Payment"}
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
                disabled={submitting}
                onClick={handlePayAndComplete}
              >
                {submitting ? "Processing…" : `Pay Securely ${priceLabel}`}
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
