import type { Metadata } from "next";
import {
  circleAllowedSizes,
  productionCircleTemplateRegistry,
} from "@psico/types";

import { isNextThrow, serverFetch } from "@/lib/api.server";
import { resolveCircleStart } from "@/lib/circulos/eligibility";
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
  title: "Círculos",
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
          Una actividad para hacer con otras personas. Cada quien se prepara por
          su lado, y lo que deciden compartir se abre para todas a la vez.
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
          {published.map((d) => {
            // How this activity can actually be started. A Dúo is proposed by
            // the material it belongs to, so for one of those this listing's
            // job is to send somebody there — not to become a second place
            // that starts one. A group belongs to no particular reading, so
            // this listing IS its surface. Which of the two applies is decided
            // server-side, per audience; the page only renders the answer.
            //
            // `null` means nothing here can begin it, and then there is no
            // button: an action that cannot start anything is worse than none,
            // because the person spends their attempt on it and concludes the
            // product is broken.
            const start = resolveCircleStart(d);
            const people = circleAllowedSizes(d);
            return (
              <li
                key={`${d.templateKey}@${d.templateVersion}`}
                style={S.section}
              >
                <h2 style={S.h2}>{d.title}</h2>
                <p style={S.p}>{d.summary}</p>
                <p style={S.aviso}>
                  {people.length > 1
                    ? `Invita hasta ${people[people.length - 1]} personas adultas, contándote. La actividad sigue con quienes acepten, desde ${people[0]}.`
                    : `${people[0]} personas adultas.`}
                </p>
                {start ? (
                  <a href={start.href} style={S.secondary}>
                    {start.label}
                  </a>
                ) : (
                  <p style={S.aviso}>
                    Esta actividad se propone desde la lectura a la que
                    pertenece, y todavía no hay una desde la que puedas
                    empezarla. Cuando la haya, aparecerá aquí el camino.
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
