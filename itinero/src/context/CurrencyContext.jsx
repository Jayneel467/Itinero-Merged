import React, { createContext, useContext } from "react";
import useLocalStorage from "@/hooks/useLocalStorage";
import { APP_CONFIG } from "@/app/config";

/**
 * Currency context for price display across the app.
 *
 * Usage:
 *   const { currency, setCurrency, currencies } = useCurrency();
 */

const CurrencyContext = createContext(undefined);

/** Supported currencies */
export const CURRENCIES = [
  { code: "INR", symbol: "₹", name: "Indian Rupee" },
  { code: "USD", symbol: "$", name: "US Dollar" },
  { code: "EUR", symbol: "€", name: "Euro" },
  { code: "GBP", symbol: "£", name: "British Pound" },
  { code: "AED", symbol: "د.إ", name: "UAE Dirham" },
  { code: "THB", symbol: "฿", name: "Thai Baht" },
];

export function CurrencyProvider({ children }) {
  const [currency, setCurrency] = useLocalStorage(
    "currency",
    APP_CONFIG.DEFAULT_CURRENCY
  );

  return (
    <CurrencyContext.Provider value={{ currency, setCurrency, currencies: CURRENCIES }}>
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency() {
  const context = useContext(CurrencyContext);
  if (!context) {
    throw new Error("useCurrency must be used within a CurrencyProvider");
  }
  return context;
}
