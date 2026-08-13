import { useEffect, useMemo, useState } from "react";
import { AIRPORTS, filterAirportsLocal } from "@/constants/airports";
import { flightService } from "@/features/flights/services/flightService";

/**
 * Debounced airport suggestions: instant local hits, then live supervisor
 * search (IATA catalog + place geocode) so "State College" resolves to SCE.
 */
export default function useAirportSuggest(searchQuery, { enabled = true } = {}) {
  const q = String(searchQuery || "").trim();
  const local = useMemo(() => filterAirportsLocal(q, AIRPORTS), [q]);
  const [remote, setRemote] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!enabled || q.length < 2) {
      setRemote([]);
      setIsLoading(false);
      return undefined;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      setIsLoading(true);
      try {
        const res = await flightService.searchAirports(q, 10);
        if (cancelled) return;
        const list = Array.isArray(res?.airports) ? res.airports : [];
        setRemote(list);
      } catch {
        if (!cancelled) setRemote([]);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }, 220);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [q, enabled]);

  const airports = useMemo(() => {
    const merged = [];
    const seen = new Set();
    for (const a of [...local, ...remote]) {
      const code = String(a?.code || "").toUpperCase();
      if (!code || seen.has(code)) continue;
      seen.add(code);
      merged.push({
        id: a.id || code.toLowerCase(),
        city: a.city || code,
        state: a.state || a.countryCode || "",
        name: a.name || `${code} Airport`,
        code,
        latitude: a.latitude ?? a.lat ?? null,
        longitude: a.longitude ?? a.lng ?? a.lon ?? null,
      });
      if (merged.length >= 12) break;
    }
    return merged;
  }, [local, remote]);

  return { airports, isLoading, localCount: local.length };
}
