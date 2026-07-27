import React from "react";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import "./PageLayout.css";

/**
 * Standard page layout wrapper — Navbar + main content + Footer.
 * Uses exact Figma export structure: white bg flex-col > #F2F2F2 inner.
 */
export default function PageLayout({
  showNavbar = true,
  showFooter = true,
  className = "",
  centerContent = null,
  children,
}) {
  return (
    <div className="flex flex-col bg-white">
      <div className="self-stretch bg-[#F2F2F2]">
        {showNavbar && <Navbar centerContent={centerContent} />}

        <main className={className}>
          {children}
        </main>

        {showFooter && <Footer />}
      </div>
    </div>
  );
}
