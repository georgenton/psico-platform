import type { Metadata } from "next";
import { productionCircleTemplateRegistry } from "@psico/types";

import { isNextThrow, serverFetch } from "@/lib/api.server";
import { estilos as S } from "@/components/circulos/estilos";

/**
 * Círculos, for somebody with an account.
 *
 * `GET /api/circles/access` is the whole availability check: it answers 200 when
 * Círculos is on for THIS person and 503 otherwise, and the body is a constant
 * because all the information is in the status code. The page asks the server
 * rather than reading a flag of its own, so there is exactly one authority on
 * who may see this and it is not the browser.
 *
 * With the rollout off — which is where production is — every visitor lands on
 * the unavailable state. That is the correct screen, not a failure: PR3 shipped
 * the engine behind a flag that is off, and this page tells the truth about it.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Círculos | FeelVerse",
  robots: { index: false, follow: false },
};

async function circlesAvailable(): Promise<boolean> {
  try {
    await serverFetch<{ available: true }>("/circles/access", {
      cache: "no-store",
    });
    return true;
  } catch (err) {
    // `serverFetch` signals "no usable session" by THROWING a Next redirect.
    // Swallowing it here would render this page for somebody who is logged out
    // instead of bouncing them — the bug `isNextThrow` exists to prevent.
    if (isNextThrow(err)) throw err;
    // 503 CIRCLES_UNAVAILABLE, or anything else. Either way there is nothing
    // here for this person yet, and the reason is not theirs to debug.
    return false;
  }
}

export default async function CirculosPage() {
  const available = await circlesAvailable();
  const published = productionCircleTemplateRegistry.listPublished();

  if (!available) {
    return (
      <main style={S.page}>
        <h1 style={S.h1}>Círculos todavía no está abierto</h1>
        <p style={S.p}>
          Es una forma de hacer una actividad con otra persona: cada quien se
          prepara por su lado y deciden qué compartir. Te avisaremos cuando esté
          disponible para tu cuenta.
        </p>
      </main>
    );
  }

  return (
    <main style={S.page}>
      <header>
        <h1 style={S.h1}>Círculos</h1>
        <p style={S.p}>
          Una actividad con otra persona. Cada quien se prepara por su lado, y
          lo que comparten se abre para los dos a la vez.
        </p>
      </header>

      {published.length === 0 ? (
        <section style={S.section}>
          <h2 style={S.h2}>Aún no hay actividades publicadas</h2>
          <p style={S.p}>
            Estamos preparando las primeras. Cuando estén, aparecerán aquí.
          </p>
        </section>
      ) : (
        <ul
          style={{
            margin: 0,
            padding: 0,
            listStyle: "none",
            display: "grid",
            gap: ".8rem",
          }}
        >
          {published.map((d) => (
            <li key={`${d.templateKey}@${d.templateVersion}`} style={S.section}>
              <h2 style={S.h2}>{d.title}</h2>
              <p style={S.p}>{d.summary}</p>
              <a
                href={`/actividades/${encodeURIComponent(d.templateKey)}`}
                style={S.secondary}
              >
                Ver de qué se trata
              </a>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
