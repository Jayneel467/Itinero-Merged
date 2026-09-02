import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, ShieldCheck, Plane, Lock } from "lucide-react";
import { PageLayout } from "@/components/layout";
import { useCurrency } from "@/context/CurrencyContext";
import { findAirportByCode } from "@/constants/airports";
import { tripService } from "@/features/trips/tripService";
import { pickSupplierBookingId } from "@/features/trips/utils/supplierBooking";
import { flightService } from "./services/flightService";
import { registerPaymentIntent } from "@/features/booking/services/paymentService";
import {
  readLocalStripePublishableKey,
  resolveLiteApiPublishableKey,
} from "@/features/booking/services/liteApiPaymentSdk";
import { loadStripeJs } from "@/features/booking/services/loadStripeJs";
import AirlineMark from "./components/AirlineMark";
import FlightExtrasStep from "@/features/booking/components/FlightExtrasStep";
import {
  inferAirlineCode,
  canonicalizeAirlineName,
} from "./utils/airlineIdentity";
import {
  readFlightCheckout,
  saveFlightConfirmation,
  checkoutAmount,
  checkoutCurrency,
  bookingRefFromPayment,
  travelersToLitePassengers,
} from "./utils/flightCheckout";
import { readFlightSessionId } from "./utils/persistSelectedFlight";
import styles from "./FlightPaymentPage.module.css";

/** Local pk_… only - LiteAPI Payment SDK key is resolved async after hold. */
function resolveStripePublishableKey(raw) {
  return readLocalStripePublishableKey(raw);
}

function Stepper() {
  return (
    <div className={styles.stepperWrap}>
      <div className={styles.stepper}>
        <div className={`${styles.step} ${styles.stepDone}`}>
          <span className={`${styles.stepNum} ${styles.stepNumDone}`}>
            <Check size={12} strokeWidth={3} />
          </span>
          Search
        </div>
        <span className={styles.stepSep}>→</span>
        <div className={`${styles.step} ${styles.stepDone}`}>
          <span className={`${styles.stepNum} ${styles.stepNumDone}`}>
            <Check size={12} strokeWidth={3} />
          </span>
          Select flight
        </div>
        <span className={styles.stepSep}>→</span>
        <div className={`${styles.step} ${styles.stepDone}`}>
          <span className={`${styles.stepNum} ${styles.stepNumDone}`}>
            <Check size={12} strokeWidth={3} />
          </span>
          Passengers
        </div>
        <span className={styles.stepSep}>→</span>
        <div className={`${styles.step} ${styles.stepActive}`}>
          <span className={`${styles.stepNum} ${styles.stepNumActive}`}>4</span>
          Payment
        </div>
      </div>
    </div>
  );
}

export default function FlightPaymentPage() {
  const navigate = useNavigate();
  const { formatMoney } = useCurrency();
  const checkout = useMemo(() => readFlightCheckout(), []);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [paying, setPaying] = useState(false);
  const [hold, setHold] = useState(null);
  const [cardReady, setCardReady] = useState(false);
  const [holding, setHolding] = useState(false);
  const [extrasDone, setExtrasDone] = useState(false);
  const [extrasBusy, setExtrasBusy] = useState(false);

  const cardMountRef = useRef(null);
  const stripeRef = useRef(null);
  const cardRef = useRef(null);
  const holdRef = useRef(null);

  const flight = checkout?.flight || null;
  const travelers = Array.isArray(checkout?.travelers) ? checkout.travelers : [];
  const contact = checkout?.contact || {};
  const amount = checkoutAmount(flight);
  const currency = checkoutCurrency(flight, "INR");
  const stripePk = resolveStripePublishableKey(hold?.publishable_key);
  const sandboxMode =
    import.meta.env.DEV ||
    /^pk_test_/i.test(stripePk || "") ||
    /^sand_/i.test(String(import.meta.env.VITE_LITEAPI_KEY || ""));

  const allowMock = Boolean(hold?.allow_mock_payment);
  const servicesAvailable = Boolean(
    hold?.services &&
      hold.services.available !== false &&
      Array.isArray(hold.services.groups) &&
      hold.services.groups.some((g) => Array.isArray(g.options) && g.options.length > 0)
  );
  const showExtras = Boolean(hold?.prebook_id && servicesAvailable && !extrasDone);
  const sdkReady = Boolean(hold?.client_secret && stripePk && extrasDone);

  const recap = useMemo(() => {
    if (!flight) return null;
    const airlineName = canonicalizeAirlineName(
      flight.airline?.name || (typeof flight.airline === "string" ? flight.airline : ""),
      flight.airline?.code
    );
    const flightNo = flight.flightNumber || "";
    const origin = String(flight.departure?.airport || "").toUpperCase();
    const dest = String(flight.arrival?.airport || "").toUpperCase();
    const originMeta = findAirportByCode(origin);
    const destMeta = findAirportByCode(dest);
    return {
      airlineName,
      airlineCode: inferAirlineCode(airlineName, flightNo, flight.airline?.code),
      logo: flight.airline?.logo || "",
      flightNo,
      origin,
      dest,
      originCity: originMeta?.city || origin,
      destCity: destMeta?.city || dest,
      depTime: flight.departure?.time || "--:--",
      arrTime: flight.arrival?.time || "--:--",
      depDate: flight.departure?.date || "",
      duration: flight.duration || "-",
      stops: flight.stops || "-",
      cabin: flight.cabin || flight.fare_family || "Economy",
    };
  }, [flight]);

  const returnRecap = useMemo(() => {
    const ret =
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
          }
        : null);
    if (!ret) return null;
    const airlineName = canonicalizeAirlineName(
      ret.airline?.name || (typeof ret.airline === "string" ? ret.airline : ""),
      ret.airline?.code
    );
    const flightNo = ret.flightNumber || "";
    const origin = String(ret.departure?.airport || "").toUpperCase();
    const dest = String(ret.arrival?.airport || "").toUpperCase();
    const originMeta = findAirportByCode(origin);
    const destMeta = findAirportByCode(dest);
    return {
      airlineName,
      airlineCode: inferAirlineCode(airlineName, flightNo, ret.airline?.code),
      logo: ret.airline?.logo || "",
      flightNo,
      origin,
      dest,
      originCity: originMeta?.city || origin,
      destCity: destMeta?.city || dest,
      depTime: ret.departure?.time || "--:--",
      arrTime: ret.arrival?.time || "--:--",
      depDate: ret.departure?.date || "",
      duration: ret.duration || "-",
      stops: ret.stops || "-",
      cabin: ret.cabin || ret.fare_family || "Economy",
    };
  }, [flight]);

  const amountLabel = formatMoney(Number(hold?.price ?? amount) || amount, hold?.currency || currency);

  const goToConfirmation = useCallback((confirmation) => {
    const base = String(import.meta.env.BASE_URL || "/").replace(/\/?$/, "/");
    const bid =
      confirmation?.supplierBookingId ||
      confirmation?.liteapi?.booking_id ||
      confirmation?.bookingRef ||
      "";
    const qs = bid ? `?booking=${encodeURIComponent(bid)}` : "";
    window.location.assign(`${base}flights/booking-success${qs}`);
  }, []);

  const persistPaid = useCallback((confirmation) => {
    saveFlightConfirmation(confirmation);
    try {
      tripService.recordPaidFlight(confirmation);
    } catch {
      /* best-effort */
    }
  }, []);

  const issueTicket = useCallback(
    async ({ transactionId, paymentId, mockPayment = false }) => {
      const snap = readFlightCheckout() || checkout || {};
      const sessionId = snap.sessionId || readFlightSessionId();
      const h = holdRef.current || hold;
      if (!h?.prebook_id || !sessionId) {
        throw new Error("Booking session expired - go back and try again.");
      }

      const payRef = paymentId || transactionId;
      const done = await flightService.complete({
        session_id: sessionId,
        prebook_id: h.prebook_id,
        transaction_id: transactionId || h.transaction_id,
        payment_provider: mockPayment ? "credit" : "stripe",
        payment_id: paymentId || undefined,
        expected_amount: Number(h.price ?? amount) || amount,
        currency: h.currency || currency,
        contact_email: String((snap.contact || contact)?.email || "").trim(),
        mock_payment: mockPayment,
      });

      if (!done?.ok) {
        throw new Error(
          done?.error || done?.message || "Ticket could not be issued. Payment may have been captured - check your email."
        );
      }

      const lite = done.booking || done;
      const supplierId = pickSupplierBookingId(lite.booking_id, lite.id, lite.bookingId);
      const confirmation = {
        ...snap,
        flight: snap.flight || flight,
        travelers: snap.travelers || travelers,
        contact: snap.contact || contact,
        paymentId: payRef,
        transactionId: transactionId || h.transaction_id,
        bookingRef: lite.airline_pnr || lite.booking_ref || supplierId || bookingRefFromPayment(payRef),
        amount: Number(h.price ?? amount) || amount,
        currency: h.currency || currency,
        paidAt: new Date().toISOString(),
        liteapi: lite,
        supplierBookingId: supplierId,
        paymentProvider: mockPayment ? "sandbox_mock" : "stripe",
      };
      persistPaid(confirmation);
      tripService.markFlightConfirmed({
        sessionId,
        offerId: String(flight?.offerId || flight?.offer_id || flight?.id || ""),
        booking: {
          ...lite,
          payment_id: payRef,
          booking_id: supplierId || lite.booking_id,
        },
        contact: snap.contact || contact,
        passengers: snap.travelers || travelers,
      });
      return confirmation;
    },
    [amount, checkout, contact, currency, flight, hold, persistPaid, travelers]
  );

  const ensureHold = useCallback(async () => {
    if (holdRef.current?.prebook_id) {
      setHold(holdRef.current);
      return holdRef.current;
    }
    if (!flight || amount <= 0) return null;

    setHolding(true);
    setError("");
    setStatus("Holding this fare…");
    try {
      const sessionId = checkout?.sessionId || readFlightSessionId();
      const offerId = String(flight.offerId || flight.offer_id || flight.id || "");
      if (!sessionId || !offerId) {
        throw new Error("Session expired - search and select a flight again.");
      }

      const selectRes = await flightService.select({ session_id: sessionId, offer_id: offerId });
      if (selectRes?.ok === false) {
        throw new Error(selectRes.error || "This fare is no longer available.");
      }

      const pax = travelersToLitePassengers(travelers);
      const lead = travelers[0] || {};
      const prebookRes = await flightService.prebook({
        session_id: sessionId,
        passengers: pax,
        contact: {
          first_name: String(lead.firstName || "").trim(),
          last_name: String(lead.lastName || "").trim(),
          email: String(contact.email || "").trim(),
          phone_country_code: String(contact.phone_country_code || contact.phoneCc || "91").replace(
            /^\+/,
            ""
          ),
          phone_number: String(contact.phone || "").replace(/\D/g, ""),
        },
      });

      if (!prebookRes?.ok || !prebookRes?.prebook?.prebook_id) {
        throw new Error(
          prebookRes?.message || prebookRes?.error || "Could not hold this fare."
        );
      }

      const pb = prebookRes.prebook;
      if (pb.client_secret) {
        try {
          pb.publishable_key = await resolveLiteApiPublishableKey(pb);
        } catch (err) {
          throw new Error(
            err?.message ||
              "Could not load the card key for this hold."
          );
        }
      }
      holdRef.current = pb;
      setHold(pb);

      tripService.markFlightHeld({
        sessionId,
        offerId,
        prebookId: pb.prebook_id,
        price: Number(pb.price ?? amount) || amount,
        currency: pb.currency || currency,
      });

      const routeLabel = recap ? `${recap.origin} → ${recap.dest}` : "";
      await registerPaymentIntent({
        prebook_id: pb.prebook_id,
        kind: "flight",
        session_id: sessionId,
        amount: Number(pb.price ?? amount) || amount,
        currency: pb.currency || currency,
        email: String(contact.email || "").trim(),
        payload: {
          session_context: selectRes?.session_context || prebookRes?.session_context,
          contact: {
            email: contact.email,
            first_name: String(lead.firstName || "").trim(),
            last_name: String(lead.lastName || "").trim(),
          },
          route: routeLabel,
        },
      });

      setStatus("");
      const hasExtras =
        pb?.services &&
        pb.services.available !== false &&
        Array.isArray(pb.services.groups) &&
        pb.services.groups.some((g) => Array.isArray(g.options) && g.options.length > 0);
      setExtrasDone(!hasExtras);
      return pb;
    } finally {
      setHolding(false);
    }
  }, [amount, checkout?.sessionId, contact, currency, flight, recap, travelers]);

  useEffect(() => {
    ensureHold().catch((err) => {
      setError(err?.message || "Could not prepare payment.");
      setStatus("");
    });
  }, [ensureHold]);

  async function finishExtras(selections) {
    const list = Array.isArray(selections) ? selections : [];
    const sessionId = checkout?.sessionId || readFlightSessionId();
    if (!hold?.prebook_id || !sessionId) {
      setError("Booking hold expired. Go back and create the hold again.");
      return;
    }
    if (!list.length) {
      setExtrasDone(true);
      return;
    }

    // Filter only real LiteAPI external ancillary service IDs to send to backend API
    const liteapiServices = list.filter(
      (item) => item?.service_id && !String(item.service_id).startsWith("seat_")
    );

    if (!liteapiServices.length) {
      const next = {
        ...hold,
        selected_services: list,
      };
      holdRef.current = next;
      setHold(next);
      setExtrasDone(true);
      return;
    }

    setExtrasBusy(true);
    setError("");
    setStatus("Adding seats / bags to your hold…");
    try {
      const res = await flightService.attachServices({
        session_id: sessionId,
        prebook_id: hold.prebook_id,
        selected_services: liteapiServices,
      });
      if (!res?.ok && !res?.skipped) {
        throw new Error(res?.error || res?.message || "Could not add those extras.");
      }
      const next = {
        ...hold,
        ...(res.prebook || {}),
        selected_services: list,
        allow_mock_payment:
          res?.prebook?.allow_mock_payment === true ||
          res?.payment_ready === true ||
          hold.allow_mock_payment,
        payment_mode:
          res?.prebook?.payment_mode ||
          (res?.prebook?.client_secret ? "stripe" : hold.payment_mode),
      };
      holdRef.current = next;
      setHold(next);
      setExtrasDone(true);
      setStatus("");
    } catch (err) {
      const next = {
        ...hold,
        selected_services: list,
      };
      holdRef.current = next;
      setHold(next);
      setExtrasDone(true);
      setStatus("");
    } finally {
      setExtrasBusy(false);
    }
  }

  useEffect(() => {
    if (!extrasDone || !sdkReady || !cardMountRef.current || cardRef.current) return undefined;

    let cancelled = false;
    (async () => {
      try {
        await loadStripeJs();
      } catch (err) {
        if (!cancelled) {
          setError(
            err?.message ||
              "Stripe.js could not load. Allow js.stripe.com (ad blocker), then refresh."
          );
        }
        return;
      }
      if (cancelled) return;
      let pk = null;
      const localEnvKey = String(import.meta.env?.VITE_STRIPE_PUBLISHABLE_KEY || "").trim();
      const hasPk = hold?.publishable_key && String(hold?.publishable_key).trim().startsWith("pk_");
      const isLocalKey = hasPk && String(hold?.publishable_key).trim() === localEnvKey;

      if (hasPk && !isLocalKey) {
        pk = hold?.publishable_key;
      } else if (hold?.client_secret) {
        pk = await resolveLiteApiPublishableKey({
          publishable_key: hold?.publishable_key,
          sdk_public_key: hold?.sdk_public_key,
        });
      } else {
        pk = resolveStripePublishableKey(hold?.publishable_key);
      }
      
      if (!pk || !window.Stripe) {
        setError("Card checkout could not start. Refresh and try again.");
        return;
      }
      const stripe = window.Stripe(pk);
      const elements = stripe.elements();
      const card = elements.create("card", {
        style: {
          base: {
            fontSize: "16px",
            color: "#101828",
            "::placeholder": { color: "#98a2b3" },
          },
        },
      });
      card.mount(cardMountRef.current);
      stripeRef.current = stripe;
      cardRef.current = card;
      if (!cancelled) setCardReady(true);
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
      stripeRef.current = null;
      setCardReady(false);
    };
  }, [hold?.publishable_key, hold?.client_secret, sdkReady]);

  async function handleStripePay() {
    setError("");
    if (!sdkReady || !stripeRef.current || !cardRef.current) {
      setError("Card form is not ready yet. Wait a moment and try again.");
      return;
    }
    setPaying(true);
    setStatus("Processing card payment…");
    try {
      const secret = hold?.client_secret;
      const result = await stripeRef.current.confirmCardPayment(secret, {
        payment_method: { card: cardRef.current },
      });
      if (result.error) {
        throw new Error(result.error.message || "Card payment failed.");
      }
      const pi = result.paymentIntent;
      if (!pi || !["succeeded", "processing"].includes(pi.status)) {
        throw new Error(`Unexpected payment status: ${pi?.status || "unknown"}`);
      }

      setStatus("Payment confirmed - issuing ticket…");
      const confirmation = await issueTicket({ transactionId: hold.transaction_id });
      setStatus("Ticket issued - check your email.");
      goToConfirmation(confirmation);
    } catch (err) {
      setError(err?.message || "Payment did not complete.");
      setStatus("");
      setPaying(false);
    }
  }

  async function handleMockPay() {
    setError("");
    setPaying(true);
    setStatus("Issuing sandbox test ticket…");
    try {
      const confirmation = await issueTicket({ mockPayment: true, transactionId: hold?.transaction_id });
      setStatus("Test ticket issued.");
      goToConfirmation(confirmation);
    } catch (err) {
      setError(err?.message || "Sandbox ticket failed.");
      setStatus("");
      setPaying(false);
    }
  }

  if (!flight) {
    return (
      <PageLayout>
        <div className={styles.page}>
          <Stepper />
          <div className={styles.empty}>
            <p>No booking to pay for. Fill passenger details first.</p>
            <button type="button" onClick={() => navigate("/flights/passenger-info")}>
              Back to passenger details
            </button>
          </div>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout>
      <div className={styles.page}>
        <Stepper />
        <div className={styles.layout}>
          <div>
            <button type="button" className={styles.back} onClick={() => navigate("/flights/passenger-info")}>
              ← Back to passenger details
            </button>
            <h1 className={styles.title}>Review & pay</h1>
            <p className={styles.subtitle}>
              Pay securely by card. Your e-ticket is emailed after the airline confirms.
            </p>

            {error ? <div className={styles.error}>{error}</div> : null}
            {status ? <div className={styles.status}>{status}</div> : null}
            {holding ? <div className={styles.status}>Reserving fare with airline…</div> : null}

            <div className={styles.card}>
              <h2 className={styles.cardTitle}>
                {returnRecap ? "Round-trip Itinerary" : "Flight"}
              </h2>
              {recap ? (
                <div>
                  {returnRecap && (
                    <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--color-primary, #F97211)", marginBottom: "8px" }}>
                      1. Departing Flight · {recap.origin} → {recap.dest}
                    </div>
                  )}
                  <div className={styles.flightRow}>
                    <AirlineMark
                      name={recap.airlineName}
                      code={recap.airlineCode}
                      logo={recap.logo}
                      flightNumber={recap.flightNo}
                      size={52}
                    />
                    <div className={styles.flightMeta}>
                      <div className={styles.airline}>{recap.airlineName}</div>
                      <div className={styles.flightNo}>
                        {recap.flightNo || recap.airlineCode} · {recap.cabin}
                        {recap.depDate ? ` · ${recap.depDate}` : ""}
                      </div>
                    </div>
                  </div>
                  <div className={styles.route}>
                    <div>
                      <div className={styles.time}>{recap.depTime}</div>
                      <div className={styles.iata}>{recap.origin}</div>
                      <div className={styles.city}>{recap.originCity}</div>
                    </div>
                    <div className={styles.mid}>
                      <Plane size={14} color="var(--color-primary, #F97211)" />
                      <div>{recap.duration}</div>
                      <div>{recap.stops}</div>
                    </div>
                    <div className={styles.arrCol}>
                      <div className={styles.time}>{recap.arrTime}</div>
                      <div className={styles.iata}>{recap.dest}</div>
                      <div className={styles.city}>{recap.destCity}</div>
                    </div>
                  </div>
                </div>
              ) : null}

              {returnRecap ? (
                <div style={{ marginTop: "20px", paddingTop: "16px", borderTop: "1px dashed var(--line, #E2E8F0)" }}>
                  <div style={{ fontSize: "13px", fontWeight: 700, color: "#0284C7", marginBottom: "8px" }}>
                    2. Return Flight · {returnRecap.origin} → {returnRecap.dest}
                  </div>
                  <div className={styles.flightRow}>
                    <AirlineMark
                      name={returnRecap.airlineName}
                      code={returnRecap.airlineCode}
                      logo={returnRecap.logo}
                      flightNumber={returnRecap.flightNo}
                      size={52}
                    />
                    <div className={styles.flightMeta}>
                      <div className={styles.airline}>{returnRecap.airlineName}</div>
                      <div className={styles.flightNo}>
                        {returnRecap.flightNo || returnRecap.airlineCode} · {returnRecap.cabin}
                        {returnRecap.depDate ? ` · ${returnRecap.depDate}` : ""}
                      </div>
                    </div>
                  </div>
                  <div className={styles.route}>
                    <div>
                      <div className={styles.time}>{returnRecap.depTime}</div>
                      <div className={styles.iata}>{returnRecap.origin}</div>
                      <div className={styles.city}>{returnRecap.originCity}</div>
                    </div>
                    <div className={styles.mid}>
                      <Plane size={14} color="#0284C7" />
                      <div>{returnRecap.duration}</div>
                      <div>{returnRecap.stops}</div>
                    </div>
                    <div className={styles.arrCol}>
                      <div className={styles.time}>{returnRecap.arrTime}</div>
                      <div className={styles.iata}>{returnRecap.dest}</div>
                      <div className={styles.city}>{returnRecap.destCity}</div>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>

            <div className={styles.card}>
              <h2 className={styles.cardTitle}>Passengers</h2>
              <ul className={styles.paxList}>
                {travelers.map((t) => (
                  <li key={t.id || `${t.firstName}-${t.lastName}`} className={styles.paxItem}>
                    <span className={styles.paxName}>
                      {t.firstName} {t.lastName}
                    </span>
                    <span className={styles.paxType}>{t.type || "adult"}</span>
                  </li>
                ))}
              </ul>
            </div>

            {showExtras ? (
              <div className={styles.card}>
                <h2 className={styles.cardTitle}>Seats & bags</h2>
                <FlightExtrasStep
                  services={hold?.services || {}}
                  flight={flight}
                  isRoundTrip={isRoundTrip}
                  recap={recap}
                  returnRecap={returnRecap}
                  passengerLabels={travelers.map((t) => `${t.firstName || ""} ${t.lastName || ""}`.trim() || "Traveller")}
                  currency={hold?.currency || currency}
                  currencySym={String(hold?.currency || currency).toUpperCase() === "INR" ? "₹" : "$"}
                  basePrice={Number(hold?.price ?? amount) || amount}
                  submitting={extrasBusy}
                  onSkip={() => finishExtras([])}
                  onContinue={(sels) => finishExtras(sels)}
                />
              </div>
            ) : null}

            <div className={styles.card}>
              <h2 className={styles.cardTitle}>Ticket delivery</h2>
              <div className={styles.contactRow}>
                <span>{contact.email || "-"}</span>
                <span>
                  {contact.phone
                    ? `${
                        contact.phone_country_code || contact.phoneCc
                          ? `+${String(contact.phone_country_code || contact.phoneCc).replace(/^\+/, "")} `
                          : ""
                      }${contact.phone}`
                    : "-"}
                </span>
              </div>
              <p className={styles.hint} style={{ marginTop: 8, marginBottom: 0 }}>
                Confirmation and e-ticket PDF are sent to this email when ticketing succeeds.
              </p>
            </div>
          </div>

          <aside>
            <div className={styles.rzp}>
              <div className={styles.rzpHead}>
                {sandboxMode ? <span className={styles.testRibbon}>Sandbox</span> : null}
                <div className={styles.rzpBrand}>
                  <span className={styles.merchant}>Secure checkout</span>
                  <span className={styles.rzpWord}>Card</span>
                </div>
                <div className={styles.rzpAmount}>{amountLabel}</div>
                <div className={styles.rzpDesc}>
                  {recap ? `${recap.origin} → ${recap.dest}` : "Flight booking"}
                </div>
              </div>
              <div className={styles.rzpBody}>
                {showExtras ? (
                  <p className={styles.hint}>
                    Pick seats or extra bags on the left, or skip — then pay the updated total.
                  </p>
                ) : sdkReady ? (
                  <>
                    <div className={styles.methodsLabel}>Card details</div>
                    <div ref={cardMountRef} className={styles.cardElement} />
                    <p className={styles.hint}>
                      {sandboxMode ? (
                        <>
                          Sandbox test card: <code>4242 4242 4242 4242</code> · any future expiry · any CVC · any ZIP.
                        </>
                      ) : (
                        "Your card is processed securely. We never store card numbers."
                      )}
                    </p>
                  </>
                ) : allowMock ? (
                  <p className={styles.hint}>
                    Payment SDK keys were not returned - sandbox demo mode. Use the button below with test card flow
                    disabled; ticket issues on agency test credit.
                  </p>
                ) : (
                  <p className={styles.hint}>
                    Waiting for card checkout… Hold the fare again, then retry.
                  </p>
                )}

                <div className={styles.fareRows}>
                  <div>
                    <span>Live fare</span>
                    <span>{amountLabel}</span>
                  </div>
                  <div>
                    <span>Passengers</span>
                    <span>{travelers.length}</span>
                  </div>
                </div>
                <div className={styles.total}>
                  <span>Total payable</span>
                  <span>{amountLabel}</span>
                </div>

                {showExtras ? (
                  <button type="button" className={styles.payBtn} disabled>
                    Add extras, then pay
                  </button>
                ) : sdkReady ? (
                  <button
                    type="button"
                    className={styles.payBtn}
                    onClick={handleStripePay}
                    disabled={paying || holding || extrasBusy || !cardReady}
                  >
                    {paying ? status || "Working…" : `Pay ${amountLabel}`}
                  </button>
                ) : allowMock ? (
                  <button
                    type="button"
                    className={styles.payBtn}
                    onClick={handleMockPay}
                    disabled={paying || holding || !hold?.prebook_id}
                  >
                    {paying ? status || "Working…" : "Issue sandbox test ticket"}
                  </button>
                ) : (
                  <>
                    <button type="button" className={styles.payBtn} disabled>
                      Payment unavailable
                    </button>
                    <button
                      type="button"
                      className={styles.retryBtn}
                      onClick={async () => {
                        holdRef.current = null;
                        setHold(null);
                        setCardReady(false);
                        try {
                          await ensureHold();
                        } catch (err) {
                          setError(err?.message || "Could not retry fare hold.");
                          setStatus("");
                        }
                      }}
                      disabled={paying || holding}
                    >
                      {holding ? "Holding…" : "Retry fare hold"}
                    </button>
                  </>
                )}

                <div className={styles.secureRow}>
                  <ShieldCheck size={14} /> Secure checkout · PCI DSS
                  <Lock size={12} style={{ marginLeft: 6 }} />
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </PageLayout>
  );
}
