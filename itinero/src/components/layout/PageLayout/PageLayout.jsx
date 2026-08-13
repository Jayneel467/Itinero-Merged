import React from "react";
import { useLocation } from "react-router-dom";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import { useVeroUiOptional } from "@/context/VeroUiContext";
import "./PageLayout.css";

/**
 * Standard page layout wrapper - Navbar + main content + Footer.
 * Vero chat lives once at the app shell so it stays open across pages.
 */
export default function PageLayout({
  showNavbar = true,
  showFooter = true,
  className = "",
  centerContent = null,
  showVeroBot: _showVeroBot = true,
  children,
}) {
  const veroUi = useVeroUiOptional();
  const location = useLocation();
  const isOpen = Boolean(veroUi?.isOpen);
  const drawerShiftsLayout =
    isOpen &&
    location.pathname !== "/vero" &&
    !location.pathname.startsWith("/vero/");

  return (
    <div className="flex flex-col bg-[var(--surface-elevated)] min-h-screen text-[var(--text-primary)]">
      <div
        className={`self-stretch bg-[var(--surface-page)] vero-layout-wrapper ${
          drawerShiftsLayout ? "vero-is-open" : ""
        }`}
      >
        {showNavbar && <Navbar centerContent={centerContent} />}

        <main className={className}>{children}</main>

        {showFooter && <Footer />}
      </div>
    </div>
  );
}
