export type FireblocksAuthPhase =
  | "jwt_generation"
  | "signing"
  | "request"
  | "response";

export type FireblocksAuthPhaseStatus = "ok" | "failed" | "skipped";

export interface FireblocksAuthLogEntry {
  phase: FireblocksAuthPhase;
  status: FireblocksAuthPhaseStatus;
  detail: string;
  at: string;
}

export interface AuthLogger {
  info(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

export class FireblocksAuthLogCollector {
  readonly entries: FireblocksAuthLogEntry[] = [];

  record(
    phase: FireblocksAuthPhase,
    status: FireblocksAuthPhaseStatus,
    detail: string,
  ): void {
    this.entries.push({
      phase,
      status,
      detail,
      at: new Date().toISOString(),
    });
  }
}

export function logFireblocksAuthPhase(
  logger: AuthLogger | undefined,
  collector: FireblocksAuthLogCollector | undefined,
  phase: FireblocksAuthPhase,
  status: FireblocksAuthPhaseStatus,
  detail: string,
  meta?: Record<string, unknown>,
): void {
  collector?.record(phase, status, detail);
  const payload = { phase, status, ...meta };
  if (status === "failed") {
    logger?.error(`[fireblocks-auth] ${phase}: ${detail}`, payload);
  } else {
    logger?.info(`[fireblocks-auth] ${phase}: ${detail}`, payload);
  }
}
