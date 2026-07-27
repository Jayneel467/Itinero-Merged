import { useState } from 'react';

/**
 * Hook for authentication state and actions.
 * TODO: Connect to AuthContext and API.
 */
export default function useAuth() {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  return { user, isLoading, isAuthenticated: !!user, login: () => {}, logout: () => {}, register: () => {} };
}

