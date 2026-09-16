import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getSessionUser, isNextThrow, serverFetch } from "@/lib/api.server";

export const metadata: Metadata = { title: "Pulso · Círculos" };
export const dynamic = "force-dynamic";

/**
 * /dashboard/admin/circulos — Círculos, as counts.
 *
 * ADMIN-only, like the rest of Pulso, and the redirect below is the defensive
 * half: the API's `RolesGuard` is the authorisation. Hiding a menu item is not
 * an access control.
 *
 * ── What this page cannot show ─────────────────────────────────────────────
 *
 * There is no row here, and not because the page declines to render one: the
 * endpoint returns aggregates, so there is nothing else to render. No seat, no
 * activity id, no snippet, nothing resembling the Eco reports inbox — which is
 * a different plane, with different permissions and a different purpose.
 *
 * ── Two kinds of topic, two sections ───────────────────────────────────────
 *
 * "Which activity was used" and "what did somebody say it touched" are
 * different questions. They are rendered apart, labelled apart, and one of
 * them is suppressed below ten contributors while the other needs no
 * suppression because nobody is behind its cells.
 *
 * ── Fixed views ────────────────────────────────────────────────────────────
 *
 * One control, and it is a length of time. A cell suppressed at ten is easy to
 * recover if you can ask for it four ways and subtract, so there is no filter
 * builder here and none in the API.
 */

const FMT = new Intl.NumberFormat("es");
const fmt = (n: number) => FMT.format(n);

interface Cell {
  kind: "value" | "suppressed";
  label: string;
  value?: number;
}
interface Week {
  weekStart: string;
  cells: Cell[];
}
interface Summary {
  generatedAt: string;
  cohort: Record<string, number | string>;
  durations: {
    label: string;
    samples: number;
    medianMinutes: number | null;
    p90Minutes: number | null;
  }[];
  byTemplate: {
    templateKey: string;
    templateVersion: number;
    activitiesCreated: number;
    activitiesRevealed: number;
    activitiesClosed: number;
  }[];
  /** Optional: an older API build does not send it, and the panel says so. */
  byModality?: {
    kind: "DUO" | "GROUP_ADULT";
    size: number;
    activitiesCreated: number;
    activitiesRevealed: number;
    activitiesClosed: number;
  }[];
  declaredTopics: Week[];
  usefulness: Week[];
  help: Week[];
  coverage: {
    feedbackContributions: number;
    helpContributions: number;
    note: string;
  };
}

const COHORT_LABELS: Record<string, string> = {
  invitationsCreated: "Invitaciones creadas",
  invitationsAccepted: "Aceptadas",
  invitationsDeclined: "Declinadas",
  invitationsExpired: "Caducadas (el reloj, no un rechazo)",
  activitiesCreated: "Actividades creadas",
  activitiesRevealed: "Reveladas",
  activitiesClosed: "Cerradas",
  activitiesCancelled: "Canceladas",
  activitiesPending: "Pendientes (aún dentro de su ventana)",
  artifactsProposed: "Acuerdos propuestos",
  artifactsAgreed: "Acuerdos confirmados",
};

function Celdas({ weeks, vacio }: { weeks: Week[]; vacio: string }) {
  if (weeks.length === 0) {
    return (
      <p className="text-[13px]" style={{ color: "var(--color-warm-500)" }}>
        {vacio}
      </p>
    );
  }
  return (
    <div className="space-y-3">
      {weeks.map((w) => (
        <div key={w.weekStart}>
          <p
            className="text-[12px] font-medium"
            style={{ color: "var(--color-warm-700)" }}
          >
            Semana del {new Date(w.weekStart).toLocaleDateString("es-419")}
          </p>
          <ul className="mt-1 space-y-1">
            {w.cells.map((c) => (
              <li
                key={c.label}
                className="flex justify-between gap-4 text-[13px]"
                style={{ color: "var(--color-warm-900)" }}
              >
                <span>{c.label}</span>
                <span
                  style={{
                    color:
                      c.kind === "value"
                        ? "var(--color-warm-900)"
                        : "var(--color-warm-500)",
                  }}
                >
                  {/*
                    Never a zero. A zero is a claim about the world; this is a
                    statement about the sample, and the two read very
                    differently to whoever acts on them.
                  */}
                  {c.kind === "value"
                    ? fmt(c.value ?? 0)
                    : "muestra insuficiente"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

export default async function PulsoCirculosPage() {
  const user = getSessionUser();
  if (!user || user.role !== "ADMIN") redirect("/dashboard");

  let data: Summary | null = null;
  try {
    data = await serverFetch<Summary>("/pulso/circulos");
  } catch (err) {
    if (isNextThrow(err)) throw err;
  }

  if (!data) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-8">
        <h1 className="text-[20px] font-semibold">Pulso · Círculos</h1>
        <p
          className="mt-2 text-[13px]"
          style={{ color: "var(--color-warm-500)" }}
        >
          No pudimos leer los agregados.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-4xl space-y-6 px-4 py-8">
      <header>
        <p
          className="text-[11px] uppercase tracking-wide"
          style={{ color: "var(--color-warm-500)" }}
        >
          Pulso · Admin
        </p>
        <h1 className="text-[20px] font-semibold">Círculos</h1>
        <p
          className="mt-1 text-[13px]"
          style={{ color: "var(--color-warm-500)" }}
        >
          Uso y fricción, en agregado. No mide eficacia, y no describe a nadie.{" "}
          <a className="underline" href="/api/pulso/circulos.csv">
            Descargar CSV
          </a>
        </p>
      </header>

      <section
        className="rounded-2xl border-[1.5px] bg-white p-5"
        style={{ borderColor: "var(--color-warm-200)" }}
      >
        <h2 className="text-[14px] font-semibold">Cohorte</h2>
        <p className="text-[12px]" style={{ color: "var(--color-warm-500)" }}>
          Lo que EMPEZÓ en esta ventana, seguido hasta hoy. Lo pendiente está
          pendiente, no fallido.
        </p>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {Object.entries(COHORT_LABELS).map(([key, label]) => (
            <li key={key} className="flex justify-between gap-4 text-[13px]">
              <span style={{ color: "var(--color-warm-700)" }}>{label}</span>
              <span className="font-medium">
                {fmt(Number(data.cohort[key] ?? 0))}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section
        className="rounded-2xl border-[1.5px] bg-white p-5"
        style={{ borderColor: "var(--color-warm-200)" }}
      >
        <h2 className="text-[14px] font-semibold">Tiempo entre hitos</h2>
        <p className="text-[12px]" style={{ color: "var(--color-warm-500)" }}>
          Tiempo transcurrido — incluye cenar, dormir y cambiar de opinión. No
          es «tiempo pensando».
        </p>
        <ul className="mt-3 space-y-1">
          {data.durations.map((d) => (
            <li
              key={d.label}
              className="flex justify-between gap-4 text-[13px]"
            >
              <span style={{ color: "var(--color-warm-700)" }}>{d.label}</span>
              <span>
                {d.medianMinutes === null
                  ? "sin datos"
                  : `mediana ${fmt(d.medianMinutes)} min`}
                {" · "}
                {d.p90Minutes === null
                  ? "p90: muestra insuficiente"
                  : `p90 ${fmt(d.p90Minutes)} min`}
                {" · "}
                {fmt(d.samples)} muestras
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section
        className="rounded-2xl border-[1.5px] bg-white p-5"
        style={{ borderColor: "var(--color-warm-200)" }}
      >
        <h2 className="text-[14px] font-semibold">Modalidad y tamaño</h2>
        <p className="text-[12px]" style={{ color: "var(--color-warm-500)" }}>
          Cuántas salas existen y de qué tamaño. Son actividades, no personas:
          nadie está detrás de una celda, así que no hay nada que suprimir ni
          nada que restar para llegar a la respuesta de alguien.
        </p>
        <ul className="mt-3 space-y-1">
          {(data.byModality ?? []).length === 0 ? (
            <li
              className="text-[13px]"
              style={{ color: "var(--color-warm-500)" }}
            >
              Sin actividades en esta ventana.
            </li>
          ) : (
            (data.byModality ?? []).map((m) => (
              <li
                key={`${m.kind}:${m.size}`}
                className="flex justify-between gap-4 text-[13px]"
              >
                <span style={{ color: "var(--color-warm-700)" }}>
                  {m.kind === "GROUP_ADULT"
                    ? `Grupo de ${m.size}`
                    : "Dúo (2 personas)"}
                </span>
                <span>
                  {fmt(m.activitiesCreated)} creadas ·{" "}
                  {fmt(m.activitiesRevealed)} reveladas ·{" "}
                  {fmt(m.activitiesClosed)} cerradas
                </span>
              </li>
            ))
          )}
        </ul>
      </section>

      <section
        className="rounded-2xl border-[1.5px] bg-white p-5"
        style={{ borderColor: "var(--color-warm-200)" }}
      >
        <h2 className="text-[14px] font-semibold">
          Tema editorial · por versión
        </h2>
        <p className="text-[12px]" style={{ color: "var(--color-warm-500)" }}>
          Qué actividad se usó. Es una propiedad de la plantilla, no una
          afirmación sobre nadie.
        </p>
        <ul className="mt-3 space-y-1">
          {data.byTemplate.map((t) => (
            <li
              key={`${t.templateKey}@${t.templateVersion}`}
              className="flex justify-between gap-4 text-[13px]"
            >
              <span style={{ color: "var(--color-warm-700)" }}>
                {t.templateKey}@{t.templateVersion}
              </span>
              <span>
                {fmt(t.activitiesCreated)} creadas · {fmt(t.activitiesRevealed)}{" "}
                reveladas · {fmt(t.activitiesClosed)} cerradas
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section
        className="rounded-2xl border-[1.5px] bg-white p-5"
        style={{ borderColor: "var(--color-warm-200)" }}
      >
        <h2 className="text-[14px] font-semibold">Tema autodeclarado</h2>
        <p className="text-[12px]" style={{ color: "var(--color-warm-500)" }}>
          Lo que alguien eligió decir, después y de forma opcional. Dimensión
          distinta de la anterior; no se suman.
        </p>
        <div className="mt-3">
          <Celdas
            weeks={data.declaredTopics}
            vacio="Nadie ha contribuido todavía."
          />
        </div>
      </section>

      <section
        className="rounded-2xl border-[1.5px] bg-white p-5"
        style={{ borderColor: "var(--color-warm-200)" }}
      >
        <h2 className="text-[14px] font-semibold">Utilidad percibida</h2>
        <p className="text-[12px]" style={{ color: "var(--color-warm-500)" }}>
          Lo que dijo quien respondió. No se supone por haber terminado, y la
          respuesta de una persona no dice nada de la otra.
        </p>
        <div className="mt-3">
          <Celdas weeks={data.usefulness} vacio="Sin respuestas todavía." />
        </div>
      </section>

      <section
        className="rounded-2xl border-[1.5px] bg-white p-5"
        style={{ borderColor: "var(--color-warm-200)" }}
      >
        <h2 className="text-[14px] font-semibold">Ayuda de Echo</h2>
        <p className="text-[12px]" style={{ color: "var(--color-warm-500)" }}>
          {data.coverage.note}
        </p>
        <div className="mt-3">
          <Celdas weeks={data.help} vacio="Sin aperturas registradas." />
        </div>
      </section>

      <p className="text-[11px]" style={{ color: "var(--color-warm-500)" }}>
        Umbral de celda: 10 contribuyentes distintos <strong>y</strong> 3
        actividades distintas. Se piden las dos: diez contribuyentes implicaban
        cinco salas cuando toda actividad tenía dos asientos, y con grupos
        pueden ser dos — cada organizadora conoce la suya, y restarla dejaría la
        otra a la vista. Reduce exposición; no garantiza anonimato. Definiciones
        completas en <code>docs/operations/circles-metric-dictionary.md</code>.
      </p>
    </main>
  );
}
