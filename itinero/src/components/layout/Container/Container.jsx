import React from "react";
import "./Container.css";

/**
 * Max-width centered container for consistent page layout.
 */
export default function Container({ className = "", children, ...props }) {
  return (
    <div className={`container-wrapper ${className}`} {...props}>
      {children}
    </div>
  );
}
