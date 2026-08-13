import { useEffect, useMemo, useState } from "react";
import { trainService } from "../services/trainService";

const LOCAL = [
  { code: "ST", name: "Surat", state: "Gujarat" },
  { code: "UDN", name: "Udhna Jn", state: "Gujarat" },
  { code: "BRC", name: "Vadodara Jn", state: "Gujarat", aliases: ["baroda", "vadodra"] },
  { code: "ADI", name: "Ahmedabad Jn", state: "Gujarat", aliases: ["amdavad"] },
  { code: "MMCT", name: "Mumbai Central", state: "Maharashtra", aliases: ["mumbai", "bombay"] },
  { code: "CSMT", name: "Mumbai CSMT", state: "Maharashtra" },
  { code: "BDTS", name: "Bandra Terminus", state: "Maharashtra" },
  { code: "PUNE", name: "Pune Jn", state: "Maharashtra" },
  { code: "NDLS", name: "New Delhi", state: "Delhi", aliases: ["delhi"] },
  { code: "JP", name: "Jaipur Jn", state: "Rajasthan" },
  { code: "BME", name: "Barmer", state: "Rajasthan" },
  { code: "JU", name: "Jodhpur Jn", state: "Rajasthan" },
  { code: "BKN", name: "Bikaner Jn", state: "Rajasthan" },
  { code: "AII", name: "Ajmer Jn", state: "Rajasthan" },
  { code: "UDZ", name: "Udaipur City", state: "Rajasthan" },
  { code: "ABR", name: "Abu Road", state: "Rajasthan", aliases: ["ambaji"] },
  { code: "RJT", name: "Rajkot Jn", state: "Gujarat" },
  { code: "DWK", name: "Dwarka", state: "Gujarat" },
  { code: "VRL", name: "Veraval", state: "Gujarat" },
  { code: "SBC", name: "KSR Bengaluru", state: "Karnataka", aliases: ["bangalore", "bengaluru"] },
  { code: "MAS", name: "Chennai Central", state: "Tamil Nadu" },
];

function fold(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/\b(jn\.?|junction|station|city|cantt\.?)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function filterLocal(q) {
  const t = fold(q);
  const raw = String(q || "").trim().toLowerCase();
  if (t.length < 2) return [];
  return LOCAL.filter((s) => {
    const hay = [s.code, s.name, ...(s.aliases || [])].map(fold).join(" ");
    return (
      s.code.toLowerCase().startsWith(raw) ||
      fold(s.name).startsWith(t) ||
      hay.includes(t)
    );
  }).map((s) => ({
    code: s.code,
    name: s.name,
    state: s.state || "",
    label: `${s.name} (${s.code})`,
  }));
}

export default function useStationSuggest(searchQuery, { enabled = true } = {}) {
  const q = String(searchQuery || "").trim();
  const local = useMemo(() => filterLocal(q), [q]);
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
        const list = await trainService.stations(q, 10);
        if (!cancelled) setRemote(Array.isArray(list) ? list : []);
      } catch {
        if (!cancelled) setRemote([]);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }, 180);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [q, enabled]);

  const stations = useMemo(() => {
    const merged = [];
    const seen = new Set();
    for (const s of [...local, ...remote]) {
      const code = String(s?.code || "").toUpperCase();
      if (!code || seen.has(code)) continue;
      seen.add(code);
      merged.push({
        code,
        name: s.name || code,
        state: s.state || "",
        label: s.label || `${s.name || code} (${code})`,
      });
      if (merged.length >= 10) break;
    }
    return merged;
  }, [local, remote]);

  return { stations, isLoading, localCount: local.length };
}
