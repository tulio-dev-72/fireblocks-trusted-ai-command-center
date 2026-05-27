/**
 * Background worker — Redis/BullMQ operational job processor.
 */
import { loadConfig } from "@taicc/config";
import { createAuditLogger } from "@taicc/audit";
import { createLogger } from "@taicc/observability";
import {
  startOperationalWorker,
  type OperationalJobPayload,
} from "@taicc/queue";

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

async function processOperationalJob(job: OperationalJobPayload): Promise<void> {
  const correlationId = job.correlationId;

  await auditLogger.record({
    correlationId,
    eventType: "worker_job",
    action: job.type,
    outcome: "success",
    metadata: { payload: job.payload, idempotent: true },
  });

  switch (job.type) {
    case "process_fireblocks_webhook":
      logger.info("Processed Fireblocks webhook job", {
        correlationId,
        eventType: job.payload.eventType,
      });
      break;
    case "run_delayed_payments_investigation":
      logger.info("Recorded delayed payments investigation job", { correlationId });
      break;
    case "generate_ai_summary":
      logger.info("Recorded AI summary job", { correlationId });
      break;
    case "prepare_escalation_summary":
      logger.info("Recorded escalation summary job", { correlationId });
      break;
    case "persist_evidence_bundle":
      logger.info("Persisted evidence bundle job", {
        correlationId,
        itemCount: job.payload.item_count,
      });
      break;
  }
}

async function main(): Promise<void> {
  const shutdownAudit = await bootstrapWorker();

  const worker = await startOperationalWorker(config.REDIS_URL, processOperationalJob);

  if (worker) {
    logger.info("BullMQ worker started", {
      concurrency: config.WORKER_CONCURRENCY,
      redisUrl: config.REDIS_URL.replace(/:[^:@/]+@/, ":***@"),
    });
  } else {
    logger.warn("Redis unavailable — worker idle (jobs processed synchronously in API)");
  }

  process.on("SIGINT", () => {
    Promise.all([worker?.close(), shutdownAudit()]).finally(() => process.exit(0));
  });
}

main().catch((error) => {
  logger.error("Worker failed to start", {
    error: error instanceof Error ? error.message : String(error),
  });
  process.exit(1);
});
