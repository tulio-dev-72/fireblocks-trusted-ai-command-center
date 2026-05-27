import { Queue, Worker, type Job } from "bullmq";

export const QUEUE_NAME = "taicc-operational-jobs";

export type OperationalJobType =
  | "process_fireblocks_webhook"
  | "run_delayed_payments_investigation"
  | "generate_ai_summary"
  | "prepare_escalation_summary"
  | "persist_evidence_bundle";

export interface OperationalJobPayload {
  type: OperationalJobType;
  correlationId: string;
  payload: Record<string, unknown>;
}

export interface QueueHandle {
  enqueue: (job: OperationalJobPayload) => Promise<string | null>;
  getFailedCount: () => Promise<number>;
  close: () => Promise<void>;
}

export interface WorkerProcessor {
  (job: OperationalJobPayload): Promise<void>;
}

function parseRedisConnection(redisUrl: string): { host: string; port: number; password?: string; tls?: object } {
  const parsed = new URL(redisUrl);
  const tls = parsed.protocol === "rediss:" ? {} : undefined;
  return {
    host: parsed.hostname,
    port: Number(parsed.port || 6379),
    password: parsed.password || undefined,
    tls,
  };
}

export async function createOperationalQueue(
  redisUrl: string,
): Promise<QueueHandle | null> {
  try {
    const connection = parseRedisConnection(redisUrl);
    const queue = new Queue<OperationalJobPayload>(QUEUE_NAME, { connection });

    await queue.waitUntilReady();

    return {
      enqueue: async (job) => {
        const record = await queue.add(job.type, job, {
          jobId: `${job.type}-${job.correlationId}-${Date.now()}`,
          removeOnComplete: 100,
          removeOnFail: 200,
          attempts: 3,
          backoff: { type: "exponential", delay: 2000 },
        });
        return record.id ?? null;
      },
      getFailedCount: async () => queue.getFailedCount(),
      close: async () => {
        await queue.close();
      },
    };
  } catch {
    return null;
  }
}

export async function startOperationalWorker(
  redisUrl: string,
  processor: WorkerProcessor,
): Promise<{ close: () => Promise<void> } | null> {
  try {
    const connection = parseRedisConnection(redisUrl);

    const worker = new Worker<OperationalJobPayload>(
      QUEUE_NAME,
      async (job: Job<OperationalJobPayload>) => {
        await processor(job.data);
      },
      { connection, concurrency: 5 },
    );

    await worker.waitUntilReady();

    return {
      close: async () => {
        await worker.close();
      },
    };
  } catch {
    return null;
  }
}
