import type {
  AuditTimelineEvent,
  DelayedPaymentsInvestigationResponse,
  EscalationSummaryResponse,
  FireblocksSyncInfo,
  InvestigationMode,
  InvestigationStatus,
  SandboxDataReadiness,
} from "@taicc/shared-types";
import { useEffect, useState } from "react";
import { apiGet } from "../lib/api";
import {
  investigationModeFocus,
  MODE_LABELS,
  modelProviderLabel,
} from "../lib/investigation-modes";
import { ProvenanceBadge } from "./ProvenanceBadge";
import { InvestigationDelayChart } from "./InvestigationDelayChart";
import { InvestigationEvidencePanel } from "./InvestigationEvidencePanel";

const REASON_COLORS: Record<string, string> = {
  approval_pending: "reason-approval",
  policy_blocked: "reason-policy",
  insufficient_balance: "reason-balance",
  failed_transfer: "reason-failed",
  network_delay: "reason-network",
};

interface Props {
  question: string;
  mode: InvestigationMode;
  status: InvestigationStatus | null;
  phase: string | null;
  correlationId: string | null;
  timeline: AuditTimelineEvent[];
  webhookEventCount?: number;
  result: DelayedPaymentsInvestigationResponse | null;
  error: string | null;
  running: boolean;
  escalation: EscalationSummaryResponse | null;
  escalating: boolean;
  onPrepareEscalation: () => void;
  onViewAudit?: () => void;
  onNewInvestigation: () => void;
}

function phaseLabel(phase: string | null, running: boolean): string {
  if (!running) return "Complete";
  switch (phase) {
    case "initializing":
      return "Initializing investigation…";
    case "retrieving_evidence":
      return "Retrieving live Fireblocks evidence…";
    case "complete":
      return "Analysis complete";
    case "failed":
      return "Investigation failed";
    default:
      return phase ? phase.replace(/_/g, " ") : "Running…";
  }
}

export function InvestigationWorkspace({
  question,
  mode,
  status,
  phase,
  correlationId,
  timeline,
  webhookEventCount = 0,
  result,
  error,
  running,
  escalation,
  escalating,
  onPrepareEscalation,
  onViewAudit,
  onNewInvestigation,
}: Props) {
  const analysis = result?.analysis;
  const [syncInfo, setSyncInfo] = useState<FireblocksSyncInfo | null>(null);

  useEffect(() => {
    apiGet<SandboxDataReadiness>("/v1/fireblocks/sandbox-readiness")
      .then((readiness) => {
        setSyncInfo({
          timestamp: readiness.checked_at,
          environment: readiness.sandbox_mode ? "Sandbox" : "Production",
          connection_state: readiness.connected
            ? "active"
            : readiness.investigation_ready
              ? "degraded"
              : "disconnected",
          last_successful_retrieval: readiness.last_successful_sync,
        });
      })
      .catch(() => setSyncInfo(null));
  }, [correlationId]);

  return (
    <div className="investigation-workspace">
      <header className="workspace-header panel">
        <div>
          <div className="workflow-tag">Workflow · Delayed Payments Investigator</div>
          <h2>{question}</h2>
          <p className="workspace-subtitle">
            Live orchestration — evidence retrieval, policy checks, and AI analysis stream from
            the audit log as they occur.
          </p>
        </div>
        <div className="workspace-header-actions">
          <span className={`workspace-status status-${status ?? "running"}`}>
            {running ? phaseLabel(phase, true) : status === "failed" ? "Failed" : "Complete"}
          </span>
          <button type="button" className="btn-secondary" onClick={onNewInvestigation}>
            New investigation
          </button>
        </div>
      </header>

      {error && <div className="error-banner">{error}</div>}

      <div className="workspace-grid">
        <aside className="workspace-column workspace-timeline panel">
          <div className="panel-header">
            <h3>Orchestration Timeline</h3>
            <span className="meta-chip">{timeline.length} events</span>
            {webhookEventCount > 0 && (
              <span className="meta-chip">{webhookEventCount} webhooks</span>
            )}
          </div>
          <p className="workspace-timeline-caption">
            Streamed from the append-only audit log as each step is recorded.
          </p>
          {timeline.length === 0 ? (
            <p className="empty workspace-waiting">
              {running ? "Waiting for audit events…" : "No timeline events recorded."}
            </p>
          ) : (
            <ol className="workspace-timeline-list">
              {timeline.map((event) => (
                <li
                  key={event.id}
                  className={`workspace-timeline-item outcome-${event.outcome}`}
                >
                  <div className="workspace-timeline-marker" aria-hidden />
                  <div className="workspace-timeline-body">
                    <div className="workspace-timeline-top">
                      <strong>{event.label}</strong>
                      <time>{new Date(event.timestamp).toLocaleTimeString()}</time>
                    </div>
                    {event.detail && <p>{event.detail}</p>}
                    <span className={`outcome-badge ${event.outcome}`}>{event.outcome}</span>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </aside>

        <main className="workspace-column workspace-analysis panel">
          {!result && running && (
            <div className="workspace-loading">
              <div className="workspace-loading-pulse" />
              <p>{phaseLabel(phase, true)}</p>
              <p className="workspace-loading-note">
                Analysis appears here when evidence retrieval and AI synthesis finish.
              </p>
            </div>
          )}

          {result && (
            <>
              <div className="panel-header">
                <h3>Operational Intelligence Assessment</h3>
                <ProvenanceBadge provenance={result.provenance} />
              </div>

              <p className="analysis-summary">{result.summary}</p>
              <p className="analysis-explanation">{result.explanation}</p>

              {analysis && (
                <div className="institutional-analysis">
                  <dl className="analysis-dl">
                    <dt>Operational Impact</dt>
                    <dd>{analysis.operational_impact}</dd>
                    <dt>Root Cause</dt>
                    <dd>{analysis.root_cause}</dd>
                    <dt>Evidence</dt>
                    <dd>{analysis.evidence}</dd>
                    <dt>Recommended Action</dt>
                    <dd>{analysis.recommended_action}</dd>
                    <dt>Audit Reference</dt>
                    <dd className="mono">{analysis.audit_reference}</dd>
                  </dl>
                  {analysis.missing_evidence.length > 0 && (
                    <p className="missing-evidence">
                      Missing evidence: {analysis.missing_evidence.join("; ")}
                    </p>
                  )}
                </div>
              )}

              <div className="delay-groups">
                {result.delay_groups.map((group) => (
                  <div
                    key={group.reason}
                    className={`delay-group-card ${REASON_COLORS[group.reason] ?? ""}`}
                  >
                    <div className="delay-group-header">
                      <strong>{group.label}</strong>
                      <span className="delay-count">{group.count}</span>
                    </div>
                    <p>{group.summary}</p>
                  </div>
                ))}
              </div>

              <InvestigationDelayChart groups={result.delay_groups} />

              <InvestigationEvidencePanel
                result={result}
                transparency={result.transparency}
                syncInfo={syncInfo}
                timeline={timeline}
              />

              <section className="workspace-ai-section">
                <h4>Operational Analysis</h4>
                <p className="ai-answer">{result.ai_answer}</p>
                {result.citations.length > 0 && (
                  <ul className="citation-list">
                    {result.citations.map((c) => (
                      <li key={c.id}>
                        <code>[{c.evidence_id}]</code> {c.label}: {c.excerpt}
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="workspace-recommendations">
                <h4>Recommended Next Actions</h4>
                <ul className="recommendation-list">
                  {result.recommendations.map((rec, i) => (
                    <li key={i} className={`rec rec-${rec.priority}`}>
                      <strong>[{rec.priority}]</strong> {rec.action}
                      <p className="rec-rationale">{rec.rationale}</p>
                    </li>
                  ))}
                </ul>
              </section>

              {escalation && (
                <section className="escalation-panel">
                  <h4>{escalation.title}</h4>
                  <p>{escalation.summary}</p>
                  <ul className="escalation-list">
                    {escalation.recommended_actions.map((a, i) => (
                      <li key={i}>{a}</li>
                    ))}
                  </ul>
                </section>
              )}
            </>
          )}
        </main>

        <aside className="workspace-column workspace-meta panel">
          <h3>Investigation Context</h3>
          <div className="mode-focus-callout">
            <span className="mode-focus-tag">{MODE_LABELS[mode]} lens</span>
            <p>{investigationModeFocus(mode)}</p>
          </div>
          <dl className="workspace-meta-dl">
            <dt>Mode</dt>
            <dd>{MODE_LABELS[mode]}</dd>
            <dt>Status</dt>
            <dd className={`status-value status-${status ?? "running"}`}>
              {status ?? "starting"}
            </dd>
            {phase && running && (
              <>
                <dt>Phase</dt>
                <dd>{phase.replace(/_/g, " ")}</dd>
              </>
            )}
            {correlationId && (
              <>
                <dt>Correlation</dt>
                <dd className="mono">{correlationId.slice(0, 8)}…</dd>
              </>
            )}
            {webhookEventCount > 0 && (
              <>
                <dt>Webhook events</dt>
                <dd>{webhookEventCount}</dd>
              </>
            )}
            {result?.transparency && (
              <>
                <dt>Severity</dt>
                <dd>{result.transparency.operational_severity.replace(/_/g, " ")}</dd>
              </>
            )}
            {result && (
              <>
                <dt>Confidence</dt>
                <dd className={`confidence-${analysis?.confidence ?? "medium"}`}>
                  {(analysis?.confidence ?? "medium").toUpperCase()}
                </dd>
                <dt>Model</dt>
                <dd>{modelProviderLabel(result.model_provider)}</dd>
                <dt>Delayed</dt>
                <dd>{result.delayed_payment_count}</dd>
                <dt>Pending approval</dt>
                <dd>{result.pending_approval_count}</dd>
                <dt>Evidence cards</dt>
                <dd>{result.evidence_cards.length}</dd>
                <dt>Prompt logged</dt>
                <dd>{result.prompt_logged ? "Yes" : "No"}</dd>
                <dt>RBAC enforced</dt>
                <dd>{result.rbac_enforced ? "Yes" : "No"}</dd>
              </>
            )}
          </dl>

          {result && (
            <div className="workspace-meta-actions">
              <button
                type="button"
                className="btn-primary"
                onClick={onPrepareEscalation}
                disabled={escalating}
              >
                {escalating ? "Preparing…" : "Prepare Escalation Summary"}
              </button>
              {onViewAudit && correlationId && (
                <button type="button" className="btn-secondary" onClick={onViewAudit}>
                  Full audit trail
                </button>
              )}
            </div>
          )}

          <p className="operational-boundary-footnote">
            Operational boundary: investigations are read-only. Transfers and policy changes require
            human approval in Fireblocks.
          </p>
        </aside>
      </div>
    </div>
  );
}
