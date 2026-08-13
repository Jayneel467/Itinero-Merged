/**
 * Browser Sentry bootstrap for the Itinero SPA.
 * No-ops unless VITE_SENTRY_DSN is set at build time.
 */
import * as Sentry from '@sentry/react'

export function initSentry() {
  const dsn = String(import.meta.env.VITE_SENTRY_DSN || '').trim()
  if (!dsn) return false

  const environment = String(
    import.meta.env.VITE_APP_ENV || import.meta.env.MODE || 'development',
  ).trim()

  Sentry.init({
    dsn,
    environment,
    tracesSampleRate: Number(import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE || 0.05),
    sendDefaultPii: false,
  })
  return true
}
