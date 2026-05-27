import { useEffect, useState } from "react";
import type { EscalationSummaryResponse, InvestigationMode } from "@taicc/shared-types";
import { apiPost } from "../lib/api";
import { useInvestigationStream } from "../hooks/useInvestigationStream";
import { InvestigationWorkspace } from "./InvestigationWorkspace";

const DEFAULT_QUESTION = "Why are these treasury payments delayed?";

const INVESTIGATION_MODES: { value: InvestigationMode; label: string; hint: string }[] = [
  { value: "operations", label: "Operations", hint: "Day-to-day treasury ops focus" },
  { value: "treasury", label: "Treasury", hint: "Liquidity and settlement lens" },
  { value: "risk", label: "Risk", hint: "Exposure and control emphasis" },
  { value: "compliance", label: "Compliance", hint: "Policy and audit trail focus" },
  { value: "executive", label: "Executive", hint: "Concise impact summary" },
];

interface Props {
  initialQuestion?: string;
  onInvestigationComplete?: (correlationId: string) => void;
  onViewAudit?: () => void;
}

export function DelayedPaymentsInvestigator({
  initialQuestion,
  onInvestigationComplete,
  onViewAudit,
}: Props) {
  const [question, setQuestion] = useState(initialQuestion ?? DEFAULT_QUESTION);
  const [mode, setMode] = useState<InvestigationMode>("operations");
  const [started, setStarted] = useState(false);
  const [escalation, setEscalation] = useState<EscalationSummaryResponse | null>(null);
  const [escalating, setEscalating] = useState(false);

  const stream = useInvestigationStream();
  const [localError, setLocalError] = useState<string | null>(null);

  async function investigate() {
    setEscalation(null);
    setLocalError(null);
    setStarted(true);
    await stream.start(question, mode);
  }

  useEffect(() => {
    if (stream.status === "completed" && stream.correlationId) {
      onInvestigationComplete?.(stream.correlationId);
    }
  }, [stream.status, stream.correlationId, onInvestigationComplete]);

  async function prepareEscalation() {
    if (!stream.result) return;
    setEscalating(true);
    try {
      const summary = await apiPost<EscalationSummaryResponse>(
        "/v1/workflows/delayed-payments/escalation-summary",
        {
          correlation_id: stream.result.correlation_id,
          investigation_summary: stream.result.summary,
        },
      );
      setEscalation(summary);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "Escalation failed");
    } finally {
      setEscalating(false);
    }
  }

  function handleNewInvestigation() {
    stream.reset();
    setEscalation(null);
    setStarted(false);
  }

  if (started) {
    return (
      <InvestigationWorkspace
        question={question}
        mode={mode}
        status={stream.status}
        phase={stream.phase}
        correlationId={stream.correlationId}
        timeline={stream.timeline}
        webhookEventCount={stream.webhookEventCount}
        result={stream.result}
        error={stream.error ?? localError}
        running={stream.running}
        escalation={escalation}
        escalating={escalating}
        onPrepareEscalation={prepareEscalation}
        onViewAudit={onViewAudit}
        onNewInvestigation={handleNewInvestigation}
      />
    );
  }

  return (
    <div className="investigator">
      <section className="panel investigator-ask">
        <div className="workflow-tag">Workflow · Delayed Payments Investigator</div>
        <h2>Investigate delayed treasury payments</h2>
        <p className="panel-desc">
          Starts an async investigation against live Fireblocks data. The orchestration log updates
          in real time as evidence is retrieved, policies are evaluated, and AI analysis completes.
        </p>

        <div className="investigation-mode-picker">
          <span className="mode-picker-label">Investigation mode</span>
          <div className="mode-picker-options">
            {INVESTIGATION_MODES.map((option) => (
              <label key={option.value} className={`mode-option ${mode === option.value ? "selected" : ""}`}>
                <input
                  type="radio"
                  name="investigation-mode"
                  value={option.value}
                  checked={mode === option.value}
                  onChange={() => setMode(option.value)}
                />
                <span className="mode-option-label">{option.label}</span>
                <span className="mode-option-hint">{option.hint}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="treasury-input">
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            className="treasury-question-input"
            placeholder="What should we investigate?"
          />
          <button className="btn-primary" onClick={investigate} disabled={stream.running}>
            {stream.running ? "Starting…" : "Start Investigation"}
          </button>
        </div>

        <p className="operational-boundary-footnote">
          Operational boundary: read-only investigation. No transaction execution from this workspace.
        </p>

        {stream.error && <div className="error-banner">{stream.error}</div>}
        {localError && <div className="error-banner">{localError}</div>}
      </section>
    </div>
  );
}
