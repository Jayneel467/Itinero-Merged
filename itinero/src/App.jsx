import React from "react";
import { BrowserRouter } from "react-router-dom";
import AppProviders from "@/app/providers";
import AppRouter from "@/app/router";

/**
 * Root application component.
 * Wraps the app with providers and sets up client-side routing.
 */
export default function App() {
  return (
    <AppProviders>
      <BrowserRouter basename="/itinero">
        <AppRouter />
      </BrowserRouter>
    </AppProviders>
  );
}
