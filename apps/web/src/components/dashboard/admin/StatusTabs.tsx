import Link from "next/link";
import type { PulsoReportStatus } from "@psico/types";

/**
 * StatusTabs — Sprint S49.
 *
 * Querystring-driven tab strip for the reports inbox. Zero-JS — each tab is
 * a `<Link>` that re-renders the Server Component with `?status=…`.
 *
 * Order is deliberate: "Abiertos" first because it's the daily inbox the
 * admin lives in; "Resueltos" second for retrospect; "Todos" last as the
 * escape hatch.
 */
const TABS: Array<{ key: PulsoReportStatus; label: string }> = [
  { key: "open", label: "Abiertos" },
  { key: "resolved", label: "Resueltos" },
  { key: "all", label: "Todos" },
];

function buildHref(status: PulsoReportStatus, reason: string | null): string {
  const qs = new URLSearchParams();
  qs.set("status", status);
  if (reason) qs.set("reason", reason);
  return `/dashboard/admin/reports?${qs.toString()}`;
}

export function StatusTabs({
  active,
  reason,
}: {
  active: PulsoReportStatus;
  reason: string | null;
}) {
  return (
    <nav
      className="inline-flex gap-1 rounded-full border-[1.5px] bg-white p-1"
      style={{ borderColor: "var(--color-warm-200)" }}
      aria-label="Filtro por estado"
    >
      {TABS.map((t) => {
        const isActive = t.key === active;
        return (
          <Link
            key={t.key}
            href={buildHref(t.key, reason)}
            className="rounded-full px-3 py-1 text-[12.5px] font-medium transition"
            style={{
              background: isActive
                ? "var(--color-lavender-500)"
                : "transparent",
              color: isActive ? "white" : "var(--color-warm-700)",
            }}
            aria-current={isActive ? "page" : undefined}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
