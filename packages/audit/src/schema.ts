/** Append-only audit_events table — matches infra/docker/init.sql */
export const AUDIT_TABLE_DDL = `
CREATE TABLE IF NOT EXISTS audit_events (
  id UUID PRIMARY KEY,
  correlation_id UUID NOT NULL,
  event_type VARCHAR(64) NOT NULL,
  actor_id UUID,
  resource_type VARCHAR(128),
  action VARCHAR(128),
  outcome VARCHAR(16) NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}',
  timestamp TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_correlation ON audit_events(correlation_id);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_events(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_events(timestamp);
CREATE INDEX IF NOT EXISTS idx_audit_event_type ON audit_events(event_type);
`;

/** Enforces append-only semantics at the database layer (SR-3.3). */
export const AUDIT_IMMUTABILITY_DDL = `
CREATE OR REPLACE FUNCTION prevent_audit_events_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_events is append-only: UPDATE and DELETE are forbidden';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_events_immutable ON audit_events;
CREATE TRIGGER audit_events_immutable
  BEFORE UPDATE OR DELETE ON audit_events
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_events_mutation();
`;

export const AUDIT_DDL = `${AUDIT_TABLE_DDL}\n${AUDIT_IMMUTABILITY_DDL}`;
