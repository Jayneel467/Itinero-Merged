import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { AUTH_EVENT } from "@/features/auth/session";
import { tripService, subscribeTrips } from "./tripService";

const TripContext = createContext(undefined);

export function TripProvider({ children }) {
  const [trips, setTrips] = useState(() => tripService.list());
  const [activeTripId, setActiveTripId] = useState(null);

  const refresh = useCallback(() => {
    setTrips(tripService.list());
  }, []);

  useEffect(() => subscribeTrips(refresh), [refresh]);

  useEffect(() => {
    tripService.syncFromServer().then(refresh).catch(() => {});
  }, [refresh]);

  useEffect(() => {
    const onAuth = () => {
      tripService.syncFromServer().then(refresh).catch(() => refresh());
    };
    window.addEventListener(AUTH_EVENT, onAuth);
    return () => window.removeEventListener(AUTH_EVENT, onAuth);
  }, [refresh]);

  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === "itinero_trips") refresh();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [refresh]);

  const value = useMemo(
    () => ({
      trips,
      activeTripId,
      setActiveTripId,
      refresh,
      getTrip: (id) => tripService.get(id),
      ensureFlightDraft: (p) => {
        const t = tripService.ensureFlightDraft(p);
        setActiveTripId(t?.id || null);
        return t;
      },
      markFlightHeld: (p) => tripService.markFlightHeld(p),
      markFlightConfirmed: (p) => tripService.markFlightConfirmed(p),
      ensurePackageDraft: (p) => {
        const t = tripService.ensurePackageDraft(p);
        setActiveTripId(t?.id || null);
        return t;
      },
      markPackageConfirmed: (p) => tripService.markPackageConfirmed(p),
      ensureHotelTrip: (p) => {
        const t = tripService.ensureHotelTrip(p);
        setActiveTripId(t?.id || null);
        return t;
      },
      removeTrip: (id) => tripService.remove(id),
    }),
    [trips, activeTripId, refresh]
  );

  return <TripContext.Provider value={value}>{children}</TripContext.Provider>;
}

export function useTrips() {
  const ctx = useContext(TripContext);
  if (!ctx) throw new Error("useTrips must be used within TripProvider");
  return ctx;
}

export function useTripsOptional() {
  return useContext(TripContext);
}
