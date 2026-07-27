import React from "react";
import { motion } from "framer-motion";

/**
 * A reusable wrapper component that animates its children when they scroll into view.
 * 
 * @param {React.ReactNode} children - The content to animate
 * @param {string} className - Optional CSS classes
 * @param {number} delay - Optional delay before animation starts (for staggering)
 * @param {string} direction - "up", "down", "left", "right" - the direction the element comes FROM
 */
export default function ScrollReveal({ 
  children, 
  className = "", 
  delay = 0,
  direction = "up"
}) {
  
  // Calculate initial position based on direction
  const getInitialPosition = () => {
    switch (direction) {
      case "up": return { y: 40, opacity: 0 };
      case "down": return { y: -40, opacity: 0 };
      case "left": return { x: 40, opacity: 0 };
      case "right": return { x: -40, opacity: 0 };
      default: return { y: 40, opacity: 0 };
    }
  };

  return (
    <motion.div
      className={className}
      initial={getInitialPosition()}
      whileInView={{ x: 0, y: 0, opacity: 1 }}
      viewport={{ once: true, margin: "-100px" }}
      transition={{ 
        duration: 0.7, 
        ease: [0.25, 0.1, 0.25, 1.0], // smooth ease-out curve
        delay: delay 
      }}
    >
      {children}
    </motion.div>
  );
}
