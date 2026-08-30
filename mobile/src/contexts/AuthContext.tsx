import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import { getToken, setToken, clearToken } from "../lib/authStorage";
import { setUnauthorizedHandler, apiRequest } from "../lib/api";

type AuthContextValue = {
  isLoading: boolean;
  isSetUp: boolean;
  isAuthenticated: boolean;
  markSetUp: () => void;
  login: (token: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isLoading, setIsLoading] = useState(true);
  const [isSetUp, setIsSetUp] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  const logout = useCallback(async () => {
    await clearToken();
    setIsAuthenticated(false);
  }, []);

  const login = useCallback(async (token: string) => {
    await setToken(token);
    setIsAuthenticated(true);
    setIsSetUp(true);
  }, []);

  const markSetUp = useCallback(() => setIsSetUp(true), []);

  useEffect(() => {
    setUnauthorizedHandler(() => setIsAuthenticated(false));
    (async () => {
      try {
        const status = await apiRequest<{ isSetUp: boolean }>("/api/auth/status");
        setIsSetUp(status.isSetUp);
        if (status.isSetUp) {
          const token = await getToken();
          setIsAuthenticated(!!token);
        }
      } catch {
        // Backend unreachable at boot — default to the setup flow, the
        // login/onboarding screens will surface a clearer error on submit.
        setIsSetUp(false);
      } finally {
        setIsLoading(false);
      }
    })();
    return () => setUnauthorizedHandler(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <AuthContext.Provider value={{ isLoading, isSetUp, isAuthenticated, markSetUp, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
