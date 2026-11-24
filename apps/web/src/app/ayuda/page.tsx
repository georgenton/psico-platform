import type { Metadata } from "next";
import { cookies } from "next/headers";
import { CRISIS_COUNTRY_NAMES } from "@psico/types";

import { AyudaInmediata } from "@/components/ayuda/AyudaInmediata";
import { origenAyuda, volverDesdeAyuda } from "@/lib/ayuda";
import { paisAyuda } from "@/lib/ayuda-pais";
import { TOKEN_NAMES } from "@/lib/cookies";

/**
 * Ayuda inmediata — PÚBLICA, sin cuenta.
 *
 * Es la decisión ética del proyecto llevada a la Web: alguien en crisis no
 * debería tener que iniciar sesión para ver el número de una línea. La API ya
 * era pública; la pantalla exigía sesión y onboarding terminado.
 *
 * ── Lo que esta página NO hace, a propósito ───────────────────────────────
 *
 * · No pide nada a la API. Las líneas salen del catálogo compartido, así que
 *   se ven aunque la API esté caída.
 * · No valida la sesión ni la renueva: sólo mira si hay cookie, para que
 *   «volver» lleve al sitio correcto.
 * · No avisa a nadie de que se ha abierto. `POST /terapia/crisis/log` existe y
 *   no se llama desde aquí.
 * · No carga nada de terceros: la CSP de `next.config.js` lo impide.
 */

// `cookies()` y `searchParams` ya la hacen dinámica; se declara para que nadie
// la convierta en una página cacheada con el «volver» de otra persona.
export const dynamic = "force-dynamic";

interface Props {
  searchParams: Record<string, string | string[] | undefined>;
}

export function generateMetadata({ searchParams }: Props): Metadata {
  const pais = paisAyuda(searchParams.pais);
  return {
    // El país va en el título: es lo primero que se oye al cambiarlo.
    title: `Ayuda inmediata en ${CRISIS_COUNTRY_NAMES[pais]}`,
    description:
      "Recursos de ayuda por país, con la fuente de cada uno. No necesitas una cuenta de FeelVerse.",
  };
}

export default function AyudaPage({ searchParams }: Props) {
  const jar = cookies();
  const haySesion = jar.has(TOKEN_NAMES.access) || jar.has(TOKEN_NAMES.refresh);
  const desde = origenAyuda(searchParams.desde);

  return (
    <AyudaInmediata
      pais={paisAyuda(searchParams.pais)}
      desde={desde}
      vuelta={volverDesdeAyuda({ desde, haySesion })}
    />
  );
}
