import { z } from "zod";

/** Origin of every data record exposed to UI and AI layers. */
export const SourceTypeSchema = z.enum([
  "REAL_FIREBLOCKS",
  "REAL_FIREBLOCKS_SANDBOX",
  "CUSTOMER_SYSTEM",
  "MARKET_DATA",
  "DERIVED_AI",
  "DEMO_SEED",
]);
export type SourceType = z.infer<typeof SourceTypeSchema>;

export const DataModeSchema = z.enum(["real", "demo", "hybrid"]);
export type DataMode = z.infer<typeof DataModeSchema>;

export const ProvenanceMetadataSchema = z.object({
  source_type: SourceTypeSchema,
  fetched_at: z.string().datetime(),
  api_endpoint: z.string().optional(),
  workspace_id: z.string().optional(),
  /** Fields that are mocked in hybrid mode — must be labeled in UI */
  mocked_fields: z.array(z.string()).default([]),
  correlation_id: z.string().uuid().optional(),
});
export type ProvenanceMetadata = z.infer<typeof ProvenanceMetadataSchema>;

/** Wraps a data payload with mandatory provenance. */
export interface ProvenanceRecord<T> {
  data: T | null;
  provenance: ProvenanceMetadata;
  available: boolean;
  unavailable_reason?: string;
}

export const ProvenanceRecordSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    data: dataSchema.nullable(),
    provenance: ProvenanceMetadataSchema,
    available: z.boolean(),
    unavailable_reason: z.string().optional(),
  });

export const EvidenceItemSchema = z.object({
  id: z.string(),
  label: z.string(),
  value: z.unknown(),
  provenance: ProvenanceMetadataSchema,
  available: z.boolean(),
});
export type EvidenceItem = z.infer<typeof EvidenceItemSchema>;
