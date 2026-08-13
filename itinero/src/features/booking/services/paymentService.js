import api from "@/services/api";
import { ENDPOINTS } from "@/services/endpoints";

/** Register checkout context for orphan recovery / analytics. */
export async function registerPaymentIntent(body) {
  try {
    return await api.post(ENDPOINTS.PAYMENTS.INTENT, body, { timeoutMs: 15_000 });
  } catch (error) {
    return { ok: false, error: error?.message || "intent_failed" };
  }
}

/** Send booking confirmation via Zoho SMTP (supervisor). */
export async function sendBookingEmail(body) {
  try {
    return await api.post(ENDPOINTS.BOOKINGS.SEND_EMAIL, body, { timeoutMs: 30_000 });
  } catch (error) {
    return {
      ok: false,
      error: error?.code || "smtp_failed",
      message: error?.message || "Could not send email.",
    };
  }
}

/** @deprecated Prefer sendBookingEmail - same SMTP backend. */
export async function resendBookingEmail(body) {
  return sendBookingEmail(body);
}
