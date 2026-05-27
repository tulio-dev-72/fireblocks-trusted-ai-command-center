import { useState } from "react";
import type {
  DelayedPaymentsInvestigationResponse,
  EscalationSummaryResponse,
} from "@taicc/shared-types";
import { apiPost } from "../lib/api";
import { ProvenanceBadge } from "./ProvenanceBadge";
import { InvestigationDelayChart } from "./InvestigationDelayChart";
import { WorkflowStepper } from "./WorkflowStepper";

const DEFAULT_QUESTION =
  "Which non-final transactions are delayed, and what Fireblocks status or approval state is blocking settlement?";

const REASON_COLORS: Record<string, string> = {
  approval_pending: "reason-approval",
  policy_blocked: "reason-policy",
  insufficient_balance: "reason-balance",
  failed_transfer: "reason-failed",
  network_delay: "reason-network",
};

interface Props {
  onInvestigationComplete?: (correlationId: string) => void;
  onViewAudit?: () => void;
}

export function DelayedPaymentsInvestigator({
  onInvestigationComplete,
  onViewAudit,
}: Props) {
  const [question, setQuestion] = useState(DEFAULT_QUESTION);
  const [step, setStep] = useState(0);
  const [result, setResult] = useState<DelayedPaymentsInvestigationResponse | null>(null);
  const [escalation, setEscalation] = useState<EscalationSummaryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [escalating, setEscalating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function investigate() {
    setLoading(true);
    setError(null);
    setEscalation(null);
    try {
      const data = await apiPost<DelayedPaymentsInvestigationResponse>(
        "/v1/workflows/delayed-payments/investigate",
        { question },
      );
      setResult(data);
      setStep(3);
      onInvestigationComplete?.(data.correlation_id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Investigation failed");
    } finally {
      setLoading(false);
    }
  }

  async function prepareEscalation() {
    if (!result) return;
    setEscalating(true);
    try {
      const summary = await apiPost<EscalationSummaryResponse>(
        "/v1/workflows/delayed-payments/escalation-summary",
        {
          correlation_id: result.correlation_id,
          investigation_summary: result.summary,
        },
      );
      setEscalation(summary);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Escalation failed");
    } finally {
      setEscalating(false);
    }
  }

  const steps = ["Intake", "Analysis", "Evidence", "Recommendation"];

  return (
    <div className="investigator">
      <WorkflowStepper steps={steps} current={step} onStepClick={setStep} />

      {step === 0 && (
        <section className="panel investigator-ask">
          <div className="workflow-tag">Workflow · Delayed Payments Investigator</div>
          <h2>Investigate delayed treasury payments</h2>
          <p className="panel-desc">
            Retrieves live Fireblocks transactions, approvals, balances, and policy records.
            Classifies root causes, builds an evidence bundle, and returns a cited operational
            analysis. Read-only — no transaction execution.
          </p>
          <div className="execution-boundary">
            Execution boundary enforced: AI may investigate and recommend only. All transfers
            require human approval in the Fireblocks console.
          </div>
          <div className="treasury-input">
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              className="treasury-question-input"
            />
            <button className="btn-primary" onClick={investigate} disabled={loading}>
              {loading ? "Investigating…" : "Investigate"}
            </button>
          </div>
          {error && <div className="error-banner">{error}</div>}
        </section>
      )}

      {result && step >= 1 && (
        <>
          <section className="panel">
            <div className="panel-header">
              <h2>Root Cause Analysis</h2>
              <ProvenanceBadge provenance={result.provenance} />
            </div>
            <p className="analysis-summary">{result.summary}</p>
            <p className="analysis-explanation">{result.explanation}</p>

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
              {result.delay_groups.length === 0 && (
                <p className="empty">No delayed payments detected in sandbox.</p>
              )}
            </div>

            <InvestigationDelayChart groups={result.delay_groups} />

            <div className="analysis-stats">
              <span>{result.delayed_payment_count} delayed</span>
              <span>{result.pending_approval_count} pending approval</span>
              <span>Model: {result.model_provider}</span>
            </div>
          </section>

          {step >= 2 && (
            <section className="panel">
              <h2>Evidence Cards</h2>
              <div className="evidence-cards-grid">
                {result.evidence_cards.map((card) => (
                  <div key={card.id} className="evidence-card">
                    <div className="evidence-card-top">
                      <span className={`reason-tag ${REASON_COLORS[card.reason ?? ""] ?? ""}`}>
                        {card.title}
                      </span>
                      <ProvenanceBadge provenance={card.provenance} compact />
                    </div>
                    <p className="evidence-card-sub">{card.subtitle}</p>
                    <dl className="evidence-card-meta">
                      {card.status && (
                        <>
                          <dt>Status</dt>
                          <dd>{card.status}</dd>
                        </>
                      )}
                      {card.amount && (
                        <>
                          <dt>Amount</dt>
                          <dd>
                            {card.amount} {card.asset}
                          </dd>
                        </>
                      )}
                      <dt>Ref</dt>
                      <dd className="mono">{card.transaction_id?.slice(0, 14)}…</dd>
                    </dl>
                  </div>
                ))}
              </div>
            </section>
          )}

          {step >= 3 && (
            <>
              <section className="panel ai-answer-panel">
                <div className="panel-header">
                  <h2>Operational Analysis</h2>
                  <div className="ai-meta">
                    <span className="meta-chip">{result.model_provider}</span>
                    {result.prompt_logged && <span className="meta-chip">Prompt logged</span>}
                    {result.rbac_enforced && <span className="meta-chip">RBAC enforced</span>}
                  </div>
                </div>
                <p className="ai-answer">{result.ai_answer}</p>
                <p className="mono correlation-id">
                  Correlation: {result.correlation_id}
                  {onViewAudit && (
                    <>
                      {" · "}
                      <button type="button" className="link-button" onClick={onViewAudit}>
                        View audit trail
                      </button>
                    </>
                  )}
                </p>
                {result.citations.length > 0 && (
                  <div className="citations">
                    <h3>Citations</h3>
                    <ul>
                      {result.citations.map((c) => (
                        <li key={c.id}>
                          <code>[{c.evidence_id}]</code> {c.label}: {c.excerpt}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </section>

              <section className="panel">
                <h2>Recommended Next Actions</h2>
                <ul className="recommendation-list">
                  {result.recommendations.map((rec, i) => (
                    <li key={i} className={`rec rec-${rec.priority}`}>
                      <strong>[{rec.priority}]</strong> {rec.action}
                      <p className="rec-rationale">{rec.rationale}</p>
                    </li>
                  ))}
                </ul>
                <div className="escalation-actions">
                  <button
                    className="btn-primary"
                    onClick={prepareEscalation}
                    disabled={escalating}
                  >
                    {escalating ? "Preparing…" : "Prepare Escalation Summary"}
                  </button>
                  <span className="escalation-note">
                    Draft only — requires human approval before any outbound action
                  </span>
                </div>
              </section>

              {escalation && (
                <section className="panel escalation-panel">
                  <h2>{escalation.title}</h2>
                  <p>{escalation.summary}</p>
                  <ul className="escalation-list">
                    {escalation.recommended_actions.map((a, i) => (
                      <li key={i}>{a}</li>
                    ))}
                  </ul>
                  <p className="mono correlation-id">
                    Correlation: {escalation.correlation_id}
                  </p>
                </section>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
