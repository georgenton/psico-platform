import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type {
  PulsoAdminUserListResponse,
  UserRole,
} from "@psico/types";
import { getSessionUser, isNextThrow, serverFetch } from "@/lib/api.server";
import { UsersTable } from "@/components/dashboard/admin/UsersTable";
import { UsersFilters } from "@/components/dashboard/admin/UsersFilters";

export const metadata: Metadata = { title: "Pulso · Usuarios" };
export const dynamic = "force-dynamic";

const ROLES: UserRole[] = ["USER", "AUTHOR", "PSYCHOLOGIST", "ADMIN"];

function parseRole(raw: string | undefined): UserRole | null {
  return raw && (ROLES as string[]).includes(raw) ? (raw as UserRole) : null;
}

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: { q?: string; role?: string };
}) {
  const me = getSessionUser();
  if (!me || me.role !== "ADMIN") redirect("/dashboard");

  const q = searchParams.q?.trim() ?? "";
  const role = parseRole(searchParams.role);

  const qs = new URLSearchParams();
  if (q) qs.set("q", q);
  if (role) qs.set("role", role);
  qs.set("limit", "100");

  let data: PulsoAdminUserListResponse | null = null;
  let error: string | null = null;
  try {
    data = await serverFetch<PulsoAdminUserListResponse>(
      `/pulso/users?${qs.toString()}`,
      { cache: "no-store" },
    );
  } catch (e) {
    if (isNextThrow(e)) throw e;
    error = e instanceof Error ? e.message : "No pudimos cargar los usuarios.";
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5">
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
          Usuarios
        </h1>
        <p
          className="mt-1 text-[13px]"
          style={{ color: "var(--color-warm-500)" }}
        >
          Busca por email o nombre y cambia el rol de un usuario. Cada cambio
          queda en el audit log.
        </p>
      </header>

      <UsersFilters q={q} role={role} />

      {data ? (
        <UsersTable data={data} currentAdminId={me.userId} />
      ) : (
        <p
          className="rounded-2xl border-[1.5px] bg-white p-6 text-[13px]"
          style={{
            borderColor: "var(--color-warm-200)",
            color: "var(--color-warm-500)",
          }}
        >
          {error ?? "No pudimos cargar los usuarios."}
        </p>
      )}
    </div>
  );
}
