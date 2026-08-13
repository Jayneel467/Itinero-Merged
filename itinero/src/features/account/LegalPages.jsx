import React from "react";
import { Link } from "react-router-dom";
import { PageLayout } from "@/components/layout";
import { LEGAL, legalMailto, supportMailto } from "@/constants/legal";
import styles from "./LegalPages.module.css";

function LegalHeader({ title, lede }) {
  return (
    <header className={styles.head}>
      <p className={styles.kicker}>Legal</p>
      <h1 className={styles.title}>{title}</h1>
      <p className={styles.meta}>Last updated {LEGAL.updated}</p>
      <p className={styles.lede}>{lede}</p>
    </header>
  );
}

function EntityBlock() {
  return (
    <section className={styles.section}>
      <h2>Who we are</h2>
      <p>
        <strong>{LEGAL.brand}</strong> is a travel technology platform operated by{" "}
        <strong>{LEGAL.entityName}</strong>. Registered / correspondence address:{" "}
        {LEGAL.registeredAddress}.
      </p>
      <p>
        We help you search and book flights, stays, packages, and related trip tools.{" "}
        <strong>Vero</strong> is our in-product travel assistant. Live prices, seats, rooms,
        and supplier policies come from airlines, hotels, and partners - we do not invent
        gates, PNRs, or fare rules.
      </p>
      <p>
        {LEGAL.brand} acts as an intermediary / facilitator for bookings fulfilled by third-party
        suppliers, except where we clearly say otherwise on the product.
      </p>
    </section>
  );
}

export function TermsOfUsePage() {
  return (
    <PageLayout>
      <article className={styles.page}>
        <LegalHeader
          title="Terms of use"
          lede={`These terms cover how you use ${LEGAL.brand} - search, booking, payments, and Vero. By continuing you agree to them.`}
        />

        <EntityBlock />

        <section className={styles.section}>
          <h2>Your account</h2>
          <p>
            You’re responsible for the email and devices you use to sign in. Keep OTP codes
            private. Don’t share your account or try to access someone else’s trips.
          </p>
        </section>

        <section className={styles.section}>
          <h2>Bookings &amp; payments</h2>
          <ul>
            <li>A booking is confirmed only when payment succeeds and the supplier accepts it.</li>
            <li>Prices shown before checkout can change until you pay.</li>
            <li>Taxes, fees, and fare rules are set by airlines, hotels, and other suppliers.</li>
            <li>
              Package checkouts may split charges (for example hotel settlement via a supplier
              payment rail and other amounts to {LEGAL.brand}) - the checkout screen shows what
              you pay where.
            </li>
            <li>
              Refunds, changes, and cancellations follow that booking’s live rules. See{" "}
              <Link to="/cancellation">Cancellation &amp; refunds</Link>.
            </li>
          </ul>
        </section>

        <section className={styles.section}>
          <h2>Vero &amp; AI help</h2>
          <p>
            Vero can search, compare, and guide next steps. Answers that depend on live data
            use tools when available. If we don’t have a fact, we say so - don’t treat chat
            as a boarding pass, visa grant, or legal advice.
          </p>
        </section>

        <section className={styles.section}>
          <h2>Acceptable use</h2>
          <p>
            Don’t misuse {LEGAL.brand}: no scraping, fraud, abusive automation, or attempts to
            bypass payment or security. We may suspend access that harms travellers or our
            partners.
          </p>
        </section>

        <section className={styles.section}>
          <h2>Liability</h2>
          <p>
            Travel is operated by third-party suppliers. To the fullest extent allowed by law,{" "}
            {LEGAL.brand} / {LEGAL.entityName} is not liable for delays, cancellations, inventory
            errors, or supplier service failures beyond what applicable law requires. Where
            liability cannot be excluded, it is limited to the fees you paid {LEGAL.brand} for
            that booking (if any), excluding amounts paid through to suppliers.
          </p>
        </section>

        <section className={styles.section}>
          <h2>Governing law &amp; disputes</h2>
          <p>
            These terms are governed by {LEGAL.governingLaw}. Subject to mandatory consumer
            rights, disputes are subject to {LEGAL.disputeVenue}.
          </p>
        </section>

        <section className={styles.section}>
          <h2>Changes</h2>
          <p>
            We may update these terms. The date above shows the latest version. Continued use
            after an update means you accept the new terms.
          </p>
        </section>

        <section className={styles.section}>
          <h2>Contact</h2>
          <p>
            Legal notices:{" "}
            <a href={legalMailto("legal")}>{LEGAL.legalEmail}</a>. Product support:{" "}
            <Link to="/help">Help</Link> or{" "}
            <a href={supportMailto()}>{LEGAL.supportEmail}</a>.
          </p>
        </section>

        <p className={styles.footLinks}>
          Also see our <Link to="/privacy">Privacy Policy</Link> and{" "}
          <Link to="/cancellation">Cancellation &amp; refunds</Link>.
        </p>
      </article>
    </PageLayout>
  );
}

export function PrivacyPolicyPage() {
  return (
    <PageLayout>
      <article className={styles.page}>
        <LegalHeader
          title="Privacy Policy"
          lede={`How ${LEGAL.brand} (${LEGAL.entityName}) collects, uses, and shares information when you search, book, or chat with Vero.`}
        />

        <section className={styles.section}>
          <h2>Controller</h2>
          <p>
            For personal data processed through this product, the controller is{" "}
            <strong>{LEGAL.entityName}</strong> ({LEGAL.brand}), {LEGAL.registeredAddress}.
            Contact: <a href={legalMailto("privacy")}>{LEGAL.privacyEmail}</a>.
          </p>
        </section>

        <section className={styles.section}>
          <h2>What we collect</h2>
          <ul>
            <li>
              <strong>Account:</strong> email and sign-in details (including OTP / Google sign-in
              where enabled).
            </li>
            <li>
              <strong>Trip &amp; booking:</strong> search criteria, traveller names you enter,
              booking references we store for My Trips, and payment status from payment partners.
            </li>
            <li>
              <strong>Chat with Vero:</strong> messages you send so we can help on that trip.
            </li>
            <li>
              <strong>Device &amp; usage:</strong> basic logs (browser, approximate region, errors)
              to keep the product working.
            </li>
            <li>
              <strong>Regional preferences:</strong> home city/airport, currency, language, and
              passport nationality you set (used for fares, visa help, and display - never assumed
              silently when blank).
            </li>
          </ul>
        </section>

        <section className={styles.section}>
          <h2>How we use it</h2>
          <ul>
            <li>Run search, booking, and account features you ask for.</li>
            <li>Show your trips, saved items, and price watches on this device or account.</li>
            <li>Improve reliability and catch abuse - not to invent travel facts.</li>
            <li>Send booking or account messages related to what you requested.</li>
          </ul>
        </section>

        <section className={styles.section}>
          <h2>Sharing</h2>
          <p>
            We share what’s needed with airlines, hotels, payment processors (for example
            Stripe / LiteAPI Payment SDK where used), and other suppliers to complete
            a booking or payment. We don’t sell your personal data. We may disclose information
            if required by law or to protect travellers and the service.
          </p>
        </section>

        <section className={styles.section}>
          <h2>Payments</h2>
          <p>
            Card and UPI details are handled by payment partners. {LEGAL.brand} does not store
            full card numbers on our servers.
          </p>
        </section>

        <section className={styles.section}>
          <h2>International transfers</h2>
          <p>
            Suppliers and cloud providers may process data outside {LEGAL.country}. We use them
            only as needed to run the service and complete bookings.
          </p>
        </section>

        <section className={styles.section}>
          <h2>Retention</h2>
          <p>
            We keep booking and account data as long as needed for the trip, support, legal, and
            accounting reasons. You can ask us to delete account data where the law allows -
            some booking records may need to stay.
          </p>
        </section>

        <section className={styles.section}>
          <h2>Your choices</h2>
          <ul>
            <li>Update profile and travellers from your account.</li>
            <li>Clear saved items and local watches on this device.</li>
            <li>
              Email <a href={legalMailto("privacy")}>{LEGAL.privacyEmail}</a> for access or
              deletion requests, or start from <Link to="/help">Help</Link>.
            </li>
          </ul>
        </section>

        <section className={styles.section}>
          <h2>Governing law</h2>
          <p>
            This policy is intended to comply with applicable law in {LEGAL.country}, including
            the Digital Personal Data Protection Act, 2023 where it applies, without limiting
            rights you may have in your place of residence.
          </p>
        </section>

        <p className={styles.footLinks}>
          Also see our <Link to="/terms">Terms of use</Link> and{" "}
          <Link to="/cancellation">Cancellation &amp; refunds</Link>.
        </p>
      </article>
    </PageLayout>
  );
}

export function CancellationPolicyPage() {
  return (
    <PageLayout>
      <article className={styles.page}>
        <LegalHeader
          title="Cancellation & refunds"
          lede={`${LEGAL.brand} does not invent a single “free cancel anywhere” rule. What you can change or refund depends on the live fare / rate you bought.`}
        />

        <section className={styles.section}>
          <h2>How it works</h2>
          <ul>
            <li>
              <strong>Flights:</strong> airline fare rules control cancel, change, and refund.
              Start from <Link to="/trips">My Trips</Link> when cancel is available for that
              ticket. Supplier and payment-partner refund timelines apply after a successful
              cancel.
            </li>
            <li>
              <strong>Hotels / stays:</strong> each rate shows its cancellation window (for
              example free cancel until a date, or non-refundable). After that window, refunds
              follow the hotel / supplier policy.
            </li>
            <li>
              <strong>Packages:</strong> the stay portion follows the hotel rate rules; any
              amount paid to {LEGAL.brand} (for example flights or package share) is refunded
              only if that component’s rules allow it and payment capture can be reversed.
            </li>
            <li>
              <strong>Trains, buses, events:</strong> often partner handoff or affiliate - those
              partners’ own cancel rules apply. We say so on those flows.
            </li>
          </ul>
        </section>

        <section className={styles.section}>
          <h2>Before you pay</h2>
          <p>
            Read cancellation and change text on the offer before checkout. Once payment
            succeeds and the supplier confirms, those rules lock in for that booking.
          </p>
        </section>

        <section className={styles.section}>
          <h2>After you book</h2>
          <ol className={styles.ol}>
            <li>
              Open <Link to="/trips">My Trips</Link> and the booking detail.
            </li>
            <li>Use Cancel / Refund when the product shows it for that booking.</li>
            <li>
              If the action isn’t available, email{" "}
              <a href={supportMailto({ subject: "Cancel / refund help" })}>
                {LEGAL.supportEmail}
              </a>{" "}
              with your booking id, or ask Vero from <Link to="/help">Help</Link> - we won’t
              invent airline policy.
            </li>
          </ol>
        </section>

        <section className={styles.section}>
          <h2>Payment partners</h2>
          <p>
            Refunds of card / UPI captures go back through the original payment method via our
            payment partners (for example Stripe / LiteAPI rails). Bank posting
            times are outside {LEGAL.brand}’s control.
          </p>
        </section>

        <section className={styles.section}>
          <h2>Contact</h2>
          <p>
            {LEGAL.supportSla}. Hours: {LEGAL.supportHours}.{" "}
            <a href={supportMailto()}>{LEGAL.supportEmail}</a> · <Link to="/help">Help</Link>.
          </p>
        </section>

        <p className={styles.footLinks}>
          <Link to="/terms">Terms of use</Link> · <Link to="/privacy">Privacy Policy</Link>
        </p>
      </article>
    </PageLayout>
  );
}

export default TermsOfUsePage;
