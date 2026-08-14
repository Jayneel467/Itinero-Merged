import { flightService } from "@/features/flights/services/flightService";
import { hotelService } from "@/features/hotels/services/hotelService";
import { packageService } from "@/features/packages/services/packageService";

function moneyLabel(amount, currency = "INR") {
  if (amount == null || amount === "") return null;
  const n = Number(amount);
  if (!Number.isFinite(n)) return String(amount);
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: currency === "IN" ? "INR" : currency || "INR",
      maximumFractionDigits: 2,
    }).format(n);
  } catch {
    return `₹${n}`;
  }
}

function refundRail(paymentProvider, paymentId) {
  const pid = String(paymentId || "").trim();
  const p = String(paymentProvider || "").toLowerCase();
  if (pid.startsWith("pi_") || p === "itinero_stripe" || p === "itinero") {
    return "itinero_stripe";
  }
  if (pid.startsWith("pay_") || p === "razorpay") return "legacy_unsupported";
  return "liteapi";
}

export function formatCancelResultMessage(res) {
  if (!res) return "Cancel failed.";
  if (res.aborted) return "";
  return res.message || res.error || (res.ok ? "Cancelled." : "Cancel failed.");
}

export function refundPatchFromResult(res) {
  const cancel = res?.cancellation || {};
  const booking = res?.booking || {};
  const stripe = res?.itinero_stripe_refund || {};
  const awaiting = Boolean(
    res?.awaiting_supplier_funds || cancel.awaiting_supplier_funds
  );
  const pending = Boolean(res?.pending || cancel.pending || booking.pending || awaiting);
  const liteapiAuto = Boolean(cancel.liteapi_auto_refund ?? booking.liteapi_auto_refund);
  const rail = cancel.refund_rail || (stripe?.ok ? "itinero_stripe" : null);
  return {
    refundAmount:
      stripe.refund_amount ?? cancel.refund_amount ?? booking.refund_amount ?? null,
    refundCurrency:
      stripe.currency || cancel.currency || booking.currency || "INR",
    cancellationFee: cancel.cancellation_fee ?? booking.cancellation_fee ?? null,
    refundStatus: awaiting
      ? "awaiting_supplier_funds"
      : pending
        ? "pending_airline"
        : stripe.ok
          ? stripe.skipped
            ? stripe.reason || "stripe_already_refunded"
            : stripe.status || "stripe_refunded"
          : liteapiAuto
            ? "liteapi_auto"
            : rail || null,
    cancelPending: pending,
    destination: cancel.destination || booking.destination || null,
    refundRail: rail,
  };
}

function confirmQuote({ kind, quote, paidAmount, paymentProvider, paymentId }) {
  const currency = quote?.currency || "INR";
  const refund = moneyLabel(quote?.refund_amount, currency);
  const fee = moneyLabel(quote?.cancellation_fee, currency);
  const paid = moneyLabel(paidAmount, currency);
  const dest = String(quote?.destination || "original_payment").toLowerCase();
  const rail = refundRail(paymentProvider, paymentId);
  const lines = [
    kind === "package"
      ? "Cancel this package (stay + flights)?"
      : kind === "hotel"
        ? "Cancel this stay?"
        : "Cancel this flight?",
    "",
  ];
  if (quote?.pending) {
    lines.push(quote.message || "A cancellation is already in progress with the airline.");
    lines.push("Connect stays CONFIRMED until they finalize - refund follows automatically.");
  } else if (quote?.ok && kind === "flight") {
    lines.push("Cancel quote (estimate until cancel completes):");
    lines.push(`• Estimated max refund: ${refund || "not stated"}`);
    lines.push(`• Cancellation fee / penalty: ${fee || "₹0 / not stated"}`);
    if (quote.is_voidable === true) lines.push("• Within void window");
    if (quote.is_refundable === true) lines.push("• Marked refundable");
    if (quote.is_refundable === false) lines.push("• Marked non-refundable");
    if (quote.confidence) lines.push(`• Quote confidence: ${quote.confidence}`);
    if (dest === "voucher") lines.push("• Refund type: airline voucher (not cash)");
    else lines.push(`• Refund destination: ${dest.replace(/_/g, " ")}`);
  } else if (kind === "flight") {
    lines.push(quote?.message || "Could not load a live refund quote. Cancel anyway?");
    } else if (kind === "package") {
    lines.push(
      "We cancel the stay and flights first. Your card is refunded only after " +
        "hotel/flight money is confirmed back (plus Itinero package fee) — never the full total up front."
    );
  } else {
    lines.push("Refund follows hotel policy (free cancel / partial / none).");
  }
  if (paid) lines.push(`• You paid: ${paid}`);
  lines.push("");
  if (dest === "voucher") {
    lines.push("Refund may be an airline voucher, not cash.");
  } else if (rail === "itinero_stripe") {
    lines.push(
      kind === "package"
        ? "Itinero holds the card refund until hotel/flight funds settle. Tap Cancel again later if refund is still waiting."
        : "Your card was charged on Itinero (Stripe). After cancel, we refund that charge to the original card."
    );
  } else if (rail === "legacy_unsupported") {
    lines.push("Legacy payment cannot be auto-refunded here — contact support after cancel.");
  } else {
    lines.push(
      "Any refund is credited to your original card when cancel finalizes."
    );
  }
  if (kind !== "package") {
    lines.push("Connect may still show CONFIRMED until the airline finalizes (HTTP 202).");
  }
  return window.confirm(lines.filter(Boolean).join("\n"));
}

export async function cancelFlightWithQuote({
  bookingId,
  paymentId,
  expectedAmount,
  paymentProvider,
  email,
}) {
  let quote = null;
  if (bookingId) {
    quote = await flightService.cancelQuote(bookingId, { email });
  }
  if (
    !confirmQuote({
      kind: "flight",
      quote,
      paidAmount: expectedAmount,
      paymentProvider,
      paymentId,
    })
  ) {
    return { ok: false, aborted: true };
  }
  // Prefer liteapi_sdk label for standalone LiteAPI Stripe so we don't confuse with Itinero merchant.
  const provider =
    String(paymentId || "").startsWith("pi_")
      ? "itinero_stripe"
      : paymentProvider === "stripe"
        ? "liteapi_sdk"
        : paymentProvider;
  return flightService.cancelBooking(bookingId, {
    paymentId,
    expectedAmount,
    paymentProvider: provider,
    email,
  });
}

export async function cancelHotelWithPolicy({
  bookingId,
  paymentId,
  expectedAmount,
  paymentProvider,
  email,
}) {
  if (
    !confirmQuote({
      kind: "hotel",
      quote: null,
      paidAmount: expectedAmount,
      paymentProvider,
      paymentId,
    })
  ) {
    return { ok: false, aborted: true };
  }
  const provider =
    String(paymentId || "").startsWith("pi_")
      ? "itinero_stripe"
      : paymentProvider === "stripe"
        ? "liteapi_sdk"
        : paymentProvider;
  return hotelService.cancelBooking(bookingId, {
    paymentId,
    expectedAmount,
    paymentProvider: provider,
    email,
  });
}

export async function cancelPackageWithRefund({
  packageBookingId,
  email,
  paidAmount,
  paymentId,
  paymentProvider = "itinero_stripe",
}) {
  if (!packageBookingId) {
    return { ok: false, error: "missing_booking_id" };
  }
  if (!email || !String(email).includes("@")) {
    return { ok: false, error: "email_required", message: "Guest email is required to cancel." };
  }
  if (
    !confirmQuote({
      kind: "package",
      quote: null,
      paidAmount,
      paymentProvider: paymentProvider || "itinero_stripe",
      paymentId,
    })
  ) {
    return { ok: false, aborted: true };
  }
  return packageService.cancelBooking(packageBookingId, email);
}

/** @deprecated Razorpay removed — kept as a no-op stub for any stale imports. */
export async function refundUnticketedRazorpay() {
  return {
    ok: false,
    error:
      "Self-serve refund for legacy payments is unavailable. Contact support with your booking reference.",
  };
}
