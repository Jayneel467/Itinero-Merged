import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import Sidebar from "../Sidebar/Sidebar";
import LoginModal from "../../../features/auth/components/LoginModal";
import Switch from "../../ui/sky-toggle";
import RegionalModal from "../../shared/RegionalModal";
import "./Navbar.css";

/**
 * Top navigation bar — uses Navbar.css class system
 * with built-in responsive breakpoints (1440 / 1024 / 768 / 480).
 */
export default function Navbar({ centerContent = null }) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [isLanguageModalOpen, setIsLanguageModalOpen] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState("en-US");
  const [selectedLanguageFlag, setSelectedLanguageFlag] = useState("https://flagcdn.com/w40/us.png");
  const [selectedCurrency, setSelectedCurrency] = useState("USD");
  const [selectedCurrencySymbol, setSelectedCurrencySymbol] = useState("$");
  const [defaultRegionalTab, setDefaultRegionalTab] = useState("language");
  const [isScrolled, setIsScrolled] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 10);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <>
      <nav className={`navbar ${isScrolled ? 'navbar--scrolled' : ''}`}>
        <div className="navbar__inner relative z-[100]">

          {/* Logo area: hamburger + brand */}
          <div className="navbar__logo">
            <button
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="navbar__hamburger"
              aria-label="Toggle menu"
            >
              
              <img
                src="https://storage.googleapis.com/tagjs-prod.appspot.com/v1/hurs0BoZOo/a43ymvp2_expires_30_days.png"
                className="navbar__logo-icon"
                alt="Menu"
              />
            </button>
            <Link to="/">

            <img
              src="https://storage.googleapis.com/tagjs-prod.appspot.com/v1/hurs0BoZOo/5mm2143s_expires_30_days.png"
              className="navbar__logo-text"
              alt="Itinero Logo"
            />
            </Link>
          </div>

          {/* Flexible spacer */}
          <div className="navbar__spacer"></div>

          {/* Center Content */}
          {centerContent && (
            <div className="navbar__centerContent hidden lg:flex" style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', zIndex: 10 }}>
              {centerContent}
            </div>
          )}

          {/* Flexible spacer */}
          <div className="navbar__spacer"></div>

          {/* Currency Switcher */}
          <button 
            onClick={() => {
              setDefaultRegionalTab('currency');
              setIsLanguageModalOpen(true);
            }}
            style={{
              fontSize: '20px',
              fontWeight: 700,
              color: '#001439',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: '8px 12px',
              marginRight: '8px'
            }}
            className="hidden md:block dark:text-white hover:opacity-80 transition"
          >
            {selectedCurrency}
          </button>

          {/* Language Switcher */}
          <button 
            onClick={() => {
              setDefaultRegionalTab('language');
              setIsLanguageModalOpen(true);
            }}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginRight: '12px'
            }}
            className="hidden md:flex hover:scale-105 transition"
          >
            <img 
              src={selectedLanguageFlag} 
              alt="Selected Language Flag" 
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '50%',
                objectFit: 'cover',
                boxShadow: '0px 1px 3px rgba(0,0,0,0.15)'
              }}
            />
          </button>

          {/* Theme Toggle */}
          <div className="flex items-center" style={{ marginRight: '16px' }}>
            <Switch isDarkMode={isDarkMode} onToggle={() => setIsDarkMode(!isDarkMode)} />
          </div>

          {/* Primary action button */}
          <button
            onClick={() => setIsLoginModalOpen(true)}
            aria-label="Account menu"
            style={{
              width: '46px',
              height: '46px',
              borderRadius: '50%',
              background: '#001439',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: 'none',
              cursor: 'pointer',
              boxShadow: '0px 2px 5px rgba(0,0,0,0.15)'
            }}
            className="hover:opacity-90 hover:scale-105 transition navbar__profile-btn"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
              <circle cx="12" cy="7" r="4"/>
            </svg>
          </button>

        </div>
        <Sidebar 
          isOpen={isSidebarOpen} 
          onClose={() => setIsSidebarOpen(false)} 
          selectedLanguage={selectedLanguage}
          selectedLanguageFlag={selectedLanguageFlag}
          selectedCurrency={selectedCurrency}
          selectedCurrencySymbol={selectedCurrencySymbol}
          onOpenCurrencyModal={() => {
            setDefaultRegionalTab('currency');
            setIsLanguageModalOpen(true);
            setIsSidebarOpen(false);
          }}
          onOpenLanguageModal={() => {
            setDefaultRegionalTab('language');
            setIsLanguageModalOpen(true);
            setIsSidebarOpen(false);
          }}
        />
      </nav>
      <LoginModal isOpen={isLoginModalOpen} onClose={() => setIsLoginModalOpen(false)} />
      
      <RegionalModal 
        isOpen={isLanguageModalOpen}
        onClose={() => setIsLanguageModalOpen(false)}
        defaultTab={defaultRegionalTab}
        selectedLanguage={selectedLanguage}
        onSelectLanguage={(code, flag) => {
          setSelectedLanguage(code);
          setSelectedLanguageFlag(flag);
        }}
        selectedCurrency={selectedCurrency}
        onSelectCurrency={(code, symbol) => {
          setSelectedCurrency(code);
          setSelectedCurrencySymbol(symbol);
        }}
      />
    </>
  );
}
