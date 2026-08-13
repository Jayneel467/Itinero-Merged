import { Link } from "react-router-dom";
import { useHomeLocationOptional } from "@/context/HomeLocationContext";
import { isTrainsMarket } from "@/constants/regionalFeatures";
import "./Footer.css";

const BASE_LINKS = [
  { label: "Flights", to: "/flights" },
  { label: "Stays", to: "/hotels" },
  { label: "Trains", to: "/trains", indiaOnly: true },
  { label: "Transits", to: "/transits" },
  { label: "Packages", to: "/packages" },
  { label: "Explore", to: "/explore" },
  { label: "Vero", to: "/vero" },
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

  return (
    <footer className="footer">
      <div className="footer__inner footer__inner--simple">
        <Link to="/" className="footer__logoLink" aria-label="Itinero home">
          <img src={logoSrc} alt="itinero" className="footer__logoImg" />
        </Link>
        <p className="footer__tagline footer__tagline--center">
          Discover more <em>everywhere</em>.
        </p>
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
        <p className="footer__copy">
          © {year} Itinero ·{" "}
          <Link to="/help" className="footer__col-link">
            Support
          </Link>
          {" · "}
          <Link to="/feedback" className="footer__col-link">
            Feedback
          </Link>
        </p>
      </div>
    </footer>
  );
}
