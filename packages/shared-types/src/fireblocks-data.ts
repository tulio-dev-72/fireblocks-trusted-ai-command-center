import { z } from "zod";
import { ProvenanceMetadataSchema } from "./provenance.js";

export const VaultAssetRecordSchema = z.object({
  id: z.string(),
  total: z.string().optional(),
  available: z.string().optional(),
  balance: z.string().optional(),
  lockedAmount: z.string().optional(),
});
export type VaultAssetRecord = z.infer<typeof VaultAssetRecordSchema>;

export const VaultAccountRecordSchema = z.object({
  id: z.string(),
  name: z.string(),
  hiddenOnUI: z.boolean().optional(),
  autoFuel: z.boolean().optional(),
  assets: z.array(VaultAssetRecordSchema).default([]),
});
export type VaultAccountRecord = z.infer<typeof VaultAccountRecordSchema>;

export const ExternalWalletRecordSchema = z.object({
  id: z.string(),
  name: z.string(),
  customerRefId: z.string().optional(),
  assets: z.array(VaultAssetRecordSchema).default([]),
});
export type ExternalWalletRecord = z.infer<typeof ExternalWalletRecordSchema>;

export const TransactionRecordSchema = z.object({
  id: z.string(),
  status: z.string(),
  assetId: z.string().optional(),
  amount: z.number().optional(),
  amountUSD: z.number().optional(),
  source: z.record(z.unknown()).optional(),
  destination: z.record(z.unknown()).optional(),
  createdAt: z.number().optional(),
  lastUpdated: z.number().optional(),
  note: z.string().optional(),
  txHash: z.string().optional(),
});
export type TransactionRecord = z.infer<typeof TransactionRecordSchema>;

export const FireblocksPolicyRuleRecordSchema = z.object({
  id: z.string().optional(),
  name: z.string().optional(),
  type: z.string().optional(),
  action: z.string().optional(),
  raw: z.record(z.unknown()).optional(),
});
export type FireblocksPolicyRuleRecord = z.infer<
  typeof FireblocksPolicyRuleRecordSchema
>;

export const ApprovalWorkflowRecordSchema = z.object({
  id: z.string(),
  status: z.string(),
  operation: z.string().optional(),
  approver: z.string().optional(),
  createdAt: z.string().optional(),
  expiresAt: z.string().optional(),
});
export type ApprovalWorkflowRecord = z.infer<
  typeof ApprovalWorkflowRecordSchema
>;

export const WebhookEventRecordSchema = z.object({
  id: z.string(),
  type: z.string().optional(),
  status: z.string().optional(),
  createdAt: z.string().optional(),
  resourceId: z.string().optional(),
});
export type WebhookEventRecord = z.infer<typeof WebhookEventRecordSchema>;

export const CounterpartyRecordSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  type: z.string().optional(),
  status: z.string().optional(),
});
export type CounterpartyRecord = z.infer<typeof CounterpartyRecordSchema>;

export const ActivityLogRecordSchema = z.object({
  id: z.string(),
  timestamp: z.string(),
  user: z.string().optional(),
  action: z.string().optional(),
  subject: z.string().optional(),
  details: z.record(z.unknown()).optional(),
});
export type ActivityLogRecord = z.infer<typeof ActivityLogRecordSchema>;

export const TransactionDraftSchema = z.object({
  draftId: z.string(),
  assetId: z.string(),
  amount: z.string(),
  source: z.object({ type: z.string(), id: z.string() }),
  destination: z.object({ type: z.string(), id: z.string() }),
  note: z.string().optional(),
  status: z.literal("draft"),
  execution_disabled: z.literal(true),
  prepared_at: z.string().datetime(),
  provenance: ProvenanceMetadataSchema,
});
export type TransactionDraft = z.infer<typeof TransactionDraftSchema>;
