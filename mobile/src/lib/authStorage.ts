import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

const TOKEN_KEY = "csiwf_session_token";

// expo-secure-store has no web implementation — localStorage stands in for
// local browser development; the shipped app is native-only, where
// SecureStore is used for real.
const isWeb = Platform.OS === "web";

export async function getToken(): Promise<string | null> {
  if (isWeb) return localStorage.getItem(TOKEN_KEY);
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export async function setToken(token: string): Promise<void> {
  if (isWeb) {
    localStorage.setItem(TOKEN_KEY, token);
    return;
  }
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function clearToken(): Promise<void> {
  if (isWeb) {
    localStorage.removeItem(TOKEN_KEY);
    return;
  }
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}

// Remembers on-device that the account has been set up, so a failed or slow
// /api/auth/status call at boot (Cloud Run / Neon cold start) can never send
// an existing user back to onboarding. Never cleared — logout keeps it.
const SETUP_KEY = "csiwf_is_set_up";

export async function getSetUpFlag(): Promise<boolean> {
  if (isWeb) return localStorage.getItem(SETUP_KEY) === "1";
  return (await SecureStore.getItemAsync(SETUP_KEY)) === "1";
}

export async function setSetUpFlag(): Promise<void> {
  if (isWeb) {
    localStorage.setItem(SETUP_KEY, "1");
    return;
  }
  await SecureStore.setItemAsync(SETUP_KEY, "1");
}
