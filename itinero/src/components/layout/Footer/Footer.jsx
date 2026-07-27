import { Link } from "react-router-dom";
import "./Footer.css";

const productLinks = [
  { label: "Ask Vero", to: "/vero" },
  { label: "Flights", to: "/flights" },
  { label: "Hotels & Stays", to: "/hotels" },
];
const exploreLinks = [
  { label: "Flights", to: "/flights" },
  { label: "Hotels & Stays", to: "/hotels" },
];

export default function Footer() {
  return (
    <footer className="footer">
      <div className="footer__inner">
        <div className="footer__top">
          <section className="footer__brand">
            <div className="footer__logo" aria-label="Itinero">
              <span>itin</span>
              <em>ero</em>
            </div>
            <p className="footer__tagline">
              Itinero is your intelligent travel companion — powered by Vero, your AI travel
              buddy. Discover deals, smart routing, and seamless booking.
            </p>
          </section>

          <nav className="footer__col" aria-label="Product">
            <h3 className="footer__col-heading">Product</h3>
            {productLinks.map((l) => (
              <Link key={l.label} to={l.to} className="footer__col-link">
                {l.label}
              </Link>
            ))}
          </nav>

          <nav className="footer__col" aria-label="Explore">
            <h3 className="footer__col-heading">Explore</h3>
            {exploreLinks.map((l) => (
              <Link key={l.label} to={l.to} className="footer__col-link">
                {l.label}
              </Link>
            ))}
          </nav>
        </div>
      </div>
    </footer>
  );
}
