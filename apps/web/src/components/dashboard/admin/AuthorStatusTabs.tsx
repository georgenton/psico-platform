import Link from "next/link";
import type { AuthorRequestStatus } from "@psico/types";

/**
 * AuthorStatusTabs — Sprint S71.B-front.
 *
 * Querystring-driven tab strip for the author publication review inbox.
 * Mirrors StatusTabs (S49) — PENDING first because it's the actionable
 * default, ALL second for retrospect.
 */
const TABS: Array<{ key: AuthorRequestStatus; label: string }> = [
  { key: "PENDING", label: "Pendientes" },
  { key: "ALL", label: "Todos" },
];

function buildHref(status: AuthorRequestStatus): string {
  const qs = new URLSearchParams();
  qs.set("status", status);
  return `/dashboard/admin/author-requests?${qs.toString()}`;
}

export function AuthorStatusTabs({ active }: { active: AuthorRequestStatus }) {
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
            href={buildHref(t.key)}
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
