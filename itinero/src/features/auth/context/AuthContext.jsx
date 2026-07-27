import React, { createContext, useContext, useState, useEffect } from "react";
import { authService } from "../services/authService";

/**
 * Authentication context — provides user state across the app.
 * Usage: const { user, login, logout } = useAuthContext();
 */
const AuthContext = createContext(undefined);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  // Check for existing session on mount
  useEffect(() => {
    const token = localStorage.getItem("itinero_auth_token");
    if (token) {
      authService
        .getProfile()
        .then(setUser)
        .catch(() => localStorage.removeItem("itinero_auth_token"))
        .finally(() => setIsLoading(false));
    } else {
      setIsLoading(false);
    }
  }, []);

  const login = async (credentials) => {
    const response = await authService.login(credentials);
    localStorage.setItem("itinero_auth_token", response.token);
    setUser(response.user);
    return response;
  };

  const logout = async () => {
    await authService.logout().catch(() => {});
    localStorage.removeItem("itinero_auth_token");
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, isAuthenticated: !!user, login, logout }}>
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
