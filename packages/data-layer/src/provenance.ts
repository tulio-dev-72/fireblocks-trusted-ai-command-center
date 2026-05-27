import type {
  ProvenanceMetadata,
  ProvenanceRecord,
  SourceType,
} from "@taicc/shared-types";

export function demoProvenance(
  resource: string,
  mockedFields: string[] = [],
): ProvenanceMetadata {
  return {
    source_type: "DEMO_SEED",
    fetched_at: new Date().toISOString(),
    api_endpoint: `DEMO /seed/${resource}`,
    mocked_fields: mockedFields,
  };
}

export function realProvenanceFrom(
  provenance: ProvenanceMetadata,
): ProvenanceMetadata {
  return provenance;
}

export function unavailableRecord<T>(
  sourceType: SourceType,
  reason: string,
  endpoint?: string,
): ProvenanceRecord<T> {
  return {
    data: null,
    available: false,
    unavailable_reason: reason,
    provenance: {
      source_type: sourceType,
      fetched_at: new Date().toISOString(),
      api_endpoint: endpoint,
      mocked_fields: [],
    },
  };
}

export function availableRecord<T>(
  data: T,
  provenance: ProvenanceMetadata,
): ProvenanceRecord<T> {
  return {
    data,
    available: true,
    provenance,
  };
}

export function wrapList<T>(
  items: T[],
  provenance: ProvenanceMetadata,
): ProvenanceRecord<T[]> {
  return availableRecord(items, provenance);
}

/** Merge real record with hybrid mock overlay — mocked fields are labeled. */
export function mergeHybridRecord<T extends Record<string, unknown>>(
  real: Partial<T> | null,
  mockOverlay: Partial<T>,
  mockFieldNames: (keyof T)[],
  realProvenance: ProvenanceMetadata,
): ProvenanceRecord<T> {
  if (!real) {
    return unavailableRecord<T>(
      "REAL_FIREBLOCKS",
      "Data unavailable from Fireblocks API",
    );
  }

  const merged = { ...real, ...mockOverlay } as T;
  return {
    data: merged,
    available: true,
    provenance: {
      ...realProvenance,
      source_type: "REAL_FIREBLOCKS",
      mocked_fields: mockFieldNames.map(String),
    },
  };
}
