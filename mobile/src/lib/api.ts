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
