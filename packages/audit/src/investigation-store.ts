import pg from "pg";
import type {
  DelayedPaymentsInvestigationResponse,
  InvestigationMode,
  InvestigationStatus,
  InvestigationWorkflow,
} from "@taicc/shared-types";

import { INVESTIGATIONS_DDL } from "./investigation-schema.js";

export interface InvestigationRow {
  correlation_id: string;
  workflow: InvestigationWorkflow;
  mode: InvestigationMode;
  question: string;
  status: InvestigationStatus;
  phase?: string;
  actor_id?: string;
  started_at: string;
  completed_at?: string;
  error?: string;
  result?: DelayedPaymentsInvestigationResponse;
}

export interface InvestigationStoreLike {
  create(input: {
    correlationId: string;
    workflow: InvestigationWorkflow;
    mode: InvestigationMode;
    question: string;
    actorId: string;
  }): Promise<void>;
  setPhase(correlationId: string, phase: string): Promise<void>;
  complete(correlationId: string, result: DelayedPaymentsInvestigationResponse): Promise<void>;
  fail(correlationId: string, error: string): Promise<void>;
  get(correlationId: string): Promise<InvestigationRow | null>;
  close(): Promise<void>;
}

export class InvestigationStore implements InvestigationStoreLike {
  private constructor(private readonly pool: pg.Pool) {}

  static async connect(databaseUrl: string, bootstrap = true): Promise<InvestigationStore> {
    const pool = new pg.Pool({ connectionString: databaseUrl });
    if (bootstrap) {
      await pool.query(INVESTIGATIONS_DDL);
    }
    return new InvestigationStore(pool);
  }

  async create(input: {
    correlationId: string;
    workflow: InvestigationWorkflow;
    mode: InvestigationMode;
    question: string;
    actorId: string;
  }): Promise<void> {
    await this.pool.query(
      `INSERT INTO investigations (correlation_id, workflow, mode, question, status, phase, actor_id, started_at)
       VALUES ($1, $2, $3, $4, 'running', 'initializing', $5, NOW())`,
      [input.correlationId, input.workflow, input.mode, input.question, input.actorId],
    );
  }

  async setPhase(correlationId: string, phase: string): Promise<void> {
    await this.pool.query(
      `UPDATE investigations SET phase = $2 WHERE correlation_id = $1`,
      [correlationId, phase],
    );
  }

  async complete(
    correlationId: string,
    result: DelayedPaymentsInvestigationResponse,
  ): Promise<void> {
    await this.pool.query(
      `UPDATE investigations
       SET status = 'completed', phase = 'complete', result_json = $2, completed_at = NOW(), error = NULL
       WHERE correlation_id = $1`,
      [correlationId, JSON.stringify(result)],
    );
  }

  async fail(correlationId: string, error: string): Promise<void> {
    await this.pool.query(
      `UPDATE investigations
       SET status = 'failed', phase = 'failed', error = $2, completed_at = NOW()
       WHERE correlation_id = $1`,
      [correlationId, error],
    );
  }

  async get(correlationId: string): Promise<InvestigationRow | null> {
    const result = await this.pool.query(
      `SELECT correlation_id, workflow, mode, question, status, phase, actor_id,
              started_at, completed_at, error, result_json
       FROM investigations WHERE correlation_id = $1`,
      [correlationId],
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      correlation_id: row.correlation_id,
      workflow: row.workflow,
      mode: row.mode,
      question: row.question,
      status: row.status,
      phase: row.phase ?? undefined,
      actor_id: row.actor_id ?? undefined,
      started_at: row.started_at.toISOString(),
      completed_at: row.completed_at?.toISOString(),
      error: row.error ?? undefined,
      result: row.result_json ?? undefined,
    };
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
