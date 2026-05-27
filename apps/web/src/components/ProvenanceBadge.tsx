import type { SourceType, ProvenanceMetadata } from "@taicc/shared-types";

const SOURCE_LABELS: Record<SourceType, string> = {
  REAL_FIREBLOCKS: "Fireblocks API",
  CUSTOMER_SYSTEM: "Customer System",
  MARKET_DATA: "Market Data",
  DERIVED_AI: "AI Derived",
  DEMO_SEED: "Demo Seed",
};

const SOURCE_COLORS: Record<SourceType, string> = {
  REAL_FIREBLOCKS: "provenance-real",
  CUSTOMER_SYSTEM: "provenance-customer",
  MARKET_DATA: "provenance-market",
  DERIVED_AI: "provenance-ai",
  DEMO_SEED: "provenance-demo",
};

export function ProvenanceBadge({
  provenance,
  compact,
}: {
  provenance: ProvenanceMetadata;
  compact?: boolean;
}) {
  const label = SOURCE_LABELS[provenance.source_type];
  const colorClass = SOURCE_COLORS[provenance.source_type];

  return (
    <span
      className={`provenance-badge ${colorClass}`}
      title={`Source: ${label}\nEndpoint: ${provenance.api_endpoint ?? "N/A"}\nFetched: ${provenance.fetched_at}${
        provenance.mocked_fields.length
          ? `\nMocked fields: ${provenance.mocked_fields.join(", ")}`
          : ""
      }`}
    >
      {compact ? provenance.source_type.replace(/_/g, " ") : label}
    </span>
  );
}

export function UnavailableLabel({ reason }: { reason?: string }) {
  return (
    <span className="unavailable-label" title={reason}>
      Data unavailable
    </span>
  );
}

export function DataModeBanner({
  mode,
  demoMode,
}: {
  mode: string;
  demoMode: boolean;
}) {
  if (mode === "real") {
    return (
      <div className="mode-banner mode-real">
        Real Fireblocks sandbox data — live API
      </div>
    );
  }
  if (mode === "demo" || demoMode) {
    return (
      <div className="mode-banner mode-demo">
        Demo seed data — not connected to Fireblocks
      </div>
    );
  }
  return (
    <div className="mode-banner mode-hybrid">
      Hybrid mode — real Fireblocks metadata with labeled mock fields
    </div>
  );
}
