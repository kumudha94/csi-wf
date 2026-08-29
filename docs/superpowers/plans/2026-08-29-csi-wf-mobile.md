# CSI-WF Mobile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the CSI-WF Expo mobile app — PIN-locked onboarding, Members, Events (with expenses), Balance (with contributions), Reports, and Settings — consuming the backend API built in `docs/superpowers/plans/2026-08-29-csi-wf-backend.md`.

**Architecture:** Expo (React Native) app in `mobile/`, mirroring `KitchenPlanner/mobile`'s conventions: React Navigation (bottom tabs + native stacks), TanStack Query for server state, `expo-secure-store` for the JWT (with a `localStorage` fallback for web dev), a shared `apiRequest` fetch wrapper, and a lightweight `AuthContext`.

**Tech Stack:** Expo SDK ~54, React Navigation 6, `@tanstack/react-query`, `expo-secure-store`, `expo-image-picker`, `expo-sharing`, `expo-file-system`, TypeScript.

**Spec:** `docs/superpowers/specs/2026-08-29-treasurer-app-design.md`

## Global Constraints

- Backend API base URL comes from `EXPO_PUBLIC_API_URL` (defaults to `http://localhost:5000`). All requests go through `apiRequest<T>()` in `mobile/src/lib/api.ts`.
- Auth: on first launch (`GET /api/auth/status` → `isSetUp: false`) show onboarding (set opening balance, then set a PIN via `POST /api/auth/setup`); on later launches with `isSetUp: true`, show a PIN-login screen (`POST /api/auth/login`) before the app unlocks. The JWT is stored via `expo-secure-store` and sent as `Authorization: Bearer <token>` on every request.
- Every text field (name, address, notes, descriptions) is a plain `TextInput` with no charset restriction — Tamil script needs no special handling beyond that.
- Money is entered as plain decimal text (`keyboardType="decimal-pad"`), parsed with `parseFloat` before being sent to the API (which expects a JS number, per the backend plan's Global Constraints), and displayed via the shared `formatCurrency()` helper (`₹` prefix, 2 decimals).
- Dates are entered/displayed as `YYYY-MM-DD` strings (no native date-picker dependency — a plain validated text field, consistent with the backend's date format).
- No dark mode: one flat color palette in `mobile/src/theme.ts`.
- Testing: per the spec, there is no automated mobile test harness for this personal-scale app. Every task ends with a concrete, step-by-step manual verification (exact taps/inputs/expected results) instead of an automated test — do not skip these steps.

---

### Task 1: Expo scaffold, API client, auth storage, and theme

**Files:**
- Create: `mobile/package.json`
- Create: `mobile/tsconfig.json`
- Create: `mobile/babel.config.js`
- Create: `mobile/app.json`
- Create: `mobile/index.js`
- Create: `mobile/.env.example`
- Create: `mobile/src/theme.ts`
- Create: `mobile/src/lib/format.ts`
- Create: `mobile/src/lib/types.ts`
- Create: `mobile/src/lib/authStorage.ts`
- Create: `mobile/src/lib/api.ts`

**Interfaces:**
- Produces: `colors` (theme palette) from `mobile/src/theme.ts` — imported by every screen in later tasks.
- Produces: `formatCurrency(amount: number): string`, `isValidDateString(s: string): boolean` from `mobile/src/lib/format.ts`.
- Produces: TS types `Member`, `MemberWithAttributes`, `AttributeDefinition`, `EventSummary`, `Event`, `ExpenseStatus`, `Expense`, `Contribution`, `BalanceResponse`, `ReportResponse` from `mobile/src/lib/types.ts` — used by every screen/query in later tasks.
- Produces: `getToken`, `setToken`, `clearToken` from `mobile/src/lib/authStorage.ts`.
- Produces: `apiRequest<T>(endpoint: string, options?: RequestInit): Promise<T>`, `uploadReceipt(uri: string): Promise<string>`, `setUnauthorizedHandler(fn)` from `mobile/src/lib/api.ts` — used by every screen's queries/mutations.

- [ ] **Step 1: Create `mobile/package.json`**

```json
{
  "name": "csi-wf-mobile",
  "version": "1.0.0",
  "main": "index.js",
  "private": true,
  "scripts": {
    "start": "expo start",
    "android": "expo run:android",
    "ios": "expo run:ios"
  },
  "dependencies": {
    "@expo/metro-runtime": "~6.1.2",
    "@expo/vector-icons": "^15.0.3",
    "@react-navigation/bottom-tabs": "^6.5.11",
    "@react-navigation/native": "^6.1.18",
    "@react-navigation/native-stack": "^6.11.0",
    "@tanstack/react-query": "^5.60.5",
    "expo": "^54.0.36",
    "expo-file-system": "~19.0.23",
    "expo-image-picker": "~17.0.11",
    "expo-secure-store": "~15.0.8",
    "expo-sharing": "~14.0.7",
    "expo-splash-screen": "~31.0.13",
    "expo-status-bar": "~3.0.9",
    "react": "19.1.0",
    "react-dom": "19.1.0",
    "react-native": "0.81.5",
    "react-native-gesture-handler": "~2.28.0",
    "react-native-safe-area-context": "~5.6.0",
    "react-native-screens": "~4.16.0",
    "react-native-web": "^0.21.0"
  },
  "devDependencies": {
    "@babel/core": "^7.20.0",
    "@types/react": "~19.1.10",
    "babel-preset-expo": "~54.0.10",
    "typescript": "~5.9.2"
  }
}
```

- [ ] **Step 2: Create `mobile/tsconfig.json`**

```json
{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "strict": true
  }
}
```

- [ ] **Step 3: Create `mobile/babel.config.js`**

```js
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
  };
};
```

- [ ] **Step 4: Create `mobile/app.json`**

```json
{
  "expo": {
    "name": "CSI-WF Treasurer",
    "slug": "csi-wf-treasurer",
    "version": "1.0.0",
    "orientation": "portrait",
    "userInterfaceStyle": "light",
    "backgroundColor": "#6D28D9",
    "android": {
      "package": "com.csiwf.treasurer",
      "adaptiveIcon": {
        "backgroundColor": "#6D28D9"
      }
    },
    "plugins": ["expo-secure-store"]
  }
}
```

- [ ] **Step 5: Create `mobile/index.js`**

```js
import { registerRootComponent } from "expo";
import App from "./App";

registerRootComponent(App);
```

- [ ] **Step 6: Create `mobile/.env.example`**

```
EXPO_PUBLIC_API_URL=http://localhost:5000
```

- [ ] **Step 7: Create `mobile/src/theme.ts`**

```ts
export const colors = {
  primary: "#6D28D9",
  primarySoft: "#EDE4FA",
  background: "#FBF6EF",
  surface: "#FFFFFF",
  border: "#E5DED1",
  textPrimary: "#221D17",
  textSecondary: "#7A7168",
  textMuted: "#AFA598",
  danger: "#C4432E",
  dangerSoft: "#FBEEEA",
  success: "#3F8F5D",
  successSoft: "#E7F4EC",
  warning: "#B5673F",
  warningSoft: "#FBEFE7",
  white: "#FFFFFF",
};
```

- [ ] **Step 8: Create `mobile/src/lib/format.ts`**

```ts
export function formatCurrency(amount: number): string {
  return `₹${amount.toFixed(2)}`;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidDateString(value: string): boolean {
  return DATE_RE.test(value);
}

export function todayString(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
```

- [ ] **Step 9: Create `mobile/src/lib/types.ts`**

```ts
export type Member = {
  id: number;
  name: string;
  santhaNumber: string;
  phone: string | null;
  address: string | null;
  age: number | null;
  createdAt: string;
  updatedAt: string;
};

export type MemberAttributeValue = {
  id: number;
  memberId: number;
  attributeKey: string;
  value: string | null;
};

export type MemberWithAttributes = Member & { attributes: MemberAttributeValue[] };

export type AttributeType = "text" | "number" | "date";

export type AttributeDefinition = {
  id: number;
  key: string;
  label: string;
  type: AttributeType;
  createdAt: string;
};

export type EventSummary = {
  id: number;
  name: string;
  details: string | null;
  createdAt: string;
  totalPaid: number;
};

export type EventDetail = {
  id: number;
  name: string;
  details: string | null;
  createdAt: string;
};

export type ExpenseStatus = "paid" | "pending";

export type Expense = {
  id: number;
  eventId: number | null;
  description: string;
  amount: number;
  receiptPhotoUrl: string | null;
  status: ExpenseStatus;
  date: string;
  createdAt: string;
};

export type Contribution = {
  id: number;
  memberId: number;
  amount: number;
  date: string;
  note: string | null;
  createdAt: string;
};

export type BalanceResponse = {
  openingBalance: number;
  totalContributions: number;
  totalPaidExpenses: number;
  totalPendingExpenses: number;
  balance: number;
};

export type ReportExpenseRow = {
  eventName: string | null;
  description: string;
  amount: number;
  status: ExpenseStatus;
  date: string;
};

export type ReportContributionRow = {
  memberName: string;
  amount: number;
  date: string;
  note: string | null;
};

export type ReportResponse = {
  from: string;
  to: string;
  openingBalance: number;
  totalContributions: number;
  totalPaidExpenses: number;
  totalPendingExpenses: number;
  closingBalance: number;
  expenses: ReportExpenseRow[];
  contributions: ReportContributionRow[];
};
```

- [ ] **Step 10: Create `mobile/src/lib/authStorage.ts`**

```ts
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
```

- [ ] **Step 11: Create `mobile/src/lib/api.ts`**

```ts
import { getToken, clearToken } from "./authStorage";

export const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || "http://localhost:5000";

let onUnauthorized: (() => void) | null = null;

// Registered once by App.tsx so a 401 anywhere (expired/invalid session)
// kicks the user back to the PIN-login screen without every screen needing
// to handle it individually.
export function setUnauthorizedHandler(fn: (() => void) | null): void {
  onUnauthorized = fn;
}

export async function apiRequest<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const token = await getToken();
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
  });

  if (response.status === 401) {
    await clearToken();
    onUnauthorized?.();
  }

  if (!response.ok) {
    const text = await response.text();
    let message = `API error ${response.status}`;
    try {
      message = JSON.parse(text).error || message;
    } catch {
      // response wasn't JSON, keep default message
    }
    throw new Error(message);
  }

  if (response.status === 204) {
    return undefined as T;
  }
  return response.json();
}

export async function uploadReceipt(uri: string): Promise<string> {
  const token = await getToken();
  const filename = uri.split("/").pop() || "receipt.jpg";
  const match = /\.(\w+)$/.exec(filename);
  const type = match ? `image/${match[1]}` : "image/jpeg";

  const formData = new FormData();
  formData.append("image", { uri, name: filename, type } as any);

  const response = await fetch(`${API_BASE_URL}/api/upload/receipt`, {
    method: "POST",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: formData,
  });

  if (!response.ok) {
    const text = await response.text();
    let message = "Upload failed";
    try {
      message = JSON.parse(text).error || message;
    } catch {
      // not JSON
    }
    throw new Error(message);
  }

  const { url } = await response.json();
  return url as string;
}
```

- [ ] **Step 12: Install dependencies**

```bash
cd mobile && npm install
```

- [ ] **Step 13: Manual verification**

Run `npx tsc --noEmit` inside `mobile/`. Expected: no errors (no screens exist yet, so this mainly confirms the lib files compile).

- [ ] **Step 14: Commit**

```bash
git add mobile/package.json mobile/tsconfig.json mobile/babel.config.js mobile/app.json mobile/index.js mobile/.env.example mobile/src
git commit -m "chore: scaffold CSI-WF mobile app with API client"
```

---

### Task 2: Auth flow — onboarding and PIN lock

**Files:**
- Create: `mobile/src/contexts/AuthContext.tsx`
- Create: `mobile/src/screens/auth/OnboardingScreen.tsx`
- Create: `mobile/src/screens/auth/PinLoginScreen.tsx`
- Create: `mobile/src/screens/MembersScreen.tsx` (placeholder — replaced fully in Task 3)
- Create: `mobile/src/screens/EventsScreen.tsx` (placeholder — replaced fully in Task 4)
- Create: `mobile/src/screens/BalanceScreen.tsx` (placeholder — replaced fully in Task 5)
- Create: `mobile/src/screens/ReportsScreen.tsx` (placeholder — replaced fully in Task 6)
- Create: `mobile/src/screens/SettingsScreen.tsx` (placeholder — replaced fully in Task 7)
- Create: `mobile/App.tsx`

**Interfaces:**
- Consumes: `apiRequest`, `setUnauthorizedHandler` (Task 1); `getToken`, `setToken`, `clearToken` (Task 1); `colors` (Task 1).
- Produces: `AuthProvider`, `useAuth(): { isLoading: boolean; isSetUp: boolean; isAuthenticated: boolean; markSetUp: () => void; login: (token: string) => Promise<void>; logout: () => Promise<void> }` from `mobile/src/contexts/AuthContext.tsx` — consumed by `App.tsx` and by `SettingsScreen` (Task 7, for the "change PIN" flow's re-login).
- Produces: the five bottom-tab screens as placeholders (`<Text>` stub), so `App.tsx`'s tab navigator has real components to mount — each later task replaces its placeholder file's contents entirely.

The placeholder screens exist only so `App.tsx` compiles and the tab navigator can be manually verified end-to-end in this task, before any screen has real functionality.

- [ ] **Step 1: Create `mobile/src/contexts/AuthContext.tsx`**

```tsx
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
```

- [ ] **Step 2: Create `mobile/src/screens/auth/OnboardingScreen.tsx`**

```tsx
import { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, Alert } from "react-native";
import { apiRequest } from "../../lib/api";
import { useAuth } from "../../contexts/AuthContext";
import { colors } from "../../theme";

// First-ever launch: set the starting balance, then set the PIN that will
// protect the app from then on. Two steps in one screen since both are
// required before the account can be created.
export default function OnboardingScreen() {
  const { login, markSetUp } = useAuth();
  const [openingBalance, setOpeningBalance] = useState("");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    const balance = parseFloat(openingBalance || "0");
    if (Number.isNaN(balance) || balance < 0) {
      Alert.alert("Invalid amount", "Enter a valid opening balance (0 or more).");
      return;
    }
    if (pin.length < 4) {
      Alert.alert("PIN too short", "Choose a PIN with at least 4 digits.");
      return;
    }
    if (pin !== confirmPin) {
      Alert.alert("PINs don't match", "Re-enter the same PIN in both fields.");
      return;
    }

    setIsSubmitting(true);
    try {
      const { token } = await apiRequest<{ token: string }>("/api/auth/setup", {
        method: "POST",
        body: JSON.stringify({ pin }),
      });
      await login(token);
      await apiRequest("/api/settings", { method: "PUT", body: JSON.stringify({ openingBalance: balance }) });
      markSetUp();
    } catch (error: any) {
      Alert.alert("Setup failed", error.message || "Something went wrong");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.container}>
      <Text style={styles.title}>Welcome</Text>
      <Text style={styles.subtitle}>Let's set up the fellowship's opening balance and your PIN.</Text>

      <Text style={styles.label}>Opening balance (₹)</Text>
      <TextInput
        style={styles.input}
        value={openingBalance}
        onChangeText={setOpeningBalance}
        placeholder="0.00"
        keyboardType="decimal-pad"
      />

      <Text style={styles.label}>Choose a PIN (4+ digits)</Text>
      <TextInput
        style={styles.input}
        value={pin}
        onChangeText={setPin}
        placeholder="****"
        secureTextEntry
        keyboardType="number-pad"
      />

      <Text style={styles.label}>Confirm PIN</Text>
      <TextInput
        style={styles.input}
        value={confirmPin}
        onChangeText={setConfirmPin}
        placeholder="****"
        secureTextEntry
        keyboardType="number-pad"
      />

      <TouchableOpacity style={styles.button} onPress={handleSubmit} disabled={isSubmitting}>
        <Text style={styles.buttonText}>{isSubmitting ? "Setting up..." : "Get Started"}</Text>
      </TouchableOpacity>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: 24, justifyContent: "center" },
  title: { fontSize: 26, fontWeight: "700", color: colors.textPrimary, marginBottom: 8 },
  subtitle: { fontSize: 14, color: colors.textSecondary, marginBottom: 24 },
  label: { fontSize: 13, fontWeight: "600", color: colors.textPrimary, marginBottom: 6, marginTop: 12 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: colors.surface,
    color: colors.textPrimary,
  },
  button: {
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 28,
  },
  buttonText: { color: colors.white, fontSize: 16, fontWeight: "600" },
});
```

- [ ] **Step 3: Create `mobile/src/screens/auth/PinLoginScreen.tsx`**

```tsx
import { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from "react-native";
import { apiRequest } from "../../lib/api";
import { useAuth } from "../../contexts/AuthContext";
import { colors } from "../../theme";

export default function PinLoginScreen() {
  const { login } = useAuth();
  const [pin, setPin] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleUnlock = async () => {
    if (pin.length < 4) return;
    setIsSubmitting(true);
    try {
      const { token } = await apiRequest<{ token: string }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ pin }),
      });
      await login(token);
    } catch (error: any) {
      Alert.alert("Incorrect PIN", error.message || "Try again");
      setPin("");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>CSI-WF Treasurer</Text>
      <Text style={styles.subtitle}>Enter your PIN to continue</Text>
      <TextInput
        style={styles.input}
        value={pin}
        onChangeText={setPin}
        placeholder="****"
        secureTextEntry
        keyboardType="number-pad"
        autoFocus
      />
      <TouchableOpacity style={styles.button} onPress={handleUnlock} disabled={isSubmitting}>
        <Text style={styles.buttonText}>{isSubmitting ? "Checking..." : "Unlock"}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: 24, justifyContent: "center" },
  title: { fontSize: 24, fontWeight: "700", color: colors.textPrimary, textAlign: "center", marginBottom: 4 },
  subtitle: { fontSize: 14, color: colors.textSecondary, textAlign: "center", marginBottom: 24 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 14,
    fontSize: 20,
    textAlign: "center",
    letterSpacing: 8,
    backgroundColor: colors.surface,
    color: colors.textPrimary,
  },
  button: { backgroundColor: colors.primary, borderRadius: 8, paddingVertical: 14, alignItems: "center", marginTop: 20 },
  buttonText: { color: colors.white, fontSize: 16, fontWeight: "600" },
});
```

- [ ] **Step 4: Create placeholder tab screens**

```tsx
// mobile/src/screens/MembersScreen.tsx
import { View, Text } from "react-native";
export default function MembersScreen() {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
      <Text>Members (coming in Task 3)</Text>
    </View>
  );
}
```

```tsx
// mobile/src/screens/EventsScreen.tsx
import { View, Text } from "react-native";
export default function EventsScreen() {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
      <Text>Events (coming in Task 4)</Text>
    </View>
  );
}
```

```tsx
// mobile/src/screens/BalanceScreen.tsx
import { View, Text } from "react-native";
export default function BalanceScreen() {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
      <Text>Balance (coming in Task 5)</Text>
    </View>
  );
}
```

```tsx
// mobile/src/screens/ReportsScreen.tsx
import { View, Text } from "react-native";
export default function ReportsScreen() {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
      <Text>Reports (coming in Task 6)</Text>
    </View>
  );
}
```

```tsx
// mobile/src/screens/SettingsScreen.tsx
import { View, Text } from "react-native";
export default function SettingsScreen() {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
      <Text>Settings (coming in Task 7)</Text>
    </View>
  );
}
```

- [ ] **Step 5: Create `mobile/App.tsx`**

```tsx
import "react-native-gesture-handler";
import { NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StatusBar } from "expo-status-bar";
import Ionicons from "@expo/vector-icons/Ionicons";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { View, ActivityIndicator } from "react-native";

import MembersScreen from "./src/screens/MembersScreen";
import EventsScreen from "./src/screens/EventsScreen";
import BalanceScreen from "./src/screens/BalanceScreen";
import ReportsScreen from "./src/screens/ReportsScreen";
import SettingsScreen from "./src/screens/SettingsScreen";
import OnboardingScreen from "./src/screens/auth/OnboardingScreen";
import PinLoginScreen from "./src/screens/auth/PinLoginScreen";
import { AuthProvider, useAuth } from "./src/contexts/AuthContext";
import { colors } from "./src/theme";

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 1000 * 30, retry: 1 } },
});

export type TabParamList = {
  Members: undefined;
  Events: undefined;
  Balance: undefined;
  Reports: undefined;
  Settings: undefined;
};

const Tab = createBottomTabNavigator<TabParamList>();

function TabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ color, size }) => {
          let iconName: keyof typeof Ionicons.glyphMap = "ellipse";
          if (route.name === "Members") iconName = "people";
          else if (route.name === "Events") iconName = "calendar";
          else if (route.name === "Balance") iconName = "wallet";
          else if (route.name === "Reports") iconName = "document-text";
          else if (route.name === "Settings") iconName = "settings";
          return <Ionicons name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.textPrimary,
      })}
    >
      <Tab.Screen name="Members" component={MembersScreen} />
      <Tab.Screen name="Events" component={EventsScreen} />
      <Tab.Screen name="Balance" component={BalanceScreen} />
      <Tab.Screen name="Reports" component={ReportsScreen} />
      <Tab.Screen name="Settings" component={SettingsScreen} />
    </Tab.Navigator>
  );
}

function AppContent() {
  const { isLoading, isSetUp, isAuthenticated } = useAuth();

  if (isLoading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!isSetUp) return <OnboardingScreen />;
  if (!isAuthenticated) return <PinLoginScreen />;

  return (
    <NavigationContainer>
      <TabNavigator />
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <GestureHandlerRootView style={{ flex: 1 }}>
          <SafeAreaProvider>
            <AppContent />
            <StatusBar style="dark" />
          </SafeAreaProvider>
        </GestureHandlerRootView>
      </AuthProvider>
    </QueryClientProvider>
  );
}
```

- [ ] **Step 6: Typecheck**

```bash
cd mobile && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 7: Manual verification**

With the backend running (`npm run dev` in the repo root, with `DATABASE_URL`/`JWT_SECRET` set) and `mobile/.env` pointing `EXPO_PUBLIC_API_URL` at it:

```bash
cd mobile && npx expo start
```

Open in Expo Go or a simulator. Expected: on a fresh database, the Onboarding screen appears; enter an opening balance and a 4+ digit PIN twice, tap "Get Started" — the five-tab shell appears (Members/Events/Balance/Reports/Settings, each showing its placeholder text). Close and reopen the app: the PIN-login screen appears instead of onboarding; entering the correct PIN unlocks the tabs, entering a wrong PIN shows an alert.

- [ ] **Step 8: Commit**

```bash
git add mobile/App.tsx mobile/src/contexts mobile/src/screens
git commit -m "feat: add PIN auth flow and tab navigation shell"
```

---

### Task 3: Members screen

**Files:**
- Create: `mobile/src/components/MemberForm.tsx`
- Modify: `mobile/src/screens/MembersScreen.tsx` (replaces the Task 2 placeholder)

**Interfaces:**
- Consumes: `apiRequest` (Task 1); `Member`, `MemberWithAttributes`, `AttributeDefinition` (Task 1); `colors` (Task 1).
- Produces: `MemberForm` component used only within `MembersScreen` in this task (not reused elsewhere).

- [ ] **Step 1: Create `mobile/src/components/MemberForm.tsx`**

```tsx
import { useState, useEffect } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Modal, Alert } from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../lib/api";
import type { AttributeDefinition, MemberWithAttributes } from "../lib/types";
import { colors } from "../theme";

type Props = {
  visible: boolean;
  onClose: () => void;
  member?: MemberWithAttributes | null;
};

export default function MemberForm({ visible, onClose, member }: Props) {
  const queryClient = useQueryClient();
  const isEditing = !!member;

  const { data: attributeDefs = [] } = useQuery({
    queryKey: ["attributes"],
    queryFn: () => apiRequest<AttributeDefinition[]>("/api/attributes"),
  });

  const [name, setName] = useState("");
  const [santhaNumber, setSanthaNumber] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [age, setAge] = useState("");
  const [customValues, setCustomValues] = useState<Record<string, string>>({});

  useEffect(() => {
    if (visible) {
      setName(member?.name || "");
      setSanthaNumber(member?.santhaNumber || "");
      setPhone(member?.phone || "");
      setAddress(member?.address || "");
      setAge(member?.age ? String(member.age) : "");
      const values: Record<string, string> = {};
      for (const attr of member?.attributes || []) {
        values[attr.attributeKey] = attr.value || "";
      }
      setCustomValues(values);
    }
  }, [visible, member]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name: name.trim(),
        santhaNumber: santhaNumber.trim(),
        phone: phone.trim() || null,
        address: address.trim() || null,
        age: age ? Number(age) : null,
      };
      const saved = isEditing
        ? await apiRequest<{ id: number }>(`/api/members/${member!.id}`, {
            method: "PATCH",
            body: JSON.stringify(payload),
          })
        : await apiRequest<{ id: number }>("/api/members", { method: "POST", body: JSON.stringify(payload) });

      for (const attr of attributeDefs) {
        const value = customValues[attr.key];
        if (value !== undefined && value !== "") {
          await apiRequest(`/api/members/${saved.id}/attributes/${attr.key}`, {
            method: "PUT",
            body: JSON.stringify({ value }),
          });
        }
      }
      return saved;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["members"] });
      onClose();
    },
    onError: (error: any) => {
      Alert.alert("Could not save member", error.message || "Something went wrong");
    },
  });

  const handleSubmit = () => {
    if (!name.trim() || !santhaNumber.trim()) {
      Alert.alert("Missing details", "Name and santha number are required.");
      return;
    }
    saveMutation.mutate();
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <ScrollView style={styles.container} contentContainerStyle={{ padding: 20 }}>
        <Text style={styles.title}>{isEditing ? "Edit Member" : "Add Member"}</Text>

        <Text style={styles.label}>Name *</Text>
        <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Full name" />

        <Text style={styles.label}>Santha Number *</Text>
        <TextInput style={styles.input} value={santhaNumber} onChangeText={setSanthaNumber} placeholder="e.g. SW-101" />

        <Text style={styles.label}>Phone</Text>
        <TextInput style={styles.input} value={phone} onChangeText={setPhone} placeholder="Phone number" keyboardType="phone-pad" />

        <Text style={styles.label}>Address</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          value={address}
          onChangeText={setAddress}
          placeholder="Address"
          multiline
          numberOfLines={3}
        />

        <Text style={styles.label}>Age</Text>
        <TextInput style={styles.input} value={age} onChangeText={setAge} placeholder="Age" keyboardType="number-pad" />

        {attributeDefs.map((attr) => (
          <View key={attr.key}>
            <Text style={styles.label}>{attr.label}</Text>
            <TextInput
              style={styles.input}
              value={customValues[attr.key] || ""}
              onChangeText={(text) => setCustomValues((prev) => ({ ...prev, [attr.key]: text }))}
              placeholder={attr.label}
              keyboardType={attr.type === "number" ? "number-pad" : "default"}
            />
          </View>
        ))}

        <View style={styles.row}>
          <TouchableOpacity style={[styles.button, styles.secondaryButton]} onPress={onClose}>
            <Text style={styles.secondaryButtonText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.button} onPress={handleSubmit} disabled={saveMutation.isPending}>
            <Text style={styles.buttonText}>{saveMutation.isPending ? "Saving..." : "Save"}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  title: { fontSize: 20, fontWeight: "700", color: colors.textPrimary, marginBottom: 16 },
  label: { fontSize: 13, fontWeight: "600", color: colors.textPrimary, marginBottom: 6, marginTop: 12 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    backgroundColor: colors.surface,
    color: colors.textPrimary,
  },
  textArea: { minHeight: 70, textAlignVertical: "top" },
  row: { flexDirection: "row", gap: 12, marginTop: 28 },
  button: { flex: 1, backgroundColor: colors.primary, borderRadius: 8, paddingVertical: 14, alignItems: "center" },
  buttonText: { color: colors.white, fontSize: 15, fontWeight: "600" },
  secondaryButton: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  secondaryButtonText: { color: colors.textPrimary, fontSize: 15, fontWeight: "600" },
});
```

- [ ] **Step 2: Replace `mobile/src/screens/MembersScreen.tsx`**

```tsx
import { useState } from "react";
import { View, Text, TextInput, FlatList, TouchableOpacity, StyleSheet, Alert } from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../lib/api";
import type { Member, MemberWithAttributes } from "../lib/types";
import { colors } from "../theme";
import MemberForm from "../components/MemberForm";

export default function MembersScreen() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [formVisible, setFormVisible] = useState(false);
  const [editingMember, setEditingMember] = useState<MemberWithAttributes | null>(null);

  const { data: members = [], isLoading } = useQuery({
    queryKey: ["members", search],
    queryFn: () => apiRequest<Member[]>(`/api/members${search ? `?search=${encodeURIComponent(search)}` : ""}`),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest(`/api/members/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["members"] }),
    onError: (error: any) => Alert.alert("Could not delete member", error.message),
  });

  const openEdit = async (member: Member) => {
    const full = await apiRequest<MemberWithAttributes>(`/api/members/${member.id}`);
    setEditingMember(full);
    setFormVisible(true);
  };

  const confirmDelete = (member: Member) => {
    Alert.alert("Delete member", `Remove ${member.name}? This cannot be undone.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => deleteMutation.mutate(member.id) },
    ]);
  };

  return (
    <View style={styles.container}>
      <View style={styles.searchRow}>
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Search by name or santha number"
        />
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => {
            setEditingMember(null);
            setFormVisible(true);
          }}
        >
          <Text style={styles.addButtonText}>+ Add</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={members}
        keyExtractor={(m) => String(m.id)}
        refreshing={isLoading}
        onRefresh={() => queryClient.invalidateQueries({ queryKey: ["members"] })}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.card} onPress={() => openEdit(item)} onLongPress={() => confirmDelete(item)}>
            <Text style={styles.memberName}>{item.name}</Text>
            <Text style={styles.memberMeta}>Santha No: {item.santhaNumber}</Text>
            {item.phone ? <Text style={styles.memberMeta}>{item.phone}</Text> : null}
          </TouchableOpacity>
        )}
        ListEmptyComponent={<Text style={styles.emptyText}>No members yet. Tap "+ Add" to create one.</Text>}
        contentContainerStyle={{ padding: 16 }}
      />

      <MemberForm visible={formVisible} onClose={() => setFormVisible(false)} member={editingMember} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  searchRow: { flexDirection: "row", gap: 8, padding: 16, paddingBottom: 0 },
  searchInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 10,
    backgroundColor: colors.surface,
  },
  addButton: { backgroundColor: colors.primary, borderRadius: 8, paddingHorizontal: 16, justifyContent: "center" },
  addButtonText: { color: colors.white, fontWeight: "600" },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  memberName: { fontSize: 16, fontWeight: "700", color: colors.textPrimary },
  memberMeta: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  emptyText: { textAlign: "center", color: colors.textMuted, marginTop: 40 },
});
```

- [ ] **Step 3: Typecheck**

```bash
cd mobile && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Manual verification (golden path)**

With the backend and app running: on the Members tab, tap "+ Add", enter a name (try a Tamil name to confirm Unicode input works, e.g. "கிருபா") and a santha number, save — the new member appears in the list. Tap the member to edit, change the phone number, save — the change persists. Long-press the member, confirm delete — it disappears from the list. Search by a partial name and by a partial santha number — the list filters correctly in both cases. On Settings (Task 7) once a custom attribute is added, reopen the Add Member form and confirm the new field appears and saves correctly.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/components/MemberForm.tsx mobile/src/screens/MembersScreen.tsx
git commit -m "feat: add members screen with CRUD and custom attributes"
```

---

### Task 4: Events and expenses screens

**Files:**
- Create: `mobile/src/components/ExpenseForm.tsx`
- Modify: `mobile/src/screens/EventsScreen.tsx` (replaces the Task 2 placeholder)
- Create: `mobile/src/screens/EventDetailScreen.tsx`
- Modify: `mobile/App.tsx` (wrap the Events tab in a native stack so `EventDetailScreen` is reachable)

**Interfaces:**
- Consumes: `apiRequest`, `uploadReceipt` (Task 1); `EventSummary`, `EventDetail`, `Expense`, `ExpenseStatus` (Task 1); `formatCurrency`, `todayString` (Task 1); `colors` (Task 1).
- Produces: `ExpenseForm` component — takes `eventId: number | null` so it's reused as-is by the Balance screen's General Expenses section in Task 5.

- [ ] **Step 1: Create `mobile/src/components/ExpenseForm.tsx`**

```tsx
import { useState, useEffect } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Modal, Alert, Image } from "react-native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as ImagePicker from "expo-image-picker";
import { apiRequest, uploadReceipt } from "../lib/api";
import type { Expense, ExpenseStatus } from "../lib/types";
import { todayString } from "../lib/format";
import { colors } from "../theme";

type Props = {
  visible: boolean;
  onClose: () => void;
  eventId: number | null;
  expense?: Expense | null;
  invalidateKey: unknown[];
};

export default function ExpenseForm({ visible, onClose, eventId, expense, invalidateKey }: Props) {
  const queryClient = useQueryClient();
  const isEditing = !!expense;

  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayString());
  const [status, setStatus] = useState<ExpenseStatus>("pending");
  const [receiptUri, setReceiptUri] = useState<string | null>(null);
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    if (visible) {
      setDescription(expense?.description || "");
      setAmount(expense ? String(expense.amount) : "");
      setDate(expense?.date || todayString());
      setStatus(expense?.status || "pending");
      setReceiptUri(null);
      setReceiptUrl(expense?.receiptPhotoUrl || null);
    }
  }, [visible, expense]);

  const pickReceipt = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.8 });
    if (result.canceled || !result.assets[0]) return;
    setReceiptUri(result.assets[0].uri);
    setIsUploading(true);
    try {
      const url = await uploadReceipt(result.assets[0].uri);
      setReceiptUrl(url);
    } catch (error: any) {
      Alert.alert("Upload failed", error.message || "Could not upload the receipt photo");
      setReceiptUri(null);
    } finally {
      setIsUploading(false);
    }
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        eventId,
        description: description.trim(),
        amount: parseFloat(amount),
        receiptPhotoUrl: receiptUrl,
        status,
        date,
      };
      if (isEditing) {
        return apiRequest(`/api/expenses/${expense!.id}`, { method: "PATCH", body: JSON.stringify(payload) });
      }
      return apiRequest("/api/expenses", { method: "POST", body: JSON.stringify(payload) });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: invalidateKey });
      onClose();
    },
    onError: (error: any) => Alert.alert("Could not save expense", error.message || "Something went wrong"),
  });

  const handleSubmit = () => {
    if (!description.trim()) {
      Alert.alert("Missing description", "Enter what this expense was for.");
      return;
    }
    const parsedAmount = parseFloat(amount);
    if (Number.isNaN(parsedAmount) || parsedAmount <= 0) {
      Alert.alert("Invalid amount", "Enter an amount greater than 0.");
      return;
    }
    saveMutation.mutate();
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <ScrollView style={styles.container} contentContainerStyle={{ padding: 20 }}>
        <Text style={styles.title}>{isEditing ? "Edit Expense" : "Add Expense"}</Text>

        <Text style={styles.label}>Reason / Description *</Text>
        <TextInput style={styles.input} value={description} onChangeText={setDescription} placeholder="What was this for?" />

        <Text style={styles.label}>Amount (₹) *</Text>
        <TextInput style={styles.input} value={amount} onChangeText={setAmount} placeholder="0.00" keyboardType="decimal-pad" />

        <Text style={styles.label}>Date (YYYY-MM-DD)</Text>
        <TextInput style={styles.input} value={date} onChangeText={setDate} placeholder="2026-08-29" />

        <Text style={styles.label}>Status</Text>
        <View style={styles.statusRow}>
          {(["pending", "paid"] as ExpenseStatus[]).map((s) => (
            <TouchableOpacity
              key={s}
              style={[styles.statusOption, status === s && styles.statusOptionActive]}
              onPress={() => setStatus(s)}
            >
              <Text style={[styles.statusOptionText, status === s && styles.statusOptionTextActive]}>
                {s === "paid" ? "Paid" : "Pending"}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>Receipt photo</Text>
        {receiptUri || receiptUrl ? (
          <Image source={{ uri: receiptUri || receiptUrl! }} style={styles.receiptPreview} />
        ) : null}
        <TouchableOpacity style={styles.photoButton} onPress={pickReceipt} disabled={isUploading}>
          <Text style={styles.photoButtonText}>{isUploading ? "Uploading..." : "Choose Photo"}</Text>
        </TouchableOpacity>

        <View style={styles.row}>
          <TouchableOpacity style={[styles.button, styles.secondaryButton]} onPress={onClose}>
            <Text style={styles.secondaryButtonText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.button} onPress={handleSubmit} disabled={saveMutation.isPending || isUploading}>
            <Text style={styles.buttonText}>{saveMutation.isPending ? "Saving..." : "Save"}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  title: { fontSize: 20, fontWeight: "700", color: colors.textPrimary, marginBottom: 16 },
  label: { fontSize: 13, fontWeight: "600", color: colors.textPrimary, marginBottom: 6, marginTop: 12 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    backgroundColor: colors.surface,
    color: colors.textPrimary,
  },
  statusRow: { flexDirection: "row", gap: 10 },
  statusOption: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: "center",
    backgroundColor: colors.surface,
  },
  statusOptionActive: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  statusOptionText: { color: colors.textSecondary, fontWeight: "600" },
  statusOptionTextActive: { color: colors.primary },
  receiptPreview: { width: 120, height: 120, borderRadius: 8, marginBottom: 10 },
  photoButton: {
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: "dashed",
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: "center",
    backgroundColor: colors.surface,
  },
  photoButtonText: { color: colors.textSecondary, fontWeight: "600" },
  row: { flexDirection: "row", gap: 12, marginTop: 28 },
  button: { flex: 1, backgroundColor: colors.primary, borderRadius: 8, paddingVertical: 14, alignItems: "center" },
  buttonText: { color: colors.white, fontSize: 15, fontWeight: "600" },
  secondaryButton: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  secondaryButtonText: { color: colors.textPrimary, fontSize: 15, fontWeight: "600" },
});
```

- [ ] **Step 2: Create `mobile/src/screens/EventDetailScreen.tsx`**

```tsx
import { useState } from "react";
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Alert } from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { apiRequest } from "../lib/api";
import type { Expense, EventDetail } from "../lib/types";
import { formatCurrency } from "../lib/format";
import { colors } from "../theme";
import ExpenseForm from "../components/ExpenseForm";
import type { EventsStackParamList } from "../navigation/types";

type Props = NativeStackScreenProps<EventsStackParamList, "EventDetail">;

export default function EventDetailScreen({ route }: Props) {
  const { eventId } = route.params;
  const queryClient = useQueryClient();
  const [formVisible, setFormVisible] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);

  const { data: event } = useQuery({
    queryKey: ["event", eventId],
    queryFn: () => apiRequest<EventDetail>(`/api/events/${eventId}`),
  });

  const { data: expenses = [], isLoading } = useQuery({
    queryKey: ["expenses", "event", eventId],
    queryFn: () => apiRequest<Expense[]>(`/api/expenses?eventId=${eventId}`),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest(`/api/expenses/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["expenses", "event", eventId] }),
    onError: (error: any) => Alert.alert("Could not delete expense", error.message),
  });

  const totalPaid = expenses.filter((e) => e.status === "paid").reduce((sum, e) => sum + e.amount, 0);
  const totalPending = expenses.filter((e) => e.status === "pending").reduce((sum, e) => sum + e.amount, 0);

  const confirmDelete = (expense: Expense) => {
    Alert.alert("Delete expense", `Remove "${expense.description}"?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => deleteMutation.mutate(expense.id) },
    ]);
  };

  return (
    <View style={styles.container}>
      <View style={styles.summaryCard}>
        {event?.details ? <Text style={styles.eventDetails}>{event.details}</Text> : null}
        <Text style={styles.summaryLine}>Paid: {formatCurrency(totalPaid)}</Text>
        <Text style={styles.summaryLineMuted}>Pending: {formatCurrency(totalPending)}</Text>
      </View>

      <FlatList
        data={expenses}
        keyExtractor={(e) => String(e.id)}
        refreshing={isLoading}
        onRefresh={() => queryClient.invalidateQueries({ queryKey: ["expenses", "event", eventId] })}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            onPress={() => {
              setEditingExpense(item);
              setFormVisible(true);
            }}
            onLongPress={() => confirmDelete(item)}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.expenseDescription}>{item.description}</Text>
              <Text style={styles.expenseMeta}>{item.date}</Text>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={styles.expenseAmount}>{formatCurrency(item.amount)}</Text>
              <Text style={[styles.badge, item.status === "paid" ? styles.badgePaid : styles.badgePending]}>
                {item.status}
              </Text>
            </View>
          </TouchableOpacity>
        )}
        ListEmptyComponent={<Text style={styles.emptyText}>No expenses yet for this event.</Text>}
        contentContainerStyle={{ padding: 16 }}
      />

      <TouchableOpacity
        style={styles.fab}
        onPress={() => {
          setEditingExpense(null);
          setFormVisible(true);
        }}
      >
        <Text style={styles.fabText}>+ Add Expense</Text>
      </TouchableOpacity>

      <ExpenseForm
        visible={formVisible}
        onClose={() => setFormVisible(false)}
        eventId={eventId}
        expense={editingExpense}
        invalidateKey={["expenses", "event", eventId]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  summaryCard: { backgroundColor: colors.surface, margin: 16, marginBottom: 0, padding: 16, borderRadius: 10, borderWidth: 1, borderColor: colors.border },
  eventDetails: { color: colors.textSecondary, marginBottom: 8 },
  summaryLine: { fontSize: 15, fontWeight: "700", color: colors.success },
  summaryLineMuted: { fontSize: 13, color: colors.warning, marginTop: 2 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  expenseDescription: { fontSize: 15, fontWeight: "600", color: colors.textPrimary },
  expenseMeta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  expenseAmount: { fontSize: 15, fontWeight: "700", color: colors.textPrimary },
  badge: { fontSize: 11, fontWeight: "700", marginTop: 4, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, overflow: "hidden" },
  badgePaid: { backgroundColor: colors.successSoft, color: colors.success },
  badgePending: { backgroundColor: colors.warningSoft, color: colors.warning },
  emptyText: { textAlign: "center", color: colors.textMuted, marginTop: 40 },
  fab: {
    position: "absolute",
    bottom: 20,
    left: 16,
    right: 16,
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
  },
  fabText: { color: colors.white, fontWeight: "700" },
});
```

- [ ] **Step 3: Create `mobile/src/navigation/types.ts`**

```ts
export type EventsStackParamList = {
  EventsList: undefined;
  EventDetail: { eventId: number };
};
```

- [ ] **Step 4: Replace `mobile/src/screens/EventsScreen.tsx`**

```tsx
import { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, Alert, Modal } from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { apiRequest } from "../lib/api";
import type { EventSummary } from "../lib/types";
import { formatCurrency } from "../lib/format";
import { colors } from "../theme";
import type { EventsStackParamList } from "../navigation/types";

type Props = NativeStackScreenProps<EventsStackParamList, "EventsList">;

function CreateEventModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [details, setDetails] = useState("");

  const createMutation = useMutation({
    mutationFn: () => apiRequest("/api/events", { method: "POST", body: JSON.stringify({ name: name.trim(), details: details.trim() || null }) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["events"] });
      setName("");
      setDetails("");
      onClose();
    },
    onError: (error: any) => Alert.alert("Could not create event", error.message),
  });

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalContainer}>
        <Text style={styles.title}>New Event</Text>
        <Text style={styles.label}>Event name *</Text>
        <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="e.g. Annual Meet" />
        <Text style={styles.label}>Details</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          value={details}
          onChangeText={setDetails}
          placeholder="Details"
          multiline
          numberOfLines={3}
        />
        <View style={styles.row}>
          <TouchableOpacity style={[styles.button, styles.secondaryButton]} onPress={onClose}>
            <Text style={styles.secondaryButtonText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.button}
            disabled={createMutation.isPending}
            onPress={() => {
              if (!name.trim()) {
                Alert.alert("Missing name", "Enter an event name.");
                return;
              }
              createMutation.mutate();
            }}
          >
            <Text style={styles.buttonText}>{createMutation.isPending ? "Creating..." : "Create"}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

export default function EventsScreen({ navigation }: Props) {
  const queryClient = useQueryClient();
  const [createVisible, setCreateVisible] = useState(false);

  const { data: events = [], isLoading } = useQuery({
    queryKey: ["events"],
    queryFn: () => apiRequest<EventSummary[]>("/api/events"),
  });

  return (
    <View style={styles.container}>
      <FlatList
        data={events}
        keyExtractor={(e) => String(e.id)}
        refreshing={isLoading}
        onRefresh={() => queryClient.invalidateQueries({ queryKey: ["events"] })}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.card} onPress={() => navigation.navigate("EventDetail", { eventId: item.id })}>
            <Text style={styles.eventName}>{item.name}</Text>
            <Text style={styles.eventTotal}>Spent: {formatCurrency(item.totalPaid)}</Text>
          </TouchableOpacity>
        )}
        ListEmptyComponent={<Text style={styles.emptyText}>No events yet. Tap "+ New Event" to create one.</Text>}
        contentContainerStyle={{ padding: 16 }}
      />
      <TouchableOpacity style={styles.fab} onPress={() => setCreateVisible(true)}>
        <Text style={styles.fabText}>+ New Event</Text>
      </TouchableOpacity>
      <CreateEventModal visible={createVisible} onClose={() => setCreateVisible(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 10,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  eventName: { fontSize: 16, fontWeight: "700", color: colors.textPrimary },
  eventTotal: { fontSize: 13, color: colors.textSecondary, marginTop: 4 },
  emptyText: { textAlign: "center", color: colors.textMuted, marginTop: 40 },
  fab: { position: "absolute", bottom: 20, left: 16, right: 16, backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 14, alignItems: "center" },
  fabText: { color: colors.white, fontWeight: "700" },
  modalContainer: { flex: 1, backgroundColor: colors.background, padding: 20 },
  title: { fontSize: 20, fontWeight: "700", color: colors.textPrimary, marginBottom: 16 },
  label: { fontSize: 13, fontWeight: "600", color: colors.textPrimary, marginBottom: 6, marginTop: 12 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 12, fontSize: 15, backgroundColor: colors.surface, color: colors.textPrimary },
  textArea: { minHeight: 70, textAlignVertical: "top" },
  row: { flexDirection: "row", gap: 12, marginTop: 28 },
  button: { flex: 1, backgroundColor: colors.primary, borderRadius: 8, paddingVertical: 14, alignItems: "center" },
  buttonText: { color: colors.white, fontSize: 15, fontWeight: "600" },
  secondaryButton: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  secondaryButtonText: { color: colors.textPrimary, fontSize: 15, fontWeight: "600" },
});
```

- [ ] **Step 5: Modify `mobile/App.tsx`** — wrap Events in a native stack so `EventDetailScreen` is reachable

Replace the `import EventsScreen from "./src/screens/EventsScreen";` line and the `<Tab.Screen name="Events" ... />` line with:

```tsx
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import EventsScreen from "./src/screens/EventsScreen";
import EventDetailScreen from "./src/screens/EventDetailScreen";
import type { EventsStackParamList } from "./src/navigation/types";

const EventsStack = createNativeStackNavigator<EventsStackParamList>();

function EventsStackNavigator() {
  return (
    <EventsStack.Navigator screenOptions={{ headerStyle: { backgroundColor: colors.background }, headerTintColor: colors.textPrimary }}>
      <EventsStack.Screen name="EventsList" component={EventsScreen} options={{ title: "Events" }} />
      <EventsStack.Screen name="EventDetail" component={EventDetailScreen} options={{ title: "Event" }} />
    </EventsStack.Navigator>
  );
}
```

And in `TabNavigator`, replace `<Tab.Screen name="Events" component={EventsScreen} />` with `<Tab.Screen name="Events" component={EventsStackNavigator} options={{ headerShown: false }} />`.

- [ ] **Step 6: Typecheck**

```bash
cd mobile && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 7: Manual verification (golden path)**

Tap "+ New Event", create "Annual Meet" — it appears in the list with "Spent: ₹0.00". Tap it, tap "+ Add Expense", enter a description, amount, choose a receipt photo from the gallery, set status to "Paid", save — it appears in the expense list and the event's "Spent" total updates on the Events list. Add a second expense left as "Pending" — confirm it shows the pending badge and does NOT count toward "Spent". Edit an expense's amount, save — totals update. Long-press an expense, confirm delete — it's removed and totals update.

- [ ] **Step 8: Commit**

```bash
git add mobile/src/components/ExpenseForm.tsx mobile/src/screens/EventsScreen.tsx mobile/src/screens/EventDetailScreen.tsx mobile/src/navigation mobile/App.tsx
git commit -m "feat: add events and expenses screens"
```

---

### Task 5: Balance screen (contributions + general expenses)

**Files:**
- Modify: `mobile/src/screens/BalanceScreen.tsx` (replaces the Task 2 placeholder)
- Create: `mobile/src/components/ContributionForm.tsx`

**Interfaces:**
- Consumes: `apiRequest` (Task 1); `BalanceResponse`, `Member`, `Contribution` (Task 1); `formatCurrency`, `todayString` (Task 1); `colors` (Task 1); `ExpenseForm` (Task 4, reused here with `eventId={null}`).

- [ ] **Step 1: Create `mobile/src/components/ContributionForm.tsx`**

```tsx
import { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Modal, ScrollView, Alert, FlatList } from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../lib/api";
import type { Member } from "../lib/types";
import { todayString } from "../lib/format";
import { colors } from "../theme";

type Props = { visible: boolean; onClose: () => void };

export default function ContributionForm({ visible, onClose }: Props) {
  const queryClient = useQueryClient();
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayString());
  const [note, setNote] = useState("");

  const { data: members = [] } = useQuery({
    queryKey: ["members", ""],
    queryFn: () => apiRequest<Member[]>("/api/members"),
    enabled: visible,
  });

  const saveMutation = useMutation({
    mutationFn: () =>
      apiRequest("/api/contributions", {
        method: "POST",
        body: JSON.stringify({
          memberId: selectedMember!.id,
          amount: parseFloat(amount),
          date,
          note: note.trim() || null,
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["balance"] });
      setSelectedMember(null);
      setAmount("");
      setNote("");
      onClose();
    },
    onError: (error: any) => Alert.alert("Could not save contribution", error.message),
  });

  const handleSubmit = () => {
    if (!selectedMember) {
      Alert.alert("Select a member", "Choose who this contribution is from.");
      return;
    }
    const parsedAmount = parseFloat(amount);
    if (Number.isNaN(parsedAmount) || parsedAmount <= 0) {
      Alert.alert("Invalid amount", "Enter an amount greater than 0.");
      return;
    }
    saveMutation.mutate();
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <ScrollView style={styles.container} contentContainerStyle={{ padding: 20 }}>
        <Text style={styles.title}>Add Contribution</Text>

        <Text style={styles.label}>Member *</Text>
        <TouchableOpacity style={styles.input} onPress={() => setPickerOpen(true)}>
          <Text style={{ color: selectedMember ? colors.textPrimary : colors.textMuted }}>
            {selectedMember ? selectedMember.name : "Select a member"}
          </Text>
        </TouchableOpacity>

        <Text style={styles.label}>Amount (₹) *</Text>
        <TextInput style={styles.input} value={amount} onChangeText={setAmount} placeholder="0.00" keyboardType="decimal-pad" />

        <Text style={styles.label}>Date (YYYY-MM-DD)</Text>
        <TextInput style={styles.input} value={date} onChangeText={setDate} placeholder="2026-08-29" />

        <Text style={styles.label}>Note</Text>
        <TextInput style={styles.input} value={note} onChangeText={setNote} placeholder="Optional note" />

        <View style={styles.row}>
          <TouchableOpacity style={[styles.button, styles.secondaryButton]} onPress={onClose}>
            <Text style={styles.secondaryButtonText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.button} onPress={handleSubmit} disabled={saveMutation.isPending}>
            <Text style={styles.buttonText}>{saveMutation.isPending ? "Saving..." : "Save"}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <Modal visible={pickerOpen} animationType="slide" onRequestClose={() => setPickerOpen(false)}>
        <View style={{ flex: 1, backgroundColor: colors.background, padding: 20 }}>
          <Text style={styles.title}>Select Member</Text>
          <FlatList
            data={members}
            keyExtractor={(m) => String(m.id)}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.memberRow}
                onPress={() => {
                  setSelectedMember(item);
                  setPickerOpen(false);
                }}
              >
                <Text style={{ color: colors.textPrimary }}>{item.name}</Text>
                <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{item.santhaNumber}</Text>
              </TouchableOpacity>
            )}
          />
        </View>
      </Modal>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  title: { fontSize: 20, fontWeight: "700", color: colors.textPrimary, marginBottom: 16 },
  label: { fontSize: 13, fontWeight: "600", color: colors.textPrimary, marginBottom: 6, marginTop: 12 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 12, fontSize: 15, backgroundColor: colors.surface, color: colors.textPrimary, justifyContent: "center" },
  row: { flexDirection: "row", gap: 12, marginTop: 28 },
  button: { flex: 1, backgroundColor: colors.primary, borderRadius: 8, paddingVertical: 14, alignItems: "center" },
  buttonText: { color: colors.white, fontSize: 15, fontWeight: "600" },
  secondaryButton: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  secondaryButtonText: { color: colors.textPrimary, fontSize: 15, fontWeight: "600" },
  memberRow: { padding: 14, borderBottomWidth: 1, borderBottomColor: colors.border },
});
```

- [ ] **Step 2: Replace `mobile/src/screens/BalanceScreen.tsx`**

```tsx
import { useState } from "react";
import { View, Text, FlatList, TouchableOpacity, StyleSheet } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../lib/api";
import type { BalanceResponse, Expense } from "../lib/types";
import { formatCurrency } from "../lib/format";
import { colors } from "../theme";
import ContributionForm from "../components/ContributionForm";
import ExpenseForm from "../components/ExpenseForm";

type Tab = "contributions" | "expenses";

export default function BalanceScreen() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>("expenses");
  const [contributionFormVisible, setContributionFormVisible] = useState(false);
  const [expenseFormVisible, setExpenseFormVisible] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);

  const { data: balance } = useQuery({
    queryKey: ["balance"],
    queryFn: () => apiRequest<BalanceResponse>("/api/balance"),
  });

  const { data: generalExpenses = [] } = useQuery({
    queryKey: ["expenses", "general"],
    queryFn: () => apiRequest<Expense[]>("/api/expenses?eventId=general"),
    enabled: tab === "expenses",
  });

  return (
    <View style={styles.container}>
      <View style={styles.balanceCard}>
        <Text style={styles.balanceLabel}>Current Balance</Text>
        <Text style={styles.balanceValue}>{formatCurrency(balance?.balance ?? 0)}</Text>
        <Text style={styles.balancePending}>Pending expenses: {formatCurrency(balance?.totalPendingExpenses ?? 0)}</Text>
      </View>

      <View style={styles.tabRow}>
        <TouchableOpacity style={[styles.tabButton, tab === "expenses" && styles.tabButtonActive]} onPress={() => setTab("expenses")}>
          <Text style={[styles.tabButtonText, tab === "expenses" && styles.tabButtonTextActive]}>General Expenses</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tabButton, tab === "contributions" && styles.tabButtonActive]} onPress={() => setTab("contributions")}>
          <Text style={[styles.tabButtonText, tab === "contributions" && styles.tabButtonTextActive]}>Contributions</Text>
        </TouchableOpacity>
      </View>

      {tab === "expenses" ? (
        <FlatList
          data={generalExpenses}
          keyExtractor={(e) => String(e.id)}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.card}
              onPress={() => {
                setEditingExpense(item);
                setExpenseFormVisible(true);
              }}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>{item.description}</Text>
                <Text style={styles.cardMeta}>{item.date}</Text>
              </View>
              <Text style={styles.cardAmount}>{formatCurrency(item.amount)}</Text>
            </TouchableOpacity>
          )}
          ListEmptyComponent={<Text style={styles.emptyText}>No general expenses yet.</Text>}
          contentContainerStyle={{ padding: 16 }}
        />
      ) : (
        <RecentContributions />
      )}

      <TouchableOpacity
        style={styles.fab}
        onPress={() => {
          if (tab === "expenses") {
            setEditingExpense(null);
            setExpenseFormVisible(true);
          } else {
            setContributionFormVisible(true);
          }
        }}
      >
        <Text style={styles.fabText}>{tab === "expenses" ? "+ Add Expense" : "+ Add Contribution"}</Text>
      </TouchableOpacity>

      <ExpenseForm
        visible={expenseFormVisible}
        onClose={() => {
          setExpenseFormVisible(false);
          queryClient.invalidateQueries({ queryKey: ["balance"] });
        }}
        eventId={null}
        expense={editingExpense}
        invalidateKey={["expenses", "general"]}
      />
      <ContributionForm visible={contributionFormVisible} onClose={() => setContributionFormVisible(false)} />
    </View>
  );
}

function RecentContributions() {
  const { data: contributions = [] } = useQuery({
    queryKey: ["contributions"],
    queryFn: () => apiRequest<{ id: number; memberId: number; amount: number; date: string; note: string | null }[]>(
      "/api/contributions"
    ),
  });

  return (
    <FlatList
      data={contributions}
      keyExtractor={(c) => String(c.id)}
      renderItem={({ item }) => (
        <View style={styles.card}>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>{item.note || "Contribution"}</Text>
            <Text style={styles.cardMeta}>{item.date}</Text>
          </View>
          <Text style={styles.cardAmount}>{formatCurrency(item.amount)}</Text>
        </View>
      )}
      ListEmptyComponent={<Text style={styles.emptyText}>No contributions logged yet.</Text>}
      contentContainerStyle={{ padding: 16 }}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  balanceCard: { backgroundColor: colors.primary, margin: 16, marginBottom: 0, padding: 20, borderRadius: 12 },
  balanceLabel: { color: colors.primarySoft, fontSize: 13 },
  balanceValue: { color: colors.white, fontSize: 32, fontWeight: "800", marginTop: 4 },
  balancePending: { color: colors.primarySoft, fontSize: 12, marginTop: 8 },
  tabRow: { flexDirection: "row", margin: 16, gap: 8 },
  tabButton: { flex: 1, paddingVertical: 10, alignItems: "center", borderRadius: 8, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  tabButtonActive: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  tabButtonText: { color: colors.textSecondary, fontWeight: "600", fontSize: 13 },
  tabButtonTextActive: { color: colors.primary },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  cardTitle: { fontSize: 15, fontWeight: "600", color: colors.textPrimary },
  cardMeta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  cardAmount: { fontSize: 15, fontWeight: "700", color: colors.textPrimary },
  emptyText: { textAlign: "center", color: colors.textMuted, marginTop: 40 },
  fab: { position: "absolute", bottom: 20, left: 16, right: 16, backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 14, alignItems: "center" },
  fabText: { color: colors.white, fontWeight: "700" },
});
```

- [ ] **Step 3: Typecheck**

```bash
cd mobile && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Manual verification (golden path)**

On the Balance tab, confirm the balance card shows the opening balance set during onboarding. Switch to "Contributions", tap "+ Add Contribution", pick a member, enter an amount, save — the balance card's total increases by that amount. Switch to "General Expenses", tap "+ Add Expense", save it as "Paid" — the balance decreases by that amount; save another as "Pending" — the balance is unaffected but "Pending expenses" increases. Cross-check against the Events tab: an event's paid expenses should also be reflected in this same overall balance (since balance is computed across all expenses, not just general ones).

- [ ] **Step 5: Commit**

```bash
git add mobile/src/screens/BalanceScreen.tsx mobile/src/components/ContributionForm.tsx
git commit -m "feat: add balance screen with contributions and general expenses"
```

---

### Task 6: Reports screen with PDF export

**Files:**
- Modify: `mobile/src/screens/ReportsScreen.tsx` (replaces the Task 2 placeholder)

**Interfaces:**
- Consumes: `apiRequest`, `API_BASE_URL` (Task 1); `getToken` (Task 1); `ReportResponse` (Task 1); `formatCurrency`, `todayString`, `isValidDateString` (Task 1); `colors` (Task 1).

- [ ] **Step 1: Replace `mobile/src/screens/ReportsScreen.tsx`**

```tsx
import { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, Alert } from "react-native";
import { useQuery } from "@tanstack/react-query";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import { apiRequest, API_BASE_URL } from "../lib/api";
import { getToken } from "../lib/authStorage";
import type { ReportResponse } from "../lib/types";
import { formatCurrency, todayString, isValidDateString } from "../lib/format";
import { colors } from "../theme";

function firstOfMonthString(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  return `${yyyy}-${mm}-01`;
}

export default function ReportsScreen() {
  const [from, setFrom] = useState(firstOfMonthString());
  const [to, setTo] = useState(todayString());
  const [isExporting, setIsExporting] = useState(false);

  const rangeValid = isValidDateString(from) && isValidDateString(to);

  const { data: report, refetch, isFetching } = useQuery({
    queryKey: ["reports", from, to],
    queryFn: () => apiRequest<ReportResponse>(`/api/reports?from=${from}&to=${to}`),
    enabled: rangeValid,
  });

  const handleExportPdf = async () => {
    if (!rangeValid) return;
    setIsExporting(true);
    try {
      const token = await getToken();
      const fileUri = `${FileSystem.cacheDirectory}csi-wf-report-${from}-to-${to}.pdf`;
      const result = await FileSystem.downloadAsync(`${API_BASE_URL}/api/reports/pdf?from=${from}&to=${to}`, fileUri, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(result.uri, { mimeType: "application/pdf" });
      } else {
        Alert.alert("Saved", `Report saved to ${result.uri}`);
      }
    } catch (error: any) {
      Alert.alert("Export failed", error.message || "Could not generate the PDF");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16 }}>
      <View style={styles.rangeRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>From</Text>
          <TextInput style={styles.input} value={from} onChangeText={setFrom} placeholder="YYYY-MM-DD" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>To</Text>
          <TextInput style={styles.input} value={to} onChangeText={setTo} placeholder="YYYY-MM-DD" />
        </View>
      </View>
      <TouchableOpacity style={styles.refreshButton} onPress={() => refetch()} disabled={!rangeValid || isFetching}>
        <Text style={styles.refreshButtonText}>{isFetching ? "Loading..." : "Refresh"}</Text>
      </TouchableOpacity>

      {report ? (
        <View style={styles.summaryCard}>
          <Row label="Opening balance" value={formatCurrency(report.openingBalance)} />
          <Row label="Contributions received" value={formatCurrency(report.totalContributions)} />
          <Row label="Expenses paid" value={formatCurrency(report.totalPaidExpenses)} />
          <Row label="Expenses pending" value={formatCurrency(report.totalPendingExpenses)} />
          <Row label="Closing balance" value={formatCurrency(report.closingBalance)} bold />
        </View>
      ) : null}

      <TouchableOpacity style={styles.exportButton} onPress={handleExportPdf} disabled={!rangeValid || isExporting}>
        <Text style={styles.exportButtonText}>{isExporting ? "Preparing PDF..." : "Share / Export PDF"}</Text>
      </TouchableOpacity>

      {report ? (
        <>
          <Text style={styles.sectionTitle}>Expenses ({report.expenses.length})</Text>
          {report.expenses.length === 0 ? (
            <Text style={styles.emptyText}>None in this period.</Text>
          ) : (
            report.expenses.map((e, i) => (
              <View key={i} style={styles.listRow}>
                <Text style={styles.listRowTitle}>
                  [{e.eventName ?? "General"}] {e.description}
                </Text>
                <Text style={styles.listRowMeta}>
                  {e.date} · {formatCurrency(e.amount)} · {e.status}
                </Text>
              </View>
            ))
          )}

          <Text style={styles.sectionTitle}>Contributions ({report.contributions.length})</Text>
          {report.contributions.length === 0 ? (
            <Text style={styles.emptyText}>None in this period.</Text>
          ) : (
            report.contributions.map((c, i) => (
              <View key={i} style={styles.listRow}>
                <Text style={styles.listRowTitle}>{c.memberName}</Text>
                <Text style={styles.listRowMeta}>
                  {c.date} · {formatCurrency(c.amount)}
                  {c.note ? ` · ${c.note}` : ""}
                </Text>
              </View>
            ))
          )}
        </>
      ) : null}
    </ScrollView>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <View style={styles.summaryRow}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={[styles.summaryValue, bold && styles.summaryValueBold]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  rangeRow: { flexDirection: "row", gap: 12 },
  label: { fontSize: 13, fontWeight: "600", color: colors.textPrimary, marginBottom: 6 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 10, backgroundColor: colors.surface, color: colors.textPrimary },
  refreshButton: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingVertical: 10, alignItems: "center", marginTop: 12 },
  refreshButtonText: { color: colors.textPrimary, fontWeight: "600" },
  summaryCard: { backgroundColor: colors.surface, borderRadius: 10, padding: 16, marginTop: 16, borderWidth: 1, borderColor: colors.border },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 },
  summaryLabel: { color: colors.textSecondary },
  summaryValue: { color: colors.textPrimary, fontWeight: "600" },
  summaryValueBold: { fontSize: 16, fontWeight: "800" },
  exportButton: { backgroundColor: colors.primary, borderRadius: 8, paddingVertical: 14, alignItems: "center", marginTop: 16 },
  exportButtonText: { color: colors.white, fontWeight: "700" },
  sectionTitle: { fontSize: 15, fontWeight: "700", color: colors.textPrimary, marginTop: 24, marginBottom: 8 },
  listRow: { backgroundColor: colors.surface, borderRadius: 8, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: colors.border },
  listRowTitle: { color: colors.textPrimary, fontWeight: "600" },
  listRowMeta: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },
  emptyText: { color: colors.textMuted, marginBottom: 8 },
});
```

- [ ] **Step 2: Typecheck**

```bash
cd mobile && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Manual verification (golden path)**

On the Reports tab, the current month's range is pre-filled and totals load automatically. Change the date range and tap "Refresh" — totals and the expense/contribution lists update to match. Tap "Share/Export PDF" — the native share sheet opens with a generated PDF attached; open it and confirm it lists the same summary numbers and line items shown on screen.

- [ ] **Step 4: Commit**

```bash
git add mobile/src/screens/ReportsScreen.tsx
git commit -m "feat: add reports screen with PDF export"
```

---

### Task 7: Settings screen (opening balance, custom attributes, PIN change)

**Files:**
- Modify: `mobile/src/screens/SettingsScreen.tsx` (replaces the Task 2 placeholder)

**Interfaces:**
- Consumes: `apiRequest` (Task 1); `AttributeDefinition`, `AttributeType` (Task 1); `formatCurrency` (Task 1); `colors` (Task 1); `useAuth` (Task 2, for `logout` after a PIN change so the new PIN must be used to unlock again).

- [ ] **Step 1: Replace `mobile/src/screens/SettingsScreen.tsx`**

```tsx
import { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, Alert, ScrollView } from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../lib/api";
import type { AttributeDefinition, AttributeType } from "../lib/types";
import { colors } from "../theme";
import { useAuth } from "../contexts/AuthContext";

function OpeningBalanceSection() {
  const queryClient = useQueryClient();
  const { data: settings } = useQuery({
    queryKey: ["settings"],
    queryFn: () => apiRequest<{ openingBalance: number }>("/api/settings"),
  });
  const [value, setValue] = useState<string | null>(null);

  const displayValue = value ?? (settings ? String(settings.openingBalance) : "");

  const saveMutation = useMutation({
    mutationFn: (openingBalance: number) => apiRequest("/api/settings", { method: "PUT", body: JSON.stringify({ openingBalance }) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      queryClient.invalidateQueries({ queryKey: ["balance"] });
      Alert.alert("Saved", "Opening balance updated.");
    },
    onError: (error: any) => Alert.alert("Could not save", error.message),
  });

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Opening Balance</Text>
      <TextInput style={styles.input} value={displayValue} onChangeText={setValue} keyboardType="decimal-pad" />
      <TouchableOpacity
        style={styles.button}
        onPress={() => {
          const parsed = parseFloat(displayValue);
          if (Number.isNaN(parsed) || parsed < 0) {
            Alert.alert("Invalid amount", "Enter an amount of 0 or more.");
            return;
          }
          saveMutation.mutate(parsed);
        }}
        disabled={saveMutation.isPending}
      >
        <Text style={styles.buttonText}>{saveMutation.isPending ? "Saving..." : "Save"}</Text>
      </TouchableOpacity>
    </View>
  );
}

function CustomAttributesSection() {
  const queryClient = useQueryClient();
  const { data: attributes = [] } = useQuery({
    queryKey: ["attributes"],
    queryFn: () => apiRequest<AttributeDefinition[]>("/api/attributes"),
  });
  const [key, setKey] = useState("");
  const [label, setLabel] = useState("");
  const [type, setType] = useState<AttributeType>("text");

  const createMutation = useMutation({
    mutationFn: () => apiRequest("/api/attributes", { method: "POST", body: JSON.stringify({ key: key.trim(), label: label.trim(), type }) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["attributes"] });
      setKey("");
      setLabel("");
      setType("text");
    },
    onError: (error: any) => Alert.alert("Could not add attribute", error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest(`/api/attributes/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["attributes"] }),
    onError: (error: any) => Alert.alert("Could not remove attribute", error.message),
  });

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Custom Member Fields</Text>
      <FlatList
        data={attributes}
        keyExtractor={(a) => String(a.id)}
        scrollEnabled={false}
        renderItem={({ item }) => (
          <View style={styles.attributeRow}>
            <Text style={{ color: colors.textPrimary }}>
              {item.label} <Text style={{ color: colors.textMuted }}>({item.type})</Text>
            </Text>
            <TouchableOpacity
              onPress={() =>
                Alert.alert("Remove field", `Remove "${item.label}"? Existing member values for it are kept but hidden.`, [
                  { text: "Cancel", style: "cancel" },
                  { text: "Remove", style: "destructive", onPress: () => deleteMutation.mutate(item.id) },
                ])
              }
            >
              <Text style={{ color: colors.danger, fontWeight: "600" }}>Remove</Text>
            </TouchableOpacity>
          </View>
        )}
      />

      <Text style={styles.label}>Field label (e.g. "Blood Group")</Text>
      <TextInput style={styles.input} value={label} onChangeText={setLabel} placeholder="Field label" />
      <Text style={styles.label}>Field key (lowercase, no spaces, e.g. "blood_group")</Text>
      <TextInput style={styles.input} value={key} onChangeText={setKey} placeholder="field_key" autoCapitalize="none" />
      <View style={styles.typeRow}>
        {(["text", "number", "date"] as AttributeType[]).map((t) => (
          <TouchableOpacity key={t} style={[styles.typeOption, type === t && styles.typeOptionActive]} onPress={() => setType(t)}>
            <Text style={[styles.typeOptionText, type === t && styles.typeOptionTextActive]}>{t}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <TouchableOpacity
        style={styles.button}
        onPress={() => {
          if (!label.trim() || !key.trim()) {
            Alert.alert("Missing details", "Enter both a field label and a key.");
            return;
          }
          createMutation.mutate();
        }}
        disabled={createMutation.isPending}
      >
        <Text style={styles.buttonText}>{createMutation.isPending ? "Adding..." : "Add Field"}</Text>
      </TouchableOpacity>
    </View>
  );
}

function ChangePinSection() {
  const { logout } = useAuth();
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");

  const changeMutation = useMutation({
    mutationFn: () => apiRequest("/api/auth/pin", { method: "PATCH", body: JSON.stringify({ currentPin, newPin }) }),
    onSuccess: async () => {
      Alert.alert("PIN changed", "Unlock the app again with your new PIN.", [{ text: "OK", onPress: () => logout() }]);
    },
    onError: (error: any) => Alert.alert("Could not change PIN", error.message),
  });

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Change PIN</Text>
      <Text style={styles.label}>Current PIN</Text>
      <TextInput style={styles.input} value={currentPin} onChangeText={setCurrentPin} secureTextEntry keyboardType="number-pad" />
      <Text style={styles.label}>New PIN (4+ digits)</Text>
      <TextInput style={styles.input} value={newPin} onChangeText={setNewPin} secureTextEntry keyboardType="number-pad" />
      <TouchableOpacity
        style={styles.button}
        onPress={() => {
          if (newPin.length < 4) {
            Alert.alert("PIN too short", "Choose a PIN with at least 4 digits.");
            return;
          }
          changeMutation.mutate();
        }}
        disabled={changeMutation.isPending}
      >
        <Text style={styles.buttonText}>{changeMutation.isPending ? "Changing..." : "Change PIN"}</Text>
      </TouchableOpacity>
    </View>
  );
}

export default function SettingsScreen() {
  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16 }}>
      <OpeningBalanceSection />
      <CustomAttributesSection />
      <ChangePinSection />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  section: { backgroundColor: colors.surface, borderRadius: 10, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: colors.border },
  sectionTitle: { fontSize: 16, fontWeight: "700", color: colors.textPrimary, marginBottom: 12 },
  label: { fontSize: 13, fontWeight: "600", color: colors.textPrimary, marginBottom: 6, marginTop: 12 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 10, backgroundColor: colors.background, color: colors.textPrimary },
  button: { backgroundColor: colors.primary, borderRadius: 8, paddingVertical: 12, alignItems: "center", marginTop: 16 },
  buttonText: { color: colors.white, fontWeight: "600" },
  attributeRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  typeRow: { flexDirection: "row", gap: 8, marginTop: 8 },
  typeOption: { flex: 1, paddingVertical: 8, alignItems: "center", borderRadius: 8, borderWidth: 1, borderColor: colors.border },
  typeOptionActive: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  typeOptionText: { color: colors.textSecondary, fontSize: 12, fontWeight: "600" },
  typeOptionTextActive: { color: colors.primary },
});
```

- [ ] **Step 2: Typecheck**

```bash
cd mobile && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Manual verification (golden path)**

On the Settings tab, change the opening balance and save — confirm it's reflected on the Balance tab. Add a custom field (e.g. label "Blood Group", key "blood_group", type "text") — go to Members, add/edit a member, confirm the new field appears in the form and its value saves and reloads correctly. Remove the custom field from Settings — confirm it no longer appears on the member form (existing stored values are simply no longer shown, per the confirmation dialog's wording). Change the PIN with the correct current PIN — the app logs out; confirm the old PIN no longer unlocks it and the new one does. Attempt a PIN change with a wrong current PIN — confirm it's rejected with an error and the app is not logged out.

- [ ] **Step 4: Commit**

```bash
git add mobile/src/screens/SettingsScreen.tsx
git commit -m "feat: add settings screen with attribute management and PIN change"
```
