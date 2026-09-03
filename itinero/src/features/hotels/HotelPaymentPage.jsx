import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { PageLayout } from "@/components/layout";
import BookingStepper from "./components/BookingStepper";
import HotelBookingSummary from "./components/HotelBookingSummary";
import { useCurrency } from "@/context/CurrencyContext";
import { hotelService } from "./services/hotelService";
import { registerPaymentIntent } from "@/features/booking/services/paymentService";
import {
  buildLiteApiReturnUrl,
  clearLiteApiCheckout,
  launchLiteApiPayment,
  liteApiSdkEnv,
  readLiteApiCheckout,
  resolveLiteApiPublishableKey,
  saveLiteApiCheckout,
} from "@/features/booking/services/liteApiPaymentSdk";
import { saveHotelConfirmation } from "./utils/hotelCheckout";
import { LoadingState } from "@/components/shared";
import { LoyaltyEarnBanner } from "@/components/shared";
import { useLoyaltyEstimate } from "@/features/booking/hooks/useLoyaltyEstimate";
import styles from "./HotelGuestDetailsPage.module.css";

/**
 * Hotel payment step:
 * 1) LiteAPI prebook (usePaymentSdk)
 * 2) Official LiteAPI Payment SDK (Payment Element accordion)
 * 3) Stripe redirect → book with transactionId → confirmation
 */

const PAY_MOUNT_ID = "itinero-liteapi-payment-mount";

export default function HotelPaymentPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { state } = useLocation();
  const [searchParams] = useSearchParams();
  const { currency, formatMoney } = useCurrency();

  const hotel = state?.hotel || {};
  const room = state?.room || {};
  const offerId = state?.offerId || room?.offerId || "";
  const checkIn = state?.checkIn || "";
  const checkOut = state?.checkOut || "";
  const guests = Number(state?.guests || 2) || 2;
  const roomsCount = Number(state?.rooms || 1) || 1;
  const guest = state?.guest || {};
  const voucherCode = state?.voucherCode || "";
  const addons = state?.addons || [];
  const baseSummary = state?.summaryData || null;

  const [isLoading, setIsLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");
  const [holdNotice, setHoldNotice] = useState("");
  const [error, setError] = useState("");
  const [hold, setHold] = useState(null);
  const [sdkMounted, setSdkMounted] = useState(false);
  const holdStarted = useRef(false);
  const sdkStarted = useRef(false);
  const returnHandled = useRef(false);
  const payMountRef = useRef(null);

  const roomTotal = Number(room?.totalPrice ?? room?.price ?? hotel?.totalPrice ?? 0);
  const displayTotal =
    hold?.price != null && Number.isFinite(Number(hold.price))
      ? Number(hold.price)
      : Number(baseSummary?.totalPrice ?? roomTotal);

  const taxesTotal = Number(baseSummary?.taxesTotal ?? room?.taxes ?? 0);
  const taxesIncluded =
    taxesTotal > 0 && displayTotal > 0 && taxesTotal < displayTotal && displayTotal - taxesTotal > 0;
  const roomBase = taxesIncluded ? Math.max(0, displayTotal - taxesTotal) : displayTotal;

  const { estimate: loyaltyEstimate, loading: loyaltyLoading } = useLoyaltyEstimate(
    displayTotal,
    currency || hold?.currency || "INR"
  );

  const sdkReady = Boolean(hold?.client_secret);
  const allowMock = Boolean(hold?.allow_mock_payment);
  const sandboxMode =
    import.meta.env.DEV ||
    hold?.sdk_public_key === "sandbox" ||
    liteApiSdkEnv(hold) === "sandbox";

  const summaryData = useMemo(() => {
    if (!baseSummary) {
      return {
        hotelName: hotel?.name || "Hotel",
        hotelImage: hotel?.mainImage || hotel?.image || `${import.meta.env.BASE_URL}hotel_room.png`,
        location: hotel?.location || "",
        checkIn: { date: checkIn || "-", day: "" },
        checkOut: { date: checkOut || "-", day: "" },
        guests,
        rooms: roomsCount,
        nights: 1,
        roomName: room?.roomName || room?.name || "Room",
        roomsTotal: roomBase,
        taxesTotal: taxesIncluded ? taxesTotal : 0,
        addons: [],
        addonsTotal: 0,
        totalPrice: displayTotal,
        starRating: Number(hotel?.starRating || 0) || 0,
        offerId,
      };
    }
    return {
      ...baseSummary,
      roomsTotal: Number(baseSummary.roomsTotal ?? roomBase),
      taxesTotal: Number(baseSummary.taxesTotal ?? (taxesIncluded ? taxesTotal : 0)),
      addons: baseSummary.addons || [],
      addonsTotal: Number(baseSummary.addonsTotal || 0),
      totalPrice: displayTotal,
    };
  }, [
    baseSummary,
    hotel,
    room,
    checkIn,
    checkOut,
    guests,
    roomsCount,
    roomBase,
    taxesTotal,
    taxesIncluded,
    displayTotal,
    offerId,
  ]);

  async function confirmStay({
    prebookId,
    paymentProvider,
    paymentId,
    transactionId,
    mockPayment,
    amount,
    guestOverride,
    summaryOverride,
  }) {
    const g = guestOverride || guest;
    const holder = {
      firstName: String(g.firstName || "").trim(),
      lastName: String(g.lastName || "").trim(),
      email: String(g.email || "").trim(),
      phone: String(g.phone || "").replace(/\D/g, ""),
    };
    const extras = Array.isArray(g.additionalGuests)
      ? g.additionalGuests
          .filter((x) => x?.firstName || x?.lastName)
          .map((x, i) => ({
            occupancyNumber: i + 2,
            firstName: String(x.firstName || "").trim() || holder.firstName,
            lastName: String(x.lastName || "").trim() || holder.lastName,
            email: String(x.email || holder.email).trim(),
          }))
      : [];
    const bookRes = await hotelService.book({
      prebook_id: prebookId,
      holder,
      guests: [
        {
          occupancyNumber: 1,
          firstName: holder.firstName,
          lastName: holder.lastName,
          email: holder.email,
        },
        ...extras,
      ],
      payment_provider: paymentProvider,
      payment_id: paymentId || undefined,
      transaction_id: transactionId || undefined,
      mock_payment: mockPayment || undefined,
      expected_amount: amount,
      special_requests: g.specialRequests || undefined,
      special_note: g.specialNote || undefined,
    });
    if (!bookRes?.ok) {
      throw new Error(
        bookRes?.message ||
          bookRes?.error ||
          "Payment received but confirming the stay failed. Contact support with your payment id."
      );
    }
    return { bookRes, guestUsed: g, summaryUsed: summaryOverride || summaryData };
  }

  function goToConfirmation(bookRes, payRef, pb, guestUsed, summaryUsed) {
    const booking = bookRes.booking || {};
    const g = guestUsed || guest;
    clearLiteApiCheckout(pb?.prebook_id || booking.prebook_id);
    const usedSummary = summaryUsed || summaryData;
    const confirmTotalPrice = Number(usedSummary?.totalPrice ?? (booking.price ?? pb?.price ?? displayTotal));
    const confirmState = {
      paymentId: payRef || booking.payment_id,
      paymentProvider: "stripe",
      bookingId: booking.booking_id,
      prebookId: booking.prebook_id || pb?.prebook_id,
      hotelConfirmationCode: booking.hotel_confirmation_code,
      bookingData: {
        ...usedSummary,
        totalPrice: confirmTotalPrice,
        guestName: `${g.firstName || ""} ${g.lastName || ""}`.trim(),
        email: g.email,
        phone: g.phone,
        addons: usedSummary?.addons || booking.addons || [],
      },
    };
    saveHotelConfirmation(confirmState);
    const qs = booking.booking_id
      ? `?booking=${encodeURIComponent(booking.booking_id)}`
      : "";
    navigate(`/hotel/${id || "stay"}/confirmation${qs}`, {
      replace: true,
      state: confirmState,
    });
  }

  async function startHold() {
    if (!offerId || !guest?.email) return;
    setIsLoading(true);
    setError("");
    setHoldNotice("");
    setSdkMounted(false);
    sdkStarted.current = false;
    setStatusMsg("Holding your room fare with the hotel…");
    try {
      const prebookRes = await hotelService.prebook({
        offer_id: offerId,
        voucher_code: voucherCode || undefined,
        currency: currency || "INR",
        use_payment_sdk: true,
        hotel_id: id || hotel?.id || hotel?.hotelId || undefined,
        check_in: checkIn || undefined,
        check_out: checkOut || undefined,
        guests,
        rooms: roomsCount,
        room_title: room?.title || room?.name || room?.roomName || undefined,
        room_board: room?.board || undefined,
        target_price: Number.isFinite(roomTotal) ? roomTotal : undefined,
        addons: addons.length ? addons : undefined,
      });
      if (!prebookRes?.ok || !prebookRes?.prebook?.prebook_id) {
        throw new Error(
          prebookRes?.message || prebookRes?.error || "Could not hold this room. Try another rate."
        );
      }
      const pb = prebookRes.prebook;
      const refreshed = Boolean(pb.refreshed_offer || prebookRes.refreshed);

      if (!pb.client_secret) {
        if (pb.allow_mock_payment) {
          setHold(pb);
          setHoldNotice("Sandbox hold created - use the test booking button to confirm.");
          return;
        }
        throw new Error(
          "Card checkout could not start for this hold. Try again in a moment."
        );
      }

      // Warm publishable key cache (SDK also fetches config; this surfaces env mismatches early).
      await resolveLiteApiPublishableKey(pb);
      setHold(pb);

      saveLiteApiCheckout(pb.prebook_id, {
        hotelId: id,
        guest,
        summaryData,
        hold: {
          prebook_id: pb.prebook_id,
          transaction_id: pb.transaction_id,
          price: pb.price,
          currency: pb.currency,
          client_secret: pb.client_secret,
          sdk_public_key: pb.sdk_public_key,
        },
      });

      await registerPaymentIntent({
        prebook_id: pb.prebook_id,
        kind: "hotel",
        amount: Number(pb.price ?? displayTotal),
        currency: pb.currency || currency || "INR",
        email: guest.email,
        payload: {
          holder: {
            firstName: guest.firstName,
            lastName: guest.lastName,
            email: guest.email,
          },
          hotel_name: summaryData.hotelName,
          check_in: summaryData.checkIn,
          check_out: summaryData.checkOut,
          transaction_id: pb.transaction_id,
        },
      });

      setHoldNotice(
        refreshed
          ? `Live rate changed to ${formatMoney(Number(pb.price ?? displayTotal))}. Confirm the total, then pay in the form.`
          : "Room held. Enter your card details below."
      );
    } catch (err) {
      setError(err?.message || "Could not hold this room.");
      setHoldNotice("");
    } finally {
      setStatusMsg("");
      setIsLoading(false);
    }
  }

  async function finalizePaidReturn() {
    if (returnHandled.current) return;
    returnHandled.current = true;

    const prebookId =
      searchParams.get("prebookId") ||
      searchParams.get("pid") ||
      "";
    const transactionId =
      searchParams.get("transactionId") ||
      searchParams.get("tid") ||
      "";
    const redirectStatus = searchParams.get("redirect_status") || "";
    const paymentIntent = searchParams.get("payment_intent") || "";

    if (redirectStatus && redirectStatus !== "succeeded" && redirectStatus !== "processing") {
      setError(`Payment was not completed (${redirectStatus}). Try again.`);
      returnHandled.current = false;
      return;
    }

    const stored = readLiteApiCheckout(prebookId);
    const pb = stored?.hold || hold;
    const tid = transactionId || pb?.transaction_id;
    const pid = prebookId || pb?.prebook_id;
    if (!pid || !tid) {
      setError("Payment returned but hold details were missing. Start checkout again.");
      returnHandled.current = false;
      return;
    }

    setIsLoading(true);
    setStatusMsg("Payment confirmed - booking your stay…");
    setError("");
    try {
      const { bookRes, guestUsed, summaryUsed } = await confirmStay({
        prebookId: pid,
        paymentProvider: "stripe",
        transactionId: tid,
        paymentId: paymentIntent || tid,
        mockPayment: false,
        amount: Number(pb?.price ?? displayTotal),
        guestOverride: stored?.guest || guest,
        summaryOverride: stored?.summaryData || summaryData,
      });
      goToConfirmation(bookRes, paymentIntent || tid, pb, guestUsed, summaryUsed);
    } catch (err) {
      setError(err?.message || "Could not confirm the stay after payment.");
      setStatusMsg("");
      setIsLoading(false);
      returnHandled.current = false;
    }
  }

  // Handle Stripe → LiteAPI return redirect
  useEffect(() => {
    const isReturn =
      searchParams.get("pay_return") === "1" ||
      Boolean(searchParams.get("payment_intent")) ||
      Boolean(searchParams.get("redirect_status"));
    if (!isReturn) return;
    finalizePaidReturn();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  useEffect(() => {
    if (searchParams.get("pay_return") === "1") return;
    if (!offerId || !guest?.email || holdStarted.current) return;
    holdStarted.current = true;
    startHold();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offerId, guest?.email]);

  // Launch official LiteAPI Payment SDK into the side panel mount
  useEffect(() => {
    if (!hold?.client_secret || !hold?.prebook_id || !payMountRef.current) return undefined;
    if (sdkStarted.current) return undefined;
    if (searchParams.get("pay_return") === "1") return undefined;

    let cancelled = false;
    sdkStarted.current = true;

    (async () => {
      try {
        setSdkMounted(false);
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        if (cancelled || !payMountRef.current) return;

        const returnUrl = buildLiteApiReturnUrl({
          path: `hotel/${id || "stay"}/payment`,
          prebookId: hold.prebook_id,
          transactionId: hold.transaction_id,
        });

        await launchLiteApiPayment({
          hold,
          targetSelector: `#${PAY_MOUNT_ID}`,
          returnUrl,
          businessName: "Itinero",
          theme: "flat",
        });
        if (!cancelled) setSdkMounted(true);
      } catch (err) {
        if (cancelled) return;
        sdkStarted.current = false;
        setSdkMounted(false);
        setError(
          err?.message ||
            "Card checkout could not start. Allow js.stripe.com and retry."
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [hold?.client_secret, hold?.prebook_id, hold?.transaction_id, id, searchParams]);

  if ((!offerId || !guest?.email) && searchParams.get("pay_return") !== "1") {
    return (
      <PageLayout>
        <div className={styles.pageContainer}>
          <p className={styles.alertError}>
            Missing guest or room details. Start again from guest details.
          </p>
          <button
            type="button"
            className={styles.payButton}
            onClick={() => navigate(`/hotel/${id || "stay"}/guest-details`)}
          >
            Back to guest details
          </button>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout>
      <div className={styles.pageContainer}>
        <div className={styles.stepperWrapper}>
          <BookingStepper currentStep={3} />
        </div>

        {error ? (
          <div role="alert" className={styles.alertError}>
            <p style={{ margin: 0 }}>{error}</p>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 10,
                marginTop: 14,
                justifyContent: "center",
              }}
            >
              <button
                type="button"
                className={styles.payButton}
                style={{ marginTop: 0, minWidth: 140 }}
                disabled={isLoading}
                onClick={() => {
                  holdStarted.current = false;
                  sdkStarted.current = false;
                  setHold(null);
                  setHoldNotice("");
                  setSdkMounted(false);
                  setError("");
                  holdStarted.current = true;
                  startHold();
                }}
              >
                Retry hold
              </button>
              <button
                type="button"
                className={styles.secondaryPay}
                style={{ marginTop: 0, minWidth: 140 }}
                onClick={() => {
                  const qs = new URLSearchParams();
                  if (checkIn) qs.set("checkIn", checkIn);
                  if (checkOut) qs.set("checkOut", checkOut);
                  if (guests) qs.set("guests", String(guests));
                  if (roomsCount) qs.set("rooms", String(roomsCount));
                  navigate(`/hotel/${id || "stay"}${qs.toString() ? `?${qs}` : ""}`);
                }}
              >
                Pick another room
              </button>
            </div>
          </div>
        ) : null}
        {isLoading ? (
          <div className={styles.statusBlock}>
            <LoadingState
              title={statusMsg || "Processing…"}
              message="Keep this page open until payment and confirmation finish."
            />
          </div>
        ) : null}
        {!isLoading && holdNotice ? (
          <div role="status" className={styles.holdNotice}>
            {holdNotice}
          </div>
        ) : null}

        <div className={styles.mainLayout}>
          <div className={styles.formColumn}>
            <div className={styles.payPanel}>
              <h2 className={styles.payTitle}>Payment</h2>
              <p className={styles.payHint}>
                Paying as{" "}
                <strong>
                  {guest.firstName} {guest.lastName}
                </strong>{" "}
                · {guest.email}
              </p>
              <LoyaltyEarnBanner
                estimate={loyaltyEstimate}
                loading={loyaltyLoading}
                className={styles.loyaltyBanner}
              />
              {sdkReady ? (
                <>
                  <p className={styles.payHint}>
                    {sandboxMode ? (
                      <>
                        Secure card checkout (sandbox) · test card{" "}
                        <code>4242 4242 4242 4242</code> · any future expiry · any CVC.
                      </>
                    ) : (
                      "Secure card checkout. We never store card numbers."
                    )}
                  </p>
                  <div
                    id={PAY_MOUNT_ID}
                    ref={payMountRef}
                    className={styles.liteApiPayMount}
                    aria-label="Card payment form"
                  />
                  {!sdkMounted && !error ? (
                    <p className={styles.payHint}>Opening card checkout…</p>
                  ) : null}
                </>
              ) : (
                <p className={styles.payHint}>
                  {isLoading
                    ? "Holding the room and preparing card checkout…"
                    : error
                      ? "Fix the issue above, then retry."
                      : "Preparing secure payment…"}
                </p>
              )}
            </div>
          </div>
          <div className={styles.summaryColumn}>
            <LoyaltyEarnBanner
              estimate={loyaltyEstimate}
              loading={loyaltyLoading}
              compact
              className={styles.loyaltyBannerSummary}
            />
            <HotelBookingSummary
              bookingInfo={summaryData}
              showContinue={false}
              chargeHint={
                sandboxMode
                  ? "Secure checkout · test card 4242 4242 4242 4242"
                  : "Secure card checkout"
              }
            />
            {hold?.prebook_id ? (
              <p className={styles.holdMeta}>
                Hold {hold.prebook_id.slice(0, 14)}…
                {hold.currency ? ` · ${hold.currency}` : ""}
              </p>
            ) : null}
            {!sdkReady && allowMock && hold?.prebook_id ? (
              <button
                type="button"
                className={styles.secondaryPay}
                onClick={async () => {
                  setIsLoading(true);
                  try {
                    const { bookRes, guestUsed, summaryUsed } = await confirmStay({
                      prebookId: hold.prebook_id,
                      paymentProvider: "credit",
                      mockPayment: true,
                      amount: Number(hold.price ?? displayTotal),
                    });
                    goToConfirmation(bookRes, "mock", hold, guestUsed, summaryUsed);
                  } catch (err) {
                    setError(err?.message || "Sandbox book failed.");
                    setIsLoading(false);
                  }
                }}
              >
                Confirm sandbox booking
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </PageLayout>
  );
}
