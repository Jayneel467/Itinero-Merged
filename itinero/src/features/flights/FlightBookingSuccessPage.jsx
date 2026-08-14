import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { Download, Share2, Ban, Mail } from "lucide-react";
import { PageLayout } from "@/components/layout";
import VeroPostBookingHelp from "@/components/shared/VeroPostBookingHelp";
import { useCurrency } from "@/context/CurrencyContext";
import { useVeroUi } from "@/context/VeroUiContext";
import { buildBookingSuccessPageContext } from "@/features/vero/utils/pageContext";
import { describeAirport, findAirportByCode } from "@/constants/airports";
import { downloadBookingConfirmationPdf } from "@/features/booking/utils/bookingConfirmationPdf";
import { sendBookingEmail } from "@/features/booking/services/paymentService";
import { tripService } from "@/features/trips/tripService";
import { flightService } from "./services/flightService";
import { isSupplierBookingId, pickSupplierBookingId } from "@/features/trips/utils/supplierBooking";
import {
  cancelFlightWithQuote,
  refundPatchFromResult,
  formatCancelResultMessage,
} from "@/features/trips/utils/cancelFlow";
import { likelyTerminal } from "@/features/vero/utils/airlineFacts";
import AirlineMark from "./components/AirlineMark";
import {
  inferAirlineCode,
  canonicalizeAirlineName,
} from "./utils/airlineIdentity";
import {
  resolveFlightConfirmation,
  saveFlightConfirmation,
  confirmationToPdfBooking,
  formatFlightClock,
  formatFlightDate,
  pickDisplayBookingRef,
  confirmationFromFlightTrip,
} from "./utils/flightCheckout";
import { isKlookEnabled, klookHref } from "@/services/klookAffiliate";
import styles from "./FlightBookingSuccessPage.module.css";

function stopsLabel(stops) {
  if (stops == null || stops === "" || stops === "-") return "Direct";
  if (typeof stops === "number") return stops === 0 ? "Direct" : `${stops} stop${stops === 1 ? "" : "s"}`;
  const s = String(stops).toLowerCase();
  if (s === "0" || s.includes("non") || s.includes("direct")) return "Direct";
  return String(stops);
}

export default function FlightBookingSuccessPage() {
  const { state } = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { formatMoney } = useCurrency();
  const { setPageContext, clearPageContext } = useVeroUi();
  const logoSrc = `${import.meta.env.BASE_URL}itinero-logo.png`;
  const [confirmation, setConfirmation] = useState(() => resolveFlightConfirmation(state));
  const [hydrateBusy, setHydrateBusy] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfError, setPdfError] = useState("");
  const [cancelBusy, setCancelBusy] = useState(false);
  const [cancelMsg, setCancelMsg] = useState("");
  const [cancelErr, setCancelErr] = useState("");
  const [resendBusy, setResendBusy] = useState(false);
  const [resendMsg, setResendMsg] = useState("");
  const [resendErr, setResendErr] = useState("");
  const [cancelled, setCancelled] = useState(
    String(confirmation?.liteapi?.status || confirmation?.status || "").toLowerCase().includes("cancel")
  );

  useEffect(() => {
    const local = resolveFlightConfirmation(state);
    const bid = String(searchParams.get("booking") || searchParams.get("bookingId") || "").trim();
    if (local?.flight && (local.paymentId || local.bookingRef || local.supplierBookingId || local.liteapi)) {
      setConfirmation(local);
      return undefined;
    }
    const fromTrip =
      tripService
        .list()
        .map((t) => confirmationFromFlightTrip(t))
        .find((c) => {
          if (!c?.flight) return false;
          if (!bid) return Boolean(c.supplierBookingId || c.bookingRef);
          return (
            c.supplierBookingId === bid ||
            c.bookingRef === bid ||
            c.liteapi?.booking_id === bid
          );
        }) || null;
    if (fromTrip?.flight) {
      setConfirmation(fromTrip);
      saveFlightConfirmation(fromTrip);
      if (!bid) return undefined;
    }
    if (!bid) return undefined;
    let cancelledHydrate = false;
    setHydrateBusy(true);
    flightService
      .getBooking(bid, { email: local?.contact?.email || fromTrip?.contact?.email })
      .then((res) => {
        if (cancelledHydrate) return;
        const booking = res?.booking || res;
        if (!booking || res?.ok === false) return;
        const merged = {
          ...(fromTrip || local || {}),
          flight: fromTrip?.flight || local?.flight || booking.flight || booking.offer,
          paymentId: fromTrip?.paymentId || local?.paymentId || booking.payment_id,
          bookingRef:
            booking.airline_pnr ||
            booking.booking_ref ||
            fromTrip?.bookingRef ||
            bid,
          supplierBookingId: booking.booking_id || booking.id || bid,
          liteapi: booking,
          amount: Number(booking.price || fromTrip?.amount || local?.amount) || 0,
          currency: booking.currency || fromTrip?.currency || local?.currency || "INR",
          contact: fromTrip?.contact || local?.contact || {},
          travelers: fromTrip?.travelers || local?.travelers || [],
        };
        if (merged.flight) {
          setConfirmation(merged);
          saveFlightConfirmation(merged);
        }
      })
      .finally(() => {
        if (!cancelledHydrate) setHydrateBusy(false);
      });
    return () => {
      cancelledHydrate = true;
    };
  }, [state, searchParams]);

  const flight = confirmation?.flight || null;
  const travelers = Array.isArray(confirmation?.travelers) ? confirmation.travelers : [];
  const contact = confirmation?.contact || {};
  const paymentId = confirmation?.paymentId || null;
  const bookingRef = pickDisplayBookingRef(
    confirmation?.liteapi?.airline_pnr,
    confirmation?.liteapi?.booking_ref,
    confirmation?.bookingRef,
    confirmation?.supplierBookingId,
    confirmation?.liteapi?.booking_id,
    paymentId ? `ITN-${String(paymentId).replace(/^pay_/i, "").slice(-6).toUpperCase()}` : null
  );
  const supplierBookingId = pickSupplierBookingId(
    confirmation?.supplierBookingId,
    confirmation?.liteapi?.booking_id,
    confirmation?.liteapi?.id,
    confirmation?.bookingRef
  );
  const amount = Number(confirmation?.amount) || Number(flight?.price) || 0;
  const currency = confirmation?.currency || flight?.currencyCode || flight?.currency || "INR";
  const paid = Boolean(paymentId);

  useEffect(() => {
    if (!confirmation?.flight) return;
    try {
      tripService.recordPaidFlight({
        ...confirmation,
        supplierBookingId: pickSupplierBookingId(
          confirmation.supplierBookingId,
          confirmation.liteapi?.booking_id,
          confirmation.liteapi?.id,
          confirmation.bookingRef
        ),
      });
    } catch {
      /* ignore */
    }
  }, [confirmation]);

  const recap = useMemo(() => {
    if (!flight) return null;
    const airlineName = canonicalizeAirlineName(
      flight.airline?.name || (typeof flight.airline === "string" ? flight.airline : ""),
      flight.airline?.code
    );
    const flightNo = flight.flightNumber || flight.flight_number || "";
    const origin = String(flight.departure?.airport || flight.origin || "").toUpperCase();
    const dest = String(flight.arrival?.airport || flight.destination || "").toUpperCase();
    const originMeta = findAirportByCode(origin);
    const destMeta = findAirportByCode(dest);
    const originInfo = describeAirport(origin);
    const destInfo = describeAirport(dest);
    const airlineCode = inferAirlineCode(airlineName, flightNo, flight.airline?.code);
    return {
      airlineName,
      airlineCode,
      logo: flight.airline?.logo || flight.logo || "",
      flightNo,
      origin,
      dest,
      originCity: originMeta?.city || originInfo.city || origin,
      destCity: destMeta?.city || destInfo.city || dest,
      originName: originMeta?.name || originInfo.name || origin,
      destName: destMeta?.name || destInfo.name || dest,
      originInfo,
      destInfo,
      depTerm: likelyTerminal(airlineCode, origin),
      arrTerm: likelyTerminal(airlineCode, dest),
      depTime: formatFlightClock(
        flight.departure?.time || flight.departureAt || flight.departure_at
      ),
      arrTime: formatFlightClock(
        flight.arrival?.time || flight.arrivalAt || flight.arrival_at
      ),
      depDate: formatFlightDate(
        flight.departure?.date || flight.departureAt || flight.departure_at
      ),
      duration: flight.duration || "-",
      stops: stopsLabel(flight.stops),
      cabin: flight.cabin || flight.fare_family || "Economy",
    };
  }, [flight]);

  useEffect(() => {
    if (!recap) return undefined;
    setPageContext(
      buildBookingSuccessPageContext({
        airline: recap.airlineName,
        flightNumber: recap.flightNo,
        origin: recap.origin,
        destination: recap.dest,
        pnr: bookingRef,
        bookingId: supplierBookingId,
        departDate: recap.depDate,
        depTerminal: recap.depTerm,
        arrTerminal: recap.arrTerm,
        baggageCabin: flight?.baggage?.cabin || flight?.baggage_cabin || null,
        baggageChecked: flight?.baggage?.checked || flight?.baggage_checked || null,
      })
    );
    return () => clearPageContext();
  }, [recap, bookingRef, supplierBookingId, flight, setPageContext, clearPageContext]);

  if (!flight || !recap) {
    return (
      <PageLayout>
        <div className={styles.page}>
          <div className={styles.empty}>
            <p>
              {hydrateBusy
                ? "Loading your ticket…"
                : "No booking to show. Complete passenger details and card payment first - we don’t invent tickets."}
            </p>
            <button type="button" className={styles.navPrimary} onClick={() => navigate("/flights")}>
              Back to flights
            </button>
          </div>
        </div>
      </PageLayout>
    );
  }

  const amountLabel = formatMoney(amount);
  const barcodeId = String(bookingRef || paymentId || recap.flightNo || "ITINERO")
    .replace(/[^A-Z0-9]/gi, "")
    .toUpperCase();
  const issuedAt = confirmation?.paidAt || confirmation?.savedAt;
  const issuedLabel = new Date(issuedAt || Date.now()).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  async function handleSavePdf() {
    setPdfError("");
    setPdfBusy(true);
    try {
      await downloadBookingConfirmationPdf(confirmationToPdfBooking(confirmation, recap));
    } catch (err) {
      setPdfError(err?.message || "Could not generate PDF.");
    } finally {
      setPdfBusy(false);
    }
  }

  async function handleResendEmail() {
    const mail = String(contact.email || "").trim();
    if (!mail || !paymentId) {
      setResendErr("Add a contact email on passenger details to receive confirmation.");
      return;
    }
    setResendBusy(true);
    setResendErr("");
    setResendMsg("");
    try {
      const paxNames = travelers
        .map((p) => {
          const n = [p.firstName || p.first_name, p.lastName || p.last_name]
            .filter(Boolean)
            .join(" ")
            .trim();
          return n || String(p.name || "").trim();
        })
        .filter(Boolean);
      const depRaw = flight.departure?.time || flight.departureAt || flight.departure_at;
      const arrRaw = flight.arrival?.time || flight.arrivalAt || flight.arrival_at;
      const travelDate = String(
        flight.departure?.date || flight.departureAt || flight.departure_at || ""
      ).slice(0, 10);
      const res = await sendBookingEmail({
        kind: "flight",
        payment_id: paymentId,
        email: mail,
        route: recap ? `${recap.origin} → ${recap.dest}` : undefined,
        amount: amount || undefined,
        currency,
        booking_ref: bookingRef || undefined,
        pending: !isSupplierBookingId(supplierBookingId),
        airline: recap.airlineName,
        flight_number: recap.flightNo || undefined,
        depart_at: depRaw || undefined,
        arrive_at: arrRaw || undefined,
        travel_date: /^\d{4}-\d{2}-\d{2}$/.test(travelDate) ? travelDate : undefined,
        origin: recap.origin || undefined,
        destination: recap.dest || undefined,
        duration: recap.duration !== "-" ? recap.duration : undefined,
        cabin: recap.cabin,
        stops: recap.stops,
        passengers: paxNames.length ? paxNames : undefined,
        phone: contact.phone
          ? `+${contact.phone_country_code || contact.phoneCountryCode || "91"} ${contact.phone}`
          : undefined,
      });
      if (!res?.ok) throw new Error(res?.error || res?.message || "Could not send email.");
      setResendMsg(`Confirmation sent to ${mail}. Check spam if it doesn't arrive in a minute.`);
    } catch (err) {
      setResendErr(err?.message || "Could not send email.");
    } finally {
      setResendBusy(false);
    }
  }

  async function handleCancel() {
    setCancelBusy(true);
    setCancelErr("");
    setCancelMsg("");
    try {
      let res;
      const paymentProvider = confirmation?.paymentProvider || "stripe";
      if (isSupplierBookingId(supplierBookingId)) {
        res = await cancelFlightWithQuote({
          bookingId: supplierBookingId,
          paymentId,
          expectedAmount: amount || null,
          paymentProvider,
        });
      } else if (paymentId && String(paymentId).startsWith("pay_")) {
        setCancelErr(
          "This looks like a legacy payment without an airline ticket. Contact support with your booking reference for a refund."
        );
        return;
      } else {
        setCancelErr("No airline ticket id on this confirmation — we can't cancel it from here.");
        return;
      }
      if (res?.aborted) return;
      if (!res?.ok) throw new Error(res?.error || res?.message || "Cancel failed.");
      const patch = refundPatchFromResult(res);
      tripService.markFlightCancelled({
        bookingId: supplierBookingId,
        refund: patch,
      });
      // Pending airline confirm ≠ fully cancelled on Connect yet
      setCancelled(!patch.cancelPending);
      setCancelMsg(formatCancelResultMessage(res) || "Flight cancelled.");
    } catch (err) {
      setCancelErr(err?.message || "Cancel failed.");
    } finally {
      setCancelBusy(false);
    }
  }

  function handleShare() {
    const text = [
      `Itinero ${paid ? "booking" : "itinerary"} ${bookingRef || ""}`.trim(),
      `${recap.airlineName} ${recap.flightNo}`.trim(),
      `${recap.origin} → ${recap.dest}`,
      amount ? amountLabel : "",
      paymentId ? `Paid ${paymentId}` : "",
    ]
      .filter(Boolean)
      .join("\n");
    if (navigator.share) {
      navigator.share({ title: "Itinero booking", text }).catch(() => {});
      return;
    }
    navigator.clipboard?.writeText(text);
  }

  const paxLine = travelers.length
    ? travelers
        .slice(0, 2)
        .map((t, i) =>
          `${i + 1}. ${[t.firstName, t.lastName].filter(Boolean).join(" ") || "Passenger"} | ${t.type || "adult"}${
            t.dob ? ` | ${t.dob}` : ""
          }`
        )
        .join("\n")
    : "Lead passenger on file";

  return (
    <PageLayout>
      <div className={styles.page}>
        <div className={styles.sheet}>
          <div className={styles.ticket} id="itinero-eticket">
            <div className={styles.head}>
              <img src={logoSrc} alt="Itinero" className={styles.wordmark} />
              <div className={styles.headRight}>
                <p className={styles.headTitle}>CONFIRMED E-TICKET</p>
                <p className={styles.headMeta}>Passenger itinerary · Show at check-in</p>
                <p className={styles.headMeta}>Issued {issuedLabel}</p>
              </div>
            </div>

            {!paid ? (
              <div className={styles.warn}>Payment not captured yet. Save PDF still works for this itinerary.</div>
            ) : null}

            <section className={styles.airlineCard}>
              <div className={styles.airlineBlock}>
                <AirlineMark
                  name={recap.airlineName}
                  code={recap.airlineCode}
                  logo={recap.logo}
                  flightNumber={recap.flightNo}
                  size={40}
                />
                <div>
                  <div className={styles.airlineName}>{recap.airlineName}</div>
                  <div className={styles.flightNo}>
                    {[recap.flightNo || recap.airlineCode, recap.cabin, recap.stops].filter(Boolean).join(" | ")}
                  </div>
                </div>
              </div>
              <img src={logoSrc} alt="itinero" className={styles.airlineBrand} />
            </section>

            <div className={styles.refBar}>
              <div>
                <div className={styles.refLabel}>Booking reference</div>
                <div className={styles.pnr}>{bookingRef || "-"}</div>
              </div>
              <span className={`${styles.badge} ${cancelled ? styles.badgeCancelled : paid ? "" : styles.badgePending}`}>
                {cancelled ? "CANCELLED" : paid ? "PAID" : "PENDING"}
              </span>
              <div className={styles.refDate}>{recap.depDate || issuedLabel.split(",")[0]}</div>
            </div>

            <div className={styles.route}>
              <div>
                <p className={styles.kicker}>Depart</p>
                <div className={styles.time}>{recap.depTime}</div>
                <div className={styles.iata}>{recap.origin || "-"}</div>
                <div className={styles.city}>{recap.originCity}</div>
                <div className={styles.aptName}>{recap.originName}</div>
              </div>
              <div className={styles.mid}>
                <div className={styles.dur}>{recap.duration}</div>
                <div className={styles.path} aria-hidden>
                  <span className={styles.dot} />
                </div>
                <div className={styles.stops}>{recap.stops}</div>
              </div>
              <div className={styles.right}>
                <p className={styles.kicker}>Arrive</p>
                <div className={styles.time}>{recap.arrTime}</div>
                <div className={styles.iata}>{recap.dest || "-"}</div>
                <div className={styles.city}>{recap.destCity}</div>
                <div className={styles.aptName}>{recap.destName}</div>
              </div>
            </div>

            <div className={styles.grid2}>
              <div className={styles.airportCell}>
                <p className={styles.kicker}>Departure airport</p>
                <div className={styles.cellTitle}>{recap.originInfo.fullName}</div>
                <div className={styles.cellSub}>{recap.originInfo.location || recap.originCity}</div>
                {recap.originInfo.terminals || recap.depTerm ? (
                  <div className={styles.cellTerm}>
                    {recap.originInfo.terminals ? `Terminals: ${recap.originInfo.terminals}` : `Terminal ${recap.depTerm}`}
                    {recap.depTerm ? `\nUsual for this airline: ${recap.depTerm}` : ""}
                  </div>
                ) : null}
                {recap.originInfo.tip ? <p className={styles.tip}>{recap.originInfo.tip}</p> : null}
              </div>
              <div className={styles.airportCell}>
                <p className={styles.kicker}>Arrival airport</p>
                <div className={styles.cellTitle}>{recap.destInfo.fullName}</div>
                <div className={styles.cellSub}>{recap.destInfo.location || recap.destCity}</div>
                {recap.destInfo.terminals || recap.arrTerm ? (
                  <div className={styles.cellTerm}>
                    {recap.destInfo.terminals ? `Terminals: ${recap.destInfo.terminals}` : `Terminal ${recap.arrTerm}`}
                    {recap.arrTerm ? `\nUsual for this airline: ${recap.arrTerm}` : ""}
                  </div>
                ) : null}
                {recap.destInfo.tip ? <p className={styles.tip}>{recap.destInfo.tip}</p> : null}
              </div>
            </div>

            <div className={styles.paxCard}>
              <div>
                <p className={styles.kicker}>Passenger(s)</p>
                <div className={styles.paxLine}>{paxLine}</div>
              </div>
              <div>
                <p className={styles.kicker}>Contact</p>
                <div className={styles.paxLine}>{contact.email || "-"}</div>
                <div className={styles.cellSub}>{contact.phone ? `+91 ${contact.phone}` : "-"}</div>
              </div>
            </div>

            <div className={styles.payRow}>
              <div className={styles.paid}>
                <div className={styles.paidLabel}>Amount paid</div>
                <div className={styles.paidAmt}>{amount ? amountLabel : "-"}</div>
                <div className={styles.paidVia}>
                  {paymentId ? `Card ${paymentId}` : paid ? "Card" : "Not captured"}
                </div>
              </div>
              <div className={styles.barcodeWrap}>
                <div className={styles.barcode} aria-hidden />
                <div className={styles.barcodeNum}>{bookingRef || barcodeId}</div>
              </div>
            </div>

            <div className={styles.veroHelp}>
              <VeroPostBookingHelp
                prompt={`I booked ${recap.airlineName} ${recap.flightNo || ""} ${recap.origin} to ${recap.dest}. PNR ${bookingRef || supplierBookingId || "pending"}. What’s my PNR / gate, and can I cancel?`}
                copy="Ask PNR, gate, bags, or cancel on this ticket — not a new search."
              />
            </div>

            {isKlookEnabled() ? (
              <div className={styles.klookExtras}>
                <p className={styles.klookTitle}>Need a ride or a car in {recap.destCity}?</p>
                <p className={styles.klookHint}>
                  Checkout on Klook. We may earn a referral if you book.
                </p>
                <div className={styles.klookRow}>
                  <a
                    className={styles.klookBtn}
                    href={klookHref("transfers", { city: recap.destCity, iata: recap.dest })}
                    target="_blank"
                    rel="sponsored noopener noreferrer"
                  >
                    Airport transfer
                  </a>
                  <a
                    className={styles.klookBtnGhost}
                    href={klookHref("cars", { city: recap.destCity, iata: recap.dest })}
                    target="_blank"
                    rel="sponsored noopener noreferrer"
                  >
                    Rent a car
                  </a>
                  <a
                    className={styles.klookBtnGhost}
                    href={klookHref("activities", { city: recap.destCity, iata: recap.dest })}
                    target="_blank"
                    rel="sponsored noopener noreferrer"
                  >
                    Things to do
                  </a>
                </div>
              </div>
            ) : null}

            {cancelMsg ? <p className={styles.cancelOk}>{cancelMsg}</p> : null}
            {cancelErr ? <p className={styles.pdfErr}>{cancelErr}</p> : null}
            {resendMsg ? <p className={styles.cancelOk}>{resendMsg}</p> : null}
            {resendErr ? <p className={styles.pdfErr}>{resendErr}</p> : null}
            {pdfError ? <p className={styles.pdfErr}>{pdfError}</p> : null}

            <footer className={styles.foot}>
              <p>Issued by Itinero. Gate numbers appear on airport screens - we never invent them.</p>
              <strong>itinero + Vero</strong>
            </footer>
          </div>

          <div className={styles.btns}>
            {(isSupplierBookingId(supplierBookingId) || paymentId) && !cancelled ? (
              <button
                type="button"
                className={`${styles.btn} ${styles.btnCancel}`}
                onClick={handleCancel}
                disabled={cancelBusy}
              >
                <Ban size={15} /> {cancelBusy ? "Cancelling…" : "Cancel booking"}
              </button>
            ) : null}
            <button type="button" className={`${styles.btn} ${styles.btnGhost}`} onClick={handleShare}>
              <Share2 size={15} /> Share
            </button>
            {paid && contact.email ? (
              <button
                type="button"
                className={`${styles.btn} ${styles.btnGhost}`}
                onClick={handleResendEmail}
                disabled={resendBusy}
              >
                <Mail size={15} /> {resendBusy ? "Sending…" : "Email confirmation"}
              </button>
            ) : null}
            <button
              type="button"
              className={`${styles.btn} ${styles.btnPdf}`}
              onClick={handleSavePdf}
              disabled={pdfBusy}
            >
              <Download size={15} /> {pdfBusy ? "Preparing PDF…" : "Save PDF"}
            </button>
          </div>

          <div className={styles.navRow}>
            {!paid ? (
              <button type="button" className={styles.navPrimary} onClick={() => navigate("/flights/payment")}>
                Continue to payment
              </button>
            ) : null}
            <button type="button" className={styles.navGhost} onClick={() => navigate("/trips")}>
              My Trips
            </button>
            <button type="button" className={styles.navGhost} onClick={() => navigate("/")}>
              Back to home
            </button>
            <button type="button" className={styles.navPrimary} onClick={() => navigate("/flights")}>
              Book another flight
            </button>
          </div>
        </div>
      </div>
    </PageLayout>
  );
}
