import { createHash, randomUUID } from "node:crypto";
import pg from "pg";
import type { SourceType } from "@taicc/shared-types";
import { EVIDENCE_DDL, OPERATIONAL_EVENTS_DDL } from "./evidence-schema.js";

export interface EvidenceRecordInput {
  evidenceId: string;
  label: string;
  sourceType: SourceType;
  sourceId?: string;
  available: boolean;
  metadata: Record<string, unknown>;
  valueSummary?: string;
}

export interface PersistedEvidenceRecord {
  evidence_id: string;
  bundle_id: string;
  source_type: SourceType;
  label: string | null;
  available: boolean;
  retrieval_time: string;
  record_hash: string;
  raw_metadata_json: Record<string, unknown>;
}

export class EvidenceStore {
  private constructor(private readonly pool: pg.Pool) {}

  static async connect(databaseUrl: string, bootstrap = true): Promise<EvidenceStore> {
    const pool = new pg.Pool({ connectionString: databaseUrl });
    const store = new EvidenceStore(pool);
    if (bootstrap) {
      await pool.query(EVIDENCE_DDL);
      await pool.query(OPERATIONAL_EVENTS_DDL);
    }
    return store;
  }

  async persistBundle(input: {
    correlationId: string;
    tenantId?: string;
    sourceType: SourceType;
    records: EvidenceRecordInput[];
  }): Promise<{ bundleId: string; records: PersistedEvidenceRecord[] }> {
    const bundleId = randomUUID();
    const retrievalTime = new Date().toISOString();
    const tenantId = input.tenantId ?? "default";

    await this.pool.query(
      `INSERT INTO evidence_bundles (bundle_id, correlation_id, tenant_id, source_type, retrieval_time, record_count)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [bundleId, input.correlationId, tenantId, input.sourceType, retrievalTime, input.records.length],
    );

    const persisted: PersistedEvidenceRecord[] = [];

    for (const record of input.records) {
      const recordHash = createHash("sha256")
        .update(JSON.stringify({ id: record.evidenceId, meta: record.metadata }))
        .digest("hex");

      await this.pool.query(
        `INSERT INTO evidence_records
          (evidence_id, bundle_id, tenant_id, source_type, source_id, retrieval_time, record_hash, raw_metadata_json, label, available)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (evidence_id) DO UPDATE SET
           bundle_id = EXCLUDED.bundle_id,
           retrieval_time = EXCLUDED.retrieval_time,
           record_hash = EXCLUDED.record_hash,
           raw_metadata_json = EXCLUDED.raw_metadata_json,
           available = EXCLUDED.available`,
        [
          record.evidenceId,
          bundleId,
          tenantId,
          record.sourceType,
          record.sourceId ?? record.evidenceId,
          retrievalTime,
          recordHash,
          JSON.stringify(record.metadata),
          record.label,
          record.available,
        ],
      );

      persisted.push({
        evidence_id: record.evidenceId,
        bundle_id: bundleId,
        source_type: record.sourceType,
        label: record.label,
        available: record.available,
        retrieval_time: retrievalTime,
        record_hash: recordHash,
        raw_metadata_json: record.metadata,
      });
    }

    return { bundleId, records: persisted };
  }

  async getById(evidenceId: string): Promise<PersistedEvidenceRecord | null> {
    const result = await this.pool.query(
      `SELECT evidence_id, bundle_id, source_type, label, available, retrieval_time, record_hash, raw_metadata_json
       FROM evidence_records WHERE evidence_id = $1`,
      [evidenceId],
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      evidence_id: row.evidence_id,
      bundle_id: row.bundle_id,
      source_type: row.source_type,
      label: row.label,
      available: row.available,
      retrieval_time: row.retrieval_time.toISOString(),
      record_hash: row.record_hash,
      raw_metadata_json: row.raw_metadata_json ?? {},
    };
  }

  async ingestOperationalEvent(input: {
    correlationId: string;
    eventType: string;
    payload: Record<string, unknown>;
    fireblocksTxId?: string;
  }): Promise<string> {
    const id = randomUUID();
    await this.pool.query(
      `INSERT INTO operational_events (id, correlation_id, event_type, source, fireblocks_tx_id, payload_json)
       VALUES ($1, $2, $3, 'fireblocks_webhook', $4, $5)`,
      [id, input.correlationId, input.eventType, input.fireblocksTxId ?? null, JSON.stringify(input.payload)],
    );
    return id;
  }

  async getLastWebhookIngestionTime(): Promise<string | undefined> {
    const result = await this.pool.query(
      `SELECT ingested_at FROM operational_events ORDER BY ingested_at DESC LIMIT 1`,
    );
    const row = result.rows[0];
    return row ? row.ingested_at.toISOString() : undefined;
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
