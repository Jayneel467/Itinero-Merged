/**
 * Browser Sentry bootstrap for the Itinero SPA.
 * No-ops unless VITE_SENTRY_DSN is set at build time.
 * @sentry/react is not installed — stub used for local dev.
 */

export function initSentry() {
  const dsn = String(import.meta.env.VITE_SENTRY_DSN || '').trim()
  if (!dsn) return false

  // Sentry is disabled in local dev (no VITE_SENTRY_DSN).
  // Install @sentry/react and restore the real init for production.
  console.warn('[Sentry] DSN found but @sentry/react is not installed. Sentry disabled.')
  return false
}
