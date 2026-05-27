import { useEffect, useState } from "react";
import { Shell } from "./components/Shell";
import { HomePage } from "./components/HomePage";
import { DelayedPaymentsInvestigator } from "./components/DelayedPaymentsInvestigator";
import { ConnectionStatusPage } from "./components/ConnectionStatusPage";
import { EvidencePanel } from "./components/EvidencePanel";
import { TrustCenterPage } from "./components/TrustCenterPage";
import { AuditLogPage } from "./components/AuditLogPage";
import { ArchitecturePage } from "./components/ArchitecturePage";
import { DataModeBanner } from "./components/ProvenanceBadge";
import { SecurityBanner } from "./components/SecurityBanner";
import { API_URL } from "./lib/api";
import type { Page } from "./lib/navigation";

interface DataModeInfo {
  mode: string;
  demo_mode: boolean;
}

export function App() {
  const [page, setPage] = useState<Page>("home");
  const [dataMode, setDataMode] = useState<DataModeInfo | null>(null);
  const [auditCorrelation, setAuditCorrelation] = useState<string | undefined>();

  useEffect(() => {
    fetch(`${API_URL}/v1/data-mode`)
      .then((r) => r.json())
      .then(setDataMode)
      .catch(() => undefined);
  }, []);

  function navigate(next: Page) {
    setPage(next);
  }

  return (
    <Shell page={page} onNavigate={navigate} dataMode={dataMode?.mode}>
      <SecurityBanner />
      {dataMode && (
        <DataModeBanner mode={dataMode.mode} demoMode={dataMode.demo_mode} />
      )}

      {page === "home" && (
        <HomePage
          onStartInvestigation={() => {
            setPage("investigator");
          }}
          onNavigate={navigate}
        />
      )}
      {page === "investigator" && (
        <DelayedPaymentsInvestigator
          onInvestigationComplete={(correlationId) => {
            setAuditCorrelation(correlationId);
          }}
          onViewAudit={() => setPage("audit")}
        />
      )}
      {page === "connection" && <ConnectionStatusPage />}
      {page === "evidence" && <EvidencePanel />}
      {page === "trust" && <TrustCenterPage />}
      {page === "audit" && <AuditLogPage correlationFilter={auditCorrelation} />}
      {page === "architecture" && <ArchitecturePage />}
    </Shell>
  );
}
