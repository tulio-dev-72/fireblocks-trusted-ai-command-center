import { createPrivateKey, createSign } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import type { PrivateKeyDiagnostics } from "@taicc/shared-types";

export interface PrivateKeySource {
  secretKeyPath: string;
  secretKeyInline?: string;
}

const PEM_REGENERATION_GUIDE =
  "Regenerate in Fireblocks Console → Settings → API Users → Generate API key pair. " +
  "Download the .key file or copy the PEM. For env vars, replace newlines with \\n on one line, " +
  "or paste multiline PEM in Render secret env. Required format: " +
  "-----BEGIN PRIVATE KEY----- (PKCS#8) or -----BEGIN RSA PRIVATE KEY----- (PKCS#1).";

/** Normalize PEM from env files — fixes escaped newlines, quotes, and trailing whitespace. */
export function normalizePrivateKeyPem(raw: string): string {
  let pem = raw.trim();
  if (
    (pem.startsWith('"') && pem.endsWith('"')) ||
    (pem.startsWith("'") && pem.endsWith("'"))
  ) {
    pem = pem.slice(1, -1).trim();
  }
  pem = pem.replace(/\\n/g, "\n");
  pem = pem.replace(/\r\n/g, "\n");
  // Collapse accidental spaces inside base64 lines while preserving PEM headers
  const lines = pem.split("\n").map((line) => line.trim()).filter(Boolean);
  return lines.join("\n");
}

export function maskApiKey(key: string): string {
  if (key.length <= 8) return "****";
  return `${key.slice(0, 4)}…${key.slice(-4)}`;
}

export function diagnosePrivateKey(source: PrivateKeySource): PrivateKeyDiagnostics {
  const inline = source.secretKeyInline?.trim();
  const filePath = source.secretKeyPath?.trim();

  if (inline) {
    return validatePemContent(inline, "inline_env", undefined);
  }

  if (!filePath) {
    return {
      loaded: false,
      source: "none",
      format: "missing",
      errors: ["Set FIREBLOCKS_PRIVATE_KEY or FIREBLOCKS_SECRET_KEY_PATH"],
      remediation: PEM_REGENERATION_GUIDE,
    };
  }

  if (!existsSync(filePath)) {
    return {
      loaded: false,
      source: "file",
      file_path: filePath,
      format: "missing",
      errors: [`Private key file not found: ${filePath}`],
      remediation: PEM_REGENERATION_GUIDE,
    };
  }

  try {
    const raw = readFileSync(filePath, "utf-8");
    return validatePemContent(raw, "file", filePath);
  } catch (error) {
    return {
      loaded: false,
      source: "file",
      file_path: filePath,
      format: "unknown",
      errors: [error instanceof Error ? error.message : String(error)],
      remediation: PEM_REGENERATION_GUIDE,
    };
  }
}

function validatePemContent(
  raw: string,
  source: "inline_env" | "file",
  filePath: string | undefined,
): PrivateKeyDiagnostics {
  const errors: string[] = [];
  const hasLiteralBackslashN = raw.includes("\\n");
  const hasWrappedQuotes =
    (raw.trim().startsWith('"') && raw.trim().endsWith('"')) ||
    (raw.trim().startsWith("'") && raw.trim().endsWith("'"));

  let format: PrivateKeyDiagnostics["format"] = "unknown";
  if (raw.includes("BEGIN PRIVATE KEY")) format = "pkcs8";
  else if (raw.includes("BEGIN RSA PRIVATE KEY")) format = "pkcs1";
  else errors.push("PEM must contain BEGIN PRIVATE KEY or BEGIN RSA PRIVATE KEY markers");

  const pem = normalizePrivateKeyPem(raw);
  const lineCount = pem.split("\n").length;

  if (!pem.includes("END")) {
    errors.push("PEM is missing END marker — key may be truncated");
  }

  let keyType: string | undefined;
  let rsaSigningOk = false;

  try {
    const keyObject = createPrivateKey(pem);
    keyType = keyObject.asymmetricKeyType ?? "unknown";
    if (keyType !== "rsa") {
      errors.push(`Expected RSA private key, got: ${keyType}`);
    }
    const sign = createSign("RSA-SHA256");
    sign.update("fireblocks-jwt-sign-test");
    sign.end();
    sign.sign(keyObject);
    rsaSigningOk = true;
  } catch (error) {
    errors.push(
      `RSA-SHA256 signing failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const loaded = errors.length === 0 && rsaSigningOk;

  return {
    loaded,
    source,
    file_path: filePath,
    format,
    key_type: keyType,
    line_count: lineCount,
    has_literal_backslash_n: hasLiteralBackslashN,
    has_wrapped_quotes: hasWrappedQuotes,
    rsa_signing_ok: rsaSigningOk,
    errors,
    remediation: loaded ? undefined : PEM_REGENERATION_GUIDE,
  };
}

export { PEM_REGENERATION_GUIDE };
