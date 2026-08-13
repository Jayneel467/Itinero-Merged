import { useEffect, useMemo, useRef, useState } from "react";
import { packageService } from "../services/packageService";

const CACHE = "itinero_pkg_live_v3:";
const CONCURRENCY = 3;

function cacheKey(slug, checkIn, nights, guests) {
  return `${CACHE}${slug}|${checkIn}|${nights}|${guests}`;
}

function addDaysYmd(ymd, nights) {
  const d = new Date(`${ymd}T12:00:00`);
  d.setDate(d.getDate() + Math.max(1, Number(nights) || 3));
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function defaultCheckIn() {
  const d = new Date();
  d.setDate(d.getDate() + 14);
  return d.toISOString().slice(0, 10);
}

/**
 * Live LiteAPI stay totals for package cards.
 * Uses each package's own night count. Never invents a price.
 */
export default function usePackageLiveQuotes({
  packages = [],
  checkIn,
  guests = 2,
  enabled = true,
}) {
  const cin = checkIn || defaultCheckIn();
  const g = Math.max(1, Number(guests) || 2);
  const [quotes, setQuotes] = useState({});
  const [loading, setLoading] = useState({});
  const gen = useRef(0);

  const jobs = useMemo(
    () =>
      packages
        .map((p) => ({
          slug: p.slug || p.id,
          nights: Math.max(1, Number(p.durationNights) || 3),
        }))
        .filter((j) => j.slug),
    [packages]
  );

  const jobKey = jobs.map((j) => `${j.slug}:${j.nights}`).join(",");

  useEffect(() => {
    if (!enabled || !cin || !jobs.length) return undefined;
    const run = ++gen.current;
    const initialQ = {};
    const initialL = {};
    for (const job of jobs) {
      try {
        const raw = sessionStorage.getItem(cacheKey(job.slug, cin, job.nights, g));
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && ("stayTotal" in parsed)) {
            initialQ[job.slug] = parsed;
            continue;
          }
        }
      } catch {
        /* ignore */
      }
      initialL[job.slug] = true;
    }
    setQuotes(initialQ);
    setLoading(initialL);

    let cancelled = false;
    const queue = jobs.filter((j) => !(j.slug in initialQ));
    let i = 0;

    async function worker() {
      while (!cancelled && run === gen.current && i < queue.length) {
        const job = queue[i++];
        const cout = addDaysYmd(cin, job.nights);
        try {
          const res = await packageService.quote(job.slug, {
            check_in: cin,
            check_out: cout,
            guests: g,
            include_flights: false,
            quote_mode: "listing",
          });
          if (cancelled || run !== gen.current) return;
          const stayTotal = res?.quote?.stayTotal;
          const row = {
            stayTotal: typeof stayTotal === "number" && stayTotal > 0 ? stayTotal : null,
            hotelName:
              res?.quote?.hotel?.name || res?.quote?.stays?.[0]?.hotel?.name || "",
            nights: res?.quote?.nights || job.nights,
            currency: res?.quote?.currency || "INR",
          };
          try {
            sessionStorage.setItem(
              cacheKey(job.slug, cin, job.nights, g),
              JSON.stringify(row)
            );
          } catch {
            /* ignore */
          }
          setQuotes((prev) => ({ ...prev, [job.slug]: row }));
        } catch {
          if (!cancelled && run === gen.current) {
            setQuotes((prev) => ({ ...prev, [job.slug]: { stayTotal: null } }));
          }
        } finally {
          if (!cancelled && run === gen.current) {
            setLoading((prev) => {
              const next = { ...prev };
              delete next[job.slug];
              return next;
            });
          }
        }
      }
    }

    Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, queue.length || 1) }, () => worker())
    );

    return () => {
      cancelled = true;
    };
  }, [enabled, jobKey, cin, g, jobs]);

  return { quotes, loading, checkIn: cin };
}
