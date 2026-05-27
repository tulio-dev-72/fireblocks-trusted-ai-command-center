/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Public API base URL — set on Vercel at build time */
  readonly VITE_API_URL: string;
  /** Optional Bearer token for production API auth (never use backend secrets here) */
  readonly VITE_API_TOKEN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
