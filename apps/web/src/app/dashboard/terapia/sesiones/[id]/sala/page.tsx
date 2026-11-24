import type { Metadata } from "next";
import Link from "next/link";
import { THERAPY_DEMO_SESSION_MESSAGE } from "@psico/types";
import { ofertaDeTerapia, sesionDeTerapia } from "@/lib/terapia/oferta";
import { TerapiaCerrada } from "@/components/dashboard/terapia/TerapiaCerrada";
import { VideoRoom } from "@/components/dashboard/terapia/VideoRoom";

export const metadata: Metadata = { title: "Sala · Terapia" };
export const dynamic = "force-dynamic";

/**
 * La sala de una sesión real no depende de la oferta: quien tiene una sesión
 * entra a ella aunque hoy no se ofrezcan más.
 *
 * Se lee la sesión ANTES de montar la sala porque `VideoRoom` la pide al
 * cargar. El servidor rechaza igualmente una de demostración; esto evita
 * enseñar «conectando» sobre una sala que no se va a abrir.
 */
export default async function SalaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const sesion = await sesionDeTerapia(id);

  if (!sesion.prep) {
    if (sesion.motivo === "no-existe") {
      const { abierta, historial } = await ofertaDeTerapia();
      if (!abierta) return <TerapiaCerrada historial={historial} />;
    }
    return (
      <Aviso
        texto={
          sesion.motivo === "no-existe"
            ? "No encontramos esa sesión."
            : "No pudimos abrir esta sesión. Vuelve a intentarlo en un momento."
        }
        href="/dashboard/terapia/sesiones"
      />
    );
  }

  if (sesion.prep.session.therapist.isDemo) {
    return (
      <Aviso
        texto={THERAPY_DEMO_SESSION_MESSAGE}
        href={`/dashboard/terapia/sesiones/${id}`}
      />
    );
  }

  return (
    <VideoRoom sessionId={id} backHref={`/dashboard/terapia/sesiones/${id}`} />
  );
}

function Aviso({ texto, href }: { texto: string; href: string }) {
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link
        href={href}
        className="text-[13px]"
        style={{ color: "var(--color-lavender-700)" }}
      >
        ← Volver
      </Link>
      <p
        className="rounded-2xl border-[1.5px] bg-white p-6 text-[13px]"
        style={{
          borderColor: "var(--color-warm-200)",
          color: "var(--color-warm-700)",
        }}
      >
        {texto}
      </p>
    </div>
  );
}
