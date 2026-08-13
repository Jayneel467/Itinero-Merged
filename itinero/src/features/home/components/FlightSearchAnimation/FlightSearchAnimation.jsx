import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  motion,
  AnimatePresence,
  useMotionValue,
  useTransform,
  animate,
  useMotionValueEvent,
} from "framer-motion";
import styles from "./FlightSearchAnimation.module.css";

const DURATION_MS = 2800;
const ARC_PATH = "M 16 88 C 80 8, 240 8, 304 88";

const STATUS_LINES = [
  "Charting your route",
  "Scanning live fares",
  "Matching carriers",
  "Picking the best times",
];

/** Stable star field - never re-roll on re-render */
const STARS = [
  { left: "8%", top: "12%", s: 0.6, d: 3.2, delay: 0.2 },
  { left: "18%", top: "28%", s: 0.45, d: 2.8, delay: 1.1 },
  { left: "27%", top: "9%", s: 0.7, d: 3.6, delay: 0.4 },
  { left: "39%", top: "22%", s: 0.5, d: 2.4, delay: 1.8 },
  { left: "52%", top: "14%", s: 0.55, d: 3.1, delay: 0.7 },
  { left: "64%", top: "31%", s: 0.4, d: 2.6, delay: 1.4 },
  { left: "73%", top: "11%", s: 0.65, d: 3.4, delay: 0.1 },
  { left: "84%", top: "24%", s: 0.5, d: 2.9, delay: 2.0 },
  { left: "91%", top: "16%", s: 0.45, d: 3.0, delay: 0.9 },
  { left: "12%", top: "48%", s: 0.35, d: 2.5, delay: 1.6 },
  { left: "88%", top: "44%", s: 0.4, d: 2.7, delay: 0.5 },
  { left: "45%", top: "6%", s: 0.5, d: 3.3, delay: 1.2 },
];

const CLOUDS = [
  { left: "-5%", top: "58%", w: "42%", h: "18%", delay: 0 },
  { left: "55%", top: "62%", w: "48%", h: "16%", delay: 0.4 },
  { left: "20%", top: "72%", w: "36%", h: "14%", delay: 0.8 },
];

/**
 * Full-screen flight search overlay.
 * Cinematic arc route + rotating status - auto-dismisses after ~2.8s.
 */
export default function FlightSearchAnimation({ from, to, onComplete }) {
  const [statusIndex, setStatusIndex] = useState(0);
  const pathRef = useRef(null);
  const progress = useMotionValue(0);
  const planeX = useMotionValue(16);
  const planeY = useMotionValue(88);
  const planeRotate = useMotionValue(-20);

  const meterWidth = useTransform(progress, [0, 1], ["0%", "100%"]);
  const glowLeft = useTransform(progress, [0, 1], ["0%", "100%"]);
  const pathLength = useTransform(progress, [0, 1], [0, 1]);

  const fromCode = from?.code || "---";
  const toCode = to?.code || "---";
  const fromCity = from?.city || "";
  const toCity = to?.city || "";

  useMotionValueEvent(progress, "change", (v) => {
    const el = pathRef.current;
    if (!el) return;
    const len = el.getTotalLength();
    const d = Math.max(0, Math.min(1, v)) * len;
    const p = el.getPointAtLength(d);
    const look = el.getPointAtLength(Math.min(len, d + 2));
    const angle = (Math.atan2(look.y - p.y, look.x - p.x) * 180) / Math.PI;
    planeX.set(p.x);
    planeY.set(p.y);
    // Icon faces up - rotate so nose follows the arc
    planeRotate.set(angle + 90);
  });

  useEffect(() => {
    // Seed plane at path start once the SVG path is mounted
    const el = pathRef.current;
    if (el) {
      const p = el.getPointAtLength(0);
      const look = el.getPointAtLength(2);
      planeX.set(p.x);
      planeY.set(p.y);
      planeRotate.set(
        (Math.atan2(look.y - p.y, look.x - p.x) * 180) / Math.PI + 90
      );
    }

    const controls = animate(progress, 1, {
      duration: DURATION_MS / 1000,
      ease: [0.22, 1, 0.36, 1],
    });

    const statusTimer = setInterval(() => {
      setStatusIndex((i) => (i + 1) % STATUS_LINES.length);
    }, 700);

    const completeTimer = setTimeout(() => {
      onComplete?.();
    }, DURATION_MS + 280);

    return () => {
      controls.stop();
      clearInterval(statusTimer);
      clearTimeout(completeTimer);
    };
  }, [onComplete, progress, planeX, planeY, planeRotate]);

  return createPortal(
    <AnimatePresence>
      <motion.div
        className={styles.overlay}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.35 }}
        role="status"
        aria-live="polite"
        aria-label={`Searching flights from ${fromCode} to ${toCode}`}
      >
        <div className={styles.sky} />
        <div className={styles.horizon} />
        <div className={styles.haze} />

        {STARS.map((star, i) => (
          <motion.span
            key={i}
            className={styles.star}
            style={{
              left: star.left,
              top: star.top,
              width: star.s * 3,
              height: star.s * 3,
              opacity: 0.35,
            }}
            animate={{ opacity: [0.15, 0.75, 0.15], scale: [1, 1.4, 1] }}
            transition={{
              duration: star.d,
              repeat: Infinity,
              delay: star.delay,
              ease: "easeInOut",
            }}
          />
        ))}

        {CLOUDS.map((cloud, i) => (
          <motion.div
            key={`c-${i}`}
            className={styles.cloud}
            style={{
              left: cloud.left,
              top: cloud.top,
              width: cloud.w,
              height: cloud.h,
            }}
            animate={{ x: [0, 24, 0], opacity: [0.35, 0.55, 0.35] }}
            transition={{
              duration: 10 + i * 2,
              repeat: Infinity,
              delay: cloud.delay,
              ease: "easeInOut",
            }}
          />
        ))}

        <div className={styles.ringWrap} aria-hidden>
          <motion.div
            className={`${styles.ring} ${styles.ringInner}`}
            animate={{ rotate: 360, scale: [0.96, 1.02, 0.96] }}
            transition={{
              rotate: { duration: 48, repeat: Infinity, ease: "linear" },
              scale: { duration: 6, repeat: Infinity, ease: "easeInOut" },
            }}
          />
        </div>
        <div className={styles.ringWrap} aria-hidden>
          <motion.div
            className={styles.ring}
            animate={{ rotate: -360 }}
            transition={{ duration: 72, repeat: Infinity, ease: "linear" }}
          />
        </div>

        <motion.div
          className={styles.brand}
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.5 }}
        >
          itinero<span className={styles.brandAccent}>.</span>
        </motion.div>

        <div className={styles.stage}>
          <motion.div
            className={styles.routeRow}
            initial={{ opacity: 0, y: 28 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.12, duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className={`${styles.cityBlock} ${styles.cityBlockFrom}`}>
              <span className={styles.label}>From</span>
              <span className={styles.code}>{fromCode}</span>
              {fromCity ? <span className={styles.city}>{fromCity}</span> : null}
            </div>

            <div className={styles.arcWrap}>
              <svg className={styles.arcSvg} viewBox="0 0 320 110" aria-hidden>
                <defs>
                  <linearGradient id="itineroArcGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#e5670f" />
                    <stop offset="55%" stopColor="#f97211" />
                    <stop offset="100%" stopColor="#ffb06a" />
                  </linearGradient>
                </defs>

                {/* Hidden path for length sampling */}
                <path ref={pathRef} d={ARC_PATH} fill="none" stroke="none" />

                <path d={ARC_PATH} className={styles.arcGuide} />

                <motion.path
                  d={ARC_PATH}
                  className={styles.arcTrail}
                  style={{ pathLength }}
                />

                <circle cx="16" cy="88" r="4" className={styles.node} />
                <motion.circle
                  cx="16"
                  cy="88"
                  r="10"
                  className={styles.nodePulse}
                  animate={{ r: [8, 14, 8], opacity: [0.55, 0.1, 0.55] }}
                  transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
                />

                <circle cx="304" cy="88" r="4" className={styles.node} />
                <motion.circle
                  cx="304"
                  cy="88"
                  r="10"
                  className={styles.nodePulse}
                  animate={{ r: [8, 16, 8], opacity: [0.45, 0.08, 0.45] }}
                  transition={{
                    duration: 2.2,
                    repeat: Infinity,
                    ease: "easeInOut",
                    delay: 0.6,
                  }}
                />

                <motion.g
                  style={{ x: planeX, y: planeY, rotate: planeRotate }}
                  className={styles.plane}
                >
                  <g transform="translate(-12, -12)">
                    <path
                      d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"
                      fill="currentColor"
                    />
                  </g>
                </motion.g>
              </svg>
            </div>

            <div className={`${styles.cityBlock} ${styles.cityBlockTo}`}>
              <span className={styles.label}>To</span>
              <span className={styles.code}>{toCode}</span>
              {toCity ? <span className={styles.city}>{toCity}</span> : null}
            </div>
          </motion.div>

          <div className={styles.statusBlock}>
            <AnimatePresence mode="wait">
              <motion.p
                key={STATUS_LINES[statusIndex]}
                className={styles.statusLine}
                initial={{ opacity: 0, y: 8, filter: "blur(4px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                exit={{ opacity: 0, y: -8, filter: "blur(4px)" }}
                transition={{ duration: 0.35 }}
              >
                {STATUS_LINES[statusIndex]}
              </motion.p>
            </AnimatePresence>

            <motion.div
              className={styles.meter}
              initial={{ opacity: 0, scaleX: 0.85 }}
              animate={{ opacity: 1, scaleX: 1 }}
              transition={{ delay: 0.35, duration: 0.5 }}
            >
              <motion.div className={styles.meterFill} style={{ width: meterWidth }} />
              <motion.div className={styles.meterGlow} style={{ left: glowLeft }} />
            </motion.div>

            <p className={styles.statusHint}>Finding your flight</p>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}
