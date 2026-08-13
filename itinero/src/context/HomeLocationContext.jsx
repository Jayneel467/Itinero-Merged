import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useCurrency } from "@/context/CurrencyContext";
import {
  COUNTRY_DEFAULTS,
  countryFlagUrl,
  currencyForCountry,
  detectHomeLocation,
  emptyHomeLocation,
  homeLocationLabel,
  passportLabel,
  readStoredHomeLocation,
  resolveAirportMeta,
  writeStoredHomeLocation,
} from "@/services/homeLocation";

const HomeLocationContext = createContext(null);

const CURRENCY_SYNCED_KEY = "itinero_home_currency_synced_v1";

export function HomeLocationProvider({ children }) {
  const { currency, setCurrency } = useCurrency();
  const [home, setHome] = useState(() => readStoredHomeLocation() || emptyHomeLocation());
  const [ready, setReady] = useState(() => Boolean(readStoredHomeLocation()?.countryCode));

  useEffect(() => {
    let alive = true;
    (async () => {
      const loc = await detectHomeLocation({ allowGeo: true });
      if (!alive) return;
      setHome(loc || emptyHomeLocation());
      setReady(true);

      // One-time currency sync from detected country - don't fight user picks.
      try {
        const already = localStorage.getItem(CURRENCY_SYNCED_KEY);
        const suggested = currencyForCountry(loc?.countryCode);
        if (!already && suggested && !loc?.userSet) {
          // Only auto-switch if still on a mismatched default feel (INR while abroad, etc.)
          const cc = String(loc.countryCode || "").toUpperCase();
          if (cc && cc !== "IN" && currency === "INR" && suggested !== "INR") {
            setCurrency(suggested);
            localStorage.setItem(CURRENCY_SYNCED_KEY, suggested);
          } else if (cc === "IN" && currency === "INR") {
            localStorage.setItem(CURRENCY_SYNCED_KEY, "INR");
          } else if (suggested && currency === suggested) {
            localStorage.setItem(CURRENCY_SYNCED_KEY, suggested);
          }
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      alive = false;
    };
    // Intentionally once on mount - re-running on currency changes caused update loops.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setHomeLocation = useCallback((patch, { userSet = true } = {}) => {
    setHome((prev) => {
      const next = {
        ...emptyHomeLocation(),
        ...prev,
        ...patch,
        airportCode: String(patch.airportCode ?? prev.airportCode ?? "")
          .toUpperCase()
          .slice(0, 3),
        countryCode: String(patch.countryCode ?? prev.countryCode ?? "")
          .toUpperCase()
          .slice(0, 2),
        passportCountry: String(
          patch.passportCountry ?? prev.passportCountry ?? patch.countryCode ?? ""
        )
          .toUpperCase()
          .slice(0, 2),
        city: String(patch.city ?? prev.city ?? "").trim(),
        source: userSet ? "user" : patch.source || prev.source || "user",
        detectedAt: Date.now(),
        userSet: userSet || Boolean(prev.userSet),
      };
      if (!next.city && next.airportCode) {
        next.city = resolveAirportMeta(next.airportCode)?.city || next.city;
      }
      writeStoredHomeLocation(next);
      return next;
    });
  }, []);

  const setHomeAirport = useCallback(
    (codeOrAirport) => {
      const code =
        typeof codeOrAirport === "string"
          ? codeOrAirport
          : codeOrAirport?.code || "";
      const meta = resolveAirportMeta(code);
      const state = String(meta?.state || "");
      let countryCode = home.countryCode;
      if (/india/i.test(state)) countryCode = "IN";
      else if (/united states|usa/i.test(state)) countryCode = "US";
      else if (/united kingdom|uk\b/i.test(state)) countryCode = "GB";
      else if (/uae|dubai|abu dhabi/i.test(state)) countryCode = "AE";
      else if (/singapore/i.test(state)) countryCode = "SG";
      else if (/japan/i.test(state)) countryCode = "JP";
      else if (/thailand/i.test(state)) countryCode = "TH";
      else if (/australia/i.test(state)) countryCode = "AU";
      else if (/canada/i.test(state)) countryCode = "CA";
      else if (/france/i.test(state)) countryCode = "FR";
      else if (/germany/i.test(state)) countryCode = "DE";

      setHomeLocation({
        airportCode: String(code || "").toUpperCase(),
        city: meta?.city || "",
        countryCode: countryCode || home.countryCode,
        // Do not invent passport from airport country - Regional passport pick is SOT.
        passportCountry: home.passportCountry || "",
      });

      const suggested = currencyForCountry(countryCode || home.countryCode);
      if (suggested) {
        try {
          setCurrency(suggested);
          localStorage.setItem(CURRENCY_SYNCED_KEY, suggested);
        } catch {
          /* ignore */
        }
      }
    },
    [home.countryCode, home.passportCountry, setCurrency, setHomeLocation]
  );

  const setPassportCountry = useCallback(
    (cc) => {
      const code = String(cc || "")
        .toUpperCase()
        .slice(0, 2);
      setHomeLocation({ passportCountry: code });
    },
    [setHomeLocation]
  );

  const value = useMemo(() => {
    const airportCode = home.airportCode || "";
    const countryCode = home.countryCode || "";
    // Passport only when explicitly stored - do not equate home country with nationality.
    const passportCountry = home.passportCountry || "";
    return {
      ready,
      home,
      airportCode,
      city: home.city || "",
      countryCode,
      passportCountry,
      originLabel: homeLocationLabel(home),
      countryFlag: countryFlagUrl(countryCode || passportCountry),
      passportLabel: passportCountry
        ? passportLabel(passportCountry)
        : "your passport",
      hasPassport: Boolean(passportCountry),
      countryName: COUNTRY_DEFAULTS[countryCode]?.label || countryCode || "",
      hasOrigin: Boolean(airportCode),
      setHomeLocation,
      setHomeAirport,
      setPassportCountry,
    };
  }, [home, ready, setHomeAirport, setHomeLocation, setPassportCountry]);

  return (
    <HomeLocationContext.Provider value={value}>{children}</HomeLocationContext.Provider>
  );
}

export function useHomeLocation() {
  const ctx = useContext(HomeLocationContext);
  if (!ctx) {
    throw new Error("useHomeLocation must be used within HomeLocationProvider");
  }
  return ctx;
}

export function useHomeLocationOptional() {
  return useContext(HomeLocationContext);
}
