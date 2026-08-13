import { useEffect, useMemo, useState } from "react";
import { busService } from "../services/busService";

export default function usePlaceSuggest(searchQuery, { enabled = true } = {}) {
  const q = String(searchQuery || "").trim();
  const [places, setPlaces] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!enabled || q.length < 2) {
      setPlaces((prev) => (prev.length ? [] : prev));
      setIsLoading((prev) => (prev ? false : prev));
      return undefined;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      setIsLoading(true);
      try {
        const list = await busService.suggestPlaces(q, 8);
        if (!cancelled) setPlaces(Array.isArray(list) ? list : []);
      } catch {
        if (!cancelled) setPlaces([]);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }, 180);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [q, enabled]);

  const items = useMemo(
    () =>
      places
        .filter((p) => p?.name || p?.address)
        .map((p) => ({
          id: p.id || p.address || p.name,
          name: p.name || String(p.address || "").split(",")[0],
          address: p.address || p.name,
          state: p.subtitle || "",
          label: p.address || p.name,
        })),
    [places]
  );

  return { places: items, isLoading };
}
