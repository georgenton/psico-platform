import type { Metadata } from "next";
import {
  CircleCatalogError,
  productionCircleTemplateRegistry,
  toCircleTemplatePreview,
} from "@psico/types";
import type { CircleTemplatePreview } from "@psico/types";

import { estilos as S } from "@/components/circulos/estilos";

/**
 * The public face of an activity — the only Círculos page a stranger may read.
 *
 * It shows a `CircleTemplatePreview` and nothing else. That type exists so the
 * absence is checkable rather than a habit: no activity id, no roster, no
 * participant, no state, no token, no editorial internals. There is no instance
 * behind this page at all — it describes a template, not somebody's Dúo.
 *
 * `toCircleTemplatePreview` refuses to project anything that is not `PUBLISHED`,
 * so DRAFT and ARCHIVED cannot reach this screen even if a link names them. The
 * check lives in the projector rather than here on purpose: a page that trusted
 * itself to have filtered first is one forgetful edit away from showing an
 * unreviewed draft to a stranger.
 *
 * The production catalog is empty today, so every key lands on "not available".
 * That is the honest state of the product, and publishing a template to make
 * this screen look better is an editorial act with its own approval — not a
 * side effect of building the page.
 */

export const dynamic = "force-static";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/**
 * Resolve the newest PUBLISHED version for a key.
 *
 * The registry is pinned by `key@version` because a published template is
 * immutable and a correction is a new version. A URL carries only the key, so
 * the page picks the highest published version — a presentation choice, made
 * here, that does not weaken the projector's own status rule.
 */
function previewFor(templateKey: string): CircleTemplatePreview | null {
  const candidates = productionCircleTemplateRegistry
    .listPublished()
    .filter((d) => d.templateKey === templateKey)
    .sort((a, b) => b.templateVersion - a.templateVersion);

  const newest = candidates[0];
  if (!newest) return null;
  try {
    return toCircleTemplatePreview(newest);
  } catch (err) {
    if (err instanceof CircleCatalogError) return null;
    throw err;
  }
}

export default function ActividadPreviewPage({
  params,
}: {
  params: { templateKey: string };
}) {
  const preview = previewFor(params.templateKey);

  if (!preview) {
    return (
      <main style={S.page}>
        <h1 style={S.h1}>Esta actividad no está disponible</h1>
        <p style={S.p}>
          Todavía no hay ninguna actividad publicada con este nombre. Si alguien
          te compartió el enlace, pídele que lo revise.
        </p>
        <a href="/" style={S.secondary}>
          Ir al inicio
        </a>
      </main>
    );
  }

  return (
    <main style={S.page}>
      <header>
        <h1 style={S.h1}>{preview.title}</h1>
        <p style={S.p}>{preview.summary}</p>
      </header>

      <section style={S.section} aria-labelledby="como-h">
        <h2 id="como-h" style={S.h2}>
          Cómo funciona
        </h2>
        <ul
          style={{
            margin: 0,
            paddingLeft: "1.2rem",
            display: "grid",
            gap: ".5rem",
          }}
        >
          <li style={S.turno}>
            Son {preview.participants.required} personas, cada una en su propio
            dispositivo.
          </li>
          <li style={S.turno}>
            Primero se preparan por separado. Nadie ve nada del otro todavía.
          </li>
          <li style={S.turno}>
            Cada quien decide qué comparte — puede ser todo, una parte, o nada.
          </li>
          <li style={S.turno}>
            Se abre para los dos a la vez, sólo cuando ambos confirmaron.
          </li>
          <li style={S.turno}>Toma unos {preview.estimatedMinutes} minutos.</li>
        </ul>
      </section>

      {preview.conversationTurns.length > 0 && (
        <section style={S.section} aria-labelledby="turnos-h">
          <h2 id="turnos-h" style={S.h2}>
            De qué van a hablar
          </h2>
          <ol
            style={{
              margin: 0,
              paddingLeft: "1.2rem",
              display: "grid",
              gap: ".5rem",
            }}
          >
            {preview.conversationTurns.map((turn, i) => (
              <li key={i} style={S.turno}>
                {turn}
              </li>
            ))}
          </ol>
        </section>
      )}

      {preview.safetyLevel === "REINFORCED" && (
        <p style={S.aviso} role="note">
          Esta actividad toca temas delicados. Puedes parar cuando quieras, y no
          compartir nada sigue siendo una respuesta válida.
        </p>
      )}

      <p style={S.p}>
        Para hacerla necesitas una invitación de la otra persona.
      </p>
    </main>
  );
}
