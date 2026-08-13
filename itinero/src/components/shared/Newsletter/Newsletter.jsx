import React, { useState } from "react";
import { NEWSLETTER_IMAGES } from "@/constants/images";
import Container from "@/components/layout/Container";
import { interestService } from "@/services/interestTracker";
import { getAttribution } from "@/services/attribution";
import "./Newsletter.css";

/**
 * Newsletter subscription — wires to Marketing OS lead + welcome mail.
 */
export default function Newsletter() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    if (!email.trim()) return;
    setBusy(true);
    setStatus("");
    try {
      const attr = getAttribution();
      await interestService.subscribe({
        email: email.trim(),
        acq_source: attr.acq_source || "newsletter",
        acq_medium: attr.acq_medium || "footer",
        acq_campaign: attr.acq_campaign || "site_newsletter",
        landing_path: attr.landing_path || (typeof window !== "undefined" ? window.location.pathname : "/"),
      });
      setStatus("Subscribed — watch your inbox for trip ideas.");
      setEmail("");
    } catch (err) {
      setStatus(err?.message || "Could not subscribe. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="newsletter" id="newsletter">
      <Container>
        <div
          className="newsletter__inner"
          style={{
            backgroundImage: `url(${NEWSLETTER_IMAGES.bgImage})`,
          }}
        >
          <div className="newsletter__content">
            <h2 className="newsletter__title">
              Subscribe to get travel deals & updates
            </h2>
            <p className="newsletter__subtitle">
              Get the latest deals, travel tips, and destination inspiration straight to your inbox.
            </p>
            <form className="newsletter__form" onSubmit={onSubmit}>
              <input
                type="email"
                className="newsletter__input"
                placeholder="Enter your email address"
                id="newsletter-email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={busy}
              />
              <button className="newsletter__btn" type="submit" disabled={busy}>
                <img
                  src={NEWSLETTER_IMAGES.planeIcon}
                  className="newsletter__btn-icon"
                  alt=""
                />
                <span>{busy ? "…" : "Subscribe"}</span>
              </button>
            </form>
            {status ? (
              <p style={{ marginTop: 12, color: "#fff", fontSize: 14 }}>{status}</p>
            ) : null}
          </div>
        </div>
      </Container>
    </section>
  );
}
