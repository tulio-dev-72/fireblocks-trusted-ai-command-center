import { useCallback, useEffect, useRef, useState } from "react";
import type {
  AuditTimelineEvent,
  DelayedPaymentsInvestigationResponse,
  InvestigationMode,
  InvestigationStatus,
  StartInvestigationResponse,
} from "@taicc/shared-types";
import { apiGet, apiPostAccepted } from "../lib/api";

const POLL_MS = 1200;

export interface InvestigationPollState {
  correlationId: string | null;
  status: InvestigationStatus | null;
  phase: string | null;
  mode: InvestigationMode | null;
  question: string | null;
  timeline: AuditTimelineEvent[];
  result: DelayedPaymentsInvestigationResponse | null;
  error: string | null;
  running: boolean;
}

const INITIAL: InvestigationPollState = {
  correlationId: null,
  status: null,
  phase: null,
  mode: null,
  question: null,
  timeline: [],
  result: null,
  error: null,
  running: false,
};

export function useInvestigationPoll() {
  const [state, setState] = useState<InvestigationPollState>(INITIAL);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopPolling = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const pollOnce = useCallback(async (correlationId: string) => {
    const [record, timelineRes] = await Promise.all([
      apiGet<{
        status: InvestigationStatus;
        phase?: string;
        mode: InvestigationMode;
        question: string;
        error?: string;
        result?: DelayedPaymentsInvestigationResponse;
      }>(`/v1/investigations/${correlationId}`),
      apiGet<{ events: AuditTimelineEvent[] }>(
        `/v1/investigations/${correlationId}/timeline`,
      ),
    ]);

    setState((prev) => ({
      ...prev,
      status: record.status,
      phase: record.phase ?? null,
      mode: record.mode,
      question: record.question,
      timeline: timelineRes.events,
      result: record.result ?? null,
      error: record.error ?? null,
      running: record.status === "running" || record.status === "queued",
    }));

    return record.status;
  }, []);

  const schedulePoll = useCallback(
    (correlationId: string) => {
      stopPolling();
      timerRef.current = setTimeout(async () => {
        try {
          const status = await pollOnce(correlationId);
          if (status === "running" || status === "queued") {
            schedulePoll(correlationId);
          } else {
            setState((prev) => ({ ...prev, running: false }));
          }
        } catch (err) {
          setState((prev) => ({
            ...prev,
            running: false,
            error: err instanceof Error ? err.message : "Polling failed",
          }));
        }
      }, POLL_MS);
    },
    [pollOnce, stopPolling],
  );

  const start = useCallback(
    async (question: string, mode: InvestigationMode) => {
      stopPolling();
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

        await pollOnce(started.correlation_id);
        schedulePoll(started.correlation_id);
      } catch (err) {
        setState((prev) => ({
          ...prev,
          running: false,
          error: err instanceof Error ? err.message : "Investigation failed to start",
        }));
      }
    },
    [pollOnce, schedulePoll, stopPolling],
  );

  const reset = useCallback(() => {
    stopPolling();
    setState(INITIAL);
  }, [stopPolling]);

  useEffect(() => () => stopPolling(), [stopPolling]);

  return { ...state, start, reset };
}
