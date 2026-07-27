import React from "react";
import "./SectionHeader.css";

/**
 * Reusable section header with title, optional "View All" link, and navigation arrows.
 */
export default function SectionHeader({
  title,
  viewAllText,
  onViewAll,
  onPrev,
  onNext,
  className = "",
}) {
  return (
    <div className={`section-header ${className}`}>
      <h2 className="section-header__title">{title}</h2>
      <div className="section-header__actions">
        {viewAllText && (
          <span
            className="section-header__view-all"
            onClick={onViewAll}
            role="button"
            tabIndex={0}
          >
            {viewAllText}
          </span>
        )}
        <div
          className="section-header__nav-btn"
          onClick={onPrev}
          role="button"
          tabIndex={0}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6"/>
          </svg>
        </div>
        <div
          className="section-header__nav-btn"
          onClick={onNext}
          role="button"
          tabIndex={0}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 18l6-6-6-6"/>
          </svg>
        </div>
      </div>
    </div>
  );
}
