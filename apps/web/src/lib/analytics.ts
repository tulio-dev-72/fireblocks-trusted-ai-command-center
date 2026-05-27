import { track } from "@vercel/analytics";
import type { InvestigationMode } from "@taicc/shared-types";
import type { Page } from "./navigation";
import { OPERATIONAL_INVESTIGATION_PROMPTS } from "./investigation-prompts";

export const TRACKED_EVENTS = [
  "homepage_viewed",
  "architecture_page_viewed",
  "operational_investigation_opened",
  "investigation_prompt_clicked",
  "ai_investigation_started",
  "ai_investigation_completed",
  "evidence_card_opened",
  "fireblocks_connection_checked",
  "operational_data_readiness_viewed",
  "trust_center_viewed",
] as const;

export type ProductEventName = (typeof TRACKED_EVENTS)[number];

const LOCAL_EVENT_LOG_KEY = "taicc_analytics_events";
const LOCAL_EVENT_LOG_LIMIT = 100;

const BLOCKED_PROPERTY_KEYS =
  /api[_-]?key|secret|token|password|prompt|question|transaction|wallet|address|payload|private|credential|correlation|evidence_id|vault|destination|amount|asset/i;

const SAFE_METADATA_KEYS = new Set([
  "page",
  "workflow_type",
  "investigation_mode",
  "prompt_id",
  "evidence_type",
  "connected",
  "status",
  "source",
]);

export interface LocalAnalyticsEvent {
  event: ProductEventName;
  timestamp: string;
  page?: Page;
  workflow_type?: string;
  investigation_mode?: InvestigationMode;
  prompt_id?: string;
  evidence_type?: string;
  connected?: boolean;
  status?: string;
}

function sanitizeProperties(
  properties: Record<string, unknown>,
): Record<string, string | number | boolean> {
  const safe: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(properties)) {
    if (BLOCKED_PROPERTY_KEYS.test(key)) continue;
    if (!SAFE_METADATA_KEYS.has(key)) continue;
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      safe[key] = value;
    }
  }
  return safe;
}

function readLocalEvents(): LocalAnalyticsEvent[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.sessionStorage.getItem(LOCAL_EVENT_LOG_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as LocalAnalyticsEvent[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function appendLocalEvent(event: LocalAnalyticsEvent) {
  if (typeof window === "undefined") return;
  const next = [event, ...readLocalEvents()].slice(0, LOCAL_EVENT_LOG_LIMIT);
  try {
    window.sessionStorage.setItem(LOCAL_EVENT_LOG_KEY, JSON.stringify(next));
  } catch {
    // Ignore quota errors — Vercel Analytics remains the source of truth in production.
  }
}

export function promptIdFromText(prompt: string): string {
  const index = OPERATIONAL_INVESTIGATION_PROMPTS.indexOf(
    prompt as (typeof OPERATIONAL_INVESTIGATION_PROMPTS)[number],
  );
  if (index >= 0) return `prompt_${index + 1}`;
  return "custom_prompt";
}

export function trackProductEvent(
  event: ProductEventName,
  properties?: Record<string, unknown>,
) {
  const timestamp = new Date().toISOString();
  const safeProps = sanitizeProperties(properties ?? {});
  const localEvent = { event, timestamp, ...safeProps } as LocalAnalyticsEvent;

  appendLocalEvent(localEvent);

  if (import.meta.env.PROD) {
    track(event, safeProps);
  }
}

export function getLocalEventLog(): LocalAnalyticsEvent[] {
  return readLocalEvents();
}

export function getAnalyticsIntegrationStatus() {
  const onVercel =
    import.meta.env.PROD &&
    (window.location.hostname.includes("vercel.app") ||
      Boolean(import.meta.env.VITE_VERCEL_ENV));

  return {
    webAnalytics: {
      package: "@vercel/analytics",
      clientConfigured: true,
      productionActive: import.meta.env.PROD,
      dashboardRequired: true,
      note: onVercel
        ? "Mounted in AnalyticsProvider. Enable Web Analytics in the Vercel project dashboard to collect traffic."
        : "Runs locally in no-op mode. Deploy to Vercel and enable Web Analytics for visitor metrics.",
    },
    speedInsights: {
      package: "@vercel/speed-insights",
      clientConfigured: true,
      productionActive: import.meta.env.PROD,
      dashboardRequired: true,
      note: onVercel
        ? "Mounted in AnalyticsProvider. Enable Speed Insights in the Vercel project dashboard for Web Vitals."
        : "Runs locally in no-op mode. Deploy to Vercel and enable Speed Insights for performance data.",
    },
  };
}

export const PAGE_VIEW_EVENTS: Partial<Record<Page, ProductEventName>> = {
  home: "homepage_viewed",
  architecture: "architecture_page_viewed",
  investigator: "operational_investigation_opened",
  "sandbox-readiness": "operational_data_readiness_viewed",
  trust: "trust_center_viewed",
};
