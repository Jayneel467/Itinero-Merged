import React, { useMemo } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuthOptional } from "@/features/auth/context/AuthContext";
import { readLocalUser } from "@/features/auth/session";
import {
  Award,
  Bell,
  Bookmark,
  Briefcase,
  Bus,
  ChevronRight,
  Compass,
  Gift,
  LifeBuoy,
  MessageSquareHeart,
  Plane,
  X,
  Radar,
  Sparkles,
  BedDouble,
  Ticket,
  TrainFront,
} from "lucide-react";
import { useHomeLocationOptional } from "@/context/HomeLocationContext";
import { useBillingOptional } from "@/features/billing/BillingContext";
import { isTrainsMarket } from "@/constants/regionalFeatures";
import styles from "./Sidebar.module.css";

function NavLinkItem({ to, onClose, children, match, accent }) {
  const { pathname } = useLocation();
  const active =
    typeof match === "function"
      ? match(pathname)
      : pathname === to || (to !== "/" && pathname.startsWith(to));

  return (
    <li>
      <Link
        to={to}
        onClick={onClose}
        className={`${styles.link}${active ? ` ${styles.linkActive}` : ""}${
          accent ? ` ${styles.linkAccent}` : ""
        }`}
        data-active={active ? "true" : undefined}
      >
        {children}
      </Link>
    </li>
  );
}

function IconTile({ children, tone = "slate" }) {
  return <span className={`${styles.iconTile} ${styles[`tone_${tone}`]}`}>{children}</span>;
}

import { getLanguageMeta } from "@/constants/languages";

const Sidebar = ({
  isOpen,
  onClose,
  selectedLanguage = "en-IN",
  selectedLanguageFlag = "https://flagcdn.com/w40/in.png",
  selectedCurrency = "USD",
  selectedCurrencySymbol = "$",
  onOpenCurrencyModal,
  onOpenLanguageModal,
}) => {
  const languageLabel = getLanguageMeta(selectedLanguage).name;

  const auth = useAuthOptional();
  const billing = useBillingOptional();
  const home = useHomeLocationOptional();
  const showTrains = isTrainsMarket({
    countryCode: home?.countryCode,
    passportCountry: home?.passportCountry,
  });
  const profile = useMemo(() => {
    const user = auth?.user || readLocalUser();
    if (!user) {
      return { name: "Guest traveller", hint: "Sign in", initials: "G", to: "/login" };
    }
    const name =
      user.name ||
      user.displayName ||
      [user.firstName, user.lastName].filter(Boolean).join(" ") ||
      "Itinero member";
    return {
      name,
      hint: "Account",
      initials: name
        .split(" ")
        .map((p) => p[0])
        .join("")
        .slice(0, 2)
        .toUpperCase(),
      to: "/profile",
    };
  }, [auth?.user, isOpen]);

  return (
    <>
      {isOpen ? (
        <div className={styles.overlay} onClick={onClose} aria-hidden="true" />
      ) : null}

      <nav
        className={`${styles.panel}${isOpen ? ` ${styles.panelOpen}` : ""}`}
        role="dialog"
        aria-label="Main menu"
        aria-hidden={!isOpen}
      >
        <div className={styles.head}>
          <p className={styles.headTitle}>Menu</p>
          <button type="button" className={styles.close} onClick={onClose} aria-label="Close menu">
            <X size={18} strokeWidth={2.2} aria-hidden />
          </button>
        </div>
        <div className={styles.scroll}>
          <p className={styles.sectionLabel}>Travel</p>
          <ul className={styles.list}>
            <NavLinkItem
              to="/flights"
              onClose={onClose}
              match={(p) =>
                p === "/flights" || (p.startsWith("/flights/") && !p.startsWith("/flights/track"))
              }
            >
              <IconTile tone="sky">
                <Plane size={18} strokeWidth={2.1} aria-hidden />
              </IconTile>
              <span className={styles.linkText}>Flights</span>
            </NavLinkItem>

            <NavLinkItem to="/flights/track" onClose={onClose}>
              <IconTile tone="navy">
                <Radar size={18} strokeWidth={2.1} aria-hidden />
              </IconTile>
              <span className={styles.linkText}>Flight track</span>
            </NavLinkItem>

            <NavLinkItem to="/hotels" onClose={onClose}>
              <IconTile tone="teal">
                <BedDouble size={18} strokeWidth={2.1} aria-hidden />
              </IconTile>
              <span className={styles.linkText}>Hotels</span>
            </NavLinkItem>

            {showTrains ? (
              <NavLinkItem
                to="/trains"
                onClose={onClose}
                match={(p) => p === "/trains" || p.startsWith("/trains/")}
              >
                <IconTile tone="navy">
                  <TrainFront size={18} strokeWidth={2.1} aria-hidden />
                </IconTile>
                <span className={styles.linkText}>Trains</span>
                <span className={styles.linkHint}>India</span>
              </NavLinkItem>
            ) : null}

            <NavLinkItem
              to="/transits"
              onClose={onClose}
              match={(p) =>
                p === "/transits" ||
                p.startsWith("/transits/") ||
                p === "/buses" ||
                p.startsWith("/buses/")
              }
            >
              <IconTile tone="sky">
                <Bus size={18} strokeWidth={2.1} aria-hidden />
              </IconTile>
              <span className={styles.linkText}>Transits</span>
              <span className={styles.linkHint}>Beta</span>
            </NavLinkItem>

            <NavLinkItem to="/packages" onClose={onClose}>
              <IconTile tone="amber">
                <Gift size={18} strokeWidth={2.1} aria-hidden />
              </IconTile>
              <span className={styles.linkText}>Packages</span>
            </NavLinkItem>

            <NavLinkItem to="/vero" onClose={onClose} accent>
              <IconTile tone="orange">
                <Sparkles size={18} strokeWidth={2.1} aria-hidden />
              </IconTile>
              <span className={styles.linkText}>Ask Vero</span>
              <span className={styles.linkHint}>Free</span>
            </NavLinkItem>
          </ul>

          <div className={styles.rule} />

          <p className={styles.sectionLabel}>Your travel</p>
          <ul className={styles.list}>
            <NavLinkItem
              to="/trips"
              onClose={onClose}
              match={(p) => p === "/trips" || p.startsWith("/trips/")}
            >
              <IconTile tone="navy">
                <Briefcase size={18} strokeWidth={2.1} aria-hidden />
              </IconTile>
              <span className={styles.linkText}>My Trips</span>
            </NavLinkItem>

            <NavLinkItem to="/saved" onClose={onClose}>
              <IconTile tone="rose">
                <Bookmark size={18} strokeWidth={2.1} aria-hidden />
              </IconTile>
              <span className={styles.linkText}>Saved</span>
            </NavLinkItem>
          </ul>

          <div className={styles.rule} />

          <p className={styles.sectionLabel}>Discover</p>
          <ul className={styles.list}>
            <NavLinkItem
              to="/explore"
              onClose={onClose}
              match={(p) => p === "/explore" || p.startsWith("/explore/")}
            >
              <IconTile tone="navy">
                <Compass size={18} strokeWidth={2.1} aria-hidden />
              </IconTile>
              <span className={styles.linkText}>Explore</span>
            </NavLinkItem>

            <NavLinkItem to="/events" onClose={onClose} match={(p) => p === "/events" || p.startsWith("/events/")}>
              <IconTile tone="amber">
                <Ticket size={18} strokeWidth={2.1} aria-hidden />
              </IconTile>
              <span className={styles.linkText}>Events</span>
            </NavLinkItem>
          </ul>

          <div className={styles.rule} />

          <p className={styles.sectionLabel}>Account</p>
          <ul className={styles.list}>
            <li>
              <button type="button" onClick={onOpenLanguageModal} className={styles.link}>
                <span className={`${styles.iconTile} ${styles.tone_flag}`}>
                  <img src={selectedLanguageFlag} alt="" className={styles.flag} />
                </span>
                <span className={styles.linkText}>{languageLabel}</span>
                <ChevronRight size={16} className={styles.chevron} aria-hidden />
              </button>
            </li>
            <li>
              <button type="button" onClick={onOpenCurrencyModal} className={styles.link}>
                <span className={`${styles.iconTile} ${styles.tone_slate}`}>
                  <span className={styles.currencySym} aria-hidden>
                    {selectedCurrencySymbol}
                  </span>
                </span>
                <span className={styles.linkText}>{selectedCurrency}</span>
                <ChevronRight size={16} className={styles.chevron} aria-hidden />
              </button>
            </li>
            <NavLinkItem to="/plus" onClose={onClose}>
              <IconTile tone="orange">
                <Sparkles size={18} strokeWidth={2.1} aria-hidden />
              </IconTile>
              <span className={styles.linkText}>Vero credits</span>
              <span className={styles.linkHint}>Buy packs</span>
            </NavLinkItem>
            <NavLinkItem to="/rewards" onClose={onClose}>
              <IconTile tone="amber">
                <Award size={18} strokeWidth={2.1} aria-hidden />
              </IconTile>
              <span className={styles.linkText}>Rewards</span>
            </NavLinkItem>
            <NavLinkItem to="/notifications" onClose={onClose}>
              <IconTile tone="slate">
                <Bell size={18} strokeWidth={2.1} aria-hidden />
              </IconTile>
              <span className={styles.linkText}>Notifications</span>
            </NavLinkItem>
            <NavLinkItem to="/help" onClose={onClose}>
              <IconTile tone="orange">
                <LifeBuoy size={18} strokeWidth={2.1} aria-hidden />
              </IconTile>
              <span className={styles.linkText}>Help & Support</span>
            </NavLinkItem>
            <NavLinkItem to="/feedback" onClose={onClose}>
              <IconTile tone="sky">
                <MessageSquareHeart size={18} strokeWidth={2.1} aria-hidden />
              </IconTile>
              <span className={styles.linkText}>Feedback</span>
            </NavLinkItem>
          </ul>
        </div>

        <Link to={profile.to} onClick={onClose} className={styles.profileRow}>
          <span className={styles.avatar} aria-hidden>
            {profile.initials}
          </span>
          <span className={styles.profileCopy}>
            <strong>{profile.name}</strong>
            <em>{profile.hint}</em>
          </span>
          <ChevronRight size={16} className={styles.chevron} aria-hidden />
        </Link>
      </nav>
    </>
  );
};

export default Sidebar;
