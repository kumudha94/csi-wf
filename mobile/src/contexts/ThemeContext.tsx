import { createContext, useContext, useEffect, useState, useMemo, useCallback, type ReactNode } from "react";
import { useColorScheme } from "react-native";
import * as SecureStore from "expo-secure-store";
import { lightColors, darkColors, type ThemeColors } from "../theme";

export type ThemeMode = "light" | "dark" | "system";

const THEME_MODE_KEY = "csiwf_theme_mode";

type ThemeContextValue = {
  mode: ThemeMode;
  scheme: "light" | "dark";
  colors: ThemeColors;
  setMode: (mode: ThemeMode) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>("system");

  useEffect(() => {
    SecureStore.getItemAsync(THEME_MODE_KEY).then((saved) => {
      if (saved === "light" || saved === "dark" || saved === "system") setModeState(saved);
    });
  }, []);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    SecureStore.setItemAsync(THEME_MODE_KEY, next);
  }, []);

  const scheme: "light" | "dark" = mode === "system" ? (systemScheme === "dark" ? "dark" : "light") : mode;
  const colors = scheme === "dark" ? darkColors : lightColors;

  const value = useMemo(() => ({ mode, scheme, colors, setMode }), [mode, scheme, colors, setMode]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
