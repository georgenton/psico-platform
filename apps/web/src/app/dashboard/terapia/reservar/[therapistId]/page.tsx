import type { Metadata } from "next";
import Link from "next/link";
import type { TherapistDetail } from "@psico/types";
import { isNextThrow, serverFetch } from "@/lib/api.server";
import { BookingFlow } from "@/components/dashboard/terapia/BookingFlow";

export const metadata: Metadata = { title: "Reservar · Terapia" };
export const dynamic = "force-dynamic";

export default async function ReservarPage({
  params,
}: {
  params: Promise<{ therapistId: string }>;
}) {
  const { therapistId } = await params;
  let therapist: TherapistDetail | null = null;
  let loadError: string | null = null;
  try {
    therapist = await serverFetch<TherapistDetail>(
      `/terapia/therapists/${therapistId}`,
    );
  } catch (err) {
    if (isNextThrow(err)) throw err;
    loadError = err instanceof Error ? err.message : "Error desconocido";
  }

  if (!therapist) {
    return (
      <div className="mx-auto max-w-2xl">
        <Link
          href="/dashboard/terapia/terapeutas"
          className="text-[13px]"
          style={{ color: "var(--color-lavender-700)" }}
        >
          ← Volver al directorio
        </Link>
        <p
          className="mt-4 rounded-2xl border-[1.5px] bg-white p-6 text-[13px]"
          style={{
            borderColor: "var(--color-rose-200)",
            color: "var(--color-rose-700)",
          }}
        >
          {loadError ?? "Terapeuta no encontrado."}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <header className="mx-auto max-w-2xl">
        <Link
          href={`/dashboard/terapia/terapeutas/${therapist.id}`}
          className="text-[13px]"
          style={{ color: "var(--color-lavender-700)" }}
        >
          ← Volver al perfil
        </Link>
        <h1
          className="mt-3 text-[26px] font-bold tracking-tight"
          style={{ color: "var(--color-warm-900)" }}
        >
          Reservar con {therapist.name}
        </h1>
      </header>

      <BookingFlow therapist={therapist} />
    </div>
  );
}
