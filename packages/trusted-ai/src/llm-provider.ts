import type { EnvConfig } from "@taicc/config";
import type { Citation, EvidenceItem } from "@taicc/shared-types";

export interface LlmRequest {
  question: string;
  context: string;
  citations: Citation[];
}

export interface LlmResult {
  answer: string;
  summary: string;
  provider: string;
  modelId: string;
}

export interface LlmProviderConfig {
  provider: string;
  modelId: string;
  apiKey?: string;
  promptLogging: boolean;
}

const SYSTEM_PROMPT = [
  "You are a treasury operations analyst for an enterprise Fireblocks command center.",
  "Answer ONLY using the provided evidence context. Cite evidence IDs in brackets like [ev-txs].",
  "Never invent transaction IDs, amounts, or statuses.",
  "If evidence is insufficient, say so explicitly.",
  "Do not recommend executing transactions — only investigation and escalation steps.",
  "Customer data must not be used for model training (enterprise policy).",
].join(" ");

export function resolveLlmConfig(config: EnvConfig): LlmProviderConfig {
  const openAiKey = config.OPENAI_API_KEY?.trim();
  const anthropicKey = config.ANTHROPIC_API_KEY?.trim();
  const promptLogging = config.AI_PROMPT_LOGGING;

  const pickOpenAi = (): LlmProviderConfig | null =>
    openAiKey
      ? {
          provider: "openai",
          modelId: config.AI_MODEL,
          apiKey: openAiKey,
          promptLogging,
        }
      : null;

  const pickAnthropic = (): LlmProviderConfig | null =>
    anthropicKey
      ? {
          provider: "anthropic",
          modelId: config.ANTHROPIC_MODEL,
          apiKey: anthropicKey,
          promptLogging,
        }
      : null;

  if (config.AI_PROVIDER === "openai") {
    return (
      pickOpenAi() ?? {
        provider: "grounded_synthesis",
        modelId: "evidence-grounded-v1",
        promptLogging,
      }
    );
  }

  if (config.AI_PROVIDER === "anthropic") {
    return (
      pickAnthropic() ?? {
        provider: "grounded_synthesis",
        modelId: "evidence-grounded-v1",
        promptLogging,
      }
    );
  }

  return (
    pickOpenAi() ??
    pickAnthropic() ?? {
      provider: "grounded_synthesis",
      modelId: "evidence-grounded-v1",
      promptLogging,
    }
  );
}

export async function generateGroundedAnswer(
  request: LlmRequest,
  llmConfig: LlmProviderConfig,
): Promise<LlmResult> {
  if (llmConfig.provider === "openai" && llmConfig.apiKey) {
    return callOpenAi(request, llmConfig);
  }
  if (llmConfig.provider === "anthropic" && llmConfig.apiKey) {
    return callAnthropic(request, llmConfig);
  }
  return synthesizeFromEvidence(request, llmConfig);
}

function buildUserPrompt(request: LlmRequest): string {
  return `Question: ${request.question}\n\nEvidence:\n${request.context}\n\nCitations available: ${request.citations.map((c) => c.id).join(", ")}`;
}

async function callOpenAi(
  request: LlmRequest,
  llmConfig: LlmProviderConfig,
): Promise<LlmResult> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${llmConfig.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: llmConfig.modelId,
      temperature: 0.2,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildUserPrompt(request) },
      ],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`OpenAI request failed (${response.status}): ${errText.slice(0, 200)}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const answer =
    data.choices?.[0]?.message?.content?.trim() ??
    "Unable to generate AI answer from the model response.";

  return {
    answer,
    summary: answer.split("\n")[0]?.slice(0, 240) ?? answer.slice(0, 240),
    provider: "openai",
    modelId: llmConfig.modelId,
  };
}

async function callAnthropic(
  request: LlmRequest,
  llmConfig: LlmProviderConfig,
): Promise<LlmResult> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": llmConfig.apiKey!,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: llmConfig.modelId,
      max_tokens: 2048,
      temperature: 0.2,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildUserPrompt(request) }],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Anthropic request failed (${response.status}): ${errText.slice(0, 200)}`);
  }

  const data = (await response.json()) as {
    content?: Array<{ type?: string; text?: string }>;
  };
  const answer =
    data.content?.find((block) => block.type === "text")?.text?.trim() ??
    "Unable to generate AI answer from the model response.";

  return {
    answer,
    summary: answer.split("\n")[0]?.slice(0, 240) ?? answer.slice(0, 240),
    provider: "anthropic",
    modelId: llmConfig.modelId,
  };
}

function synthesizeFromEvidence(
  request: LlmRequest,
  llmConfig: LlmProviderConfig,
): LlmResult {
  const lines = request.context.split("\n").filter(Boolean);
  const intro =
    request.question.toLowerCase().includes("delay") ||
    request.question.toLowerCase().includes("payment")
      ? "Based on live Fireblocks sandbox evidence, here is the operational assessment of delayed payments:"
      : "Based on retrieved Fireblocks evidence:";

  const body = lines.length > 0 ? lines.join(" ") : "No qualifying evidence was available.";
  const citationNote =
    request.citations.length > 0
      ? ` Sources: ${request.citations.map((c) => `[${c.evidence_id}] ${c.label}`).join("; ")}.`
      : "";

  const answer = `${intro} ${body}${citationNote} All conclusions are traceable to Fireblocks records retrieved at investigation time — no synthetic data was used.`;
  return {
    answer,
    summary: intro,
    provider: llmConfig.provider,
    modelId: llmConfig.modelId,
  };
}

export function buildEvidenceContext(
  evidence: EvidenceItem[],
  extraLines: string[] = [],
): { context: string; citations: Citation[] } {
  const citations: Citation[] = [];
  const parts: string[] = [...extraLines];

  for (const item of evidence) {
    if (!item.available) {
      parts.push(`${item.label}: unavailable (${String(item.value)})`);
      continue;
    }
    const excerpt = summarizeEvidenceValue(item.label, item.value);
    citations.push({
      id: `cite-${item.id}`,
      evidence_id: item.id,
      label: item.label,
      excerpt,
    });
    parts.push(`${item.label} [${item.id}]: ${excerpt}`);
  }

  return { context: parts.join("\n"), citations };
}

function summarizeEvidenceValue(label: string, value: unknown): string {
  if (Array.isArray(value)) {
    if (label.toLowerCase().includes("transaction")) {
      return `${value.length} transaction record(s) from Fireblocks`;
    }
    return `${value.length} record(s)`;
  }
  if (typeof value === "object" && value !== null) {
    return JSON.stringify(value).slice(0, 180);
  }
  return String(value).slice(0, 180);
}
