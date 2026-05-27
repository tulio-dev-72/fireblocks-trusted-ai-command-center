import type {
  DelayedPaymentsInvestigationResponse,
  InvestigationMode,
  InvestigationWorkflow,
} from "@taicc/shared-types";
import type { InvestigationRow, InvestigationStoreLike } from "./investigation-store.js";

export class InMemoryInvestigationStore implements InvestigationStoreLike {
  private readonly records = new Map<string, InvestigationRow>();

  async create(input: {
    correlationId: string;
    workflow: InvestigationWorkflow;
    mode: InvestigationMode;
    question: string;
    actorId: string;
  }): Promise<void> {
    this.records.set(input.correlationId, {
      correlation_id: input.correlationId,
      workflow: input.workflow,
      mode: input.mode,
      question: input.question,
      status: "running",
      phase: "initializing",
      actor_id: input.actorId,
      started_at: new Date().toISOString(),
    });
  }

  async setPhase(correlationId: string, phase: string): Promise<void> {
    const row = this.records.get(correlationId);
    if (row) row.phase = phase;
  }

  async complete(
    correlationId: string,
    result: DelayedPaymentsInvestigationResponse,
  ): Promise<void> {
    const row = this.records.get(correlationId);
    if (!row) return;
    row.status = "completed";
    row.phase = "complete";
    row.result = result;
    row.completed_at = new Date().toISOString();
    row.error = undefined;
  }

  async fail(correlationId: string, error: string): Promise<void> {
    const row = this.records.get(correlationId);
    if (!row) return;
    row.status = "failed";
    row.phase = "failed";
    row.error = error;
    row.completed_at = new Date().toISOString();
  }

  async get(correlationId: string): Promise<InvestigationRow | null> {
    return this.records.get(correlationId) ?? null;
  }

  async close(): Promise<void> {
    this.records.clear();
  }
}
