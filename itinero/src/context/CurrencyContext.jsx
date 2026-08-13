import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import useLocalStorage from "@/hooks/useLocalStorage";
import { APP_CONFIG } from "@/app/config";
import { convertWithRates, loadFxRates } from "@/services/fxService";

/**
 * Currency context - single source of truth for display + LiteAPI search currency.
 *
 * Usage:
 *   const { currency, symbol, setCurrency, formatMoney, currencies } = useCurrency();
 */

const CurrencyContext = createContext(undefined);

/**
 * Supported display currencies.
 * Prefer ISO codes Frankfurter/ECB can price; keep Gulf codes for regional users
 * (rates may be sparse if the provider omits them).
 */
export const CURRENCIES = [
  { code: "USD", symbol: "$", name: "US Dollar", locale: "en-US" },
  { code: "EUR", symbol: "€", name: "Euro", locale: "en-IE" },
  { code: "GBP", symbol: "£", name: "British Pound", locale: "en-GB" },
  { code: "INR", symbol: "₹", name: "Indian Rupee", locale: "en-IN" },
  { code: "AED", symbol: "د.إ", name: "UAE Dirham", locale: "en-AE" },
  { code: "SAR", symbol: "ر.س", name: "Saudi Riyal", locale: "en-SA" },
  { code: "QAR", symbol: "ر.ق", name: "Qatari Riyal", locale: "en-QA" },
  { code: "SGD", symbol: "S$", name: "Singapore Dollar", locale: "en-SG" },
  { code: "AUD", symbol: "A$", name: "Australian Dollar", locale: "en-AU" },
  { code: "CAD", symbol: "C$", name: "Canadian Dollar", locale: "en-CA" },
  { code: "NZD", symbol: "NZ$", name: "New Zealand Dollar", locale: "en-NZ" },
  { code: "CHF", symbol: "CHF", name: "Swiss Franc", locale: "de-CH" },
  { code: "JPY", symbol: "¥", name: "Japanese Yen", locale: "ja-JP" },
  { code: "CNY", symbol: "¥", name: "Chinese Yuan", locale: "zh-CN" },
  { code: "HKD", symbol: "HK$", name: "Hong Kong Dollar", locale: "en-HK" },
  { code: "KRW", symbol: "₩", name: "South Korean Won", locale: "ko-KR" },
  { code: "THB", symbol: "฿", name: "Thai Baht", locale: "th-TH" },
  { code: "MYR", symbol: "RM", name: "Malaysian Ringgit", locale: "en-MY" },
  { code: "IDR", symbol: "Rp", name: "Indonesian Rupiah", locale: "id-ID" },
  { code: "PHP", symbol: "₱", name: "Philippine Peso", locale: "en-PH" },
  { code: "VND", symbol: "₫", name: "Vietnamese Dong", locale: "vi-VN" },
  { code: "MXN", symbol: "MX$", name: "Mexican Peso", locale: "es-MX" },
  { code: "BRL", symbol: "R$", name: "Brazilian Real", locale: "pt-BR" },
  { code: "TRY", symbol: "₺", name: "Turkish Lira", locale: "tr-TR" },
  { code: "ZAR", symbol: "R", name: "South African Rand", locale: "en-ZA" },
  { code: "SEK", symbol: "kr", name: "Swedish Krona", locale: "sv-SE" },
  { code: "NOK", symbol: "kr", name: "Norwegian Krone", locale: "nb-NO" },
  { code: "DKK", symbol: "kr", name: "Danish Krone", locale: "da-DK" },
  { code: "PLN", symbol: "zł", name: "Polish Złoty", locale: "pl-PL" },
  { code: "CZK", symbol: "Kč", name: "Czech Koruna", locale: "cs-CZ" },
  { code: "HUF", symbol: "Ft", name: "Hungarian Forint", locale: "hu-HU" },
  { code: "RON", symbol: "lei", name: "Romanian Leu", locale: "ro-RO" },
  { code: "ILS", symbol: "₪", name: "Israeli Shekel", locale: "he-IL" },
];

const ZERO_DECIMAL = new Set(["JPY", "KRW", "VND", "IDR", "HUF", "CLP"]);

const CURRENCY_MAP = Object.fromEntries(CURRENCIES.map((c) => [c.code, c]));

export function getCurrencyMeta(code) {
  const key = String(code || APP_CONFIG.DEFAULT_CURRENCY).toUpperCase();
  return CURRENCY_MAP[key] || CURRENCY_MAP[APP_CONFIG.DEFAULT_CURRENCY] || CURRENCIES[0];
}

export function formatMoney(amount, currencyCode = APP_CONFIG.DEFAULT_CURRENCY, options = {}) {
  const meta = getCurrencyMeta(currencyCode);
  const n = Number(amount);
  if (!Number.isFinite(n)) return "-";
  const zero = ZERO_DECIMAL.has(meta.code);
  const {
    locale = meta.locale || APP_CONFIG.DEFAULT_LOCALE,
    maximumFractionDigits = zero ? 0 : 2,
    minimumFractionDigits = 0,
  } = options;
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: meta.code,
      minimumFractionDigits,
      maximumFractionDigits,
    }).format(n);
  } catch {
    return `${meta.symbol}${Math.round(n).toLocaleString(locale)}`;
  }
}

const FX_QUOTES = CURRENCIES.map((c) => c.code);

export function CurrencyProvider({ children }) {
  const [currency, setCurrencyCode] = useLocalStorage(
    "itinero_currency",
    APP_CONFIG.DEFAULT_CURRENCY
  );
  const [fx, setFx] = useState(null);

  const meta = useMemo(() => getCurrencyMeta(currency), [currency]);

  useEffect(() => {
    let cancelled = false;
    // USD base is the international mid-market convention; convertWithRates handles any pair.
    loadFxRates("USD", FX_QUOTES)
      .then((bundle) => {
        if (!cancelled) setFx(bundle);
      })
      .catch(() => {
        if (!cancelled) setFx(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const setCurrency = useCallback(
    (codeOrObj, maybeSymbol) => {
      const code =
        typeof codeOrObj === "string"
          ? codeOrObj
          : codeOrObj?.code || APP_CONFIG.DEFAULT_CURRENCY;
      setCurrencyCode(String(code).toUpperCase());
      void maybeSymbol;
    },
    [setCurrencyCode]
  );

  const format = useCallback(
    (amount, options) => formatMoney(amount, meta.code, options),
    [meta.code]
  );

  const convert = useCallback(
    (amount, from, to = meta.code) => convertWithRates(amount, from, to, fx),
    [fx, meta.code]
  );

  const formatFrom = useCallback(
    (amount, fromCurrency, options = {}) => {
      const src = String(fromCurrency || meta.code).toUpperCase();
      const converted = convert(amount, src, meta.code);
      if (converted == null) {
        return formatMoney(amount, src, options);
      }
      return formatMoney(converted, meta.code, options);
    },
    [convert, meta.code]
  );

  const value = useMemo(
    () => ({
      currency: meta.code,
      symbol: meta.symbol,
      locale: meta.locale,
      currencies: CURRENCIES,
      setCurrency,
      formatMoney: format,
      formatFrom,
      convert,
      fxDate: fx?.date || "",
      fxReady: Boolean(fx?.rates && Object.keys(fx.rates).length),
      fxBase: fx?.base || "USD",
      getMeta: getCurrencyMeta,
    }),
    [meta, setCurrency, format, formatFrom, convert, fx]
  );

  return (
    <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>
  );
}

export function useCurrency() {
  const context = useContext(CurrencyContext);
  if (!context) {
    throw new Error("useCurrency must be used within a CurrencyProvider");
  }
  return context;
}
