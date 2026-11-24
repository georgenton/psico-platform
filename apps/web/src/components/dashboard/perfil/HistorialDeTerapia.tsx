import Link from "next/link";
import { therapyHistoryEntry } from "@psico/types";

import { ofertaDeTerapia } from "@/lib/terapia/oferta";

/**
 * La vuelta a lo que alguien ya tenía de terapia, sólo para quien tiene algo.
 *
 * Se monta dentro de un `Suspense` sin sustituto: Perfil no la espera, y si la
 * lectura falla o no se sabe, en su sitio no queda nada.
 */
export async function HistorialDeTerapia() {
  const { hub } = await ofertaDeTerapia();
  const entrada = therapyHistoryEntry(hub);
  if (!entrada) return null;

  return (
    <Link
      href="/dashboard/terapia"
      className="block rounded-2xl border-[1.5px] bg-white p-4 transition hover:bg-[var(--color-warm-50)]"
      style={{ borderColor: "var(--color-warm-200)" }}
      data-testid="therapy-history"
    >
      <p
        className="text-[13px] font-semibold"
        style={{ color: "var(--color-warm-900)" }}
      >
        {entrada.title}
      </p>
      <p
        className="mt-0.5 text-[11px]"
        style={{ color: "var(--color-warm-500)" }}
      >
        {entrada.hint}
      </p>
    </Link>
  );
}
