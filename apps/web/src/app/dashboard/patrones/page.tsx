import type { Metadata } from "next";
import Link from "next/link";
import type { PatronesPeriod, PatronesResponse } from "@psico/types";

import { getAccessToken, isNextThrow, serverFetch } from "@/lib/api.server";
import { HourMoodChart } from "@/components/dashboard/patrones/HourMoodChart";
import { MoodHeatmap } from "@/components/dashboard/patrones/MoodHeatmap";
import { PatTopTagsGrid } from "@/components/dashboard/patrones/PatTopTagsGrid";
import { PatRegenerateCta } from "@/components/dashboard/patrones/PatRegenerateCta";
import { PaywallCard } from "@/components/dashboard/patrones/PaywallCard";

export const metadata: Metadata = { title: "Patrones IA" };
export const dynamic = "force-dynamic";

const API_BASE = `${(process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001").replace(/\/$/, "")}/api`;

const ALLOWED: PatronesPeriod[] = ["30d", "90d", "1y"];
function parsePeriod(raw: string | undefined): PatronesPeriod {
  return (ALLOWED as string[]).includes(raw ?? "")
    ? (raw as PatronesPeriod)
    : "30d";
}

// Sprint F1 — toolbar chips. Today only "Todos" is wired; the rest are
// visual placeholders for future Patrones features (Predominantes,
// Conexiones, Disparadores, Fortalezas, Creencias). Disabled rather than
// hidden so the user sees the roadmap.
interface ToolbarChip {
  id: string;
  label: string;
  active?: boolean;
}
const TOOLBAR_CHIPS: ToolbarChip[] = [
  { id: "todos", label: "Todos", active: true },
  { id: "predominantes", label: "Predominantes" },
  { id: "conexiones", label: "Conexiones" },
  { id: "disparadores", label: "Disparadores" },
  { id: "fortalezas", label: "Fortalezas" },
  { id: "creencias", label: "Creencias" },
];

export default async function PatronesPage({
  searchParams,
}: {
  searchParams: { period?: string };
}) {
  const period = parsePeriod(searchParams.period);
  const accessToken = getAccessToken();

  let data: PatronesResponse | null = null;
  try {
    data = await serverFetch<PatronesResponse>(`/patrones?period=${period}`);
  } catch (err) {
    if (isNextThrow(err)) throw err;
  }

  if (!data) {
    return (
      <>
        <ScreenHead period={period} />
        <div className="card">
          <p
            style={{ margin: 0, color: "var(--color-warm-500)", fontSize: 14 }}
          >
            No pudimos cargar tus patrones. Reintenta en unos minutos.
          </p>
        </div>
      </>
    );
  }

  const swatchByMood: Record<string, string> = {};
  for (const d of data.moodMap) {
    if (!swatchByMood[d.moodId]) swatchByMood[d.moodId] = d.swatch;
  }

  // ── FREE paywall ───────────────────────────────────────────────────
  if (data.locked) {
    return (
      <>
        <ScreenHead period={period} />
        <PaywallCard
          entryCount={data.entryCount}
          // `?? false` por la misma razón que en Mi plan: un cliente nuevo
          // contra una API anterior no debe acabar ofreciendo una compra.
          purchasesOpen={data.purchases?.open ?? false}
        />
      </>
    );
  }

  // ── Empty state — Pro with too few entries ─────────────────────────
  if (data.entryCount < 7) {
    return (
      <>
        <ScreenHead period={period} />
        <Toolbar />
        <div
          className="card"
          style={{ textAlign: "center", padding: "32px 24px" }}
        >
          <p style={{ margin: "0 0 8px", fontSize: 22 }} aria-hidden>
            🌱
          </p>
          <h2
            style={{
              font: "700 18px/1.1 var(--font-sans)",
              color: "var(--color-warm-900)",
              margin: "0 0 8px",
            }}
          >
            Aún estamos juntando data
          </h2>
          <p
            style={{
              maxWidth: 460,
              margin: "0 auto",
              color: "var(--color-warm-600)",
              fontSize: 13.5,
              lineHeight: 1.5,
            }}
          >
            Necesitas al menos 7 entradas en este período para que los patrones
            tengan algo real que mostrarte. Llevas{" "}
            <strong>{data.entryCount}</strong> hasta ahora.
          </p>
          <Link
            href="/dashboard/reflexiones"
            className="btn primary"
            style={{ marginTop: 20, textDecoration: "none" }}
          >
            Ir a Reflexiones →
          </Link>
        </div>
      </>
    );
  }

  // ── Pro full view ──────────────────────────────────────────────────
  return (
    <>
      <ScreenHead period={period} />
      <Toolbar />

      <div className="pat-grid">
        <div className="card pat-wide">
          <div className="pw-body">
            <span className="pw-tag">Insight de la semana</span>
            <h3 style={{ margin: "8px 0 8px" }}>
              {data.weeklySummary?.headline ??
                "Aún no tenemos un insight para esta semana"}
            </h3>
            <p style={{ margin: 0 }}>
              {data.weeklySummary?.narrative ??
                "Cuando tengas un puñado de reflexiones más, Eco va a tejer las conexiones que aparecen entre tus moods, tus temas y tus rachas."}
            </p>
          </div>
          <PatRegenerateCta
            hasSummary={data.weeklySummary !== null}
            apiBase={API_BASE}
            token={accessToken ?? ""}
          />
        </div>

        <PatTopTagsGrid
          themes={data.themes}
          entryCount={data.entryCount}
          period={period}
        />
      </div>

      <div className="sec-label" style={{ marginTop: 36 }}>
        Tu mes en detalle
      </div>
      <div style={{ display: "grid", gap: 16 }}>
        <MoodHeatmap days={data.moodMap} />
        <HourMoodChart hourMood={data.hourMood} swatchByMood={swatchByMood} />
      </div>

      <p
        style={{
          textAlign: "center",
          fontSize: 11,
          color: "var(--color-warm-500)",
          marginTop: 24,
        }}
      >
        Las correlaciones que mostramos no son causas. Tu cuerpo y tu vida son
        más complejos que un gráfico.
      </p>
    </>
  );
}

// ───────────────────────────────────────────────────────────────────────

function ScreenHead({ period }: { period: PatronesPeriod }) {
  return (
    <>
      <div
        className="screen-head"
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: 24,
          flexWrap: "wrap",
          marginBottom: 14,
        }}
      >
        <h1 className="screen-title">
          <span className="eb">Lo más valioso que descubrirás</span>
          Patrones IA
        </h1>
        <nav style={{ display: "flex", gap: 6 }} aria-label="Período">
          {(["30d", "90d", "1y"] as const).map((p) => {
            const active = p === period;
            return (
              <Link
                key={p}
                href={`/dashboard/patrones?period=${p}`}
                className="chip"
                style={
                  active
                    ? {
                        background: "var(--color-warm-900)",
                        color: "var(--color-warm-50)",
                        borderColor: "var(--color-warm-900)",
                      }
                    : undefined
                }
              >
                {p === "30d" ? "30 días" : p === "90d" ? "90 días" : "1 año"}
              </Link>
            );
          })}
        </nav>
      </div>
      <p className="screen-sub" style={{ margin: "0 0 26px" }}>
        Tendencias, conexiones y fortalezas que Eco detecta en tu actividad.
        Tócalas para explorar de dónde vienen y hacia dónde te llevan.
      </p>
    </>
  );
}

function Toolbar() {
  return (
    <div className="pat-toolbar">
      {TOOLBAR_CHIPS.map((chip) => (
        <button
          key={chip.id}
          type="button"
          className={`chip${chip.active ? " on" : ""}`}
          disabled={!chip.active}
          title={
            chip.active
              ? undefined
              : "Próximamente — cuando tengas más data, Eco categoriza los patrones"
          }
        >
          {chip.label}
        </button>
      ))}
    </div>
  );
}

