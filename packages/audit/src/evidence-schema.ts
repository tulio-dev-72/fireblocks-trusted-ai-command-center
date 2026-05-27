export const EVIDENCE_DDL = `
CREATE TABLE IF NOT EXISTS evidence_bundles (
  bundle_id UUID PRIMARY KEY,
  correlation_id UUID NOT NULL,
  tenant_id VARCHAR(128) NOT NULL DEFAULT 'default',
  source_type VARCHAR(64) NOT NULL,
  retrieval_time TIMESTAMPTZ NOT NULL,
  record_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS evidence_records (
  evidence_id VARCHAR(128) PRIMARY KEY,
  bundle_id UUID NOT NULL REFERENCES evidence_bundles(bundle_id),
  tenant_id VARCHAR(128) NOT NULL DEFAULT 'default',
  source_type VARCHAR(64) NOT NULL,
  source_id VARCHAR(256),
  retrieval_time TIMESTAMPTZ NOT NULL,
  record_hash VARCHAR(128) NOT NULL,
  raw_metadata_json JSONB NOT NULL DEFAULT '{}',
  label VARCHAR(256),
  available BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_evidence_bundle_correlation ON evidence_bundles(correlation_id);
CREATE INDEX IF NOT EXISTS idx_evidence_records_bundle ON evidence_records(bundle_id);
`;

export const OPERATIONAL_EVENTS_DDL = `
CREATE TABLE IF NOT EXISTS operational_events (
  id UUID PRIMARY KEY,
  correlation_id UUID NOT NULL,
  event_type VARCHAR(128) NOT NULL,
  source VARCHAR(64) NOT NULL DEFAULT 'fireblocks_webhook',
  fireblocks_tx_id VARCHAR(128),
  payload_json JSONB NOT NULL DEFAULT '{}',
  ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_operational_events_correlation ON operational_events(correlation_id);
CREATE INDEX IF NOT EXISTS idx_operational_events_tx ON operational_events(fireblocks_tx_id);
`;
