"use client";

export function BookingPanel({
  bookingReady,
  paymentReady,
  onConfirm,
  onPay,
}: {
  bookingReady: boolean;
  paymentReady: boolean;
  onConfirm: () => void;
  onPay: () => void;
}) {
  return (
    <div className="rounded-[20px] border border-[#FFE1CB] bg-[#FEFAF4] p-5">
      <h3 className="text-[18px] font-bold text-navy">Booking & payment</h3>
      <p className="mt-2 text-[13px] text-muted">
        Mirrors Travel_Agent hold → pay flow. Live Stripe/LiteAPI keys required
        for real capture; buttons send confirmations to the flight specialist.
      </p>
      <div className="mt-4 space-y-2 text-[13px]">
        <Status ok={bookingReady} label="Booking ready (prebook / hold)" />
        <Status ok={paymentReady} label="Payment ready" />
      </div>
      <div className="mt-5 flex flex-col gap-2">
        <button
          type="button"
          onClick={onConfirm}
          className="btn-navy px-4 py-2.5 text-[13px] font-bold"
        >
          Confirm booking
        </button>
        <button
          type="button"
          onClick={onPay}
          className="btn-primary px-4 py-2.5 text-[13px] font-bold"
        >
          Pay now (placeholder)
        </button>
      </div>
      <p className="mt-4 text-[11px] text-[#868686]">
        Card fields intentionally omitted — no secrets in the browser. Gateway
        returns publishable keys when prebook succeeds.
      </p>
    </div>
  );
}

function Status({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span
        className={`h-2.5 w-2.5 rounded-full ${
          ok ? "bg-emerald-500" : "bg-gray-300"
        }`}
      />
      <span className={ok ? "text-navy" : "text-muted"}>{label}</span>
    </div>
  );
}
