import path from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const webPkg = JSON.parse(
  readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "package.json"), "utf8"),
) as { version: string };

export default defineConfig(({ mode }) => ({
  envDir: rootDir,
  plugins: [react()],
  define: {
    __BUILD_INFO__: JSON.stringify({
      version: webPkg.version,
      mode,
      buildTime: new Date().toISOString(),
      vercelEnv: process.env.VERCEL_ENV ?? "local",
      gitSha: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local",
    }),
  },
  server: {
    port: 5173,
  },
}));
