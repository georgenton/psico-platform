import type { PulsoAdminUserListResponse } from "@psico/types";
import { RoleSelector } from "./RoleSelector";

function formatDate(d: Date | string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("es-EC", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function roleBadgeColor(role: string): { bg: string; fg: string } {
  switch (role) {
    case "ADMIN":
      return { bg: "var(--color-rose-100)", fg: "var(--color-rose-700)" };
    case "PSYCHOLOGIST":
      return { bg: "var(--color-sage-100)", fg: "var(--color-sage-700)" };
    case "AUTHOR":
      return {
        bg: "var(--color-lavender-100)",
        fg: "var(--color-lavender-700)",
      };
    default:
      return { bg: "var(--color-warm-100)", fg: "var(--color-warm-700)" };
  }
}

export function UsersTable({
  data,
  currentAdminId,
}: {
  data: PulsoAdminUserListResponse;
  currentAdminId: string;
}) {
  if (data.items.length === 0) {
    return (
      <p
        className="rounded-2xl border-[1.5px] bg-white p-8 text-center text-[13px]"
        style={{
          borderColor: "var(--color-warm-200)",
          color: "var(--color-warm-500)",
        }}
      >
        No encontramos usuarios con esos filtros.
      </p>
    );
  }

  return (
    <ul
      className="divide-y rounded-2xl border-[1.5px] bg-white"
      style={{ borderColor: "var(--color-warm-200)" }}
    >
      {data.items.map((u) => {
        const isSelf = u.id === currentAdminId;
        const c = roleBadgeColor(u.role);
        return (
          <li key={u.id} className="p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className="text-[14px] font-bold tracking-tight"
                    style={{ color: "var(--color-warm-900)" }}
                  >
                    {u.firstName ?? u.name}
                  </span>
                  <span
                    className="rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide"
                    style={{ background: c.bg, color: c.fg }}
                  >
                    {u.role}
                  </span>
                  {!u.isActive ? (
                    <span
                      className="rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase"
                      style={{
                        background: "var(--color-warm-100)",
                        color: "var(--color-warm-500)",
                      }}
                    >
                      Inactivo
                    </span>
                  ) : null}
                  {!u.emailVerified ? (
                    <span
                      className="rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase"
                      style={{
                        background: "var(--color-rose-100)",
                        color: "var(--color-rose-700)",
                      }}
                    >
                      Sin verificar
                    </span>
                  ) : null}
                </div>
                <dl
                  className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-[12px]"
                  style={{ color: "var(--color-warm-600)" }}
                >
                  <div className="flex gap-1">
                    <dt>Email:</dt>
                    <dd className="font-medium">{u.email}</dd>
                  </div>
                  <div className="flex gap-1">
                    <dt>Plan:</dt>
                    <dd>{u.plan}</dd>
                  </div>
                  <div className="flex gap-1">
                    <dt>Creado:</dt>
                    <dd>{formatDate(u.createdAt)}</dd>
                  </div>
                </dl>
              </div>
              <RoleSelector
                userId={u.id}
                currentRole={u.role}
                isSelf={isSelf}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
