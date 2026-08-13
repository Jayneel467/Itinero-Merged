import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { authService } from "../services/authService";
import {
  AUTH_EVENT,
  clearAuthSession,
  persistAuthSession,
  readLocalUser,
  TOKEN_KEY,
} from "../session";

const AuthContext = createContext(undefined);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => readLocalUser());
  const [isLoading, setIsLoading] = useState(true);

  const applySession = useCallback((token, nextUser) => {
    persistAuthSession({ token, user: nextUser });
    setUser(nextUser || null);
    // Sync local home prefs → interest profile (marketing OS)
    if (nextUser?.id && token) {
      try {
        const raw = localStorage.getItem("itinero_home_location_v1");
        const home = raw ? JSON.parse(raw) : null;
        import("@/services/interestTracker")
          .then(({ interestService, flushInterestEvents }) => {
            const body = {};
            if (home?.airportCode) body.home_airport = home.airportCode;
            if (home?.city) body.home_city = home.city;
            if (home?.countryCode) body.home_country = home.countryCode;
            if (Object.keys(body).length) {
              interestService.put(body).catch(() => {});
            }
            flushInterestEvents();
          })
          .catch(() => {});
      } catch {
        /* ignore */
      }
    }
  }, []);

  const refresh = useCallback(() => {
    setUser(readLocalUser());
  }, []);

  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      setIsLoading(false);
      return undefined;
    }
    authService
      .getProfile()
      .then((data) => {
        const next = data?.user || data;
        if (next?.id || next?.phone || next?.email) applySession(token, next);
        else clearAuthSession();
      })
      .catch(() => {
        clearAuthSession();
        setUser(null);
      })
      .finally(() => setIsLoading(false));
    return undefined;
  }, [applySession]);

  useEffect(() => {
    const onAuth = () => setUser(readLocalUser());
    window.addEventListener(AUTH_EVENT, onAuth);
    window.addEventListener("storage", onAuth);
    return () => {
      window.removeEventListener(AUTH_EVENT, onAuth);
      window.removeEventListener("storage", onAuth);
    };
  }, []);

  const loginWithOtp = async (identifier, code) => {
    const response = await authService.verifyOtp(identifier, code);
    if (response?.token && response?.user && !response.needs_setup) {
      applySession(response.token, response.user);
    }
    return response;
  };

  const loginWithGoogle = async (idToken) => {
    const response = await authService.loginWithGoogle(idToken);
    if (response?.token && response?.user) {
      applySession(response.token, response.user);
    }
    return response;
  };

  const completeSignup = async (payload) => {
    const response = await authService.register(payload);
    if (response?.token && response?.user) {
      applySession(response.token, response.user);
    }
    return response;
  };

  const updateProfile = async (payload) => {
    const response = await authService.updateProfile(payload);
    if (response?.user) {
      const token = localStorage.getItem(TOKEN_KEY);
      applySession(token, response.user);
    }
    return response;
  };

  const logout = async () => {
    await authService.logout().catch(() => {});
    clearAuthSession();
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: Boolean(user?.id || user?.phone || user?.email),
        loginWithOtp,
        loginWithGoogle,
        completeSignup,
        updateProfile,
        logout,
        refresh,
        applySession,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuthContext() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuthContext must be used within an AuthProvider");
  }
  return context;
}

export function useAuthOptional() {
  return useContext(AuthContext);
}
