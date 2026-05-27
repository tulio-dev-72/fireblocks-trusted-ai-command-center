import { useCallback, useEffect, useRef, useState } from "react";
import type {
  AuditTimelineEvent,
  DelayedPaymentsInvestigationResponse,
  InvestigationMode,
  InvestigationStatus,
  StartInvestigationResponse,
} from "@taicc/shared-types";
import { API_URL, apiPostAccepted, buildAuthHeaders } from "../lib/api";

export interface InvestigationStreamState {
  correlationId: string | null;
  status: InvestigationStatus | null;
  phase: string | null;
  mode: InvestigationMode | null;
  question: string | null;
  timeline: AuditTimelineEvent[];
  webhookEventCount: number;
  result: DelayedPaymentsInvestigationResponse | null;
  error: string | null;
  running: boolean;
}

const INITIAL: InvestigationStreamState = {
  correlationId: null,
  status: null,
  phase: null,
  mode: null,
  question: null,
  timeline: [],
  webhookEventCount: 0,
  result: null,
  error: null,
  running: false,
};

function parseSseBlock(block: string): { event: string; data: string } | null {
  const lines = block.split("\n").filter(Boolean);
  if (lines.length === 0) return null;
  let event = "message";
  let data = "";
  for (const line of lines) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    if (line.startsWith("data:")) data += line.slice(5).trim();
  }
  return data ? { event, data } : null;
}

async function consumeInvestigationStream(
  correlationId: string,
  signal: AbortSignal,
  onEvent: (event: string, payload: unknown) => void,
): Promise<void> {
  const res = await fetch(`${API_URL}/v1/investigations/${correlationId}/stream`, {
    headers: buildAuthHeaders(),
    signal,
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Stream failed (HTTP ${res.status})`);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error("Stream body unavailable");

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let boundary = buffer.indexOf("\n\n");
    while (boundary !== -1) {
      const block = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const parsed = parseSseBlock(block);
      if (parsed) {
        onEvent(parsed.event, JSON.parse(parsed.data));
      }
      boundary = buffer.indexOf("\n\n");
    }
  }
}

export function useInvestigationStream() {
  const [state, setState] = useState<InvestigationStreamState>(INITIAL);
  const abortRef = useRef<AbortController | null>(null);

  const stopStream = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  const applyStatusPayload = useCallback((payload: Record<string, unknown>) => {
    setState((prev) => ({
      ...prev,
      status: (payload.status as InvestigationStatus) ?? prev.status,
      phase: (payload.phase as string | undefined) ?? prev.phase,
      mode: (payload.mode as InvestigationMode) ?? prev.mode,
      question: (payload.question as string) ?? prev.question,
      webhookEventCount: Number(payload.webhook_event_count ?? prev.webhookEventCount),
      result: (payload.result as DelayedPaymentsInvestigationResponse | undefined) ?? prev.result,
      error: (payload.error as string | undefined) ?? prev.error,
      running:
        payload.status === "running" ||
        payload.status === "queued" ||
        (prev.running && payload.status !== "completed" && payload.status !== "failed"),
    }));
  }, []);

  const start = useCallback(
    async (question: string, mode: InvestigationMode) => {
      stopStream();
      setState({ ...INITIAL, running: true, question, mode });

      try {
        const started = await apiPostAccepted<StartInvestigationResponse>(
          "/v1/investigations/run",
          { question, mode, workflow: "delayed_payments_investigator" },
        );

        setState((prev) => ({
          ...prev,
          correlationId: started.correlation_id,
          status: started.status,
          running: true,
        }));

        const controller = new AbortController();
        abortRef.current = controller;

        await consumeInvestigationStream(
          started.correlation_id,
          controller.signal,
          (event, payload) => {
            if (event === "timeline") {
              const timelinePayload = payload as {
                events?: AuditTimelineEvent[];
                webhook_event_count?: number;
              };
              setState((prev) => ({
                ...prev,
                timeline: timelinePayload.events ?? prev.timeline,
                webhookEventCount:
                  timelinePayload.webhook_event_count ?? prev.webhookEventCount,
              }));
              return;
            }

            if (event === "status" || event === "complete") {
              applyStatusPayload(payload as Record<string, unknown>);
            }

            if (event === "complete") {
              setState((prev) => ({ ...prev, running: false }));
              stopStream();
            }

            if (event === "error") {
              const errorPayload = payload as { error?: string; status?: Record<string, unknown> };
              if (errorPayload.status) applyStatusPayload(errorPayload.status);
              setState((prev) => ({
                ...prev,
                running: false,
                error: errorPayload.error ?? "Investigation failed",
              }));
              stopStream();
            }

            if (event === "timeout") {
              setState((prev) => ({ ...prev, running: false }));
              stopStream();
            }
          },
        );

        setState((prev) => ({ ...prev, running: false }));
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;
        setState((prev) => ({
          ...prev,
          running: false,
          error: err instanceof Error ? err.message : "Investigation stream failed",
        }));
      }
    },
    [applyStatusPayload, stopStream],
  );

  const reset = useCallback(() => {
    stopStream();
    setState(INITIAL);
  }, [stopStream]);

  useEffect(() => () => stopStream(), [stopStream]);

  return { ...state, start, reset };
}
