import type { CircleAnalyticsSummary } from "../circles/circles-analytics.service";
import { CIRCLE_SMALL_CELL_THRESHOLD } from "../circles/circles-analytics.service";

/**
 * The Círculos panel's two small pure pieces: its window, and its export.
 *
 * ── Fixed views, not a query builder ───────────────────────────────────────
 *
 * There is one parameter, and it is a length of time. No filtering by topic
 * AND version AND day AND role: a cell suppressed at ten contributors is
 * trivially recoverable by anybody who can ask for the same cell four ways and
 * subtract. Separate fixed views cost a little expressiveness and remove that
 * whole class of reconstruction.
 */

/** 7 to 180 days, defaulting to 30. Anything else is the default. */
export function parseWindowDays(raw: string | undefined): number {
  const n = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(n)) return 30;
  return Math.min(180, Math.max(7, n));
}

function escape(value: string | number): string {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * The export, carrying everything needed to read it.
 *
 * A CSV of bare numbers is a CSV somebody will paste into a slide with a
 * confident title. So the dictionary, the window, the threshold and the
 * coverage note ride along in the file, and suppressed cells say
 * `muestra insuficiente` rather than `0` — a zero is a claim about the world,
 * and this is a statement about the sample.
 *
 * It is the same shape the screen renders, from the same call. An export that
 * re-derived its own numbers is an export that can disagree with the screen,
 * and the disagreement would be found by whoever trusts it least.
 */
export function circlesCsv(summary: CircleAnalyticsSummary): string {
  const lines: string[] = [];
  const row = (...cells: (string | number)[]) =>
    lines.push(cells.map(escape).join(","));

  row("# FeelVerse · Círculos — agregados");
  row("# generado", summary.generatedAt);
  row("# ventana", summary.cohort.windowStart, summary.cohort.windowEnd);
  row("# umbral de celda", `${CIRCLE_SMALL_CELL_THRESHOLD} contribuyentes`);
  row("# cobertura", summary.coverage.note);
  row(
    "# nota",
    "Las celdas por debajo del umbral aparecen como «muestra insuficiente», " +
      "no como cero. El umbral reduce exposición; no garantiza anonimato.",
  );
  row("");

  row("seccion", "metrica", "dimension", "valor");

  const c = summary.cohort;
  for (const [metric, value] of Object.entries({
    invitaciones_creadas: c.invitationsCreated,
    invitaciones_aceptadas: c.invitationsAccepted,
    invitaciones_declinadas: c.invitationsDeclined,
    invitaciones_caducadas: c.invitationsExpired,
    actividades_creadas: c.activitiesCreated,
    actividades_reveladas: c.activitiesRevealed,
    actividades_cerradas: c.activitiesClosed,
    actividades_canceladas: c.activitiesCancelled,
    actividades_pendientes: c.activitiesPending,
    acuerdos_propuestos: c.artifactsProposed,
    acuerdos_confirmados: c.artifactsAgreed,
  })) {
    row("cohorte", metric, "", value);
  }

  for (const d of summary.durations) {
    row("tiempos", d.label, "muestras", d.samples);
    row("tiempos", d.label, "mediana_min", d.medianMinutes ?? "sin datos");
    row("tiempos", d.label, "p90_min", d.p90Minutes ?? "muestra insuficiente");
  }

  for (const t of summary.byTemplate) {
    const pin = `${t.templateKey}@${t.templateVersion}`;
    row("por_version", pin, "creadas", t.activitiesCreated);
    row("por_version", pin, "reveladas", t.activitiesRevealed);
    row("por_version", pin, "cerradas", t.activitiesClosed);
  }

  const weeks = (
    section: string,
    blocks: CircleAnalyticsSummary["declaredTopics"],
  ) => {
    for (const week of blocks) {
      for (const cell of week.cells) {
        row(
          section,
          week.weekStart,
          cell.label,
          cell.kind === "value" ? cell.value : "muestra insuficiente",
        );
      }
    }
  };

  // Two different questions, two sections, and never one column. "Which
  // activity was used" is a property of the template; "what did this person
  // say it touched" is what they volunteered.
  weeks("tema_editorial", editorialTopicWeeks(summary));
  weeks("tema_declarado", summary.declaredTopics);
  weeks("utilidad", summary.usefulness);
  weeks("ayuda_echo", summary.help);

  return lines.join("\n");
}

/**
 * Editorial topics, derived from what ran rather than from what anybody said.
 *
 * They are a property of the templates that were used, so they need no
 * suppression: no person is behind a cell. They are reported separately from
 * the declared ones for exactly that reason — mixing them would produce a
 * number nobody could interpret.
 */
function editorialTopicWeeks(
  summary: CircleAnalyticsSummary,
): CircleAnalyticsSummary["declaredTopics"] {
  return [
    {
      weekStart: summary.cohort.windowStart,
      cells: summary.byTemplate.map((t) => ({
        kind: "value" as const,
        label: `${t.templateKey}@${t.templateVersion}`,
        value: t.activitiesCreated,
      })),
    },
  ];
}
