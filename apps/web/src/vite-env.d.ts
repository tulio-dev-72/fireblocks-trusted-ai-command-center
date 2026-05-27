/// <reference types="vite/client" />

declare const __BUILD_INFO__: {
  version: string;
  mode: string;
  buildTime: string;
  vercelEnv: string;
  gitSha: string;
};

interface ImportMetaEnv {
  /** Public API base URL — set on Vercel at build time */
  readonly VITE_API_URL: string;
  /** Optional Bearer token for production API auth (never use backend secrets here) */
  readonly VITE_API_TOKEN?: string;
  /** Admin bearer for sandbox activity generation only (matches Render SANDBOX_ADMIN_TOKEN) */
  readonly VITE_SANDBOX_ADMIN_TOKEN?: string;
  /** Vercel deployment environment when exposed at build time */
  readonly VITE_VERCEL_ENV?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
