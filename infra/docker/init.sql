-- Trusted AI Command Center — database initialization
-- Audit table is append-only (SR-3.3)

CREATE TABLE IF NOT EXISTS audit_events (
  id UUID PRIMARY KEY,
  correlation_id UUID NOT NULL,
  event_type VARCHAR(64) NOT NULL,
  actor_id UUID,
  resource_type VARCHAR(128),
  action VARCHAR(128),
  outcome VARCHAR(16) NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}',
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_correlation ON audit_events(correlation_id);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_events(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_events(timestamp);

CREATE TABLE IF NOT EXISTS policy_rules (
  id UUID PRIMARY KEY,
  name VARCHAR(256) NOT NULL,
  version INT NOT NULL DEFAULT 1,
  enabled BOOLEAN NOT NULL DEFAULT true,
  priority INT NOT NULL DEFAULT 100,
  conditions JSONB NOT NULL DEFAULT '{}',
  action VARCHAR(32) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS operations (
  id UUID PRIMARY KEY,
  correlation_id UUID NOT NULL,
  actor_id UUID NOT NULL,
  agent_id UUID,
  resource_type VARCHAR(128) NOT NULL,
  action VARCHAR(128) NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  status VARCHAR(32) NOT NULL DEFAULT 'pending',
  policy_decision JSONB,
  fireblocks_tx_id VARCHAR(256),
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS approval_requests (
  id UUID PRIMARY KEY,
  operation_id UUID NOT NULL REFERENCES operations(id),
  requested_by UUID NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'pending',
  approver_id UUID,
  reason TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS agents (
  id UUID PRIMARY KEY,
  name VARCHAR(256) NOT NULL,
  description TEXT,
  capabilities JSONB NOT NULL DEFAULT '[]',
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
