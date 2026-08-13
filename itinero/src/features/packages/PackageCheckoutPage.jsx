import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Lock, ShieldCheck } from "lucide-react";
import { PageLayout } from "@/components/layout";
import { useCurrency } from "@/context/CurrencyContext";
import { APP_CONFIG } from "@/app/config";
import { tripService } from "@/features/trips/tripService";
import { hotelService } from "@/features/hotels/services/hotelService";
import { registerPaymentIntent } from "@/features/booking/services/paymentService";
import { loadStripeJs } from "@/features/booking/services/loadStripeJs";
import { packageService } from "./services/packageService";
import PackageItineraryList from "./components/PackageItineraryList";
import { LoadingDots, LoadingState, PlacesPhotoImg, LoyaltyEarnBanner } from "@/components/shared";
import { useLoyaltyEstimate } from "@/features/booking/hooks/useLoyaltyEstimate";
import PointsRedeemPanel from "@/features/booking/components/PointsRedeemPanel";
import { interestService } from "@/services/interestTracker";
import styles from "./PackageCheckoutPage.module.css";

function readItineroStripePublishableKey(intent) {
  const fromIntent = String(intent?.publishable_key || "").trim();
  if (fromIntent.startsWith("pk_")) return fromIntent;
  const env = String(APP_CONFIG.ITINERO_STRIPE_PUBLISHABLE_KEY || "").trim();
  return env.startsWith("pk_") ? env : null;
}

export default function PackageCheckoutPage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { formatMoney, currency } = useCurrency();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [phase, setPhase] = useState("form");
  const [hold, setHold] = useState(null);
  const [flightHold, setFlightHold] = useState(null);
  const [paymentHold, setPaymentHold] = useState(null);
  const [loyaltyRedemption, setLoyaltyRedemption] = useState(null);
  const [promoCode, setPromoCode] = useState("");
  const [promoOffer, setPromoOffer] = useState(null);
  const [promoMsg, setPromoMsg] = useState("");
  const [cardReady, setCardReady] = useState(false);
  const [hydrating, setHydrating] = useState(!location.state?.quote);
  const [pkg, setPkg] = useState(location.state?.package || null);
  const [quote, setQuote] = useState(location.state?.quote || null);
  const [guest, setGuest] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
  });

  const cardMountRef = useRef(null);
  const stripeRef = useRef(null);
  const cardRef = useRef(null);

  const checkIn = location.state?.checkIn || searchParams.get("checkIn") || "";
  const checkOut = location.state?.checkOut || searchParams.get("checkOut") || "";
  const guests = Number(location.state?.guests || searchParams.get("guests") || 2);
  const origin = location.state?.origin || null;
  const flight = location.state?.flight || null;

  useEffect(() => {
    if (pkg && quote) {
      setHydrating(false);
      return;
    }
    if (!slug || !checkIn || !checkOut) {
      setHydrating(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setHydrating(true);
      const detail = await packageService.get(slug, {
        check_in: checkIn,
        check_out: checkOut,
        guests,
      });
      const quoted = await packageService.quote(slug, {
        check_in: checkIn,
        check_out: checkOut,
        guests,
        rooms: 1,
      });
      if (!cancelled) {
        setPkg(detail.package || null);
        setQuote(quoted.quote || quoted || null);
        setHydrating(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug, checkIn, checkOut, guests, pkg, quote]);

  const pricing = quote?.pricing || quote || {};
  const room = quote?.room || quote?.stays?.[0]?.room || null;
  const hotel = quote?.hotel || quote?.stays?.[0]?.hotel || null;
  const payHotel = Number(pricing.payHotel ?? pricing.stayTotal ?? room?.totalPrice ?? 0) || 0;
  const payFlight = Number(pricing.payFlight ?? pricing.flightTotal ?? quote?.flightTotal ?? 0) || 0;
  const payMargin = Number(pricing.payMargin ?? pricing.payItinero ?? pricing.packageMargin ?? 0) || 0;
  const promoDiscount =
    promoOffer && payMargin > 0
      ? promoOffer.discount_type === "percent"
        ? Math.min(payMargin, (payMargin * Number(promoOffer.discount_value || 0)) / 100)
        : Math.min(payMargin, Number(promoOffer.discount_value || 0))
      : 0;
  const totalBase =
    Number(pricing.payNow ?? pricing.bookableTotal ?? payHotel + payFlight + payMargin) || null;
  const total =
    totalBase != null ? Math.max(0, Number(totalBase) - promoDiscount) : null;
  const chargeTotal =
    loyaltyRedemption?.chargeAmount != null
      ? Math.max(0, Number(loyaltyRedemption.chargeAmount) - promoDiscount)
      : total;
  const honesty =
    pricing.honesty || "One secure payment to Itinero. Hotel and flights fulfilled via LiteAPI.";
  const needsFlightHold = payFlight > 0 && Boolean(flight?.offerId || flight?.id);

  const { estimate: loyaltyEstimate, loading: loyaltyLoading } = useLoyaltyEstimate(
    total,
    currency || "INR"
  );

  useEffect(() => {
    if (!pkg) return;
    tripService.ensurePackageDraft({ pkg, checkIn, checkOut, guests, origin });
  }, [pkg, checkIn, checkOut, guests, origin]);

  const stripePk = readItineroStripePublishableKey(paymentHold);
  const sdkReady = Boolean(paymentHold?.client_secret && stripePk);
  const allowMock = Boolean(hold?.allow_mock_payment);

  useEffect(() => {
    if (phase !== "pay" || !sdkReady || !paymentHold?.client_secret) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const Stripe = await loadStripeJs();
        if (cancelled || !cardMountRef.current) return;
        const stripe = Stripe(stripePk);
        const elements = stripe.elements();
        const card = elements.create("card", {
          style: {
            base: {
              fontSize: "16px",
              color: "#001438",
              "::placeholder": { color: "#98a2b3" },
            },
          },
        });
        card.mount(cardMountRef.current);
        stripeRef.current = stripe;
        cardRef.current = card;
        if (!cancelled) setCardReady(true);
      } catch (err) {
        if (!cancelled) setError(err?.message || "Could not load payment form.");
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
      stripeRef.current = null;
      setCardReady(false);
    };
  }, [phase, paymentHold?.client_secret, sdkReady, stripePk]);

  const ready = useMemo(
    () =>
      pkg &&
      quote &&
      guest.firstName.trim() &&
      guest.lastName.trim() &&
      guest.email.trim() &&
      String(guest.phone || "").replace(/\D/g, "").length >= 8,
    [pkg, quote, guest]
  );

  if (hydrating) {
    return (
      <PageLayout>
        <div className={styles.wrap}>
          <LoadingState title="Loading checkout" message="Fetching your package quote…" skeleton="lines" count={3} />
        </div>
      </PageLayout>
    );
  }

  if (!pkg || !quote) {
    return (
      <PageLayout>
        <div className={styles.wrap}>
          <p className={styles.missing}>Missing package quote. Go back and select dates again.</p>
          <button type="button" className={styles.secondaryBtn} onClick={() => navigate(`/packages/${slug}`)}>
            Back to package
          </button>
        </div>
      </PageLayout>
    );
  }

  const finishBook = async ({ paymentId, mockPayment, expectedAmount }) => {
    const res = await packageService.book({
      package_id: pkg.id || slug,
      check_in: checkIn,
      check_out: checkOut,
      guests,
      rooms: 1,
      offer_id: room?.offerId || room?.id || null,
      hotel_id: hotel?.id || room?.hotelId || null,
      mock_payment: Boolean(mockPayment),
      single_payment: true,
      guest,
      room,
      hotel,
      flight,
      prebook_id: hold?.prebook_id,
      expected_amount: expectedAmount,
      itinero_amount: chargeTotal ?? total,
      itinero_payment_id: paymentId || undefined,
      itinero_payment_provider: paymentId ? "itinero_stripe" : undefined,
      loyalty_redemption_id: loyaltyRedemption?.redemptionId || undefined,
      promo_code: promoOffer?.code || undefined,
      flight_prebook_id: flightHold?.prebook_id || undefined,
      flight_expected_amount: payFlight > 0 ? payFlight : undefined,
      flight_session_id: flightHold?.sessionId || undefined,
      currency: currency || "INR",
    });
    if (!res?.ok) throw new Error(res?.message || "Could not complete package booking.");
    tripService.markPackageConfirmed({
      packageId: pkg.id || slug,
      packageSlug: pkg.slug || slug,
      packageBookingId: res.bookingId,
      checkIn,
      guest,
      title: pkg.title,
      paymentId: paymentId || null,
      paymentProvider: paymentId ? "itinero_stripe" : null,
      amount: expectedAmount || null,
    });
    try {
      if (guest?.email && res.bookingId) {
        sessionStorage.setItem(`itinero_pkg_email_${res.bookingId}`, String(guest.email).trim());
      }
    } catch {
      /* ignore */
    }
    navigate(`/packages/confirmation/${res.bookingId}`, {
      state: { booking: res.booking, guest, emailSent: Boolean(res.emailSent) },
    });
  };

  const handleHold = async (e) => {
    e?.preventDefault?.();
    if (!ready || busy) return;
    setBusy(true);
    setError("");
    setStatus("Holding your stay…");
    try {
      const offerId = room?.offerId || room?.id;
      if (!offerId) throw new Error("Missing room offer - go back and pick dates again.");

      const prebookRes = await hotelService.prebook({
        offer_id: offerId,
        currency: currency || "INR",
        use_payment_sdk: false,
        hotel_id: hotel?.id || room?.hotelId || undefined,
        check_in: checkIn || undefined,
        check_out: checkOut || undefined,
        guests,
        rooms: 1,
        room_title: room?.title || room?.name || room?.roomName || undefined,
        room_board: room?.board || undefined,
        target_price: payHotel || undefined,
      });
      if (!prebookRes?.ok || !prebookRes?.prebook?.prebook_id) {
        throw new Error(prebookRes?.message || prebookRes?.error || "Could not hold this stay.");
      }
      setHold(prebookRes.prebook);

      if (needsFlightHold && origin) {
        setStatus("Holding flights…");
        const fh = await packageService.holdFlight({
          package_id: pkg.id || slug,
          origin,
          check_in: checkIn,
          check_out: checkOut,
          guests,
          currency: currency || "INR",
          flight_offer_id: flight?.offerId || flight?.id || undefined,
          guest,
        });
        if (!fh?.ok || !fh?.prebook?.prebook_id) {
          throw new Error(fh?.message || "Could not hold flights for this package.");
        }
        setFlightHold({ ...fh.prebook, sessionId: fh.sessionId });
      }

      if (total > 0) {
        setStatus("Preparing secure checkout…");
        const intent = await packageService.createItineroPaymentIntent({
          package_id: pkg.id || slug,
          amount: total,
          currency: currency || "INR",
          email: guest.email.trim(),
          prebook_id: prebookRes.prebook.prebook_id,
          loyalty_redemption_id: loyaltyRedemption?.redemptionId || undefined,
        });
        if (!intent?.ok || !intent?.client_secret) {
          throw new Error(intent?.message || "Could not start checkout.");
        }
        setPaymentHold(intent);
      }

      await registerPaymentIntent({
        prebook_id: prebookRes.prebook.prebook_id,
        kind: "package",
        amount: total,
        currency: currency || "INR",
        email: guest.email.trim(),
        payload: {
          package_id: pkg.id || slug,
          hotel_name: hotel?.name,
          check_in: checkIn,
          check_out: checkOut,
          total,
        },
      });

      setPhase("pay");
      setStatus("Ready - enter card details for one combined payment.");
    } catch (err) {
      setError(err?.message || "Could not prepare checkout.");
      setStatus("");
    } finally {
      setBusy(false);
    }
  };

  const handlePay = async () => {
    if (!hold?.prebook_id || busy) return;
    setBusy(true);
    setError("");
    try {
      let mockPayment = false;
      let paymentId = null;

      if (sdkReady && paymentHold?.client_secret) {
        if (!stripeRef.current || !cardRef.current) {
          throw new Error("Payment form is not ready yet.");
        }
        setStatus("Processing your payment…");
        const result = await stripeRef.current.confirmCardPayment(paymentHold.client_secret, {
          payment_method: { card: cardRef.current },
        });
        if (result.error) throw new Error(result.error.message || "Payment failed.");
        const pi = result.paymentIntent;
        if (!pi || !["succeeded", "processing"].includes(pi.status)) {
          throw new Error(`Unexpected payment status: ${pi?.status || "unknown"}`);
        }
        paymentId = pi.id || paymentHold.payment_intent_id;
      } else if (allowMock) {
        mockPayment = true;
        setStatus("Confirming sandbox package…");
      } else {
        throw new Error("Payment unavailable - configure Itinero Stripe or use sandbox.");
      }

      setStatus("Confirming your package…");
      await finishBook({
        paymentId,
        mockPayment,
        expectedAmount: payHotel,
      });
    } catch (err) {
      setError(err?.message || "Payment failed.");
      setStatus("");
      setBusy(false);
    }
  };

  const payDisabled = busy || (sdkReady && !cardReady) || (!sdkReady && !allowMock);

  return (
    <PageLayout>
      <div className={styles.wrap}>
        <p className={styles.brand}>itinero packages</p>
        <h1>Checkout · {pkg.title}</h1>
        <p className={styles.honesty}>{honesty}</p>

        {error ? (
          <div className={styles.error} role="alert">
            {error}
          </div>
        ) : null}
        {busy || status ? (
          <div className={styles.statusBlock}>
            <LoadingState title={status || "Working…"} message="Keep this page open until confirmation finishes." />
          </div>
        ) : null}

        <div className={styles.grid}>
          <form className={styles.form} onSubmit={phase === "form" ? handleHold : (e) => e.preventDefault()}>
            <h2>Guest details</h2>
            <div className={styles.row2}>
              <label>
                First name
                <input
                  required
                  disabled={phase === "pay" || busy}
                  value={guest.firstName}
                  onChange={(e) => setGuest({ ...guest, firstName: e.target.value })}
                />
              </label>
              <label>
                Last name
                <input
                  required
                  disabled={phase === "pay" || busy}
                  value={guest.lastName}
                  onChange={(e) => setGuest({ ...guest, lastName: e.target.value })}
                />
              </label>
            </div>
            <label>
              Email
              <input
                required
                type="email"
                disabled={phase === "pay" || busy}
                value={guest.email}
                onChange={(e) => setGuest({ ...guest, email: e.target.value })}
              />
            </label>
            <label>
              Phone
              <input
                required
                disabled={phase === "pay" || busy}
                value={guest.phone}
                onChange={(e) => setGuest({ ...guest, phone: e.target.value })}
                placeholder="Include country code if outside India"
              />
            </label>

            {phase === "pay" ? (
              <div className={styles.payPanel}>
                <div className={styles.payHead}>
                  <strong>One payment</strong>
                  <span>Itinero · Stripe · {chargeTotal != null ? formatMoney(chargeTotal) : "-"}</span>
                </div>
                {loyaltyRedemption?.discountAmount ? (
                  <p className={styles.payHint}>
                    Includes {formatMoney(loyaltyRedemption.discountAmount)} off from{" "}
                    {Number(loyaltyRedemption.points || 0).toLocaleString()} points.
                  </p>
                ) : null}
                {sdkReady ? (
                  <>
                    <LoyaltyEarnBanner
                      estimate={loyaltyEstimate}
                      loading={loyaltyLoading}
                      className={styles.loyaltyBanner}
                    />
                    <p className={styles.payHint}>
                      Single charge covers your stay{payFlight > 0 ? ", flights" : ""}
                      {payMargin > 0 ? ", and package fee" : ""}. Hotel and flights are booked via LiteAPI after
                      payment.
                    </p>
                    <div ref={cardMountRef} className={styles.cardElement} />
                  </>
                ) : allowMock ? (
                  <p className={styles.payHint}>Sandbox mode - issue test booking without live Stripe.</p>
                ) : (
                  <p className={styles.payHint}>Configure VITE_ITINERO_STRIPE_PUBLISHABLE_KEY to accept payment.</p>
                )}
                <button type="button" className={styles.bookBtn} disabled={payDisabled} onClick={handlePay}>
                  {busy ? (
                    <LoadingDots label="Paying" />
                  ) : sdkReady || allowMock ? (
                    `Pay ${chargeTotal != null ? formatMoney(chargeTotal) : "now"}`
                  ) : (
                    "Payment unavailable"
                  )}
                </button>
                <p className={styles.secure}>
                  <ShieldCheck size={14} /> <Lock size={12} /> Secured checkout · PCI DSS
                </p>
              </div>
            ) : (
              <>
                <div style={{ marginBottom: 12 }}>
                  <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                    Promo code (packages margin only)
                  </label>
                  <div style={{ display: "flex", gap: 8 }}>
                    <input
                      value={promoCode}
                      onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                      placeholder="WELCOME10"
                      style={{ flex: 1, padding: "10px 12px", borderRadius: 10, border: "1px solid #e2e8f0" }}
                    />
                    <button
                      type="button"
                      className={styles.bookBtn}
                      style={{ width: "auto", padding: "10px 14px" }}
                      onClick={async () => {
                        setPromoMsg("");
                        try {
                          const res = await interestService.validateOffer(promoCode.trim());
                          if (res?.valid && res.offer) {
                            setPromoOffer(res.offer);
                            setPromoMsg(res.message || "Applied.");
                          } else {
                            setPromoOffer(null);
                            setPromoMsg(res?.message || "Invalid code.");
                          }
                        } catch (err) {
                          setPromoOffer(null);
                          setPromoMsg(err?.message || "Could not validate.");
                        }
                      }}
                    >
                      Apply
                    </button>
                  </div>
                  {promoMsg ? (
                    <p style={{ margin: "8px 0 0", fontSize: 13, color: promoOffer ? "#15803d" : "#b91c1c" }}>
                      {promoMsg}
                      {promoDiscount > 0 ? ` · Saves ${formatMoney(promoDiscount)} on Itinero fee` : ""}
                    </p>
                  ) : null}
                </div>
                <PointsRedeemPanel
                  total={total}
                  currency={currency || "INR"}
                  disabled={busy || phase === "pay"}
                  onRedemptionChange={setLoyaltyRedemption}
                />
                <LoyaltyEarnBanner
                  estimate={loyaltyEstimate}
                  loading={loyaltyLoading}
                  compact
                  className={styles.loyaltyBanner}
                />
                <button type="submit" className={styles.bookBtn} disabled={!ready || busy}>
                {busy ? (
                  <LoadingDots label="Preparing" />
                ) : (
                  `Continue to payment · ${total != null ? formatMoney(total) : "-"}`
                )}
              </button>
              </>
            )}
          </form>

          <aside className={styles.summary}>
            <PlacesPhotoImg
              city={
                (pkg.requiredAnchors?.length ? pkg.requiredAnchors : pkg.destinations || [])[0] || ""
              }
              country={String(pkg.region || "").toLowerCase() === "domestic" ? "India" : ""}
              fallback={pkg.coverImage || ""}
              alt=""
            />
            <h3>{pkg.title}</h3>
            <p>
              {checkIn} → {checkOut} · {guests} guests
            </p>
            <p className={styles.hotelLine}>
              {hotel?.name || "Hotel"} · {room?.board || room?.title || "Room"}
            </p>
            <div className={styles.breakup}>
              {payHotel > 0 ? (
                <div>
                  <span>Stay</span>
                  <strong>{formatMoney(payHotel)}</strong>
                </div>
              ) : null}
              {payFlight > 0 ? (
                <div>
                  <span>Flights</span>
                  <strong>{formatMoney(payFlight)}</strong>
                </div>
              ) : null}
              {payMargin > 0 ? (
                <div>
                  <span>Package fee</span>
                  <strong>{formatMoney(payMargin)}</strong>
                </div>
              ) : null}
            </div>
            <div className={styles.total}>
              <span>Pay once</span>
              <strong>{total != null ? formatMoney(total) : "-"}</strong>
            </div>
            <LoyaltyEarnBanner
              estimate={loyaltyEstimate}
              loading={loyaltyLoading}
              compact
              className={styles.loyaltyBanner}
            />
            <div className={styles.itineraryBlock}>
              <p className={styles.itineraryLabel}>Your itinerary</p>
              <PackageItineraryList days={pkg.itinerary || []} variant="compact" />
            </div>
          </aside>
        </div>
      </div>
    </PageLayout>
  );
}
