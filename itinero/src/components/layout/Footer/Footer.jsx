import { Link } from "react-router-dom";
import { useState } from "react";
import { useHomeLocationOptional } from "@/context/HomeLocationContext";
import { isTrainsMarket } from "@/constants/regionalFeatures";
import { LEGAL } from "@/constants/legal";
import { interestService } from "@/services/interestTracker";
import { getAttribution } from "@/services/attribution";
import "./Footer.css";

const BASE_LINKS = [
  { label: "Flights", to: "/flights" },
  { label: "Stays", to: "/hotels" },
  { label: "Trains", to: "/trains", indiaOnly: true },
  { label: "Transits", to: "/transits" },
  { label: "Packages", to: "/packages" },
  { label: "Events", to: "/events" },
  { label: "Explore", to: "/explore" },
  { label: "Saved", to: "/saved" },
  { label: "Deals", to: "/deals" },
  { label: "Trip ideas", to: "/go" },
  { label: "Vero", to: "/vero" },
  { label: "Trips", to: "/trips" },
  { label: "Credits", to: "/plus" },
  { label: "Rewards", to: "/rewards" },
  { label: "Help", to: "/help" },
  { label: "Feedback", to: "/feedback" },
  { label: "Terms", to: "/terms" },
  { label: "Privacy", to: "/privacy" },
  { label: "Cancellations", to: "/cancellation" },
];

export default function Footer() {
  const logoSrc = `${import.meta.env.BASE_URL}itinero-logo.png`;
  const year = new Date().getFullYear();
  const home = useHomeLocationOptional();
  const showTrains = isTrainsMarket({
    countryCode: home?.countryCode,
    passportCountry: home?.passportCountry,
  });
  const links = BASE_LINKS.filter((l) => !l.indiaOnly || showTrains);
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubscribe(e) {
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
        landing_path:
          attr.landing_path || (typeof window !== "undefined" ? window.location.pathname : "/"),
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
    <footer className="footer">
      <div className="footer__inner footer__inner--simple">
        <Link to="/" className="footer__logoLink" aria-label="Itinero home">
          <img src={logoSrc} alt="itinero" className="footer__logoImg" />
        </Link>
        <p className="footer__tagline footer__tagline--center">
          Discover more <em>everywhere</em>.
        </p>
        <form className="footer__subscribe" onSubmit={onSubscribe}>
          <label className="footer__subscribeLabel" htmlFor="footer-newsletter">
            Trip ideas in your inbox
          </label>
          <div className="footer__subscribeRow">
            <input
              id="footer-newsletter"
              type="email"
              required
              value={email}
              disabled={busy}
              placeholder="you@email.com"
              onChange={(e) => setEmail(e.target.value)}
            />
            <button type="submit" disabled={busy}>
              {busy ? "…" : "Subscribe"}
            </button>
          </div>
          {status ? <p className="footer__subscribeStatus">{status}</p> : null}
        </form>
        <nav className="footer__simpleNav" aria-label="Product">
          {links.map((l) => (
            <Link key={l.label} to={l.to} className="footer__col-link">
              {l.label}
            </Link>
          ))}
        </nav>
        <p className="footer__helpCopy footer__helpCopy--center">
          Your trip doesn’t end at checkout. Vero stays with you for the next move.
        </p>
        <p className="footer__copy">© {year} {LEGAL.entityName}</p>
      </div>
    </footer>
  );
}
