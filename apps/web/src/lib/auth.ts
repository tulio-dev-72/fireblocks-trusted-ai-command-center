export interface AuthHeaders extends Record<string, string> {
  Authorization: string;
  "Content-Type": string;
}

/** Returns true when the UI has a token configured for API calls. */
export function hasApiAuthConfigured(): boolean {
  const token = import.meta.env.VITE_API_TOKEN?.trim();
  return Boolean(token) || import.meta.env.DEV;
}
