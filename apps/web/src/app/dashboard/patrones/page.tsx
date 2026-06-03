import type { Metadata } from "next";
import Link from "next/link";
import type { PatronesPeriod, PatronesResponse } from "@psico/types";

import { getAccessToken, isNextThrow, serverFetch } from "@/lib/api.server";
import { HourMoodChart } from "@/components/dashboard/patrones/HourMoodChart";
import { MoodHeatmap } from "@/components/dashboard/patrones/MoodHeatmap";
import { WeeklySummaryCard } from "@/components/dashboard/patrones/WeeklySummaryCard";

export const metadata: Metadata = { title: "Patrones" };
export const dynamic = "force-dynamic";

const API_BASE = `${(process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001").replace(/\/$/, "")}/api`;

const ALLOWED: PatronesPeriod[] = ["30d", "90d", "1y"];
function parsePeriod(raw: string | undefined): PatronesPeriod {
  return (ALLOWED as string[]).includes(raw ?? "")
    ? (raw as PatronesPeriod)
    : "30d";
}

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
      <div className="mx-auto max-w-4xl">
        <h1
          className="mb-3 text-[26px] font-bold tracking-tight"
          style={{ color: "var(--color-warm-900)" }}
        >
          Patrones
        </h1>
        <p
          className="rounded-2xl border-[1.5px] bg-white p-6 text-[13px]"
          style={{
            borderColor: "var(--color-warm-200)",
            color: "var(--color-warm-500)",
          }}
        >
          No pudimos cargar tus patrones. Reintenta en unos minutos.
        </p>
      </div>
    );
  }

  // Compute the swatch lookup for the hour chart. We pick one swatch per
  // mood id from the heatmap days (already resolved server-side).
  const swatchByMood: Record<string, string> = {};
  for (const d of data.moodMap) {
    if (!swatchByMood[d.moodId]) swatchByMood[d.moodId] = d.swatch;
  }

  // ── FREE paywall ───────────────────────────────────────────────────
  if (data.locked) {
    return (
      <div className="mx-auto max-w-4xl">
        <Header period={period} />
        <PaywallCard entryCount={data.entryCount} />
      </div>
    );
  }

  // ── Empty state — Pro with too few entries ─────────────────────────
  if (data.entryCount < 7) {
    return (
      <div className="mx-auto max-w-4xl">
        <Header period={period} />
        <section
          className="mt-6 rounded-2xl border-[1.5px] bg-white p-8 text-center"
          style={{ borderColor: "var(--color-warm-200)" }}
        >
          <p className="mb-2 text-[20px]" aria-hidden>
            🌱
          </p>
          <h2
            className="mb-2 text-[18px] font-bold"
            style={{ color: "var(--color-warm-900)" }}
          >
            Aún estamos juntando data
          </h2>
          <p
            className="mx-auto max-w-md text-[13.5px] leading-relaxed"
            style={{ color: "var(--color-warm-600)" }}
          >
            Necesitas al menos 7 entradas de diario en este período para que los
            patrones tengan algo real que mostrarte. Llevas{" "}
            <strong>{data.entryCount}</strong> hasta ahora.
          </p>
          <Link
            href="/dashboard/diario"
            className="mt-5 inline-flex items-center gap-1.5 rounded-2xl px-5 py-2.5 text-[13px] font-semibold text-white"
            style={{ background: "var(--color-lavender-500)" }}
          >
            ✎ Ir al Diario
          </Link>
        </section>
      </div>
    );
  }

  // ── Pro full view ──────────────────────────────────────────────────
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Header period={period} />
      <WeeklySummaryCard
        summary={data.weeklySummary}
        apiBase={API_BASE}
        token={accessToken ?? ""}
      />
      <MoodHeatmap days={data.moodMap} />
      <HourMoodChart hourMood={data.hourMood} swatchByMood={swatchByMood} />
      <p
        className="text-center text-[10.5px]"
        style={{ color: "var(--color-warm-500)" }}
      >
        Las correlaciones que mostramos no son causas. Tu cuerpo y tu vida son
        más complejos que un gráfico.
      </p>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────

function Header({ period }: { period: PatronesPeriod }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1
          className="text-[26px] font-bold tracking-tight"
          style={{ color: "var(--color-warm-900)" }}
        >
          Patrones
        </h1>
        <p
          className="mt-1 text-[13px]"
          style={{ color: "var(--color-warm-500)" }}
        >
          Lo que tu diario va dibujando con el tiempo.
        </p>
      </div>
      <nav className="flex gap-1.5" aria-label="Período">
        {(["30d", "90d", "1y"] as const).map((p) => {
          const active = p === period;
          return (
            <Link
              key={p}
              href={`/dashboard/patrones?period=${p}`}
              className="rounded-full border-[1.5px] px-3 py-1 text-[12px] font-semibold"
              style={
                active
                  ? {
                      background: "var(--color-warm-900)",
                      color: "white",
                      borderColor: "var(--color-warm-900)",
                    }
                  : {
                      background: "white",
                      color: "var(--color-warm-700)",
                      borderColor: "var(--color-warm-200)",
                    }
              }
            >
              {p === "30d" ? "30 días" : p === "90d" ? "90 días" : "1 año"}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}

function PaywallCard({ entryCount }: { entryCount: number }) {
  return (
    <section
      className="mt-6 overflow-hidden rounded-3xl p-7 text-white sm:p-10"
      style={{
        background:
          "radial-gradient(circle at top right, var(--color-lavender-500), var(--color-lavender-800))",
      }}
    >
      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/70">
        Función Pro
      </p>
      <h2 className="mt-2 text-[24px] font-bold leading-tight">
        Tu mapa emocional · sin descifrar nada
      </h2>
      <p className="mt-3 max-w-md text-[14px] leading-relaxed text-white/85">
        Hicimos los patrones para que veas tu propio ritmo: cuándo escribes, qué
        emociones se repiten, qué semanas estuvieron pesadas. Todo desde la
        metadata de tu diario, sin que el servidor toque tu texto.
      </p>
      <ul className="mt-5 space-y-2 text-[13.5px] text-white/90">
        {[
          "Heatmap del mes con tus moods.",
          "Hora del día con más entradas.",
          "Resumen semanal generado por Eco (opt-in).",
          "Compartir snapshot con tu terapeuta (próximamente).",
        ].map((line) => (
          <li key={line} className="flex items-start gap-2">
            <span className="mt-0.5 text-white" aria-hidden>
              ✓
            </span>
            <span>{line}</span>
          </li>
        ))}
      </ul>
      <p className="mt-5 text-[11.5px] text-white/70">
        Llevas <strong>{entryCount}</strong> entradas este período. Suficiente
        para empezar.
      </p>
      <Link
        href="/dashboard/plan"
        className="mt-6 inline-flex items-center gap-1.5 rounded-2xl px-6 py-3 text-[13px] font-semibold"
        style={{ background: "white", color: "var(--color-lavender-700)" }}
      >
        Hazte Pro →
      </Link>
    </section>
  );
}
