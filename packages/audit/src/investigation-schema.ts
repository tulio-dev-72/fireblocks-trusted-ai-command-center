export const INVESTIGATIONS_DDL = `
CREATE TABLE IF NOT EXISTS investigations (
  correlation_id UUID PRIMARY KEY,
  workflow VARCHAR(64) NOT NULL,
  mode VARCHAR(32) NOT NULL DEFAULT 'operations',
  question TEXT NOT NULL,
  status VARCHAR(16) NOT NULL,
  phase VARCHAR(64),
  actor_id UUID,
  result_json JSONB,
  error TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_investigations_status ON investigations(status);
CREATE INDEX IF NOT EXISTS idx_investigations_started ON investigations(started_at DESC);
`;
