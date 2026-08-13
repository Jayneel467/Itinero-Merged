import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Download, Mail, MapPin, Plane, TrainFront, Bus } from "lucide-react";
import { PageLayout } from "@/components/layout";
import { useCurrency } from "@/context/CurrencyContext";
import { useVeroUi } from "@/context/VeroUiContext";
import { buildTripsPageContext } from "@/features/vero/utils/pageContext";
import { flightService } from "@/features/flights/services/flightService";
import { hotelService } from "@/features/hotels/services/hotelService";
import { buildFlightResumeSearchParams } from "@/features/flights/utils/dateParams";
import { downloadBookingConfirmationPdf } from "@/features/booking/utils/bookingConfirmationPdf";
import { sendBookingEmail } from "@/features/booking/services/paymentService";
import { confirmationToPdfBooking } from "@/features/flights/utils/flightCheckout";
import { describeAirport } from "@/constants/airports";
import AirlineMark from "@/features/flights/components/AirlineMark";
import { inferAirlineCode } from "@/features/flights/utils/airlineIdentity";
import { tripService } from "./tripService";
import { isSupplierBookingId } from "./utils/supplierBooking";
import {
  cancelFlightWithQuote,
  cancelHotelWithPolicy,
  cancelPackageWithRefund,
  refundPatchFromResult,
  formatCancelResultMessage,
} from "./utils/cancelFlow";
import { useTrips } from "./TripContext";
import { LoadingDots } from "@/components/shared";
import styles from "./TripDetailPage.module.css";

function prettyDate(iso) {
  if (!iso) return null;
  const d = new Date(`${String(iso).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function badgeClass(status) {
  if (status === "confirmed") return styles.badge;
  if (status === "held" || status === "draft" || status === "cancel_pending") {
    return `${styles.badge} ${styles.badgeHeld}`;
  }
  return `${styles.badge} ${styles.badgeCancelled}`;
}

export default function TripDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { trips, getTrip, removeTrip, refresh } = useTrips();
  const { formatMoney } = useCurrency();
  const { setPageContext, clearPageContext, openVero } = useVeroUi();
  const [busyKey, setBusyKey] = useState("");
  const [actionMsg, setActionMsg] = useState("");
  const [actionErr, setActionErr] = useState("");
  const [pdfBusy, setPdfBusy] = useState(false);
  const [mailBusy, setMailBusy] = useState(false);
  const veroSrc = `${import.meta.env.BASE_URL}vero-chatbot.png`;

  const trip = useMemo(() => getTrip(id), [getTrip, id, trips]);

  useEffect(() => {
    if (!trip) return undefined;
    setPageContext(buildTripsPageContext({ trips: [trip], detail: trip }));
    return () => clearPageContext();
  }, [trip, setPageContext, clearPageContext]);

  if (!trip) {
    return (
      <PageLayout>
        <div className={styles.page}>
          <div className={styles.wrap}>
            <p>Trip not found.</p>
            <Link to="/trips" className={`${styles.btn} ${styles.btnPrimary}`}>
              Back to trips
            </Link>
          </div>
        </div>
      </PageLayout>
    );
  }

  const flightLegs = (trip.legs || []).filter((l) => l.type === "flight");
  const hotelLegs = (trip.legs || []).filter((l) => l.type === "hotel");
  const packageLegs = (trip.legs || []).filter((l) => l.type === "package");
  const trainLegs = (trip.legs || []).filter((l) => l.type === "train");
  const busLegs = (trip.legs || []).filter((l) => l.type === "bus");
  const flight = flightLegs[0] || null;
  const train = trainLegs[0] || null;
  const bus = busLegs[0] || null;
  const snap = flight?.flightSnapshot || {};
  const originCode = String(trip.origin || snap.departure?.airport || "").toUpperCase();
  const destCode = String(trip.destination || snap.arrival?.airport || "").toUpperCase();
  const originInfo = describeAirport(originCode);
  const destInfo = describeAirport(destCode);
  const airlineName = flight?.airline || snap.airline?.name || "Flight";
  const airlineCode = inferAirlineCode(airlineName, snap.flightNumber, flight?.airlineCode || snap.airline?.code);
  const flightNo = snap.flightNumber || "";
  const depTime = snap.departure?.time || flight?.departureTime || "--:--";
  const arrTime = snap.arrival?.time || flight?.arrivalTime || "--:--";
  const dateLabel = prettyDate(trip.departDate) || trip.departDate || "Date TBD";
  const paid = trip.status === "confirmed" || Boolean(flight?.paymentId);

  const heroTitle = flight
    ? `${originCode || "-"} → ${destCode || "-"}`
    : train
      ? `${train.from_code || trip.origin || "-"} → ${train.to_code || trip.destination || "-"}`
      : bus
        ? `${bus.from_name || trip.origin || "-"} → ${bus.to_name || trip.destination || "-"}`
        : trip.title || `${trip.origin || "-"} → ${trip.destination || "-"}`;

  const heroMetaExtra = flight
    ? originInfo.city && destInfo.city
      ? ` · ${originInfo.city} to ${destInfo.city}`
      : ""
    : train
      ? [train.number, train.name, train.class_code].filter(Boolean).join(" · ")
        ? ` · ${[train.number, train.name, train.class_code].filter(Boolean).join(" · ")}`
        : ""
      : bus
        ? [bus.operator, bus.bus_type].filter(Boolean).join(" · ")
          ? ` · ${[bus.operator, bus.bus_type].filter(Boolean).join(" · ")}`
          : ""
        : "";

  const recap = {
    airlineName,
    airlineCode,
    logo: snap.airline?.logo || snap.logo || "",
    flightNo,
    origin: originCode,
    dest: destCode,
    originCity: originInfo.city,
    destCity: destInfo.city,
    originName: originInfo.name,
    destName: destInfo.name,
    originInfo,
    destInfo,
    depTime,
    arrTime,
    depDate: dateLabel,
    duration: flight?.duration || snap.duration || "-",
    stops: flight?.stops ?? snap.stops ?? "-",
    cabin: snap.cabin || "Economy",
    baggageCabin: snap.baggage?.cabin || snap.baggage_cabin || "",
    baggageChecked: snap.baggage?.checked || snap.baggage_checked || "",
  };

  const resumeFlight = () => {
    if (!trip.origin || !trip.destination) {
      navigate("/flights");
      return;
    }
    navigate(`/flights?${buildFlightResumeSearchParams(trip).toString()}`);
  };

  async function savePdf() {
    setPdfBusy(true);
    setActionErr("");
    try {
      await downloadBookingConfirmationPdf(
        confirmationToPdfBooking(
          {
            flight: {
              ...snap,
              airline: { name: airlineName, code: airlineCode, logo: snap.airline?.logo },
              flightNumber: flightNo,
              departure: snap.departure || { time: depTime, airport: originCode, date: trip.departDate },
              arrival: snap.arrival || { time: arrTime, airport: destCode },
              duration: recap.duration,
              stops: recap.stops,
              cabin: recap.cabin,
              price: flight?.price,
              currency: flight?.currency || "INR",
            },
            travelers: trip.passengers || [],
            contact: trip.contact || {},
            paymentId: flight?.paymentId,
            bookingRef: flight?.pnr || flight?.bookingId,
            amount: flight?.price,
            currency: flight?.currency || "INR",
          },
          recap
        )
      );
    } catch (err) {
      setActionErr(err?.message || "Could not generate PDF.");
    } finally {
      setPdfBusy(false);
    }
  }

  async function sendMail() {
    const mail = String(trip.contact?.email || "").trim();
    if (!mail || !mail.includes("@")) {
      setActionErr("Add a contact email on this trip to send the confirmation.");
      return;
    }

    const hotel = hotelLegs[0] || null;
    const kind = flight ? "flight" : hotel ? "hotel" : null;
    if (!kind) {
      setActionErr("Nothing to email on this trip yet.");
      return;
    }

    const bookingRef =
      kind === "flight"
        ? flight?.pnr || flight?.bookingId || trip.id
        : hotel?.hotelConfirmationCode || hotel?.bookingId || trip.id;
    const paymentId = (kind === "flight" ? flight?.paymentId : hotel?.paymentId) || "";

    const seg0 = Array.isArray(flight?.segmentsSummary) ? flight.segmentsSummary[0] : null;
    const segLast = Array.isArray(flight?.segmentsSummary)
      ? flight.segmentsSummary[flight.segmentsSummary.length - 1]
      : null;

    const combineWhen = (dateVal, timeVal, isoFallback) => {
      if (isoFallback && /^\d{4}-\d{2}-\d{2}T/.test(String(isoFallback))) {
        return String(isoFallback);
      }
      const d = String(dateVal || "").slice(0, 10);
      const t = String(timeVal || "").trim();
      if (!t || t === "--:--") return d || undefined;
      const clock = /^\d{1,2}:\d{2}/.test(t) ? t.slice(0, 5) : t;
      if (d && /^\d{4}-\d{2}-\d{2}$/.test(d) && /^\d{1,2}:\d{2}$/.test(clock)) {
        return `${d}T${clock.padStart(5, "0")}:00`;
      }
      return clock;
    };

    const paxNames = (trip.passengers || [])
      .map((p) => {
        const n = [p.firstName || p.first_name, p.lastName || p.last_name]
          .filter(Boolean)
          .join(" ")
          .trim();
        return n || String(p.name || "").trim();
      })
      .filter(Boolean);

    const phone = trip.contact?.phone
      ? `+${trip.contact.phone_country_code || trip.contact.phoneCountryCode || "91"} ${trip.contact.phone}`
      : undefined;

    setMailBusy(true);
    setActionErr("");
    setActionMsg("");
    try {
      const res = await sendBookingEmail({
        kind,
        email: mail,
        payment_id: paymentId || undefined,
        booking_ref: bookingRef,
        route:
          kind === "flight"
            ? `${originCode || "-"} → ${destCode || "-"}`
            : undefined,
        hotel_name: kind === "hotel" ? hotel?.hotelName || hotel?.name : undefined,
        airline: kind === "flight" ? airlineName : undefined,
        flight_number: kind === "flight" ? flightNo || undefined : undefined,
        amount: Number(kind === "flight" ? flight?.price : hotel?.price) || undefined,
        currency: (kind === "flight" ? flight?.currency : hotel?.currency) || "INR",
        pending: !(
          trip.status === "confirmed" ||
          (kind === "flight" ? isSupplierBookingId(flight?.bookingId) : Boolean(hotel?.bookingId))
        ),
        depart_at:
          kind === "flight"
            ? combineWhen(
                trip.departDate || snap.departure?.date || flight?.departDate,
                depTime,
                seg0?.departure
              )
            : undefined,
        arrive_at:
          kind === "flight"
            ? combineWhen(
                trip.departDate || snap.arrival?.date || flight?.departDate,
                arrTime,
                segLast?.arrival
              )
            : undefined,
        travel_date: kind === "flight" ? String(trip.departDate || "").slice(0, 10) || undefined : undefined,
        origin: kind === "flight" ? originCode || undefined : undefined,
        destination: kind === "flight" ? destCode || undefined : undefined,
        duration: kind === "flight" ? (recap.duration !== "-" ? recap.duration : undefined) : undefined,
        cabin: kind === "flight" ? recap.cabin : undefined,
        stops:
          kind === "flight"
            ? recap.stops === 0 || recap.stops === "0"
              ? "Direct"
              : String(recap.stops ?? "Direct")
            : undefined,
        passengers: paxNames.length ? paxNames : undefined,
        phone,
      });
      if (!res?.ok) {
        throw new Error(res?.message || res?.error || "Could not send email via SMTP.");
      }
      setActionMsg(res.message || `Confirmation emailed to ${mail}.`);
    } catch (err) {
      setActionErr(err?.message || "Could not send email via SMTP.");
    } finally {
      setMailBusy(false);
    }
  }

  async function refreshFlight(leg, idx) {
    if (!isSupplierBookingId(leg.bookingId)) {
      setActionErr("This fare has no supplier ticket id. Refresh only works with a LiteAPI booking id.");
      return;
    }
    const key = `f-refresh-${idx}`;
    setBusyKey(key);
    setActionErr("");
    setActionMsg("");
    try {
      const res = await flightService.getBooking(leg.bookingId, {
        email: trip?.contact?.email || undefined,
      });
      if (!res?.ok && !res?.booking) {
        throw new Error(res?.error || res?.message || "Could not refresh flight booking.");
      }
      const b = res.booking || res;
      const status = String(b.status || leg.status || "").toLowerCase();
      tripService.patchLegFromRemote({
        tripId: trip.id,
        legType: "flight",
        patch: {
          status: status.includes("cancel") ? "cancelled" : status || leg.status,
          pnr: b.pnr || b.booking_reference || leg.pnr,
          bookingId: b.booking_id || leg.bookingId,
        },
        tripStatus: status.includes("cancel") ? "cancelled" : trip.status,
      });
      refresh();
      setActionMsg("Flight booking refreshed.");
    } catch (err) {
      setActionErr(err?.message || "Refresh failed.");
    } finally {
      setBusyKey("");
    }
  }

  async function cancelFlight(leg, idx) {
    const key = `f-cancel-${idx}`;
    setBusyKey(key);
    setActionErr("");
    setActionMsg("");
    try {
      let res;
      if (isSupplierBookingId(leg.bookingId)) {
        res = await cancelFlightWithQuote({
          bookingId: leg.bookingId,
          paymentId: leg.paymentId,
          expectedAmount: Number(leg.price) || null,
          paymentProvider: leg.paymentProvider || trip?.paymentProvider || "stripe",
          email: trip?.contact?.email || undefined,
        });
      } else if (leg.paymentId && String(leg.paymentId).startsWith("pay_")) {
        setActionErr(
          "This looks like a legacy payment without a supplier ticket. Contact support with your booking reference for a refund."
        );
        return;
      } else {
        setActionErr("No supplier ticket id on this fare - cannot cancel with LiteAPI.");
        return;
      }
      if (res?.aborted) return;
      if (!res?.ok) throw new Error(res?.error || res?.message || "Cancel failed.");
      tripService.markFlightCancelled({
        tripId: trip.id,
        bookingId: leg.bookingId,
        refund: refundPatchFromResult(res),
      });
      refresh();
      setActionMsg(formatCancelResultMessage(res) || "Flight cancelled.");
    } catch (err) {
      setActionErr(err?.message || "Cancel failed.");
    } finally {
      setBusyKey("");
    }
  }

  async function refreshHotel(leg, idx) {
    if (!isSupplierBookingId(leg.bookingId)) return;
    const key = `h-refresh-${idx}`;
    setBusyKey(key);
    setActionErr("");
    setActionMsg("");
    try {
      const res = await hotelService.getBooking(leg.bookingId, {
        email: trip?.contact?.email || undefined,
      });
      if (!res?.ok && !res?.booking) {
        throw new Error(res?.error || res?.message || "Could not refresh hotel booking.");
      }
      const b = res.booking || res;
      const status = String(b.status || leg.status || "").toLowerCase();
      tripService.patchLegFromRemote({
        tripId: trip.id,
        legType: "hotel",
        patch: {
          status: status.includes("cancel") ? "cancelled" : status || leg.status,
          bookingId: b.booking_id || leg.bookingId,
          hotelConfirmationCode: b.hotel_confirmation_code || leg.hotelConfirmationCode,
        },
        tripStatus: status.includes("cancel") ? "cancelled" : trip.status,
      });
      refresh();
      setActionMsg("Hotel booking refreshed.");
    } catch (err) {
      setActionErr(err?.message || "Refresh failed.");
    } finally {
      setBusyKey("");
    }
  }

  async function cancelHotel(leg, idx) {
    if (!isSupplierBookingId(leg.bookingId)) return;
    const key = `h-cancel-${idx}`;
    setBusyKey(key);
    setActionErr("");
    setActionMsg("");
    try {
      const res = await cancelHotelWithPolicy({
        bookingId: leg.bookingId,
        paymentId: leg.paymentId,
        expectedAmount: Number(leg.price) || null,
        paymentProvider: leg.paymentProvider || trip?.paymentProvider || "stripe",
        email: trip?.contact?.email || undefined,
      });
      if (res?.aborted) return;
      if (!res?.ok) throw new Error(res?.error || res?.message || "Cancel failed.");
      tripService.markHotelCancelled({
        tripId: trip.id,
        bookingId: leg.bookingId,
        refund: refundPatchFromResult(res),
      });
      refresh();
      setActionMsg(formatCancelResultMessage(res) || "Stay cancelled.");
    } catch (err) {
      setActionErr(err?.message || "Cancel failed.");
    } finally {
      setBusyKey("");
    }
  }

  const askVero = () => {
    if (train) {
      openVero(
        `I have a ${trip.status} train trip ${train.from_code || trip.origin || ""} to ${train.to_code || trip.destination || ""} on ${dateLabel}. Train ${train.number || ""} ${train.name || ""} ${train.class_code || ""}${train.pnr ? ` PNR ${train.pnr}` : ""}. Help with platform, connecting cab, or next steps.`
      );
      return;
    }
    if (bus) {
      openVero(
        `I have a ${trip.status} transit trip ${bus.from_name || trip.origin || ""} to ${bus.to_name || trip.destination || ""} on ${dateLabel}. Operator ${bus.operator || ""} ${bus.dep || ""}. Help with boarding stop, Maps, or next steps.`
      );
      return;
    }
    openVero(
      `I have a ${paid ? "confirmed" : trip.status} trip ${originCode || ""} to ${destCode || ""} on ${dateLabel}. Airline ${airlineName} ${flightNo}. Help with terminals, baggage, hotel near arrival, or next steps.`
    );
  };

  return (
    <PageLayout>
      <div className={styles.page}>
        <div className={styles.wrap}>
          <Link to="/trips" className={styles.back}>
            ← All trips
          </Link>

          <header className={styles.hero}>
            <div className={styles.heroTop}>
              <div>
                <p className={styles.kicker}>Your trip</p>
                <h1 className={styles.title}>{heroTitle}</h1>
                <p className={styles.meta}>
                  {dateLabel}
                  {" · "}
                  {trip.travelers?.adults || 1} adult
                  {(trip.travelers?.children || 0) > 0 ? ` · ${trip.travelers.children} child` : ""}
                  {heroMetaExtra}
                </p>
              </div>
              <span className={badgeClass(trip.status)}>{trip.status}</span>
            </div>
            <div className={styles.heroActions}>
              {(trip.status === "draft" || trip.status === "held") && flightLegs.length > 0 ? (
                <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={resumeFlight}>
                  Resume booking
                </button>
              ) : null}
              {(trip.status === "draft" || trip.status === "held") && trainLegs.length > 0 ? (
                <button
                  type="button"
                  className={`${styles.btn} ${styles.btnPrimary}`}
                  onClick={() => navigate(`/trains/book/done?trip=${encodeURIComponent(trip.id)}`)}
                >
                  Continue train booking
                </button>
              ) : null}
              {(trip.status === "draft" || trip.status === "held") && busLegs.length > 0 ? (
                <button
                  type="button"
                  className={`${styles.btn} ${styles.btnPrimary}`}
                  onClick={() => navigate(`/transits/book/done?trip=${encodeURIComponent(trip.id)}`)}
                >
                  Continue transit booking
                </button>
              ) : null}
              <button type="button" className={`${styles.btn} ${styles.btnGhost}`} onClick={askVero}>
                Ask Vero
              </button>
              <button type="button" className={`${styles.btn} ${styles.btnGhost}`} onClick={savePdf} disabled={pdfBusy}>
                <Download size={15} /> {pdfBusy ? "PDF…" : "Save PDF"}
              </button>
              <button
                type="button"
                className={`${styles.btn} ${styles.btnGhost}`}
                onClick={sendMail}
                disabled={mailBusy}
                title={trip.contact?.email ? `Send via SMTP to ${trip.contact.email}` : "Needs contact email"}
              >
                <Mail size={15} /> {mailBusy ? "Sending…" : "Email"}
              </button>
              <button
                type="button"
                className={`${styles.btn} ${styles.btnGhost}`}
                onClick={() => {
                  if (window.confirm("Remove this trip from this device?")) {
                    removeTrip(trip.id);
                    navigate("/trips");
                  }
                }}
              >
                Remove
              </button>
            </div>
          </header>

          {actionMsg ? <p className={`${styles.msg} ${styles.msgOk}`}>{actionMsg}</p> : null}
          {actionErr ? <p className={`${styles.msg} ${styles.msgErr}`}>{actionErr}</p> : null}

          {flight ? (
            <section className={styles.card}>
              <div className={styles.flightHead}>
                <div className={styles.airline}>
                  <AirlineMark
                    name={airlineName}
                    code={airlineCode}
                    logo={snap.airline?.logo}
                    flightNumber={flightNo}
                    size={52}
                  />
                  <div>
                    <div className={styles.airlineName}>{airlineName}</div>
                    <div className={styles.flightNo}>
                      {flightNo || airlineCode || "Live fare"} · {recap.cabin}
                    </div>
                  </div>
                </div>
                <div>
                  {typeof flight.price === "number" ? (
                    <div className={styles.price}>{formatMoney(flight.price)}</div>
                  ) : null}
                  <div style={{ textAlign: "right", marginTop: 6 }}>
                    <span className={badgeClass(flight.status)}>{flight.status}</span>
                  </div>
                </div>
              </div>

              <div className={styles.route}>
                <div>
                  <div className={styles.time}>{depTime}</div>
                  <div className={styles.iata}>{originCode || "-"}</div>
                  <div className={styles.city}>{originInfo.city || originInfo.name}</div>
                </div>
                <div className={styles.mid}>
                  <Plane size={16} color="#e86a10" />
                  <div>{recap.duration}</div>
                  <div>{typeof recap.stops === "number" ? (recap.stops === 0 ? "Non-stop" : `${recap.stops} stop`) : recap.stops}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div className={styles.time}>{arrTime}</div>
                  <div className={styles.iata}>{destCode || "-"}</div>
                  <div className={styles.city}>{destInfo.city || destInfo.name}</div>
                </div>
              </div>

              <div className={styles.refs}>
                <div>
                  <div className={styles.refLabel}>Itinero ref</div>
                  <div className={styles.refValue}>{flight.pnr || flight.bookingId || "-"}</div>
                </div>
                <div>
                  <div className={styles.refLabel}>Payment ref</div>
                  <div className={styles.refValue}>{flight.paymentId || "-"}</div>
                </div>
                <div>
                  <div className={styles.refLabel}>Trip ID</div>
                  <div className={styles.refValue}>{trip.id}</div>
                </div>
              </div>

              <div className={styles.refs} style={{ marginTop: 10 }}>
                <div>
                  <div className={styles.refLabel}>Cabin bag</div>
                  <div className={styles.refValue}>
                    {recap.baggageCabin || "Not on LiteAPI fare (often shows 0 in their portal)"}
                  </div>
                </div>
                <div>
                  <div className={styles.refLabel}>Checked bag</div>
                  <div className={styles.refValue}>
                    {recap.baggageChecked || "Not on LiteAPI fare (often shows 0 in their portal)"}
                  </div>
                </div>
                <div>
                  <div className={styles.refLabel}>Note</div>
                  <div className={styles.refValue} style={{ fontSize: 12, fontWeight: 500, color: "#64748b" }}>
                    Supplier portal 0/0 ≠ IndiGo published ~7kg cabin - confirm in airline app
                  </div>
                </div>
              </div>

              <div className={styles.airports}>
                <div className={styles.airportCard}>
                  <div className={styles.refLabel} style={{ color: "#e86a10" }}>
                    <MapPin size={12} style={{ display: "inline", marginRight: 4 }} />
                    Departure
                  </div>
                  <h3>{originInfo.fullName}</h3>
                  <p>{originInfo.location}</p>
                  {originInfo.terminals ? <p className={styles.term}>Terminals: {originInfo.terminals}</p> : null}
                  <p>{originInfo.tip}</p>
                </div>
                <div className={styles.airportCard}>
                  <div className={styles.refLabel} style={{ color: "#e86a10" }}>
                    <MapPin size={12} style={{ display: "inline", marginRight: 4 }} />
                    Arrival
                  </div>
                  <h3>{destInfo.fullName}</h3>
                  <p>{destInfo.location}</p>
                  {destInfo.terminals ? <p className={styles.term}>Terminals: {destInfo.terminals}</p> : null}
                  <p>{destInfo.tip}</p>
                </div>
              </div>

              {flight.refundAmount != null || flight.refundStatus ? (
                <p className={styles.contact} style={{ marginTop: 14 }}>
                  Refund {flight.refundAmount != null ? `${flight.refundCurrency || "INR"} ${flight.refundAmount}` : ""}
                  {flight.cancellationFee ? ` · fee ${flight.cancellationFee}` : ""}
                  {flight.refundStatus ? ` · ${flight.refundStatus}` : ""}
                  {flight.cancelPending ? " · airline still confirming" : ""}
                </p>
              ) : null}

              {isSupplierBookingId(flight.bookingId) || flight.paymentId ? (
                <div className={styles.actions}>
                  {isSupplierBookingId(flight.bookingId) ? (
                    <button
                      type="button"
                      className={`${styles.btn} ${styles.btnLight}`}
                      disabled={busyKey === "f-refresh-0"}
                      onClick={() => refreshFlight(flight, 0)}
                    >
                      {busyKey === "f-refresh-0" ? <LoadingDots label="Refreshing" /> : "Refresh supplier ticket"}
                    </button>
                  ) : null}
                  {String(flight.status || "").toLowerCase().includes("cancel") ? null : (
                    <button
                      type="button"
                      className={`${styles.btn} ${styles.btnDanger}`}
                      disabled={busyKey === "f-cancel-0"}
                      onClick={() => cancelFlight(flight, 0)}
                    >
                      {busyKey === "f-cancel-0"
                        ? <LoadingDots label="Cancelling" />
                        : isSupplierBookingId(flight.bookingId)
                          ? "Cancel with supplier"
                          : "Request refund"}
                    </button>
                  )}
                </div>
              ) : (
                <p className={styles.contact} style={{ marginTop: 14 }}>
                  No supplier ticket id on this fare. Contact support with your payment / booking reference for help.
                </p>
              )}
            </section>
          ) : null}

          {hotelLegs.length > 0 ? (
            <section className={styles.card}>
              <h2 className={styles.cardTitle}>Hotels</h2>
              {hotelLegs.map((leg, i) => (
                <div key={`h-${i}`} className={styles.hotelRow}>
                  <div>
                    <p className={styles.airlineName}>{leg.hotelName || "Stay"}</p>
                    <p className={styles.city}>
                      {leg.location || ""}
                      {leg.checkIn ? ` · ${prettyDate(leg.checkIn) || leg.checkIn}` : ""}
                      {leg.checkOut ? ` → ${prettyDate(leg.checkOut) || leg.checkOut}` : ""}
                    </p>
                  </div>
                  <div>
                    <span className={badgeClass(leg.status)}>{leg.status}</span>
                    {isSupplierBookingId(leg.bookingId) ? (
                      <div className={styles.actions}>
                        <button type="button" className={`${styles.btn} ${styles.btnLight}`} onClick={() => refreshHotel(leg, i)}>
                          Refresh
                        </button>
                        {String(leg.status || "").toLowerCase().includes("cancel") ? null : (
                          <button type="button" className={`${styles.btn} ${styles.btnDanger}`} onClick={() => cancelHotel(leg, i)}>
                            Cancel
                          </button>
                        )}
                      </div>
                    ) : null}
                  </div>
                </div>
              ))}
            </section>
          ) : null}

          {packageLegs.length > 0 ? (
            <section className={styles.card}>
              <h2 className={styles.cardTitle}>Packages</h2>
              {packageLegs.map((leg, i) => (
                <div key={`p-${i}`} className={styles.hotelRow}>
                  <div>
                    <p className={styles.airlineName}>{leg.packageTitle || "Package"}</p>
                    <p className={styles.city}>
                      {leg.checkIn || ""}
                      {leg.checkOut ? ` → ${leg.checkOut}` : ""}
                    </p>
                  </div>
                  {leg.packageBookingId ? (
                    <div className={styles.actions}>
                      <button
                        type="button"
                        className={`${styles.btn} ${styles.btnPrimary}`}
                        onClick={() => navigate(`/packages/confirmation/${leg.packageBookingId}`)}
                      >
                        View confirmation
                      </button>
                      {String(leg.status || "").toLowerCase().includes("cancel") &&
                      !String(leg.status || "").toLowerCase().includes("awaiting") &&
                      !String(trip?.status || "").toLowerCase().includes("awaiting") ? null : (
                        <button
                          type="button"
                          className={`${styles.btn} ${styles.btnDanger}`}
                          disabled={busyKey === `p-cancel-${i}`}
                          onClick={async () => {
                            const key = `p-cancel-${i}`;
                            setBusyKey(key);
                            setActionErr("");
                            setActionMsg("");
                            try {
                              const email =
                                trip?.contact?.email ||
                                (typeof sessionStorage !== "undefined"
                                  ? sessionStorage.getItem(`itinero_pkg_email_${leg.packageBookingId}`)
                                  : "") ||
                                "";
                              const res = await cancelPackageWithRefund({
                                packageBookingId: leg.packageBookingId,
                                email,
                                paidAmount: Number(leg.price) || null,
                                paymentId: leg.paymentId || trip?.paymentId || null,
                                paymentProvider:
                                  leg.paymentProvider || trip?.paymentProvider || "itinero_stripe",
                              });
                              if (res?.aborted) return;
                              if (!res?.ok) {
                                throw new Error(res?.message || res?.error || "Cancel failed.");
                              }
                              tripService.markTripCancelled(trip.id, refundPatchFromResult(res));
                              refresh();
                              setActionMsg(formatCancelResultMessage(res) || "Package cancelled.");
                            } catch (err) {
                              setActionErr(err?.message || "Cancel failed.");
                            } finally {
                              setBusyKey("");
                            }
                          }}
                        >
                          {busyKey === `p-cancel-${i}` ? (
                            <LoadingDots label="Working" />
                          ) : String(leg.status || trip?.status || "")
                              .toLowerCase()
                              .includes("awaiting") ? (
                            "Check refund"
                          ) : (
                            "Cancel package"
                          )}
                        </button>
                      )}
                    </div>
                  ) : null}
                </div>
              ))}
            </section>
          ) : null}

          {trainLegs.length > 0 ? (
            <section className={styles.card}>
              <h2 className={styles.cardTitle}>Trains</h2>
              {trainLegs.map((leg, i) => (
                <div key={`t-${i}`} className={styles.hotelRow}>
                  <div>
                    <p className={styles.airlineName}>
                      <TrainFront size={16} style={{ display: "inline", marginRight: 6, verticalAlign: -2 }} />
                      {leg.number || ""} {leg.name || "Train"}
                    </p>
                    <p className={styles.city}>
                      {leg.from_code || ""} {leg.dep || ""} → {leg.to_code || ""} {leg.arr || ""}
                      {leg.date ? ` · ${leg.date}` : ""}
                      {leg.class_code ? ` · ${leg.class_code}` : ""}
                      {leg.quota ? ` · ${leg.quota}` : ""}
                    </p>
                    <p className={styles.contact} style={{ marginTop: 8 }}>
                      Ref {leg.bookingId || "-"}
                      {leg.pnr ? ` · PNR ${leg.pnr}` : " · Awaiting IRCTC PNR"}
                    </p>
                  </div>
                  <div>
                    <span className={badgeClass(leg.status)}>{leg.status}</span>
                    <div className={styles.actions}>
                      <button
                        type="button"
                        className={`${styles.btn} ${styles.btnLight}`}
                        onClick={() => navigate(`/trains/book/done?trip=${encodeURIComponent(trip.id)}`)}
                      >
                        Open confirmation
                      </button>
                      {leg.checkoutUrl ? (
                        <button
                          type="button"
                          className={`${styles.btn} ${styles.btnPrimary}`}
                          onClick={() => window.open(leg.checkoutUrl, "_blank", "noopener,noreferrer")}
                        >
                          Partner checkout
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))}
            </section>
          ) : null}

          {busLegs.length > 0 ? (
            <section className={styles.card}>
              <h2 className={styles.cardTitle}>Transits</h2>
              {busLegs.map((leg, i) => (
                <div key={`b-${i}`} className={styles.hotelRow}>
                  <div>
                    <p className={styles.airlineName}>
                      <Bus size={16} style={{ display: "inline", marginRight: 6, verticalAlign: -2 }} />
                      {leg.operator || (leg.kind === "coach" ? "Coach" : "Transit")}
                    </p>
                    <p className={styles.city}>
                      {leg.from_name || ""} {leg.dep || ""} → {leg.to_name || ""} {leg.arr || ""}
                      {leg.date ? ` · ${leg.date}` : ""}
                      {leg.bus_type ? ` · ${leg.bus_type}` : ""}
                    </p>
                    <p className={styles.contact} style={{ marginTop: 8 }}>
                      Ref {leg.bookingId || "-"} · Partner ticket required
                    </p>
                  </div>
                  <div>
                    <span className={badgeClass(leg.status)}>{leg.status}</span>
                    <div className={styles.actions}>
                      <button
                        type="button"
                        className={`${styles.btn} ${styles.btnLight}`}
                        onClick={() => navigate(`/transits/book/done?trip=${encodeURIComponent(trip.id)}`)}
                      >
                        Open confirmation
                      </button>
                      {leg.checkoutUrl ? (
                        <button
                          type="button"
                          className={`${styles.btn} ${styles.btnPrimary}`}
                          onClick={() => window.open(leg.checkoutUrl, "_blank", "noopener,noreferrer")}
                        >
                          Partner checkout
                        </button>
                      ) : null}
                      {leg.mapsUrl ? (
                        <button
                          type="button"
                          className={`${styles.btn} ${styles.btnGhost}`}
                          onClick={() => window.open(leg.mapsUrl, "_blank", "noopener,noreferrer")}
                        >
                          Maps
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))}
            </section>
          ) : null}

          {(trip.contact || trip.passengers?.length) ? (
            <section className={styles.card}>
              <h2 className={styles.cardTitle}>Travelers & contact</h2>
              {trip.contact ? (
                <p className={styles.contact}>
                  {trip.contact.name ? `${trip.contact.name} · ` : ""}
                  {trip.contact.email || ""}
                  {trip.contact.phone ? ` · ${trip.contact.phone}` : ""}
                </p>
              ) : null}
              <div className={styles.paxList}>
                {(trip.passengers || []).map((p, i) => {
                  const label =
                    p.name ||
                    [p.firstName || p.first_name, p.lastName || p.last_name].filter(Boolean).join(" ") ||
                    "Traveler";
                  return (
                    <span key={i} className={styles.paxChip}>
                      {label}
                      {p.age ? ` · ${p.age}` : ""}
                    </span>
                  );
                })}
              </div>
            </section>
          ) : null}

          <div className={styles.vero}>
            <img src={veroSrc} alt="" />
            <div>
              <p className={styles.veroKicker}>Vero is on this trip</p>
              <h3>Terminals, bags, hotel, cab?</h3>
              <p>
                Ask Vero about {destInfo.city || destCode || "arrival"} - we keep this booking in chat context.
              </p>
            </div>
            <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={askVero}>
              Ask Vero
            </button>
          </div>
        </div>
      </div>
    </PageLayout>
  );
}
