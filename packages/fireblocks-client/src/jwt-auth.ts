import { createHash, createSign } from "node:crypto";
import { randomUUID } from "node:crypto";
import type { JwtPreview } from "@taicc/shared-types";
import { maskApiKey } from "./private-key-diagnostics.js";

/** Fireblocks JWT TTL — matches @fireblocks/ts-sdk BearerTokenProvider */
export const FIREBLOCKS_JWT_TTL_SECONDS = 55;

/** SHA-256 hex of empty body — required for GET requests */
export const EMPTY_BODY_HASH =
  "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

export interface SignFireblocksJwtParams {
  apiKey: string;
  privateKeyPem: string;
  /** Path + query only, e.g. /v1/vault/accounts_paged?limit=1 */
  uri: string;
  method?: string;
  bodyJson?: string;
}

/**
 * Build a Fireblocks API JWT per official SDK spec:
 * RS256, sub=apiKey, uri=pathname+search, nonce=uuid, bodyHash=sha256(body), exp=iat+55
 */
export function signFireblocksJwt(params: SignFireblocksJwtParams): string {
  const method = (params.method ?? "GET").toUpperCase();
  const bodyJson =
    ["POST", "PATCH", "PUT"].includes(method) && params.bodyJson !== undefined
      ? params.bodyJson
      : undefined;

  const now = Math.floor(Date.now() / 1000);
  const payload = {
    uri: params.uri,
    nonce: randomUUID(),
    iat: now,
    exp: now + FIREBLOCKS_JWT_TTL_SECONDS,
    sub: params.apiKey,
    bodyHash: createHash("sha256")
      .update(bodyJson ?? "")
      .digest("hex"),
  };

  const header = { alg: "RS256", typ: "JWT" };
  const encode = (value: object) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");

  const signingInput = `${encode(header)}.${encode(payload)}`;
  const sign = createSign("RSA-SHA256");
  sign.update(signingInput);
  sign.end();
  const signature = sign.sign(params.privateKeyPem, "base64url");
  return `${signingInput}.${signature}`;
}

/** Resolve uri field for JWT from a full request URL (matches SDK BearerTokenProvider). */
export function resolveJwtUriFromUrl(requestUrl: string): string {
  const url = new URL(requestUrl);
  return `${url.pathname}${url.search}`;
}

/** Build full Fireblocks request URL from base path and relative path+query. */
export function buildFireblocksRequestUrl(
  basePath: string,
  relativePath: string,
): string {
  const base = basePath.replace(/\/$/, "");
  const path = relativePath.startsWith("/") ? relativePath : `/${relativePath}`;
  return `${base}${path}`;
}

export function decodeJwtPreview(token: string): JwtPreview {
  const parts = token.split(".");
  if (parts.length !== 3) {
    return {
      valid_structure: false,
      segment_count: parts.length,
      error: `JWT must have 3 segments (header.payload.signature), got ${parts.length}`,
    };
  }

  try {
    const header = JSON.parse(
      Buffer.from(parts[0]!, "base64url").toString("utf-8"),
    ) as Record<string, unknown>;
    const payload = JSON.parse(
      Buffer.from(parts[1]!, "base64url").toString("utf-8"),
    ) as Record<string, unknown>;

    const sub = typeof payload.sub === "string" ? payload.sub : undefined;
    const iat = typeof payload.iat === "number" ? payload.iat : undefined;
    const exp = typeof payload.exp === "number" ? payload.exp : undefined;

    return {
      valid_structure: true,
      segment_count: 3,
      header,
      payload: {
        uri: payload.uri,
        nonce: payload.nonce ? `${String(payload.nonce).slice(0, 8)}…` : undefined,
        iat: payload.iat,
        exp: payload.exp,
        sub: sub ? maskApiKey(sub) : undefined,
        bodyHash: payload.bodyHash,
      },
      algorithm: typeof header.alg === "string" ? header.alg : undefined,
      uri_signed: typeof payload.uri === "string" ? payload.uri : undefined,
      sub_preview: sub ? maskApiKey(sub) : undefined,
      iat,
      exp,
      ttl_seconds: iat != null && exp != null ? exp - iat : undefined,
      body_hash: typeof payload.bodyHash === "string" ? payload.bodyHash : undefined,
      nonce_present: Boolean(payload.nonce),
    };
  } catch (error) {
    return {
      valid_structure: false,
      segment_count: 3,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export function validateAuthorizationHeader(
  jwt: string,
): { malformed: boolean; format: string; segmentCount: number } {
  const trimmed = jwt.trim();
  const segmentCount = trimmed.split(".").length;
  const malformed = segmentCount !== 3 || trimmed.length === 0;
  return {
    malformed,
    format: malformed ? "malformed" : "Bearer <JWT>",
    segmentCount,
  };
}
