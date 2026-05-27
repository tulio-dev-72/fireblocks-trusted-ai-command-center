import type {
  AuditTimelineEvent,
  DelayedPaymentsInvestigationResponse,
  EvidenceSourceBreakdown,
  FireblocksSyncInfo,
  InvestigationTransparency,
} from "@taicc/shared-types";
import { OperationalSeverityLabels } from "@taicc/shared-types";
import { EvidenceGraphView } from "./EvidenceGraphView";
import { ExpandableEvidenceCard } from "./ExpandableEvidenceCard";

function SourceBreakdownList({ breakdown }: { breakdown: EvidenceSourceBreakdown }) {
  const entries: [keyof EvidenceSourceBreakdown, number][] = [
    ["REAL_FIREBLOCKS_SANDBOX", breakdown.REAL_FIREBLOCKS_SANDBOX],
    ["WEBHOOK_EVENTS", breakdown.WEBHOOK_EVENTS],
    ["POLICY_RECORDS", breakdown.POLICY_RECORDS],
    ["APPROVAL_RECORDS", breakdown.APPROVAL_RECORDS],
    ["DERIVED_AI", breakdown.DERIVED_AI],
    ["DEMO_SEED", breakdown.DEMO_SEED],
  ];

  return (
    <dl className="source-breakdown-dl">
      {entries.map(([key, count]) => (
        <div key={key} className={`source-breakdown-row ${count === 0 ? "zero" : ""}`}>
          <dt>{key.replace(/_/g, " ")}</dt>
          <dd>{count}</dd>
        </div>
      ))}
    </dl>
  );
}

interface Props {
  result: DelayedPaymentsInvestigationResponse;
  transparency?: InvestigationTransparency;
  syncInfo: FireblocksSyncInfo | null;
  timeline: AuditTimelineEvent[];
}

const EXECUTION_PHASES = [
  { key: "evidence_retrieved", label: "Evidence retrieval" },
  { key: "policy_evaluation", label: "Policy filtering" },
  { key: "ai_prompt", label: "AI analysis initiated" },
  { key: "ai_response", label: "AI analysis complete" },
  { key: "workflow_executed", label: "Audit persistence & completion" },
];

export function InvestigationEvidencePanel({
  result,
  transparency,
  syncInfo,
  timeline,
}: Props) {
  const t = transparency ?? result.transparency;
  if (!t) return null;

  const phases = EXECUTION_PHASES.map((phase) => ({
    ...phase,
    events: timeline.filter((e) =>
      phase.key === "workflow_executed"
        ? e.event_type === "workflow_executed"
        : e.event_type === phase.key,
    ),
    done: timeline.some((e) =>
      phase.key === "workflow_executed"
        ? e.event_type === "workflow_executed" && e.metadata?.phase === "complete"
        : e.event_type === phase.key,
    ),
  }));

  return (
    <div className="investigation-evidence-panel">
      {t.partially_simulated && (
        <div className="truthfulness-banner warn">
          Partially simulated — DEMO_SEED evidence detected. Treat operational findings as mixed
          provenance.
        </div>
      )}

      {t.limited_activity_warning && (
        <div className="truthfulness-banner info">{t.limited_activity_warning}</div>
      )}

      <section className="transparency-section">
        <h4>Evidence Sources</h4>
        <SourceBreakdownList breakdown={t.source_breakdown} />
      </section>

      {syncInfo && (
        <section className="transparency-section">
          <h4>Last Fireblocks Sync</h4>
          <dl className="sync-info-dl">
            <dt>Timestamp</dt>
            <dd>{new Date(syncInfo.timestamp).toUTCString()}</dd>
            <dt>Environment</dt>
            <dd>{syncInfo.environment}</dd>
            <dt>Connection</dt>
            <dd className={`connection-${syncInfo.connection_state}`}>
              {syncInfo.connection_state === "active" ? "Active" : syncInfo.connection_state}
            </dd>
            {syncInfo.last_successful_retrieval && (
              <>
                <dt>Last successful retrieval</dt>
                <dd>{new Date(syncInfo.last_successful_retrieval).toUTCString()}</dd>
              </>
            )}
          </dl>
        </section>
      )}

      <section className="transparency-section">
        <h4>Operational Severity</h4>
        <p className={`severity-badge severity-${t.operational_severity}`}>
          {OperationalSeverityLabels[t.operational_severity]}
        </p>
        <p className="severity-rationale">{t.severity_rationale}</p>
      </section>

      <section className="transparency-section">
        <h4>Investigation Provenance</h4>
        <dl className="provenance-dl">
          <dt>Model</dt>
          <dd>
            {t.provenance.model_provider} · {t.provenance.model_id}
          </dd>
          <dt>Evidence count</dt>
          <dd>{t.provenance.evidence_count}</dd>
          <dt>Retrieval timestamp</dt>
          <dd>{new Date(t.provenance.retrieval_timestamp).toUTCString()}</dd>
          <dt>Confidence</dt>
          <dd className={`confidence-${t.provenance.confidence}`}>
            {t.provenance.confidence.toUpperCase()}
          </dd>
        </dl>
        <h5>Evidence coverage</h5>
        <SourceBreakdownList breakdown={t.provenance.source_breakdown} />
        {t.provenance.missing_evidence.length > 0 && (
          <div className="missing-evidence-block">
            <strong>Missing evidence</strong>
            <ul>
              {t.provenance.missing_evidence.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className="transparency-section">
        <h4>AI Transparency</h4>
        <ul className="ai-transparency-list">
          {t.provenance.ai_transparency.evidence_backed && <li>Evidence-backed</li>}
          {t.provenance.ai_transparency.audit_logged && <li>Audit logged</li>}
          {t.provenance.ai_transparency.rbac_enforced && <li>RBAC enforced</li>}
          {t.provenance.ai_transparency.read_only_fireblocks && <li>Read-only Fireblocks access</li>}
          {t.provenance.ai_transparency.no_autonomous_execution && (
            <li>No autonomous execution</li>
          )}
        </ul>
      </section>

      <section className="transparency-section">
        <h4>Investigation Execution Timeline</h4>
        <ol className="execution-phase-list">
          {phases.map((phase) => (
            <li key={phase.key} className={phase.done ? "done" : "pending"}>
              <strong>{phase.label}</strong>
              <span>{phase.events.length} audit event(s)</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="transparency-section">
        <h4>Traceable Identifiers</h4>
        <dl className="trace-ids-dl">
          <dt>Transaction IDs ({t.traceable_ids.transaction_ids.length})</dt>
          <dd className="mono trace-id-list">
            {t.traceable_ids.transaction_ids.length > 0
              ? t.traceable_ids.transaction_ids.slice(0, 8).join(", ")
              : "None retrieved"}
          </dd>
          <dt>Vault IDs ({t.traceable_ids.vault_ids.length})</dt>
          <dd className="mono trace-id-list">
            {t.traceable_ids.vault_ids.length > 0
              ? t.traceable_ids.vault_ids.slice(0, 8).join(", ")
              : "None retrieved"}
          </dd>
          <dt>Evidence IDs</dt>
          <dd className="mono">{t.traceable_ids.evidence_ids.join(", ")}</dd>
        </dl>
      </section>

      <section className="transparency-section">
        <h4>Evidence Graph</h4>
        <EvidenceGraphView nodes={t.graph_nodes} edges={t.graph_edges} />
      </section>

      <section className="transparency-section">
        <h4>Evidence Cards (expand for traceability)</h4>
        <div className="evidence-cards-grid">
          {result.evidence_cards.map((card) => (
            <ExpandableEvidenceCard key={card.id} card={card} />
          ))}
          {result.evidence_cards.length === 0 && (
            <p className="empty">No transaction-level evidence cards — sandbox may have limited activity.</p>
          )}
        </div>
      </section>
    </div>
  );
}
