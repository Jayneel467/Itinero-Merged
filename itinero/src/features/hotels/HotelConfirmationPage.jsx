import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { PageLayout } from "@/components/layout";
import BookingStepper from "./components/BookingStepper";
import {
  CheckCircle,
  Download,
  Share2,
  MapPin,
  Calendar,
  Users,
  Bed,
  Mail,
  ArrowRight,
  Home,
  Copy,
  Star,
} from "lucide-react";
import styles from "./HotelConfirmationPage.module.css";
import { useCurrency } from "@/context/CurrencyContext";
import { tripService } from "@/features/trips/tripService";
import { isSupplierBookingId } from "@/features/trips/utils/supplierBooking";
import {
  cancelHotelWithPolicy,
  refundPatchFromResult,
  formatCancelResultMessage,
} from "@/features/trips/utils/cancelFlow";
import { downloadHotelVoucherPdf } from "@/features/booking/utils/bookingConfirmationPdf";
import { resolveHotelConfirmation } from "./utils/hotelCheckout";

function shortRef(value, head = 12, tail = 6) {
  const s = String(value || "").trim();
  if (!s) return "-";
  if (s.length <= head + tail + 1) return s;
  return `${s.slice(0, head)}…${s.slice(-tail)}`;
}

async function copyText(value) {
  const s = String(value || "").trim();
  if (!s) return false;
  try {
    await navigator.clipboard.writeText(s);
    return true;
  } catch {
    return false;
  }
}

export default function HotelConfirmationPage() {
  const { state: routeState } = useLocation();
  const navigate = useNavigate();
  const { id } = useParams();
  const { formatMoney } = useCurrency();
  const confirmation = useMemo(() => resolveHotelConfirmation(routeState), [routeState]);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [cancelMsg, setCancelMsg] = useState("");
  const [cancelErr, setCancelErr] = useState("");
  const [cancelled, setCancelled] = useState(false);
  const [copiedKey, setCopiedKey] = useState("");

  const paymentId = confirmation?.paymentId || null;
  const bookingId = confirmation?.bookingId || null;
  const prebookId = confirmation?.prebookId || null;
  const hotelConfirmationCode = confirmation?.hotelConfirmationCode || null;
  const bookingData = confirmation?.bookingData || null;

  const bookingRef = useMemo(() => {
    if (bookingId) return bookingId;
    if (hotelConfirmationCode) return hotelConfirmationCode;
    return null;
  }, [bookingId, hotelConfirmationCode]);

  useEffect(() => {
    if (!bookingData || !bookingId) return;
    tripService.ensureHotelTrip({
      hotelName: bookingData.hotelName,
      hotelId: id,
      location: bookingData.location,
      checkIn: bookingData.checkInIso || bookingData.checkIn,
      checkOut: bookingData.checkOutIso || bookingData.checkOut,
      guests: bookingData.guests,
      rooms: bookingData.rooms,
      totalPrice: bookingData.totalPrice,
      paymentId,
      bookingId,
      prebookId,
      hotelConfirmationCode,
      confirmed: true,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- persist once per confirmation view
  }, [id, paymentId, bookingId, bookingData?.hotelName, bookingData?.totalPrice]);

  if (!bookingId || !bookingData) {
    return (
      <PageLayout>
        <div className={styles.pageContainer}>
          <p style={{ padding: 24, color: "#b42318" }}>
            No confirmed stay found. Complete checkout with Stripe first - we do not invent booking
            references.
          </p>
          <button type="button" className={styles.homeBtn} onClick={() => navigate("/hotels")}>
            Back to hotels
          </button>
        </div>
      </PageLayout>
    );
  }

  async function handleCancel() {
    if (!isSupplierBookingId(bookingId)) {
      setCancelErr("Cancel this stay from My Trips - no supplier booking id on this confirmation.");
      return;
    }
    setCancelBusy(true);
    setCancelErr("");
    setCancelMsg("");
    try {
      const res = await cancelHotelWithPolicy({
        bookingId,
        paymentId,
        expectedAmount: Number(bookingData?.totalPrice) || null,
        paymentProvider: bookingData?.paymentProvider || "stripe",
      });
      if (res?.aborted) return;
      if (!res?.ok) throw new Error(res?.error || res?.message || "Cancel failed.");
      const patch = refundPatchFromResult(res);
      tripService.markHotelCancelled({ bookingId, refund: patch });
      setCancelled(!patch.cancelPending);
      setCancelMsg(formatCancelResultMessage(res) || "Stay cancelled.");
    } catch (err) {
      setCancelErr(err?.message || "Cancel failed.");
    } finally {
      setCancelBusy(false);
    }
  }

  const checkIn = bookingData.checkIn || { date: "-", day: "" };
  const checkOut = bookingData.checkOut || { date: "-", day: "" };
  const stars = Number(bookingData.starRating || 0) || 0;

  async function handleCopy(label, value) {
    const ok = await copyText(value);
    if (ok) {
      setCopiedKey(label);
      window.setTimeout(() => setCopiedKey(""), 2000);
    }
  }

  const confirmBody = (
      <div className={styles.pageContainer}>
        <div className={styles.stepperWrapper}>
          <BookingStepper currentStep={4} />
        </div>

        <div className={styles.mainLayout}>
          <div className={styles.confirmationColumn}>
            <section className={styles.successBanner} aria-labelledby="hotel-confirmed-title">
              <div className={styles.successIconWrap}>
                <CheckCircle size={40} className={styles.successIcon} aria-hidden />
              </div>
              <div className={styles.successCopy}>
                <p className={styles.successEyebrow}>You&apos;re all set</p>
                <h1 id="hotel-confirmed-title" className={styles.successTitle}>
                  Booking confirmed
                </h1>
                <p className={styles.successSubtitle}>
                  Voucher ready - download the PDF or keep this page handy for your stay details.
                  {bookingData.email ? ` We also have ${bookingData.email} on file.` : ""}
                </p>
              </div>
            </section>

            <section className={styles.refCard} aria-label="Booking references">
              <div className={styles.refPrimary}>
                <span className={styles.refLabel}>Booking reference</span>
                <div className={styles.refValueRow}>
                  <span className={styles.refValue}>{bookingRef}</span>
                  <button
                    type="button"
                    className={styles.copyBtn}
                    onClick={() => handleCopy("booking", bookingRef)}
                    aria-label="Copy booking reference"
                  >
                    <Copy size={14} />
                    {copiedKey === "booking" ? "Copied" : "Copy"}
                  </button>
                </div>
              </div>
              {hotelConfirmationCode && hotelConfirmationCode !== bookingRef ? (
                <div className={styles.refTile}>
                  <span className={styles.refLabel}>Hotel confirmation</span>
                  <span className={styles.refValueMuted}>{hotelConfirmationCode}</span>
                </div>
              ) : null}
              <div className={styles.refTile}>
                <span className={styles.refLabel}>Payment</span>
                <div className={styles.refValueRow}>
                  <span className={styles.refValueMuted} title={paymentId || undefined}>
                    {shortRef(paymentId, 14, 8)}
                  </span>
                  {paymentId ? (
                    <button
                      type="button"
                      className={styles.copyBtn}
                      onClick={() => handleCopy("payment", paymentId)}
                      aria-label="Copy payment id"
                    >
                      <Copy size={14} />
                      {copiedKey === "payment" ? "Copied" : "Copy"}
                    </button>
                  ) : null}
                </div>
              </div>
              <div className={styles.refTile}>
                <span className={styles.refLabel}>Status</span>
                <span className={cancelled ? styles.statusCancelled : styles.statusBadge}>
                  {cancelled ? "Cancelled" : "Confirmed"}
                </span>
              </div>
            </section>

            <article className={styles.hotelCard}>
              <div className={styles.hotelMedia}>
                <img
                  src={bookingData.hotelImage}
                  alt={bookingData.hotelName}
                  className={styles.hotelImage}
                />
              </div>
              <div className={styles.hotelContent}>
                <div className={styles.hotelHead}>
                  <div>
                    {stars > 0 ? (
                      <div className={styles.starRow} aria-label={`${stars} star hotel`}>
                        {Array.from({ length: Math.min(5, stars) }).map((_, i) => (
                          <Star key={i} size={14} fill="currentColor" aria-hidden />
                        ))}
                      </div>
                    ) : null}
                    <h2 className={styles.hotelName}>{bookingData.hotelName}</h2>
                  </div>
                </div>
                <div className={styles.hotelLocation}>
                  <MapPin size={15} aria-hidden />
                  <span>{bookingData.location}</span>
                </div>

                <div className={styles.bookingDetails}>
                  <div className={styles.detailItem}>
                    <Calendar size={17} className={styles.detailIcon} aria-hidden />
                    <div>
                      <span className={styles.detailLabel}>Check-in</span>
                      <span className={styles.detailValue}>
                        {checkIn.date}
                        {checkIn.day ? ` · ${checkIn.day}` : ""}
                      </span>
                    </div>
                  </div>
                  <div className={styles.detailItem}>
                    <Calendar size={17} className={styles.detailIcon} aria-hidden />
                    <div>
                      <span className={styles.detailLabel}>Check-out</span>
                      <span className={styles.detailValue}>
                        {checkOut.date}
                        {checkOut.day ? ` · ${checkOut.day}` : ""}
                      </span>
                    </div>
                  </div>
                  <div className={styles.detailItem}>
                    <Bed size={17} className={styles.detailIcon} aria-hidden />
                    <div>
                      <span className={styles.detailLabel}>Room</span>
                      <span className={styles.detailValue}>
                        {bookingData.roomName || "Room"} · {bookingData.nights} night
                        {Number(bookingData.nights) === 1 ? "" : "s"}
                      </span>
                    </div>
                  </div>
                  <div className={styles.detailItem}>
                    <Users size={17} className={styles.detailIcon} aria-hidden />
                    <div>
                      <span className={styles.detailLabel}>Guests</span>
                      <span className={styles.detailValue}>{bookingData.guests} adults</span>
                    </div>
                  </div>
                </div>
              </div>
            </article>

            {Array.isArray(bookingData.addons) && bookingData.addons.length ? (
              <section className={styles.infoCard}>
                <h3 className={styles.infoTitle}>Your trip add-ons</h3>
                <div className={styles.infoList}>
                  {bookingData.addons.map((addon, i) => (
                    <div key={`${addon.type}-${i}`} className={styles.infoItem}>
                      <CheckCircle size={17} className={styles.infoIcon} aria-hidden />
                      <span>
                        {addon.type === "uber" ? (
                          <>
                            Uber ride credit -{" "}
                            {addon.voucherUrl ? (
                              <a href={addon.voucherUrl} target="_blank" rel="noreferrer">
                                Activate voucher
                              </a>
                            ) : (
                              "check email for link"
                            )}
                          </>
                        ) : addon.type === "esimply" ? (
                          <>
                            eSIM - scan QR or copy code:{" "}
                            <code style={{ fontSize: "11px", wordBreak: "break-all" }}>
                              {addon.qrCode || addon.voucherUrl || "pending"}
                            </code>
                          </>
                        ) : (
                          String(addon.type || "Add-on")
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            <section className={styles.infoCard}>
              <h3 className={styles.infoTitle}>Important information</h3>
              <div className={styles.infoList}>
                <div className={styles.infoItem}>
                  <Mail size={17} className={styles.infoIcon} aria-hidden />
                  <span>
                    Guest <strong>{bookingData.guestName || "-"}</strong>
                    {bookingData.email ? ` · ${bookingData.email}` : ""}
                  </span>
                </div>
                <div className={styles.infoItem}>
                  <CheckCircle size={17} className={styles.infoIcon} aria-hidden />
                  <span>
                    Manage this stay anytime from{" "}
                    <button type="button" className={styles.inlineLink} onClick={() => navigate("/trips")}>
                      My Trips
                    </button>
                  </span>
                </div>
              </div>
            </section>

            {cancelMsg ? <p className={styles.cancelOk}>{cancelMsg}</p> : null}
            {cancelErr ? <p className={styles.cancelErr}>{cancelErr}</p> : null}

            <section className={styles.actions} aria-label="Booking actions">
              {isSupplierBookingId(bookingId) && !cancelled ? (
                <button
                  type="button"
                  className={styles.cancelBtn}
                  onClick={handleCancel}
                  disabled={cancelBusy}
                >
                  {cancelBusy ? "Cancelling…" : "Cancel stay"}
                </button>
              ) : null}
              <button
                type="button"
                className={styles.downloadBtn}
                onClick={async () => {
                  const checkInLabel = [checkIn.date, checkIn.day ? `(${checkIn.day})` : ""]
                    .filter(Boolean)
                    .join(" ");
                  const checkOutLabel = [checkOut.date, checkOut.day ? `(${checkOut.day})` : ""]
                    .filter(Boolean)
                    .join(" ");
                  try {
                    await downloadHotelVoucherPdf({
                      bookingId: bookingRef,
                      hotelName: bookingData.hotelName,
                      location: bookingData.location,
                      guestName: bookingData.guestName,
                      email: bookingData.email,
                      checkIn: checkInLabel,
                      checkOut: checkOutLabel,
                      roomName: bookingData.roomName,
                      nights: bookingData.nights,
                      guests: bookingData.guests,
                      totalPrice: bookingData.totalPrice,
                      currency: bookingData.currency,
                      paymentId,
                      paymentLabel: paymentId ? "Card · Stripe" : "Paid",
                    });
                  } catch {
                    /* ignore */
                  }
                }}
              >
                <Download size={18} /> Download Voucher
              </button>
              <button
                type="button"
                className={styles.shareBtn}
                onClick={() => {
                  const text = `Itinero hotel booking ${bookingRef}`;
                  if (navigator.share) navigator.share({ title: "Hotel booking", text }).catch(() => {});
                  else navigator.clipboard?.writeText(text);
                }}
              >
                <Share2 size={18} /> Share Booking
              </button>
              <button
                type="button"
                className={styles.homeBtn}
                onClick={() => navigate("/trips")}
              >
                <Home size={18} /> View in Trips
              </button>
            </section>
          </div>

          <aside className={styles.summaryColumn}>
            <div className={styles.summaryCard}>
              <h3 className={styles.summaryTitle}>Payment summary</h3>

              <div className={styles.summaryRow}>
                <span>Room ({bookingData.nights} night{Number(bookingData.nights) === 1 ? "" : "s"})</span>
                <span>{formatMoney(bookingData.roomsTotal)}</span>
              </div>
              <div className={styles.summaryRow}>
                <span>Taxes &amp; fees</span>
                <span>{formatMoney(bookingData.taxesTotal)}</span>
              </div>
              <div className={styles.summaryDivider} />
              <div className={styles.summaryTotal}>
                <span>Amount paid</span>
                <span className={styles.summaryTotalPrice}>
                  {formatMoney(bookingData.totalPrice)}
                </span>
              </div>
              <div className={styles.paidBadge}>
                <CheckCircle size={16} aria-hidden /> Payment confirmed
              </div>
              {paymentId ? (
                <p className={styles.paymentId} title={paymentId}>
                  Ref {shortRef(paymentId, 16, 10)}
                </p>
              ) : null}
            </div>

            <div className={styles.exploreCard}>
              <p className={styles.exploreEyebrow}>What&apos;s next</p>
              <h3 className={styles.exploreTitle}>Plan the rest of your trip</h3>
              <p className={styles.exploreText}>
                Add flights, explore stays, or ask Vero for ideas near your hotel.
              </p>
              <button
                type="button"
                className={styles.exploreBtn}
                onClick={() => navigate("/hotels")}
              >
                Browse more hotels
                <ArrowRight size={16} aria-hidden />
              </button>
            </div>
          </aside>
        </div>
      </div>
  );

  return <PageLayout>{confirmBody}</PageLayout>;
}
