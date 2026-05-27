import { existsSync, readFileSync } from "node:fs";

export interface FireblocksSecretKeySource {
  secretKeyPath: string;
  /** PEM contents — use for cloud secret stores (Render/Railway env). Supports \\n escapes. */
  secretKeyInline?: string;
}

/** Resolve RSA private key PEM from inline env or filesystem. Never log the return value. */
export function resolveFireblocksPrivateKey(source: FireblocksSecretKeySource): string {
  const inline = source.secretKeyInline?.trim();
  if (inline) {
    return inline.replace(/\\n/g, "\n").trim();
  }

  if (!source.secretKeyPath?.trim()) {
    throw new Error(
      "Fireblocks private key not configured — set FIREBLOCKS_PRIVATE_KEY or FIREBLOCKS_SECRET_KEY_PATH",
    );
  }

  try {
    return readFileSync(source.secretKeyPath, "utf-8").trim();
  } catch {
    throw new Error(`Fireblocks private key file not found at: ${source.secretKeyPath}`);
  }
}

export function isFireblocksPrivateKeyConfigured(source: FireblocksSecretKeySource): boolean {
  if (source.secretKeyInline?.trim()) return true;
  if (!source.secretKeyPath?.trim()) return false;
  try {
    if (!existsSync(source.secretKeyPath)) return false;
    const pem = readFileSync(source.secretKeyPath, "utf-8").trim();
    return pem.includes("BEGIN") && pem.includes("PRIVATE KEY");
  } catch {
    return false;
  }
}
