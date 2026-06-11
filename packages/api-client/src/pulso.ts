import type {
  AuthorRequestStatus,
  PulsoApproveAuthorRequestResponse,
  PulsoAuthorRequestListResponse,
  PulsoCohortRetentionResponse,
  PulsoMarkResolvedRequest,
  PulsoOverviewResponse,
  PulsoRejectAuthorRequestBody,
  PulsoReportListResponse,
  PulsoReportReason,
  PulsoReportRow,
  PulsoReportStatus,
  PulsoReportSummary,
} from "@psico/types";
import { apiClient } from "./client";

/**
 * pulsoApi — Sprint S42 (reports) + S48 (overview) + S49 (resolution).
 *
 * Admin-only surface (server enforces role=ADMIN). Calling these endpoints
 * as a non-admin returns 403 — the frontend ALSO gates the route, but the
 * server is the authoritative check.
 */
export const pulsoApi = {
  getEcoSummary: (status?: PulsoReportStatus) =>
    apiClient.get<PulsoReportSummary>(
      `/pulso/reports/eco/summary${status ? `?status=${status}` : ""}`,
    ),

  listEcoReports: (
    params: {
      reason?: PulsoReportReason;
      status?: PulsoReportStatus;
      limit?: number;
      cursor?: string;
    } = {},
  ) => {
    const qs = new URLSearchParams();
    if (params.reason) qs.set("reason", params.reason);
    if (params.status) qs.set("status", params.status);
    if (params.limit) qs.set("limit", String(params.limit));
    if (params.cursor) qs.set("cursor", params.cursor);
    const query = qs.toString();
    return apiClient.get<PulsoReportListResponse>(
      `/pulso/reports/eco${query ? `?${query}` : ""}`,
    );
  },

  // Sprint S49 — mark a report as triaged. Idempotent: re-resolving
  // overwrites the timestamp + admin + note. Returns the updated row.
  markResolved: (id: string, body: PulsoMarkResolvedRequest = {}) =>
    apiClient.post<PulsoReportRow>(`/pulso/reports/eco/${id}/resolve`, body),

  // Sprint S49 — reopen a resolved report. Clears resolvedAt/By/Note.
  markUnresolved: (id: string) =>
    apiClient.post<PulsoReportRow>(`/pulso/reports/eco/${id}/unresolve`, {}),

  // Sprint S48 — platform overview KPIs (cached 5min server-side).
  getOverview: () => apiClient.get<PulsoOverviewResponse>("/pulso/overview"),

  // Sprint S51 — cohort retention triangle. One row per signup-week with
  // weekOffset cells; cached 5min server-side.
  getCohorts: () =>
    apiClient.get<PulsoCohortRetentionResponse>("/pulso/cohorts"),

  // ── Sprint S71.B — Author publication reviews (ADMIN) ───────────────

  listAuthorRequests: (params: { status?: AuthorRequestStatus; limit?: number } = {}) => {
    const qs = new URLSearchParams();
    if (params.status) qs.set("status", params.status);
    if (params.limit) qs.set("limit", String(params.limit));
    const query = qs.toString();
    return apiClient.get<PulsoAuthorRequestListResponse>(
      `/pulso/author-requests${query ? `?${query}` : ""}`,
    );
  },

  approveAuthorRequest: (id: string) =>
    apiClient.post<PulsoApproveAuthorRequestResponse>(
      `/pulso/author-requests/${id}/approve`,
      {},
    ),

  rejectAuthorRequest: (id: string, body: PulsoRejectAuthorRequestBody = {}) =>
    apiClient.post<{ ok: true }>(
      `/pulso/author-requests/${id}/reject`,
      body,
    ),
};
