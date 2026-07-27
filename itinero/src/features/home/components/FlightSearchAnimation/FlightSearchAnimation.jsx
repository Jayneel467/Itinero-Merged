import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";

/**
 * Full-screen flight search animation overlay.
 * Shows an airplane flying with route info and progress bar.
 * Auto-dismisses after ~2.5s calling onComplete.
 */
export default function FlightSearchAnimation({ from, to, onComplete }) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const duration = 2500;
    const interval = 20;
    const increment = (interval / duration) * 100;
    const timer = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          clearInterval(timer);
          return 100;
        }
        return prev + increment;
      });
    }, interval);

    const completeTimer = setTimeout(() => {
      if (onComplete) onComplete();
    }, duration + 300);

    return () => {
      clearInterval(timer);
      clearTimeout(completeTimer);
    };
  }, [onComplete]);

  return createPortal(
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[9999] flex flex-col items-center justify-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.3 }}
      >
        {/* Dark gradient background */}
        <div className="absolute inset-0 bg-gradient-to-br from-[#0F172A] via-[#1E293B] to-[#0F172A]" />

        {/* Animated stars/particles */}
        <div className="absolute inset-0 overflow-hidden">
          {[...Array(20)].map((_, i) => (
            <motion.div
              key={i}
              className="absolute w-1 h-1 bg-white rounded-full"
              style={{
                left: `${Math.random() * 100}%`,
                top: `${Math.random() * 100}%`,
              }}
              animate={{
                opacity: [0, 1, 0],
                scale: [0, 1, 0],
              }}
              transition={{
                duration: 2 + Math.random() * 2,
                repeat: Infinity,
                delay: Math.random() * 2,
              }}
            />
          ))}
        </div>

        {/* Content */}
        <div className="relative z-10 flex flex-col items-center gap-8 px-6">
          
          {/* Route info */}
          <motion.div
            className="flex items-center gap-4 md:gap-8"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.5 }}
          >
            <div className="text-right">
              <p className="text-white/60 text-sm font-medium">From</p>
              <p className="text-white text-2xl md:text-4xl font-bold">{from?.code || "---"}</p>
              <p className="text-white/50 text-xs mt-1">{from?.city || ""}</p>
            </div>

            {/* Animated flight path */}
            <div className="relative w-[140px] md:w-[200px] h-[2px] bg-white/10">
              <motion.div
                className="absolute top-0 left-0 h-full bg-gradient-to-r from-orange-500 to-orange-400"
                initial={{ width: "0%" }}
                animate={{ width: "100%" }}
                transition={{ duration: 2.2, ease: "easeInOut" }}
              />
              {/* Airplane on the path */}
              <motion.div
                className="absolute top-1/2 -translate-y-1/2"
                initial={{ left: "-10%" }}
                animate={{ left: "95%" }}
                transition={{ duration: 2.2, ease: "easeInOut" }}
              >
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" className="text-orange-500 -rotate-0 drop-shadow-[0_0_10px_rgba(249,115,22,0.6)]">
                  <path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z" fill="currentColor"/>
                </svg>
              </motion.div>
              {/* Dotted trail */}
              <div className="absolute top-1/2 -translate-y-1/2 left-0 right-0 flex justify-between px-4">
                {[...Array(8)].map((_, i) => (
                  <motion.div
                    key={i}
                    className="w-1 h-1 rounded-full bg-white/20"
                    animate={{ opacity: [0.2, 0.6, 0.2] }}
                    transition={{ duration: 1, delay: i * 0.1, repeat: Infinity }}
                  />
                ))}
              </div>
            </div>

            <div className="text-left">
              <p className="text-white/60 text-sm font-medium">To</p>
              <p className="text-white text-2xl md:text-4xl font-bold">{to?.code || "---"}</p>
              <p className="text-white/50 text-xs mt-1">{to?.city || ""}</p>
            </div>
          </motion.div>

          {/* Searching text */}
          <motion.div
            className="flex items-center gap-2"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
          >
            <span className="text-white/70 text-lg font-medium">Searching best flights</span>
            <motion.span
              className="text-orange-500 text-lg"
              animate={{ opacity: [1, 0.3, 1] }}
              transition={{ duration: 1.2, repeat: Infinity }}
            >
              ...
            </motion.span>
          </motion.div>

          {/* Progress bar */}
          <motion.div
            className="w-[280px] md:w-[360px] h-[4px] bg-white/10 rounded-full overflow-hidden"
            initial={{ opacity: 0, scaleX: 0.8 }}
            animate={{ opacity: 1, scaleX: 1 }}
            transition={{ delay: 0.4 }}
          >
            <motion.div
              className="h-full bg-gradient-to-r from-orange-500 via-orange-400 to-amber-400 rounded-full"
              style={{ width: `${progress}%` }}
              transition={{ duration: 0.1 }}
            />
          </motion.div>

          {/* Progress text */}
          <motion.p
            className="text-white/40 text-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
          >
            {Math.round(progress)}% complete
          </motion.p>
        </div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}
