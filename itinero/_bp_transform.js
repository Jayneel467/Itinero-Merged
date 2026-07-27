import { createHotContext as __vite__createHotContext } from "/itinero/@vite/client";import.meta.hot = __vite__createHotContext("/src/features/booking/components/BookingPopup.jsx");const React = __vite__cjsImport0_react; const useEffect = __vite__cjsImport0_react["useEffect"]; const useMemo = __vite__cjsImport0_react["useMemo"]; const useRef = __vite__cjsImport0_react["useRef"]; const useState = __vite__cjsImport0_react["useState"];const _jsxDEV = __vite__cjsImport5_react_jsxDevRuntime["jsxDEV"]; const _Fragment = __vite__cjsImport5_react_jsxDevRuntime["Fragment"];import __vite__cjsImport0_react from "/itinero/node_modules/.vite/deps/react.js?v=8a2e5e9d";
import { CheckCircle2, CreditCard, Download, ExternalLink, Smartphone, X } from "/itinero/node_modules/.vite/deps/lucide-react.js?v=8a2e5e9d";
import { flightService } from "/itinero/src/features/flights/services/flightService.js?t=1785019791667";
import { downloadBookingConfirmationPdf } from "/itinero/src/features/booking/utils/bookingConfirmationPdf.js";
import styles from "/itinero/src/features/booking/components/BookingPopup.module.css?t=1785127581113";
var _jsxFileName = "C:/Users/Jayneel/Itinero Final/itinero/src/features/booking/components/BookingPopup.jsx";
import __vite__cjsImport5_react_jsxDevRuntime from "/itinero/node_modules/.vite/deps/react_jsx-dev-runtime.js?v=8a2e5e9d";
var _s = $RefreshSig$();
const INDIAN_AIRPORTS = new Set([
	"BOM",
	"DEL",
	"BLR",
	"MAA",
	"CCU",
	"HYD",
	"PNQ",
	"GOI",
	"AMD",
	"COK",
	"JAI",
	"LKO",
	"GAU",
	"IXC",
	"BBI",
	"TRV",
	"VNS",
	"PAT",
	"IDR",
	"NAG",
	"STV"
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
	"1212121212"
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
	const raw = flight?.departure?.date || flight?.departure_date || flight?.depart_date || flight?.segments?.[0]?.departure || "";
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
	const beforeBirthday = t.getMonth() < b.getMonth() || t.getMonth() === b.getMonth() && t.getDate() < b.getDate();
	if (beforeBirthday) years -= 1;
	return years;
}
function softenBookingError(message) {
	const raw = String(message || "");
	const lower = raw.toLowerCase();
	if (/liteapierror\s*:/i.test(raw) || lower.includes("unable to process prebook")) {
		if (lower.includes("phone") || lower.includes("placeholder") || lower.includes("sequential")) {
			return "That phone number looks invalid or like a test placeholder " + "(e.g. 9876543210). Enter a real mobile number and try again.";
		}
		if (lower.includes("birthday") || lower.includes("age") || lower.includes("dob")) {
			return "Date of birth does not match this traveller type. " + "Adults must be 12+ on the travel date — update DOB and try again.";
		}
		return "We couldn't hold this fare. Check name, phone, email, date of birth, and ID — then try again.";
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
		passengerType: type
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
		localStorage.setItem(SAVED_PAX_KEY, JSON.stringify({
			passengers,
			email,
			phone,
			phoneCc
		}));
	} catch {}
}
function loadStripeJs() {
	if (typeof window === "undefined") return Promise.reject(new Error("No window"));
	if (window.Stripe) return Promise.resolve(window.Stripe);
	return new Promise((resolve, reject) => {
		const existing = document.querySelector("script[data-itinero-stripe=\"1\"]");
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
			year: "numeric"
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
			maximumFractionDigits: 2
		}).format(n);
	} catch {
		return `${cur ? `${cur} ` : ""}${n.toLocaleString("en-IN")}`;
	}
}
function passengerDisplayName(p) {
	if (!p || typeof p !== "object") return null;
	const parts = [
		p.title,
		p.first_name || p.firstName,
		p.last_name || p.lastName
	].filter(Boolean);
	return parts.join(" ").trim() || null;
}
function segmentDisplay(seg) {
	if (!seg || typeof seg !== "object") return null;
	const route = [seg.from, seg.to].filter(Boolean).join(" → ");
	const flight = [seg.airline || seg.airline_code, seg.flight_number].filter(Boolean).join(" ");
	const dep = seg.departure || "";
	const arr = seg.arrival || "";
	return {
		route,
		flight,
		dep,
		arr
	};
}
/** Prefer LiteAPI booking fields; fill passengers/contact/flight only if the complete payload omitted them. */
function mergeConfirmationBooking(apiBooking, { passengers, email, phone, phoneCc, flight }) {
	const b = apiBooking && typeof apiBooking === "object" ? { ...apiBooking } : {};
	if (!Array.isArray(b.passengers) || b.passengers.length === 0) {
		b.passengers = (passengers || []).map((p) => ({
			title: p.title || undefined,
			first_name: p.firstName || undefined,
			last_name: p.lastName || undefined,
			date_of_birth: p.dob || undefined,
			gender: p.gender || undefined,
			passenger_type: p.passengerType
		})).filter((p) => p.first_name || p.last_name);
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
		b.segments_summary = [{
			airline: flight.airline?.name || flight.airlineName,
			flight_number: flight.flightNumber || flight.airline?.flightNumber,
			origin: flight.departure?.airport || flight.origin,
			destination: flight.arrival?.airport || flight.destination,
			departure: flight.departure?.time || flight.departTime,
			arrival: flight.arrival?.time || flight.arriveTime
		}];
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
export default function BookingPopup({ isOpen, onClose, flight, sessionId, adults = 1, childrenCount = 0, infants = 0, origin = "", destination = "", onSuccess }) {
	_s();
	const domestic = useMemo(() => {
		const o = (origin || flight?.departure?.airport || "").toUpperCase();
		const d = (destination || flight?.arrival?.airport || "").toUpperCase();
		return INDIAN_AIRPORTS.has(o) && INDIAN_AIRPORTS.has(d);
	}, [
		origin,
		destination,
		flight
	]);
	const docType = domestic ? "id" : "passport";
	const defaultExpiry = "2030-12-31";
	const passengerPlan = useMemo(() => {
		const plan = [];
		const a = Math.max(1, Number(adults) || 1);
		const c = Math.max(0, Number(childrenCount) || 0);
		const i = Math.max(0, Number(infants) || 0);
		for (let n = 0; n < a; n += 1) plan.push({
			type: 0,
			label: `Traveller ${n + 1} (Adult)`
		});
		for (let n = 0; n < c; n += 1) plan.push({
			type: 1,
			label: `Traveller ${n + 1} (Child)`
		});
		for (let n = 0; n < i; n += 1) plan.push({
			type: 2,
			label: `Traveller ${n + 1} (Infant)`
		});
		return plan;
	}, [
		adults,
		childrenCount,
		infants
	]);
	const [passengers, setPassengers] = useState(() => passengerPlan.map((p) => emptyPassenger(p.type)));
	const [email, setEmail] = useState("");
	const [phone, setPhone] = useState("");
	const [phoneCc, setPhoneCc] = useState("91");
	const [saveDetails, setSaveDetails] = useState(true);
	const [errors, setErrors] = useState({});
	const [step, setStep] = useState("form");
	const [payMethod, setPayMethod] = useState("card");
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
		name: ""
	});
	const cardMountRef = useRef(null);
	const stripeRef = useRef(null);
	const cardRef = useRef(null);
	const useMockCard = !!hold && (hold.payment_mode === "mock_sandbox" || hold.allow_mock_payment === true);
	useEffect(() => {
		if (!isOpen) return;
		const saved = loadSavedPax();
		const base = passengerPlan.map((p) => emptyPassenger(p.type));
		if (saved?.passengers?.length) {
			saved.passengers.forEach((sp, idx) => {
				if (base[idx]) base[idx] = {
					...base[idx],
					...sp,
					passengerType: base[idx].passengerType
				};
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
		setMockCard({
			number: "",
			expiry: "",
			cvc: "",
			name: ""
		});
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
					} catch {}
					cardRef.current = null;
				}
				const stripe = Stripe(hold.publishable_key);
				const elements = stripe.elements();
				const card = elements.create("card", { style: { base: {
					fontSize: "16px",
					color: "#001439",
					"::placeholder": { color: "#98a2b3" }
				} } });
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
				} catch {}
				cardRef.current = null;
			}
		};
	}, [
		isOpen,
		step,
		hold,
		payMethod,
		useMockCard
	]);
	useEffect(() => {
		if (!isOpen) return undefined;
		const onKey = (e) => {
			if (e.key === "Escape" && !submitting) onClose?.();
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [
		isOpen,
		submitting,
		onClose
	]);
	if (!isOpen || !flight) return null;
	function updatePassenger(idx, patch) {
		setPassengers((prev) => prev.map((p, i) => i === idx ? {
			...p,
			...patch
		} : p));
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
			passenger_type: p.passengerType
		}));
		const contact = {
			first_name: lead.firstName.trim(),
			last_name: lead.lastName.trim(),
			email: email.trim(),
			phone_country_code: String(phoneCc || "91").replace(/\D/g, "") || "91",
			phone_number: phone.replace(/\D/g, "")
		};
		return {
			pax,
			contact
		};
	}
	function goToReview() {
		if (!validate()) {
			setApiError("Please fill all required passenger details.");
			return;
		}
		setApiError("");
		if (saveDetails) {
			savePaxLocal({
				passengers,
				email,
				phone,
				phoneCc
			});
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
				offer_id: oid
			});
			if (selectRes?.ok === false) {
				throw new Error(selectRes.error || "Could not select this fare.");
			}
			const verify = selectRes?.verify;
			if (verify && verify.verified === false && verify.error) {
				throw new Error(verify.error || "This fare is no longer available. Pick another flight.");
			}
			setStatusMsg("Creating booking hold…");
			const { pax, contact } = buildPayload();
			const prebookRes = await flightService.prebook({
				session_id: sessionId,
				passengers: pax,
				contact
			});
			if (!prebookRes?.ok) {
				const code = prebookRes?.error_code || "";
				const msg = softenBookingError(prebookRes?.error || prebookRes?.message || "We couldn't hold this fare. Check passenger details and try again.");
				if (code === "invalid_phone" || code === "invalid_dob" || /phone|dob|birth|age/i.test(msg)) {
					setStep("form");
				}
				throw new Error(msg);
			}
			const pb = {
				...prebookRes.prebook || {},
				// Prefer top-level payment_ready from supervisor when nested flags are missing.
				allow_mock_payment: prebookRes?.prebook?.allow_mock_payment === true || prebookRes?.payment_ready === true || prebookRes?.prebook?.payment_mode === "mock_sandbox",
				payment_mode: prebookRes?.prebook?.payment_mode || (prebookRes?.prebook?.client_secret ? "stripe" : "mock_sandbox")
			};
			setHold(pb);
			setStatusMsg("");
			const hasStripe = Boolean(pb.prebook_id && pb.client_secret && pb.publishable_key);
			const canMock = Boolean(pb.prebook_id) && (pb.allow_mock_payment || pb.payment_mode === "mock_sandbox" || prebookRes?.payment_ready === true || !pb.client_secret && Boolean(pb.prebook_id));
			if (hasStripe || canMock) {
				// Ensure mock UI activates when Stripe secrets are absent.
				if (!hasStripe) {
					setHold((h) => ({
						...h,
						...pb,
						allow_mock_payment: true,
						payment_mode: "mock_sandbox"
					}));
				}
				setStep("payment");
			} else if (pb.prebook_id) {
				throw new Error("Hold created, but card payment isn’t available for this account yet. " + "In sandbox, Payment SDK keys may be missing — set STRIPE_PUBLISHABLE_KEY or enable LiteAPI Payment SDK. " + `Hold ID: ${pb.prebook_id}`);
			} else {
				throw new Error(prebookRes?.message || "Prebook succeeded but no hold ID was returned.");
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
			setApiError(useMockCard ? "UPI isn’t wired in this sandbox demo. Choose Credit or Debit and use test card 4242 4242 4242 4242." : "UPI isn’t available through the live Stripe Payment SDK for this hold. Choose Credit or Debit card to pay securely.");
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
					throw new Error(`Card number is incomplete (${digits.length}/16 digits). Enter the full test card 4242 4242 4242 4242.`);
				}
				if (digits !== "4242424242424242") {
					throw new Error("Sandbox only accepts test card 4242 4242 4242 4242 (any future MM/YY · any CVC).");
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
				const expOk = mm >= 1 && mm <= 12 && (yy + 2e3 > now.getFullYear() || yy + 2e3 === now.getFullYear() && mm >= now.getMonth() + 1);
				if (!expOk) {
					throw new Error("Use any future expiry (MM/YY).");
				}
				if (!String(mockCard.cvc || "").replace(/\D/g, "").match(/^\d{3,4}$/)) {
					throw new Error("Enter a 3–4 digit CVC.");
				}
				mockPayment = true;
			} else if (stripeRef.current && cardRef.current && hold.client_secret) {
				const result = await stripeRef.current.confirmCardPayment(hold.client_secret, { payment_method: { card: cardRef.current } });
				if (result.error) {
					throw new Error(result.error.message || "Card payment failed.");
				}
			} else {
				// Fall back to sandbox mock if Stripe Elements never mounted.
				mockPayment = true;
				const digits = String(mockCard.number || "").replace(/\D/g, "");
				if (digits !== "4242424242424242") {
					throw new Error("Card form isn’t ready for live Stripe. Use sandbox test card 4242 4242 4242 4242, or wait a second and try again.");
				}
			}
			setStatusMsg(mockPayment ? "Finalizing sandbox booking…" : "Issuing ticket…");
			const done = await flightService.complete({
				session_id: sessionId,
				prebook_id: hold.prebook_id,
				transaction_id: hold.transaction_id || undefined,
				mock_payment: mockPayment || undefined
			});
			if (!done?.ok) {
				throw new Error(done?.error || "Payment was recorded but ticketing did not finish. Your fare may still be on hold.");
			}
			setBooking(mergeConfirmationBooking(done.booking || done, {
				passengers,
				email,
				phone,
				phoneCc,
				flight
			}));
			setStep("confirmation");
			setStatusMsg("");
			// Do NOT call onSuccess here — that used to close the modal before
			// the confirmation screen was visible. Parent cleans up on Done/Close.
			requestAnimationFrame(() => {
				document.getElementById("booking-popup-title")?.scrollIntoView({
					behavior: "smooth",
					block: "nearest"
				});
			});
		} catch (err) {
			setApiError(err?.message || "Payment / ticket issue failed.");
			setStatusMsg("");
			// Keep error visible near the Pay button (body may be scrolled).
			requestAnimationFrame(() => {
				document.getElementById("bp-pay-error")?.scrollIntoView({
					behavior: "smooth",
					block: "nearest"
				});
			});
		} finally {
			setSubmitting(false);
		}
	}
	function fillSandboxTestCard() {
		const first = passengers[0]?.firstName || passengers[0]?.first_name || "";
		const last = passengers[0]?.lastName || passengers[0]?.last_name || "";
		const fromPax = `${first} ${last}`.trim();
		setMockCard({
			number: "4242 4242 4242 4242",
			expiry: "12/28",
			cvc: "123",
			name: (mockCard.name || fromPax || "Test User").toString().trim()
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
	const priceNum = hold?.price != null ? Number(hold.price) : Number(flight.price || 0);
	const currency = (hold?.currency || flight.currencyCode || "INR").toUpperCase();
	const currencySym = flight.currency || (currency === "INR" ? "₹" : `${currency} `);
	const priceLabel = `${currencySym}${priceNum.toLocaleString("en-IN")}`;
	const baseFare = flight.price_base != null ? Number(flight.price_base) : null;
	const taxes = flight.price_taxes != null || flight.price_fees != null ? Number(flight.price_taxes || 0) + Number(flight.price_fees || 0) : null;
	const lead = passengers[0] || emptyPassenger();
	const titleMap = {
		M: "Mr",
		F: "Ms"
	};
	const displayTitle = lead.title || titleMap[String(lead.gender).toUpperCase()] || "Mr";
	const confPassengers = Array.isArray(booking?.passengers) ? booking.passengers : [];
	const confSegments = Array.isArray(booking?.segments_summary) ? booking.segments_summary : [];
	const confLocators = Array.isArray(booking?.airline_locators) ? booking.airline_locators : [];
	const confTickets = Array.isArray(booking?.ticket_numbers) ? booking.ticket_numbers.filter(hasConfValue) : [];
	const confTicketData = booking?.ticket_data && typeof booking.ticket_data === "object" ? booking.ticket_data : {};
	const confTotal = booking?.total_price != null ? booking.total_price : booking?.price != null ? booking.price : booking?.payment?.amount != null ? booking.payment.amount : booking?.pricing?.total ?? booking?.pricing?.totalAmount;
	const confCurrency = booking?.currency || booking?.payment?.currency || booking?.pricing?.currency || currency;
	const confPaidLabel = formatBookingMoney(confTotal, confCurrency);
	const stepTitle = step === "form" ? "Passenger Details" : step === "review" ? "Review Your Booking" : step === "payment" ? "Payment Details" : "Booking Confirmation";
	return /* @__PURE__ */ _jsxDEV("div", {
		className: styles.overlay,
		role: "presentation",
		onClick: (e) => {
			if (e.target === e.currentTarget && !submitting) onClose?.();
		},
		children: /* @__PURE__ */ _jsxDEV("div", {
			className: styles.dialog,
			role: "dialog",
			"aria-modal": "true",
			"aria-labelledby": "booking-popup-title",
			children: [
				/* @__PURE__ */ _jsxDEV("header", {
					className: styles.header,
					children: [/* @__PURE__ */ _jsxDEV("div", {
						className: styles.headerText,
						children: /* @__PURE__ */ _jsxDEV("h2", {
							id: "booking-popup-title",
							children: stepTitle
						}, void 0, false, {
							fileName: _jsxFileName,
							lineNumber: 821,
							columnNumber: 13
						}, this)
					}, void 0, false, {
						fileName: _jsxFileName,
						lineNumber: 820,
						columnNumber: 11
					}, this), /* @__PURE__ */ _jsxDEV("button", {
						type: "button",
						className: styles.close,
						"aria-label": "Close",
						disabled: submitting,
						onClick: () => onClose?.(),
						children: /* @__PURE__ */ _jsxDEV(X, { size: 18 }, void 0, false, {
							fileName: _jsxFileName,
							lineNumber: 830,
							columnNumber: 13
						}, this)
					}, void 0, false, {
						fileName: _jsxFileName,
						lineNumber: 823,
						columnNumber: 11
					}, this)]
				}, void 0, true, {
					fileName: _jsxFileName,
					lineNumber: 819,
					columnNumber: 9
				}, this),
				/* @__PURE__ */ _jsxDEV("div", {
					className: styles.body,
					children: [
						apiError ? /* @__PURE__ */ _jsxDEV("div", {
							className: `${styles.banner} ${styles.bannerError}`,
							children: apiError
						}, void 0, false, {
							fileName: _jsxFileName,
							lineNumber: 835,
							columnNumber: 23
						}, this) : null,
						statusMsg ? /* @__PURE__ */ _jsxDEV("div", {
							className: `${styles.banner} ${styles.bannerInfo}`,
							children: statusMsg
						}, void 0, false, {
							fileName: _jsxFileName,
							lineNumber: 836,
							columnNumber: 24
						}, this) : null,
						step === "form" && /* @__PURE__ */ _jsxDEV(_Fragment, { children: [passengers.map((p, idx) => {
							const te = errors.travelers?.[idx] || {};
							return /* @__PURE__ */ _jsxDEV("div", {
								className: styles.paxBlock,
								children: [/* @__PURE__ */ _jsxDEV("h3", { children: passengerPlan[idx]?.label || `Traveller ${idx + 1}` }, void 0, false, {
									fileName: _jsxFileName,
									lineNumber: 844,
									columnNumber: 21
								}, this), /* @__PURE__ */ _jsxDEV("div", {
									className: styles.grid,
									children: [
										/* @__PURE__ */ _jsxDEV("div", {
											className: styles.field,
											children: [/* @__PURE__ */ _jsxDEV("label", {
												htmlFor: `bp-title-${idx}`,
												children: "Title"
											}, void 0, false, {
												fileName: _jsxFileName,
												lineNumber: 847,
												columnNumber: 25
											}, this), /* @__PURE__ */ _jsxDEV("select", {
												id: `bp-title-${idx}`,
												value: p.title || "Mr",
												onChange: (e) => {
													const title = e.target.value;
													const gender = title === "Mr" ? "M" : title === "Mrs" || title === "Ms" ? "F" : p.gender;
													updatePassenger(idx, {
														title,
														gender: gender || p.gender
													});
												},
												children: [
													/* @__PURE__ */ _jsxDEV("option", {
														value: "Mr",
														children: "Mr"
													}, void 0, false, {
														fileName: _jsxFileName,
														lineNumber: 858,
														columnNumber: 27
													}, this),
													/* @__PURE__ */ _jsxDEV("option", {
														value: "Ms",
														children: "Ms"
													}, void 0, false, {
														fileName: _jsxFileName,
														lineNumber: 859,
														columnNumber: 27
													}, this),
													/* @__PURE__ */ _jsxDEV("option", {
														value: "Mrs",
														children: "Mrs"
													}, void 0, false, {
														fileName: _jsxFileName,
														lineNumber: 860,
														columnNumber: 27
													}, this)
												]
											}, void 0, true, {
												fileName: _jsxFileName,
												lineNumber: 848,
												columnNumber: 25
											}, this)]
										}, void 0, true, {
											fileName: _jsxFileName,
											lineNumber: 846,
											columnNumber: 23
										}, this),
										/* @__PURE__ */ _jsxDEV("div", {
											className: `${styles.field} ${te.firstName ? styles.fieldError : ""}`,
											children: [
												/* @__PURE__ */ _jsxDEV("label", {
													htmlFor: `bp-fn-${idx}`,
													children: "First Name"
												}, void 0, false, {
													fileName: _jsxFileName,
													lineNumber: 864,
													columnNumber: 25
												}, this),
												/* @__PURE__ */ _jsxDEV("input", {
													id: `bp-fn-${idx}`,
													value: p.firstName,
													autoComplete: "given-name",
													onChange: (e) => updatePassenger(idx, { firstName: e.target.value })
												}, void 0, false, {
													fileName: _jsxFileName,
													lineNumber: 865,
													columnNumber: 25
												}, this),
												te.firstName ? /* @__PURE__ */ _jsxDEV("span", {
													className: styles.err,
													children: te.firstName
												}, void 0, false, {
													fileName: _jsxFileName,
													lineNumber: 871,
													columnNumber: 41
												}, this) : null
											]
										}, void 0, true, {
											fileName: _jsxFileName,
											lineNumber: 863,
											columnNumber: 23
										}, this),
										/* @__PURE__ */ _jsxDEV("div", {
											className: `${styles.field} ${te.lastName ? styles.fieldError : ""}`,
											children: [
												/* @__PURE__ */ _jsxDEV("label", {
													htmlFor: `bp-ln-${idx}`,
													children: "Last Name"
												}, void 0, false, {
													fileName: _jsxFileName,
													lineNumber: 874,
													columnNumber: 25
												}, this),
												/* @__PURE__ */ _jsxDEV("input", {
													id: `bp-ln-${idx}`,
													value: p.lastName,
													autoComplete: "family-name",
													onChange: (e) => updatePassenger(idx, { lastName: e.target.value })
												}, void 0, false, {
													fileName: _jsxFileName,
													lineNumber: 875,
													columnNumber: 25
												}, this),
												te.lastName ? /* @__PURE__ */ _jsxDEV("span", {
													className: styles.err,
													children: te.lastName
												}, void 0, false, {
													fileName: _jsxFileName,
													lineNumber: 881,
													columnNumber: 40
												}, this) : null
											]
										}, void 0, true, {
											fileName: _jsxFileName,
											lineNumber: 873,
											columnNumber: 23
										}, this),
										/* @__PURE__ */ _jsxDEV("div", {
											className: `${styles.field} ${te.dob ? styles.fieldError : ""}`,
											children: [
												/* @__PURE__ */ _jsxDEV("label", {
													htmlFor: `bp-dob-${idx}`,
													children: "Date Of Birth"
												}, void 0, false, {
													fileName: _jsxFileName,
													lineNumber: 884,
													columnNumber: 25
												}, this),
												/* @__PURE__ */ _jsxDEV("input", {
													id: `bp-dob-${idx}`,
													type: "date",
													value: p.dob,
													onChange: (e) => updatePassenger(idx, { dob: e.target.value })
												}, void 0, false, {
													fileName: _jsxFileName,
													lineNumber: 885,
													columnNumber: 25
												}, this),
												te.dob ? /* @__PURE__ */ _jsxDEV("span", {
													className: styles.err,
													children: te.dob
												}, void 0, false, {
													fileName: _jsxFileName,
													lineNumber: 891,
													columnNumber: 35
												}, this) : null
											]
										}, void 0, true, {
											fileName: _jsxFileName,
											lineNumber: 883,
											columnNumber: 23
										}, this),
										/* @__PURE__ */ _jsxDEV("div", {
											className: `${styles.field} ${te.gender ? styles.fieldError : ""}`,
											children: [
												/* @__PURE__ */ _jsxDEV("label", {
													htmlFor: `bp-g-${idx}`,
													children: "Gender"
												}, void 0, false, {
													fileName: _jsxFileName,
													lineNumber: 894,
													columnNumber: 25
												}, this),
												/* @__PURE__ */ _jsxDEV("select", {
													id: `bp-g-${idx}`,
													value: p.gender,
													onChange: (e) => updatePassenger(idx, { gender: e.target.value }),
													children: [
														/* @__PURE__ */ _jsxDEV("option", {
															value: "",
															children: "Select"
														}, void 0, false, {
															fileName: _jsxFileName,
															lineNumber: 900,
															columnNumber: 27
														}, this),
														/* @__PURE__ */ _jsxDEV("option", {
															value: "M",
															children: "Male"
														}, void 0, false, {
															fileName: _jsxFileName,
															lineNumber: 901,
															columnNumber: 27
														}, this),
														/* @__PURE__ */ _jsxDEV("option", {
															value: "F",
															children: "Female"
														}, void 0, false, {
															fileName: _jsxFileName,
															lineNumber: 902,
															columnNumber: 27
														}, this)
													]
												}, void 0, true, {
													fileName: _jsxFileName,
													lineNumber: 895,
													columnNumber: 25
												}, this),
												te.gender ? /* @__PURE__ */ _jsxDEV("span", {
													className: styles.err,
													children: te.gender
												}, void 0, false, {
													fileName: _jsxFileName,
													lineNumber: 904,
													columnNumber: 38
												}, this) : null
											]
										}, void 0, true, {
											fileName: _jsxFileName,
											lineNumber: 893,
											columnNumber: 23
										}, this),
										/* @__PURE__ */ _jsxDEV("div", {
											className: `${styles.field} ${styles.gridFull} ${errors.phone ? styles.fieldError : ""}`,
											children: [
												/* @__PURE__ */ _jsxDEV("label", {
													htmlFor: "bp-phone",
													children: "Mobile Number"
												}, void 0, false, {
													fileName: _jsxFileName,
													lineNumber: 911,
													columnNumber: 25
												}, this),
												/* @__PURE__ */ _jsxDEV("div", {
													className: styles.phoneRow,
													children: [/* @__PURE__ */ _jsxDEV("span", {
														className: styles.phoneCc,
														children: ["+", phoneCc]
													}, void 0, true, {
														fileName: _jsxFileName,
														lineNumber: 913,
														columnNumber: 27
													}, this), /* @__PURE__ */ _jsxDEV("input", {
														id: "bp-phone",
														type: "tel",
														value: phone,
														autoComplete: "tel",
														onChange: (e) => setPhone(e.target.value)
													}, void 0, false, {
														fileName: _jsxFileName,
														lineNumber: 914,
														columnNumber: 27
													}, this)]
												}, void 0, true, {
													fileName: _jsxFileName,
													lineNumber: 912,
													columnNumber: 25
												}, this),
												errors.phone ? /* @__PURE__ */ _jsxDEV("span", {
													className: styles.err,
													children: errors.phone
												}, void 0, false, {
													fileName: _jsxFileName,
													lineNumber: 922,
													columnNumber: 41
												}, this) : null
											]
										}, void 0, true, {
											fileName: _jsxFileName,
											lineNumber: 906,
											columnNumber: 23
										}, this),
										/* @__PURE__ */ _jsxDEV("div", {
											className: `${styles.field} ${styles.gridFull} ${errors.email ? styles.fieldError : ""}`,
											children: [
												/* @__PURE__ */ _jsxDEV("label", {
													htmlFor: "bp-email",
													children: "Email Address"
												}, void 0, false, {
													fileName: _jsxFileName,
													lineNumber: 929,
													columnNumber: 25
												}, this),
												/* @__PURE__ */ _jsxDEV("input", {
													id: "bp-email",
													type: "email",
													value: email,
													autoComplete: "email",
													onChange: (e) => setEmail(e.target.value)
												}, void 0, false, {
													fileName: _jsxFileName,
													lineNumber: 930,
													columnNumber: 25
												}, this),
												errors.email ? /* @__PURE__ */ _jsxDEV("span", {
													className: styles.err,
													children: errors.email
												}, void 0, false, {
													fileName: _jsxFileName,
													lineNumber: 937,
													columnNumber: 41
												}, this) : null
											]
										}, void 0, true, {
											fileName: _jsxFileName,
											lineNumber: 924,
											columnNumber: 23
										}, this),
										/* @__PURE__ */ _jsxDEV("div", {
											className: `${styles.field} ${styles.gridFull} ${te.documentNumber ? styles.fieldError : ""}`,
											children: [
												/* @__PURE__ */ _jsxDEV("label", {
													htmlFor: `bp-doc-${idx}`,
													children: domestic ? "Govt ID / Aadhaar (for ticket)" : "Passport number"
												}, void 0, false, {
													fileName: _jsxFileName,
													lineNumber: 944,
													columnNumber: 25
												}, this),
												/* @__PURE__ */ _jsxDEV("input", {
													id: `bp-doc-${idx}`,
													value: p.documentNumber,
													maxLength: 15,
													onChange: (e) => updatePassenger(idx, { documentNumber: e.target.value })
												}, void 0, false, {
													fileName: _jsxFileName,
													lineNumber: 947,
													columnNumber: 25
												}, this),
												te.documentNumber ? /* @__PURE__ */ _jsxDEV("span", {
													className: styles.err,
													children: te.documentNumber
												}, void 0, false, {
													fileName: _jsxFileName,
													lineNumber: 954,
													columnNumber: 27
												}, this) : null
											]
										}, void 0, true, {
											fileName: _jsxFileName,
											lineNumber: 939,
											columnNumber: 23
										}, this),
										!domestic ? /* @__PURE__ */ _jsxDEV("div", {
											className: `${styles.field} ${te.documentExpiry ? styles.fieldError : ""} ${styles.gridFull}`,
											children: [
												/* @__PURE__ */ _jsxDEV("label", {
													htmlFor: `bp-exp-${idx}`,
													children: "Passport expiry"
												}, void 0, false, {
													fileName: _jsxFileName,
													lineNumber: 963,
													columnNumber: 27
												}, this),
												/* @__PURE__ */ _jsxDEV("input", {
													id: `bp-exp-${idx}`,
													type: "date",
													value: p.documentExpiry,
													onChange: (e) => updatePassenger(idx, { documentExpiry: e.target.value })
												}, void 0, false, {
													fileName: _jsxFileName,
													lineNumber: 964,
													columnNumber: 27
												}, this),
												te.documentExpiry ? /* @__PURE__ */ _jsxDEV("span", {
													className: styles.err,
													children: te.documentExpiry
												}, void 0, false, {
													fileName: _jsxFileName,
													lineNumber: 973,
													columnNumber: 29
												}, this) : null
											]
										}, void 0, true, {
											fileName: _jsxFileName,
											lineNumber: 958,
											columnNumber: 25
										}, this) : null
									]
								}, void 0, true, {
									fileName: _jsxFileName,
									lineNumber: 845,
									columnNumber: 21
								}, this)]
							}, idx, true, {
								fileName: _jsxFileName,
								lineNumber: 843,
								columnNumber: 19
							}, this);
						}), /* @__PURE__ */ _jsxDEV("label", {
							className: styles.saveCheck,
							children: [/* @__PURE__ */ _jsxDEV("input", {
								type: "checkbox",
								checked: saveDetails,
								onChange: (e) => setSaveDetails(e.target.checked)
							}, void 0, false, {
								fileName: _jsxFileName,
								lineNumber: 983,
								columnNumber: 17
							}, this), "Save details for fast booking"]
						}, void 0, true, {
							fileName: _jsxFileName,
							lineNumber: 982,
							columnNumber: 15
						}, this)] }, void 0, true, {
							fileName: _jsxFileName,
							lineNumber: 839,
							columnNumber: 13
						}, this),
						step === "review" && /* @__PURE__ */ _jsxDEV("div", {
							className: styles.review,
							children: [
								/* @__PURE__ */ _jsxDEV("div", {
									className: styles.reviewFlight,
									children: [
										/* @__PURE__ */ _jsxDEV("div", {
											className: styles.reviewAirline,
											children: [flight.airline?.logo ? /* @__PURE__ */ _jsxDEV("img", {
												src: flight.airline.logo,
												alt: ""
											}, void 0, false, {
												fileName: _jsxFileName,
												lineNumber: 998,
												columnNumber: 21
											}, this) : /* @__PURE__ */ _jsxDEV("span", { children: (flight.airline?.name || "FL").slice(0, 2) }, void 0, false, {
												fileName: _jsxFileName,
												lineNumber: 1e3,
												columnNumber: 21
											}, this), /* @__PURE__ */ _jsxDEV("div", { children: [/* @__PURE__ */ _jsxDEV("strong", { children: flight.airline?.name || "Flight" }, void 0, false, {
												fileName: _jsxFileName,
												lineNumber: 1003,
												columnNumber: 21
											}, this), /* @__PURE__ */ _jsxDEV("em", { children: flight.flightNumber || "" }, void 0, false, {
												fileName: _jsxFileName,
												lineNumber: 1004,
												columnNumber: 21
											}, this)] }, void 0, true, {
												fileName: _jsxFileName,
												lineNumber: 1002,
												columnNumber: 19
											}, this)]
										}, void 0, true, {
											fileName: _jsxFileName,
											lineNumber: 996,
											columnNumber: 17
										}, this),
										/* @__PURE__ */ _jsxDEV("div", {
											className: styles.reviewSchedule,
											children: [
												/* @__PURE__ */ _jsxDEV("div", { children: [/* @__PURE__ */ _jsxDEV("strong", { children: flight.departure?.time || "--:--" }, void 0, false, {
													fileName: _jsxFileName,
													lineNumber: 1009,
													columnNumber: 21
												}, this), /* @__PURE__ */ _jsxDEV("span", { children: flight.departure?.airport || origin || "—" }, void 0, false, {
													fileName: _jsxFileName,
													lineNumber: 1010,
													columnNumber: 21
												}, this)] }, void 0, true, {
													fileName: _jsxFileName,
													lineNumber: 1008,
													columnNumber: 19
												}, this),
												/* @__PURE__ */ _jsxDEV("div", {
													className: styles.reviewMid,
													children: [
														/* @__PURE__ */ _jsxDEV("span", { children: flight.duration || "—" }, void 0, false, {
															fileName: _jsxFileName,
															lineNumber: 1013,
															columnNumber: 21
														}, this),
														/* @__PURE__ */ _jsxDEV("i", {}, void 0, false, {
															fileName: _jsxFileName,
															lineNumber: 1014,
															columnNumber: 21
														}, this),
														/* @__PURE__ */ _jsxDEV("span", { children: flight.stops || "Direct" }, void 0, false, {
															fileName: _jsxFileName,
															lineNumber: 1015,
															columnNumber: 21
														}, this)
													]
												}, void 0, true, {
													fileName: _jsxFileName,
													lineNumber: 1012,
													columnNumber: 19
												}, this),
												/* @__PURE__ */ _jsxDEV("div", { children: [/* @__PURE__ */ _jsxDEV("strong", { children: flight.arrival?.time || "--:--" }, void 0, false, {
													fileName: _jsxFileName,
													lineNumber: 1018,
													columnNumber: 21
												}, this), /* @__PURE__ */ _jsxDEV("span", { children: flight.arrival?.airport || destination || "—" }, void 0, false, {
													fileName: _jsxFileName,
													lineNumber: 1019,
													columnNumber: 21
												}, this)] }, void 0, true, {
													fileName: _jsxFileName,
													lineNumber: 1017,
													columnNumber: 19
												}, this)
											]
										}, void 0, true, {
											fileName: _jsxFileName,
											lineNumber: 1007,
											columnNumber: 17
										}, this),
										/* @__PURE__ */ _jsxDEV("p", {
											className: styles.reviewMeta,
											children: [
												flight.departure?.date || "",
												passengerPlan.length ? ` · ${passengerPlan.length} Traveller${passengerPlan.length > 1 ? "s" : ""}` : "",
												flight.cabin ? ` · ${flight.cabin}` : " · Economy"
											]
										}, void 0, true, {
											fileName: _jsxFileName,
											lineNumber: 1022,
											columnNumber: 17
										}, this)
									]
								}, void 0, true, {
									fileName: _jsxFileName,
									lineNumber: 995,
									columnNumber: 15
								}, this),
								/* @__PURE__ */ _jsxDEV("div", {
									className: styles.reviewBlock,
									children: [
										/* @__PURE__ */ _jsxDEV("h4", { children: [
											"Passenger Details",
											" ",
											/* @__PURE__ */ _jsxDEV("button", {
												type: "button",
												className: styles.linkBtn,
												onClick: () => {
													setApiError("");
													setStep("form");
												},
												children: "Edit"
											}, void 0, false, {
												fileName: _jsxFileName,
												lineNumber: 1032,
												columnNumber: 19
											}, this)
										] }, void 0, true, {
											fileName: _jsxFileName,
											lineNumber: 1030,
											columnNumber: 17
										}, this),
										/* @__PURE__ */ _jsxDEV("p", { children: [
											displayTitle,
											". ",
											lead.firstName,
											" ",
											lead.lastName
										] }, void 0, true, {
											fileName: _jsxFileName,
											lineNumber: 1043,
											columnNumber: 17
										}, this),
										/* @__PURE__ */ _jsxDEV("p", {
											className: styles.muted,
											children: [formatDobDisplay(lead.dob), lead.gender === "M" ? " · Male" : lead.gender === "F" ? " · Female" : ""]
										}, void 0, true, {
											fileName: _jsxFileName,
											lineNumber: 1046,
											columnNumber: 17
										}, this),
										/* @__PURE__ */ _jsxDEV("p", {
											className: styles.muted,
											children: [
												"+",
												phoneCc,
												" ",
												phone,
												" · ",
												email
											]
										}, void 0, true, {
											fileName: _jsxFileName,
											lineNumber: 1050,
											columnNumber: 17
										}, this)
									]
								}, void 0, true, {
									fileName: _jsxFileName,
									lineNumber: 1029,
									columnNumber: 15
								}, this),
								/* @__PURE__ */ _jsxDEV("div", {
									className: styles.reviewBlock,
									children: [
										/* @__PURE__ */ _jsxDEV("h4", { children: "Fare Summary" }, void 0, false, {
											fileName: _jsxFileName,
											lineNumber: 1056,
											columnNumber: 17
										}, this),
										baseFare != null && /* @__PURE__ */ _jsxDEV("div", {
											className: styles.fareRow,
											children: [/* @__PURE__ */ _jsxDEV("span", { children: "Base Fare" }, void 0, false, {
												fileName: _jsxFileName,
												lineNumber: 1059,
												columnNumber: 21
											}, this), /* @__PURE__ */ _jsxDEV("span", { children: [currencySym, baseFare.toLocaleString("en-IN")] }, void 0, true, {
												fileName: _jsxFileName,
												lineNumber: 1060,
												columnNumber: 21
											}, this)]
										}, void 0, true, {
											fileName: _jsxFileName,
											lineNumber: 1058,
											columnNumber: 19
										}, this),
										taxes != null && taxes > 0 && /* @__PURE__ */ _jsxDEV("div", {
											className: styles.fareRow,
											children: [/* @__PURE__ */ _jsxDEV("span", { children: "Taxes & Fees" }, void 0, false, {
												fileName: _jsxFileName,
												lineNumber: 1068,
												columnNumber: 21
											}, this), /* @__PURE__ */ _jsxDEV("span", { children: [currencySym, taxes.toLocaleString("en-IN")] }, void 0, true, {
												fileName: _jsxFileName,
												lineNumber: 1069,
												columnNumber: 21
											}, this)]
										}, void 0, true, {
											fileName: _jsxFileName,
											lineNumber: 1067,
											columnNumber: 19
										}, this),
										/* @__PURE__ */ _jsxDEV("div", {
											className: `${styles.fareRow} ${styles.fareTotal}`,
											children: [/* @__PURE__ */ _jsxDEV("span", { children: "Total Amount" }, void 0, false, {
												fileName: _jsxFileName,
												lineNumber: 1076,
												columnNumber: 19
											}, this), /* @__PURE__ */ _jsxDEV("span", { children: priceLabel }, void 0, false, {
												fileName: _jsxFileName,
												lineNumber: 1077,
												columnNumber: 19
											}, this)]
										}, void 0, true, {
											fileName: _jsxFileName,
											lineNumber: 1075,
											columnNumber: 17
										}, this)
									]
								}, void 0, true, {
									fileName: _jsxFileName,
									lineNumber: 1055,
									columnNumber: 15
								}, this)
							]
						}, void 0, true, {
							fileName: _jsxFileName,
							lineNumber: 994,
							columnNumber: 13
						}, this),
						step === "payment" && /* @__PURE__ */ _jsxDEV("div", {
							className: styles.payment,
							children: [
								/* @__PURE__ */ _jsxDEV("div", {
									className: styles.payTotal,
									children: [/* @__PURE__ */ _jsxDEV("div", { children: [/* @__PURE__ */ _jsxDEV("span", { children: "Total Amount" }, void 0, false, {
										fileName: _jsxFileName,
										lineNumber: 1087,
										columnNumber: 19
									}, this), /* @__PURE__ */ _jsxDEV("strong", { children: priceLabel }, void 0, false, {
										fileName: _jsxFileName,
										lineNumber: 1088,
										columnNumber: 19
									}, this)] }, void 0, true, {
										fileName: _jsxFileName,
										lineNumber: 1086,
										columnNumber: 17
									}, this), /* @__PURE__ */ _jsxDEV("button", {
										type: "button",
										className: styles.linkBtn,
										onClick: () => setStep("review"),
										children: "View Fare Breakup"
									}, void 0, false, {
										fileName: _jsxFileName,
										lineNumber: 1090,
										columnNumber: 17
									}, this)]
								}, void 0, true, {
									fileName: _jsxFileName,
									lineNumber: 1085,
									columnNumber: 15
								}, this),
								/* @__PURE__ */ _jsxDEV("h4", { children: "Select Payment Method" }, void 0, false, {
									fileName: _jsxFileName,
									lineNumber: 1095,
									columnNumber: 15
								}, this),
								/* @__PURE__ */ _jsxDEV("div", {
									className: styles.payMethods,
									role: "radiogroup",
									"aria-label": "Payment method",
									children: [
										/* @__PURE__ */ _jsxDEV("button", {
											type: "button",
											className: `${styles.payMethod}${payMethod === "upi" ? ` ${styles.payMethodActive}` : ""}`,
											onClick: () => setPayMethod("upi"),
											children: [/* @__PURE__ */ _jsxDEV(Smartphone, {
												size: 18,
												"aria-hidden": true
											}, void 0, false, {
												fileName: _jsxFileName,
												lineNumber: 1102,
												columnNumber: 19
											}, this), /* @__PURE__ */ _jsxDEV("span", { children: [/* @__PURE__ */ _jsxDEV("strong", { children: "UPI" }, void 0, false, {
												fileName: _jsxFileName,
												lineNumber: 1104,
												columnNumber: 21
											}, this), /* @__PURE__ */ _jsxDEV("em", { children: "Pay with UPI" }, void 0, false, {
												fileName: _jsxFileName,
												lineNumber: 1105,
												columnNumber: 21
											}, this)] }, void 0, true, {
												fileName: _jsxFileName,
												lineNumber: 1103,
												columnNumber: 19
											}, this)]
										}, void 0, true, {
											fileName: _jsxFileName,
											lineNumber: 1097,
											columnNumber: 17
										}, this),
										/* @__PURE__ */ _jsxDEV("button", {
											type: "button",
											className: `${styles.payMethod}${payMethod === "card" ? ` ${styles.payMethodActive}` : ""}`,
											onClick: () => setPayMethod("card"),
											children: [/* @__PURE__ */ _jsxDEV(CreditCard, {
												size: 18,
												"aria-hidden": true
											}, void 0, false, {
												fileName: _jsxFileName,
												lineNumber: 1113,
												columnNumber: 19
											}, this), /* @__PURE__ */ _jsxDEV("span", { children: [/* @__PURE__ */ _jsxDEV("strong", { children: "Credit Card" }, void 0, false, {
												fileName: _jsxFileName,
												lineNumber: 1115,
												columnNumber: 21
											}, this), /* @__PURE__ */ _jsxDEV("em", { children: "Visa, Mastercard" }, void 0, false, {
												fileName: _jsxFileName,
												lineNumber: 1116,
												columnNumber: 21
											}, this)] }, void 0, true, {
												fileName: _jsxFileName,
												lineNumber: 1114,
												columnNumber: 19
											}, this)]
										}, void 0, true, {
											fileName: _jsxFileName,
											lineNumber: 1108,
											columnNumber: 17
										}, this),
										/* @__PURE__ */ _jsxDEV("button", {
											type: "button",
											className: `${styles.payMethod}${payMethod === "debit" ? ` ${styles.payMethodActive}` : ""}`,
											onClick: () => setPayMethod("debit"),
											children: [/* @__PURE__ */ _jsxDEV(CreditCard, {
												size: 18,
												"aria-hidden": true
											}, void 0, false, {
												fileName: _jsxFileName,
												lineNumber: 1124,
												columnNumber: 19
											}, this), /* @__PURE__ */ _jsxDEV("span", { children: [/* @__PURE__ */ _jsxDEV("strong", { children: "Debit Card" }, void 0, false, {
												fileName: _jsxFileName,
												lineNumber: 1126,
												columnNumber: 21
											}, this), /* @__PURE__ */ _jsxDEV("em", { children: "Visa, Mastercard" }, void 0, false, {
												fileName: _jsxFileName,
												lineNumber: 1127,
												columnNumber: 21
											}, this)] }, void 0, true, {
												fileName: _jsxFileName,
												lineNumber: 1125,
												columnNumber: 19
											}, this)]
										}, void 0, true, {
											fileName: _jsxFileName,
											lineNumber: 1119,
											columnNumber: 17
										}, this)
									]
								}, void 0, true, {
									fileName: _jsxFileName,
									lineNumber: 1096,
									columnNumber: 15
								}, this),
								(payMethod === "card" || payMethod === "debit") && (useMockCard ? /* @__PURE__ */ _jsxDEV("div", {
									className: styles.mockCardForm,
									children: [
										/* @__PURE__ */ _jsxDEV("p", {
											className: styles.mockHint,
											children: [
												"Sandbox demo — LiteAPI Payment SDK keys were not returned. Use the full test card",
												" ",
												/* @__PURE__ */ _jsxDEV("code", { children: "4242 4242 4242 4242" }, void 0, false, {
													fileName: _jsxFileName,
													lineNumber: 1137,
													columnNumber: 23
												}, this),
												" (16 digits) · any future MM/YY · any CVC."
											]
										}, void 0, true, {
											fileName: _jsxFileName,
											lineNumber: 1135,
											columnNumber: 21
										}, this),
										/* @__PURE__ */ _jsxDEV("button", {
											type: "button",
											className: styles.fillTestCard,
											onClick: fillSandboxTestCard,
											children: "Fill test card 4242…"
										}, void 0, false, {
											fileName: _jsxFileName,
											lineNumber: 1139,
											columnNumber: 21
										}, this),
										/* @__PURE__ */ _jsxDEV("div", {
											className: styles.field,
											children: [/* @__PURE__ */ _jsxDEV("label", {
												htmlFor: "bp-card-name",
												children: "Name on card"
											}, void 0, false, {
												fileName: _jsxFileName,
												lineNumber: 1147,
												columnNumber: 23
											}, this), /* @__PURE__ */ _jsxDEV("input", {
												id: "bp-card-name",
												autoComplete: "cc-name",
												placeholder: "As on card",
												value: mockCard.name,
												onChange: (e) => setMockCard((m) => ({
													...m,
													name: e.target.value
												}))
											}, void 0, false, {
												fileName: _jsxFileName,
												lineNumber: 1148,
												columnNumber: 23
											}, this)]
										}, void 0, true, {
											fileName: _jsxFileName,
											lineNumber: 1146,
											columnNumber: 21
										}, this),
										/* @__PURE__ */ _jsxDEV("div", {
											className: styles.field,
											children: [/* @__PURE__ */ _jsxDEV("label", {
												htmlFor: "bp-card-number",
												children: [
													"Card number",
													" ",
													/* @__PURE__ */ _jsxDEV("span", {
														className: styles.muted,
														children: [
															"(",
															String(mockCard.number || "").replace(/\D/g, "").length,
															"/16)"
														]
													}, void 0, true, {
														fileName: _jsxFileName,
														lineNumber: 1159,
														columnNumber: 25
													}, this)
												]
											}, void 0, true, {
												fileName: _jsxFileName,
												lineNumber: 1157,
												columnNumber: 23
											}, this), /* @__PURE__ */ _jsxDEV("input", {
												id: "bp-card-number",
												inputMode: "numeric",
												autoComplete: "cc-number",
												placeholder: "4242 4242 4242 4242",
												value: mockCard.number,
												onChange: (e) => {
													const raw = e.target.value.replace(/\D/g, "").slice(0, 16);
													const grouped = raw.replace(/(\d{4})(?=\d)/g, "$1 ").trim();
													setMockCard((m) => ({
														...m,
														number: grouped
													}));
													setApiError("");
												}
											}, void 0, false, {
												fileName: _jsxFileName,
												lineNumber: 1163,
												columnNumber: 23
											}, this)]
										}, void 0, true, {
											fileName: _jsxFileName,
											lineNumber: 1156,
											columnNumber: 21
										}, this),
										/* @__PURE__ */ _jsxDEV("div", {
											className: styles.mockCardRow,
											children: [/* @__PURE__ */ _jsxDEV("div", {
												className: styles.field,
												children: [/* @__PURE__ */ _jsxDEV("label", {
													htmlFor: "bp-card-exp",
													children: "Expiry"
												}, void 0, false, {
													fileName: _jsxFileName,
													lineNumber: 1179,
													columnNumber: 25
												}, this), /* @__PURE__ */ _jsxDEV("input", {
													id: "bp-card-exp",
													inputMode: "numeric",
													autoComplete: "cc-exp",
													placeholder: "MM/YY",
													value: mockCard.expiry,
													onChange: (e) => {
														let v = e.target.value.replace(/[^\d]/g, "").slice(0, 5);
														if (v.length >= 3 && !v.includes("/")) {
															v = `${v.slice(0, 2)}/${v.slice(2)}`;
														}
														setMockCard((m) => ({
															...m,
															expiry: v
														}));
													}
												}, void 0, false, {
													fileName: _jsxFileName,
													lineNumber: 1180,
													columnNumber: 25
												}, this)]
											}, void 0, true, {
												fileName: _jsxFileName,
												lineNumber: 1178,
												columnNumber: 23
											}, this), /* @__PURE__ */ _jsxDEV("div", {
												className: styles.field,
												children: [/* @__PURE__ */ _jsxDEV("label", {
													htmlFor: "bp-card-cvc",
													children: "CVC"
												}, void 0, false, {
													fileName: _jsxFileName,
													lineNumber: 1196,
													columnNumber: 25
												}, this), /* @__PURE__ */ _jsxDEV("input", {
													id: "bp-card-cvc",
													inputMode: "numeric",
													autoComplete: "cc-csc",
													placeholder: "123",
													value: mockCard.cvc,
													onChange: (e) => setMockCard((m) => ({
														...m,
														cvc: e.target.value.replace(/\D/g, "").slice(0, 4)
													}))
												}, void 0, false, {
													fileName: _jsxFileName,
													lineNumber: 1197,
													columnNumber: 25
												}, this)]
											}, void 0, true, {
												fileName: _jsxFileName,
												lineNumber: 1195,
												columnNumber: 23
											}, this)]
										}, void 0, true, {
											fileName: _jsxFileName,
											lineNumber: 1177,
											columnNumber: 21
										}, this)
									]
								}, void 0, true, {
									fileName: _jsxFileName,
									lineNumber: 1134,
									columnNumber: 19
								}, this) : /* @__PURE__ */ _jsxDEV("div", {
									className: styles.stripeMount,
									ref: cardMountRef
								}, void 0, false, {
									fileName: _jsxFileName,
									lineNumber: 1214,
									columnNumber: 19
								}, this)),
								payMethod === "upi" && /* @__PURE__ */ _jsxDEV("p", {
									className: styles.muted,
									children: useMockCard ? "UPI isn’t available in this sandbox demo. Select Credit or Debit and use test card 4242 4242 4242 4242." : "Live LiteAPI holds use Stripe card capture. Select Credit or Debit to pay securely — we never mark payment successful without the Payment SDK."
								}, void 0, false, {
									fileName: _jsxFileName,
									lineNumber: 1218,
									columnNumber: 17
								}, this)
							]
						}, void 0, true, {
							fileName: _jsxFileName,
							lineNumber: 1084,
							columnNumber: 13
						}, this),
						step === "confirmation" && /* @__PURE__ */ _jsxDEV("div", {
							className: styles.confirmBox,
							children: [
								/* @__PURE__ */ _jsxDEV("div", {
									className: styles.confirmHero,
									children: [/* @__PURE__ */ _jsxDEV(CheckCircle2, {
										size: 28,
										"aria-hidden": true,
										className: styles.confirmIcon
									}, void 0, false, {
										fileName: _jsxFileName,
										lineNumber: 1230,
										columnNumber: 17
									}, this), /* @__PURE__ */ _jsxDEV("div", { children: [/* @__PURE__ */ _jsxDEV("h3", { children: booking?.sandbox_hold ? "Fare held (sandbox)" : hasConfValue(booking?.airline_pnr) || hasConfValue(booking?.ticket_numbers) ? "Booking confirmed" : "Booking recorded" }, void 0, false, {
										fileName: _jsxFileName,
										lineNumber: 1232,
										columnNumber: 19
									}, this), /* @__PURE__ */ _jsxDEV("p", {
										className: styles.muted,
										children: booking?.sandbox_hold ? booking?.honest_status || "Demo payment accepted. No airline ticket was invented — only the LiteAPI hold ID is shown." : hasConfValue(booking?.airline_pnr) || Array.isArray(booking?.ticket_numbers) && booking.ticket_numbers.length ? "Your payment succeeded and the ticket was issued from the live booking response." : "Payment step finished. Status below reflects what LiteAPI returned — no ticket numbers are invented."
									}, void 0, false, {
										fileName: _jsxFileName,
										lineNumber: 1239,
										columnNumber: 19
									}, this)] }, void 0, true, {
										fileName: _jsxFileName,
										lineNumber: 1231,
										columnNumber: 17
									}, this)]
								}, void 0, true, {
									fileName: _jsxFileName,
									lineNumber: 1229,
									columnNumber: 15
								}, this),
								/* @__PURE__ */ _jsxDEV("div", {
									className: styles.confirmGrid,
									children: [
										hasConfValue(booking?.booking_id) ? /* @__PURE__ */ _jsxDEV("div", {
											className: styles.confirmField,
											children: [/* @__PURE__ */ _jsxDEV("span", { children: "Booking ID" }, void 0, false, {
												fileName: _jsxFileName,
												lineNumber: 1254,
												columnNumber: 21
											}, this), /* @__PURE__ */ _jsxDEV("strong", { children: /* @__PURE__ */ _jsxDEV("code", { children: booking.booking_id }, void 0, false, {
												fileName: _jsxFileName,
												lineNumber: 1256,
												columnNumber: 23
											}, this) }, void 0, false, {
												fileName: _jsxFileName,
												lineNumber: 1255,
												columnNumber: 21
											}, this)]
										}, void 0, true, {
											fileName: _jsxFileName,
											lineNumber: 1253,
											columnNumber: 19
										}, this) : null,
										hasConfValue(booking?.prebook_id) ? /* @__PURE__ */ _jsxDEV("div", {
											className: styles.confirmField,
											children: [/* @__PURE__ */ _jsxDEV("span", { children: "Hold ID" }, void 0, false, {
												fileName: _jsxFileName,
												lineNumber: 1262,
												columnNumber: 21
											}, this), /* @__PURE__ */ _jsxDEV("strong", { children: /* @__PURE__ */ _jsxDEV("code", { children: booking.prebook_id }, void 0, false, {
												fileName: _jsxFileName,
												lineNumber: 1264,
												columnNumber: 23
											}, this) }, void 0, false, {
												fileName: _jsxFileName,
												lineNumber: 1263,
												columnNumber: 21
											}, this)]
										}, void 0, true, {
											fileName: _jsxFileName,
											lineNumber: 1261,
											columnNumber: 19
										}, this) : null,
										hasConfValue(booking?.honest_status) ? /* @__PURE__ */ _jsxDEV("div", {
											className: styles.confirmField,
											children: [/* @__PURE__ */ _jsxDEV("span", { children: "Status" }, void 0, false, {
												fileName: _jsxFileName,
												lineNumber: 1270,
												columnNumber: 21
											}, this), /* @__PURE__ */ _jsxDEV("strong", { children: booking.honest_status }, void 0, false, {
												fileName: _jsxFileName,
												lineNumber: 1271,
												columnNumber: 21
											}, this)]
										}, void 0, true, {
											fileName: _jsxFileName,
											lineNumber: 1269,
											columnNumber: 19
										}, this) : hasConfValue(booking?.status) ? /* @__PURE__ */ _jsxDEV("div", {
											className: styles.confirmField,
											children: [/* @__PURE__ */ _jsxDEV("span", { children: "Status" }, void 0, false, {
												fileName: _jsxFileName,
												lineNumber: 1275,
												columnNumber: 21
											}, this), /* @__PURE__ */ _jsxDEV("strong", { children: booking.status }, void 0, false, {
												fileName: _jsxFileName,
												lineNumber: 1276,
												columnNumber: 21
											}, this)]
										}, void 0, true, {
											fileName: _jsxFileName,
											lineNumber: 1274,
											columnNumber: 19
										}, this) : null,
										hasConfValue(booking?.payment_status) ? /* @__PURE__ */ _jsxDEV("div", {
											className: styles.confirmField,
											children: [/* @__PURE__ */ _jsxDEV("span", { children: "Payment" }, void 0, false, {
												fileName: _jsxFileName,
												lineNumber: 1281,
												columnNumber: 21
											}, this), /* @__PURE__ */ _jsxDEV("strong", { children: booking.payment_status }, void 0, false, {
												fileName: _jsxFileName,
												lineNumber: 1282,
												columnNumber: 21
											}, this)]
										}, void 0, true, {
											fileName: _jsxFileName,
											lineNumber: 1280,
											columnNumber: 19
										}, this) : null,
										hasConfValue(booking?.booking_ref) ? /* @__PURE__ */ _jsxDEV("div", {
											className: styles.confirmField,
											children: [/* @__PURE__ */ _jsxDEV("span", { children: "Booking reference" }, void 0, false, {
												fileName: _jsxFileName,
												lineNumber: 1287,
												columnNumber: 21
											}, this), /* @__PURE__ */ _jsxDEV("strong", { children: /* @__PURE__ */ _jsxDEV("code", { children: booking.booking_ref }, void 0, false, {
												fileName: _jsxFileName,
												lineNumber: 1289,
												columnNumber: 23
											}, this) }, void 0, false, {
												fileName: _jsxFileName,
												lineNumber: 1288,
												columnNumber: 21
											}, this)]
										}, void 0, true, {
											fileName: _jsxFileName,
											lineNumber: 1286,
											columnNumber: 19
										}, this) : null,
										hasConfValue(booking?.airline_pnr) ? /* @__PURE__ */ _jsxDEV("div", {
											className: styles.confirmField,
											children: [/* @__PURE__ */ _jsxDEV("span", { children: "Airline PNR" }, void 0, false, {
												fileName: _jsxFileName,
												lineNumber: 1295,
												columnNumber: 21
											}, this), /* @__PURE__ */ _jsxDEV("strong", { children: /* @__PURE__ */ _jsxDEV("code", { children: booking.airline_pnr }, void 0, false, {
												fileName: _jsxFileName,
												lineNumber: 1297,
												columnNumber: 23
											}, this) }, void 0, false, {
												fileName: _jsxFileName,
												lineNumber: 1296,
												columnNumber: 21
											}, this)]
										}, void 0, true, {
											fileName: _jsxFileName,
											lineNumber: 1294,
											columnNumber: 19
										}, this) : null,
										confPaidLabel ? /* @__PURE__ */ _jsxDEV("div", {
											className: styles.confirmField,
											children: [/* @__PURE__ */ _jsxDEV("span", { children: "Total paid" }, void 0, false, {
												fileName: _jsxFileName,
												lineNumber: 1303,
												columnNumber: 21
											}, this), /* @__PURE__ */ _jsxDEV("strong", { children: confPaidLabel }, void 0, false, {
												fileName: _jsxFileName,
												lineNumber: 1304,
												columnNumber: 21
											}, this)]
										}, void 0, true, {
											fileName: _jsxFileName,
											lineNumber: 1302,
											columnNumber: 19
										}, this) : null
									]
								}, void 0, true, {
									fileName: _jsxFileName,
									lineNumber: 1251,
									columnNumber: 15
								}, this),
								confLocators.length > 0 ? /* @__PURE__ */ _jsxDEV("div", {
									className: styles.confirmSection,
									children: [/* @__PURE__ */ _jsxDEV("h4", { children: "Airline locators" }, void 0, false, {
										fileName: _jsxFileName,
										lineNumber: 1311,
										columnNumber: 19
									}, this), /* @__PURE__ */ _jsxDEV("ul", { children: confLocators.map((loc, idx) => /* @__PURE__ */ _jsxDEV("li", { children: [loc.airline_code || loc.airline_name, loc.airline_pnr].filter(Boolean).join(" · ") }, `loc-${idx}`, false, {
										fileName: _jsxFileName,
										lineNumber: 1314,
										columnNumber: 23
									}, this)) }, void 0, false, {
										fileName: _jsxFileName,
										lineNumber: 1312,
										columnNumber: 19
									}, this)]
								}, void 0, true, {
									fileName: _jsxFileName,
									lineNumber: 1310,
									columnNumber: 17
								}, this) : null,
								confTickets.length > 0 || hasConfValue(confTicketData.confirmation_id) || hasConfValue(confTicketData.ticketed_at) ? /* @__PURE__ */ _jsxDEV("div", {
									className: styles.confirmSection,
									children: [/* @__PURE__ */ _jsxDEV("h4", { children: "Tickets" }, void 0, false, {
										fileName: _jsxFileName,
										lineNumber: 1328,
										columnNumber: 19
									}, this), /* @__PURE__ */ _jsxDEV("ul", { children: [
										confTickets.map((t) => /* @__PURE__ */ _jsxDEV("li", { children: ["Ticket number: ", /* @__PURE__ */ _jsxDEV("code", { children: t }, void 0, false, {
											fileName: _jsxFileName,
											lineNumber: 1332,
											columnNumber: 40
										}, this)] }, t, true, {
											fileName: _jsxFileName,
											lineNumber: 1331,
											columnNumber: 23
										}, this)),
										hasConfValue(confTicketData.confirmation_id) ? /* @__PURE__ */ _jsxDEV("li", { children: ["Confirmation ID: ", /* @__PURE__ */ _jsxDEV("code", { children: confTicketData.confirmation_id }, void 0, false, {
											fileName: _jsxFileName,
											lineNumber: 1337,
											columnNumber: 42
										}, this)] }, void 0, true, {
											fileName: _jsxFileName,
											lineNumber: 1336,
											columnNumber: 23
										}, this) : null,
										hasConfValue(confTicketData.ticketed_at) ? /* @__PURE__ */ _jsxDEV("li", { children: ["Ticketed at: ", confTicketData.ticketed_at] }, void 0, true, {
											fileName: _jsxFileName,
											lineNumber: 1341,
											columnNumber: 23
										}, this) : null
									] }, void 0, true, {
										fileName: _jsxFileName,
										lineNumber: 1329,
										columnNumber: 19
									}, this)]
								}, void 0, true, {
									fileName: _jsxFileName,
									lineNumber: 1327,
									columnNumber: 17
								}, this) : null,
								hasConfValue(booking?.eticket_url) ? /* @__PURE__ */ _jsxDEV("div", {
									className: styles.confirmSection,
									children: [/* @__PURE__ */ _jsxDEV("h4", { children: "E-ticket" }, void 0, false, {
										fileName: _jsxFileName,
										lineNumber: 1349,
										columnNumber: 19
									}, this), /* @__PURE__ */ _jsxDEV("a", {
										className: styles.eticketLink,
										href: booking.eticket_url,
										target: "_blank",
										rel: "noopener noreferrer",
										children: ["Open e-ticket ", /* @__PURE__ */ _jsxDEV(ExternalLink, {
											size: 14,
											"aria-hidden": true
										}, void 0, false, {
											fileName: _jsxFileName,
											lineNumber: 1356,
											columnNumber: 35
										}, this)]
									}, void 0, true, {
										fileName: _jsxFileName,
										lineNumber: 1350,
										columnNumber: 19
									}, this)]
								}, void 0, true, {
									fileName: _jsxFileName,
									lineNumber: 1348,
									columnNumber: 17
								}, this) : null,
								confPassengers.length > 0 ? /* @__PURE__ */ _jsxDEV("div", {
									className: styles.confirmSection,
									children: [/* @__PURE__ */ _jsxDEV("h4", { children: "Passengers" }, void 0, false, {
										fileName: _jsxFileName,
										lineNumber: 1363,
										columnNumber: 19
									}, this), /* @__PURE__ */ _jsxDEV("ul", { children: confPassengers.map((p, idx) => {
										const name = passengerDisplayName(p);
										const extras = [p.date_of_birth || p.dob ? formatDobDisplay(p.date_of_birth || p.dob) : null, p.ticket_number ? `Ticket ${p.ticket_number}` : null].filter(hasConfValue);
										return /* @__PURE__ */ _jsxDEV("li", { children: [name || `Passenger ${idx + 1}`, extras.length ? /* @__PURE__ */ _jsxDEV("span", {
											className: styles.muted,
											children: [" · ", extras.join(" · ")]
										}, void 0, true, {
											fileName: _jsxFileName,
											lineNumber: 1377,
											columnNumber: 29
										}, this) : null] }, `pax-${idx}`, true, {
											fileName: _jsxFileName,
											lineNumber: 1374,
											columnNumber: 25
										}, this);
									}) }, void 0, false, {
										fileName: _jsxFileName,
										lineNumber: 1364,
										columnNumber: 19
									}, this)]
								}, void 0, true, {
									fileName: _jsxFileName,
									lineNumber: 1362,
									columnNumber: 17
								}, this) : null,
								confSegments.length > 0 ? /* @__PURE__ */ _jsxDEV("div", {
									className: styles.confirmSection,
									children: [/* @__PURE__ */ _jsxDEV("h4", { children: "Flight segments" }, void 0, false, {
										fileName: _jsxFileName,
										lineNumber: 1388,
										columnNumber: 19
									}, this), /* @__PURE__ */ _jsxDEV("ul", {
										className: styles.segmentList,
										children: confSegments.map((seg, idx) => {
											const s = segmentDisplay(seg);
											if (!s) return null;
											return /* @__PURE__ */ _jsxDEV("li", { children: [
												/* @__PURE__ */ _jsxDEV("strong", { children: s.route || `Segment ${idx + 1}` }, void 0, false, {
													fileName: _jsxFileName,
													lineNumber: 1395,
													columnNumber: 27
												}, this),
												s.flight ? /* @__PURE__ */ _jsxDEV("span", { children: s.flight }, void 0, false, {
													fileName: _jsxFileName,
													lineNumber: 1396,
													columnNumber: 39
												}, this) : null,
												s.dep || s.arr ? /* @__PURE__ */ _jsxDEV("span", {
													className: styles.muted,
													children: [s.dep, s.arr].filter(Boolean).join(" → ")
												}, void 0, false, {
													fileName: _jsxFileName,
													lineNumber: 1398,
													columnNumber: 29
												}, this) : null
											] }, `seg-${idx}`, true, {
												fileName: _jsxFileName,
												lineNumber: 1394,
												columnNumber: 25
											}, this);
										})
									}, void 0, false, {
										fileName: _jsxFileName,
										lineNumber: 1389,
										columnNumber: 19
									}, this)]
								}, void 0, true, {
									fileName: _jsxFileName,
									lineNumber: 1387,
									columnNumber: 17
								}, this) : null,
								pdfError ? /* @__PURE__ */ _jsxDEV("div", {
									className: `${styles.banner} ${styles.bannerError}`,
									children: pdfError
								}, void 0, false, {
									fileName: _jsxFileName,
									lineNumber: 1410,
									columnNumber: 17
								}, this) : null
							]
						}, void 0, true, {
							fileName: _jsxFileName,
							lineNumber: 1228,
							columnNumber: 13
						}, this)
					]
				}, void 0, true, {
					fileName: _jsxFileName,
					lineNumber: 834,
					columnNumber: 9
				}, this),
				/* @__PURE__ */ _jsxDEV("footer", {
					className: styles.footer,
					children: [
						step === "form" ? /* @__PURE__ */ _jsxDEV("button", {
							type: "button",
							className: styles.btnPrimary,
							disabled: submitting,
							onClick: goToReview,
							children: "Continue"
						}, void 0, false, {
							fileName: _jsxFileName,
							lineNumber: 1418,
							columnNumber: 13
						}, this) : null,
						step === "review" ? /* @__PURE__ */ _jsxDEV("button", {
							type: "button",
							className: styles.btnPrimary,
							disabled: submitting,
							onClick: goToPayment,
							children: submitting ? "Working…" : "Continue & Proceed to Payment"
						}, void 0, false, {
							fileName: _jsxFileName,
							lineNumber: 1428,
							columnNumber: 13
						}, this) : null,
						step === "payment" ? /* @__PURE__ */ _jsxDEV("div", {
							className: styles.payFooter,
							children: [apiError ? /* @__PURE__ */ _jsxDEV("div", {
								id: "bp-pay-error",
								className: `${styles.banner} ${styles.bannerError}`,
								children: apiError
							}, void 0, false, {
								fileName: _jsxFileName,
								lineNumber: 1440,
								columnNumber: 17
							}, this) : null, /* @__PURE__ */ _jsxDEV("button", {
								type: "button",
								className: styles.btnPrimary,
								disabled: submitting,
								onClick: handlePayAndComplete,
								children: submitting ? "Processing…" : `Pay Securely ${priceLabel}`
							}, void 0, false, {
								fileName: _jsxFileName,
								lineNumber: 1444,
								columnNumber: 15
							}, this)]
						}, void 0, true, {
							fileName: _jsxFileName,
							lineNumber: 1438,
							columnNumber: 13
						}, this) : null,
						step === "confirmation" ? /* @__PURE__ */ _jsxDEV("div", {
							className: styles.confirmActions,
							children: [/* @__PURE__ */ _jsxDEV("button", {
								type: "button",
								className: styles.btnSecondary,
								onClick: handleDownloadPdf,
								disabled: !booking,
								children: [/* @__PURE__ */ _jsxDEV(Download, {
									size: 16,
									"aria-hidden": true
								}, void 0, false, {
									fileName: _jsxFileName,
									lineNumber: 1462,
									columnNumber: 17
								}, this), "Download as PDF"]
							}, void 0, true, {
								fileName: _jsxFileName,
								lineNumber: 1456,
								columnNumber: 15
							}, this), /* @__PURE__ */ _jsxDEV("button", {
								type: "button",
								className: styles.btnPrimary,
								onClick: () => {
									onSuccess?.(booking);
									onClose?.();
								},
								children: "Done"
							}, void 0, false, {
								fileName: _jsxFileName,
								lineNumber: 1465,
								columnNumber: 15
							}, this)]
						}, void 0, true, {
							fileName: _jsxFileName,
							lineNumber: 1455,
							columnNumber: 13
						}, this) : null
					]
				}, void 0, true, {
					fileName: _jsxFileName,
					lineNumber: 1416,
					columnNumber: 9
				}, this)
			]
		}, void 0, true, {
			fileName: _jsxFileName,
			lineNumber: 813,
			columnNumber: 7
		}, this)
	}, void 0, false, {
		fileName: _jsxFileName,
		lineNumber: 806,
		columnNumber: 5
	}, this);
}
_s(BookingPopup, "c4UIwxqGwDoRssU4scq61tfDZ3s=");
_c = BookingPopup;
var _c;
$RefreshReg$(_c, "BookingPopup");
import * as RefreshRuntime from "/itinero/@react-refresh";
const inWebWorker = typeof WorkerGlobalScope !== 'undefined' && self instanceof WorkerGlobalScope;
import * as __vite_react_currentExports from "/itinero/src/features/booking/components/BookingPopup.jsx?t=1785127988186";
if (import.meta.hot && !inWebWorker) {
  if (!window.$RefreshReg$) {
    throw new Error(
      "@vitejs/plugin-react can't detect preamble. Something is wrong."
    );
  }

  const currentExports = __vite_react_currentExports;
  queueMicrotask(() => {
    RefreshRuntime.registerExportsForReactRefresh("C:/Users/Jayneel/Itinero Final/itinero/src/features/booking/components/BookingPopup.jsx", currentExports);
    import.meta.hot.accept((nextExports) => {
      if (!nextExports) return;
      const invalidateMessage = RefreshRuntime.validateRefreshBoundaryAndEnqueueUpdate("C:/Users/Jayneel/Itinero Final/itinero/src/features/booking/components/BookingPopup.jsx", currentExports, nextExports);
      if (invalidateMessage) import.meta.hot.invalidate(invalidateMessage);
    });
  });
}
function $RefreshReg$(type, id) { return RefreshRuntime.register(type, "C:/Users/Jayneel/Itinero Final/itinero/src/features/booking/components/BookingPopup.jsx" + ' ' + id); }
function $RefreshSig$() { return RefreshRuntime.createSignatureFunctionForTransform(); }

//# sourceMappingURL=data:application/json;base64,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QkFDUix3QkFBQyxPQUFEO09BQUssV0FBVyxPQUFPO2lCQUF2QixDQUNFLHdCQUFDLFVBQUQ7UUFDRSxNQUFLO1FBQ0wsV0FBVyxPQUFPO1FBQ2xCLFNBQVM7UUFDVCxVQUFVLENBQUM7a0JBSmIsQ0FNRSx3QkFBQyxVQUFEO1NBQVUsTUFBTTtTQUFJO1FBQWE7Ozs7a0JBQUMsaUJBRTVCOzs7OztpQkFDUix3QkFBQyxVQUFEO1FBQ0UsTUFBSztRQUNMLFdBQVcsT0FBTztRQUNsQixlQUFlO1NBQ2IsWUFBWSxPQUFPO1NBQ25CLFVBQVU7UUFDWjtrQkFDRDtPQUVPOzs7O2VBQ0w7Ozs7O2lCQUNIO0tBQ0U7Ozs7OztHQUNMOzs7Ozs7Q0FDRjs7Ozs7QUFFVCIsIm5hbWVzIjpbXSwic291cmNlcyI6WyJCb29raW5nUG9wdXAuanN4Il0sInZlcnNpb24iOjMsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCBSZWFjdCwgeyB1c2VFZmZlY3QsIHVzZU1lbW8sIHVzZVJlZiwgdXNlU3RhdGUgfSBmcm9tIFwicmVhY3RcIjtcclxuaW1wb3J0IHsgQ2hlY2tDaXJjbGUyLCBDcmVkaXRDYXJkLCBEb3dubG9hZCwgRXh0ZXJuYWxMaW5rLCBTbWFydHBob25lLCBYIH0gZnJvbSBcImx1Y2lkZS1yZWFjdFwiO1xyXG5pbXBvcnQgeyBmbGlnaHRTZXJ2aWNlIH0gZnJvbSBcIkAvZmVhdHVyZXMvZmxpZ2h0cy9zZXJ2aWNlcy9mbGlnaHRTZXJ2aWNlXCI7XHJcbmltcG9ydCB7IGRvd25sb2FkQm9va2luZ0NvbmZpcm1hdGlvblBkZiB9IGZyb20gXCJAL2ZlYXR1cmVzL2Jvb2tpbmcvdXRpbHMvYm9va2luZ0NvbmZpcm1hdGlvblBkZlwiO1xyXG5pbXBvcnQgc3R5bGVzIGZyb20gXCIuL0Jvb2tpbmdQb3B1cC5tb2R1bGUuY3NzXCI7XHJcblxyXG5jb25zdCBJTkRJQU5fQUlSUE9SVFMgPSBuZXcgU2V0KFtcclxuICBcIkJPTVwiLCBcIkRFTFwiLCBcIkJMUlwiLCBcIk1BQVwiLCBcIkNDVVwiLCBcIkhZRFwiLCBcIlBOUVwiLCBcIkdPSVwiLCBcIkFNRFwiLCBcIkNPS1wiLFxyXG4gIFwiSkFJXCIsIFwiTEtPXCIsIFwiR0FVXCIsIFwiSVhDXCIsIFwiQkJJXCIsIFwiVFJWXCIsIFwiVk5TXCIsIFwiUEFUXCIsIFwiSURSXCIsIFwiTkFHXCIsIFwiU1RWXCIsXHJcbl0pO1xyXG5cclxuY29uc3QgRU1BSUxfUkUgPSAvXlteXFxzQF0rQFteXFxzQF0rXFwuW15cXHNAXSskLztcclxuY29uc3QgUEhPTkVfUkUgPSAvXlswLTldezgsMTV9JC87XHJcbmNvbnN0IFNBVkVEX1BBWF9LRVkgPSBcIml0aW5lcm9fdmVyb19zYXZlZF9wYXhcIjtcclxuY29uc3QgUExBQ0VIT0xERVJfUEhPTkVTID0gbmV3IFNldChbXHJcbiAgXCIwMDAwMDAwMDAwXCIsXHJcbiAgXCIxMTExMTExMTExXCIsXHJcbiAgXCIxMjM0NTY3ODkwXCIsXHJcbiAgXCIwMTIzNDU2Nzg5XCIsXHJcbiAgXCI5ODc2NTQzMjEwXCIsXHJcbiAgXCI5OTk5OTk5OTk5XCIsXHJcbiAgXCI4ODg4ODg4ODg4XCIsXHJcbiAgXCI3Nzc3Nzc3Nzc3XCIsXHJcbiAgXCI2NjY2NjY2NjY2XCIsXHJcbiAgXCI1NTU1NTU1NTU1XCIsXHJcbiAgXCI0NDQ0NDQ0NDQ0XCIsXHJcbiAgXCIzMzMzMzMzMzMzXCIsXHJcbiAgXCIyMjIyMjIyMjIyXCIsXHJcbiAgXCIxMDEwMTAxMDEwXCIsXHJcbiAgXCIxMjEyMTIxMjEyXCIsXHJcbl0pO1xyXG5cclxuZnVuY3Rpb24gaXNQbGFjZWhvbGRlclBob25lKGRpZ2l0cykge1xyXG4gIGNvbnN0IGQgPSBTdHJpbmcoZGlnaXRzIHx8IFwiXCIpLnJlcGxhY2UoL1xcRC9nLCBcIlwiKTtcclxuICBpZiAoIWQpIHJldHVybiB0cnVlO1xyXG4gIGNvbnN0IG5hdGlvbmFsID0gZC5sZW5ndGggPj0gMTAgPyBkLnNsaWNlKC0xMCkgOiBkO1xyXG4gIGlmIChQTEFDRUhPTERFUl9QSE9ORVMuaGFzKGQpIHx8IFBMQUNFSE9MREVSX1BIT05FUy5oYXMobmF0aW9uYWwpKSByZXR1cm4gdHJ1ZTtcclxuICBpZiAobmF0aW9uYWwubGVuZ3RoID49IDggJiYgbmV3IFNldChuYXRpb25hbCkuc2l6ZSA9PT0gMSkgcmV0dXJuIHRydWU7XHJcbiAgaWYgKG5hdGlvbmFsLmxlbmd0aCA+PSA4KSB7XHJcbiAgICBsZXQgYXNjID0gdHJ1ZTtcclxuICAgIGxldCBkZXNjID0gdHJ1ZTtcclxuICAgIGZvciAobGV0IGkgPSAxOyBpIDwgbmF0aW9uYWwubGVuZ3RoOyBpICs9IDEpIHtcclxuICAgICAgY29uc3QgcHJldiA9IE51bWJlcihuYXRpb25hbFtpIC0gMV0pO1xyXG4gICAgICBjb25zdCBjdXIgPSBOdW1iZXIobmF0aW9uYWxbaV0pO1xyXG4gICAgICBpZiAoY3VyICE9PSAocHJldiArIDEpICUgMTApIGFzYyA9IGZhbHNlO1xyXG4gICAgICBpZiAoY3VyICE9PSAocHJldiAtIDEgKyAxMCkgJSAxMCkgZGVzYyA9IGZhbHNlO1xyXG4gICAgfVxyXG4gICAgaWYgKGFzYyB8fCBkZXNjKSByZXR1cm4gdHJ1ZTtcclxuICB9XHJcbiAgcmV0dXJuIGZhbHNlO1xyXG59XHJcblxyXG5mdW5jdGlvbiB0cmF2ZWxEYXRlSXNvKGZsaWdodCkge1xyXG4gIGNvbnN0IHJhdyA9XHJcbiAgICBmbGlnaHQ/LmRlcGFydHVyZT8uZGF0ZSB8fFxyXG4gICAgZmxpZ2h0Py5kZXBhcnR1cmVfZGF0ZSB8fFxyXG4gICAgZmxpZ2h0Py5kZXBhcnRfZGF0ZSB8fFxyXG4gICAgZmxpZ2h0Py5zZWdtZW50cz8uWzBdPy5kZXBhcnR1cmUgfHxcclxuICAgIFwiXCI7XHJcbiAgY29uc3QgcyA9IFN0cmluZyhyYXcpO1xyXG4gIGNvbnN0IG0gPSBzLm1hdGNoKC8oXFxkezR9LVxcZHsyfS1cXGR7Mn0pLyk7XHJcbiAgcmV0dXJuIG0gPyBtWzFdIDogbnVsbDtcclxufVxyXG5cclxuZnVuY3Rpb24gYWdlT25EYXRlKGRvYklzbywgb25Jc28pIHtcclxuICBpZiAoIWRvYklzbykgcmV0dXJuIG51bGw7XHJcbiAgY29uc3QgYiA9IG5ldyBEYXRlKGAke2RvYklzb31UMDA6MDA6MDBgKTtcclxuICBjb25zdCB0ID0gb25Jc28gPyBuZXcgRGF0ZShgJHtvbklzb31UMDA6MDA6MDBgKSA6IG5ldyBEYXRlKCk7XHJcbiAgaWYgKE51bWJlci5pc05hTihiLmdldFRpbWUoKSkgfHwgTnVtYmVyLmlzTmFOKHQuZ2V0VGltZSgpKSkgcmV0dXJuIG51bGw7XHJcbiAgbGV0IHllYXJzID0gdC5nZXRGdWxsWWVhcigpIC0gYi5nZXRGdWxsWWVhcigpO1xyXG4gIGNvbnN0IGJlZm9yZUJpcnRoZGF5ID1cclxuICAgIHQuZ2V0TW9udGgoKSA8IGIuZ2V0TW9udGgoKSB8fFxyXG4gICAgKHQuZ2V0TW9udGgoKSA9PT0gYi5nZXRNb250aCgpICYmIHQuZ2V0RGF0ZSgpIDwgYi5nZXREYXRlKCkpO1xyXG4gIGlmIChiZWZvcmVCaXJ0aGRheSkgeWVhcnMgLT0gMTtcclxuICByZXR1cm4geWVhcnM7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHNvZnRlbkJvb2tpbmdFcnJvcihtZXNzYWdlKSB7XHJcbiAgY29uc3QgcmF3ID0gU3RyaW5nKG1lc3NhZ2UgfHwgXCJcIik7XHJcbiAgY29uc3QgbG93ZXIgPSByYXcudG9Mb3dlckNhc2UoKTtcclxuICBpZiAoL2xpdGVhcGllcnJvclxccyo6L2kudGVzdChyYXcpIHx8IGxvd2VyLmluY2x1ZGVzKFwidW5hYmxlIHRvIHByb2Nlc3MgcHJlYm9va1wiKSkge1xyXG4gICAgaWYgKGxvd2VyLmluY2x1ZGVzKFwicGhvbmVcIikgfHwgbG93ZXIuaW5jbHVkZXMoXCJwbGFjZWhvbGRlclwiKSB8fCBsb3dlci5pbmNsdWRlcyhcInNlcXVlbnRpYWxcIikpIHtcclxuICAgICAgcmV0dXJuIChcclxuICAgICAgICBcIlRoYXQgcGhvbmUgbnVtYmVyIGxvb2tzIGludmFsaWQgb3IgbGlrZSBhIHRlc3QgcGxhY2Vob2xkZXIgXCIgK1xyXG4gICAgICAgIFwiKGUuZy4gOTg3NjU0MzIxMCkuIEVudGVyIGEgcmVhbCBtb2JpbGUgbnVtYmVyIGFuZCB0cnkgYWdhaW4uXCJcclxuICAgICAgKTtcclxuICAgIH1cclxuICAgIGlmIChsb3dlci5pbmNsdWRlcyhcImJpcnRoZGF5XCIpIHx8IGxvd2VyLmluY2x1ZGVzKFwiYWdlXCIpIHx8IGxvd2VyLmluY2x1ZGVzKFwiZG9iXCIpKSB7XHJcbiAgICAgIHJldHVybiAoXHJcbiAgICAgICAgXCJEYXRlIG9mIGJpcnRoIGRvZXMgbm90IG1hdGNoIHRoaXMgdHJhdmVsbGVyIHR5cGUuIFwiICtcclxuICAgICAgICBcIkFkdWx0cyBtdXN0IGJlIDEyKyBvbiB0aGUgdHJhdmVsIGRhdGUg4oCUIHVwZGF0ZSBET0IgYW5kIHRyeSBhZ2Fpbi5cIlxyXG4gICAgICApO1xyXG4gICAgfVxyXG4gICAgcmV0dXJuIChcclxuICAgICAgXCJXZSBjb3VsZG4ndCBob2xkIHRoaXMgZmFyZS4gQ2hlY2sgbmFtZSwgcGhvbmUsIGVtYWlsLCBkYXRlIG9mIGJpcnRoLCBhbmQgSUQg4oCUIHRoZW4gdHJ5IGFnYWluLlwiXHJcbiAgICApO1xyXG4gIH1cclxuICByZXR1cm4gcmF3LnJlcGxhY2UoL15MaXRlQVBJRXJyb3I6XFxzKi9pLCBcIlwiKS50cmltKCkgfHwgXCJCb29raW5nIGZhaWxlZC5cIjtcclxufVxyXG5cclxuZnVuY3Rpb24gZW1wdHlQYXNzZW5nZXIodHlwZSA9IDApIHtcclxuICByZXR1cm4ge1xyXG4gICAgdGl0bGU6IFwiTXJcIixcclxuICAgIGZpcnN0TmFtZTogXCJcIixcclxuICAgIGxhc3ROYW1lOiBcIlwiLFxyXG4gICAgZ2VuZGVyOiBcIlwiLFxyXG4gICAgZG9iOiBcIlwiLFxyXG4gICAgbmF0aW9uYWxpdHk6IFwiSU5cIixcclxuICAgIGRvY3VtZW50TnVtYmVyOiBcIlwiLFxyXG4gICAgZG9jdW1lbnRFeHBpcnk6IFwiXCIsXHJcbiAgICBkb2N1bWVudElzc3VlQ291bnRyeTogXCJJTlwiLFxyXG4gICAgcGFzc2VuZ2VyVHlwZTogdHlwZSxcclxuICB9O1xyXG59XHJcblxyXG5mdW5jdGlvbiBvZmZlcklkT2YoZmxpZ2h0KSB7XHJcbiAgaWYgKCFmbGlnaHQpIHJldHVybiBcIlwiO1xyXG4gIHJldHVybiBTdHJpbmcoZmxpZ2h0Lm9mZmVyX2lkIHx8IGZsaWdodC5vZmZlcklkIHx8IGZsaWdodC5pZCB8fCBcIlwiKTtcclxufVxyXG5cclxuZnVuY3Rpb24gbG9hZFNhdmVkUGF4KCkge1xyXG4gIHRyeSB7XHJcbiAgICBjb25zdCByYXcgPSBsb2NhbFN0b3JhZ2UuZ2V0SXRlbShTQVZFRF9QQVhfS0VZKTtcclxuICAgIGlmICghcmF3KSByZXR1cm4gbnVsbDtcclxuICAgIHJldHVybiBKU09OLnBhcnNlKHJhdyk7XHJcbiAgfSBjYXRjaCB7XHJcbiAgICByZXR1cm4gbnVsbDtcclxuICB9XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHNhdmVQYXhMb2NhbCh7IHBhc3NlbmdlcnMsIGVtYWlsLCBwaG9uZSwgcGhvbmVDYyB9KSB7XHJcbiAgdHJ5IHtcclxuICAgIGxvY2FsU3RvcmFnZS5zZXRJdGVtKFxyXG4gICAgICBTQVZFRF9QQVhfS0VZLFxyXG4gICAgICBKU09OLnN0cmluZ2lmeSh7IHBhc3NlbmdlcnMsIGVtYWlsLCBwaG9uZSwgcGhvbmVDYyB9KVxyXG4gICAgKTtcclxuICB9IGNhdGNoIHtcclxuICAgIC8qIGlnbm9yZSBxdW90YSAqL1xyXG4gIH1cclxufVxyXG5cclxuZnVuY3Rpb24gbG9hZFN0cmlwZUpzKCkge1xyXG4gIGlmICh0eXBlb2Ygd2luZG93ID09PSBcInVuZGVmaW5lZFwiKSByZXR1cm4gUHJvbWlzZS5yZWplY3QobmV3IEVycm9yKFwiTm8gd2luZG93XCIpKTtcclxuICBpZiAod2luZG93LlN0cmlwZSkgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh3aW5kb3cuU3RyaXBlKTtcclxuICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xyXG4gICAgY29uc3QgZXhpc3RpbmcgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCdzY3JpcHRbZGF0YS1pdGluZXJvLXN0cmlwZT1cIjFcIl0nKTtcclxuICAgIGlmIChleGlzdGluZykge1xyXG4gICAgICBleGlzdGluZy5hZGRFdmVudExpc3RlbmVyKFwibG9hZFwiLCAoKSA9PiByZXNvbHZlKHdpbmRvdy5TdHJpcGUpKTtcclxuICAgICAgZXhpc3RpbmcuYWRkRXZlbnRMaXN0ZW5lcihcImVycm9yXCIsICgpID0+IHJlamVjdChuZXcgRXJyb3IoXCJTdHJpcGUuanMgZmFpbGVkIHRvIGxvYWRcIikpKTtcclxuICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG4gICAgY29uc3Qgc2NyaXB0ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcInNjcmlwdFwiKTtcclxuICAgIHNjcmlwdC5zcmMgPSBcImh0dHBzOi8vanMuc3RyaXBlLmNvbS92My9cIjtcclxuICAgIHNjcmlwdC5hc3luYyA9IHRydWU7XHJcbiAgICBzY3JpcHQuZGF0YXNldC5pdGluZXJvU3RyaXBlID0gXCIxXCI7XHJcbiAgICBzY3JpcHQub25sb2FkID0gKCkgPT4gcmVzb2x2ZSh3aW5kb3cuU3RyaXBlKTtcclxuICAgIHNjcmlwdC5vbmVycm9yID0gKCkgPT4gcmVqZWN0KG5ldyBFcnJvcihcIlN0cmlwZS5qcyBmYWlsZWQgdG8gbG9hZFwiKSk7XHJcbiAgICBkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKHNjcmlwdCk7XHJcbiAgfSk7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGZvcm1hdERvYkRpc3BsYXkoaXNvKSB7XHJcbiAgaWYgKCFpc28pIHJldHVybiBcIuKAlFwiO1xyXG4gIHRyeSB7XHJcbiAgICBjb25zdCBkID0gbmV3IERhdGUoYCR7aXNvfVQwMDowMDowMGApO1xyXG4gICAgaWYgKE51bWJlci5pc05hTihkLmdldFRpbWUoKSkpIHJldHVybiBpc287XHJcbiAgICByZXR1cm4gZC50b0xvY2FsZURhdGVTdHJpbmcoXCJlbi1HQlwiLCB7XHJcbiAgICAgIGRheTogXCIyLWRpZ2l0XCIsXHJcbiAgICAgIG1vbnRoOiBcInNob3J0XCIsXHJcbiAgICAgIHllYXI6IFwibnVtZXJpY1wiLFxyXG4gICAgfSk7XHJcbiAgfSBjYXRjaCB7XHJcbiAgICByZXR1cm4gaXNvO1xyXG4gIH1cclxufVxyXG5cclxuZnVuY3Rpb24gaGFzQ29uZlZhbHVlKHZhbCkge1xyXG4gIGlmICh2YWwgPT0gbnVsbCkgcmV0dXJuIGZhbHNlO1xyXG4gIGlmICh0eXBlb2YgdmFsID09PSBcInN0cmluZ1wiKSByZXR1cm4gdmFsLnRyaW0oKS5sZW5ndGggPiAwO1xyXG4gIGlmIChBcnJheS5pc0FycmF5KHZhbCkpIHJldHVybiB2YWwubGVuZ3RoID4gMDtcclxuICByZXR1cm4gdHJ1ZTtcclxufVxyXG5cclxuZnVuY3Rpb24gZm9ybWF0Qm9va2luZ01vbmV5KGFtb3VudCwgY3VycmVuY3kpIHtcclxuICBpZiAoYW1vdW50ID09IG51bGwgfHwgYW1vdW50ID09PSBcIlwiKSByZXR1cm4gbnVsbDtcclxuICBjb25zdCBuID0gTnVtYmVyKGFtb3VudCk7XHJcbiAgaWYgKE51bWJlci5pc05hTihuKSkgcmV0dXJuIFN0cmluZyhhbW91bnQpO1xyXG4gIGNvbnN0IGN1ciA9IChjdXJyZW5jeSB8fCBcIlwiKS50b1VwcGVyQ2FzZSgpO1xyXG4gIHRyeSB7XHJcbiAgICByZXR1cm4gbmV3IEludGwuTnVtYmVyRm9ybWF0KFwiZW4tSU5cIiwge1xyXG4gICAgICBzdHlsZTogY3VyID8gXCJjdXJyZW5jeVwiIDogXCJkZWNpbWFsXCIsXHJcbiAgICAgIGN1cnJlbmN5OiBjdXIgfHwgdW5kZWZpbmVkLFxyXG4gICAgICBtYXhpbXVtRnJhY3Rpb25EaWdpdHM6IDIsXHJcbiAgICB9KS5mb3JtYXQobik7XHJcbiAgfSBjYXRjaCB7XHJcbiAgICByZXR1cm4gYCR7Y3VyID8gYCR7Y3VyfSBgIDogXCJcIn0ke24udG9Mb2NhbGVTdHJpbmcoXCJlbi1JTlwiKX1gO1xyXG4gIH1cclxufVxyXG5cclxuZnVuY3Rpb24gcGFzc2VuZ2VyRGlzcGxheU5hbWUocCkge1xyXG4gIGlmICghcCB8fCB0eXBlb2YgcCAhPT0gXCJvYmplY3RcIikgcmV0dXJuIG51bGw7XHJcbiAgY29uc3QgcGFydHMgPSBbcC50aXRsZSwgcC5maXJzdF9uYW1lIHx8IHAuZmlyc3ROYW1lLCBwLmxhc3RfbmFtZSB8fCBwLmxhc3ROYW1lXS5maWx0ZXIoQm9vbGVhbik7XHJcbiAgcmV0dXJuIHBhcnRzLmpvaW4oXCIgXCIpLnRyaW0oKSB8fCBudWxsO1xyXG59XHJcblxyXG5mdW5jdGlvbiBzZWdtZW50RGlzcGxheShzZWcpIHtcclxuICBpZiAoIXNlZyB8fCB0eXBlb2Ygc2VnICE9PSBcIm9iamVjdFwiKSByZXR1cm4gbnVsbDtcclxuICBjb25zdCByb3V0ZSA9IFtzZWcuZnJvbSwgc2VnLnRvXS5maWx0ZXIoQm9vbGVhbikuam9pbihcIiDihpIgXCIpO1xyXG4gIGNvbnN0IGZsaWdodCA9IFtzZWcuYWlybGluZSB8fCBzZWcuYWlybGluZV9jb2RlLCBzZWcuZmxpZ2h0X251bWJlcl0uZmlsdGVyKEJvb2xlYW4pLmpvaW4oXCIgXCIpO1xyXG4gIGNvbnN0IGRlcCA9IHNlZy5kZXBhcnR1cmUgfHwgXCJcIjtcclxuICBjb25zdCBhcnIgPSBzZWcuYXJyaXZhbCB8fCBcIlwiO1xyXG4gIHJldHVybiB7IHJvdXRlLCBmbGlnaHQsIGRlcCwgYXJyIH07XHJcbn1cclxuXHJcbi8qKiBQcmVmZXIgTGl0ZUFQSSBib29raW5nIGZpZWxkczsgZmlsbCBwYXNzZW5nZXJzL2NvbnRhY3QvZmxpZ2h0IG9ubHkgaWYgdGhlIGNvbXBsZXRlIHBheWxvYWQgb21pdHRlZCB0aGVtLiAqL1xyXG5mdW5jdGlvbiBtZXJnZUNvbmZpcm1hdGlvbkJvb2tpbmcoYXBpQm9va2luZywgeyBwYXNzZW5nZXJzLCBlbWFpbCwgcGhvbmUsIHBob25lQ2MsIGZsaWdodCB9KSB7XHJcbiAgY29uc3QgYiA9IGFwaUJvb2tpbmcgJiYgdHlwZW9mIGFwaUJvb2tpbmcgPT09IFwib2JqZWN0XCIgPyB7IC4uLmFwaUJvb2tpbmcgfSA6IHt9O1xyXG4gIGlmICghQXJyYXkuaXNBcnJheShiLnBhc3NlbmdlcnMpIHx8IGIucGFzc2VuZ2Vycy5sZW5ndGggPT09IDApIHtcclxuICAgIGIucGFzc2VuZ2VycyA9IChwYXNzZW5nZXJzIHx8IFtdKVxyXG4gICAgICAubWFwKChwKSA9PiAoe1xyXG4gICAgICAgIHRpdGxlOiBwLnRpdGxlIHx8IHVuZGVmaW5lZCxcclxuICAgICAgICBmaXJzdF9uYW1lOiBwLmZpcnN0TmFtZSB8fCB1bmRlZmluZWQsXHJcbiAgICAgICAgbGFzdF9uYW1lOiBwLmxhc3ROYW1lIHx8IHVuZGVmaW5lZCxcclxuICAgICAgICBkYXRlX29mX2JpcnRoOiBwLmRvYiB8fCB1bmRlZmluZWQsXHJcbiAgICAgICAgZ2VuZGVyOiBwLmdlbmRlciB8fCB1bmRlZmluZWQsXHJcbiAgICAgICAgcGFzc2VuZ2VyX3R5cGU6IHAucGFzc2VuZ2VyVHlwZSxcclxuICAgICAgfSkpXHJcbiAgICAgIC5maWx0ZXIoKHApID0+IHAuZmlyc3RfbmFtZSB8fCBwLmxhc3RfbmFtZSk7XHJcbiAgfVxyXG4gIGNvbnN0IGNvbnRhY3QgPSBiLmNvbnRhY3QgJiYgdHlwZW9mIGIuY29udGFjdCA9PT0gXCJvYmplY3RcIiA/IHsgLi4uYi5jb250YWN0IH0gOiB7fTtcclxuICBpZiAoIWhhc0NvbmZWYWx1ZShjb250YWN0LmVtYWlsKSAmJiBoYXNDb25mVmFsdWUoZW1haWwpKSBjb250YWN0LmVtYWlsID0gZW1haWw7XHJcbiAgaWYgKCFoYXNDb25mVmFsdWUoY29udGFjdC5waG9uZSkgJiYgaGFzQ29uZlZhbHVlKHBob25lKSkge1xyXG4gICAgY29udGFjdC5waG9uZSA9IHBob25lO1xyXG4gICAgaWYgKGhhc0NvbmZWYWx1ZShwaG9uZUNjKSkgY29udGFjdC5waG9uZV9jb3VudHJ5X2NvZGUgPSBwaG9uZUNjO1xyXG4gIH1cclxuICBiLmNvbnRhY3QgPSBjb250YWN0O1xyXG5cclxuICAvLyBTdXJmYWNlIHRoZSBzZWxlY3RlZCBvZmZlciBvbiBzYW5kYm94IGhvbGRzIHNvIGNvbmZpcm1hdGlvbiBpc24ndCBhIGJsYW5rIGNhcmQuXHJcbiAgaWYgKCghQXJyYXkuaXNBcnJheShiLnNlZ21lbnRzX3N1bW1hcnkpIHx8IGIuc2VnbWVudHNfc3VtbWFyeS5sZW5ndGggPT09IDApICYmIGZsaWdodCkge1xyXG4gICAgYi5zZWdtZW50c19zdW1tYXJ5ID0gW1xyXG4gICAgICB7XHJcbiAgICAgICAgYWlybGluZTogZmxpZ2h0LmFpcmxpbmU/Lm5hbWUgfHwgZmxpZ2h0LmFpcmxpbmVOYW1lLFxyXG4gICAgICAgIGZsaWdodF9udW1iZXI6IGZsaWdodC5mbGlnaHROdW1iZXIgfHwgZmxpZ2h0LmFpcmxpbmU/LmZsaWdodE51bWJlcixcclxuICAgICAgICBvcmlnaW46IGZsaWdodC5kZXBhcnR1cmU/LmFpcnBvcnQgfHwgZmxpZ2h0Lm9yaWdpbixcclxuICAgICAgICBkZXN0aW5hdGlvbjogZmxpZ2h0LmFycml2YWw/LmFpcnBvcnQgfHwgZmxpZ2h0LmRlc3RpbmF0aW9uLFxyXG4gICAgICAgIGRlcGFydHVyZTogZmxpZ2h0LmRlcGFydHVyZT8udGltZSB8fCBmbGlnaHQuZGVwYXJ0VGltZSxcclxuICAgICAgICBhcnJpdmFsOiBmbGlnaHQuYXJyaXZhbD8udGltZSB8fCBmbGlnaHQuYXJyaXZlVGltZSxcclxuICAgICAgfSxcclxuICAgIF07XHJcbiAgfVxyXG4gIGlmICghaGFzQ29uZlZhbHVlKGIuYWlybGluZSkgJiYgZmxpZ2h0Py5haXJsaW5lPy5uYW1lKSB7XHJcbiAgICBiLmFpcmxpbmUgPSBmbGlnaHQuYWlybGluZS5uYW1lO1xyXG4gIH1cclxuICBpZiAoYi50b3RhbF9wcmljZSA9PSBudWxsICYmIGIucHJpY2UgPT0gbnVsbCAmJiBmbGlnaHQ/LnByaWNlICE9IG51bGwpIHtcclxuICAgIGIudG90YWxfcHJpY2UgPSBmbGlnaHQucHJpY2U7XHJcbiAgICBiLnByaWNlID0gZmxpZ2h0LnByaWNlO1xyXG4gICAgYi5jdXJyZW5jeSA9IGZsaWdodC5jdXJyZW5jeSB8fCBiLmN1cnJlbmN5IHx8IFwiSU5SXCI7XHJcbiAgfVxyXG4gIHJldHVybiBiO1xyXG59XHJcblxyXG4vKipcclxuICogU2hhcmVkIGJvb2tpbmcgbW9kYWwgZm9yIG1hbnVhbCBmbGlnaHRzICsgVmVybyBpbi1jaGF0IEJvb2sgTm93LlxyXG4gKiBTdGVwczogcGFzc2VuZ2VyIGRldGFpbHMg4oaSIHJldmlldyDihpIgcGF5bWVudCAoTGl0ZUFQSS9TdHJpcGUpIOKGkiBjb25maXJtYXRpb24uXHJcbiAqL1xyXG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbiBCb29raW5nUG9wdXAoe1xyXG4gIGlzT3BlbixcclxuICBvbkNsb3NlLFxyXG4gIGZsaWdodCxcclxuICBzZXNzaW9uSWQsXHJcbiAgYWR1bHRzID0gMSxcclxuICBjaGlsZHJlbkNvdW50ID0gMCxcclxuICBpbmZhbnRzID0gMCxcclxuICBvcmlnaW4gPSBcIlwiLFxyXG4gIGRlc3RpbmF0aW9uID0gXCJcIixcclxuICBvblN1Y2Nlc3MsXHJcbn0pIHtcclxuICBjb25zdCBkb21lc3RpYyA9IHVzZU1lbW8oKCkgPT4ge1xyXG4gICAgY29uc3QgbyA9IChvcmlnaW4gfHwgZmxpZ2h0Py5kZXBhcnR1cmU/LmFpcnBvcnQgfHwgXCJcIikudG9VcHBlckNhc2UoKTtcclxuICAgIGNvbnN0IGQgPSAoZGVzdGluYXRpb24gfHwgZmxpZ2h0Py5hcnJpdmFsPy5haXJwb3J0IHx8IFwiXCIpLnRvVXBwZXJDYXNlKCk7XHJcbiAgICByZXR1cm4gSU5ESUFOX0FJUlBPUlRTLmhhcyhvKSAmJiBJTkRJQU5fQUlSUE9SVFMuaGFzKGQpO1xyXG4gIH0sIFtvcmlnaW4sIGRlc3RpbmF0aW9uLCBmbGlnaHRdKTtcclxuXHJcbiAgY29uc3QgZG9jVHlwZSA9IGRvbWVzdGljID8gXCJpZFwiIDogXCJwYXNzcG9ydFwiO1xyXG4gIGNvbnN0IGRlZmF1bHRFeHBpcnkgPSBcIjIwMzAtMTItMzFcIjtcclxuXHJcbiAgY29uc3QgcGFzc2VuZ2VyUGxhbiA9IHVzZU1lbW8oKCkgPT4ge1xyXG4gICAgY29uc3QgcGxhbiA9IFtdO1xyXG4gICAgY29uc3QgYSA9IE1hdGgubWF4KDEsIE51bWJlcihhZHVsdHMpIHx8IDEpO1xyXG4gICAgY29uc3QgYyA9IE1hdGgubWF4KDAsIE51bWJlcihjaGlsZHJlbkNvdW50KSB8fCAwKTtcclxuICAgIGNvbnN0IGkgPSBNYXRoLm1heCgwLCBOdW1iZXIoaW5mYW50cykgfHwgMCk7XHJcbiAgICBmb3IgKGxldCBuID0gMDsgbiA8IGE7IG4gKz0gMSkgcGxhbi5wdXNoKHsgdHlwZTogMCwgbGFiZWw6IGBUcmF2ZWxsZXIgJHtuICsgMX0gKEFkdWx0KWAgfSk7XHJcbiAgICBmb3IgKGxldCBuID0gMDsgbiA8IGM7IG4gKz0gMSkgcGxhbi5wdXNoKHsgdHlwZTogMSwgbGFiZWw6IGBUcmF2ZWxsZXIgJHtuICsgMX0gKENoaWxkKWAgfSk7XHJcbiAgICBmb3IgKGxldCBuID0gMDsgbiA8IGk7IG4gKz0gMSkgcGxhbi5wdXNoKHsgdHlwZTogMiwgbGFiZWw6IGBUcmF2ZWxsZXIgJHtuICsgMX0gKEluZmFudClgIH0pO1xyXG4gICAgcmV0dXJuIHBsYW47XHJcbiAgfSwgW2FkdWx0cywgY2hpbGRyZW5Db3VudCwgaW5mYW50c10pO1xyXG5cclxuICBjb25zdCBbcGFzc2VuZ2Vycywgc2V0UGFzc2VuZ2Vyc10gPSB1c2VTdGF0ZSgoKSA9PlxyXG4gICAgcGFzc2VuZ2VyUGxhbi5tYXAoKHApID0+IGVtcHR5UGFzc2VuZ2VyKHAudHlwZSkpXHJcbiAgKTtcclxuICBjb25zdCBbZW1haWwsIHNldEVtYWlsXSA9IHVzZVN0YXRlKFwiXCIpO1xyXG4gIGNvbnN0IFtwaG9uZSwgc2V0UGhvbmVdID0gdXNlU3RhdGUoXCJcIik7XHJcbiAgY29uc3QgW3Bob25lQ2MsIHNldFBob25lQ2NdID0gdXNlU3RhdGUoXCI5MVwiKTtcclxuICBjb25zdCBbc2F2ZURldGFpbHMsIHNldFNhdmVEZXRhaWxzXSA9IHVzZVN0YXRlKHRydWUpO1xyXG4gIGNvbnN0IFtlcnJvcnMsIHNldEVycm9yc10gPSB1c2VTdGF0ZSh7fSk7XHJcbiAgY29uc3QgW3N0ZXAsIHNldFN0ZXBdID0gdXNlU3RhdGUoXCJmb3JtXCIpOyAvLyBmb3JtIHwgcmV2aWV3IHwgcGF5bWVudCB8IGNvbmZpcm1hdGlvblxyXG4gIGNvbnN0IFtwYXlNZXRob2QsIHNldFBheU1ldGhvZF0gPSB1c2VTdGF0ZShcImNhcmRcIik7IC8vIHVwaSB8IGNhcmQgfCBkZWJpdFxyXG4gIGNvbnN0IFtzdWJtaXR0aW5nLCBzZXRTdWJtaXR0aW5nXSA9IHVzZVN0YXRlKGZhbHNlKTtcclxuICBjb25zdCBbc3RhdHVzTXNnLCBzZXRTdGF0dXNNc2ddID0gdXNlU3RhdGUoXCJcIik7XHJcbiAgY29uc3QgW2FwaUVycm9yLCBzZXRBcGlFcnJvcl0gPSB1c2VTdGF0ZShcIlwiKTtcclxuICBjb25zdCBbaG9sZCwgc2V0SG9sZF0gPSB1c2VTdGF0ZShudWxsKTtcclxuICBjb25zdCBbYm9va2luZywgc2V0Qm9va2luZ10gPSB1c2VTdGF0ZShudWxsKTtcclxuICBjb25zdCBbcGRmRXJyb3IsIHNldFBkZkVycm9yXSA9IHVzZVN0YXRlKFwiXCIpO1xyXG4gIGNvbnN0IFttb2NrQ2FyZCwgc2V0TW9ja0NhcmRdID0gdXNlU3RhdGUoe1xyXG4gICAgbnVtYmVyOiBcIlwiLFxyXG4gICAgZXhwaXJ5OiBcIlwiLFxyXG4gICAgY3ZjOiBcIlwiLFxyXG4gICAgbmFtZTogXCJcIixcclxuICB9KTtcclxuXHJcbiAgY29uc3QgY2FyZE1vdW50UmVmID0gdXNlUmVmKG51bGwpO1xyXG4gIGNvbnN0IHN0cmlwZVJlZiA9IHVzZVJlZihudWxsKTtcclxuICBjb25zdCBjYXJkUmVmID0gdXNlUmVmKG51bGwpO1xyXG5cclxuICBjb25zdCB1c2VNb2NrQ2FyZCA9XHJcbiAgICAhIWhvbGQgJiZcclxuICAgIChob2xkLnBheW1lbnRfbW9kZSA9PT0gXCJtb2NrX3NhbmRib3hcIiB8fCBob2xkLmFsbG93X21vY2tfcGF5bWVudCA9PT0gdHJ1ZSk7XHJcblxyXG4gIHVzZUVmZmVjdCgoKSA9PiB7XHJcbiAgICBpZiAoIWlzT3BlbikgcmV0dXJuO1xyXG4gICAgY29uc3Qgc2F2ZWQgPSBsb2FkU2F2ZWRQYXgoKTtcclxuICAgIGNvbnN0IGJhc2UgPSBwYXNzZW5nZXJQbGFuLm1hcCgocCkgPT4gZW1wdHlQYXNzZW5nZXIocC50eXBlKSk7XHJcbiAgICBpZiAoc2F2ZWQ/LnBhc3NlbmdlcnM/Lmxlbmd0aCkge1xyXG4gICAgICBzYXZlZC5wYXNzZW5nZXJzLmZvckVhY2goKHNwLCBpZHgpID0+IHtcclxuICAgICAgICBpZiAoYmFzZVtpZHhdKSBiYXNlW2lkeF0gPSB7IC4uLmJhc2VbaWR4XSwgLi4uc3AsIHBhc3NlbmdlclR5cGU6IGJhc2VbaWR4XS5wYXNzZW5nZXJUeXBlIH07XHJcbiAgICAgIH0pO1xyXG4gICAgfVxyXG4gICAgc2V0UGFzc2VuZ2VycyhiYXNlKTtcclxuICAgIHNldEVtYWlsKHNhdmVkPy5lbWFpbCB8fCBcIlwiKTtcclxuICAgIHNldFBob25lKHNhdmVkPy5waG9uZSB8fCBcIlwiKTtcclxuICAgIHNldFBob25lQ2Moc2F2ZWQ/LnBob25lQ2MgfHwgXCI5MVwiKTtcclxuICAgIHNldFNhdmVEZXRhaWxzKHRydWUpO1xyXG4gICAgc2V0RXJyb3JzKHt9KTtcclxuICAgIHNldFN0ZXAoXCJmb3JtXCIpO1xyXG4gICAgc2V0UGF5TWV0aG9kKFwiY2FyZFwiKTtcclxuICAgIHNldFN1Ym1pdHRpbmcoZmFsc2UpO1xyXG4gICAgc2V0U3RhdHVzTXNnKFwiXCIpO1xyXG4gICAgc2V0QXBpRXJyb3IoXCJcIik7XHJcbiAgICBzZXRIb2xkKG51bGwpO1xyXG4gICAgc2V0Qm9va2luZyhudWxsKTtcclxuICAgIHNldFBkZkVycm9yKFwiXCIpO1xyXG4gICAgc2V0TW9ja0NhcmQoeyBudW1iZXI6IFwiXCIsIGV4cGlyeTogXCJcIiwgY3ZjOiBcIlwiLCBuYW1lOiBcIlwiIH0pO1xyXG4gIH0sIFtpc09wZW4sIHBhc3NlbmdlclBsYW5dKTtcclxuXHJcbiAgdXNlRWZmZWN0KCgpID0+IHtcclxuICAgIGlmICghaXNPcGVuIHx8IHN0ZXAgIT09IFwicGF5bWVudFwiIHx8IHVzZU1vY2tDYXJkIHx8ICFob2xkPy5jbGllbnRfc2VjcmV0IHx8ICFob2xkPy5wdWJsaXNoYWJsZV9rZXkpIHtcclxuICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcclxuICAgIH1cclxuICAgIGlmIChwYXlNZXRob2QgPT09IFwidXBpXCIpIHJldHVybiB1bmRlZmluZWQ7XHJcblxyXG4gICAgbGV0IGNhbmNlbGxlZCA9IGZhbHNlO1xyXG4gICAgKGFzeW5jICgpID0+IHtcclxuICAgICAgdHJ5IHtcclxuICAgICAgICBjb25zdCBTdHJpcGUgPSBhd2FpdCBsb2FkU3RyaXBlSnMoKTtcclxuICAgICAgICBpZiAoY2FuY2VsbGVkIHx8ICFjYXJkTW91bnRSZWYuY3VycmVudCkgcmV0dXJuO1xyXG4gICAgICAgIGlmIChjYXJkUmVmLmN1cnJlbnQpIHtcclxuICAgICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgIGNhcmRSZWYuY3VycmVudC5kZXN0cm95KCk7XHJcbiAgICAgICAgICB9IGNhdGNoIHtcclxuICAgICAgICAgICAgLyogaWdub3JlICovXHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgICBjYXJkUmVmLmN1cnJlbnQgPSBudWxsO1xyXG4gICAgICAgIH1cclxuICAgICAgICBjb25zdCBzdHJpcGUgPSBTdHJpcGUoaG9sZC5wdWJsaXNoYWJsZV9rZXkpO1xyXG4gICAgICAgIGNvbnN0IGVsZW1lbnRzID0gc3RyaXBlLmVsZW1lbnRzKCk7XHJcbiAgICAgICAgY29uc3QgY2FyZCA9IGVsZW1lbnRzLmNyZWF0ZShcImNhcmRcIiwge1xyXG4gICAgICAgICAgc3R5bGU6IHtcclxuICAgICAgICAgICAgYmFzZToge1xyXG4gICAgICAgICAgICAgIGZvbnRTaXplOiBcIjE2cHhcIixcclxuICAgICAgICAgICAgICBjb2xvcjogXCIjMDAxNDM5XCIsXHJcbiAgICAgICAgICAgICAgXCI6OnBsYWNlaG9sZGVyXCI6IHsgY29sb3I6IFwiIzk4YTJiM1wiIH0sXHJcbiAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICB9LFxyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIGNhcmQubW91bnQoY2FyZE1vdW50UmVmLmN1cnJlbnQpO1xyXG4gICAgICAgIHN0cmlwZVJlZi5jdXJyZW50ID0gc3RyaXBlO1xyXG4gICAgICAgIGNhcmRSZWYuY3VycmVudCA9IGNhcmQ7XHJcbiAgICAgIH0gY2F0Y2ggKGVycikge1xyXG4gICAgICAgIHNldEFwaUVycm9yKGVycj8ubWVzc2FnZSB8fCBcIkNvdWxkIG5vdCBsb2FkIGNhcmQgcGF5bWVudCBmb3JtLlwiKTtcclxuICAgICAgfVxyXG4gICAgfSkoKTtcclxuICAgIHJldHVybiAoKSA9PiB7XHJcbiAgICAgIGNhbmNlbGxlZCA9IHRydWU7XHJcbiAgICAgIGlmIChjYXJkUmVmLmN1cnJlbnQpIHtcclxuICAgICAgICB0cnkge1xyXG4gICAgICAgICAgY2FyZFJlZi5jdXJyZW50LmRlc3Ryb3koKTtcclxuICAgICAgICB9IGNhdGNoIHtcclxuICAgICAgICAgIC8qIGlnbm9yZSAqL1xyXG4gICAgICAgIH1cclxuICAgICAgICBjYXJkUmVmLmN1cnJlbnQgPSBudWxsO1xyXG4gICAgICB9XHJcbiAgICB9O1xyXG4gIH0sIFtpc09wZW4sIHN0ZXAsIGhvbGQsIHBheU1ldGhvZCwgdXNlTW9ja0NhcmRdKTtcclxuXHJcbiAgdXNlRWZmZWN0KCgpID0+IHtcclxuICAgIGlmICghaXNPcGVuKSByZXR1cm4gdW5kZWZpbmVkO1xyXG4gICAgY29uc3Qgb25LZXkgPSAoZSkgPT4ge1xyXG4gICAgICBpZiAoZS5rZXkgPT09IFwiRXNjYXBlXCIgJiYgIXN1Ym1pdHRpbmcpIG9uQ2xvc2U/LigpO1xyXG4gICAgfTtcclxuICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKFwia2V5ZG93blwiLCBvbktleSk7XHJcbiAgICByZXR1cm4gKCkgPT4gd2luZG93LnJlbW92ZUV2ZW50TGlzdGVuZXIoXCJrZXlkb3duXCIsIG9uS2V5KTtcclxuICB9LCBbaXNPcGVuLCBzdWJtaXR0aW5nLCBvbkNsb3NlXSk7XHJcblxyXG4gIGlmICghaXNPcGVuIHx8ICFmbGlnaHQpIHJldHVybiBudWxsO1xyXG5cclxuICBmdW5jdGlvbiB1cGRhdGVQYXNzZW5nZXIoaWR4LCBwYXRjaCkge1xyXG4gICAgc2V0UGFzc2VuZ2VycygocHJldikgPT4gcHJldi5tYXAoKHAsIGkpID0+IChpID09PSBpZHggPyB7IC4uLnAsIC4uLnBhdGNoIH0gOiBwKSkpO1xyXG4gIH1cclxuXHJcbiAgZnVuY3Rpb24gdmFsaWRhdGUoKSB7XHJcbiAgICBjb25zdCBuZXh0ID0geyB0cmF2ZWxlcnM6IHt9IH07XHJcbiAgICBsZXQgb2sgPSB0cnVlO1xyXG4gICAgY29uc3Qgb25EYXRlID0gdHJhdmVsRGF0ZUlzbyhmbGlnaHQpO1xyXG4gICAgcGFzc2VuZ2Vycy5mb3JFYWNoKChwLCBpZHgpID0+IHtcclxuICAgICAgY29uc3QgZSA9IHt9O1xyXG4gICAgICBjb25zdCBwbGFuID0gcGFzc2VuZ2VyUGxhbltpZHhdO1xyXG4gICAgICBpZiAoIXAuZmlyc3ROYW1lLnRyaW0oKSkgZS5maXJzdE5hbWUgPSBcIlJlcXVpcmVkXCI7XHJcbiAgICAgIGlmICghcC5sYXN0TmFtZS50cmltKCkpIGUubGFzdE5hbWUgPSBcIlJlcXVpcmVkXCI7XHJcbiAgICAgIGlmICghcC5nZW5kZXIpIGUuZ2VuZGVyID0gXCJSZXF1aXJlZFwiO1xyXG4gICAgICBpZiAoIXAuZG9iKSBlLmRvYiA9IFwiUmVxdWlyZWRcIjtcclxuICAgICAgZWxzZSB7XHJcbiAgICAgICAgY29uc3QgYWdlID0gYWdlT25EYXRlKHAuZG9iLCBvbkRhdGUpO1xyXG4gICAgICAgIGNvbnN0IHB0eXBlID0gTnVtYmVyKHAucGFzc2VuZ2VyVHlwZSA/PyBwbGFuPy50eXBlID8/IDApO1xyXG4gICAgICAgIGlmIChhZ2UgPT0gbnVsbCkgZS5kb2IgPSBcIlVzZSBZWVlZLU1NLUREXCI7XHJcbiAgICAgICAgZWxzZSBpZiAocHR5cGUgPT09IDAgJiYgYWdlIDwgMTIpIHtcclxuICAgICAgICAgIGUuZG9iID0gXCJBZHVsdHMgbXVzdCBiZSAxMisgb24gdGhlIHRyYXZlbCBkYXRlXCI7XHJcbiAgICAgICAgfSBlbHNlIGlmIChwdHlwZSA9PT0gMSAmJiAoYWdlIDwgMiB8fCBhZ2UgPiAxMSkpIHtcclxuICAgICAgICAgIGUuZG9iID0gXCJDaGlsZHJlbiBtdXN0IGJlIDLigJMxMSBvbiB0aGUgdHJhdmVsIGRhdGVcIjtcclxuICAgICAgICB9IGVsc2UgaWYgKHB0eXBlID09PSAyICYmIGFnZSA+PSAyKSB7XHJcbiAgICAgICAgICBlLmRvYiA9IFwiSW5mYW50cyBtdXN0IGJlIHVuZGVyIDIgb24gdGhlIHRyYXZlbCBkYXRlXCI7XHJcbiAgICAgICAgfVxyXG4gICAgICB9XHJcbiAgICAgIGlmICghcC5uYXRpb25hbGl0eS50cmltKCkpIGUubmF0aW9uYWxpdHkgPSBcIlJlcXVpcmVkXCI7XHJcbiAgICAgIGNvbnN0IGRvYyA9IHAuZG9jdW1lbnROdW1iZXIucmVwbGFjZSgvXFxzKy9nLCBcIlwiKTtcclxuICAgICAgaWYgKCFkb2MpIGUuZG9jdW1lbnROdW1iZXIgPSBkb21lc3RpYyA/IFwiSUQgcmVxdWlyZWQgZm9yIGJvb2tpbmdcIiA6IFwiUmVxdWlyZWRcIjtcclxuICAgICAgZWxzZSBpZiAoZG9jLmxlbmd0aCA+IDE1KSBlLmRvY3VtZW50TnVtYmVyID0gXCJNYXggMTUgY2hhcmFjdGVyc1wiO1xyXG4gICAgICBpZiAoIWRvbWVzdGljICYmICFwLmRvY3VtZW50RXhwaXJ5KSBlLmRvY3VtZW50RXhwaXJ5ID0gXCJQYXNzcG9ydCBleHBpcnkgcmVxdWlyZWRcIjtcclxuICAgICAgaWYgKE9iamVjdC5rZXlzKGUpLmxlbmd0aCkge1xyXG4gICAgICAgIG5leHQudHJhdmVsZXJzW2lkeF0gPSBlO1xyXG4gICAgICAgIG9rID0gZmFsc2U7XHJcbiAgICAgIH1cclxuICAgIH0pO1xyXG4gICAgaWYgKCFlbWFpbC50cmltKCkpIHtcclxuICAgICAgbmV4dC5lbWFpbCA9IFwiRW1haWwgaXMgcmVxdWlyZWRcIjtcclxuICAgICAgb2sgPSBmYWxzZTtcclxuICAgIH0gZWxzZSBpZiAoIUVNQUlMX1JFLnRlc3QoZW1haWwudHJpbSgpKSkge1xyXG4gICAgICBuZXh0LmVtYWlsID0gXCJFbnRlciBhIHZhbGlkIGVtYWlsXCI7XHJcbiAgICAgIG9rID0gZmFsc2U7XHJcbiAgICB9XHJcbiAgICBjb25zdCBwaG9uZURpZ2l0cyA9IHBob25lLnJlcGxhY2UoL1xcRC9nLCBcIlwiKTtcclxuICAgIGlmICghcGhvbmVEaWdpdHMpIHtcclxuICAgICAgbmV4dC5waG9uZSA9IFwiUGhvbmUgaXMgcmVxdWlyZWRcIjtcclxuICAgICAgb2sgPSBmYWxzZTtcclxuICAgIH0gZWxzZSBpZiAoIVBIT05FX1JFLnRlc3QocGhvbmVEaWdpdHMpKSB7XHJcbiAgICAgIG5leHQucGhvbmUgPSBcIkVudGVyIGEgdmFsaWQgcGhvbmUgbnVtYmVyXCI7XHJcbiAgICAgIG9rID0gZmFsc2U7XHJcbiAgICB9IGVsc2UgaWYgKGlzUGxhY2Vob2xkZXJQaG9uZShwaG9uZURpZ2l0cykpIHtcclxuICAgICAgbmV4dC5waG9uZSA9IFwiVXNlIGEgcmVhbCBtb2JpbGUgbnVtYmVyIChub3QgOTg3NjU0MzIxMCAvIDEyMzQ1Njc4OTApXCI7XHJcbiAgICAgIG9rID0gZmFsc2U7XHJcbiAgICB9XHJcbiAgICBzZXRFcnJvcnMobmV4dCk7XHJcbiAgICByZXR1cm4gb2s7XHJcbiAgfVxyXG5cclxuICBmdW5jdGlvbiBidWlsZFBheWxvYWQoKSB7XHJcbiAgICBjb25zdCBsZWFkID0gcGFzc2VuZ2Vyc1swXTtcclxuICAgIGNvbnN0IHBheCA9IHBhc3NlbmdlcnMubWFwKChwKSA9PiAoe1xyXG4gICAgICBmaXJzdF9uYW1lOiBwLmZpcnN0TmFtZS50cmltKCksXHJcbiAgICAgIGxhc3RfbmFtZTogcC5sYXN0TmFtZS50cmltKCksXHJcbiAgICAgIGJpcnRoZGF5OiBwLmRvYixcclxuICAgICAgZ2VuZGVyOiBTdHJpbmcocC5nZW5kZXIpLnRvVXBwZXJDYXNlKCkuc2xpY2UoMCwgMSksXHJcbiAgICAgIG5hdGlvbmFsaXR5OiAocC5uYXRpb25hbGl0eSB8fCBcIklOXCIpLnRvVXBwZXJDYXNlKCkuc2xpY2UoMCwgMiksXHJcbiAgICAgIGRvY3VtZW50X3R5cGU6IGRvY1R5cGUsXHJcbiAgICAgIGRvY3VtZW50X251bWJlcjogcC5kb2N1bWVudE51bWJlci5yZXBsYWNlKC9cXHMrL2csIFwiXCIpLnNsaWNlKDAsIDE1KSxcclxuICAgICAgZG9jdW1lbnRfZXhwaXJ5OiBwLmRvY3VtZW50RXhwaXJ5IHx8IGRlZmF1bHRFeHBpcnksXHJcbiAgICAgIGRvY3VtZW50X2lzc3VlX2NvdW50cnk6IChwLmRvY3VtZW50SXNzdWVDb3VudHJ5IHx8IFwiSU5cIikudG9VcHBlckNhc2UoKS5zbGljZSgwLCAyKSxcclxuICAgICAgcGFzc2VuZ2VyX3R5cGU6IHAucGFzc2VuZ2VyVHlwZSxcclxuICAgIH0pKTtcclxuICAgIGNvbnN0IGNvbnRhY3QgPSB7XHJcbiAgICAgIGZpcnN0X25hbWU6IGxlYWQuZmlyc3ROYW1lLnRyaW0oKSxcclxuICAgICAgbGFzdF9uYW1lOiBsZWFkLmxhc3ROYW1lLnRyaW0oKSxcclxuICAgICAgZW1haWw6IGVtYWlsLnRyaW0oKSxcclxuICAgICAgcGhvbmVfY291bnRyeV9jb2RlOiBTdHJpbmcocGhvbmVDYyB8fCBcIjkxXCIpLnJlcGxhY2UoL1xcRC9nLCBcIlwiKSB8fCBcIjkxXCIsXHJcbiAgICAgIHBob25lX251bWJlcjogcGhvbmUucmVwbGFjZSgvXFxEL2csIFwiXCIpLFxyXG4gICAgfTtcclxuICAgIHJldHVybiB7IHBheCwgY29udGFjdCB9O1xyXG4gIH1cclxuXHJcbiAgZnVuY3Rpb24gZ29Ub1JldmlldygpIHtcclxuICAgIGlmICghdmFsaWRhdGUoKSkge1xyXG4gICAgICBzZXRBcGlFcnJvcihcIlBsZWFzZSBmaWxsIGFsbCByZXF1aXJlZCBwYXNzZW5nZXIgZGV0YWlscy5cIik7XHJcbiAgICAgIHJldHVybjtcclxuICAgIH1cclxuICAgIHNldEFwaUVycm9yKFwiXCIpO1xyXG4gICAgaWYgKHNhdmVEZXRhaWxzKSB7XHJcbiAgICAgIHNhdmVQYXhMb2NhbCh7IHBhc3NlbmdlcnMsIGVtYWlsLCBwaG9uZSwgcGhvbmVDYyB9KTtcclxuICAgIH1cclxuICAgIHNldFN0ZXAoXCJyZXZpZXdcIik7XHJcbiAgfVxyXG5cclxuICBhc3luYyBmdW5jdGlvbiBnb1RvUGF5bWVudCgpIHtcclxuICAgIGlmICghc2Vzc2lvbklkKSB7XHJcbiAgICAgIHNldEFwaUVycm9yKFwiTWlzc2luZyBzZWFyY2ggc2Vzc2lvbiDigJQgc2VhcmNoIGZsaWdodHMgYWdhaW4sIHRoZW4gQm9vayBOb3cuXCIpO1xyXG4gICAgICByZXR1cm47XHJcbiAgICB9XHJcbiAgICBjb25zdCBvaWQgPSBvZmZlcklkT2YoZmxpZ2h0KTtcclxuICAgIGlmICghb2lkKSB7XHJcbiAgICAgIHNldEFwaUVycm9yKFwiVGhpcyBvZmZlciBoYXMgbm8gSUQg4oCUIHBpY2sgYW5vdGhlciBmbGlnaHQuXCIpO1xyXG4gICAgICByZXR1cm47XHJcbiAgICB9XHJcblxyXG4gICAgc2V0U3VibWl0dGluZyh0cnVlKTtcclxuICAgIHNldEFwaUVycm9yKFwiXCIpO1xyXG4gICAgc2V0U3RhdHVzTXNnKFwiVmVyaWZ5aW5nIGZhcmXigKZcIik7XHJcbiAgICB0cnkge1xyXG4gICAgICBjb25zdCBzZWxlY3RSZXMgPSBhd2FpdCBmbGlnaHRTZXJ2aWNlLnNlbGVjdCh7XHJcbiAgICAgICAgc2Vzc2lvbl9pZDogc2Vzc2lvbklkLFxyXG4gICAgICAgIG9mZmVyX2lkOiBvaWQsXHJcbiAgICAgIH0pO1xyXG4gICAgICBpZiAoc2VsZWN0UmVzPy5vayA9PT0gZmFsc2UpIHtcclxuICAgICAgICB0aHJvdyBuZXcgRXJyb3Ioc2VsZWN0UmVzLmVycm9yIHx8IFwiQ291bGQgbm90IHNlbGVjdCB0aGlzIGZhcmUuXCIpO1xyXG4gICAgICB9XHJcbiAgICAgIGNvbnN0IHZlcmlmeSA9IHNlbGVjdFJlcz8udmVyaWZ5O1xyXG4gICAgICBpZiAodmVyaWZ5ICYmIHZlcmlmeS52ZXJpZmllZCA9PT0gZmFsc2UgJiYgdmVyaWZ5LmVycm9yKSB7XHJcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKFxyXG4gICAgICAgICAgdmVyaWZ5LmVycm9yIHx8IFwiVGhpcyBmYXJlIGlzIG5vIGxvbmdlciBhdmFpbGFibGUuIFBpY2sgYW5vdGhlciBmbGlnaHQuXCJcclxuICAgICAgICApO1xyXG4gICAgICB9XHJcblxyXG4gICAgICBzZXRTdGF0dXNNc2coXCJDcmVhdGluZyBib29raW5nIGhvbGTigKZcIik7XHJcbiAgICAgIGNvbnN0IHsgcGF4LCBjb250YWN0IH0gPSBidWlsZFBheWxvYWQoKTtcclxuICAgICAgY29uc3QgcHJlYm9va1JlcyA9IGF3YWl0IGZsaWdodFNlcnZpY2UucHJlYm9vayh7XHJcbiAgICAgICAgc2Vzc2lvbl9pZDogc2Vzc2lvbklkLFxyXG4gICAgICAgIHBhc3NlbmdlcnM6IHBheCxcclxuICAgICAgICBjb250YWN0LFxyXG4gICAgICB9KTtcclxuICAgICAgaWYgKCFwcmVib29rUmVzPy5vaykge1xyXG4gICAgICAgIGNvbnN0IGNvZGUgPSBwcmVib29rUmVzPy5lcnJvcl9jb2RlIHx8IFwiXCI7XHJcbiAgICAgICAgY29uc3QgbXNnID0gc29mdGVuQm9va2luZ0Vycm9yKFxyXG4gICAgICAgICAgcHJlYm9va1Jlcz8uZXJyb3IgfHxcclxuICAgICAgICAgICAgcHJlYm9va1Jlcz8ubWVzc2FnZSB8fFxyXG4gICAgICAgICAgICBcIldlIGNvdWxkbid0IGhvbGQgdGhpcyBmYXJlLiBDaGVjayBwYXNzZW5nZXIgZGV0YWlscyBhbmQgdHJ5IGFnYWluLlwiXHJcbiAgICAgICAgKTtcclxuICAgICAgICBpZiAoY29kZSA9PT0gXCJpbnZhbGlkX3Bob25lXCIgfHwgY29kZSA9PT0gXCJpbnZhbGlkX2RvYlwiIHx8IC9waG9uZXxkb2J8YmlydGh8YWdlL2kudGVzdChtc2cpKSB7XHJcbiAgICAgICAgICBzZXRTdGVwKFwiZm9ybVwiKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKG1zZyk7XHJcbiAgICAgIH1cclxuXHJcbiAgICAgIGNvbnN0IHBiID0ge1xyXG4gICAgICAgIC4uLihwcmVib29rUmVzLnByZWJvb2sgfHwge30pLFxyXG4gICAgICAgIC8vIFByZWZlciB0b3AtbGV2ZWwgcGF5bWVudF9yZWFkeSBmcm9tIHN1cGVydmlzb3Igd2hlbiBuZXN0ZWQgZmxhZ3MgYXJlIG1pc3NpbmcuXHJcbiAgICAgICAgYWxsb3dfbW9ja19wYXltZW50OlxyXG4gICAgICAgICAgcHJlYm9va1Jlcz8ucHJlYm9vaz8uYWxsb3dfbW9ja19wYXltZW50ID09PSB0cnVlIHx8XHJcbiAgICAgICAgICBwcmVib29rUmVzPy5wYXltZW50X3JlYWR5ID09PSB0cnVlIHx8XHJcbiAgICAgICAgICBwcmVib29rUmVzPy5wcmVib29rPy5wYXltZW50X21vZGUgPT09IFwibW9ja19zYW5kYm94XCIsXHJcbiAgICAgICAgcGF5bWVudF9tb2RlOlxyXG4gICAgICAgICAgcHJlYm9va1Jlcz8ucHJlYm9vaz8ucGF5bWVudF9tb2RlIHx8XHJcbiAgICAgICAgICAocHJlYm9va1Jlcz8ucHJlYm9vaz8uY2xpZW50X3NlY3JldCA/IFwic3RyaXBlXCIgOiBcIm1vY2tfc2FuZGJveFwiKSxcclxuICAgICAgfTtcclxuICAgICAgc2V0SG9sZChwYik7XHJcbiAgICAgIHNldFN0YXR1c01zZyhcIlwiKTtcclxuXHJcbiAgICAgIGNvbnN0IGhhc1N0cmlwZSA9IEJvb2xlYW4ocGIucHJlYm9va19pZCAmJiBwYi5jbGllbnRfc2VjcmV0ICYmIHBiLnB1Ymxpc2hhYmxlX2tleSk7XHJcbiAgICAgIGNvbnN0IGNhbk1vY2sgPVxyXG4gICAgICAgIEJvb2xlYW4ocGIucHJlYm9va19pZCkgJiZcclxuICAgICAgICAocGIuYWxsb3dfbW9ja19wYXltZW50IHx8XHJcbiAgICAgICAgICBwYi5wYXltZW50X21vZGUgPT09IFwibW9ja19zYW5kYm94XCIgfHxcclxuICAgICAgICAgIHByZWJvb2tSZXM/LnBheW1lbnRfcmVhZHkgPT09IHRydWUgfHxcclxuICAgICAgICAgICghcGIuY2xpZW50X3NlY3JldCAmJiBCb29sZWFuKHBiLnByZWJvb2tfaWQpKSk7XHJcblxyXG4gICAgICBpZiAoaGFzU3RyaXBlIHx8IGNhbk1vY2spIHtcclxuICAgICAgICAvLyBFbnN1cmUgbW9jayBVSSBhY3RpdmF0ZXMgd2hlbiBTdHJpcGUgc2VjcmV0cyBhcmUgYWJzZW50LlxyXG4gICAgICAgIGlmICghaGFzU3RyaXBlKSB7XHJcbiAgICAgICAgICBzZXRIb2xkKChoKSA9PiAoe1xyXG4gICAgICAgICAgICAuLi5oLFxyXG4gICAgICAgICAgICAuLi5wYixcclxuICAgICAgICAgICAgYWxsb3dfbW9ja19wYXltZW50OiB0cnVlLFxyXG4gICAgICAgICAgICBwYXltZW50X21vZGU6IFwibW9ja19zYW5kYm94XCIsXHJcbiAgICAgICAgICB9KSk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHNldFN0ZXAoXCJwYXltZW50XCIpO1xyXG4gICAgICB9IGVsc2UgaWYgKHBiLnByZWJvb2tfaWQpIHtcclxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXHJcbiAgICAgICAgICBcIkhvbGQgY3JlYXRlZCwgYnV0IGNhcmQgcGF5bWVudCBpc27igJl0IGF2YWlsYWJsZSBmb3IgdGhpcyBhY2NvdW50IHlldC4gXCIgK1xyXG4gICAgICAgICAgICBcIkluIHNhbmRib3gsIFBheW1lbnQgU0RLIGtleXMgbWF5IGJlIG1pc3Npbmcg4oCUIHNldCBTVFJJUEVfUFVCTElTSEFCTEVfS0VZIG9yIGVuYWJsZSBMaXRlQVBJIFBheW1lbnQgU0RLLiBcIiArXHJcbiAgICAgICAgICAgIGBIb2xkIElEOiAke3BiLnByZWJvb2tfaWR9YFxyXG4gICAgICAgICk7XHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKFxyXG4gICAgICAgICAgcHJlYm9va1Jlcz8ubWVzc2FnZSB8fCBcIlByZWJvb2sgc3VjY2VlZGVkIGJ1dCBubyBob2xkIElEIHdhcyByZXR1cm5lZC5cIlxyXG4gICAgICAgICk7XHJcbiAgICAgIH1cclxuICAgIH0gY2F0Y2ggKGVycikge1xyXG4gICAgICBzZXRBcGlFcnJvcihzb2Z0ZW5Cb29raW5nRXJyb3IoZXJyPy5tZXNzYWdlIHx8IFwiQm9va2luZyBmYWlsZWQuXCIpKTtcclxuICAgICAgc2V0U3RhdHVzTXNnKFwiXCIpO1xyXG4gICAgfSBmaW5hbGx5IHtcclxuICAgICAgc2V0U3VibWl0dGluZyhmYWxzZSk7XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICBhc3luYyBmdW5jdGlvbiBoYW5kbGVQYXlBbmRDb21wbGV0ZSgpIHtcclxuICAgIGlmICghaG9sZD8ucHJlYm9va19pZCkge1xyXG4gICAgICBzZXRBcGlFcnJvcihcIkJvb2tpbmcgaG9sZCBleHBpcmVkLiBHbyBiYWNrLCBwaWNrIHRoZSBmbGlnaHQgYWdhaW4sIHRoZW4gY29udGludWUgdG8gcGF5bWVudC5cIik7XHJcbiAgICAgIHJldHVybjtcclxuICAgIH1cclxuICAgIGlmICghc2Vzc2lvbklkKSB7XHJcbiAgICAgIHNldEFwaUVycm9yKFwiTWlzc2luZyBib29raW5nIHNlc3Npb24uIENsb3NlIHRoaXMsIHNlYXJjaCBhZ2FpbiwgdGhlbiBCb29rIE5vdy5cIik7XHJcbiAgICAgIHJldHVybjtcclxuICAgIH1cclxuXHJcbiAgICBpZiAocGF5TWV0aG9kID09PSBcInVwaVwiKSB7XHJcbiAgICAgIHNldEFwaUVycm9yKFxyXG4gICAgICAgIHVzZU1vY2tDYXJkXHJcbiAgICAgICAgICA/IFwiVVBJIGlzbuKAmXQgd2lyZWQgaW4gdGhpcyBzYW5kYm94IGRlbW8uIENob29zZSBDcmVkaXQgb3IgRGViaXQgYW5kIHVzZSB0ZXN0IGNhcmQgNDI0MiA0MjQyIDQyNDIgNDI0Mi5cIlxyXG4gICAgICAgICAgOiBcIlVQSSBpc27igJl0IGF2YWlsYWJsZSB0aHJvdWdoIHRoZSBsaXZlIFN0cmlwZSBQYXltZW50IFNESyBmb3IgdGhpcyBob2xkLiBDaG9vc2UgQ3JlZGl0IG9yIERlYml0IGNhcmQgdG8gcGF5IHNlY3VyZWx5LlwiXHJcbiAgICAgICk7XHJcbiAgICAgIHNldFBheU1ldGhvZChcImNhcmRcIik7XHJcbiAgICAgIHJldHVybjtcclxuICAgIH1cclxuXHJcbiAgICBzZXRTdWJtaXR0aW5nKHRydWUpO1xyXG4gICAgc2V0QXBpRXJyb3IoXCJcIik7XHJcbiAgICBzZXRTdGF0dXNNc2codXNlTW9ja0NhcmQgPyBcIlJlY29yZGluZyBkZW1vIHBheW1lbnTigKZcIiA6IFwiUHJvY2Vzc2luZyBjYXJk4oCmXCIpO1xyXG4gICAgdHJ5IHtcclxuICAgICAgbGV0IG1vY2tQYXltZW50ID0gZmFsc2U7XHJcbiAgICAgIGlmICh1c2VNb2NrQ2FyZCkge1xyXG4gICAgICAgIGNvbnN0IGRpZ2l0cyA9IFN0cmluZyhtb2NrQ2FyZC5udW1iZXIgfHwgXCJcIikucmVwbGFjZSgvXFxEL2csIFwiXCIpO1xyXG4gICAgICAgIGlmIChkaWdpdHMubGVuZ3RoIDwgMTYpIHtcclxuICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcclxuICAgICAgICAgICAgYENhcmQgbnVtYmVyIGlzIGluY29tcGxldGUgKCR7ZGlnaXRzLmxlbmd0aH0vMTYgZGlnaXRzKS4gRW50ZXIgdGhlIGZ1bGwgdGVzdCBjYXJkIDQyNDIgNDI0MiA0MjQyIDQyNDIuYFxyXG4gICAgICAgICAgKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgaWYgKGRpZ2l0cyAhPT0gXCI0MjQyNDI0MjQyNDI0MjQyXCIpIHtcclxuICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcclxuICAgICAgICAgICAgXCJTYW5kYm94IG9ubHkgYWNjZXB0cyB0ZXN0IGNhcmQgNDI0MiA0MjQyIDQyNDIgNDI0MiAoYW55IGZ1dHVyZSBNTS9ZWSDCtyBhbnkgQ1ZDKS5cIlxyXG4gICAgICAgICAgKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgaWYgKCEobW9ja0NhcmQubmFtZSB8fCBcIlwiKS50cmltKCkpIHtcclxuICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcIkVudGVyIHRoZSBuYW1lIG9uIHRoZSBjYXJkLlwiKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgY29uc3QgZXhwID0gU3RyaW5nKG1vY2tDYXJkLmV4cGlyeSB8fCBcIlwiKS5yZXBsYWNlKC9cXHMvZywgXCJcIik7XHJcbiAgICAgICAgaWYgKCEvXlxcZHsyfVxcL1xcZHsyfSQvLnRlc3QoZXhwKSkge1xyXG4gICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiRW50ZXIgZXhwaXJ5IGFzIE1NL1lZIChlLmcuIDExLzI4KS5cIik7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGNvbnN0IFttbSwgeXldID0gZXhwLnNwbGl0KFwiL1wiKS5tYXAoKHgpID0+IE51bWJlcih4KSk7XHJcbiAgICAgICAgY29uc3Qgbm93ID0gbmV3IERhdGUoKTtcclxuICAgICAgICBjb25zdCBleHBPayA9XHJcbiAgICAgICAgICBtbSA+PSAxICYmXHJcbiAgICAgICAgICBtbSA8PSAxMiAmJlxyXG4gICAgICAgICAgKHl5ICsgMjAwMCA+IG5vdy5nZXRGdWxsWWVhcigpIHx8XHJcbiAgICAgICAgICAgICh5eSArIDIwMDAgPT09IG5vdy5nZXRGdWxsWWVhcigpICYmIG1tID49IG5vdy5nZXRNb250aCgpICsgMSkpO1xyXG4gICAgICAgIGlmICghZXhwT2spIHtcclxuICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcIlVzZSBhbnkgZnV0dXJlIGV4cGlyeSAoTU0vWVkpLlwiKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgaWYgKCFTdHJpbmcobW9ja0NhcmQuY3ZjIHx8IFwiXCIpLnJlcGxhY2UoL1xcRC9nLCBcIlwiKS5tYXRjaCgvXlxcZHszLDR9JC8pKSB7XHJcbiAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJFbnRlciBhIDPigJM0IGRpZ2l0IENWQy5cIik7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIG1vY2tQYXltZW50ID0gdHJ1ZTtcclxuICAgICAgfSBlbHNlIGlmIChzdHJpcGVSZWYuY3VycmVudCAmJiBjYXJkUmVmLmN1cnJlbnQgJiYgaG9sZC5jbGllbnRfc2VjcmV0KSB7XHJcbiAgICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgc3RyaXBlUmVmLmN1cnJlbnQuY29uZmlybUNhcmRQYXltZW50KGhvbGQuY2xpZW50X3NlY3JldCwge1xyXG4gICAgICAgICAgcGF5bWVudF9tZXRob2Q6IHsgY2FyZDogY2FyZFJlZi5jdXJyZW50IH0sXHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgaWYgKHJlc3VsdC5lcnJvcikge1xyXG4gICAgICAgICAgdGhyb3cgbmV3IEVycm9yKHJlc3VsdC5lcnJvci5tZXNzYWdlIHx8IFwiQ2FyZCBwYXltZW50IGZhaWxlZC5cIik7XHJcbiAgICAgICAgfVxyXG4gICAgICB9IGVsc2Uge1xyXG4gICAgICAgIC8vIEZhbGwgYmFjayB0byBzYW5kYm94IG1vY2sgaWYgU3RyaXBlIEVsZW1lbnRzIG5ldmVyIG1vdW50ZWQuXHJcbiAgICAgICAgbW9ja1BheW1lbnQgPSB0cnVlO1xyXG4gICAgICAgIGNvbnN0IGRpZ2l0cyA9IFN0cmluZyhtb2NrQ2FyZC5udW1iZXIgfHwgXCJcIikucmVwbGFjZSgvXFxEL2csIFwiXCIpO1xyXG4gICAgICAgIGlmIChkaWdpdHMgIT09IFwiNDI0MjQyNDI0MjQyNDI0MlwiKSB7XHJcbiAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXHJcbiAgICAgICAgICAgIFwiQ2FyZCBmb3JtIGlzbuKAmXQgcmVhZHkgZm9yIGxpdmUgU3RyaXBlLiBVc2Ugc2FuZGJveCB0ZXN0IGNhcmQgNDI0MiA0MjQyIDQyNDIgNDI0Miwgb3Igd2FpdCBhIHNlY29uZCBhbmQgdHJ5IGFnYWluLlwiXHJcbiAgICAgICAgICApO1xyXG4gICAgICAgIH1cclxuICAgICAgfVxyXG5cclxuICAgICAgc2V0U3RhdHVzTXNnKG1vY2tQYXltZW50ID8gXCJGaW5hbGl6aW5nIHNhbmRib3ggYm9va2luZ+KAplwiIDogXCJJc3N1aW5nIHRpY2tldOKAplwiKTtcclxuICAgICAgY29uc3QgZG9uZSA9IGF3YWl0IGZsaWdodFNlcnZpY2UuY29tcGxldGUoe1xyXG4gICAgICAgIHNlc3Npb25faWQ6IHNlc3Npb25JZCxcclxuICAgICAgICBwcmVib29rX2lkOiBob2xkLnByZWJvb2tfaWQsXHJcbiAgICAgICAgdHJhbnNhY3Rpb25faWQ6IGhvbGQudHJhbnNhY3Rpb25faWQgfHwgdW5kZWZpbmVkLFxyXG4gICAgICAgIG1vY2tfcGF5bWVudDogbW9ja1BheW1lbnQgfHwgdW5kZWZpbmVkLFxyXG4gICAgICB9KTtcclxuICAgICAgaWYgKCFkb25lPy5vaykge1xyXG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcclxuICAgICAgICAgIGRvbmU/LmVycm9yIHx8XHJcbiAgICAgICAgICAgIFwiUGF5bWVudCB3YXMgcmVjb3JkZWQgYnV0IHRpY2tldGluZyBkaWQgbm90IGZpbmlzaC4gWW91ciBmYXJlIG1heSBzdGlsbCBiZSBvbiBob2xkLlwiXHJcbiAgICAgICAgKTtcclxuICAgICAgfVxyXG4gICAgICBzZXRCb29raW5nKFxyXG4gICAgICAgIG1lcmdlQ29uZmlybWF0aW9uQm9va2luZyhkb25lLmJvb2tpbmcgfHwgZG9uZSwge1xyXG4gICAgICAgICAgcGFzc2VuZ2VycyxcclxuICAgICAgICAgIGVtYWlsLFxyXG4gICAgICAgICAgcGhvbmUsXHJcbiAgICAgICAgICBwaG9uZUNjLFxyXG4gICAgICAgICAgZmxpZ2h0LFxyXG4gICAgICAgIH0pXHJcbiAgICAgICk7XHJcbiAgICAgIHNldFN0ZXAoXCJjb25maXJtYXRpb25cIik7XHJcbiAgICAgIHNldFN0YXR1c01zZyhcIlwiKTtcclxuICAgICAgLy8gRG8gTk9UIGNhbGwgb25TdWNjZXNzIGhlcmUg4oCUIHRoYXQgdXNlZCB0byBjbG9zZSB0aGUgbW9kYWwgYmVmb3JlXHJcbiAgICAgIC8vIHRoZSBjb25maXJtYXRpb24gc2NyZWVuIHdhcyB2aXNpYmxlLiBQYXJlbnQgY2xlYW5zIHVwIG9uIERvbmUvQ2xvc2UuXHJcbiAgICAgIHJlcXVlc3RBbmltYXRpb25GcmFtZSgoKSA9PiB7XHJcbiAgICAgICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJib29raW5nLXBvcHVwLXRpdGxlXCIpPy5zY3JvbGxJbnRvVmlldyh7XHJcbiAgICAgICAgICBiZWhhdmlvcjogXCJzbW9vdGhcIixcclxuICAgICAgICAgIGJsb2NrOiBcIm5lYXJlc3RcIixcclxuICAgICAgICB9KTtcclxuICAgICAgfSk7XHJcbiAgICB9IGNhdGNoIChlcnIpIHtcclxuICAgICAgc2V0QXBpRXJyb3IoZXJyPy5tZXNzYWdlIHx8IFwiUGF5bWVudCAvIHRpY2tldCBpc3N1ZSBmYWlsZWQuXCIpO1xyXG4gICAgICBzZXRTdGF0dXNNc2coXCJcIik7XHJcbiAgICAgIC8vIEtlZXAgZXJyb3IgdmlzaWJsZSBuZWFyIHRoZSBQYXkgYnV0dG9uIChib2R5IG1heSBiZSBzY3JvbGxlZCkuXHJcbiAgICAgIHJlcXVlc3RBbmltYXRpb25GcmFtZSgoKSA9PiB7XHJcbiAgICAgICAgZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJicC1wYXktZXJyb3JcIik/LnNjcm9sbEludG9WaWV3KHsgYmVoYXZpb3I6IFwic21vb3RoXCIsIGJsb2NrOiBcIm5lYXJlc3RcIiB9KTtcclxuICAgICAgfSk7XHJcbiAgICB9IGZpbmFsbHkge1xyXG4gICAgICBzZXRTdWJtaXR0aW5nKGZhbHNlKTtcclxuICAgIH1cclxuICB9XHJcblxyXG4gIGZ1bmN0aW9uIGZpbGxTYW5kYm94VGVzdENhcmQoKSB7XHJcbiAgICBjb25zdCBmaXJzdCA9XHJcbiAgICAgIHBhc3NlbmdlcnNbMF0/LmZpcnN0TmFtZSB8fFxyXG4gICAgICBwYXNzZW5nZXJzWzBdPy5maXJzdF9uYW1lIHx8XHJcbiAgICAgIFwiXCI7XHJcbiAgICBjb25zdCBsYXN0ID1cclxuICAgICAgcGFzc2VuZ2Vyc1swXT8ubGFzdE5hbWUgfHxcclxuICAgICAgcGFzc2VuZ2Vyc1swXT8ubGFzdF9uYW1lIHx8XHJcbiAgICAgIFwiXCI7XHJcbiAgICBjb25zdCBmcm9tUGF4ID0gYCR7Zmlyc3R9ICR7bGFzdH1gLnRyaW0oKTtcclxuICAgIHNldE1vY2tDYXJkKHtcclxuICAgICAgbnVtYmVyOiBcIjQyNDIgNDI0MiA0MjQyIDQyNDJcIixcclxuICAgICAgZXhwaXJ5OiBcIjEyLzI4XCIsXHJcbiAgICAgIGN2YzogXCIxMjNcIixcclxuICAgICAgbmFtZTogKG1vY2tDYXJkLm5hbWUgfHwgZnJvbVBheCB8fCBcIlRlc3QgVXNlclwiKS50b1N0cmluZygpLnRyaW0oKSxcclxuICAgIH0pO1xyXG4gICAgc2V0QXBpRXJyb3IoXCJcIik7XHJcbiAgICBzZXRQYXlNZXRob2QoXCJjYXJkXCIpO1xyXG4gIH1cclxuXHJcbiAgZnVuY3Rpb24gaGFuZGxlRG93bmxvYWRQZGYoKSB7XHJcbiAgICBpZiAoIWJvb2tpbmcpIHJldHVybjtcclxuICAgIHNldFBkZkVycm9yKFwiXCIpO1xyXG4gICAgdHJ5IHtcclxuICAgICAgZG93bmxvYWRCb29raW5nQ29uZmlybWF0aW9uUGRmKGJvb2tpbmcpO1xyXG4gICAgfSBjYXRjaCAoZXJyKSB7XHJcbiAgICAgIHNldFBkZkVycm9yKGVycj8ubWVzc2FnZSB8fCBcIkNvdWxkIG5vdCBnZW5lcmF0ZSBQREYuXCIpO1xyXG4gICAgfVxyXG4gIH1cclxuXHJcbiAgY29uc3QgcHJpY2VOdW0gPVxyXG4gICAgaG9sZD8ucHJpY2UgIT0gbnVsbCA/IE51bWJlcihob2xkLnByaWNlKSA6IE51bWJlcihmbGlnaHQucHJpY2UgfHwgMCk7XHJcbiAgY29uc3QgY3VycmVuY3kgPSAoaG9sZD8uY3VycmVuY3kgfHwgZmxpZ2h0LmN1cnJlbmN5Q29kZSB8fCBcIklOUlwiKS50b1VwcGVyQ2FzZSgpO1xyXG4gIGNvbnN0IGN1cnJlbmN5U3ltID0gZmxpZ2h0LmN1cnJlbmN5IHx8IChjdXJyZW5jeSA9PT0gXCJJTlJcIiA/IFwi4oK5XCIgOiBgJHtjdXJyZW5jeX0gYCk7XHJcbiAgY29uc3QgcHJpY2VMYWJlbCA9IGAke2N1cnJlbmN5U3ltfSR7cHJpY2VOdW0udG9Mb2NhbGVTdHJpbmcoXCJlbi1JTlwiKX1gO1xyXG4gIGNvbnN0IGJhc2VGYXJlID0gZmxpZ2h0LnByaWNlX2Jhc2UgIT0gbnVsbCA/IE51bWJlcihmbGlnaHQucHJpY2VfYmFzZSkgOiBudWxsO1xyXG4gIGNvbnN0IHRheGVzID1cclxuICAgIGZsaWdodC5wcmljZV90YXhlcyAhPSBudWxsIHx8IGZsaWdodC5wcmljZV9mZWVzICE9IG51bGxcclxuICAgICAgPyBOdW1iZXIoZmxpZ2h0LnByaWNlX3RheGVzIHx8IDApICsgTnVtYmVyKGZsaWdodC5wcmljZV9mZWVzIHx8IDApXHJcbiAgICAgIDogbnVsbDtcclxuICBjb25zdCBsZWFkID0gcGFzc2VuZ2Vyc1swXSB8fCBlbXB0eVBhc3NlbmdlcigpO1xyXG4gIGNvbnN0IHRpdGxlTWFwID0geyBNOiBcIk1yXCIsIEY6IFwiTXNcIiB9O1xyXG4gIGNvbnN0IGRpc3BsYXlUaXRsZSA9IGxlYWQudGl0bGUgfHwgdGl0bGVNYXBbU3RyaW5nKGxlYWQuZ2VuZGVyKS50b1VwcGVyQ2FzZSgpXSB8fCBcIk1yXCI7XHJcblxyXG4gIGNvbnN0IGNvbmZQYXNzZW5nZXJzID0gQXJyYXkuaXNBcnJheShib29raW5nPy5wYXNzZW5nZXJzKSA/IGJvb2tpbmcucGFzc2VuZ2VycyA6IFtdO1xyXG4gIGNvbnN0IGNvbmZTZWdtZW50cyA9IEFycmF5LmlzQXJyYXkoYm9va2luZz8uc2VnbWVudHNfc3VtbWFyeSkgPyBib29raW5nLnNlZ21lbnRzX3N1bW1hcnkgOiBbXTtcclxuICBjb25zdCBjb25mTG9jYXRvcnMgPSBBcnJheS5pc0FycmF5KGJvb2tpbmc/LmFpcmxpbmVfbG9jYXRvcnMpID8gYm9va2luZy5haXJsaW5lX2xvY2F0b3JzIDogW107XHJcbiAgY29uc3QgY29uZlRpY2tldHMgPSBBcnJheS5pc0FycmF5KGJvb2tpbmc/LnRpY2tldF9udW1iZXJzKVxyXG4gICAgPyBib29raW5nLnRpY2tldF9udW1iZXJzLmZpbHRlcihoYXNDb25mVmFsdWUpXHJcbiAgICA6IFtdO1xyXG4gIGNvbnN0IGNvbmZUaWNrZXREYXRhID1cclxuICAgIGJvb2tpbmc/LnRpY2tldF9kYXRhICYmIHR5cGVvZiBib29raW5nLnRpY2tldF9kYXRhID09PSBcIm9iamVjdFwiID8gYm9va2luZy50aWNrZXRfZGF0YSA6IHt9O1xyXG4gIGNvbnN0IGNvbmZUb3RhbCA9XHJcbiAgICBib29raW5nPy50b3RhbF9wcmljZSAhPSBudWxsXHJcbiAgICAgID8gYm9va2luZy50b3RhbF9wcmljZVxyXG4gICAgICA6IGJvb2tpbmc/LnByaWNlICE9IG51bGxcclxuICAgICAgICA/IGJvb2tpbmcucHJpY2VcclxuICAgICAgICA6IGJvb2tpbmc/LnBheW1lbnQ/LmFtb3VudCAhPSBudWxsXHJcbiAgICAgICAgICA/IGJvb2tpbmcucGF5bWVudC5hbW91bnRcclxuICAgICAgICAgIDogYm9va2luZz8ucHJpY2luZz8udG90YWwgPz8gYm9va2luZz8ucHJpY2luZz8udG90YWxBbW91bnQ7XHJcbiAgY29uc3QgY29uZkN1cnJlbmN5ID1cclxuICAgIGJvb2tpbmc/LmN1cnJlbmN5IHx8IGJvb2tpbmc/LnBheW1lbnQ/LmN1cnJlbmN5IHx8IGJvb2tpbmc/LnByaWNpbmc/LmN1cnJlbmN5IHx8IGN1cnJlbmN5O1xyXG4gIGNvbnN0IGNvbmZQYWlkTGFiZWwgPSBmb3JtYXRCb29raW5nTW9uZXkoY29uZlRvdGFsLCBjb25mQ3VycmVuY3kpO1xyXG5cclxuICBjb25zdCBzdGVwVGl0bGUgPVxyXG4gICAgc3RlcCA9PT0gXCJmb3JtXCJcclxuICAgICAgPyBcIlBhc3NlbmdlciBEZXRhaWxzXCJcclxuICAgICAgOiBzdGVwID09PSBcInJldmlld1wiXHJcbiAgICAgICAgPyBcIlJldmlldyBZb3VyIEJvb2tpbmdcIlxyXG4gICAgICAgIDogc3RlcCA9PT0gXCJwYXltZW50XCJcclxuICAgICAgICAgID8gXCJQYXltZW50IERldGFpbHNcIlxyXG4gICAgICAgICAgOiBcIkJvb2tpbmcgQ29uZmlybWF0aW9uXCI7XHJcblxyXG4gIHJldHVybiAoXHJcbiAgICA8ZGl2XHJcbiAgICAgIGNsYXNzTmFtZT17c3R5bGVzLm92ZXJsYXl9XHJcbiAgICAgIHJvbGU9XCJwcmVzZW50YXRpb25cIlxyXG4gICAgICBvbkNsaWNrPXsoZSkgPT4ge1xyXG4gICAgICAgIGlmIChlLnRhcmdldCA9PT0gZS5jdXJyZW50VGFyZ2V0ICYmICFzdWJtaXR0aW5nKSBvbkNsb3NlPy4oKTtcclxuICAgICAgfX1cclxuICAgID5cclxuICAgICAgPGRpdlxyXG4gICAgICAgIGNsYXNzTmFtZT17c3R5bGVzLmRpYWxvZ31cclxuICAgICAgICByb2xlPVwiZGlhbG9nXCJcclxuICAgICAgICBhcmlhLW1vZGFsPVwidHJ1ZVwiXHJcbiAgICAgICAgYXJpYS1sYWJlbGxlZGJ5PVwiYm9va2luZy1wb3B1cC10aXRsZVwiXHJcbiAgICAgID5cclxuICAgICAgICA8aGVhZGVyIGNsYXNzTmFtZT17c3R5bGVzLmhlYWRlcn0+XHJcbiAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT17c3R5bGVzLmhlYWRlclRleHR9PlxyXG4gICAgICAgICAgICA8aDIgaWQ9XCJib29raW5nLXBvcHVwLXRpdGxlXCI+e3N0ZXBUaXRsZX08L2gyPlxyXG4gICAgICAgICAgPC9kaXY+XHJcbiAgICAgICAgICA8YnV0dG9uXHJcbiAgICAgICAgICAgIHR5cGU9XCJidXR0b25cIlxyXG4gICAgICAgICAgICBjbGFzc05hbWU9e3N0eWxlcy5jbG9zZX1cclxuICAgICAgICAgICAgYXJpYS1sYWJlbD1cIkNsb3NlXCJcclxuICAgICAgICAgICAgZGlzYWJsZWQ9e3N1Ym1pdHRpbmd9XHJcbiAgICAgICAgICAgIG9uQ2xpY2s9eygpID0+IG9uQ2xvc2U/LigpfVxyXG4gICAgICAgICAgPlxyXG4gICAgICAgICAgICA8WCBzaXplPXsxOH0gLz5cclxuICAgICAgICAgIDwvYnV0dG9uPlxyXG4gICAgICAgIDwvaGVhZGVyPlxyXG5cclxuICAgICAgICA8ZGl2IGNsYXNzTmFtZT17c3R5bGVzLmJvZHl9PlxyXG4gICAgICAgICAge2FwaUVycm9yID8gPGRpdiBjbGFzc05hbWU9e2Ake3N0eWxlcy5iYW5uZXJ9ICR7c3R5bGVzLmJhbm5lckVycm9yfWB9PnthcGlFcnJvcn08L2Rpdj4gOiBudWxsfVxyXG4gICAgICAgICAge3N0YXR1c01zZyA/IDxkaXYgY2xhc3NOYW1lPXtgJHtzdHlsZXMuYmFubmVyfSAke3N0eWxlcy5iYW5uZXJJbmZvfWB9PntzdGF0dXNNc2d9PC9kaXY+IDogbnVsbH1cclxuXHJcbiAgICAgICAgICB7c3RlcCA9PT0gXCJmb3JtXCIgJiYgKFxyXG4gICAgICAgICAgICA8PlxyXG4gICAgICAgICAgICAgIHtwYXNzZW5nZXJzLm1hcCgocCwgaWR4KSA9PiB7XHJcbiAgICAgICAgICAgICAgICBjb25zdCB0ZSA9IGVycm9ycy50cmF2ZWxlcnM/LltpZHhdIHx8IHt9O1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuIChcclxuICAgICAgICAgICAgICAgICAgPGRpdiBrZXk9e2lkeH0gY2xhc3NOYW1lPXtzdHlsZXMucGF4QmxvY2t9PlxyXG4gICAgICAgICAgICAgICAgICAgIDxoMz57cGFzc2VuZ2VyUGxhbltpZHhdPy5sYWJlbCB8fCBgVHJhdmVsbGVyICR7aWR4ICsgMX1gfTwvaDM+XHJcbiAgICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzc05hbWU9e3N0eWxlcy5ncmlkfT5cclxuICAgICAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPXtzdHlsZXMuZmllbGR9PlxyXG4gICAgICAgICAgICAgICAgICAgICAgICA8bGFiZWwgaHRtbEZvcj17YGJwLXRpdGxlLSR7aWR4fWB9PlRpdGxlPC9sYWJlbD5cclxuICAgICAgICAgICAgICAgICAgICAgICAgPHNlbGVjdFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgIGlkPXtgYnAtdGl0bGUtJHtpZHh9YH1cclxuICAgICAgICAgICAgICAgICAgICAgICAgICB2YWx1ZT17cC50aXRsZSB8fCBcIk1yXCJ9XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgb25DaGFuZ2U9eyhlKSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCB0aXRsZSA9IGUudGFyZ2V0LnZhbHVlO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgZ2VuZGVyID1cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdGl0bGUgPT09IFwiTXJcIiA/IFwiTVwiIDogdGl0bGUgPT09IFwiTXJzXCIgfHwgdGl0bGUgPT09IFwiTXNcIiA/IFwiRlwiIDogcC5nZW5kZXI7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB1cGRhdGVQYXNzZW5nZXIoaWR4LCB7IHRpdGxlLCBnZW5kZXI6IGdlbmRlciB8fCBwLmdlbmRlciB9KTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICB9fVxyXG4gICAgICAgICAgICAgICAgICAgICAgICA+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cIk1yXCI+TXI8L29wdGlvbj5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiTXNcIj5Nczwvb3B0aW9uPlxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJNcnNcIj5NcnM8L29wdGlvbj5cclxuICAgICAgICAgICAgICAgICAgICAgICAgPC9zZWxlY3Q+XHJcbiAgICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cclxuICAgICAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPXtgJHtzdHlsZXMuZmllbGR9ICR7dGUuZmlyc3ROYW1lID8gc3R5bGVzLmZpZWxkRXJyb3IgOiBcIlwifWB9PlxyXG4gICAgICAgICAgICAgICAgICAgICAgICA8bGFiZWwgaHRtbEZvcj17YGJwLWZuLSR7aWR4fWB9PkZpcnN0IE5hbWU8L2xhYmVsPlxyXG4gICAgICAgICAgICAgICAgICAgICAgICA8aW5wdXRcclxuICAgICAgICAgICAgICAgICAgICAgICAgICBpZD17YGJwLWZuLSR7aWR4fWB9XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgdmFsdWU9e3AuZmlyc3ROYW1lfVxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgIGF1dG9Db21wbGV0ZT1cImdpdmVuLW5hbWVcIlxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgIG9uQ2hhbmdlPXsoZSkgPT4gdXBkYXRlUGFzc2VuZ2VyKGlkeCwgeyBmaXJzdE5hbWU6IGUudGFyZ2V0LnZhbHVlIH0pfVxyXG4gICAgICAgICAgICAgICAgICAgICAgICAvPlxyXG4gICAgICAgICAgICAgICAgICAgICAgICB7dGUuZmlyc3ROYW1lID8gPHNwYW4gY2xhc3NOYW1lPXtzdHlsZXMuZXJyfT57dGUuZmlyc3ROYW1lfTwvc3Bhbj4gOiBudWxsfVxyXG4gICAgICAgICAgICAgICAgICAgICAgPC9kaXY+XHJcbiAgICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT17YCR7c3R5bGVzLmZpZWxkfSAke3RlLmxhc3ROYW1lID8gc3R5bGVzLmZpZWxkRXJyb3IgOiBcIlwifWB9PlxyXG4gICAgICAgICAgICAgICAgICAgICAgICA8bGFiZWwgaHRtbEZvcj17YGJwLWxuLSR7aWR4fWB9Pkxhc3QgTmFtZTwvbGFiZWw+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIDxpbnB1dFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgIGlkPXtgYnAtbG4tJHtpZHh9YH1cclxuICAgICAgICAgICAgICAgICAgICAgICAgICB2YWx1ZT17cC5sYXN0TmFtZX1cclxuICAgICAgICAgICAgICAgICAgICAgICAgICBhdXRvQ29tcGxldGU9XCJmYW1pbHktbmFtZVwiXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgb25DaGFuZ2U9eyhlKSA9PiB1cGRhdGVQYXNzZW5nZXIoaWR4LCB7IGxhc3ROYW1lOiBlLnRhcmdldC52YWx1ZSB9KX1cclxuICAgICAgICAgICAgICAgICAgICAgICAgLz5cclxuICAgICAgICAgICAgICAgICAgICAgICAge3RlLmxhc3ROYW1lID8gPHNwYW4gY2xhc3NOYW1lPXtzdHlsZXMuZXJyfT57dGUubGFzdE5hbWV9PC9zcGFuPiA6IG51bGx9XHJcbiAgICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cclxuICAgICAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPXtgJHtzdHlsZXMuZmllbGR9ICR7dGUuZG9iID8gc3R5bGVzLmZpZWxkRXJyb3IgOiBcIlwifWB9PlxyXG4gICAgICAgICAgICAgICAgICAgICAgICA8bGFiZWwgaHRtbEZvcj17YGJwLWRvYi0ke2lkeH1gfT5EYXRlIE9mIEJpcnRoPC9sYWJlbD5cclxuICAgICAgICAgICAgICAgICAgICAgICAgPGlucHV0XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgaWQ9e2BicC1kb2ItJHtpZHh9YH1cclxuICAgICAgICAgICAgICAgICAgICAgICAgICB0eXBlPVwiZGF0ZVwiXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgdmFsdWU9e3AuZG9ifVxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgIG9uQ2hhbmdlPXsoZSkgPT4gdXBkYXRlUGFzc2VuZ2VyKGlkeCwgeyBkb2I6IGUudGFyZ2V0LnZhbHVlIH0pfVxyXG4gICAgICAgICAgICAgICAgICAgICAgICAvPlxyXG4gICAgICAgICAgICAgICAgICAgICAgICB7dGUuZG9iID8gPHNwYW4gY2xhc3NOYW1lPXtzdHlsZXMuZXJyfT57dGUuZG9ifTwvc3Bhbj4gOiBudWxsfVxyXG4gICAgICAgICAgICAgICAgICAgICAgPC9kaXY+XHJcbiAgICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT17YCR7c3R5bGVzLmZpZWxkfSAke3RlLmdlbmRlciA/IHN0eWxlcy5maWVsZEVycm9yIDogXCJcIn1gfT5cclxuICAgICAgICAgICAgICAgICAgICAgICAgPGxhYmVsIGh0bWxGb3I9e2BicC1nLSR7aWR4fWB9PkdlbmRlcjwvbGFiZWw+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIDxzZWxlY3RcclxuICAgICAgICAgICAgICAgICAgICAgICAgICBpZD17YGJwLWctJHtpZHh9YH1cclxuICAgICAgICAgICAgICAgICAgICAgICAgICB2YWx1ZT17cC5nZW5kZXJ9XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgb25DaGFuZ2U9eyhlKSA9PiB1cGRhdGVQYXNzZW5nZXIoaWR4LCB7IGdlbmRlcjogZS50YXJnZXQudmFsdWUgfSl9XHJcbiAgICAgICAgICAgICAgICAgICAgICAgID5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiXCI+U2VsZWN0PC9vcHRpb24+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cIk1cIj5NYWxlPC9vcHRpb24+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cIkZcIj5GZW1hbGU8L29wdGlvbj5cclxuICAgICAgICAgICAgICAgICAgICAgICAgPC9zZWxlY3Q+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHt0ZS5nZW5kZXIgPyA8c3BhbiBjbGFzc05hbWU9e3N0eWxlcy5lcnJ9Pnt0ZS5nZW5kZXJ9PC9zcGFuPiA6IG51bGx9XHJcbiAgICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cclxuICAgICAgICAgICAgICAgICAgICAgIDxkaXZcclxuICAgICAgICAgICAgICAgICAgICAgICAgY2xhc3NOYW1lPXtgJHtzdHlsZXMuZmllbGR9ICR7c3R5bGVzLmdyaWRGdWxsfSAke1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgIGVycm9ycy5waG9uZSA/IHN0eWxlcy5maWVsZEVycm9yIDogXCJcIlxyXG4gICAgICAgICAgICAgICAgICAgICAgICB9YH1cclxuICAgICAgICAgICAgICAgICAgICAgID5cclxuICAgICAgICAgICAgICAgICAgICAgICAgPGxhYmVsIGh0bWxGb3I9XCJicC1waG9uZVwiPk1vYmlsZSBOdW1iZXI8L2xhYmVsPlxyXG4gICAgICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT17c3R5bGVzLnBob25lUm93fT5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICA8c3BhbiBjbGFzc05hbWU9e3N0eWxlcy5waG9uZUNjfT4re3Bob25lQ2N9PC9zcGFuPlxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgIDxpbnB1dFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWQ9XCJicC1waG9uZVwiXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0eXBlPVwidGVsXCJcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHZhbHVlPXtwaG9uZX1cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGF1dG9Db21wbGV0ZT1cInRlbFwiXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBvbkNoYW5nZT17KGUpID0+IHNldFBob25lKGUudGFyZ2V0LnZhbHVlKX1cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAvPlxyXG4gICAgICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cclxuICAgICAgICAgICAgICAgICAgICAgICAge2Vycm9ycy5waG9uZSA/IDxzcGFuIGNsYXNzTmFtZT17c3R5bGVzLmVycn0+e2Vycm9ycy5waG9uZX08L3NwYW4+IDogbnVsbH1cclxuICAgICAgICAgICAgICAgICAgICAgIDwvZGl2PlxyXG4gICAgICAgICAgICAgICAgICAgICAgPGRpdlxyXG4gICAgICAgICAgICAgICAgICAgICAgICBjbGFzc05hbWU9e2Ake3N0eWxlcy5maWVsZH0gJHtzdHlsZXMuZ3JpZEZ1bGx9ICR7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgZXJyb3JzLmVtYWlsID8gc3R5bGVzLmZpZWxkRXJyb3IgOiBcIlwiXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH1gfVxyXG4gICAgICAgICAgICAgICAgICAgICAgPlxyXG4gICAgICAgICAgICAgICAgICAgICAgICA8bGFiZWwgaHRtbEZvcj1cImJwLWVtYWlsXCI+RW1haWwgQWRkcmVzczwvbGFiZWw+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIDxpbnB1dFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgIGlkPVwiYnAtZW1haWxcIlxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgIHR5cGU9XCJlbWFpbFwiXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgdmFsdWU9e2VtYWlsfVxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgIGF1dG9Db21wbGV0ZT1cImVtYWlsXCJcclxuICAgICAgICAgICAgICAgICAgICAgICAgICBvbkNoYW5nZT17KGUpID0+IHNldEVtYWlsKGUudGFyZ2V0LnZhbHVlKX1cclxuICAgICAgICAgICAgICAgICAgICAgICAgLz5cclxuICAgICAgICAgICAgICAgICAgICAgICAge2Vycm9ycy5lbWFpbCA/IDxzcGFuIGNsYXNzTmFtZT17c3R5bGVzLmVycn0+e2Vycm9ycy5lbWFpbH08L3NwYW4+IDogbnVsbH1cclxuICAgICAgICAgICAgICAgICAgICAgIDwvZGl2PlxyXG4gICAgICAgICAgICAgICAgICAgICAgPGRpdlxyXG4gICAgICAgICAgICAgICAgICAgICAgICBjbGFzc05hbWU9e2Ake3N0eWxlcy5maWVsZH0gJHtzdHlsZXMuZ3JpZEZ1bGx9ICR7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgdGUuZG9jdW1lbnROdW1iZXIgPyBzdHlsZXMuZmllbGRFcnJvciA6IFwiXCJcclxuICAgICAgICAgICAgICAgICAgICAgICAgfWB9XHJcbiAgICAgICAgICAgICAgICAgICAgICA+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIDxsYWJlbCBodG1sRm9yPXtgYnAtZG9jLSR7aWR4fWB9PlxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgIHtkb21lc3RpYyA/IFwiR292dCBJRCAvIEFhZGhhYXIgKGZvciB0aWNrZXQpXCIgOiBcIlBhc3Nwb3J0IG51bWJlclwifVxyXG4gICAgICAgICAgICAgICAgICAgICAgICA8L2xhYmVsPlxyXG4gICAgICAgICAgICAgICAgICAgICAgICA8aW5wdXRcclxuICAgICAgICAgICAgICAgICAgICAgICAgICBpZD17YGJwLWRvYy0ke2lkeH1gfVxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgIHZhbHVlPXtwLmRvY3VtZW50TnVtYmVyfVxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgIG1heExlbmd0aD17MTV9XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgb25DaGFuZ2U9eyhlKSA9PiB1cGRhdGVQYXNzZW5nZXIoaWR4LCB7IGRvY3VtZW50TnVtYmVyOiBlLnRhcmdldC52YWx1ZSB9KX1cclxuICAgICAgICAgICAgICAgICAgICAgICAgLz5cclxuICAgICAgICAgICAgICAgICAgICAgICAge3RlLmRvY3VtZW50TnVtYmVyID8gKFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgIDxzcGFuIGNsYXNzTmFtZT17c3R5bGVzLmVycn0+e3RlLmRvY3VtZW50TnVtYmVyfTwvc3Bhbj5cclxuICAgICAgICAgICAgICAgICAgICAgICAgKSA6IG51bGx9XHJcbiAgICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cclxuICAgICAgICAgICAgICAgICAgICAgIHshZG9tZXN0aWMgPyAoXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIDxkaXZcclxuICAgICAgICAgICAgICAgICAgICAgICAgICBjbGFzc05hbWU9e2Ake3N0eWxlcy5maWVsZH0gJHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRlLmRvY3VtZW50RXhwaXJ5ID8gc3R5bGVzLmZpZWxkRXJyb3IgOiBcIlwiXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgfSAke3N0eWxlcy5ncmlkRnVsbH1gfVxyXG4gICAgICAgICAgICAgICAgICAgICAgICA+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgPGxhYmVsIGh0bWxGb3I9e2BicC1leHAtJHtpZHh9YH0+UGFzc3BvcnQgZXhwaXJ5PC9sYWJlbD5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICA8aW5wdXRcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlkPXtgYnAtZXhwLSR7aWR4fWB9XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0eXBlPVwiZGF0ZVwiXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB2YWx1ZT17cC5kb2N1bWVudEV4cGlyeX1cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG9uQ2hhbmdlPXsoZSkgPT5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdXBkYXRlUGFzc2VuZ2VyKGlkeCwgeyBkb2N1bWVudEV4cGlyeTogZS50YXJnZXQudmFsdWUgfSlcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAvPlxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgIHt0ZS5kb2N1bWVudEV4cGlyeSA/IChcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxzcGFuIGNsYXNzTmFtZT17c3R5bGVzLmVycn0+e3RlLmRvY3VtZW50RXhwaXJ5fTwvc3Bhbj5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICApIDogbnVsbH1cclxuICAgICAgICAgICAgICAgICAgICAgICAgPC9kaXY+XHJcbiAgICAgICAgICAgICAgICAgICAgICApIDogbnVsbH1cclxuICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cclxuICAgICAgICAgICAgICAgICAgPC9kaXY+XHJcbiAgICAgICAgICAgICAgICApO1xyXG4gICAgICAgICAgICAgIH0pfVxyXG5cclxuICAgICAgICAgICAgICA8bGFiZWwgY2xhc3NOYW1lPXtzdHlsZXMuc2F2ZUNoZWNrfT5cclxuICAgICAgICAgICAgICAgIDxpbnB1dFxyXG4gICAgICAgICAgICAgICAgICB0eXBlPVwiY2hlY2tib3hcIlxyXG4gICAgICAgICAgICAgICAgICBjaGVja2VkPXtzYXZlRGV0YWlsc31cclxuICAgICAgICAgICAgICAgICAgb25DaGFuZ2U9eyhlKSA9PiBzZXRTYXZlRGV0YWlscyhlLnRhcmdldC5jaGVja2VkKX1cclxuICAgICAgICAgICAgICAgIC8+XHJcbiAgICAgICAgICAgICAgICBTYXZlIGRldGFpbHMgZm9yIGZhc3QgYm9va2luZ1xyXG4gICAgICAgICAgICAgIDwvbGFiZWw+XHJcbiAgICAgICAgICAgIDwvPlxyXG4gICAgICAgICAgKX1cclxuXHJcbiAgICAgICAgICB7c3RlcCA9PT0gXCJyZXZpZXdcIiAmJiAoXHJcbiAgICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPXtzdHlsZXMucmV2aWV3fT5cclxuICAgICAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT17c3R5bGVzLnJldmlld0ZsaWdodH0+XHJcbiAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT17c3R5bGVzLnJldmlld0FpcmxpbmV9PlxyXG4gICAgICAgICAgICAgICAgICB7ZmxpZ2h0LmFpcmxpbmU/LmxvZ28gPyAoXHJcbiAgICAgICAgICAgICAgICAgICAgPGltZyBzcmM9e2ZsaWdodC5haXJsaW5lLmxvZ299IGFsdD1cIlwiIC8+XHJcbiAgICAgICAgICAgICAgICAgICkgOiAoXHJcbiAgICAgICAgICAgICAgICAgICAgPHNwYW4+eyhmbGlnaHQuYWlybGluZT8ubmFtZSB8fCBcIkZMXCIpLnNsaWNlKDAsIDIpfTwvc3Bhbj5cclxuICAgICAgICAgICAgICAgICAgKX1cclxuICAgICAgICAgICAgICAgICAgPGRpdj5cclxuICAgICAgICAgICAgICAgICAgICA8c3Ryb25nPntmbGlnaHQuYWlybGluZT8ubmFtZSB8fCBcIkZsaWdodFwifTwvc3Ryb25nPlxyXG4gICAgICAgICAgICAgICAgICAgIDxlbT57ZmxpZ2h0LmZsaWdodE51bWJlciB8fCBcIlwifTwvZW0+XHJcbiAgICAgICAgICAgICAgICAgIDwvZGl2PlxyXG4gICAgICAgICAgICAgICAgPC9kaXY+XHJcbiAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT17c3R5bGVzLnJldmlld1NjaGVkdWxlfT5cclxuICAgICAgICAgICAgICAgICAgPGRpdj5cclxuICAgICAgICAgICAgICAgICAgICA8c3Ryb25nPntmbGlnaHQuZGVwYXJ0dXJlPy50aW1lIHx8IFwiLS06LS1cIn08L3N0cm9uZz5cclxuICAgICAgICAgICAgICAgICAgICA8c3Bhbj57ZmxpZ2h0LmRlcGFydHVyZT8uYWlycG9ydCB8fCBvcmlnaW4gfHwgXCLigJRcIn08L3NwYW4+XHJcbiAgICAgICAgICAgICAgICAgIDwvZGl2PlxyXG4gICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT17c3R5bGVzLnJldmlld01pZH0+XHJcbiAgICAgICAgICAgICAgICAgICAgPHNwYW4+e2ZsaWdodC5kdXJhdGlvbiB8fCBcIuKAlFwifTwvc3Bhbj5cclxuICAgICAgICAgICAgICAgICAgICA8aSAvPlxyXG4gICAgICAgICAgICAgICAgICAgIDxzcGFuPntmbGlnaHQuc3RvcHMgfHwgXCJEaXJlY3RcIn08L3NwYW4+XHJcbiAgICAgICAgICAgICAgICAgIDwvZGl2PlxyXG4gICAgICAgICAgICAgICAgICA8ZGl2PlxyXG4gICAgICAgICAgICAgICAgICAgIDxzdHJvbmc+e2ZsaWdodC5hcnJpdmFsPy50aW1lIHx8IFwiLS06LS1cIn08L3N0cm9uZz5cclxuICAgICAgICAgICAgICAgICAgICA8c3Bhbj57ZmxpZ2h0LmFycml2YWw/LmFpcnBvcnQgfHwgZGVzdGluYXRpb24gfHwgXCLigJRcIn08L3NwYW4+XHJcbiAgICAgICAgICAgICAgICAgIDwvZGl2PlxyXG4gICAgICAgICAgICAgICAgPC9kaXY+XHJcbiAgICAgICAgICAgICAgICA8cCBjbGFzc05hbWU9e3N0eWxlcy5yZXZpZXdNZXRhfT5cclxuICAgICAgICAgICAgICAgICAge2ZsaWdodC5kZXBhcnR1cmU/LmRhdGUgfHwgXCJcIn1cclxuICAgICAgICAgICAgICAgICAge3Bhc3NlbmdlclBsYW4ubGVuZ3RoID8gYCDCtyAke3Bhc3NlbmdlclBsYW4ubGVuZ3RofSBUcmF2ZWxsZXIke3Bhc3NlbmdlclBsYW4ubGVuZ3RoID4gMSA/IFwic1wiIDogXCJcIn1gIDogXCJcIn1cclxuICAgICAgICAgICAgICAgICAge2ZsaWdodC5jYWJpbiA/IGAgwrcgJHtmbGlnaHQuY2FiaW59YCA6IFwiIMK3IEVjb25vbXlcIn1cclxuICAgICAgICAgICAgICAgIDwvcD5cclxuICAgICAgICAgICAgICA8L2Rpdj5cclxuXHJcbiAgICAgICAgICAgICAgPGRpdiBjbGFzc05hbWU9e3N0eWxlcy5yZXZpZXdCbG9ja30+XHJcbiAgICAgICAgICAgICAgICA8aDQ+XHJcbiAgICAgICAgICAgICAgICAgIFBhc3NlbmdlciBEZXRhaWxze1wiIFwifVxyXG4gICAgICAgICAgICAgICAgICA8YnV0dG9uXHJcbiAgICAgICAgICAgICAgICAgICAgdHlwZT1cImJ1dHRvblwiXHJcbiAgICAgICAgICAgICAgICAgICAgY2xhc3NOYW1lPXtzdHlsZXMubGlua0J0bn1cclxuICAgICAgICAgICAgICAgICAgICBvbkNsaWNrPXsoKSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgICBzZXRBcGlFcnJvcihcIlwiKTtcclxuICAgICAgICAgICAgICAgICAgICAgIHNldFN0ZXAoXCJmb3JtXCIpO1xyXG4gICAgICAgICAgICAgICAgICAgIH19XHJcbiAgICAgICAgICAgICAgICAgID5cclxuICAgICAgICAgICAgICAgICAgICBFZGl0XHJcbiAgICAgICAgICAgICAgICAgIDwvYnV0dG9uPlxyXG4gICAgICAgICAgICAgICAgPC9oND5cclxuICAgICAgICAgICAgICAgIDxwPlxyXG4gICAgICAgICAgICAgICAgICB7ZGlzcGxheVRpdGxlfS4ge2xlYWQuZmlyc3ROYW1lfSB7bGVhZC5sYXN0TmFtZX1cclxuICAgICAgICAgICAgICAgIDwvcD5cclxuICAgICAgICAgICAgICAgIDxwIGNsYXNzTmFtZT17c3R5bGVzLm11dGVkfT5cclxuICAgICAgICAgICAgICAgICAge2Zvcm1hdERvYkRpc3BsYXkobGVhZC5kb2IpfVxyXG4gICAgICAgICAgICAgICAgICB7bGVhZC5nZW5kZXIgPT09IFwiTVwiID8gXCIgwrcgTWFsZVwiIDogbGVhZC5nZW5kZXIgPT09IFwiRlwiID8gXCIgwrcgRmVtYWxlXCIgOiBcIlwifVxyXG4gICAgICAgICAgICAgICAgPC9wPlxyXG4gICAgICAgICAgICAgICAgPHAgY2xhc3NOYW1lPXtzdHlsZXMubXV0ZWR9PlxyXG4gICAgICAgICAgICAgICAgICAre3Bob25lQ2N9IHtwaG9uZX0gwrcge2VtYWlsfVxyXG4gICAgICAgICAgICAgICAgPC9wPlxyXG4gICAgICAgICAgICAgIDwvZGl2PlxyXG5cclxuICAgICAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT17c3R5bGVzLnJldmlld0Jsb2NrfT5cclxuICAgICAgICAgICAgICAgIDxoND5GYXJlIFN1bW1hcnk8L2g0PlxyXG4gICAgICAgICAgICAgICAge2Jhc2VGYXJlICE9IG51bGwgJiYgKFxyXG4gICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT17c3R5bGVzLmZhcmVSb3d9PlxyXG4gICAgICAgICAgICAgICAgICAgIDxzcGFuPkJhc2UgRmFyZTwvc3Bhbj5cclxuICAgICAgICAgICAgICAgICAgICA8c3Bhbj5cclxuICAgICAgICAgICAgICAgICAgICAgIHtjdXJyZW5jeVN5bX1cclxuICAgICAgICAgICAgICAgICAgICAgIHtiYXNlRmFyZS50b0xvY2FsZVN0cmluZyhcImVuLUlOXCIpfVxyXG4gICAgICAgICAgICAgICAgICAgIDwvc3Bhbj5cclxuICAgICAgICAgICAgICAgICAgPC9kaXY+XHJcbiAgICAgICAgICAgICAgICApfVxyXG4gICAgICAgICAgICAgICAge3RheGVzICE9IG51bGwgJiYgdGF4ZXMgPiAwICYmIChcclxuICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzc05hbWU9e3N0eWxlcy5mYXJlUm93fT5cclxuICAgICAgICAgICAgICAgICAgICA8c3Bhbj5UYXhlcyAmIEZlZXM8L3NwYW4+XHJcbiAgICAgICAgICAgICAgICAgICAgPHNwYW4+XHJcbiAgICAgICAgICAgICAgICAgICAgICB7Y3VycmVuY3lTeW19XHJcbiAgICAgICAgICAgICAgICAgICAgICB7dGF4ZXMudG9Mb2NhbGVTdHJpbmcoXCJlbi1JTlwiKX1cclxuICAgICAgICAgICAgICAgICAgICA8L3NwYW4+XHJcbiAgICAgICAgICAgICAgICAgIDwvZGl2PlxyXG4gICAgICAgICAgICAgICAgKX1cclxuICAgICAgICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPXtgJHtzdHlsZXMuZmFyZVJvd30gJHtzdHlsZXMuZmFyZVRvdGFsfWB9PlxyXG4gICAgICAgICAgICAgICAgICA8c3Bhbj5Ub3RhbCBBbW91bnQ8L3NwYW4+XHJcbiAgICAgICAgICAgICAgICAgIDxzcGFuPntwcmljZUxhYmVsfTwvc3Bhbj5cclxuICAgICAgICAgICAgICAgIDwvZGl2PlxyXG4gICAgICAgICAgICAgIDwvZGl2PlxyXG4gICAgICAgICAgICA8L2Rpdj5cclxuICAgICAgICAgICl9XHJcblxyXG4gICAgICAgICAge3N0ZXAgPT09IFwicGF5bWVudFwiICYmIChcclxuICAgICAgICAgICAgPGRpdiBjbGFzc05hbWU9e3N0eWxlcy5wYXltZW50fT5cclxuICAgICAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT17c3R5bGVzLnBheVRvdGFsfT5cclxuICAgICAgICAgICAgICAgIDxkaXY+XHJcbiAgICAgICAgICAgICAgICAgIDxzcGFuPlRvdGFsIEFtb3VudDwvc3Bhbj5cclxuICAgICAgICAgICAgICAgICAgPHN0cm9uZz57cHJpY2VMYWJlbH08L3N0cm9uZz5cclxuICAgICAgICAgICAgICAgIDwvZGl2PlxyXG4gICAgICAgICAgICAgICAgPGJ1dHRvbiB0eXBlPVwiYnV0dG9uXCIgY2xhc3NOYW1lPXtzdHlsZXMubGlua0J0bn0gb25DbGljaz17KCkgPT4gc2V0U3RlcChcInJldmlld1wiKX0+XHJcbiAgICAgICAgICAgICAgICAgIFZpZXcgRmFyZSBCcmVha3VwXHJcbiAgICAgICAgICAgICAgICA8L2J1dHRvbj5cclxuICAgICAgICAgICAgICA8L2Rpdj5cclxuXHJcbiAgICAgICAgICAgICAgPGg0PlNlbGVjdCBQYXltZW50IE1ldGhvZDwvaDQ+XHJcbiAgICAgICAgICAgICAgPGRpdiBjbGFzc05hbWU9e3N0eWxlcy5wYXlNZXRob2RzfSByb2xlPVwicmFkaW9ncm91cFwiIGFyaWEtbGFiZWw9XCJQYXltZW50IG1ldGhvZFwiPlxyXG4gICAgICAgICAgICAgICAgPGJ1dHRvblxyXG4gICAgICAgICAgICAgICAgICB0eXBlPVwiYnV0dG9uXCJcclxuICAgICAgICAgICAgICAgICAgY2xhc3NOYW1lPXtgJHtzdHlsZXMucGF5TWV0aG9kfSR7cGF5TWV0aG9kID09PSBcInVwaVwiID8gYCAke3N0eWxlcy5wYXlNZXRob2RBY3RpdmV9YCA6IFwiXCJ9YH1cclxuICAgICAgICAgICAgICAgICAgb25DbGljaz17KCkgPT4gc2V0UGF5TWV0aG9kKFwidXBpXCIpfVxyXG4gICAgICAgICAgICAgICAgPlxyXG4gICAgICAgICAgICAgICAgICA8U21hcnRwaG9uZSBzaXplPXsxOH0gYXJpYS1oaWRkZW4gLz5cclxuICAgICAgICAgICAgICAgICAgPHNwYW4+XHJcbiAgICAgICAgICAgICAgICAgICAgPHN0cm9uZz5VUEk8L3N0cm9uZz5cclxuICAgICAgICAgICAgICAgICAgICA8ZW0+UGF5IHdpdGggVVBJPC9lbT5cclxuICAgICAgICAgICAgICAgICAgPC9zcGFuPlxyXG4gICAgICAgICAgICAgICAgPC9idXR0b24+XHJcbiAgICAgICAgICAgICAgICA8YnV0dG9uXHJcbiAgICAgICAgICAgICAgICAgIHR5cGU9XCJidXR0b25cIlxyXG4gICAgICAgICAgICAgICAgICBjbGFzc05hbWU9e2Ake3N0eWxlcy5wYXlNZXRob2R9JHtwYXlNZXRob2QgPT09IFwiY2FyZFwiID8gYCAke3N0eWxlcy5wYXlNZXRob2RBY3RpdmV9YCA6IFwiXCJ9YH1cclxuICAgICAgICAgICAgICAgICAgb25DbGljaz17KCkgPT4gc2V0UGF5TWV0aG9kKFwiY2FyZFwiKX1cclxuICAgICAgICAgICAgICAgID5cclxuICAgICAgICAgICAgICAgICAgPENyZWRpdENhcmQgc2l6ZT17MTh9IGFyaWEtaGlkZGVuIC8+XHJcbiAgICAgICAgICAgICAgICAgIDxzcGFuPlxyXG4gICAgICAgICAgICAgICAgICAgIDxzdHJvbmc+Q3JlZGl0IENhcmQ8L3N0cm9uZz5cclxuICAgICAgICAgICAgICAgICAgICA8ZW0+VmlzYSwgTWFzdGVyY2FyZDwvZW0+XHJcbiAgICAgICAgICAgICAgICAgIDwvc3Bhbj5cclxuICAgICAgICAgICAgICAgIDwvYnV0dG9uPlxyXG4gICAgICAgICAgICAgICAgPGJ1dHRvblxyXG4gICAgICAgICAgICAgICAgICB0eXBlPVwiYnV0dG9uXCJcclxuICAgICAgICAgICAgICAgICAgY2xhc3NOYW1lPXtgJHtzdHlsZXMucGF5TWV0aG9kfSR7cGF5TWV0aG9kID09PSBcImRlYml0XCIgPyBgICR7c3R5bGVzLnBheU1ldGhvZEFjdGl2ZX1gIDogXCJcIn1gfVxyXG4gICAgICAgICAgICAgICAgICBvbkNsaWNrPXsoKSA9PiBzZXRQYXlNZXRob2QoXCJkZWJpdFwiKX1cclxuICAgICAgICAgICAgICAgID5cclxuICAgICAgICAgICAgICAgICAgPENyZWRpdENhcmQgc2l6ZT17MTh9IGFyaWEtaGlkZGVuIC8+XHJcbiAgICAgICAgICAgICAgICAgIDxzcGFuPlxyXG4gICAgICAgICAgICAgICAgICAgIDxzdHJvbmc+RGViaXQgQ2FyZDwvc3Ryb25nPlxyXG4gICAgICAgICAgICAgICAgICAgIDxlbT5WaXNhLCBNYXN0ZXJjYXJkPC9lbT5cclxuICAgICAgICAgICAgICAgICAgPC9zcGFuPlxyXG4gICAgICAgICAgICAgICAgPC9idXR0b24+XHJcbiAgICAgICAgICAgICAgPC9kaXY+XHJcblxyXG4gICAgICAgICAgICAgIHsocGF5TWV0aG9kID09PSBcImNhcmRcIiB8fCBwYXlNZXRob2QgPT09IFwiZGViaXRcIikgJiYgKFxyXG4gICAgICAgICAgICAgICAgdXNlTW9ja0NhcmQgPyAoXHJcbiAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPXtzdHlsZXMubW9ja0NhcmRGb3JtfT5cclxuICAgICAgICAgICAgICAgICAgICA8cCBjbGFzc05hbWU9e3N0eWxlcy5tb2NrSGludH0+XHJcbiAgICAgICAgICAgICAgICAgICAgICBTYW5kYm94IGRlbW8g4oCUIExpdGVBUEkgUGF5bWVudCBTREsga2V5cyB3ZXJlIG5vdCByZXR1cm5lZC4gVXNlIHRoZSBmdWxsIHRlc3QgY2FyZHtcIiBcIn1cclxuICAgICAgICAgICAgICAgICAgICAgIDxjb2RlPjQyNDIgNDI0MiA0MjQyIDQyNDI8L2NvZGU+ICgxNiBkaWdpdHMpIMK3IGFueSBmdXR1cmUgTU0vWVkgwrcgYW55IENWQy5cclxuICAgICAgICAgICAgICAgICAgICA8L3A+XHJcbiAgICAgICAgICAgICAgICAgICAgPGJ1dHRvblxyXG4gICAgICAgICAgICAgICAgICAgICAgdHlwZT1cImJ1dHRvblwiXHJcbiAgICAgICAgICAgICAgICAgICAgICBjbGFzc05hbWU9e3N0eWxlcy5maWxsVGVzdENhcmR9XHJcbiAgICAgICAgICAgICAgICAgICAgICBvbkNsaWNrPXtmaWxsU2FuZGJveFRlc3RDYXJkfVxyXG4gICAgICAgICAgICAgICAgICAgID5cclxuICAgICAgICAgICAgICAgICAgICAgIEZpbGwgdGVzdCBjYXJkIDQyNDLigKZcclxuICAgICAgICAgICAgICAgICAgICA8L2J1dHRvbj5cclxuICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT17c3R5bGVzLmZpZWxkfT5cclxuICAgICAgICAgICAgICAgICAgICAgIDxsYWJlbCBodG1sRm9yPVwiYnAtY2FyZC1uYW1lXCI+TmFtZSBvbiBjYXJkPC9sYWJlbD5cclxuICAgICAgICAgICAgICAgICAgICAgIDxpbnB1dFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBpZD1cImJwLWNhcmQtbmFtZVwiXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGF1dG9Db21wbGV0ZT1cImNjLW5hbWVcIlxyXG4gICAgICAgICAgICAgICAgICAgICAgICBwbGFjZWhvbGRlcj1cIkFzIG9uIGNhcmRcIlxyXG4gICAgICAgICAgICAgICAgICAgICAgICB2YWx1ZT17bW9ja0NhcmQubmFtZX1cclxuICAgICAgICAgICAgICAgICAgICAgICAgb25DaGFuZ2U9eyhlKSA9PiBzZXRNb2NrQ2FyZCgobSkgPT4gKHsgLi4ubSwgbmFtZTogZS50YXJnZXQudmFsdWUgfSkpfVxyXG4gICAgICAgICAgICAgICAgICAgICAgLz5cclxuICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cclxuICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT17c3R5bGVzLmZpZWxkfT5cclxuICAgICAgICAgICAgICAgICAgICAgIDxsYWJlbCBodG1sRm9yPVwiYnAtY2FyZC1udW1iZXJcIj5cclxuICAgICAgICAgICAgICAgICAgICAgICAgQ2FyZCBudW1iZXJ7XCIgXCJ9XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIDxzcGFuIGNsYXNzTmFtZT17c3R5bGVzLm11dGVkfT5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAoe1N0cmluZyhtb2NrQ2FyZC5udW1iZXIgfHwgXCJcIikucmVwbGFjZSgvXFxEL2csIFwiXCIpLmxlbmd0aH0vMTYpXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIDwvc3Bhbj5cclxuICAgICAgICAgICAgICAgICAgICAgIDwvbGFiZWw+XHJcbiAgICAgICAgICAgICAgICAgICAgICA8aW5wdXRcclxuICAgICAgICAgICAgICAgICAgICAgICAgaWQ9XCJicC1jYXJkLW51bWJlclwiXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGlucHV0TW9kZT1cIm51bWVyaWNcIlxyXG4gICAgICAgICAgICAgICAgICAgICAgICBhdXRvQ29tcGxldGU9XCJjYy1udW1iZXJcIlxyXG4gICAgICAgICAgICAgICAgICAgICAgICBwbGFjZWhvbGRlcj1cIjQyNDIgNDI0MiA0MjQyIDQyNDJcIlxyXG4gICAgICAgICAgICAgICAgICAgICAgICB2YWx1ZT17bW9ja0NhcmQubnVtYmVyfVxyXG4gICAgICAgICAgICAgICAgICAgICAgICBvbkNoYW5nZT17KGUpID0+IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCByYXcgPSBlLnRhcmdldC52YWx1ZS5yZXBsYWNlKC9cXEQvZywgXCJcIikuc2xpY2UoMCwgMTYpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGdyb3VwZWQgPSByYXcucmVwbGFjZSgvKFxcZHs0fSkoPz1cXGQpL2csIFwiJDEgXCIpLnRyaW0oKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICBzZXRNb2NrQ2FyZCgobSkgPT4gKHsgLi4ubSwgbnVtYmVyOiBncm91cGVkIH0pKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICBzZXRBcGlFcnJvcihcIlwiKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgfX1cclxuICAgICAgICAgICAgICAgICAgICAgIC8+XHJcbiAgICAgICAgICAgICAgICAgICAgPC9kaXY+XHJcbiAgICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzc05hbWU9e3N0eWxlcy5tb2NrQ2FyZFJvd30+XHJcbiAgICAgICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT17c3R5bGVzLmZpZWxkfT5cclxuICAgICAgICAgICAgICAgICAgICAgICAgPGxhYmVsIGh0bWxGb3I9XCJicC1jYXJkLWV4cFwiPkV4cGlyeTwvbGFiZWw+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIDxpbnB1dFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgIGlkPVwiYnAtY2FyZC1leHBcIlxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgIGlucHV0TW9kZT1cIm51bWVyaWNcIlxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgIGF1dG9Db21wbGV0ZT1cImNjLWV4cFwiXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgcGxhY2Vob2xkZXI9XCJNTS9ZWVwiXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgdmFsdWU9e21vY2tDYXJkLmV4cGlyeX1cclxuICAgICAgICAgICAgICAgICAgICAgICAgICBvbkNoYW5nZT17KGUpID0+IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGxldCB2ID0gZS50YXJnZXQudmFsdWUucmVwbGFjZSgvW15cXGRdL2csIFwiXCIpLnNsaWNlKDAsIDUpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHYubGVuZ3RoID49IDMgJiYgIXYuaW5jbHVkZXMoXCIvXCIpKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHYgPSBgJHt2LnNsaWNlKDAsIDIpfS8ke3Yuc2xpY2UoMil9YDtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNldE1vY2tDYXJkKChtKSA9PiAoeyAuLi5tLCBleHBpcnk6IHYgfSkpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgIH19XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIC8+XHJcbiAgICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cclxuICAgICAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPXtzdHlsZXMuZmllbGR9PlxyXG4gICAgICAgICAgICAgICAgICAgICAgICA8bGFiZWwgaHRtbEZvcj1cImJwLWNhcmQtY3ZjXCI+Q1ZDPC9sYWJlbD5cclxuICAgICAgICAgICAgICAgICAgICAgICAgPGlucHV0XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgaWQ9XCJicC1jYXJkLWN2Y1wiXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgaW5wdXRNb2RlPVwibnVtZXJpY1wiXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgYXV0b0NvbXBsZXRlPVwiY2MtY3NjXCJcclxuICAgICAgICAgICAgICAgICAgICAgICAgICBwbGFjZWhvbGRlcj1cIjEyM1wiXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgdmFsdWU9e21vY2tDYXJkLmN2Y31cclxuICAgICAgICAgICAgICAgICAgICAgICAgICBvbkNoYW5nZT17KGUpID0+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBzZXRNb2NrQ2FyZCgobSkgPT4gKHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLi4ubSxcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgY3ZjOiBlLnRhcmdldC52YWx1ZS5yZXBsYWNlKC9cXEQvZywgXCJcIikuc2xpY2UoMCwgNCksXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9KSlcclxuICAgICAgICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIC8+XHJcbiAgICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cclxuICAgICAgICAgICAgICAgICAgICA8L2Rpdj5cclxuICAgICAgICAgICAgICAgICAgPC9kaXY+XHJcbiAgICAgICAgICAgICAgICApIDogKFxyXG4gICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT17c3R5bGVzLnN0cmlwZU1vdW50fSByZWY9e2NhcmRNb3VudFJlZn0gLz5cclxuICAgICAgICAgICAgICAgIClcclxuICAgICAgICAgICAgICApfVxyXG4gICAgICAgICAgICAgIHtwYXlNZXRob2QgPT09IFwidXBpXCIgJiYgKFxyXG4gICAgICAgICAgICAgICAgPHAgY2xhc3NOYW1lPXtzdHlsZXMubXV0ZWR9PlxyXG4gICAgICAgICAgICAgICAgICB7dXNlTW9ja0NhcmRcclxuICAgICAgICAgICAgICAgICAgICA/IFwiVVBJIGlzbuKAmXQgYXZhaWxhYmxlIGluIHRoaXMgc2FuZGJveCBkZW1vLiBTZWxlY3QgQ3JlZGl0IG9yIERlYml0IGFuZCB1c2UgdGVzdCBjYXJkIDQyNDIgNDI0MiA0MjQyIDQyNDIuXCJcclxuICAgICAgICAgICAgICAgICAgICA6IFwiTGl2ZSBMaXRlQVBJIGhvbGRzIHVzZSBTdHJpcGUgY2FyZCBjYXB0dXJlLiBTZWxlY3QgQ3JlZGl0IG9yIERlYml0IHRvIHBheSBzZWN1cmVseSDigJQgd2UgbmV2ZXIgbWFyayBwYXltZW50IHN1Y2Nlc3NmdWwgd2l0aG91dCB0aGUgUGF5bWVudCBTREsuXCJ9XHJcbiAgICAgICAgICAgICAgICA8L3A+XHJcbiAgICAgICAgICAgICAgKX1cclxuICAgICAgICAgICAgPC9kaXY+XHJcbiAgICAgICAgICApfVxyXG5cclxuICAgICAgICAgIHtzdGVwID09PSBcImNvbmZpcm1hdGlvblwiICYmIChcclxuICAgICAgICAgICAgPGRpdiBjbGFzc05hbWU9e3N0eWxlcy5jb25maXJtQm94fT5cclxuICAgICAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT17c3R5bGVzLmNvbmZpcm1IZXJvfT5cclxuICAgICAgICAgICAgICAgIDxDaGVja0NpcmNsZTIgc2l6ZT17Mjh9IGFyaWEtaGlkZGVuIGNsYXNzTmFtZT17c3R5bGVzLmNvbmZpcm1JY29ufSAvPlxyXG4gICAgICAgICAgICAgICAgPGRpdj5cclxuICAgICAgICAgICAgICAgICAgPGgzPlxyXG4gICAgICAgICAgICAgICAgICAgIHtib29raW5nPy5zYW5kYm94X2hvbGRcclxuICAgICAgICAgICAgICAgICAgICAgID8gXCJGYXJlIGhlbGQgKHNhbmRib3gpXCJcclxuICAgICAgICAgICAgICAgICAgICAgIDogaGFzQ29uZlZhbHVlKGJvb2tpbmc/LmFpcmxpbmVfcG5yKSB8fCBoYXNDb25mVmFsdWUoYm9va2luZz8udGlja2V0X251bWJlcnMpXHJcbiAgICAgICAgICAgICAgICAgICAgICAgID8gXCJCb29raW5nIGNvbmZpcm1lZFwiXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIDogXCJCb29raW5nIHJlY29yZGVkXCJ9XHJcbiAgICAgICAgICAgICAgICAgIDwvaDM+XHJcbiAgICAgICAgICAgICAgICAgIDxwIGNsYXNzTmFtZT17c3R5bGVzLm11dGVkfT5cclxuICAgICAgICAgICAgICAgICAgICB7Ym9va2luZz8uc2FuZGJveF9ob2xkXHJcbiAgICAgICAgICAgICAgICAgICAgICA/IGJvb2tpbmc/LmhvbmVzdF9zdGF0dXMgfHxcclxuICAgICAgICAgICAgICAgICAgICAgICAgXCJEZW1vIHBheW1lbnQgYWNjZXB0ZWQuIE5vIGFpcmxpbmUgdGlja2V0IHdhcyBpbnZlbnRlZCDigJQgb25seSB0aGUgTGl0ZUFQSSBob2xkIElEIGlzIHNob3duLlwiXHJcbiAgICAgICAgICAgICAgICAgICAgICA6IGhhc0NvbmZWYWx1ZShib29raW5nPy5haXJsaW5lX3BucikgfHxcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAoQXJyYXkuaXNBcnJheShib29raW5nPy50aWNrZXRfbnVtYmVycykgJiYgYm9va2luZy50aWNrZXRfbnVtYmVycy5sZW5ndGgpXHJcbiAgICAgICAgICAgICAgICAgICAgICAgID8gXCJZb3VyIHBheW1lbnQgc3VjY2VlZGVkIGFuZCB0aGUgdGlja2V0IHdhcyBpc3N1ZWQgZnJvbSB0aGUgbGl2ZSBib29raW5nIHJlc3BvbnNlLlwiXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIDogXCJQYXltZW50IHN0ZXAgZmluaXNoZWQuIFN0YXR1cyBiZWxvdyByZWZsZWN0cyB3aGF0IExpdGVBUEkgcmV0dXJuZWQg4oCUIG5vIHRpY2tldCBudW1iZXJzIGFyZSBpbnZlbnRlZC5cIn1cclxuICAgICAgICAgICAgICAgICAgPC9wPlxyXG4gICAgICAgICAgICAgICAgPC9kaXY+XHJcbiAgICAgICAgICAgICAgPC9kaXY+XHJcblxyXG4gICAgICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPXtzdHlsZXMuY29uZmlybUdyaWR9PlxyXG4gICAgICAgICAgICAgICAge2hhc0NvbmZWYWx1ZShib29raW5nPy5ib29raW5nX2lkKSA/IChcclxuICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzc05hbWU9e3N0eWxlcy5jb25maXJtRmllbGR9PlxyXG4gICAgICAgICAgICAgICAgICAgIDxzcGFuPkJvb2tpbmcgSUQ8L3NwYW4+XHJcbiAgICAgICAgICAgICAgICAgICAgPHN0cm9uZz5cclxuICAgICAgICAgICAgICAgICAgICAgIDxjb2RlPntib29raW5nLmJvb2tpbmdfaWR9PC9jb2RlPlxyXG4gICAgICAgICAgICAgICAgICAgIDwvc3Ryb25nPlxyXG4gICAgICAgICAgICAgICAgICA8L2Rpdj5cclxuICAgICAgICAgICAgICAgICkgOiBudWxsfVxyXG4gICAgICAgICAgICAgICAge2hhc0NvbmZWYWx1ZShib29raW5nPy5wcmVib29rX2lkKSA/IChcclxuICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzc05hbWU9e3N0eWxlcy5jb25maXJtRmllbGR9PlxyXG4gICAgICAgICAgICAgICAgICAgIDxzcGFuPkhvbGQgSUQ8L3NwYW4+XHJcbiAgICAgICAgICAgICAgICAgICAgPHN0cm9uZz5cclxuICAgICAgICAgICAgICAgICAgICAgIDxjb2RlPntib29raW5nLnByZWJvb2tfaWR9PC9jb2RlPlxyXG4gICAgICAgICAgICAgICAgICAgIDwvc3Ryb25nPlxyXG4gICAgICAgICAgICAgICAgICA8L2Rpdj5cclxuICAgICAgICAgICAgICAgICkgOiBudWxsfVxyXG4gICAgICAgICAgICAgICAge2hhc0NvbmZWYWx1ZShib29raW5nPy5ob25lc3Rfc3RhdHVzKSA/IChcclxuICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzc05hbWU9e3N0eWxlcy5jb25maXJtRmllbGR9PlxyXG4gICAgICAgICAgICAgICAgICAgIDxzcGFuPlN0YXR1czwvc3Bhbj5cclxuICAgICAgICAgICAgICAgICAgICA8c3Ryb25nPntib29raW5nLmhvbmVzdF9zdGF0dXN9PC9zdHJvbmc+XHJcbiAgICAgICAgICAgICAgICAgIDwvZGl2PlxyXG4gICAgICAgICAgICAgICAgKSA6IGhhc0NvbmZWYWx1ZShib29raW5nPy5zdGF0dXMpID8gKFxyXG4gICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT17c3R5bGVzLmNvbmZpcm1GaWVsZH0+XHJcbiAgICAgICAgICAgICAgICAgICAgPHNwYW4+U3RhdHVzPC9zcGFuPlxyXG4gICAgICAgICAgICAgICAgICAgIDxzdHJvbmc+e2Jvb2tpbmcuc3RhdHVzfTwvc3Ryb25nPlxyXG4gICAgICAgICAgICAgICAgICA8L2Rpdj5cclxuICAgICAgICAgICAgICAgICkgOiBudWxsfVxyXG4gICAgICAgICAgICAgICAge2hhc0NvbmZWYWx1ZShib29raW5nPy5wYXltZW50X3N0YXR1cykgPyAoXHJcbiAgICAgICAgICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPXtzdHlsZXMuY29uZmlybUZpZWxkfT5cclxuICAgICAgICAgICAgICAgICAgICA8c3Bhbj5QYXltZW50PC9zcGFuPlxyXG4gICAgICAgICAgICAgICAgICAgIDxzdHJvbmc+e2Jvb2tpbmcucGF5bWVudF9zdGF0dXN9PC9zdHJvbmc+XHJcbiAgICAgICAgICAgICAgICAgIDwvZGl2PlxyXG4gICAgICAgICAgICAgICAgKSA6IG51bGx9XHJcbiAgICAgICAgICAgICAgICB7aGFzQ29uZlZhbHVlKGJvb2tpbmc/LmJvb2tpbmdfcmVmKSA/IChcclxuICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzc05hbWU9e3N0eWxlcy5jb25maXJtRmllbGR9PlxyXG4gICAgICAgICAgICAgICAgICAgIDxzcGFuPkJvb2tpbmcgcmVmZXJlbmNlPC9zcGFuPlxyXG4gICAgICAgICAgICAgICAgICAgIDxzdHJvbmc+XHJcbiAgICAgICAgICAgICAgICAgICAgICA8Y29kZT57Ym9va2luZy5ib29raW5nX3JlZn08L2NvZGU+XHJcbiAgICAgICAgICAgICAgICAgICAgPC9zdHJvbmc+XHJcbiAgICAgICAgICAgICAgICAgIDwvZGl2PlxyXG4gICAgICAgICAgICAgICAgKSA6IG51bGx9XHJcbiAgICAgICAgICAgICAgICB7aGFzQ29uZlZhbHVlKGJvb2tpbmc/LmFpcmxpbmVfcG5yKSA/IChcclxuICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzc05hbWU9e3N0eWxlcy5jb25maXJtRmllbGR9PlxyXG4gICAgICAgICAgICAgICAgICAgIDxzcGFuPkFpcmxpbmUgUE5SPC9zcGFuPlxyXG4gICAgICAgICAgICAgICAgICAgIDxzdHJvbmc+XHJcbiAgICAgICAgICAgICAgICAgICAgICA8Y29kZT57Ym9va2luZy5haXJsaW5lX3Bucn08L2NvZGU+XHJcbiAgICAgICAgICAgICAgICAgICAgPC9zdHJvbmc+XHJcbiAgICAgICAgICAgICAgICAgIDwvZGl2PlxyXG4gICAgICAgICAgICAgICAgKSA6IG51bGx9XHJcbiAgICAgICAgICAgICAgICB7Y29uZlBhaWRMYWJlbCA/IChcclxuICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzc05hbWU9e3N0eWxlcy5jb25maXJtRmllbGR9PlxyXG4gICAgICAgICAgICAgICAgICAgIDxzcGFuPlRvdGFsIHBhaWQ8L3NwYW4+XHJcbiAgICAgICAgICAgICAgICAgICAgPHN0cm9uZz57Y29uZlBhaWRMYWJlbH08L3N0cm9uZz5cclxuICAgICAgICAgICAgICAgICAgPC9kaXY+XHJcbiAgICAgICAgICAgICAgICApIDogbnVsbH1cclxuICAgICAgICAgICAgICA8L2Rpdj5cclxuXHJcbiAgICAgICAgICAgICAge2NvbmZMb2NhdG9ycy5sZW5ndGggPiAwID8gKFxyXG4gICAgICAgICAgICAgICAgPGRpdiBjbGFzc05hbWU9e3N0eWxlcy5jb25maXJtU2VjdGlvbn0+XHJcbiAgICAgICAgICAgICAgICAgIDxoND5BaXJsaW5lIGxvY2F0b3JzPC9oND5cclxuICAgICAgICAgICAgICAgICAgPHVsPlxyXG4gICAgICAgICAgICAgICAgICAgIHtjb25mTG9jYXRvcnMubWFwKChsb2MsIGlkeCkgPT4gKFxyXG4gICAgICAgICAgICAgICAgICAgICAgPGxpIGtleT17YGxvYy0ke2lkeH1gfT5cclxuICAgICAgICAgICAgICAgICAgICAgICAge1tsb2MuYWlybGluZV9jb2RlIHx8IGxvYy5haXJsaW5lX25hbWUsIGxvYy5haXJsaW5lX3Bucl1cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAuZmlsdGVyKEJvb2xlYW4pXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgLmpvaW4oXCIgwrcgXCIpfVxyXG4gICAgICAgICAgICAgICAgICAgICAgPC9saT5cclxuICAgICAgICAgICAgICAgICAgICApKX1cclxuICAgICAgICAgICAgICAgICAgPC91bD5cclxuICAgICAgICAgICAgICAgIDwvZGl2PlxyXG4gICAgICAgICAgICAgICkgOiBudWxsfVxyXG5cclxuICAgICAgICAgICAgICB7Y29uZlRpY2tldHMubGVuZ3RoID4gMCB8fFxyXG4gICAgICAgICAgICAgIGhhc0NvbmZWYWx1ZShjb25mVGlja2V0RGF0YS5jb25maXJtYXRpb25faWQpIHx8XHJcbiAgICAgICAgICAgICAgaGFzQ29uZlZhbHVlKGNvbmZUaWNrZXREYXRhLnRpY2tldGVkX2F0KSA/IChcclxuICAgICAgICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPXtzdHlsZXMuY29uZmlybVNlY3Rpb259PlxyXG4gICAgICAgICAgICAgICAgICA8aDQ+VGlja2V0czwvaDQ+XHJcbiAgICAgICAgICAgICAgICAgIDx1bD5cclxuICAgICAgICAgICAgICAgICAgICB7Y29uZlRpY2tldHMubWFwKCh0KSA9PiAoXHJcbiAgICAgICAgICAgICAgICAgICAgICA8bGkga2V5PXt0fT5cclxuICAgICAgICAgICAgICAgICAgICAgICAgVGlja2V0IG51bWJlcjogPGNvZGU+e3R9PC9jb2RlPlxyXG4gICAgICAgICAgICAgICAgICAgICAgPC9saT5cclxuICAgICAgICAgICAgICAgICAgICApKX1cclxuICAgICAgICAgICAgICAgICAgICB7aGFzQ29uZlZhbHVlKGNvbmZUaWNrZXREYXRhLmNvbmZpcm1hdGlvbl9pZCkgPyAoXHJcbiAgICAgICAgICAgICAgICAgICAgICA8bGk+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIENvbmZpcm1hdGlvbiBJRDogPGNvZGU+e2NvbmZUaWNrZXREYXRhLmNvbmZpcm1hdGlvbl9pZH08L2NvZGU+XHJcbiAgICAgICAgICAgICAgICAgICAgICA8L2xpPlxyXG4gICAgICAgICAgICAgICAgICAgICkgOiBudWxsfVxyXG4gICAgICAgICAgICAgICAgICAgIHtoYXNDb25mVmFsdWUoY29uZlRpY2tldERhdGEudGlja2V0ZWRfYXQpID8gKFxyXG4gICAgICAgICAgICAgICAgICAgICAgPGxpPlRpY2tldGVkIGF0OiB7Y29uZlRpY2tldERhdGEudGlja2V0ZWRfYXR9PC9saT5cclxuICAgICAgICAgICAgICAgICAgICApIDogbnVsbH1cclxuICAgICAgICAgICAgICAgICAgPC91bD5cclxuICAgICAgICAgICAgICAgIDwvZGl2PlxyXG4gICAgICAgICAgICAgICkgOiBudWxsfVxyXG5cclxuICAgICAgICAgICAgICB7aGFzQ29uZlZhbHVlKGJvb2tpbmc/LmV0aWNrZXRfdXJsKSA/IChcclxuICAgICAgICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPXtzdHlsZXMuY29uZmlybVNlY3Rpb259PlxyXG4gICAgICAgICAgICAgICAgICA8aDQ+RS10aWNrZXQ8L2g0PlxyXG4gICAgICAgICAgICAgICAgICA8YVxyXG4gICAgICAgICAgICAgICAgICAgIGNsYXNzTmFtZT17c3R5bGVzLmV0aWNrZXRMaW5rfVxyXG4gICAgICAgICAgICAgICAgICAgIGhyZWY9e2Jvb2tpbmcuZXRpY2tldF91cmx9XHJcbiAgICAgICAgICAgICAgICAgICAgdGFyZ2V0PVwiX2JsYW5rXCJcclxuICAgICAgICAgICAgICAgICAgICByZWw9XCJub29wZW5lciBub3JlZmVycmVyXCJcclxuICAgICAgICAgICAgICAgICAgPlxyXG4gICAgICAgICAgICAgICAgICAgIE9wZW4gZS10aWNrZXQgPEV4dGVybmFsTGluayBzaXplPXsxNH0gYXJpYS1oaWRkZW4gLz5cclxuICAgICAgICAgICAgICAgICAgPC9hPlxyXG4gICAgICAgICAgICAgICAgPC9kaXY+XHJcbiAgICAgICAgICAgICAgKSA6IG51bGx9XHJcblxyXG4gICAgICAgICAgICAgIHtjb25mUGFzc2VuZ2Vycy5sZW5ndGggPiAwID8gKFxyXG4gICAgICAgICAgICAgICAgPGRpdiBjbGFzc05hbWU9e3N0eWxlcy5jb25maXJtU2VjdGlvbn0+XHJcbiAgICAgICAgICAgICAgICAgIDxoND5QYXNzZW5nZXJzPC9oND5cclxuICAgICAgICAgICAgICAgICAgPHVsPlxyXG4gICAgICAgICAgICAgICAgICAgIHtjb25mUGFzc2VuZ2Vycy5tYXAoKHAsIGlkeCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgICAgY29uc3QgbmFtZSA9IHBhc3NlbmdlckRpc3BsYXlOYW1lKHApO1xyXG4gICAgICAgICAgICAgICAgICAgICAgY29uc3QgZXh0cmFzID0gW1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBwLmRhdGVfb2ZfYmlydGggfHwgcC5kb2JcclxuICAgICAgICAgICAgICAgICAgICAgICAgICA/IGZvcm1hdERvYkRpc3BsYXkocC5kYXRlX29mX2JpcnRoIHx8IHAuZG9iKVxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgIDogbnVsbCxcclxuICAgICAgICAgICAgICAgICAgICAgICAgcC50aWNrZXRfbnVtYmVyID8gYFRpY2tldCAke3AudGlja2V0X251bWJlcn1gIDogbnVsbCxcclxuICAgICAgICAgICAgICAgICAgICAgIF0uZmlsdGVyKGhhc0NvbmZWYWx1ZSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gKFxyXG4gICAgICAgICAgICAgICAgICAgICAgICA8bGkga2V5PXtgcGF4LSR7aWR4fWB9PlxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgIHtuYW1lIHx8IGBQYXNzZW5nZXIgJHtpZHggKyAxfWB9XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAge2V4dHJhcy5sZW5ndGggPyAoXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8c3BhbiBjbGFzc05hbWU9e3N0eWxlcy5tdXRlZH0+IMK3IHtleHRyYXMuam9pbihcIiDCtyBcIil9PC9zcGFuPlxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICkgOiBudWxsfVxyXG4gICAgICAgICAgICAgICAgICAgICAgICA8L2xpPlxyXG4gICAgICAgICAgICAgICAgICAgICAgKTtcclxuICAgICAgICAgICAgICAgICAgICB9KX1cclxuICAgICAgICAgICAgICAgICAgPC91bD5cclxuICAgICAgICAgICAgICAgIDwvZGl2PlxyXG4gICAgICAgICAgICAgICkgOiBudWxsfVxyXG5cclxuICAgICAgICAgICAgICB7Y29uZlNlZ21lbnRzLmxlbmd0aCA+IDAgPyAoXHJcbiAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT17c3R5bGVzLmNvbmZpcm1TZWN0aW9ufT5cclxuICAgICAgICAgICAgICAgICAgPGg0PkZsaWdodCBzZWdtZW50czwvaDQ+XHJcbiAgICAgICAgICAgICAgICAgIDx1bCBjbGFzc05hbWU9e3N0eWxlcy5zZWdtZW50TGlzdH0+XHJcbiAgICAgICAgICAgICAgICAgICAge2NvbmZTZWdtZW50cy5tYXAoKHNlZywgaWR4KSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgICBjb25zdCBzID0gc2VnbWVudERpc3BsYXkoc2VnKTtcclxuICAgICAgICAgICAgICAgICAgICAgIGlmICghcykgcmV0dXJuIG51bGw7XHJcbiAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gKFxyXG4gICAgICAgICAgICAgICAgICAgICAgICA8bGkga2V5PXtgc2VnLSR7aWR4fWB9PlxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgIDxzdHJvbmc+e3Mucm91dGUgfHwgYFNlZ21lbnQgJHtpZHggKyAxfWB9PC9zdHJvbmc+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAge3MuZmxpZ2h0ID8gPHNwYW4+e3MuZmxpZ2h0fTwvc3Bhbj4gOiBudWxsfVxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgIHtzLmRlcCB8fCBzLmFyciA/IChcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDxzcGFuIGNsYXNzTmFtZT17c3R5bGVzLm11dGVkfT5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAge1tzLmRlcCwgcy5hcnJdLmZpbHRlcihCb29sZWFuKS5qb2luKFwiIOKGkiBcIil9XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA8L3NwYW4+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgKSA6IG51bGx9XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIDwvbGk+XHJcbiAgICAgICAgICAgICAgICAgICAgICApO1xyXG4gICAgICAgICAgICAgICAgICAgIH0pfVxyXG4gICAgICAgICAgICAgICAgICA8L3VsPlxyXG4gICAgICAgICAgICAgICAgPC9kaXY+XHJcbiAgICAgICAgICAgICAgKSA6IG51bGx9XHJcblxyXG4gICAgICAgICAgICAgIHtwZGZFcnJvciA/IChcclxuICAgICAgICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPXtgJHtzdHlsZXMuYmFubmVyfSAke3N0eWxlcy5iYW5uZXJFcnJvcn1gfT57cGRmRXJyb3J9PC9kaXY+XHJcbiAgICAgICAgICAgICAgKSA6IG51bGx9XHJcbiAgICAgICAgICAgIDwvZGl2PlxyXG4gICAgICAgICAgKX1cclxuICAgICAgICA8L2Rpdj5cclxuXHJcbiAgICAgICAgPGZvb3RlciBjbGFzc05hbWU9e3N0eWxlcy5mb290ZXJ9PlxyXG4gICAgICAgICAge3N0ZXAgPT09IFwiZm9ybVwiID8gKFxyXG4gICAgICAgICAgICA8YnV0dG9uXHJcbiAgICAgICAgICAgICAgdHlwZT1cImJ1dHRvblwiXHJcbiAgICAgICAgICAgICAgY2xhc3NOYW1lPXtzdHlsZXMuYnRuUHJpbWFyeX1cclxuICAgICAgICAgICAgICBkaXNhYmxlZD17c3VibWl0dGluZ31cclxuICAgICAgICAgICAgICBvbkNsaWNrPXtnb1RvUmV2aWV3fVxyXG4gICAgICAgICAgICA+XHJcbiAgICAgICAgICAgICAgQ29udGludWVcclxuICAgICAgICAgICAgPC9idXR0b24+XHJcbiAgICAgICAgICApIDogbnVsbH1cclxuICAgICAgICAgIHtzdGVwID09PSBcInJldmlld1wiID8gKFxyXG4gICAgICAgICAgICA8YnV0dG9uXHJcbiAgICAgICAgICAgICAgdHlwZT1cImJ1dHRvblwiXHJcbiAgICAgICAgICAgICAgY2xhc3NOYW1lPXtzdHlsZXMuYnRuUHJpbWFyeX1cclxuICAgICAgICAgICAgICBkaXNhYmxlZD17c3VibWl0dGluZ31cclxuICAgICAgICAgICAgICBvbkNsaWNrPXtnb1RvUGF5bWVudH1cclxuICAgICAgICAgICAgPlxyXG4gICAgICAgICAgICAgIHtzdWJtaXR0aW5nID8gXCJXb3JraW5n4oCmXCIgOiBcIkNvbnRpbnVlICYgUHJvY2VlZCB0byBQYXltZW50XCJ9XHJcbiAgICAgICAgICAgIDwvYnV0dG9uPlxyXG4gICAgICAgICAgKSA6IG51bGx9XHJcbiAgICAgICAgICB7c3RlcCA9PT0gXCJwYXltZW50XCIgPyAoXHJcbiAgICAgICAgICAgIDxkaXYgY2xhc3NOYW1lPXtzdHlsZXMucGF5Rm9vdGVyfT5cclxuICAgICAgICAgICAgICB7YXBpRXJyb3IgPyAoXHJcbiAgICAgICAgICAgICAgICA8ZGl2IGlkPVwiYnAtcGF5LWVycm9yXCIgY2xhc3NOYW1lPXtgJHtzdHlsZXMuYmFubmVyfSAke3N0eWxlcy5iYW5uZXJFcnJvcn1gfT5cclxuICAgICAgICAgICAgICAgICAge2FwaUVycm9yfVxyXG4gICAgICAgICAgICAgICAgPC9kaXY+XHJcbiAgICAgICAgICAgICAgKSA6IG51bGx9XHJcbiAgICAgICAgICAgICAgPGJ1dHRvblxyXG4gICAgICAgICAgICAgICAgdHlwZT1cImJ1dHRvblwiXHJcbiAgICAgICAgICAgICAgICBjbGFzc05hbWU9e3N0eWxlcy5idG5QcmltYXJ5fVxyXG4gICAgICAgICAgICAgICAgZGlzYWJsZWQ9e3N1Ym1pdHRpbmd9XHJcbiAgICAgICAgICAgICAgICBvbkNsaWNrPXtoYW5kbGVQYXlBbmRDb21wbGV0ZX1cclxuICAgICAgICAgICAgICA+XHJcbiAgICAgICAgICAgICAgICB7c3VibWl0dGluZyA/IFwiUHJvY2Vzc2luZ+KAplwiIDogYFBheSBTZWN1cmVseSAke3ByaWNlTGFiZWx9YH1cclxuICAgICAgICAgICAgICA8L2J1dHRvbj5cclxuICAgICAgICAgICAgPC9kaXY+XHJcbiAgICAgICAgICApIDogbnVsbH1cclxuICAgICAgICAgIHtzdGVwID09PSBcImNvbmZpcm1hdGlvblwiID8gKFxyXG4gICAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT17c3R5bGVzLmNvbmZpcm1BY3Rpb25zfT5cclxuICAgICAgICAgICAgICA8YnV0dG9uXHJcbiAgICAgICAgICAgICAgICB0eXBlPVwiYnV0dG9uXCJcclxuICAgICAgICAgICAgICAgIGNsYXNzTmFtZT17c3R5bGVzLmJ0blNlY29uZGFyeX1cclxuICAgICAgICAgICAgICAgIG9uQ2xpY2s9e2hhbmRsZURvd25sb2FkUGRmfVxyXG4gICAgICAgICAgICAgICAgZGlzYWJsZWQ9eyFib29raW5nfVxyXG4gICAgICAgICAgICAgID5cclxuICAgICAgICAgICAgICAgIDxEb3dubG9hZCBzaXplPXsxNn0gYXJpYS1oaWRkZW4gLz5cclxuICAgICAgICAgICAgICAgIERvd25sb2FkIGFzIFBERlxyXG4gICAgICAgICAgICAgIDwvYnV0dG9uPlxyXG4gICAgICAgICAgICAgIDxidXR0b25cclxuICAgICAgICAgICAgICAgIHR5cGU9XCJidXR0b25cIlxyXG4gICAgICAgICAgICAgICAgY2xhc3NOYW1lPXtzdHlsZXMuYnRuUHJpbWFyeX1cclxuICAgICAgICAgICAgICAgIG9uQ2xpY2s9eygpID0+IHtcclxuICAgICAgICAgICAgICAgICAgb25TdWNjZXNzPy4oYm9va2luZyk7XHJcbiAgICAgICAgICAgICAgICAgIG9uQ2xvc2U/LigpO1xyXG4gICAgICAgICAgICAgICAgfX1cclxuICAgICAgICAgICAgICA+XHJcbiAgICAgICAgICAgICAgICBEb25lXHJcbiAgICAgICAgICAgICAgPC9idXR0b24+XHJcbiAgICAgICAgICAgIDwvZGl2PlxyXG4gICAgICAgICAgKSA6IG51bGx9XHJcbiAgICAgICAgPC9mb290ZXI+XHJcbiAgICAgIDwvZGl2PlxyXG4gICAgPC9kaXY+XHJcbiAgKTtcclxufVxyXG4iXX0=