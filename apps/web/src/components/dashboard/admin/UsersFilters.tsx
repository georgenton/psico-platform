import Link from "next/link";
import type { UserRole } from "@psico/types";

/**
 * UsersFilters — Sprint S72.
 *
 * Server-rendered search + role chips. Form is GET, so submitting reloads
 * with the new querystring. Chips are <Link> for the role filter — zero-JS.
 */
const ROLES: Array<{ key: UserRole | null; label: string }> = [
  { key: null, label: "Todos" },
  { key: "USER", label: "USER" },
  { key: "AUTHOR", label: "AUTHOR" },
  { key: "PSYCHOLOGIST", label: "PSYCHOLOGIST" },
  { key: "ADMIN", label: "ADMIN" },
];

function buildHref(q: string, role: UserRole | null): string {
  const qs = new URLSearchParams();
  if (q) qs.set("q", q);
  if (role) qs.set("role", role);
  const s = qs.toString();
  return s ? `/dashboard/admin/users?${s}` : "/dashboard/admin/users";
}

export function UsersFilters({
  q,
  role,
}: {
  q: string;
  role: UserRole | null;
}) {
  return (
    <div className="space-y-3">
      <form
        method="get"
        action="/dashboard/admin/users"
        className="flex flex-wrap items-center gap-2"
      >
        <input
          type="text"
          name="q"
          defaultValue={q}
          placeholder="Buscar por email o nombre…"
          className="min-w-[260px] flex-1 rounded-full border-[1.5px] bg-white px-4 py-2 text-[13px] outline-none"
          style={{ borderColor: "var(--color-warm-200)" }}
        />
        {role ? (
          <input type="hidden" name="role" value={role} />
        ) : null}
        <button
          type="submit"
          className="rounded-full px-4 py-2 text-[12.5px] font-semibold"
          style={{
            background: "var(--color-lavender-500)",
            color: "white",
          }}
        >
          Buscar
        </button>
        {q ? (
          <Link
            href={buildHref("", role)}
            className="text-[12px] underline"
            style={{ color: "var(--color-warm-500)" }}
          >
            Limpiar
          </Link>
        ) : null}
      </form>

      <nav
        className="flex flex-wrap gap-1 rounded-full border-[1.5px] bg-white p-1"
        style={{ borderColor: "var(--color-warm-200)" }}
        aria-label="Filtro por rol"
      >
        {ROLES.map((r) => {
          const isActive = r.key === role;
          return (
            <Link
              key={r.key ?? "all"}
              href={buildHref(q, r.key)}
              className="rounded-full px-3 py-1 text-[12px] font-medium transition"
              style={{
                background: isActive
                  ? "var(--color-lavender-500)"
                  : "transparent",
                color: isActive ? "white" : "var(--color-warm-700)",
              }}
              aria-current={isActive ? "page" : undefined}
            >
              {r.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
