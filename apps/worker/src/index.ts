/**
 * Background worker — processes approval timeouts, webhook events,
 * and audit archival jobs via Redis queue.
 */
import { loadConfig } from "@taicc/config";
import { createAuditLogger } from "@taicc/audit";
import { createLogger, generateCorrelationId } from "@taicc/observability";

const config = loadConfig();
const logger = createLogger("worker", config.LOG_LEVEL);

let auditLogger!: import("@taicc/audit").AuditLogger;

async function bootstrapWorker(): Promise<() => Promise<void>> {
  const auditHandle = await createAuditLogger({
    databaseUrl: config.DATABASE_URL,
    store: config.AUDIT_STORE,
    bootstrap: config.AUDIT_BOOTSTRAP_SCHEMA,
  });
  auditLogger = auditHandle.logger;
  return auditHandle.shutdown;
}

interface Job {
  id: string;
  type: "approval_timeout" | "webhook_process" | "audit_archive";
  payload: Record<string, unknown>;
  createdAt: string;
}

const jobQueue: Job[] = [];

function enqueue(job: Omit<Job, "id" | "createdAt">): void {
  jobQueue.push({
    ...job,
    id: generateCorrelationId(),
    createdAt: new Date().toISOString(),
  });
}

async function processJob(job: Job): Promise<void> {
  const correlationId = generateCorrelationId();

  switch (job.type) {
    case "approval_timeout":
      logger.info("Processing approval timeout", {
        correlationId,
        operationId: job.payload.operationId,
      });
      await auditLogger.record({
        correlationId,
        eventType: "approval_decided",
        outcome: "denied",
        metadata: {
          operationId: job.payload.operationId,
          reason: "Approval expired (deny-on-expiry, SR-5.3)",
        },
      });
      break;

    case "webhook_process":
      logger.info("Processing Fireblocks webhook", {
        correlationId,
        eventType: job.payload.eventType,
      });
      await auditLogger.record({
        correlationId,
        eventType: "fireblocks_api_call",
        outcome: "success",
        metadata: { webhook: job.payload },
      });
      break;

    case "audit_archive":
      logger.info("Archiving audit events", { correlationId });
      break;
  }
}

async function poll(): Promise<void> {
  while (jobQueue.length > 0) {
    const job = jobQueue.shift()!;
    try {
      await processJob(job);
    } catch (error) {
      logger.error("Job processing failed", {
        jobId: job.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

const POLL_INTERVAL_MS = 5000;

async function main(): Promise<void> {
  const shutdownAudit = await bootstrapWorker();

  setInterval(() => {
    poll().catch((err) => logger.error("Poll error", { error: String(err) }));
  }, POLL_INTERVAL_MS);

  logger.info("Worker started", {
    concurrency: config.WORKER_CONCURRENCY,
    redisUrl: config.REDIS_URL,
    auditStore: config.AUDIT_STORE,
  });

  process.on("SIGINT", () => {
    shutdownAudit().finally(() => process.exit(0));
  });
}

main().catch((error) => {
  logger.error("Worker failed to start", {
    error: error instanceof Error ? error.message : String(error),
  });
  process.exit(1);
});

export { enqueue };
