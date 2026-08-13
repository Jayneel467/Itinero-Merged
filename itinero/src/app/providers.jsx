import React, { useEffect } from "react";
import { GoogleOAuthProvider } from "@react-oauth/google";
import { APP_CONFIG } from "@/app/config";
import { CurrencyProvider } from "@/context/CurrencyContext";
import { HomeLocationProvider } from "@/context/HomeLocationContext";
import { LanguageProvider } from "@/context/LanguageContext";
import { ThemeProvider } from "@/context/ThemeContext";
import { VeroUiProvider } from "@/context/VeroUiContext";
import { TripProvider } from "@/features/trips/TripContext";
import { AuthProvider } from "@/features/auth/context/AuthContext";
import TasteModal from "@/features/marketing/TasteModal";
import { captureAttributionFromUrl } from "@/services/attribution";
import { initAcquisitionPixels } from "@/services/acquisitionPixels";

function MarketingBootstrap({ children }) {
  useEffect(() => {
    captureAttributionFromUrl();
    initAcquisitionPixels();
  }, []);
  return (
    <>
      {children}
      <TasteModal />
    </>
  );
}

/**
 * Wraps the entire app with required context providers.
 */
export default function AppProviders({ children }) {
  const googleClientId = APP_CONFIG.GOOGLE_CLIENT_ID;
  const tree = (
    <ThemeProvider>
      <AuthProvider>
        <LanguageProvider>
          <CurrencyProvider>
            <HomeLocationProvider>
              <VeroUiProvider>
                <TripProvider>
                  <MarketingBootstrap>{children}</MarketingBootstrap>
                </TripProvider>
              </VeroUiProvider>
            </HomeLocationProvider>
          </CurrencyProvider>
        </LanguageProvider>
      </AuthProvider>
    </ThemeProvider>
  );

  if (!googleClientId) return tree;

  return <GoogleOAuthProvider clientId={googleClientId}>{tree}</GoogleOAuthProvider>;
}
