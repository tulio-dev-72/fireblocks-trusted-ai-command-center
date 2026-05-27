import type { IncomingMessage, ServerResponse } from "node:http";
import type { AuditLogger, EvidenceStore, InvestigationStoreLike } from "@taicc/audit";
import {
  buildInvestigationStatusSnapshot,
  buildInvestigationTimeline,
} from "./investigation-timeline.js";

const STREAM_INTERVAL_MS = 1000;
const STREAM_MAX_MS = 5 * 60 * 1000;

function writeSse(res: ServerResponse, event: string, data: unknown): void {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

export async function streamInvestigation(
  req: IncomingMessage,
  res: ServerResponse,
  correlationId: string,
  deps: {
    investigationStore: InvestigationStoreLike;
    auditLogger: AuditLogger;
    evidenceStore: EvidenceStore | null;
  },
): Promise<void> {
  const record = await deps.investigationStore.get(correlationId);
  if (!record) {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Investigation not found", correlation_id: correlationId }));
    return;
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });

  let closed = false;
  req.on("close", () => {
    closed = true;
  });

  const startedAt = Date.now();
  let lastTimelineHash = "";
  let lastStatusHash = "";

  const pushUpdate = async (): Promise<boolean> => {
    const [status, timeline] = await Promise.all([
      buildInvestigationStatusSnapshot(
        correlationId,
        deps.investigationStore,
        deps.evidenceStore,
      ),
      buildInvestigationTimeline(correlationId, deps.auditLogger, deps.evidenceStore),
    ]);

    if (!status) return true;

    const statusHash = JSON.stringify({
      status: status.status,
      phase: status.phase,
      error: status.error,
      hasResult: Boolean(status.result),
      webhook_event_count: status.webhook_event_count,
    });
    if (statusHash !== lastStatusHash) {
      lastStatusHash = statusHash;
      writeSse(res, "status", status);
    }

    const timelineHash = JSON.stringify(timeline.events.map((e) => e.id));
    if (timelineHash !== lastTimelineHash) {
      lastTimelineHash = timelineHash;
      writeSse(res, "timeline", timeline);
    }

    if (status.status === "completed") {
      writeSse(res, "complete", status);
      return true;
    }
    if (status.status === "failed") {
      writeSse(res, "error", { error: status.error ?? "Investigation failed", status });
      return true;
    }

    return false;
  };

  writeSse(res, "connected", { correlation_id: correlationId });

  const done = await pushUpdate();
  if (done || closed) {
    res.end();
    return;
  }

  await new Promise<void>((resolve) => {
    const timer = setInterval(async () => {
      if (closed || Date.now() - startedAt > STREAM_MAX_MS) {
        clearInterval(timer);
        if (!closed) {
          writeSse(res, "timeout", {
            correlation_id: correlationId,
            message: "Stream closed after maximum duration — poll status endpoint for final state",
          });
        }
        res.end();
        resolve();
        return;
      }

      try {
        const finished = await pushUpdate();
        if (finished) {
          clearInterval(timer);
          res.end();
          resolve();
        }
      } catch (error) {
        clearInterval(timer);
        if (!closed) {
          writeSse(res, "error", {
            error: error instanceof Error ? error.message : String(error),
          });
          res.end();
        }
        resolve();
      }
    }, STREAM_INTERVAL_MS);
  });
}
