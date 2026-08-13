import React, { useState } from "react";
import {
  inferAirlineCode,
  airlineLogoFallbacks,
} from "../utils/airlineIdentity";
import styles from "./AirlineMark.module.css";

const BRAND = {
  EK: { bg: "#D71921", fg: "#fff" },
  EY: { bg: "#7A6855", fg: "#fff" },
  QR: { bg: "#5A0B27", fg: "#fff" },
  GF: { bg: "#6B1D2A", fg: "#E8C97A" },
  FZ: { bg: "#F68B1F", fg: "#fff" },
  G9: { bg: "#C8102E", fg: "#fff" },
  "6E": { bg: "#002F6C", fg: "#fff" },
  QP: { bg: "#111111", fg: "#F5C518" },
  AI: { bg: "#E31E24", fg: "#fff" },
  UK: { bg: "#4B1D6E", fg: "#fff" },
  SG: { bg: "#E31837", fg: "#fff" },
  SV: { bg: "#006C35", fg: "#fff" },
  WY: { bg: "#C8102E", fg: "#fff" },
  SQ: { bg: "#F8B61C", fg: "#1A1A1A" },
  BA: { bg: "#075AAA", fg: "#fff" },
  LH: { bg: "#05164D", fg: "#F9BA00" },
  AF: { bg: "#002157", fg: "#fff" },
  KL: { bg: "#00A1DE", fg: "#fff" },
  TK: { bg: "#C8102E", fg: "#fff" },
};

export default function AirlineMark({
  code,
  name,
  logo,
  flightNumber,
  size = 44,
  className = "",
}) {
  const [failIndex, setFailIndex] = useState(0);
  const inferred = inferAirlineCode(name, flightNumber, code);
  const urls = airlineLogoFallbacks(inferred, logo);
  const src = urls[failIndex];
  const brand = BRAND[inferred] || { bg: "#001439", fg: "#fff" };
  const initials = (inferred || String(name || "FL").replace(/[^A-Za-z]/g, "")).slice(0, 2).toUpperCase() || "FL";

  if (!src) {
    return (
      <div
        className={`${styles.mark} ${styles.fallback} ${className}`}
        style={{ width: size, height: size, background: brand.bg, color: brand.fg, fontSize: size * 0.34 }}
        aria-hidden
      >
        {initials}
      </div>
    );
  }

  return (
    <div className={`${styles.mark} ${className}`} style={{ width: size, height: size }}>
      <img
        src={src}
        alt=""
        width={size}
        height={size}
        onError={() => setFailIndex((i) => i + 1)}
      />
    </div>
  );
}
