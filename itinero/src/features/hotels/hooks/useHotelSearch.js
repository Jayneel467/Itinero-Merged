import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { hotelService } from "../services/hotelService";
import { useCurrency } from "@/context/CurrencyContext";

const PAGE_SIZE = 40;

/**
 * Live hotel/homes search against supervisor GET /api/hotels/search (LiteAPI).
 * Pass category="homes" for villas, apartments, and homestays.
 */
export default function useHotelSearch({ category = "hotels" } = {}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const { currency } = useCurrency();
  const [hotels, setHotels] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [mode, setMode] = useState("");
  const [geo, setGeo] = useState(null);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [categoryLabel, setCategoryLabel] = useState(
    category === "homes" ? "Villas & Homestays" : "Hotels"
  );

  const page = Math.max(1, Number(searchParams.get("page") || 1));
  const sortBy = searchParams.get("sortBy") || "recommended";
  const searchCategory = category === "homes" ? "homes" : "hotels";

  const query = {
    city: searchParams.get("city") || searchParams.get("cityCode") || "",
    cityCode: searchParams.get("cityCode") || "",
    checkIn: searchParams.get("checkIn") || "",
    checkOut: searchParams.get("checkOut") || "",
    guests: Number(searchParams.get("guests") || 2),
    rooms: Number(searchParams.get("rooms") || 1),
    lat: searchParams.get("lat") || "",
    lng: searchParams.get("lng") || "",
    page,
    sortBy,
    category: searchCategory,
  };

  const setPage = useCallback(
    (nextPage) => {
      const n = Math.max(1, Number(nextPage) || 1);
      const next = new URLSearchParams(searchParams);
      next.set("page", String(n));
      setSearchParams(next, { replace: true });
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [searchParams, setSearchParams]
  );

  const setSortBy = useCallback(
    (nextSort) => {
      const s = String(nextSort || "recommended");
      const next = new URLSearchParams(searchParams);
      next.set("sortBy", s);
      next.set("page", "1");
      setSearchParams(next, { replace: true });
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [searchParams, setSearchParams]
  );

  const runSearch = useCallback(async () => {
    if (!query.city) {
      setHotels([]);
      setTotal(0);
      setTotalPages(0);
      setGeo(null);
      setError("");
      setMessage(
        searchCategory === "homes"
          ? "Choose a city and dates, then search for villas and homes."
          : "Choose a city and dates, then search for live stays."
      );
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
      const payload = {
        city: query.city,
        check_in: toYmd(query.checkIn) || toYmd(new Date().toISOString()),
        check_out:
          toYmd(query.checkOut) ||
          toYmd(new Date(Date.now() + 3 * 86400000).toISOString()),
        guests: query.guests,
        rooms: query.rooms,
        currency,
        page: query.page,
        page_size: PAGE_SIZE,
        sort_by: query.sortBy || "recommended",
        category: searchCategory,
      };
      if (query.cityCode) payload.city_code = query.cityCode;
      if (query.lat && query.lng) {
        payload.latitude = Number(query.lat);
        payload.longitude = Number(query.lng);
      }
      const res = await hotelService.search(payload);
      const list = (Array.isArray(res.hotels) ? res.hotels : []).filter((h) => {
        const p = Number(h?.pricePerNight) || Number(h?.totalPrice) || 0;
        if (h?.has_price === false || p <= 0) return false;
        // Client guard: homes mode never shows classic hotels
        if (searchCategory === "homes") {
          if (h?.categoryHint === "hotels") return false;
          const tid = Number(h?.hotelTypeId);
          if (Number.isFinite(tid) && [203, 204, 205, 206, 218, 225, 226, 231, 233, 274].includes(tid)) {
            return false;
          }
        }
        return true;
      });
      setHotels(list);
      setMode(res.mode || "");
      setMessage(res.message || "");
      setGeo(
        res.geo &&
          Number.isFinite(Number(res.geo.latitude)) &&
          Number.isFinite(Number(res.geo.longitude))
          ? {
              latitude: Number(res.geo.latitude),
              longitude: Number(res.geo.longitude),
              displayName: res.geo.display_name || "",
            }
          : null
      );
      setCategoryLabel(
        res.category_label ||
          (searchCategory === "homes" ? "Villas & Homestays" : "Hotels")
      );
      setTotal(Number(res.total) || list.length);
      setTotalPages(Number(res.total_pages) || (list.length ? 1 : 0));
      if (!list.length) {
        setError(
          res.error ||
            res.message ||
            (searchCategory === "homes"
              ? "No villas or homestays available for this search."
              : "No hotels available for this search.")
        );
      }
    } catch (err) {
      setHotels([]);
      setTotal(0);
      setTotalPages(0);
      setGeo(null);
      setMode("degraded");
      setError(
        err?.message ||
          "Can't reach stay search right now. No sample stays are shown."
      );
    } finally {
      setIsLoading(false);
    }
  }, [
    query.city,
    query.cityCode,
    query.checkIn,
    query.checkOut,
    query.guests,
    query.rooms,
    query.page,
    query.sortBy,
    query.lat,
    query.lng,
    currency,
    searchCategory,
  ]);

  useEffect(() => {
    if (query.city || query.cityCode || (query.lat && query.lng)) runSearch();
  }, [
    query.city,
    query.cityCode,
    query.checkIn,
    query.checkOut,
    query.guests,
    query.rooms,
    query.page,
    query.sortBy,
    query.lat,
    query.lng,
    currency,
    searchCategory,
    runSearch,
  ]);

  return {
    hotels,
    isLoading,
    message,
    error,
    mode,
    geo,
    query,
    runSearch,
    page,
    pageSize: PAGE_SIZE,
    total,
    totalPages,
    setPage,
    sortBy,
    setSortBy,
    category: searchCategory,
    categoryLabel,
  };
}
