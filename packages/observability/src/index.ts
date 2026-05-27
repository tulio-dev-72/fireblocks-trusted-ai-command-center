import { randomUUID } from "node:crypto";

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogContext {
  correlationId?: string;
  actorId?: string;
  service?: string;
  [key: string]: unknown;
}

export interface Logger {
  debug(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, context?: LogContext): void;
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

export function createLogger(
  service: string,
  minLevel: LogLevel = "info",
): Logger {
  const minLevelNum = LOG_LEVELS[minLevel];

  function log(
    level: LogLevel,
    message: string,
    context?: LogContext,
  ): void {
    if (LOG_LEVELS[level] < minLevelNum) return;

    const entry = {
      timestamp: new Date().toISOString(),
      level,
      service,
      message,
      ...context,
    };

    const output = JSON.stringify(entry);
    if (level === "error") {
      console.error(output);
    } else if (level === "warn") {
      console.warn(output);
    } else {
      console.log(output);
    }
  }

  return {
    debug: (msg, ctx) => log("debug", msg, ctx),
    info: (msg, ctx) => log("info", msg, ctx),
    warn: (msg, ctx) => log("warn", msg, ctx),
    error: (msg, ctx) => log("error", msg, ctx),
  };
}

export function generateCorrelationId(): string {
  return randomUUID();
}
