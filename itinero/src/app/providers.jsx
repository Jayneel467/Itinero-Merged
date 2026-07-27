import React from "react";
// import { ThemeProvider } from "@/context/ThemeContext";
// import { CurrencyProvider } from "@/context/CurrencyContext";
// import { AuthProvider } from "@/features/auth/context/AuthContext";

/**
 * Wraps the entire app with all required context providers.
 * Add new providers here as needed — keeps App.jsx clean.
 *
 * Order matters: outermost providers are available to inner ones.
 * AuthProvider is innermost so it can access Theme & Currency.
 */
export default function AppProviders({ children }) {
  return (
    <>
      {/* Uncomment providers as they are implemented:
      <ThemeProvider>
        <CurrencyProvider>
          <AuthProvider>
            {children}
          </AuthProvider>
        </CurrencyProvider>
      </ThemeProvider>
      */}
      {children}
    </>
  );
}
