import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { PulsoOverviewResponse } from "@psico/types";

import { getSessionUser, isNextThrow, serverFetch } from "@/lib/api.server";
import { KpiCard } from "@/components/dashboard/admin/KpiCard";

export const metadata: Metadata = { title: "Pulso · Overview" };
export const dynamic = "force-dynamic";

/**
 * /dashboard/admin/overview — Sprint S48.
 *
 * Pulso v2 platform overview. ADMIN-only Server Component that fetches
 * `/api/pulso/overview` (cached server-side 5min) and renders KPIs in 4
 * groups: Users / Engagement / Content / Business.
 *
 * Privacy note: the response shape exposes only aggregate counts (see
 * `PulsoOverviewResponse` in @psico/types). No per-user identifiers reach
 * the browser.
 */
const FMT = new Intl.NumberFormat("es");

function fmt(n: number): string {
  return FMT.format(n);
}

export default async function PulsoOverviewPage() {
  // ADMIN-only. Frontend gate is defensive — the API enforces too.
  const user = getSessionUser();
  if (!user || user.role !== "ADMIN") {
    redirect("/dashboard");
  }

  let data: PulsoOverviewResponse | null = null;
  try {
    data = await serverFetch<PulsoOverviewResponse>("/pulso/overview");
  } catch (err) {
    if (isNextThrow(err)) throw err;
  }

  if (!data) {
    return (
      <div className="mx-auto max-w-[1100px]">
        <header className="mb-6">
          <p
            className="text-[11px] uppercase tracking-widest"
            style={{ color: "var(--color-lavender-600)" }}
          >
            Pulso · Admin
          </p>
          <h1
            className="text-[28px] font-bold tracking-tight"
            style={{ color: "var(--color-warm-900)" }}
          >
            Overview
          </h1>
        </header>
        <p
          className="rounded-2xl border-[1.5px] bg-white p-6 text-[13px]"
          style={{
            borderColor: "var(--color-warm-200)",
            color: "var(--color-warm-500)",
          }}
        >
          No pudimos cargar los KPIs. Reintenta en unos minutos.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1100px] space-y-8">
      <header>
        <p
          className="text-[11px] uppercase tracking-widest"
          style={{ color: "var(--color-lavender-600)" }}
        >
          Pulso · Admin
        </p>
        <h1
          className="text-[28px] font-bold tracking-tight"
          style={{ color: "var(--color-warm-900)" }}
        >
          Overview
        </h1>
        <p
          className="mt-1 text-[13px]"
          style={{ color: "var(--color-warm-500)" }}
        >
          KPIs agregados de la plataforma. Ventanas rolling (24h / 7d / 30d).
          Datos cacheados 5 minutos servidor-side · generado{" "}
          {new Date(data.generatedAt).toLocaleTimeString("es")}.
        </p>
      </header>

      {/* ── Usuarios ──────────────────────────────────────────────────── */}
      <section>
        <h2
          className="mb-3 text-[14px] font-semibold uppercase tracking-wide"
          style={{ color: "var(--color-warm-700)" }}
        >
          Usuarios
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            label="Total registrados"
            value={fmt(data.users.total)}
            helper="Acumulado desde el lanzamiento"
          />
          <KpiCard
            label="Nuevos · 24h"
            value={fmt(data.users.newToday)}
            helper="Últimas 24 horas UTC"
            accent={data.users.newToday > 0 ? "success" : "default"}
          />
          <KpiCard
            label="Nuevos · 7d"
            value={fmt(data.users.newThisWeek)}
            helper="Últimos 7 días UTC"
          />
          <KpiCard
            label="Nuevos · 30d"
            value={fmt(data.users.newThisMonth)}
            helper="Últimos 30 días UTC"
          />
        </div>
      </section>

      {/* ── Engagement ───────────────────────────────────────────────── */}
      <section>
        <h2
          className="mb-3 text-[14px] font-semibold uppercase tracking-wide"
          style={{ color: "var(--color-warm-700)" }}
        >
          Engagement
        </h2>
        <p
          className="mb-3 text-[12px]"
          style={{ color: "var(--color-warm-400)" }}
        >
          Usuarios distintos con cualquier actividad (Diario · Eco · Voz ·
          Lector) en la ventana.
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <KpiCard
            label="DAU"
            value={fmt(data.engagement.dau)}
            helper="Activos en las últimas 24h"
          />
          <KpiCard
            label="WAU"
            value={fmt(data.engagement.wau)}
            helper="Activos en los últimos 7 días"
          />
          <KpiCard
            label="MAU"
            value={fmt(data.engagement.mau)}
            helper="Activos en los últimos 30 días"
          />
        </div>
      </section>

      {/* ── Contenido (7d) ───────────────────────────────────────────── */}
      <section>
        <h2
          className="mb-3 text-[14px] font-semibold uppercase tracking-wide"
          style={{ color: "var(--color-warm-700)" }}
        >
          Contenido (últimos 7 días)
        </h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <KpiCard
            label="Entradas de diario"
            value={fmt(data.content.diaryEntriesThisWeek)}
          />
          <KpiCard
            label="Mensajes Eco"
            value={fmt(data.content.ecoMessagesThisWeek)}
            helper="Solo USER · sin assistant"
          />
          <KpiCard
            label="Crisis Eco"
            value={fmt(data.content.ecoCrisisThisWeek)}
            accent={data.content.ecoCrisisThisWeek > 0 ? "danger" : "default"}
            helper="Regex pre-LLM o sentinel del modelo"
          />
          <KpiCard
            label="Voz transcrita"
            value={`${fmt(data.content.voiceMinutesThisWeek)} min`}
            helper="Sumado desde VoiceTranscription"
          />
          <KpiCard
            label="Sesiones de lectura"
            value={fmt(data.content.readingSessionsThisWeek)}
            helper="ReadingSession con heartbeat reciente"
          />
        </div>
      </section>

      {/* ── Negocio ──────────────────────────────────────────────────── */}
      <section>
        <h2
          className="mb-3 text-[14px] font-semibold uppercase tracking-wide"
          style={{ color: "var(--color-warm-700)" }}
        >
          Negocio
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <KpiCard
            label="Usuarios Pro+"
            value={fmt(data.business.paidUsers)}
            helper="PRO · ANNUAL · B2B"
            accent="success"
          />
          <KpiCard
            label="Reports Eco en backlog"
            value={fmt(data.business.reportsBacklog)}
            helper="Total acumulado · v1 sin marcar resueltos"
            accent={
              data.business.reportsBacklog > 10
                ? "warning"
                : data.business.reportsBacklog > 0
                  ? "default"
                  : "success"
            }
          />
        </div>
      </section>

      <p className="text-[11px]" style={{ color: "var(--color-warm-400)" }}>
        Privacidad: este reporte agrega counts. Ningún identificador de usuario,
        email, IP o contenido aparece en el wire.
      </p>
    </div>
  );
}
