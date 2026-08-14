import React, { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Building2, Bus, Plane, Sparkles, TrainFront } from "lucide-react";
import { PageLayout } from "@/components/layout";
import { ActionButton, ActionRow } from "@/components/shared";
import { useCurrency } from "@/context/CurrencyContext";
import { useVeroUi } from "@/context/VeroUiContext";
import { buildTripsPageContext } from "@/features/vero/utils/pageContext";
import { buildFlightResumeSearchParams } from "@/features/flights/utils/dateParams";
import { describeAirport } from "@/constants/airports";
import {
  canonicalizeAirlineName,
} from "@/features/flights/utils/airlineIdentity";
import { useTrips } from "./TripContext";
import { tripService } from "./tripService";
import { pickSupplierBookingId } from "./utils/supplierBooking";
import {
  cancelFlightWithQuote,
  cancelHotelWithPolicy,
  cancelPackageWithRefund,
  refundPatchFromResult,
  formatCancelResultMessage,
} from "./utils/cancelFlow";
import { readFlightConfirmation, readFlightCheckout } from "@/features/flights/utils/flightCheckout";
import styles from "./TripsPage.module.css";

const TABS = [
  { id: "upcoming", label: "Upcoming" },
  { id: "draft", label: "Drafts" },
  { id: "past", label: "Past" },
];

function prettyDate(iso) {
  if (!iso) return null;
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function formatDates(trip) {
  const a = prettyDate(trip.departDate);
  const b = prettyDate(trip.returnDate);
  if (a && b) return `${a} - ${b}`;
  if (a) return a;
  return "Dates TBD";
}

function primaryPrice(trip) {
  for (const leg of trip.legs || []) {
    if (typeof leg.price === "number" && leg.price > 0) {
      return { price: leg.price, currency: leg.currency };
    }
  }
  return null;
}

function statusLabel(status) {
  if (status === "held") return "On hold";
  if (status === "cancel_pending") return "Cancel pending";
  if (status === "confirmed") return "Paid";
  if (!status) return "Draft";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function statusTone(status) {
  if (status === "confirmed") return styles.tonePaid;
  if (status === "held") return styles.toneHold;
  if (status === "draft") return styles.toneDraft;
  if (status === "abandoned" || status === "cancelled" || status === "cancel_pending") {
    return styles.toneMuted;
  }
  return styles.toneDraft;
}

function isPast(trip) {
  if (trip.status === "abandoned" || trip.status === "cancelled" || trip.status === "cancel_pending") {
    return true;
  }
  const d = trip.returnDate || trip.departDate;
  if (!d) return false;
  const t = new Date(`${d}T23:59:59`).getTime();
  return Number.isFinite(t) && t < Date.now();
}

function isUpcoming(trip) {
  if (trip.status === "abandoned" || trip.status === "cancelled" || trip.status === "cancel_pending") {
    return false;
  }
  if (isPast(trip)) return false;
  return trip.status === "confirmed" || trip.status === "held" || trip.status === "draft";
}

function partnerHandoffOnly(trip) {
  const types = (trip.legs || []).map((l) => String(l.type || "").toLowerCase()).filter(Boolean);
  if (!types.length) return false;
  return types.every((t) => t === "train" || t === "bus" || t === "event");
}

function canCancelTrip(trip) {
  const status = String(trip.status || "").toLowerCase();
  if (status === "cancelled" || status === "abandoned" || status === "cancel_pending") return false;
  if (status === "draft" || status === "held") return true;
  if (partnerHandoffOnly(trip)) return false;
  const hasPackage = (trip.legs || []).some((l) => l.type === "package" && l.packageBookingId);
  const hasFlight = Boolean(flightSupplierId(trip));
  const hasHotel = hotelSupplierIds(trip).length > 0;
  return hasPackage || hasFlight || hasHotel;
}

function confirmationMatchesTrip(trip, confirmation) {
  if (!confirmation?.flight && !confirmation?.paymentId && !confirmation?.supplierBookingId) {
    return false;
  }
  const flightLeg = (trip.legs || []).find((l) => l.type === "flight");
  if (!flightLeg) return false;
  if (confirmation.paymentId && flightLeg.paymentId && confirmation.paymentId === flightLeg.paymentId) {
    return true;
  }
  if (
    confirmation.supplierBookingId &&
    flightLeg.bookingId &&
    confirmation.supplierBookingId === flightLeg.bookingId
  ) {
    return true;
  }
  const offer = String(flightLeg.offerId || flightLeg.flightSnapshot?.offerId || flightLeg.flightSnapshot?.id || "");
  const cOffer = String(
    confirmation.flight?.offerId || confirmation.flight?.offer_id || confirmation.flight?.id || ""
  );
  return Boolean(offer && cOffer && offer === cOffer);
}

function flightSupplierId(trip) {
  const flightLeg = (trip.legs || []).find((l) => l.type === "flight");
  const confirmation = readFlightConfirmation();
  const fromConfirm = confirmationMatchesTrip(trip, confirmation)
    ? pickSupplierBookingId(
        confirmation.supplierBookingId,
        confirmation.liteapi?.booking_id,
        confirmation.liteapi?.id
      )
    : null;
  return pickSupplierBookingId(flightLeg?.bookingId, fromConfirm);
}

function hotelSupplierIds(trip) {
  return (trip.legs || [])
    .filter((l) => l.type === "hotel" && !String(l.status || "").toLowerCase().includes("cancel"))
    .map((l) => pickSupplierBookingId(l.bookingId))
    .filter(Boolean);
}

function summarizeTrip(trip) {
  const flight = (trip.legs || []).find((l) => l.type === "flight");
  const hotel = (trip.legs || []).find((l) => l.type === "hotel");
  const pkg = (trip.legs || []).find((l) => l.type === "package");
  const train = (trip.legs || []).find((l) => l.type === "train");
  const bus = (trip.legs || []).find((l) => l.type === "bus");
  const evt = (trip.legs || []).find((l) => l.type === "event");

  if (flight) {
    const snap = flight.flightSnapshot || {};
    const airline = canonicalizeAirlineName(
      flight.airline || snap.airline?.name || "",
      flight.airlineCode || snap.airline?.code
    );
    const flightNo = snap.flightNumber || flight.flightNumber || "";
    const origin = String(trip.origin || snap.departure?.airport || "").toUpperCase();
    const dest = String(trip.destination || snap.arrival?.airport || "").toUpperCase();
    const originCity = describeAirport(origin).city || origin;
    const destCity = describeAirport(dest).city || dest;
    const dep = snap.departure?.time || flight.departureTime || "";
    const arr = snap.arrival?.time || flight.arrivalTime || "";
    const paid = trip.status === "confirmed" || Boolean(flight.paymentId);
    return {
      kind: "Flight",
      title: origin && dest ? `${originCity} → ${destCity}` : trip.title || "Flight",
      detail: [airline, flightNo, dep && arr ? `${dep}-${arr}` : null].filter(Boolean).join(" · "),
      pnr: flight.pnr || flight.bookingId || "",
      paid,
      Icon: Plane,
    };
  }
  if (hotel) {
    return {
      kind: "Stay",
      title: hotel.hotelName || trip.title || "Stay",
      detail: [hotel.location, prettyDate(hotel.checkIn), prettyDate(hotel.checkOut) && `→ ${prettyDate(hotel.checkOut)}`]
        .filter(Boolean)
        .join(" · "),
      pnr: hotel.bookingId || "",
      paid: trip.status === "confirmed" || Boolean(hotel.paymentId),
      Icon: Building2,
    };
  }
  if (pkg) {
    return {
      kind: "Package",
      title: pkg.packageTitle || trip.title || "Package",
      detail: [prettyDate(pkg.checkIn), prettyDate(pkg.checkOut) && `→ ${prettyDate(pkg.checkOut)}`]
        .filter(Boolean)
        .join(" "),
      pnr: pkg.packageBookingId || "",
      paid: trip.status === "confirmed",
      Icon: Plane,
    };
  }
  if (train) {
    const pnr = train.pnr || "";
    return {
      kind: "Train",
      title: `${train.from_code || trip.origin || ""} → ${train.to_code || trip.destination || ""}`.trim() || trip.title || "Train",
      detail: [train.number, train.name, train.class_code].filter(Boolean).join(" · "),
      pnr: pnr || train.bookingId || "",
      paid: Boolean(pnr),
      handoff: !pnr,
      Icon: TrainFront,
    };
  }
  if (bus) {
    const kindLabel = bus.kind === "coach" ? "Coach" : "Transit";
    const pnr = bus.pnr || "";
    return {
      kind: kindLabel,
      title:
        `${bus.from_name || trip.origin || ""} → ${bus.to_name || trip.destination || ""}`.trim() ||
        trip.title ||
        kindLabel,
      detail: [bus.operator, bus.bus_type, bus.dep && bus.arr ? `${bus.dep}-${bus.arr}` : bus.dep]
        .filter(Boolean)
        .join(" · "),
      pnr: pnr || bus.bookingId || "",
      paid: Boolean(pnr),
      handoff: !pnr,
      Icon: Bus,
    };
  }
  if (evt) {
    return {
      kind: "Event",
      title: evt.title || trip.title || "Event",
      detail: [evt.venue, evt.when || prettyDate(trip.departDate)].filter(Boolean).join(" · "),
      pnr: "",
      paid: trip.status === "confirmed",
      Icon: Plane,
    };
  }
  return {
    kind: "Trip",
    title: trip.title || "Trip",
    detail: formatDates(trip),
    pnr: "",
    paid: trip.status === "confirmed",
    Icon: Plane,
  };
}

export default function TripsPage() {
  const navigate = useNavigate();
  const { trips, refresh, removeTrip } = useTrips();
  const { formatMoney } = useCurrency();
  const { setPageContext, clearPageContext, openVero } = useVeroUi();
  const [filter, setFilter] = useState("upcoming");
  const [busyId, setBusyId] = useState("");
  const [actionErr, setActionErr] = useState("");
  const [actionMsg, setActionMsg] = useState("");

  React.useEffect(() => {
    const paid = readFlightConfirmation();
    const checkout = readFlightCheckout();
    if (paid?.flight && (paid.paymentId || paid.bookingRef)) {
      if (tripService.importPaidConfirmation(paid)) refresh();
      return;
    }
    if (checkout?.flight) {
      tripService.ensureFlightDraft({
        flight: checkout.flight,
        adults: checkout.travelers?.filter((t) => (t.type || "adult") === "adult").length || 1,
        children: checkout.travelers?.filter((t) => t.type === "child").length || 0,
        infants: checkout.travelers?.filter((t) => t.type === "infant").length || 0,
      });
      refresh();
    }
  }, [refresh]);

  React.useEffect(() => {
    if (filter === "past" && trips.length > 0 && !trips.some(isPast)) {
      setFilter("upcoming");
    }
  }, [filter, trips]);

  React.useEffect(() => {
    setPageContext(buildTripsPageContext({ trips, filter }));
    return () => clearPageContext();
  }, [trips, filter, setPageContext, clearPageContext]);

  const filtered = useMemo(() => {
    return trips.filter((t) => {
      if (filter === "draft" && !(t.status === "draft" || t.status === "held")) return false;
      if (filter === "upcoming" && !isUpcoming(t)) return false;
      if (
        filter === "past" &&
        !(isPast(t) || t.status === "abandoned" || t.status === "cancelled" || t.status === "cancel_pending")
      ) {
        return false;
      }
      return true;
    });
  }, [trips, filter]);

  const counts = useMemo(
    () => ({
      upcoming: trips.filter(isUpcoming).length,
      draft: trips.filter((t) => t.status === "draft" || t.status === "held").length,
      past: trips.filter((t) => isPast(t) || t.status === "abandoned" || t.status === "cancelled").length,
    }),
    [trips]
  );

  const resumeOrView = (trip, e) => {
    e?.stopPropagation?.();
    const flightLeg = (trip.legs || []).find((l) => l.type === "flight");
    if (trip.status === "confirmed" || flightLeg?.paymentId) {
      navigate(`/trips/${trip.id}`);
      return;
    }
    if (trip.status === "draft" || trip.status === "held" || trip.status === "ticket_link") {
      const flight = flightLeg;
      const pkg = (trip.legs || []).find((l) => l.type === "package");
      const evt = (trip.legs || []).find((l) => l.type === "event");
      if (flight && trip.origin && trip.destination) {
        navigate(`/flights?${buildFlightResumeSearchParams(trip).toString()}`);
        return;
      }
      if (pkg?.packageSlug) {
        navigate(`/packages/${pkg.packageSlug}/checkout`);
        return;
      }
      if (evt?.eventId) {
        navigate(`/events/${encodeURIComponent(evt.eventId)}`);
        return;
      }
      const train = (trip.legs || []).find((l) => l.type === "train");
      if (train) {
        navigate(`/trains/book/done?trip=${encodeURIComponent(trip.id)}`);
        return;
      }
      const bus = (trip.legs || []).find((l) => l.type === "bus");
      if (bus) {
        navigate(`/transits/book/done?trip=${encodeURIComponent(trip.id)}`);
        return;
      }
    }
    if (trip.status === "confirmed") {
      const pkg = (trip.legs || []).find((l) => l.type === "package" && l.packageBookingId);
      if (pkg?.packageBookingId) {
        navigate(`/packages/confirmation/${pkg.packageBookingId}`);
        return;
      }
    }
    navigate(`/trips/${trip.id}`);
  };

  async function cancelFromList(trip, e) {
    e?.stopPropagation?.();
    e?.preventDefault?.();
    if (!canCancelTrip(trip)) return;

    const isDraft = trip.status === "draft" || trip.status === "held";
    const flightLeg = (trip.legs || []).find((l) => l.type === "flight");
    const hotelLeg = (trip.legs || []).find((l) => l.type === "hotel");
    const packageLeg = (trip.legs || []).find((l) => l.type === "package" && l.packageBookingId);
    const flightId = flightSupplierId(trip);
    const hotelIds = hotelSupplierIds(trip);
    const paymentId =
      packageLeg?.paymentId || flightLeg?.paymentId || hotelLeg?.paymentId || "";
    const expectedAmount =
      Number(
        packageLeg?.price ||
          flightLeg?.price ||
          hotelLeg?.price ||
          primaryPrice(trip)?.price
      ) || null;

    if (isDraft) {
      if (!window.confirm("Discard this draft?")) return;
      setBusyId(trip.id);
      setActionErr("");
      setActionMsg("");
      try {
        removeTrip(trip.id);
        refresh();
        setActionMsg("Draft removed.");
      } finally {
        setBusyId("");
      }
      return;
    }

    setBusyId(trip.id);
    setActionErr("");
    setActionMsg("");
    try {
      const errors = [];
      let lastRes = null;
      const email =
        trip?.contact?.email ||
        (typeof sessionStorage !== "undefined" && packageLeg?.packageBookingId
          ? sessionStorage.getItem(`itinero_pkg_email_${packageLeg.packageBookingId}`)
          : "") ||
        "";
      if (packageLeg?.packageBookingId) {
        const res = await cancelPackageWithRefund({
          packageBookingId: packageLeg.packageBookingId,
          email,
          paidAmount: expectedAmount,
          paymentId: packageLeg.paymentId || paymentId || null,
          paymentProvider: packageLeg.paymentProvider || trip?.paymentProvider || "itinero_stripe",
        });
        if (res?.aborted) return;
        lastRes = res;
        if (!res?.ok) errors.push(res?.error || res?.message || "Package cancel failed.");
      } else if (flightId) {
        const res = await cancelFlightWithQuote({
          bookingId: flightId,
          paymentId,
          expectedAmount,
          paymentProvider: trip?.paymentProvider || flightLeg?.paymentProvider || "stripe",
          email,
        });
        if (res?.aborted) return;
        lastRes = res;
        if (!res?.ok) errors.push(res?.error || res?.message || "Flight cancel failed.");
      }
      if (!packageLeg?.packageBookingId) {
        for (const hid of hotelIds) {
          const res = await cancelHotelWithPolicy({
            bookingId: hid,
            paymentId: hotelLeg?.paymentId || paymentId,
            expectedAmount: Number(hotelLeg?.price) || expectedAmount,
            paymentProvider: trip?.paymentProvider || hotelLeg?.paymentProvider || "stripe",
            email,
          });
          if (res?.aborted) return;
          lastRes = res;
          if (!res?.ok) errors.push(res?.error || res?.message || "Stay cancel failed.");
        }
      }
      if (!packageLeg?.packageBookingId && !flightId && !hotelIds.length && paymentId) {
        setActionErr(
          "No airline/hotel ticket on this trip. Contact support with your payment reference for a refund."
        );
        return;
      } else if (!packageLeg?.packageBookingId && !flightId && !hotelIds.length) {
        if (!window.confirm("Remove this trip from the list?")) return;
      }

      tripService.markTripCancelled(trip.id, refundPatchFromResult(lastRes || {}));
      refresh();
      if (errors.length) setActionErr(errors.join(" "));
      else setActionMsg(formatCancelResultMessage(lastRes) || "Cancelled.");
    } catch (err) {
      setActionErr(err?.message || "Cancel failed.");
    } finally {
      setBusyId("");
    }
  }

  const askVero = () =>
    openVero(
      trips.length
        ? "Help me with my trips - what’s next to book or confirm?"
        : "Help me start a trip - flights, stay, or a full plan."
    );

  return (
    <PageLayout>
      <div className={styles.page}>
        <header className={styles.head}>
          <div>
            <p className={styles.kicker}>Your travel</p>
            <h1 className={styles.title}>My Trips</h1>
            <p className={styles.lede}>Bookings and drafts in one place.</p>
          </div>
          <ActionRow align="end" className={styles.headActions}>
            <ActionButton variant="ghost" pill onClick={askVero}>
              <Sparkles size={16} aria-hidden /> Ask Vero
            </ActionButton>
            <ActionButton to="/flights" pill>
              Book a flight
            </ActionButton>
          </ActionRow>
        </header>

        {trips.length > 0 ? (
          <div className={styles.tabs} role="tablist" aria-label="Trip list">
            {TABS.map((t) => {
              const n = counts[t.id] || 0;
              return (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={filter === t.id}
                  className={filter === t.id ? styles.tabOn : styles.tab}
                  onClick={() => setFilter(t.id)}
                >
                  {t.label}
                  {n > 0 ? <span>{n}</span> : null}
                </button>
              );
            })}
          </div>
        ) : null}

        {actionMsg ? <p className={styles.msgOk}>{actionMsg}</p> : null}
        {actionErr ? <p className={styles.msgErr}>{actionErr}</p> : null}

        {trips.length === 0 ? (
          <section className={styles.empty}>
            <h2>Nothing here yet</h2>
            <p>When you book or start a checkout, it shows up here.</p>
            <div className={styles.emptyLinks}>
              <Link to="/flights">Flights</Link>
              <Link to="/hotels">Stays</Link>
              <Link to="/packages">Packages</Link>
            </div>
          </section>
        ) : filtered.length === 0 ? (
          <section className={styles.empty}>
            <h2>Nothing in {TABS.find((t) => t.id === filter)?.label}</h2>
            <p>Try another tab, or book something new.</p>
            <button type="button" className={styles.btnSoft} onClick={() => setFilter("upcoming")}>
              Show upcoming
            </button>
          </section>
        ) : (
          <ul className={styles.list}>
            {filtered.map((trip) => {
              const sum = summarizeTrip(trip);
              const priced = primaryPrice(trip);
              const draftish = trip.status === "draft" || trip.status === "held";
              const cta = draftish ? "Resume" : "Open";
              const Icon = sum.Icon;
              return (
                <li key={trip.id}>
                  <article
                    className={styles.card}
                    role="button"
                    tabIndex={0}
                    onClick={() => navigate(`/trips/${trip.id}`)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        navigate(`/trips/${trip.id}`);
                      }
                    }}
                  >
                    <div className={styles.cardTop}>
                      <span className={styles.kind}>
                        <Icon size={14} aria-hidden /> {sum.kind}
                      </span>
                      <span className={`${styles.status} ${statusTone(trip.status)}`}>
                        {sum.paid ? "Paid" : sum.handoff ? "Partner ticket" : statusLabel(trip.status)}
                      </span>
                    </div>

                    <h2 className={styles.cardTitle}>{sum.title}</h2>
                    <p className={styles.cardDetail}>{sum.detail || formatDates(trip)}</p>

                    <div className={styles.cardFoot}>
                      <div className={styles.meta}>
                        <span>{formatDates(trip)}</span>
                        {sum.paid && sum.pnr ? <span className={styles.pnr}>{sum.pnr}</span> : null}
                        {priced ? <strong>{formatMoney(priced.price)}</strong> : null}
                      </div>
                      <div className={styles.actions}>
                        {canCancelTrip(trip) ? (
                          <button
                            type="button"
                            className={styles.btnGhost}
                            disabled={busyId === trip.id}
                            onClick={(e) => cancelFromList(trip, e)}
                          >
                            {busyId === trip.id ? "…" : draftish ? "Discard" : "Cancel"}
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className={styles.btnPrimary}
                          onClick={(e) => resumeOrView(trip, e)}
                        >
                          {cta}
                        </button>
                      </div>
                    </div>
                  </article>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </PageLayout>
  );
}
