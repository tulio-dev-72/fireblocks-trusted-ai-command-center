import { useEffect, useState } from "react";
import { Shell } from "./components/Shell";
import { HomePage } from "./components/HomePage";
import { DelayedPaymentsInvestigator } from "./components/DelayedPaymentsInvestigator";
import { ConnectionStatusPage } from "./components/ConnectionStatusPage";
import { EvidencePanel } from "./components/EvidencePanel";
import { TrustCenterPage } from "./components/TrustCenterPage";
import { AuditLogPage } from "./components/AuditLogPage";
import { ArchitecturePage } from "./components/ArchitecturePage";
import { SandboxDataReadinessPage } from "./components/SandboxDataReadinessPage";
import { FireblocksAuthDiagnosticsPage } from "./components/FireblocksAuthDiagnosticsPage";
import { UsageAnalyticsPage } from "./components/UsageAnalyticsPage";
import { DataModeBanner } from "./components/ProvenanceBadge";
import { SecurityBanner } from "./components/SecurityBanner";
import { API_URL } from "./lib/api";
import { PAGE_VIEW_EVENTS, promptIdFromText, trackProductEvent } from "./lib/analytics";
import type { Page } from "./lib/navigation";

interface DataModeInfo {
  mode: string;
  demo_mode: boolean;
}

export function App() {
  const [page, setPage] = useState<Page>("home");
  const [dataMode, setDataMode] = useState<DataModeInfo | null>(null);
  const [auditCorrelation, setAuditCorrelation] = useState<string | undefined>();
  const [investigationPrompt, setInvestigationPrompt] = useState<string | undefined>();

  useEffect(() => {
    fetch(`${API_URL}/v1/data-mode`)
      .then((r) => r.json())
      .then(setDataMode)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const event = PAGE_VIEW_EVENTS[page];
    if (event) {
      trackProductEvent(event, { page });
    }
  }, [page]);

  function navigate(next: Page) {
    setPage(next);
  }

  function startInvestigation(prompt?: string) {
    if (prompt) {
      trackProductEvent("investigation_prompt_clicked", {
        page: "home",
        prompt_id: promptIdFromText(prompt),
      });
    }
    setInvestigationPrompt(prompt);
    setPage("investigator");
  }

  return (
    <Shell page={page} onNavigate={navigate} dataMode={dataMode?.mode}>
      <SecurityBanner />
      {dataMode && (
        <DataModeBanner mode={dataMode.mode} demoMode={dataMode.demo_mode} />
      )}

      {page === "home" && (
        <HomePage
          onStartInvestigation={startInvestigation}
          onNavigate={navigate}
        />
      )}
      {page === "investigator" && (
        <DelayedPaymentsInvestigator
          initialQuestion={investigationPrompt}
          onInvestigationComplete={(correlationId) => {
            setAuditCorrelation(correlationId);
          }}
          onViewAudit={() => setPage("audit")}
        />
      )}
      {page === "connection" && <ConnectionStatusPage />}
      {page === "sandbox-readiness" && <SandboxDataReadinessPage />}
      {page === "fb-auth" && <FireblocksAuthDiagnosticsPage />}
      {page === "evidence" && <EvidencePanel />}
      {page === "trust" && <TrustCenterPage />}
      {page === "audit" && <AuditLogPage correlationFilter={auditCorrelation} />}
      {page === "architecture" && <ArchitecturePage />}
      {page === "usage" && <UsageAnalyticsPage />}
    </Shell>
  );
}
