/**
 * Validation utilities for forms.
 * Pure functions — no side effects, easily testable.
 */

/**
 * Validate an email address.
 * @param {string} email
 * @returns {boolean}
 */
export function isValidEmail(email) {
  if (!email) return false;
  const pattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return pattern.test(email.trim());
}

/**
 * Validate a phone number (basic international format).
 * @param {string} phone
 * @returns {boolean}
 */
export function isValidPhone(phone) {
  if (!phone) return false;
  const cleaned = phone.replace(/[\s\-()]/g, "");
  return /^\+?\d{7,15}$/.test(cleaned);
}

/**
 * Validate a password strength.
 * @param {string} password
 * @returns {{ valid: boolean, message: string }}
 */
export function validatePassword(password) {
  if (!password) return { valid: false, message: "Password is required" };
  if (password.length < 8) return { valid: false, message: "Minimum 8 characters" };
  if (!/[A-Z]/.test(password)) return { valid: false, message: "At least one uppercase letter" };
  if (!/[a-z]/.test(password)) return { valid: false, message: "At least one lowercase letter" };
  if (!/\d/.test(password)) return { valid: false, message: "At least one number" };
  return { valid: true, message: "" };
}

/**
 * Check if a value is empty (null, undefined, empty string, empty array).
 * @param {*} value
 * @returns {boolean}
 */
export function isEmpty(value) {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") return Object.keys(value).length === 0;
  return false;
}

/**
 * Validate a date is in the future.
 * @param {string|Date} date
 * @returns {boolean}
 */
export function isFutureDate(date) {
  return new Date(date) > new Date();
}

/**
 * Validate that return date is after departure date.
 * @param {string|Date} departure
 * @param {string|Date} returnDate
 * @returns {boolean}
 */
export function isReturnAfterDeparture(departure, returnDate) {
  return new Date(returnDate) > new Date(departure);
}
