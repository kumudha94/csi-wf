import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import { getToken, setToken, clearToken, getSetUpFlag, setSetUpFlag } from "../lib/authStorage";
import { setUnauthorizedHandler, apiRequest } from "../lib/api";

type AuthContextValue = {
  isLoading: boolean;
  isSetUp: boolean;
  isAuthenticated: boolean;
  // Set when the device has no local record of setup AND the server could
  // not be reached — the app shows a retry screen instead of guessing.
  bootError: boolean;
  retryBoot: () => void;
  markSetUp: () => void;
  login: (token: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const STATUS_ATTEMPTS = 3;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Cloud Run + Neon can take 6-8s to wake and occasionally fail the first
// request outright, so retry a few times before giving up.
async function fetchSetUpStatus(): Promise<boolean> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= STATUS_ATTEMPTS; attempt++) {
    try {
      const status = await apiRequest<{ isSetUp: boolean }>("/api/auth/status");
      return status.isSetUp;
    } catch (error) {
      lastError = error;
      if (attempt < STATUS_ATTEMPTS) await sleep(attempt * 2000);
    }
  }
  throw lastError;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isLoading, setIsLoading] = useState(true);
  const [isSetUp, setIsSetUp] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [bootError, setBootError] = useState(false);

  const logout = useCallback(async () => {
    await clearToken();
    setIsAuthenticated(false);
  }, []);

  const login = useCallback(async (token: string) => {
    await setToken(token);
    await setSetUpFlag();
    setIsAuthenticated(true);
    setIsSetUp(true);
  }, []);

  const markSetUp = useCallback(() => {
    setSetUpFlag().catch(() => {});
    setIsSetUp(true);
  }, []);

  const boot = useCallback(async () => {
    setIsLoading(true);
    setBootError(false);
    try {
      const token = await getToken();
      const knownSetUp = await getSetUpFlag();
      // A token is only ever issued after setup, so either signal means this
      // device belongs to an existing account — no network round-trip needed.
      // An invalid/expired token is still caught later by the 401 handler.
      if (token || knownSetUp) {
        if (!knownSetUp) await setSetUpFlag();
        setIsSetUp(true);
        setIsAuthenticated(!!token);
        return;
      }

      const serverSetUp = await fetchSetUpStatus();
      if (serverSetUp) await setSetUpFlag();
      setIsSetUp(serverSetUp);
      setIsAuthenticated(false);
    } catch {
      // Never fall back to onboarding on an error — that's how an existing
      // user ended up being asked to set up balances and a PIN again.
      setBootError(true);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => setIsAuthenticated(false));
    boot();
    return () => setUnauthorizedHandler(null);
  }, [boot]);

  return (
    <AuthContext.Provider
      value={{ isLoading, isSetUp, isAuthenticated, bootError, retryBoot: boot, markSetUp, login, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
