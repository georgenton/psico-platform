import type { Metadata } from "next";
import Link from "next/link";
import { ofertaDeTerapia, sesionDeTerapia } from "@/lib/terapia/oferta";
import { SessionDetailShell } from "@/components/dashboard/terapia/SessionDetailShell";
import { TerapiaCerrada } from "@/components/dashboard/terapia/TerapiaCerrada";

export const metadata: Metadata = { title: "Sesión · Terapia" };
export const dynamic = "force-dynamic";

export default async function SesionDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const sesion = await sesionDeTerapia(id);
  if (!sesion.prep && sesion.motivo === "no-existe") {
    const { abierta, historial } = await ofertaDeTerapia();
    if (!abierta) return <TerapiaCerrada historial={historial} />;
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

      {!sesion.prep ? (
        <p
          className="mx-auto max-w-2xl rounded-2xl border-[1.5px] bg-white p-6 text-[13px]"
          style={{
            borderColor: "var(--color-rose-200)",
            color: "var(--color-rose-700)",
          }}
        >
          {sesion.motivo === "no-existe"
            ? "No encontramos esa sesión."
            : "No pudimos cargar esta sesión. Vuelve a intentarlo en un momento."}
        </p>
      ) : (
        <SessionDetailShell initial={sesion.prep} />
      )}
    </div>
  );
}
