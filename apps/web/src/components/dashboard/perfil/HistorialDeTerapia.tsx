import Link from "next/link";
import { therapyHistoryEntry } from "@psico/types";

import { ofertaDeTerapia } from "@/lib/terapia/oferta";

/**
 * Cuánto se espera por esta lectura. Al cargar da igual —Perfil se pinta sin
 * ella—, pero al guardar algo React retiene la pantalla nueva hasta que todo
 * termina: sin límite, un hub lento retrasaba ver lo que se acababa de guardar,
 * y uno colgado lo impedía.
 */
const ESPERA_MS = 1_500;

async function hubSiLlega() {
  let limite: ReturnType<typeof setTimeout> | undefined;
  const tarde = new Promise<null>((r) => {
    limite = setTimeout(() => r(null), ESPERA_MS);
  });
  try {
    // Lo que llegue después, o falle después, ya no lo mira nadie.
    return await Promise.race([ofertaDeTerapia().then((o) => o.hub), tarde]);
  } finally {
    clearTimeout(limite);
  }
}

/**
 * La vuelta a lo que alguien ya tenía de terapia, sólo para quien tiene algo.
 *
 * Se monta dentro de un `Suspense` sin sustituto: Perfil no la espera, y si la
 * lectura falla, tarda o no se sabe, en su sitio no queda nada.
 */
export async function HistorialDeTerapia() {
  const entrada = therapyHistoryEntry(await hubSiLlega());
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
