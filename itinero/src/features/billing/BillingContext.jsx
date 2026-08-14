import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useAuthOptional } from "@/features/auth/context/AuthContext";
import { billingService } from "./billingService";

const BillingContext = createContext(null);

const GUEST = {
  ok: true,
  plan: "credits",
  veroFree: true,
  loyaltyMultiplier: 1,
  savedTravellersLimit: 8,
  priceWatchLimit: 8,
  signedIn: false,
  dailyCredits: 25,
  credits: null,
};

export function BillingProvider({ children }) {
  const auth = useAuthOptional();
  const userId = auth?.user?.id || null;
  const [me, setMe] = useState(GUEST);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    const snap = await billingService.me();
    setMe(snap?.ok === false ? { ...GUEST, signedIn: Boolean(userId) } : { ...GUEST, ...snap });
    setLoading(false);
    return snap;
  }, [userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const applyCredits = useCallback((snap) => {
    if (!snap || typeof snap !== "object") return;
    setMe((prev) => ({ ...prev, credits: snap }));
  }, []);

  const value = useMemo(
    () => ({
      me,
      loading,
      refresh,
      applyCredits,
      credits: me.credits || null,
      isPlus: false,
      veroFree: true,
      travellerLimit: Number(me.savedTravellersLimit || 8),
      watchLimit: Number(me.priceWatchLimit || 8),
      loyaltyMultiplier: Number(me.loyaltyMultiplier || 1),
      dailyCredits: Number(me.dailyCredits || me.credits?.allowance || 25),
      status: me.status || "inactive",
      interval: me.interval || null,
      currentPeriodEnd: me.currentPeriodEnd || null,
      cancelAtPeriodEnd: Boolean(me.cancelAtPeriodEnd),
      hasAutocard: Boolean(me.hasAutocard),
      activePackId: me.activePackId || null,
      activePackName: me.activePackName || null,
    }),
    [me, loading, refresh, applyCredits]
  );

  return <BillingContext.Provider value={value}>{children}</BillingContext.Provider>;
}

export function useBilling() {
  const ctx = useContext(BillingContext);
  if (!ctx) throw new Error("useBilling must be used within BillingProvider");
  return ctx;
}

export function useBillingOptional() {
  return useContext(BillingContext);
}
