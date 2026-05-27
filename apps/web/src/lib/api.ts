import type { AuthHeaders } from "./auth";

export const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

function resolveAuthToken(): string {
  const configured = import.meta.env.VITE_API_TOKEN?.trim();
  if (configured) return configured;
  if (import.meta.env.DEV) return "dev-token";
  return "";
}

export const AUTH_HEADERS: AuthHeaders = {
  Authorization: `Bearer ${resolveAuthToken()}`,
  "Content-Type": "application/json",
};

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, { headers: AUTH_HEADERS });
  const data = await res.json();
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`);
  return data as T;
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: AUTH_HEADERS,
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`);
  return data as T;
}
