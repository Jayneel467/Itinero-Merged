import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { hotelService } from "../services/hotelService";

/**
 * Live hotel search against supervisor GET /api/hotels/search (LiteAPI).
 */
export default function useHotelSearch() {
  const [searchParams] = useSearchParams();
  const [hotels, setHotels] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [mode, setMode] = useState("");

  const query = {
    city: searchParams.get("city") || searchParams.get("cityCode") || "",
    checkIn: searchParams.get("checkIn") || "",
    checkOut: searchParams.get("checkOut") || "",
    guests: Number(searchParams.get("guests") || 2),
    rooms: Number(searchParams.get("rooms") || 1),
  };

  const runSearch = useCallback(async () => {
    if (!query.city) {
      setHotels([]);
      setError("");
      setMessage("Choose a city and dates, then search. Live hotel inventory isn’t connected yet — Vero won’t invent stays.");
      return;
    }

    setIsLoading(true);
    setError("");
    setMessage("");

    const toYmd = (v) => {
      if (!v) return "";
      if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
      const d = new Date(v);
      if (Number.isNaN(d.getTime())) return "";
      return d.toISOString().slice(0, 10);
    };

    try {
      const res = await hotelService.search({
        city: query.city,
        check_in: toYmd(query.checkIn) || toYmd(new Date().toISOString()),
        check_out:
          toYmd(query.checkOut) ||
          toYmd(new Date(Date.now() + 3 * 86400000).toISOString()),
        guests: query.guests,
        rooms: query.rooms,
      });
      const list = Array.isArray(res.hotels) ? res.hotels : [];
      setHotels(list);
      setMode(res.mode || "");
      setMessage(res.message || "");
      if (!list.length) {
        setError(res.error || res.message || "No hotels available for this search.");
      }
    } catch (err) {
      setHotels([]);
      setMode("degraded");
      setError(
        err?.message ||
          "Vero can’t reach hotel search right now. No sample stays are shown."
      );
    } finally {
      setIsLoading(false);
    }
  }, [query.city, query.checkIn, query.checkOut, query.guests, query.rooms]);

  useEffect(() => {
    if (query.city) runSearch();
  }, [query.city, query.checkIn, query.checkOut, query.guests, query.rooms, runSearch]);

  return {
    hotels,
    isLoading,
    message,
    error,
    mode,
    query,
    runSearch,
  };
}
