import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { CircleSharingMode } from "@psico/types";
import { toCircleTemplatePreview } from "@psico/types";

import { resolvePublishedTemplateByKey } from "@/lib/circulos/eligibility";
import { CrearDuo } from "@/components/circulos/CrearDuo";
import { estilos as S } from "@/components/circulos/estilos";

/**
 * The organiser's preview, before anything exists.
 *
 * Authenticated by the dashboard's own boundary: `/dashboard/*` is a protected
 * prefix, so an unauthenticated visitor is sent through the normal login flow
 * by middleware and never reaches this render. There is deliberately no guest
 * path here — a guest has no circle to create one in, which is also why the API
 * has no guest equivalent of this endpoint.
 *
 * ── The URL names a key; the SERVER decides the version ────────────────────
 *
 * `[templateKey]` exists so a link can be written and shared between screens.
 * It is not authority: which version that key currently means, and whether it
 * may be offered at all, is answered by `resolvePublishedTemplateByKey` against
 * the registry. A DRAFT, an ARCHIVED, an unknown key, or a key with more than
 * one published version all end here as `notFound()` — the same answer, so the
 * address bar cannot be used to tell which of those it was.
 *
 * With `PRODUCTION_CIRCLE_TEMPLATES` empty, every key resolves to nothing and
 * this route is a 404 in production. That is the correct state, not a bug.
 *
 * ── What the person is told before deciding ────────────────────────────────
 *
 * The protocol is spelled out BEFORE the button, not after: two adults, private
 * preparation, simultaneous reveal, and the fact that they can share only part
 * of it, share nothing, or leave. Consent to a two-person activity that is not
 * informed about the exit is not consent, and the exit is the part a person
 * most needs to know exists before they start.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Hacer esto con alguien | FeelVerse",
  robots: { index: false, follow: false, nocache: true },
};

/** Only the opt-out modes this template actually allows are promised. */
function exitCopy(modes: readonly CircleSharingMode[]): string[] {
  const lines: string[] = [];
  if (modes.includes("SELECTED_FIELDS") || modes.includes("EDITED_SUMMARY")) {
    lines.push("Compartir solo una parte de lo que escribiste.");
  }
  if (modes.includes("KEEP_PRIVATE")) {
    lines.push("No compartir nada y quedarte con tu preparación.");
  }
  if (modes.includes("WITHDRAW")) {
    lines.push("Retirarte de la actividad, sin explicar por qué.");
  }
  return lines;
}

export default function NuevoDuoPage({
  params,
}: {
  params: { templateKey: string };
}) {
  const definition = resolvePublishedTemplateByKey(
    decodeURIComponent(params.templateKey),
  );
  if (!definition) notFound();

  // Projects through the public boundary, which refuses anything not
  // PUBLISHED by itself — two guards that must agree are weaker than one that
  // cannot be bypassed.
  const preview = toCircleTemplatePreview(definition);
  const exits = exitCopy(definition.sharing.allowedModes);

  return (
    <main style={S.page}>
      <h1 style={S.h1}>{preview.title}</h1>
      <p style={S.p}>{preview.summary}</p>

      <section style={S.section} aria-labelledby="duo-como">
        <h2 id="duo-como" style={S.h2}>
          Cómo funciona
        </h2>
        <ul style={{ margin: 0, paddingLeft: "1.2rem", lineHeight: 1.7 }}>
          <li>
            Participan {preview.participants.required} personas adultas, tú y
            alguien que elijas.
          </li>
          <li>Toma alrededor de {preview.estimatedMinutes} minutos.</li>
          <li>
            Cada quien se prepara en privado. Lo que escribes no se ve hasta que
            ambos confirmen.
          </li>
          <li>
            La revelación es simultánea: nadie ve lo del otro antes de haber
            confirmado lo suyo.
          </li>
        </ul>
      </section>

      {exits.length > 0 && (
        <section style={S.section} aria-labelledby="duo-salidas">
          <h2 id="duo-salidas" style={S.h2}>
            Siempre puedes
          </h2>
          <ul style={{ margin: 0, paddingLeft: "1.2rem", lineHeight: 1.7 }}>
            {exits.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </section>
      )}

      <CrearDuo
        templateKey={preview.templateKey}
        templateVersion={preview.templateVersion}
      />
    </main>
  );
}
