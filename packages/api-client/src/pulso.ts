import type {
  PulsoOverviewResponse,
  PulsoReportListResponse,
  PulsoReportReason,
  PulsoReportSummary,
} from "@psico/types";
import { apiClient } from "./client";

/**
 * pulsoApi — Sprint S42 (reports) + S48 (overview).
 *
 * Admin-only surface (server enforces role=ADMIN). Calling these endpoints
 * as a non-admin returns 403 — the frontend ALSO gates the route, but the
 * server is the authoritative check.
 */
export const pulsoApi = {
  getEcoSummary: () =>
    apiClient.get<PulsoReportSummary>("/pulso/reports/eco/summary"),

  listEcoReports: (
    params: {
      reason?: PulsoReportReason;
      limit?: number;
      cursor?: string;
    } = {},
  ) => {
    const qs = new URLSearchParams();
    if (params.reason) qs.set("reason", params.reason);
    if (params.limit) qs.set("limit", String(params.limit));
    if (params.cursor) qs.set("cursor", params.cursor);
    const query = qs.toString();
    return apiClient.get<PulsoReportListResponse>(
      `/pulso/reports/eco${query ? `?${query}` : ""}`,
    );
  },

  // Sprint S48 — platform overview KPIs (cached 5min server-side).
  getOverview: () => apiClient.get<PulsoOverviewResponse>("/pulso/overview"),
};
