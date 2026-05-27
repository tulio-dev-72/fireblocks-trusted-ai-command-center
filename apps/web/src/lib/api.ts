import type { AuthHeaders } from "./auth";

export const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

function resolveAuthToken(): string | null {
  const configured = import.meta.env.VITE_API_TOKEN?.trim();
  if (configured) return configured;
  if (import.meta.env.DEV) return "dev-token";
  return null;
}

function resolveSandboxAdminToken(): string | null {
  const admin = import.meta.env.VITE_SANDBOX_ADMIN_TOKEN?.trim();
  if (admin) return admin;
  if (import.meta.env.DEV) return "dev-token";
  return resolveAuthToken();
}

export function buildAuthHeaders(): AuthHeaders {
  const token = resolveAuthToken();
  const headers: AuthHeaders = {
    "Content-Type": "application/json",
    Authorization: token ? `Bearer ${token}` : "",
  };
  return headers;
}

export function buildSandboxAdminAuthHeaders(): AuthHeaders {
  const token = resolveSandboxAdminToken();
  const headers: AuthHeaders = {
    "Content-Type": "application/json",
    Authorization: token ? `Bearer ${token}` : "",
  };
  return headers;
}

/** @deprecated use buildAuthHeaders() — kept for modules that spread static headers */
export const AUTH_HEADERS: AuthHeaders = buildAuthHeaders();

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, { headers: buildAuthHeaders() });
  const data = await res.json();
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`);
  return data as T;
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: buildAuthHeaders(),
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`);
  return data as T;
}

/** POST that accepts 202 Accepted (async investigation start). */
export async function apiPostAccepted<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: buildAuthHeaders(),
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (res.status !== 202 && !res.ok) {
    throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  return data as T;
}

export async function apiGetSandboxAdmin<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, { headers: buildSandboxAdminAuthHeaders() });
  const data = await res.json();
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`);
  return data as T;
}

export async function apiPostSandboxAdmin<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: buildSandboxAdminAuthHeaders(),
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`);
  return data as T;
}

/** Fireblocks auth diagnostics — works without platform JWT via health endpoint */
export async function fetchFireblocksAuthDiagnostics() {
  const res = await fetch(`${API_URL}/health/fireblocks/auth-diagnostics`, {
    headers: buildAuthHeaders(),
  });
  const data = await res.json();
  return { ok: res.ok, status: res.status, data };
}
