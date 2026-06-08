"use server";

import { revalidatePath } from "next/cache";
import type { PulsoMarkResolvedRequest, PulsoReportRow } from "@psico/types";

import { serverFetch } from "@/lib/api.server";

/**
 * Sprint S49 — mark an Eco report as triaged. Idempotent: re-resolving
 * overwrites the timestamp + admin + note.
 *
 * Server action so the ReportsList row can run on a regular `<form>` POST
 * without shipping a custom client fetch. The route then `revalidatePath`s
 * `/dashboard/admin/reports` and `/dashboard/admin/overview` so both the
 * inbox AND the KPI card refresh — the backlog count is one of the metrics
 * shown in S48.
 */
export async function markReportResolvedAction(
  id: string,
  body: PulsoMarkResolvedRequest = {},
): Promise<PulsoReportRow> {
  const next = await serverFetch<PulsoReportRow>(
    `/pulso/reports/eco/${id}/resolve`,
    { method: "POST", body },
  );
  revalidatePath("/dashboard/admin/reports");
  revalidatePath("/dashboard/admin/overview");
  return next;
}

/** Sprint S49 — reopen a previously-resolved report. */
export async function markReportUnresolvedAction(
  id: string,
): Promise<PulsoReportRow> {
  const next = await serverFetch<PulsoReportRow>(
    `/pulso/reports/eco/${id}/unresolve`,
    { method: "POST", body: {} },
  );
  revalidatePath("/dashboard/admin/reports");
  revalidatePath("/dashboard/admin/overview");
  return next;
}
