import { useEffect, useState } from "react";
import { loyaltyService } from "@/features/booking/services/loyaltyService";

export function useLoyaltyEstimate(amount, currency) {
  const [estimate, setEstimate] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      setEstimate(null);
      return undefined;
    }

    let cancelled = false;
    setLoading(true);
    loyaltyService
      .estimate(amt, currency || "INR")
      .then((res) => {
        if (!cancelled) setEstimate(res);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [amount, currency]);

  return { estimate, loading };
}
