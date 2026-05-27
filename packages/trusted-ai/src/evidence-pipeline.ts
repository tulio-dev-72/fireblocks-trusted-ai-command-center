import type { AuditLogger } from "@taicc/audit";
import type { EnvConfig } from "@taicc/config";
import type { DataService } from "@taicc/data-layer";
import type { FireblocksCallContext } from "@taicc/fireblocks-client";
import type {
  AiAskResponse,
  EvidenceItem,
  Actor,
} from "@taicc/shared-types";
import {
  buildEvidenceContext,
  generateGroundedAnswer,
  resolveLlmConfig,
} from "./llm-provider.js";

export interface PipelineContext {
  correlationId: string;
  actor: Actor;
  fireblocksCtx: FireblocksCallContext;
  permission: string;
  rbacAllowed: boolean;
}

export class EvidencePipeline {
  constructor(
    private readonly dataService: DataService,
    private readonly auditLogger: AuditLogger,
    private readonly config: EnvConfig,
  ) {}

  async ask(
    question: string,
    ctx: PipelineContext,
    workflow?: string,
  ): Promise<AiAskResponse> {
    const llmConfig = resolveLlmConfig(this.config);

    await this.auditLogger.record({
      correlationId: ctx.correlationId,
      eventType: "ai_prompt",
      actorId: ctx.actor.id,
      action: workflow ?? "ai_ask",
      outcome: "success",
      metadata: {
        question,
        readOnly: true,
        prompt_logged: llmConfig.promptLogging,
        model_provider: llmConfig.provider,
        rbac_enforced: ctx.rbacAllowed,
      },
    });

    if (!ctx.rbacAllowed) {
      throw new Error("RBAC denied: insufficient permissions for AI evidence pipeline");
    }

    if (this.dataService.getMode() === "demo") {
      throw new Error(
        "AI evidence pipeline requires REAL_FIREBLOCKS=true. Demo seed data is excluded from LLM context.",
      );
    }

    const fctx = ctx.fireblocksCtx;
    const [txResult, approvals, balances, policy] = await Promise.all([
      this.dataService.listTransactions(fctx),
      this.dataService.listApprovals(fctx),
      this.dataService.listBalances(fctx),
      this.dataService.getActivePolicy(fctx),
    ]);

    const evidence: EvidenceItem[] = [
      this.dataService.toAiEvidence("Transactions", txResult, "ev-txs").item,
      this.dataService.toAiEvidence("Approval Queue", approvals, "ev-approvals").item,
      this.dataService.toAiEvidence("Vault Balances", balances, "ev-balances").item,
      this.dataService.toAiEvidence("Active Policy", policy, "ev-policy").item,
    ];

    for (const item of evidence) {
      await this.auditLogger.record({
        correlationId: ctx.correlationId,
        eventType: "evidence_retrieved",
        actorId: ctx.actor.id,
        resourceType: item.label,
        outcome: item.available ? "success" : "failure",
        metadata: {
          evidenceId: item.id,
          source_type: item.provenance.source_type,
          workflow: workflow ?? "ai_ask",
        },
      });
    }

    const { context, citations } = buildEvidenceContext(evidence);
    const llmResult = await generateGroundedAnswer(
      { question, context, citations },
      llmConfig,
    );

    const auditEvent = await this.auditLogger.record({
      correlationId: ctx.correlationId,
      eventType: "ai_response",
      actorId: ctx.actor.id,
      action: workflow ?? "ai_ask",
      outcome: "success",
      metadata: {
        model_provider: llmResult.provider,
        model_id: llmResult.modelId,
        citation_count: citations.length,
        evidence_count: evidence.length,
        prompt_logged: llmConfig.promptLogging,
      },
    });

    return {
      question,
      answer: llmResult.answer,
      summary: llmResult.summary,
      citations,
      evidence,
      model_provider: llmResult.provider,
      model_id: llmResult.modelId,
      prompt_logged: llmConfig.promptLogging,
      rbac_enforced: true,
      provenance: {
        source_type: "DERIVED_AI",
        fetched_at: new Date().toISOString(),
        api_endpoint: "POST /v1/ai/ask",
        mocked_fields: [],
        correlation_id: ctx.correlationId,
      },
      correlation_id: ctx.correlationId,
      audit_event_id: auditEvent.id,
    };
  }
}

export function createEvidencePipeline(
  dataService: DataService,
  auditLogger: AuditLogger,
  config: EnvConfig,
): EvidencePipeline {
  return new EvidencePipeline(dataService, auditLogger, config);
}
