import type { Metadata } from "next";
import Link from "next/link";
import type { AuthorRevenueResponse } from "@psico/types";
import { isNextThrow, serverFetch } from "@/lib/api.server";
import { PayoutSettingsForm } from "./PayoutSettingsForm";
import { MonthlyEarningsTable } from "./MonthlyEarningsTable";

export const metadata: Metadata = { title: "Editor de autor · Cobros" };
export const dynamic = "force-dynamic";

function formatUsd(cents: number): string {
  return (cents / 100).toLocaleString("es-EC", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  });
}

export default async function CobrosPage() {
  let data: AuthorRevenueResponse | null = null;
  let error: string | null = null;
  try {
    data = await serverFetch<AuthorRevenueResponse>("/autor/cobros", {
      cache: "no-store",
    });
  } catch (e) {
    if (isNextThrow(e)) throw e;
    error = e instanceof Error ? e.message : "No pudimos cargar tus cobros.";
  }

  if (!data) {
    return (
      <div className="space-y-4">
        <h1
          className="text-[24px] font-bold tracking-tight"
          style={{ color: "var(--color-warm-900)" }}
        >
          Cobros
        </h1>
        <p
          className="rounded-2xl border-[1.5px] bg-white p-5 text-[13px]"
          style={{
            borderColor: "var(--color-warm-200)",
            color: "var(--color-warm-500)",
          }}
        >
          {error ?? "No pudimos cargar los cobros."}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header>
        <Link
          href="/autor/dashboard"
          className="text-[12px] font-medium"
          style={{ color: "var(--color-warm-500)" }}
        >
          ← Mis libros
        </Link>
        <h1
          className="mt-2 text-[26px] font-bold tracking-tight"
          style={{ color: "var(--color-warm-900)" }}
        >
          Cobros
        </h1>
        <p
          className="mt-1 text-[13px]"
          style={{ color: "var(--color-warm-500)" }}
        >
          Tus ingresos como autor, consolidados por mes. Los pagos se
          procesan según el método configurado abajo.
        </p>
      </header>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <SummaryCard
          label={`YTD ${data.summary.fiscalYear}`}
          value={formatUsd(data.summary.ytdNetCents)}
          tone="lavender"
        />
        <SummaryCard
          label="Último mes"
          value={formatUsd(data.summary.lastMonthNetCents)}
          tone="sage"
        />
        <SummaryCard
          label="Pendiente de pago"
          value={formatUsd(data.summary.pendingNetCents)}
          tone="warm"
        />
      </section>

      <MonthlyEarningsTable rows={data.monthly} />

      <PayoutSettingsForm settings={data.settings} />
    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "lavender" | "sage" | "warm";
}) {
  const bg =
    tone === "lavender"
      ? "var(--color-lavender-100)"
      : tone === "sage"
        ? "var(--color-sage-100)"
        : "var(--color-warm-100)";
  const fg =
    tone === "lavender"
      ? "var(--color-lavender-700)"
      : tone === "sage"
        ? "var(--color-sage-700)"
        : "var(--color-warm-700)";
  return (
    <article
      className="rounded-2xl p-5"
      style={{ background: bg, color: fg }}
    >
      <p className="text-[10.5px] font-bold uppercase tracking-[0.14em]">
        {label}
      </p>
      <p className="mt-2 text-[26px] font-bold tracking-tight">{value}</p>
    </article>
  );
}
