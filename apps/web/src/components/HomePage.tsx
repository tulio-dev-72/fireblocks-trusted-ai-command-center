import { useEffect, useState } from "react";
import { apiGet } from "../lib/api";
import {
  buildApprovalMonitor,
  buildDelayRootCauses,
  buildLiquidityConcentration,
  buildPendingAgeBuckets,
  buildSettlementPipeline,
  type OperationalChartData,
} from "../lib/operational-metrics";
import type {
  ApprovalWorkflowRecord,
  BalanceRecord,
  TransactionRecord,
} from "@taicc/shared-types";
import type { Page } from "../lib/navigation";
import { OperationalCharts } from "./OperationalCharts";
import { SystemStatusPanel } from "./SystemStatusPanel";
import { InvestigationPromptCards } from "./InvestigationPromptCards";
import { OperationalReadinessCard } from "./OperationalReadinessCard";

interface ApiRecord<T> {
  data?: T;
  available: boolean;
  unavailable_reason?: string;
}

interface HomePageProps {
  onStartInvestigation: (prompt?: string) => void;
  onNavigate: (page: Page) => void;
}

export function HomePage({ onStartInvestigation, onNavigate }: HomePageProps) {
  const [chartData, setChartData] = useState<OperationalChartData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [nonFinalCount, setNonFinalCount] = useState(0);
  const [delayedCount, setDelayedCount] = useState(0);
  const [pendingApprovalCount, setPendingApprovalCount] = useState(0);

  useEffect(() => {
    async function load() {
      const errors: string[] = [];
      try {
        const [txRes, balanceRes, approvalRes] = await Promise.all([
          apiGet<ApiRecord<TransactionRecord[]>>("/v1/transactions").catch((err) => {
            errors.push(err instanceof Error ? err.message : "Transactions unavailable");
            return null;
          }),
          apiGet<ApiRecord<BalanceRecord[]>>("/v1/balances").catch((err) => {
            errors.push(err instanceof Error ? err.message : "Balances unavailable");
            return null;
          }),
          apiGet<ApiRecord<ApprovalWorkflowRecord[]>>("/v1/approvals").catch((err) => {
            errors.push(err instanceof Error ? err.message : "Approvals unavailable");
            return null;
          }),
        ]);

        const transactions =
          txRes?.available && txRes.data ? txRes.data : [];
        const balances =
          balanceRes?.available && balanceRes.data ? balanceRes.data : [];
        const approvals =
          approvalRes?.available && approvalRes.data ? approvalRes.data : [];

        if (txRes && !txRes.available) {
          errors.push(txRes.unavailable_reason ?? "Transactions not available from Fireblocks");
        }
        if (balanceRes && !balanceRes.available) {
          errors.push(balanceRes.unavailable_reason ?? "Balances not available from Fireblocks");
        }

        const nonFinal = transactions.filter(
          (t) => !["COMPLETED", "CANCELLED", "REJECTED", "BLOCKED"].includes(t.status),
        );
        setNonFinalCount(nonFinal.length);

        const delayGroups = buildDelayRootCauses(transactions, balances);
        setDelayedCount(delayGroups.reduce((sum, g) => sum + g.value, 0));

        setPendingApprovalCount(
          approvals.filter(
            (a) => a.status.includes("PENDING") || a.status.includes("AUTHORIZATION"),
          ).length,
        );

        setChartData({
          settlement: buildSettlementPipeline(transactions),
          delayCauses: delayGroups,
          approvals: buildApprovalMonitor(approvals),
          liquidity: buildLiquidityConcentration(balances),
          pendingAge: buildPendingAgeBuckets(transactions),
        });

        setLoadError(errors.length > 0 ? errors.join(" · ") : null);
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : "Failed to load Fireblocks data");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <div className="home-page">
      {loadError && <div className="error-banner">{loadError}</div>}

      <section className="home-hero">
        <span className="section-eyebrow">Operational Intelligence Command Center</span>
        <h2 className="treasury-title">Operational Intelligence Command Center</h2>
        <p className="treasury-lead">
          Evidence-backed operational intelligence built on top of Fireblocks infrastructure.
        </p>
        <p className="home-supporting-copy">
          Operational investigations across treasury operations, settlements, approvals, liquidity,
          and policy workflows using live operational evidence and governed AI reasoning.
        </p>
        <p className="home-trust-line">
          Fireblocks remains the trusted execution and governance layer. AI is used for operational
          reasoning, investigation, summarization, and recommendation generation.
        </p>
      </section>

      <section className="treasury-operations-header">
        <span className="section-eyebrow">Treasury Operations</span>
        <div className="operational-summary">
          <div className="summary-stat">
            <span className="summary-value">{loading ? "—" : nonFinalCount}</span>
            <span className="summary-label">Non-final transfers</span>
          </div>
          <div className="summary-stat">
            <span className="summary-value">{loading ? "—" : delayedCount}</span>
            <span className="summary-label">Delayed / blocked</span>
          </div>
          <div className="summary-stat">
            <span className="summary-value">{loading ? "—" : pendingApprovalCount}</span>
            <span className="summary-label">Pending authorization</span>
          </div>
        </div>
      </section>

      <InvestigationPromptCards onSelectPrompt={(prompt) => onStartInvestigation(prompt)} />

      <OperationalReadinessCard onNavigate={onNavigate} />

      {loading && !chartData ? (
        <OperationalCharts
          data={{
            settlement: [],
            delayCauses: [],
            approvals: [],
            liquidity: [],
            pendingAge: [],
          }}
          loading
        />
      ) : (
        chartData && <OperationalCharts data={chartData} />
      )}

      <section className="panel evidence-access-section">
        <span className="section-eyebrow">Evidence / Investigation Results</span>
        <h2>Evidence-backed analysis surfaces</h2>
        <p className="panel-desc">
          Review retrieved Fireblocks records, workflow outputs, and audit trails from the same
          operational session.
        </p>
        <div className="evidence-access-grid">
          <button type="button" className="access-card" onClick={() => onNavigate("evidence")}>
            <h3>Evidence Library</h3>
            <p>Transactions, approvals, balances, and policy bundles with provenance metadata.</p>
            <span className="access-link">Open library →</span>
          </button>
          <button type="button" className="access-card" onClick={() => onNavigate("investigator")}>
            <h3>AI Operational Analysis</h3>
            <p>Run or review investigations with cited evidence and institutional recommendations.</p>
            <span className="access-link">Open investigator →</span>
          </button>
          <button type="button" className="access-card" onClick={() => onNavigate("audit")}>
            <h3>Audit Trail</h3>
            <p>Prompt, retrieval, policy, and workflow events correlated by investigation ID.</p>
            <span className="access-link">View audit log →</span>
          </button>
        </div>
      </section>

      <SystemStatusPanel demoted />

      <section className="infrastructure-footer">
        <span className="section-eyebrow">Architecture / Trust Details</span>
        <div className="infrastructure-links">
          <button type="button" className="infra-link" onClick={() => onNavigate("trust")}>
            Trust Center
          </button>
          <button type="button" className="infra-link" onClick={() => onNavigate("architecture")}>
            Architecture
          </button>
          <button type="button" className="infra-link" onClick={() => onNavigate("connection")}>
            Fireblocks Link
          </button>
        </div>
      </section>
    </div>
  );
}
