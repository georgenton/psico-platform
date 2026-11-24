import Link from "next/link";
import type { TherapyHistoryPresence } from "@psico/types";
import {
  THERAPY_OFFER_CLOSED_BODY,
  THERAPY_OFFER_CLOSED_MESSAGE,
} from "@psico/types";

import { hrefAyuda } from "@/lib/ayuda";

/**
 * Lo que se ve donde se ofrecería terapia.
 *
 * Breve a propósito: dice que no se ofrece, dónde hay ayuda ahora y, sólo si la
 * persona tiene algo, cómo volver a verlo. Sin lista de espera ni fecha: no hay
 * ninguna que se pueda cumplir.
 *
 * La ayuda va con enlace nativo y no con `Link`, igual que en el carril: es una
 * página pública que tiene que cargar aunque el código del cliente no responda.
 */
const HISTORIAL: ReadonlyArray<{
  clave: keyof TherapyHistoryPresence;
  href: string;
  texto: string;
}> = [
  {
    clave: "sessions",
    href: "/dashboard/terapia/sesiones",
    texto: "Tus sesiones",
  },
  {
    clave: "prescriptions",
    href: "/dashboard/terapia/recetas",
    texto: "Lo que te sugirieron",
  },
  {
    clave: "notifications",
    href: "/dashboard/terapia/notificaciones",
    texto: "Tus avisos",
  },
];

export function TerapiaCerrada({
  historial,
}: {
  /** `null` = no se pudo saber. Se dice; no se da por vacío. */
  historial: TherapyHistoryPresence | null;
}) {
  const enlaces = HISTORIAL.filter((e) => historial?.[e.clave] ?? false);

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <header>
        <h1
          className="text-[26px] font-bold tracking-tight"
          style={{ color: "var(--color-warm-900)" }}
        >
          Terapia
        </h1>
      </header>

      <section
        className="rounded-2xl border-[1.5px] bg-white p-5"
        style={{ borderColor: "var(--color-warm-200)" }}
      >
        <p
          className="text-[15px] font-semibold"
          style={{ color: "var(--color-warm-900)" }}
        >
          {THERAPY_OFFER_CLOSED_MESSAGE}
        </p>
        <p
          className="mt-1 text-[14px] leading-relaxed"
          style={{ color: "var(--color-warm-700)" }}
        >
          {THERAPY_OFFER_CLOSED_BODY}
        </p>
        <a
          href={hrefAyuda({ desde: "terapia" })}
          className="mt-4 inline-flex items-center rounded-xl px-4 text-[13px] font-medium text-white"
          style={{
            background: "var(--bg-brand-strong)",
            minHeight: "var(--fv-target-min)",
          }}
        >
          Ayuda inmediata
        </a>
      </section>

      {enlaces.length > 0 ? (
        <nav aria-label="Tu historial de terapia">
          <p
            className="mb-2 text-[12px] font-semibold uppercase tracking-wide"
            style={{ color: "var(--color-warm-500)" }}
          >
            Tu historial
          </p>
          <ul
            className="divide-y rounded-2xl border-[1.5px] bg-white"
            style={{ borderColor: "var(--color-warm-200)" }}
          >
            {enlaces.map((e) => (
              <li key={e.clave}>
                <Link
                  href={e.href}
                  className="flex items-center px-4 text-[14px] font-medium"
                  style={{
                    color: "var(--color-lavender-700)",
                    minHeight: "var(--fv-target-min)",
                  }}
                >
                  {e.texto}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}

      {historial === null ? (
        <p className="text-[13px]" style={{ color: "var(--color-warm-500)" }}>
          No pudimos comprobar si tienes historial de terapia. Vuelve a
          intentarlo en un momento.
        </p>
      ) : null}
    </div>
  );
}
