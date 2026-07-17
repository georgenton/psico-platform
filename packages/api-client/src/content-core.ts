import type {
  BookManifest,
  ContentUnitMarks,
  ContentUnitRead,
} from "@psico/types";
import { apiClient } from "./client";

/**
 * contentCoreApi — CC-6B reader source.
 *
 * The canonical source of a chapter's text is Content Core (with a fail-closed
 * legacy fallback resolved server-side). Clients never fabricate identities:
 *   - `getManifest` maps a book slug → server-owned editionKey + ordered units;
 *   - `getUnit` fetches a unit's blocks (each carrying a stable `blockKey` plus
 *     the legacy anchor `legacyBlockId` for backward compatibility).
 *
 * A `CONTENT_CORE_INTEGRITY_ERROR` (HTTP 500) is never masked — callers show a
 * "contenido temporalmente no disponible" state rather than silently falling
 * back to the lector blocks.
 */
export const contentCoreApi = {
  getManifest: (bookSlug: string) =>
    apiClient.get<BookManifest>(
      `/content/books/${encodeURIComponent(bookSlug)}/manifest`,
    ),

  getUnit: (editionKey: string, unitKey: string) =>
    apiClient.get<ContentUnitRead>(
      `/content/editions/${encodeURIComponent(editionKey)}/units/${encodeURIComponent(unitKey)}`,
    ),

  // CC-6C — the current user's marks for a unit, keyed by blockKey.
  getUnitMarks: (editionKey: string, unitKey: string) =>
    apiClient.get<ContentUnitMarks>(
      `/content/editions/${encodeURIComponent(editionKey)}/units/${encodeURIComponent(unitKey)}/marks`,
    ),
};
