/**
 * Content Core — semantic map projection (CC-1, pure).
 *
 * The firewall invariant is verified by comparing the SEMANTIC projection of the
 * Emotional Map before/after a learning sweep — NOT raw-JSON byte-equality. The
 * projection keeps everything that defines "what the map says" per axis (value,
 * measured, confidence, hasSignal, status, provenance) and strips incidental
 * fields (timestamps, cache keys, ordering).
 *
 * CC-1 defines the projection over a plain map-shaped object; CC-7 feeds the real
 * map result through it. This module imports NOTHING from the Emotional Map.
 *
 * See docs/architecture/content-core.md §10 and ADR 0016.
 */

export interface MapAxisLike {
  key: string;
  value: number | null;
  measured?: boolean;
  confidence?: number | null;
  hasSignal?: boolean;
  status?: string | null;
  evidence?: { modelId?: string | null; n?: number | null } | null;
  // ...other incidental per-axis fields intentionally ignored
}

export interface MapLike {
  dimensions?: MapAxisLike[];
  // ...incidental top-level fields (generatedAt, cache markers) ignored
  [k: string]: unknown;
}

export interface AxisProjection {
  key: string;
  value: number | null;
  measured: boolean;
  confidence: number | null;
  hasSignal: boolean;
  status: string | null;
  modelId: string | null;
  n: number | null;
}

/** Extract the semantic axis projection, sorted by key for stable comparison. */
export function projectMap(map: MapLike): AxisProjection[] {
  const dims = Array.isArray(map.dimensions) ? map.dimensions : [];
  return dims
    .map((d) => ({
      key: d.key,
      value: d.value,
      measured: Boolean(d.measured),
      confidence: d.confidence ?? null,
      hasSignal: Boolean(d.hasSignal),
      status: d.status ?? null,
      modelId: d.evidence?.modelId ?? null,
      n: d.evidence?.n ?? null,
    }))
    .sort((a, b) => a.key.localeCompare(b.key));
}

/** True iff two map results are semantically identical (say the same thing). */
export function mapProjectionsEqual(a: MapLike, b: MapLike): boolean {
  return JSON.stringify(projectMap(a)) === JSON.stringify(projectMap(b));
}
