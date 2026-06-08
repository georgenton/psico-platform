import type { PulsoReportListResponse, PulsoReportReason } from "@psico/types";
import { ResolveRowActions } from "./ResolveRowActions";

const REASON_LABEL: Record<PulsoReportReason, string> = {
  HALLUCINATION: "Inventó info",
  OFF_TONE: "Tono",
  SENSITIVE_CONTENT: "Sensible",
  CRISIS_MISHANDLED: "Crisis",
  OTHER: "Otra",
};

const REASON_COLOR: Record<PulsoReportReason, string> = {
  HALLUCINATION: "#F59E0B",
  OFF_TONE: "#3B82F6",
  SENSITIVE_CONTENT: "#EF4444",
  CRISIS_MISHANDLED: "#B91C1C",
  OTHER: "#6B7280",
};

export function ReportsList({ data }: { data: PulsoReportListResponse }) {
  if (data.items.length === 0) {
    return (
      <p
        className="rounded-2xl border-[1.5px] bg-white p-6 text-center text-[13px]"
        style={{
          borderColor: "var(--color-warm-200)",
          color: "var(--color-warm-500)",
        }}
      >
        No hay reportes en este filtro.
      </p>
    );
  }

  return (
    <div
      className="overflow-hidden rounded-2xl border-[1.5px] bg-white"
      style={{ borderColor: "var(--color-warm-200)" }}
    >
      <ul>
        {data.items.map((row, i) => (
          <li
            key={row.id}
            className="border-b px-5 py-3 last:border-b-0"
            style={{
              borderColor: "var(--color-warm-100)",
              background: i % 2 === 0 ? "white" : "var(--color-warm-50)",
            }}
          >
            <div className="flex items-baseline gap-3">
              <span
                className="inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide text-white"
                style={{ background: REASON_COLOR[row.reason] }}
              >
                {REASON_LABEL[row.reason]}
              </span>
              <span
                className="text-[11.5px]"
                style={{ color: "var(--color-warm-500)" }}
              >
                {new Date(row.createdAt).toLocaleString("es-EC", {
                  day: "numeric",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
              <span
                className="ml-auto text-[10.5px] font-mono"
                style={{ color: "var(--color-warm-400)" }}
              >
                user:{row.userId.slice(0, 8)} · thread:
                {row.threadId.slice(0, 8)}
              </span>
            </div>
            {row.comment ? (
              <p
                className="mt-2 text-[12.5px] italic"
                style={{ color: "var(--color-warm-700)" }}
              >
                “{row.comment}”
              </p>
            ) : null}
            <p
              className="mt-2 text-[13px] leading-relaxed"
              style={{ color: "var(--color-warm-800)" }}
            >
              {row.assistantTextSnippet || (
                <span style={{ color: "var(--color-warm-400)" }}>
                  (sin texto)
                </span>
              )}
            </p>
            {/* Sprint S49 — resolve / reabrir actions per row. */}
            <ResolveRowActions row={row} />
          </li>
        ))}
      </ul>
      {data.hasMore ? (
        <p
          className="border-t px-5 py-3 text-center text-[11px]"
          style={{
            borderColor: "var(--color-warm-100)",
            color: "var(--color-warm-500)",
          }}
        >
          Hay más reportes. Paginación cursor llegará cuando el volumen lo
          justifique.
        </p>
      ) : null}
    </div>
  );
}
