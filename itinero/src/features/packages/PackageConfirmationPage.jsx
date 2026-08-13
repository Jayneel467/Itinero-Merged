import React, { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { Ban, Download, Home, Mail, Map } from "lucide-react";
import { PageLayout } from "@/components/layout";
import { ActionButton, ActionRow } from "@/components/shared";
import { useCurrency } from "@/context/CurrencyContext";
import PackageItineraryList from "./components/PackageItineraryList";
import { packageService } from "./services/packageService";
import { formatDisplayDate, formatEstimateRange } from "./utils/itineraryFormat";
import { downloadPackageConfirmationPdf } from "./utils/packageConfirmationPdf";
import { LoadingState } from "@/components/shared";
import {
  cancelPackageWithRefund,
  formatCancelResultMessage,
} from "@/features/trips/utils/cancelFlow";
import { tripService } from "@/features/trips/tripService";
import styles from "./PackageConfirmationPage.module.css";

function guestName(g) {
  return [g?.firstName, g?.lastName].filter(Boolean).join(" ").trim() || "Guest";
}

export default function PackageConfirmationPage() {
  const { bookingId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { formatMoney } = useCurrency();
  const [booking, setBooking] = useState(location.state?.booking || null);
  const [lookupDone, setLookupDone] = useState(Boolean(location.state?.booking));
  const [resendBusy, setResendBusy] = useState(false);
  const [resendMsg, setResendMsg] = useState("");
  const [resendErr, setResendErr] = useState("");
  const [cancelBusy, setCancelBusy] = useState(false);
  const [cancelMsg, setCancelMsg] = useState("");
  const [cancelErr, setCancelErr] = useState("");
  const guest = location.state?.guest || booking?.guest || {};

  useEffect(() => {
    if (booking || !bookingId) {
      setLookupDone(true);
      return;
    }
    let cancelled = false;
    (async () => {
      let email = guest?.email || location.state?.guest?.email || "";
      if (!email) {
        try {
          email = sessionStorage.getItem(`itinero_pkg_email_${bookingId}`) || "";
        } catch {
          email = "";
        }
      }
      const res = await packageService.getBooking(bookingId, email);
      if (!cancelled) {
        setBooking(res.booking || null);
        setLookupDone(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [booking, bookingId, guest?.email, location.state?.guest?.email]);

  if (!lookupDone) {
    return (
      <PageLayout>
        <div className={styles.wrap}>
          <LoadingState
            variant="page"
            title="Looking up booking"
            message="Fetching your package confirmation…"
            skeleton="lines"
            count={2}
          />
        </div>
      </PageLayout>
    );
  }

  if (!booking) {
    return (
      <PageLayout>
        <div className={styles.wrap}>
          <p className={styles.kicker}>Booking not found</p>
          <h1>We couldn&apos;t find that confirmation</h1>
          <p className={styles.meta}>
            Check the booking ID or open the link from your confirmation email.
          </p>
          <ActionRow className={styles.actions}>
            <ActionButton to="/packages">Browse packages</ActionButton>
            <ActionButton variant="ghost" onClick={() => navigate("/trips")}>
              My trips
            </ActionButton>
          </ActionRow>
        </div>
      </PageLayout>
    );
  }

  const pkg = booking.package || {};
  const stay = booking.stay || {};
  const lite = stay.liteapi || {};
  const flight = booking.flight || null;
  const payment = booking.payment || {};
  const estimates = booking.instance?.estimates || null;
  const know = pkg.knowBeforeYouGo || [];
  const destinations = (pkg.requiredAnchors?.length ? pkg.requiredAnchors : pkg.destinations) || [];
  const guestEmail = booking.guest?.email || guest?.email || "";

  function handleDownloadPdf() {
    downloadPackageConfirmationPdf(booking, { formatMoney });
  }

  async function handleResendEmail() {
    const mail = guestEmail.trim();
    if (!mail || !mail.includes("@")) {
      setResendErr("Add a guest email at checkout to receive confirmation.");
      return;
    }
    setResendBusy(true);
    setResendErr("");
    setResendMsg("");
    const res = await packageService.sendConfirmationEmail(booking.bookingId, mail);
    if (res?.ok) {
      setResendMsg(`Itinerary sent to ${mail}. Check spam if it doesn't arrive in a minute.`);
    } else {
      setResendErr(res?.message || "Could not send email.");
    }
    setResendBusy(false);
  }

  async function handleCancelPackage() {
    const mail = guestEmail.trim();
    if (!mail || !mail.includes("@")) {
      setCancelErr("Guest email is required to cancel this package.");
      return;
    }
    const customer = payment?.customer || {};
    setCancelBusy(true);
    setCancelErr("");
    setCancelMsg("");
    try {
      const res = await cancelPackageWithRefund({
        packageBookingId: booking.bookingId || bookingId,
        email: mail,
        paidAmount: payment?.totalCharged || customer?.amount || null,
        paymentId: customer?.paymentId || null,
        paymentProvider: customer?.provider || "itinero_stripe",
      });
      if (res?.aborted) return;
      if (!res?.ok) {
        throw new Error(res?.message || res?.error || "Cancel failed.");
      }
      if (res.booking) setBooking(res.booking);
      try {
        const trips = tripService.list?.() || [];
        const match = (trips || []).find((t) =>
          (t.legs || []).some(
            (l) => l.type === "package" && l.packageBookingId === (booking.bookingId || bookingId)
          )
        );
        if (match?.id) tripService.markTripCancelled(match.id, {});
      } catch {
        /* trips patch is best-effort */
      }
      setCancelMsg(formatCancelResultMessage(res) || "Package cancelled.");
    } catch (err) {
      setCancelErr(err?.message || "Cancel failed.");
    } finally {
      setCancelBusy(false);
    }
  }

  const bookingMode = String(booking.mode || "").toLowerCase();
  const awaitingSupplierRefund =
    bookingMode.includes("awaiting") ||
    Boolean(booking.cancellation?.awaiting_supplier_funds);
  const fullyCancelled =
    (bookingMode === "cancelled" || bookingMode === "canceled") && !awaitingSupplierRefund;
  const showCancelAction = !fullyCancelled;

  return (
    <PageLayout>
      <div className={styles.wrap}>
        <p className={styles.kicker}>Package confirmed</p>
        <h1>{pkg.title}</h1>
        <p className={styles.meta}>
          Booking ID <code>{booking.bookingId}</code> · {booking.mode}
          {destinations.length ? ` · ${destinations.slice(0, 4).join(" · ")}` : ""}
        </p>
        <p className={styles.honesty}>{booking.honesty}</p>

        {(booking.emailSent || location.state?.emailSent) && (
          <p className={styles.emailBanner}>
            Confirmation email with your full itinerary PDF was sent to{" "}
            <strong>{guestEmail || "your inbox"}</strong>.
          </p>
        )}

        <section className={styles.docActions}>
          <ActionButton onClick={handleDownloadPdf}>
            <Download size={16} aria-hidden />
            Download itinerary PDF
          </ActionButton>
          <ActionButton variant="ghost" onClick={handleResendEmail} disabled={resendBusy}>
            <Mail size={16} aria-hidden />
            {resendBusy ? "Sending…" : "Resend confirmation email"}
          </ActionButton>
        </section>
        {resendMsg ? <p className={styles.feedbackOk}>{resendMsg}</p> : null}
        {resendErr ? <p className={styles.feedbackErr}>{resendErr}</p> : null}

        <section className={styles.summaryStrip}>
          <div>
            <span className={styles.stripLabel}>Guest</span>
            <strong>{guestName(booking.guest || guest)}</strong>
            <p>{booking.guest?.email || guest?.email}</p>
          </div>
          <div>
            <span className={styles.stripLabel}>Dates</span>
            <strong>
              {formatDisplayDate(stay.checkIn)} → {formatDisplayDate(stay.checkOut)}
            </strong>
            <p>
              {stay.guests || 2} guest{(stay.guests || 2) === 1 ? "" : "s"}
              {pkg.durationDays ? ` · ${pkg.durationDays} days` : ""}
            </p>
          </div>
          <div>
            <span className={styles.stripLabel}>Paid</span>
            <strong>
              {payment.totalCharged != null
                ? formatMoney(payment.totalCharged)
                : stay.total != null
                  ? formatMoney(stay.total)
                  : "-"}
            </strong>
            <p>One payment to Itinero · hotel and flights via LiteAPI</p>
          </div>
        </section>

        <div className={styles.grid}>
          <section className={`${styles.card} ${styles.cardWide} ${styles.itineraryDoc}`}>
            <div className={styles.itineraryDocHead}>
              <div>
                <p className={styles.docEyebrow}>Your trip document</p>
                <h2>Full itinerary</h2>
              </div>
              <span className={styles.docBadge}>{(pkg.itinerary || []).length} days</span>
            </div>
            <p className={styles.cardHint}>
              Same layout as your confirmation email and PDF - activities, meals, transfers, and where you sleep.
            </p>
            <PackageItineraryList days={pkg.itinerary || []} variant="full" />
          </section>

          <section className={styles.card}>
            <h2>Stay</h2>
            <p className={styles.hotel}>{stay.hotel?.name || "Hotel"}</p>
            <p>
              {formatDisplayDate(stay.checkIn)} → {formatDisplayDate(stay.checkOut)}
            </p>
            <p>
              {stay.room?.title || stay.room?.board || "Room"}
              {stay.total != null ? ` · ${formatMoney(stay.total)}` : ""}
            </p>
            {(lite.prebookId || lite.bookingId) && (
              <p className={styles.refs}>
                {lite.bookingId && (
                  <>
                    Hotel booking: <code>{lite.bookingId}</code>
                    <br />
                  </>
                )}
                {lite.hotelConfirmationCode && (
                  <>
                    Confirmation: <code>{lite.hotelConfirmationCode}</code>
                    <br />
                  </>
                )}
                {lite.prebookId && (
                  <>
                    Hold: <code>{lite.prebookId}</code>
                  </>
                )}
              </p>
            )}
          </section>

          {flight ? (
            <section className={styles.card}>
              <h2>Flight</h2>
              <p className={styles.hotel}>
                {flight.airline || "Airline"}
                {flight.airlineCode ? ` · ${flight.airlineCode}` : ""}
              </p>
              <p>
                {flight.origin} → {flight.destination}
              </p>
              <p>
                {formatDisplayDate(flight.departDate || stay.checkIn)} →{" "}
                {formatDisplayDate(flight.returnDate || stay.checkOut)}
              </p>
            </section>
          ) : null}

          <section className={styles.card}>
            <h2>What&apos;s included</h2>
            <ul className={styles.bulletList}>
              {(pkg.inclusions || []).map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            {(pkg.exclusions || []).length > 0 && (
              <>
                <h3 className={styles.subhead}>Not included</h3>
                <ul className={styles.bulletListMuted}>
                  {pkg.exclusions.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </>
            )}
          </section>

          {estimates ? (
            <section className={styles.card}>
              <h2>Estimated on-ground costs</h2>
              <p className={styles.cardHint}>Not charged here - plan cash / UPI for local spend.</p>
              <dl className={styles.estimateGrid}>
                {estimates.transfers ? (
                  <>
                    <dt>Transfers</dt>
                    <dd>
                      {formatEstimateRange(
                        estimates.transfers.min,
                        estimates.transfers.max,
                        formatMoney
                      )}
                    </dd>
                  </>
                ) : null}
                {estimates.meals ? (
                  <>
                    <dt>Meals</dt>
                    <dd>
                      {formatEstimateRange(estimates.meals.min, estimates.meals.max, formatMoney)}
                    </dd>
                  </>
                ) : null}
                {estimates.darshan ? (
                  <>
                    <dt>Entry / darshan</dt>
                    <dd>
                      {formatEstimateRange(
                        estimates.darshan.min,
                        estimates.darshan.max,
                        formatMoney
                      )}
                    </dd>
                  </>
                ) : null}
                {estimates.totalMin != null ? (
                  <>
                    <dt>Total estimate</dt>
                    <dd>
                      {formatEstimateRange(estimates.totalMin, estimates.totalMax, formatMoney)}
                    </dd>
                  </>
                ) : null}
              </dl>
              {(estimates.notes || []).map((n) => (
                <p key={n} className={styles.note}>
                  {n}
                </p>
              ))}
            </section>
          ) : null}

          {know.length > 0 ? (
            <section className={`${styles.card} ${styles.cardWide}`}>
              <h2>Know before you go</h2>
              <div className={styles.knowGrid}>
                {know.map((m) => (
                  <div key={m.id || m.title} className={styles.knowItem}>
                    <strong>{m.title}</strong>
                    <p>{m.body}</p>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </div>

        <ActionRow className={styles.actions}>
          <ActionButton to={`/packages/${pkg.slug || pkg.id}`}>View package</ActionButton>
          <ActionButton to="/trips">
            <Map size={16} aria-hidden />
            My Trips
          </ActionButton>
          {showCancelAction ? (
            <ActionButton
              variant="ghost"
              disabled={cancelBusy}
              onClick={handleCancelPackage}
            >
              <Ban size={16} aria-hidden />
              {cancelBusy
                ? "Working…"
                : awaitingSupplierRefund
                  ? "Check refund / settle"
                  : "Cancel package"}
            </ActionButton>
          ) : null}
          <ActionButton variant="ghost" onClick={() => navigate("/")}>
            <Home size={16} aria-hidden />
            Back to home
          </ActionButton>
          <ActionButton variant="ghost" to="/packages">
            Book another package
          </ActionButton>
        </ActionRow>
        {cancelMsg ? <p className={styles.meta}>{cancelMsg}</p> : null}
        {cancelErr ? <p className={styles.meta} style={{ color: "#b91c1c" }}>{cancelErr}</p> : null}
      </div>
    </PageLayout>
  );
}
