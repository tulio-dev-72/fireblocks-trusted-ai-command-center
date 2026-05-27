import type {
  FireblocksAuthDiagnostics,
  FireblocksAuthTestResult,
  SignedRequestPreview,
} from "@taicc/shared-types";
import {
  diagnosePrivateKey,
  maskApiKey,
  type PrivateKeySource,
} from "./private-key-diagnostics.js";
import {
  buildFireblocksRequestUrl,
  decodeJwtPreview,
  resolveJwtUriFromUrl,
  signFireblocksJwt,
  validateAuthorizationHeader,
} from "./jwt-auth.js";
import {
  FireblocksAuthLogCollector,
  logFireblocksAuthPhase,
  type AuthLogger,
} from "./auth-logging.js";
import { normalizePrivateKeyPem } from "./private-key-diagnostics.js";
import { resolveFireblocksPrivateKey } from "./secret-key.js";

export interface FireblocksAuthDiagnosticsConfig {
  apiKey: string;
  secretKeyPath: string;
  secretKeyInline?: string;
  basePath: string;
}

const TEST_RELATIVE_PATH = "/vault/accounts_paged?limit=1";

function truncateBody(text: string, max = 800): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}… [truncated]`;
}

export async function runFireblocksAuthDiagnostics(
  config: FireblocksAuthDiagnosticsConfig,
  logger?: AuthLogger,
): Promise<FireblocksAuthDiagnostics> {
  const checkedAt = new Date().toISOString();
  const collector = new FireblocksAuthLogCollector();
  const keySource: PrivateKeySource = {
    secretKeyPath: config.secretKeyPath,
    secretKeyInline: config.secretKeyInline,
  };

  const privateKey = diagnosePrivateKey(keySource);
  const apiKey = config.apiKey?.trim() ?? "";
  const basePath = config.basePath?.trim() ?? "";

  const environment = {
    api_key_present: Boolean(apiKey),
    api_key_preview: apiKey ? maskApiKey(apiKey) : undefined,
    base_path: basePath,
    base_path_valid: basePath.startsWith("https://"),
    secret_key_path: config.secretKeyPath,
    inline_key_configured: Boolean(config.secretKeyInline?.trim()),
  };

  let jwtGeneration: FireblocksAuthDiagnostics["jwt_generation"] = {
    ok: false,
    message: "JWT not generated",
  };
  let signedRequest: SignedRequestPreview | undefined;
  let authTest: FireblocksAuthTestResult = { ok: false, error: "Not tested" };
  let sandboxConnectivity: FireblocksAuthDiagnostics["sandbox_connectivity"] = "skipped";

  if (!privateKey.loaded) {
    logFireblocksAuthPhase(
      logger,
      collector,
      "jwt_generation",
      "failed",
      privateKey.errors.join("; ") || "Private key not loaded",
    );
    jwtGeneration = {
      ok: false,
      message: privateKey.errors[0] ?? "Private key not loaded",
    };
  } else if (!apiKey) {
    logFireblocksAuthPhase(
      logger,
      collector,
      "jwt_generation",
      "failed",
      "FIREBLOCKS_API_KEY missing",
    );
    jwtGeneration = { ok: false, message: "FIREBLOCKS_API_KEY is missing" };
  } else if (!basePath) {
    logFireblocksAuthPhase(
      logger,
      collector,
      "jwt_generation",
      "failed",
      "FIREBLOCKS_BASE_PATH missing",
    );
    jwtGeneration = { ok: false, message: "FIREBLOCKS_BASE_PATH is missing" };
  } else {
    try {
      const pem = normalizePrivateKeyPem(
        resolveFireblocksPrivateKey(keySource),
      );
      const requestUrl = buildFireblocksRequestUrl(basePath, TEST_RELATIVE_PATH);
      const uriSigned = resolveJwtUriFromUrl(requestUrl);

      logFireblocksAuthPhase(logger, collector, "jwt_generation", "ok", "Building JWT claims", {
        uri: uriSigned,
        algorithm: "RS256",
        ttlSeconds: 55,
      });

      const jwt = signFireblocksJwt({
        apiKey,
        privateKeyPem: pem,
        uri: uriSigned,
        method: "GET",
      });

      const preview = decodeJwtPreview(jwt);
      const authCheck = validateAuthorizationHeader(jwt);

      logFireblocksAuthPhase(logger, collector, "signing", "ok", "RS256 signature applied", {
        segments: authCheck.segmentCount,
        uri: uriSigned,
      });

      jwtGeneration = {
        ok: preview.valid_structure && preview.algorithm === "RS256",
        message: preview.valid_structure
          ? "JWT generated with RS256 (Fireblocks SDK-compatible)"
          : (preview.error ?? "JWT structure invalid"),
        preview,
      };

      signedRequest = {
        method: "GET",
        url: requestUrl,
        uri_signed_in_jwt: uriSigned,
        authorization_header_format: authCheck.malformed
          ? "malformed"
          : "Bearer <JWT>",
        x_api_key_present: true,
        x_api_key_preview: maskApiKey(apiKey),
        jwt_segment_count: authCheck.segmentCount,
        authorization_malformed: authCheck.malformed,
      };

      if (authCheck.malformed) {
        authTest = { ok: false, error: "Generated Authorization header would be malformed" };
        logFireblocksAuthPhase(
          logger,
          collector,
          "request",
          "failed",
          "Refusing to send malformed Authorization header",
        );
      } else {
        const start = Date.now();
        logFireblocksAuthPhase(logger, collector, "request", "ok", "Sending signed GET", {
          url: requestUrl,
          uriSigned,
        });

        try {
          const response = await fetch(requestUrl, {
            method: "GET",
            headers: {
              Authorization: `Bearer ${jwt}`,
              "X-API-Key": apiKey,
              "Content-Type": "application/json",
            },
          });

          const latencyMs = Date.now() - start;
          const bodyText = await response.text();
          const bodyPreview = truncateBody(bodyText);

          logFireblocksAuthPhase(
            logger,
            collector,
            "response",
            response.ok ? "ok" : "failed",
            `HTTP ${response.status}`,
            { latencyMs, bodyPreview: truncateBody(bodyPreview, 200) },
          );

          sandboxConnectivity = response.ok ? "ok" : "failed";
          authTest = {
            ok: response.ok,
            http_status: response.status,
            latency_ms: latencyMs,
            response_body_preview: bodyPreview,
            error: response.ok
              ? undefined
              : `Fireblocks returned HTTP ${response.status}: ${truncateBody(bodyPreview, 200)}`,
          };
        } catch (networkError) {
          const message =
            networkError instanceof Error ? networkError.message : String(networkError);
          logFireblocksAuthPhase(logger, collector, "response", "failed", message);
          sandboxConnectivity = "failed";
          authTest = { ok: false, error: `Network error calling Fireblocks: ${message}` };
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logFireblocksAuthPhase(logger, collector, "signing", "failed", message);
      if (!jwtGeneration.ok) {
        jwtGeneration = { ok: false, message: `JWT signing failed: ${message}` };
      }
      if (!authTest.ok) {
        authTest = { ok: false, error: message };
      }
      sandboxConnectivity = "failed";
    }
  }

  const credentialChecks = buildCredentialChecks(config, privateKey);

  return {
    checked_at: checkedAt,
    sandbox_connectivity: sandboxConnectivity,
    private_key: privateKey,
    jwt_generation: jwtGeneration,
    environment,
    signed_request: signedRequest,
    auth_test: authTest,
    credential_checks: credentialChecks,
    auth_log: collector.entries,
  };
}

function buildCredentialChecks(
  config: FireblocksAuthDiagnosticsConfig,
  privateKey: ReturnType<typeof diagnosePrivateKey>,
) {
  const checks: FireblocksAuthDiagnostics["credential_checks"] = [];

  const apiKey = config.apiKey?.trim() ?? "";
  checks.push({
    check: "api_key",
    valid: Boolean(apiKey),
    message: apiKey
      ? `API key configured (${maskApiKey(apiKey)})`
      : "FIREBLOCKS_API_KEY is missing",
  });

  if (config.secretKeyInline?.trim()) {
    checks.push({
      check: "secret_key_env",
      valid: privateKey.loaded,
      message: privateKey.loaded
        ? "FIREBLOCKS_PRIVATE_KEY loaded (inline)"
        : (privateKey.errors[0] ?? "Inline private key invalid"),
    });
  } else {
    checks.push({
      check: "secret_key_path",
      valid: privateKey.loaded && privateKey.source === "file",
      message: privateKey.loaded
        ? `Private key file OK: ${config.secretKeyPath}`
        : (privateKey.errors[0] ?? `Private key file issue: ${config.secretKeyPath}`),
    });
  }

  checks.push({
    check: "jwt_signing",
    valid: privateKey.rsa_signing_ok === true,
    message: privateKey.rsa_signing_ok
      ? "RSA-SHA256 signing OK (Fireblocks JWT format)"
      : (privateKey.errors.find((e) => e.includes("signing")) ??
          privateKey.errors[0] ??
          "JWT signing not validated"),
  });

  const basePath = config.basePath?.trim() ?? "";
  checks.push({
    check: "base_path",
    valid: basePath.startsWith("https://"),
    message: basePath
      ? basePath.includes("sandbox")
        ? `Sandbox: ${basePath}`
        : `Endpoint: ${basePath}`
      : "FIREBLOCKS_BASE_PATH not set",
  });

  return checks;
}
