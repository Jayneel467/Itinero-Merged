import api from "@/services/api";
import { ENDPOINTS } from "@/services/endpoints";
import { isSupplierBookingId, pickSupplierBookingId } from "./utils/supplierBooking";
import {
  loadTrips,
  saveTrips,
  markAbandoned,
  findFlightTrip,
  findPackageTrip,
  createFlightDraftTrip,
  createPackageDraftTrip,
  createHotelDraftTrip,
  createTrainPendingTrip,
  createBusPendingTrip,
  patchTrip,
  patchFlightLeg,
  patchHotelLeg,
  patchTrainLeg,
  patchBusLeg,
} from "./utils/tripFactory";

function pushTrip(trip) {
  if (!trip?.id) return;
  api.put(ENDPOINTS.TRIPS.UPSERT, { trip }).catch(() => {});
}

function deleteRemoteTrip(id) {
  if (!id) return;
  api.delete(ENDPOINTS.TRIPS.ONE(id)).catch(() => {});
}

/**
 * Imperative trip store helpers (usable outside React, e.g. BookingPopup).
 */
export const tripService = {
  list() {
    const trips = markAbandoned(loadTrips());
    const prevRaw = localStorage.getItem("itinero_trips") || "[]";
    const nextRaw = JSON.stringify(trips);
    if (prevRaw !== nextRaw) saveTrips(trips);
    return [...trips].sort(
      (a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt)
    );
  },

  get(id) {
    return this.list().find((t) => t.id === id) || null;
  },

  upsert(trip) {
    if (!trip?.id) return null;
    const trips = loadTrips();
    const idx = trips.findIndex((t) => t.id === trip.id);
    const next = patchTrip(trip, {});
    if (idx >= 0) trips[idx] = next;
    else trips.unshift(next);
    saveTrips(trips);
    notify();
    pushTrip(next);
    return next;
  },

  remove(id) {
    const trips = loadTrips().filter((t) => t.id !== id);
    saveTrips(trips);
    notify();
    deleteRemoteTrip(id);
  },

  async syncFromServer() {
    try {
      const data = await api.get(ENDPOINTS.TRIPS.LIST);
      const remote = Array.isArray(data?.trips) ? data.trips : [];
      if (!remote.length) return this.list();
      const local = loadTrips();
      const byId = new Map(local.map((t) => [t.id, t]));
      for (const trip of remote) {
        if (!trip?.id) continue;
        const cur = byId.get(trip.id);
        if (!cur || new Date(trip.updatedAt || 0) >= new Date(cur.updatedAt || 0)) {
          byId.set(trip.id, trip);
        }
      }
      saveTrips([...byId.values()]);
      notify();
    } catch {
      /* offline / supervisor down - keep local */
    }
    return this.list();
  },

  /** Create or update draft when flight booking starts. */
  ensureFlightDraft(params) {
    const trips = loadTrips();
    const offerId = String(
      params.flight?.offer_id || params.flight?.offerId || params.flight?.id || ""
    );
    const existing = findFlightTrip(trips, {
      sessionId: params.sessionId,
      offerId,
    });
    if (existing) {
      const snap = params.flight;
      const updated = patchFlightLeg(
        existing,
        {
          sessionId: params.sessionId || existing.legs?.[0]?.sessionId,
          offerId: offerId || existing.legs?.[0]?.offerId,
          airline: params.flight?.airline?.name || existing.legs?.[0]?.airline,
          price: Number(params.flight?.price) || existing.legs?.[0]?.price,
          currency: params.flight?.currency || existing.legs?.[0]?.currency,
          status: "draft",
          departureTime: snap?.departure?.time || existing.legs?.[0]?.departureTime,
          arrivalTime: snap?.arrival?.time || existing.legs?.[0]?.arrivalTime,
          duration: snap?.duration || existing.legs?.[0]?.duration,
          stops: snap?.stops ?? existing.legs?.[0]?.stops,
          flightSnapshot: snap
            ? {
                id: offerId,
                offer_id: offerId,
                airline: snap.airline || null,
                flightNumber: snap.flightNumber || null,
                departure: snap.departure || null,
                arrival: snap.arrival || null,
                departureAt: snap.departureAt || null,
                duration: snap.duration || null,
                stops: snap.stops || null,
                price: Number(snap.price) || null,
                currency: snap.currency || null,
                cabin: snap.cabin || null,
              }
            : existing.legs?.[0]?.flightSnapshot || null,
        },
        "draft"
      );
      const departIso =
        (params.departDate && String(params.departDate).slice(0, 10)) ||
        (snap?.departureAt && String(snap.departureAt).slice(0, 10)) ||
        existing.departDate;
      return this.upsert(
        patchTrip(updated, {
          departDate:
            /^\d{4}-\d{2}-\d{2}/.test(String(departIso || ""))
              ? String(departIso).slice(0, 10)
              : existing.departDate,
          travelers: {
            adults: Math.max(1, Number(params.adults) || existing.travelers?.adults || 1),
            children: Math.max(0, Number(params.children) || existing.travelers?.children || 0),
            infants: Math.max(0, Number(params.infants) || existing.travelers?.infants || 0),
          },
        })
      );
    }
    return this.upsert(createFlightDraftTrip(params));
  },

  markFlightHeld({ sessionId, offerId, prebookId, price, currency }) {
    const trips = loadTrips();
    const existing = findFlightTrip(trips, { sessionId, offerId });
    if (!existing) return null;
    return this.upsert(
      patchFlightLeg(
        existing,
        {
          status: "held",
          prebookId: prebookId || null,
          price: price ?? existing.legs.find((l) => l.type === "flight")?.price,
          currency:
            currency || existing.legs.find((l) => l.type === "flight")?.currency,
        },
        "held"
      )
    );
  },

  markFlightConfirmed({
    sessionId,
    offerId,
    booking,
    contact,
    passengers,
  }) {
    const trips = loadTrips();
    let existing = findFlightTrip(trips, { sessionId, offerId });
    if (!existing && booking?.booking_id) {
      existing = trips.find((t) =>
        (t.legs || []).some(
          (l) => l.type === "flight" && l.bookingId === booking.booking_id
        )
      );
    }
    if (!existing) return null;

    const flightLeg = existing.legs.find((l) => l.type === "flight") || {};
    const bookingId =
      booking?.booking_id || booking?.bookingId || booking?.id || null;
    const pnr =
      booking?.airline_pnr ||
      booking?.booking_ref ||
      booking?.pnr ||
      null;

    return this.upsert(
      patchTrip(
        patchFlightLeg(
          existing,
          {
            status: "confirmed",
            prebookId: booking?.prebook_id || flightLeg.prebookId,
            bookingId,
            pnr,
            paymentId: booking?.payment_id || booking?.paymentId || flightLeg.paymentId,
            price: booking?.total_price ?? booking?.price ?? flightLeg.price,
            currency: booking?.currency || flightLeg.currency,
            segmentsSummary: booking?.segments_summary || flightLeg.segmentsSummary,
            airline:
              flightLeg.airline ||
              booking?.segments_summary?.[0]?.airline ||
              null,
            airlineCode:
              flightLeg.airlineCode ||
              booking?.segments_summary?.[0]?.airline_code ||
              null,
            depTerminal:
              flightLeg.depTerminal ||
              booking?.segments_summary?.[0]?.departure_terminal ||
              booking?.segments_summary?.[0]?.dep_terminal ||
              null,
            arrTerminal: (() => {
              const segs = booking?.segments_summary || [];
              const last = segs[segs.length - 1] || {};
              return (
                flightLeg.arrTerminal ||
                last.arrival_terminal ||
                last.arr_terminal ||
                null
              );
            })(),
          },
          "confirmed"
        ),
        {
          contact: contact
            ? {
                email: contact.email || null,
                phone: contact.phone || null,
                name: contact.name || null,
              }
            : existing.contact,
          passengers: passengers || existing.passengers || null,
        }
      )
    );
  },

  /** Save a Ticketmaster event when the user opens Get tickets. */
  recordEventIntent(event) {
    if (!event?.id) return null;
    const existing = this.list().find(
      (t) => t.type === "event" && (t.legs || []).some((l) => l.eventId === event.id)
    );
    const trip = {
      id: existing?.id || `evt-${event.id}`,
      title: event.name || "Event",
      type: "event",
      status: "ticket_link",
      destination: event.city || "",
      departDate: event.localDate || "",
      createdAt: existing?.createdAt || new Date().toISOString(),
      legs: [
        {
          type: "event",
          status: "ticket_link",
          title: event.name,
          venue: event.venue,
          when: event.when,
          url: event.url,
          eventId: event.id,
          price: event.price,
          image: event.image,
        },
      ],
    };
    return this.upsert(trip);
  },

  /**
   * Always persist a paid fare into My Trips.
   * Creates the trip if no draft exists (Vero / passenger checkout).
   */
  recordPaidFlight({
    flight,
    travelers = [],
    contact = {},
    paymentId,
    bookingRef,
    supplierBookingId,
    amount,
    currency,
  } = {}) {
    if (!flight && !paymentId) return null;
    const trips = loadTrips();
    const offerId = String(flight?.offerId || flight?.offer_id || flight?.id || "");
    const adults = travelers.filter((t) => (t.type || "adult") === "adult").length || travelers.length || 1;
    const children = travelers.filter((t) => t.type === "child").length;
    const infants = travelers.filter((t) => t.type === "infant").length;

    let existing =
      (paymentId &&
        trips.find((t) =>
          (t.legs || []).some((l) => l.type === "flight" && l.paymentId === paymentId)
        )) ||
      (bookingRef &&
        trips.find((t) =>
          (t.legs || []).some(
            (l) => l.type === "flight" && (l.bookingId === bookingRef || l.pnr === bookingRef)
          )
        )) ||
      findFlightTrip(trips, { offerId }) ||
      (offerId &&
        trips.find((t) =>
          (t.legs || []).some((l) => l.type === "flight" && String(l.offerId) === offerId)
        )) ||
      null;

    if (!existing && flight) {
      existing = createFlightDraftTrip({
        flight,
        origin: flight.departure?.airport || flight.origin,
        destination: flight.arrival?.airport || flight.destination || flight.dest,
        departDate: flight.departure?.date || flight.departureAt,
        adults,
        children,
        infants,
      });
    }
    if (!existing) return null;

    const leadName = [travelers[0]?.firstName, travelers[0]?.lastName].filter(Boolean).join(" ");
    const prevLeg = existing.legs?.[0] || {};
    const supplierId = pickSupplierBookingId(
      supplierBookingId,
      bookingRef,
      prevLeg.bookingId
    );
    const displayRef = isSupplierBookingId(bookingRef) ? null : bookingRef || null;
    return this.upsert(
      patchTrip(
        patchFlightLeg(
          existing,
          {
            status: "confirmed",
            offerId: offerId || prevLeg.offerId,
            bookingId: supplierId || prevLeg.bookingId || displayRef,
            pnr: displayRef || prevLeg.pnr || null,
            paymentId: paymentId || prevLeg.paymentId,
            price: amount ?? Number(flight?.price) ?? prevLeg.price,
            currency: currency || flight?.currencyCode || flight?.currency || prevLeg.currency,
            airline: flight?.airline?.name || flight?.airline || prevLeg.airline,
            airlineCode: flight?.airline?.code || prevLeg.airlineCode,
            departureTime: flight?.departure?.time || prevLeg.departureTime,
            arrivalTime: flight?.arrival?.time || prevLeg.arrivalTime,
            duration: flight?.duration || prevLeg.duration,
            stops: flight?.stops ?? prevLeg.stops,
            flightSnapshot: flight || prevLeg.flightSnapshot,
          },
          "confirmed"
        ),
        {
          contact: {
            email: contact.email || existing.contact?.email || null,
            phone: contact.phone || existing.contact?.phone || null,
            name: leadName || existing.contact?.name || null,
          },
          passengers: travelers.length ? travelers : existing.passengers || null,
          travelers: {
            adults,
            children,
            infants,
          },
        }
      )
    );
  },

  importPaidConfirmation(confirmation) {
    if (!confirmation?.flight) return null;
    const trips = loadTrips();
    const payId = confirmation.paymentId;
    const ref = confirmation.bookingRef;
    const already = trips.some((t) =>
      (t.legs || []).some(
        (l) =>
          l.type === "flight" &&
          ((payId && l.paymentId === payId) || (ref && (l.bookingId === ref || l.pnr === ref)))
      )
    );
    if (already) return trips.find((t) => t.status === "confirmed") || null;
    return this.recordPaidFlight(confirmation);
  },

  ensurePackageDraft(params) {
    const trips = loadTrips();
    const existing = findPackageTrip(trips, {
      packageId: params.pkg?.id,
      packageSlug: params.pkg?.slug,
      checkIn: params.checkIn,
    });
    if (existing) return this.upsert(patchTrip(existing, {}));
    return this.upsert(createPackageDraftTrip(params));
  },

  markPackageConfirmed({
    packageId,
    packageSlug,
    packageBookingId,
    checkIn,
    guest,
    title,
    paymentId,
    paymentProvider,
    amount,
  }) {
    const trips = loadTrips();
    let existing = findPackageTrip(trips, { packageId, packageSlug, checkIn });
    if (!existing) {
      existing = createPackageDraftTrip({
        pkg: { id: packageId, slug: packageSlug, title },
        checkIn,
      });
    }
    const legs = (existing.legs || []).map((leg) =>
      leg.type === "package"
        ? {
            ...leg,
            status: "confirmed",
            packageBookingId,
            packageId: packageId || leg.packageId,
            packageSlug: packageSlug || leg.packageSlug,
            paymentId: paymentId || leg.paymentId || null,
            paymentProvider: paymentProvider || leg.paymentProvider || "itinero_stripe",
            price: amount != null ? amount : leg.price,
          }
        : leg
    );
    return this.upsert(
      patchTrip(existing, {
        status: "confirmed",
        paymentProvider: paymentProvider || existing.paymentProvider || "itinero_stripe",
        legs,
        contact: guest
          ? {
              email: guest.email || null,
              phone: guest.phone || null,
              name: [guest.firstName, guest.lastName].filter(Boolean).join(" ") || null,
            }
          : existing.contact,
      })
    );
  },

  ensureHotelTrip(params) {
    const trips = loadTrips();
    const bookingId = params.bookingId || null;
    const hotelId = params.hotelId || null;
    const existing =
      (bookingId &&
        trips.find((t) =>
          (t.legs || []).some((l) => l.type === "hotel" && l.bookingId === bookingId)
        )) ||
      (hotelId &&
        params.confirmed &&
        trips.find((t) =>
          (t.legs || []).some(
            (l) =>
              l.type === "hotel" &&
              l.hotelId === hotelId &&
              (t.status === "draft" || t.status === "held")
          )
        )) ||
      null;
    if (existing && params.confirmed) {
      return this.upsert(
        patchHotelLeg(
          existing,
          {
            status: "confirmed",
            hotelId: hotelId || existing.legs.find((l) => l.type === "hotel")?.hotelId,
            hotelName: params.hotelName,
            location: params.location,
            checkIn:
              typeof params.checkIn === "string"
                ? params.checkIn
                : params.checkIn?.date || null,
            checkOut:
              typeof params.checkOut === "string"
                ? params.checkOut
                : params.checkOut?.date || null,
            guests: params.guests,
            rooms: params.rooms,
            price: params.totalPrice,
            paymentId: params.paymentId || null,
            bookingId: bookingId,
            prebookId: params.prebookId || null,
            hotelConfirmationCode: params.hotelConfirmationCode || null,
          },
          "confirmed"
        )
      );
    }
    return this.upsert(createHotelDraftTrip(params));
  },

  markFlightCancelled({ tripId, bookingId, refund = {} }) {
    const trips = loadTrips();
    const trip =
      (tripId && this.get(tripId)) ||
      trips.find((t) =>
        (t.legs || []).some(
          (l) => l.type === "flight" && bookingId && l.bookingId === bookingId
        )
      );
    if (!trip) return null;
    const pending = Boolean(refund.cancelPending);
    return this.upsert(
      patchFlightLeg(
        trip,
        {
          status: pending ? "cancel_pending" : "cancelled",
          bookingId: bookingId || trip.legs.find((l) => l.type === "flight")?.bookingId,
          refundAmount: refund.refundAmount ?? null,
          refundCurrency: refund.refundCurrency || "INR",
          cancellationFee: refund.cancellationFee ?? null,
          razorpayRefundId: refund.razorpayRefundId || null,
          refundStatus: refund.refundStatus || null,
          cancelPending: pending,
        },
        pending ? "cancel_pending" : "cancelled"
      )
    );
  },

  markTripCancelled(tripId, refund = {}) {
    const trip = this.get(tripId);
    if (!trip) return null;
    const pending = Boolean(refund.cancelPending);
    const legs = (trip.legs || []).map((leg) => {
      if (leg.type === "flight" || leg.type === "hotel" || leg.type === "package") {
        return {
          ...leg,
          status: pending ? "cancel_pending" : "cancelled",
          refundAmount: refund.refundAmount ?? leg.refundAmount ?? null,
          refundCurrency: refund.refundCurrency || leg.refundCurrency || "INR",
          cancellationFee: refund.cancellationFee ?? leg.cancellationFee ?? null,
          refundStatus: refund.refundStatus || leg.refundStatus || null,
          cancelPending: pending,
        };
      }
      return leg;
    });
    return this.upsert(
      patchTrip({ ...trip, legs }, { status: pending ? "cancel_pending" : "cancelled" })
    );
  },

  markHotelCancelled({ tripId, bookingId, refund = {} }) {
    const trips = loadTrips();
    const trip =
      (tripId && this.get(tripId)) ||
      trips.find((t) =>
        (t.legs || []).some(
          (l) => l.type === "hotel" && bookingId && l.bookingId === bookingId
        )
      );
    if (!trip) return null;
    const pending = Boolean(refund.cancelPending);
    return this.upsert(
      patchHotelLeg(
        trip,
        {
          status: pending ? "cancel_pending" : "cancelled",
          bookingId: bookingId || trip.legs.find((l) => l.type === "hotel")?.bookingId,
          refundAmount: refund.refundAmount ?? null,
          refundCurrency: refund.refundCurrency || "INR",
          cancellationFee: refund.cancellationFee ?? null,
          razorpayRefundId: refund.razorpayRefundId || null,
          refundStatus: refund.refundStatus || null,
          cancelPending: pending,
        },
        pending ? "cancel_pending" : "cancelled"
      )
    );
  },

  recordPendingTrain(params) {
    return this.upsert(createTrainPendingTrip(params));
  },

  recordPendingBus(params) {
    return this.upsert(createBusPendingTrip(params));
  },

  attachTrainPnr(tripId, pnr) {
    const digits = String(pnr || "").replace(/\D/g, "");
    if (!/^\d{10}$/.test(digits)) return null;
    const trip = this.get(tripId);
    if (!trip) return null;
    return this.upsert(patchTrainLeg(trip, { pnr: digits, status: "confirmed" }, "confirmed"));
  },

  patchLegFromRemote({ tripId, legType, patch, tripStatus }) {
    const trip = this.get(tripId);
    if (!trip) return null;
    if (legType === "hotel") {
      return this.upsert(patchHotelLeg(trip, patch, tripStatus));
    }
    if (legType === "flight") {
      return this.upsert(patchFlightLeg(trip, patch, tripStatus));
    }
    if (legType === "train") {
      return this.upsert(patchTrainLeg(trip, patch, tripStatus));
    }
    if (legType === "bus") {
      return this.upsert(patchBusLeg(trip, patch, tripStatus));
    }
    return null;
  },
};

const listeners = new Set();

function notify() {
  listeners.forEach((fn) => {
    try {
      fn();
    } catch {
      /* ignore */
    }
  });
}

export function subscribeTrips(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
