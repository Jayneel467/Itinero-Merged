import React from "react";
import styles from "./sky-toggle.module.css";

/**
 * Theme switch — knob position is % based so navbar size overrides cannot
 * leave the sun/moon stuck in the middle of the track.
 */
const Switch = ({ isDarkMode, onToggle, "aria-label": ariaLabel, ...rest }) => {
  return (
    <button
      type="button"
      onClick={onToggle}
      data-sky-toggle=""
      className={`${styles.track} ${isDarkMode ? styles.trackDark : styles.trackLight}`}
      role="switch"
      aria-checked={Boolean(isDarkMode)}
      aria-label={ariaLabel || (isDarkMode ? "Switch to light mode" : "Switch to dark mode")}
      {...rest}
    >
      <span
        aria-hidden="true"
        className={`${styles.knob} ${isDarkMode ? styles.knobDark : styles.knobLight}`}
      >
        {isDarkMode ? (
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={styles.icon}>
            <path
              fillRule="evenodd"
              d="M9.528 1.718a.75.75 0 01.162.819A8.97 8.97 0 009 6a9 9 0 009 9 8.97 8.97 0 003.463-.69.75.75 0 01.981.98 10.503 10.503 0 01-9.694 6.46c-5.799 0-10.5-4.701-10.5-10.5 0-4.368 2.667-8.112 6.46-9.694a.75.75 0 01.818.162z"
              clipRule="evenodd"
            />
          </svg>
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={styles.icon}>
            <path d="M12 2.25a.75.75 0 01.75.75v2.25a.75.75 0 01-1.5 0V3a.75.75 0 01.75-.75zM7.5 12a4.5 4.5 0 119 0 4.5 4.5 0 01-9 0zM18.894 6.166a.75.75 0 00-1.06-1.06l-1.591 1.59a.75.75 0 101.06 1.061l1.591-1.59zM21.75 12a.75.75 0 01-.75.75h-2.25a.75.75 0 010-1.5H21a.75.75 0 01.75.75zM17.834 18.894a.75.75 0 001.06-1.06l-1.59-1.591a.75.75 0 10-1.061 1.06l1.59 1.591zM12 18.75a.75.75 0 01.75.75V21a.75.75 0 01-1.5 0v-1.5a.75.75 0 01.75-.75zM6.166 18.894a.75.75 0 01-1.06-1.06l1.59-1.591a.75.75 0 111.061 1.06l-1.59 1.591zM4.5 12a.75.75 0 01-.75.75H1.5a.75.75 0 010-1.5h2.25a.75.75 0 01.75.75zM6.166 5.106a.75.75 0 011.06 1.06L5.636 7.756a.75.75 0 11-1.061-1.06l1.59-1.59z" />
          </svg>
        )}
      </span>
    </button>
  );
};

export default Switch;
