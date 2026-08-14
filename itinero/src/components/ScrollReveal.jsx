import React from "react";
import { motion } from "framer-motion";

/**
 * Fade children in when they scroll into view.
 * Opacity-only — translate animations overlapped adjacent sections (e.g. ExploreVibes → Flight Deals).
 *
 * @param {React.ReactNode} children
 * @param {string} className
 * @param {number} delay - stagger delay in seconds
 * @param {string} direction - kept for API compat; no longer applies motion offset
 */
export default function ScrollReveal({
  children,
  className = "",
  delay = 0,
  direction: _direction = "up",
}) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0 }}
      whileInView={{ opacity: 1 }}
      viewport={{ once: true, amount: 0.12 }}
      transition={{
        duration: 0.55,
        ease: [0.25, 0.1, 0.25, 1.0],
        delay,
      }}
    >
      {children}
    </motion.div>
  );
}
