import React from "react";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import "./PageLayout.css";

/**
 * Standard page layout wrapper - Navbar + main content + Footer.
 * Vero drawer is position:fixed overlay — never pad/shift this shell
 * or hero/left columns get crushed and navbar chrome clips.
 */
export default function PageLayout({
  showNavbar = true,
  showFooter = true,
  className = "",
  centerContent = null,
  showVeroBot: _showVeroBot = true,
  children,
}) {
  return (
    <div className="flex flex-col bg-[var(--surface-elevated)] min-h-screen text-[var(--text-primary)]">
      {showNavbar && <Navbar centerContent={centerContent} />}
      <div className="self-stretch bg-[var(--surface-page)] vero-layout-wrapper">
        <main className={className}>{children}</main>
        {showFooter && <Footer />}
      </div>
    </div>
  );
}
