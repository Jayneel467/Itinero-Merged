import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuthOptional } from "@/features/auth/context/AuthContext";
import { Bell, Menu } from "lucide-react";
import Sidebar from "../Sidebar/Sidebar";
import LoginModal from "../../../features/auth/components/LoginModal";
import Switch from "../../ui/sky-toggle";
import RegionalModal from "../../shared/RegionalModal";
import { useCurrency } from "@/context/CurrencyContext";
import { useHomeLocationOptional } from "@/context/HomeLocationContext";
import { useLanguage } from "@/context/LanguageContext";
import { useTheme } from "@/context/ThemeContext";
import { listFeed, unreadAlertCount } from "@/features/account/alertService";
import "./Navbar.css";

/**
 * Top navigation bar - uses Navbar.css class system
 * with built-in responsive breakpoints (1440 / 1024 / 768 / 480).
 */
export default function Navbar({ centerContent = null }) {
  const navigate = useNavigate();
  const auth = useAuthOptional();
  const { currency, symbol, setCurrency } = useCurrency();
  const { language, languageFlag, setLanguage } = useLanguage();
  const { isDark, toggleTheme } = useTheme();
  const home = useHomeLocationOptional();
  const regionalFlag = home?.countryFlag || languageFlag;
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [isLanguageModalOpen, setIsLanguageModalOpen] = useState(false);
  const [defaultRegionalTab, setDefaultRegionalTab] = useState("location");
  const [isScrolled, setIsScrolled] = useState(false);
  const [unreadAlerts, setUnreadAlerts] = useState(0);
  const iconColor = isDark ? "#e8edf4" : "#001438";
  const currencyColor = isDark ? "#e8edf4" : "#001439";

  useEffect(() => {
    const refreshBadge = () => setUnreadAlerts(unreadAlertCount(listFeed()));
    refreshBadge();
    const onFocus = () => refreshBadge();
    window.addEventListener("focus", onFocus);
    const id = window.setInterval(refreshBadge, 15000);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.clearInterval(id);
    };
  }, []);

  useEffect(() => {
    const openRegional = (e) => {
      const tab = e?.detail?.tab || "location";
      setDefaultRegionalTab(tab);
      setIsLanguageModalOpen(true);
    };
    window.addEventListener("itinero:open-regional", openRegional);
    return () => window.removeEventListener("itinero:open-regional", openRegional);
  }, []);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 10);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <>
      <nav className={`navbar ${isScrolled ? "navbar--scrolled" : ""}`}>
        <div className="navbar__inner relative z-[100]">
          <div className="navbar__logo">
            <button
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="navbar__hamburger"
              aria-label="Toggle menu"
            >
              <Menu size={22} strokeWidth={2.25} color={iconColor} aria-hidden />
            </button>
            <Link to="/">
              <img
                src={`${import.meta.env.BASE_URL}itinero-logo.png`}
                className="navbar__logo-text"
                alt="Itinero"
              />
            </Link>
          </div>

          <div className="navbar__spacer"></div>

          {centerContent && (
            <div className="navbar__centerContent hidden lg:flex">
              {centerContent}
            </div>
          )}

          <div className="navbar__actions">
            <Link
              to="/notifications"
              className="navbar__bell"
              aria-label={
                unreadAlerts > 0 ? `Notifications, ${unreadAlerts} unread` : "Notifications"
              }
              title="Notifications"
            >
              <Bell size={20} strokeWidth={2.2} color={iconColor} aria-hidden />
              {unreadAlerts > 0 ? (
                <span className="navbar__bellBadge">{unreadAlerts > 9 ? "9+" : unreadAlerts}</span>
              ) : null}
            </Link>

            <button
              type="button"
              onClick={() => {
                setDefaultRegionalTab("currency");
                setIsLanguageModalOpen(true);
              }}
              className="navbar__currency hidden md:block"
              style={{ color: currencyColor }}
              aria-label={`Currency ${currency}`}
              title={`${symbol} ${currency}`}
            >
              {symbol} {currency}
            </button>

            <button
              type="button"
              onClick={() => {
                setDefaultRegionalTab("location");
                setIsLanguageModalOpen(true);
              }}
              className="navbar__flag hidden md:flex"
              aria-label={
                home?.originLabel
                  ? `Home location ${home.originLabel}`
                  : "Set home location"
              }
              title={
                home?.hasOrigin
                  ? `${home.originLabel} · ${home.passportLabel}`
                  : "Set home airport & passport"
              }
            >
              <img src={regionalFlag} alt="" />
            </button>

            <div className="navbar__theme">
              <Switch
                isDarkMode={isDark}
                onToggle={toggleTheme}
                aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
              />
            </div>

            <button
              type="button"
              onClick={() =>
                auth?.isAuthenticated ? navigate("/profile") : setIsLoginModalOpen(true)
              }
              aria-label="Account menu"
              className="navbar__profile-btn hover:opacity-90 hover:scale-105 transition"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#FFFFFF"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            </button>
          </div>
        </div>
        <Sidebar
          isOpen={isSidebarOpen}
          onClose={() => setIsSidebarOpen(false)}
          selectedLanguage={language}
          selectedLanguageFlag={languageFlag}
          selectedCurrency={currency}
          selectedCurrencySymbol={symbol}
          onOpenCurrencyModal={() => {
            setDefaultRegionalTab("currency");
            setIsLanguageModalOpen(true);
            setIsSidebarOpen(false);
          }}
          onOpenLanguageModal={() => {
            setDefaultRegionalTab("language");
            setIsLanguageModalOpen(true);
            setIsSidebarOpen(false);
          }}
        />
      </nav>
      <LoginModal
        isOpen={isLoginModalOpen}
        onClose={() => setIsLoginModalOpen(false)}
        onLoginSuccess={() => setIsLoginModalOpen(false)}
      />

      <RegionalModal
        isOpen={isLanguageModalOpen}
        onClose={() => setIsLanguageModalOpen(false)}
        defaultTab={defaultRegionalTab}
        selectedLanguage={language}
        onSelectLanguage={(code) => setLanguage(code)}
        selectedCurrency={currency}
        onSelectCurrency={setCurrency}
      />
    </>
  );
}
