import type { Metadata } from "next";
import Link from "next/link";
import type { SessionPrepResponse } from "@psico/types";
import { isNextThrow, serverFetch } from "@/lib/api.server";
import { SessionDetailShell } from "@/components/dashboard/terapia/SessionDetailShell";

export const metadata: Metadata = { title: "Sesión · Terapia" };
export const dynamic = "force-dynamic";

export default async function SesionDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  let data: SessionPrepResponse | null = null;
  let loadError: string | null = null;
  try {
    data = await serverFetch<SessionPrepResponse>(
      `/terapia/sessions/${id}/prep`,
    );
  } catch (err) {
    if (isNextThrow(err)) throw err;
    loadError = err instanceof Error ? err.message : "Error desconocido";
  }

  return (
    <div className="space-y-5">
      <header className="mx-auto max-w-2xl">
        <Link
          href="/dashboard/terapia/sesiones"
          className="text-[13px]"
          style={{ color: "var(--color-lavender-700)" }}
        >
          ← Mis sesiones
        </Link>
      </header>

      {!data ? (
        <p
          className="mx-auto max-w-2xl rounded-2xl border-[1.5px] bg-white p-6 text-[13px]"
          style={{
            borderColor: "var(--color-rose-200)",
            color: "var(--color-rose-700)",
          }}
        >
          {loadError ?? "Sesión no encontrada."}
        </p>
      ) : (
        <SessionDetailShell initial={data} />
      )}
    </div>
  );
}
