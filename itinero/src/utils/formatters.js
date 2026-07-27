import { APP_CONFIG } from "@/app/config";

/**
 * Formatting utilities for prices, dates, numbers, and durations.
 * Uses Intl API for locale-aware formatting.
 */

/**
 * Format a number as currency.
 * @param {number} amount
 * @param {string} currency - ISO 4217 currency code (default: from config)
 * @param {string} locale - BCP 47 locale string (default: from config)
 * @returns {string} Formatted price string (e.g., "₹12,500")
 */
export function formatPrice(amount, currency = APP_CONFIG.DEFAULT_CURRENCY, locale = APP_CONFIG.DEFAULT_LOCALE) {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * Format a date string or Date object.
 * @param {string|Date} date
 * @param {object} options - Intl.DateTimeFormat options
 * @returns {string} Formatted date string
 */
export function formatDate(date, options = {}) {
  const defaults = {
    year: "numeric",
    month: "short",
    day: "numeric",
  };
  return new Intl.DateTimeFormat(
    APP_CONFIG.DEFAULT_LOCALE,
    { ...defaults, ...options }
  ).format(new Date(date));
}

/**
 * Format a date as relative time (e.g., "2 days ago", "in 3 hours").
 * @param {string|Date} date
 * @returns {string}
 */
export function formatRelativeTime(date) {
  const now = new Date();
  const target = new Date(date);
  const diffMs = target - now;
  const diffSecs = Math.round(diffMs / 1000);
  const diffMins = Math.round(diffSecs / 60);
  const diffHours = Math.round(diffMins / 60);
  const diffDays = Math.round(diffHours / 24);

  const rtf = new Intl.RelativeTimeFormat(APP_CONFIG.DEFAULT_LOCALE, { numeric: "auto" });

  if (Math.abs(diffDays) >= 1) return rtf.format(diffDays, "day");
  if (Math.abs(diffHours) >= 1) return rtf.format(diffHours, "hour");
  if (Math.abs(diffMins) >= 1) return rtf.format(diffMins, "minute");
  return rtf.format(diffSecs, "second");
}

/**
 * Format a number with locale-aware separators.
 * @param {number} num
 * @returns {string} (e.g., "1,23,456" in en-IN)
 */
export function formatNumber(num) {
  return new Intl.NumberFormat(APP_CONFIG.DEFAULT_LOCALE).format(num);
}

/**
 * Format duration in minutes to "Xh Ym" format.
 * @param {number} minutes - Total duration in minutes
 * @returns {string} (e.g., "2h 30m")
 */
export function formatDuration(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/**
 * Truncate text to a max length with ellipsis.
 * @param {string} text
 * @param {number} maxLength
 * @returns {string}
 */
export function truncateText(text, maxLength = 100) {
  if (!text || text.length <= maxLength) return text;
  return text.slice(0, maxLength).trimEnd() + "…";
}
