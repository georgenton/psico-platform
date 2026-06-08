import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type {
  PulsoReportListResponse,
  PulsoReportReason,
  PulsoReportStatus,
  PulsoReportSummary,
} from "@psico/types";

import { getSessionUser, isNextThrow, serverFetch } from "@/lib/api.server";
import { ReasonChips } from "@/components/dashboard/admin/ReasonChips";
import { ReportsList } from "@/components/dashboard/admin/ReportsList";
import { StatusTabs } from "@/components/dashboard/admin/StatusTabs";

export const metadata: Metadata = { title: "Pulso · Reports Eco" };
export const dynamic = "force-dynamic";

const REASONS: PulsoReportReason[] = [
  "HALLUCINATION",
  "OFF_TONE",
  "SENSITIVE_CONTENT",
  "CRISIS_MISHANDLED",
  "OTHER",
];

const STATUSES: PulsoReportStatus[] = ["open", "resolved", "all"];

function parseReason(raw: string | undefined): PulsoReportReason | null {
  return raw && (REASONS as string[]).includes(raw)
    ? (raw as PulsoReportReason)
    : null;
}

function parseStatus(raw: string | undefined): PulsoReportStatus {
  return raw && (STATUSES as string[]).includes(raw)
    ? (raw as PulsoReportStatus)
    : "open";
}

export default async function PulsoReportsPage({
  searchParams,
}: {
  searchParams: { reason?: string; status?: string };
}) {
  // ADMIN-only. Frontend gate is defensive — the API enforces too.
  const user = getSessionUser();
  if (!user || user.role !== "ADMIN") {
    redirect("/dashboard");
  }

  const reason = parseReason(searchParams.reason);
  const status = parseStatus(searchParams.status);

  let summary: PulsoReportSummary | null = null;
  let data: PulsoReportListResponse | null = null;
  try {
    const listParams = new URLSearchParams();
    listParams.set("status", status);
    if (reason) listParams.set("reason", reason);
    [summary, data] = await Promise.all([
      serverFetch<PulsoReportSummary>(
        `/pulso/reports/eco/summary?status=${status}`,
      ),
      serverFetch<PulsoReportListResponse>(
        `/pulso/reports/eco?${listParams.toString()}`,
      ),
    ]);
  } catch (err) {
    if (isNextThrow(err)) throw err;
  }

  if (!summary || !data) {
    return (
      <div className="mx-auto max-w-4xl">
        <h1
          className="mb-3 text-[26px] font-bold tracking-tight"
          style={{ color: "var(--color-warm-900)" }}
        >
          Pulso · Reports Eco
        </h1>
        <p
          className="rounded-2xl border-[1.5px] bg-white p-6 text-[13px]"
          style={{
            borderColor: "var(--color-warm-200)",
            color: "var(--color-warm-500)",
          }}
        >
          No pudimos cargar los reportes. Reintenta.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <header>
        <p
          className="text-[11px] font-bold uppercase tracking-[0.14em]"
          style={{ color: "var(--color-lavender-500)" }}
        >
          Pulso · v2
        </p>
        <h1
          className="mt-1 text-[26px] font-bold tracking-tight"
          style={{ color: "var(--color-warm-900)" }}
        >
          Reports de Eco
        </h1>
        <p
          className="mt-1 text-[13px]"
          style={{ color: "var(--color-warm-500)" }}
        >
          Mensajes de Eco marcados por usuarios. Solo respuestas del assistant —
          los prompts del usuario son cifrados y no se descifran server-side.
        </p>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <StatusTabs active={status} reason={reason ?? null} />
      </div>

      <ReasonChips summary={summary} active={reason} />
      <ReportsList data={data} />
    </div>
  );
}
