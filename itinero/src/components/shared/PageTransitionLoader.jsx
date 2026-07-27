import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';

/**
 * Top loading bar that triggers on route changes.
 * Gives a premium SPA feel by indicating navigation progress.
 */
export default function PageTransitionLoader() {
  const [isLoading, setIsLoading] = useState(false);
  const location = useLocation();

  useEffect(() => {
    // Start loading on route change
    setIsLoading(true);
    
    // Simulate a quick network/render delay before finishing
    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 600); // 600ms duration for the loading bar

    return () => clearTimeout(timer);
  }, [location.pathname]);

  return createPortal(
    <AnimatePresence>
      {isLoading && (
        <motion.div
          className="fixed top-0 left-0 right-0 h-[3px] bg-[#F97211] z-[99999]"
          initial={{ width: "0%", opacity: 1 }}
          animate={{ width: "100%", opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.3 } }}
          transition={{ duration: 0.5, ease: "easeInOut" }}
        >
          {/* Subtle glowing head on the right side of the loading bar */}
          <div className="absolute right-0 top-0 h-full w-[100px] bg-white opacity-50 blur-[4px] animate-pulse"></div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
