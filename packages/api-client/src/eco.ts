import type {
  EcoPersona,
  EcoReportMessageRequest,
  EcoSendMessageRequest,
  EcoSseEvent,
  EcoSuggestionsResponse,
  EcoThreadCreatedResponse,
  EcoThreadListResponse,
  EcoThreadResponse,
} from "@psico/types";
import { apiClient } from "./client";

/**
 * ecoApi — Sprint S10 client surface for the Eco companion.
 *
 * The `sendMessage` method is special: the server streams back Server-Sent
 * Events. Because `apiClient.post` returns parsed JSON (which would buffer
 * the whole response), we expose a separate streaming helper that uses the
 * Fetch reader API directly.
 *
 * The caller provides an `onEvent` callback that fires once per parsed SSE
 * event. The Promise resolves when the stream closes; rejects on transport
 * error.
 */
export const ecoApi = {
  // ─── Persona ─────────────────────────────────────────────────────────────

  getCaps: () => apiClient.get<EcoPersona>("/eco/caps"),

  // ─── Adaptive suggestions ──────────────────────────────────────────────────

  /** Rule-based conversation openers adapted to recent activity + mood. */
  getSuggestions: () =>
    apiClient.get<EcoSuggestionsResponse>("/eco/suggestions"),

  // ─── Threads ─────────────────────────────────────────────────────────────

  listThreads: () => apiClient.get<EcoThreadListResponse>("/eco/threads"),

  createThread: () =>
    apiClient.post<EcoThreadCreatedResponse>("/eco/threads", {}),

  getThread: (id: string, cursor?: string) => {
    const qs = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
    return apiClient.get<EcoThreadResponse>(`/eco/threads/${id}${qs}`);
  },

  deleteThread: (id: string) => apiClient.delete<void>(`/eco/threads/${id}`),

  // ─── Messages ────────────────────────────────────────────────────────────

  /**
   * Send a user message and consume the SSE stream.
   *
   * `baseUrl` + `accessToken` are passed in explicitly because this helper
   * bypasses the apiClient JSON pipeline (which buffers responses). The
   * caller (mobile auth context, web fetch wrapper) is responsible for
   * resolving the right base URL and the current token.
   */
  sendMessage: async (
    body: EcoSendMessageRequest,
    options: {
      baseUrl: string;
      accessToken: string | null;
      onEvent: (event: EcoSseEvent) => void;
      signal?: AbortSignal;
    },
  ): Promise<void> => {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    };
    if (options.accessToken) {
      headers.Authorization = `Bearer ${options.accessToken}`;
    }
    const res = await fetch(`${options.baseUrl}/api/eco/messages`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: options.signal,
    });
    if (!res.ok || !res.body) {
      const txt = await res.text().catch(() => res.statusText);
      throw new Error(`ECO_STREAM_HTTP_${res.status}: ${txt}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffered = "";

    try {
      // Read chunks until the server closes the stream.
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffered += decoder.decode(value, { stream: true });

        // SSE event framing: events separated by blank lines.
        let sep = buffered.indexOf("\n\n");
        while (sep !== -1) {
          const raw = buffered.slice(0, sep);
          buffered = buffered.slice(sep + 2);
          const parsed = parseSseChunk(raw);
          if (parsed) options.onEvent(parsed);
          sep = buffered.indexOf("\n\n");
        }
      }
    } finally {
      reader.releaseLock();
    }
  },

  reportMessage: (id: string, body: EcoReportMessageRequest) =>
    apiClient.post<{ ok: true }>(`/eco/messages/${id}/report`, body),
};

// ─── SSE parser ──────────────────────────────────────────────────────────────

/**
 * Parse a single SSE event chunk (everything before the blank-line
 * delimiter).
 *
 * NestJS' `@Sse()` serialises an observable of `{ data: {...} }` as:
 *
 *   id: 1
 *   data: {"event":"delta","data":{"text":"..."}}
 *
 * i.e. there is NO SSE `event:` field — the event type lives INSIDE the JSON
 * payload (`{ event, data }`). We therefore read the discriminant from the
 * parsed JSON, not from an `event:` line. (An earlier version required an
 * `event:` line that the server never emits, so every frame was silently
 * dropped and Eco appeared to never reply.)
 *
 * Returns `null` if the chunk is incomplete or unparseable — we let the
 * stream continue rather than throwing, because a single malformed frame
 * shouldn't terminate the conversation.
 */
/** @internal Exported for regression tests only — not part of the public API. */
export function parseSseChunk(raw: string): EcoSseEvent | null {
  const lines = raw.split("\n");
  let dataLine: string | undefined;
  for (const line of lines) {
    // Concatenate multi-line `data:` fields per the SSE spec.
    if (line.startsWith("data:")) {
      dataLine = (dataLine ?? "") + line.slice(5).trim();
    }
  }
  if (!dataLine) return null;
  try {
    const parsed = JSON.parse(dataLine) as { event?: string; data?: unknown };
    if (typeof parsed.event !== "string") return null;
    return parsed as EcoSseEvent;
  } catch {
    return null;
  }
}
