import Link from "next/link";
import type { HomeReco } from "@psico/types";
import { coverGradient } from "../cover-gradients";

/**
 * RecosRow — "Para ti" personalized recommendations.
 *
 * Mirrors `web-recos` in docs/design/inicio/inicio.css. The grid is 3 columns
 * on desktop, 1 on narrow viewports. Each card carries the reason text on a
 * neutral pill (so the user sees WHY this is recommended, not just what).
 */
export function RecosRow({ recos }: { recos: HomeReco[] }) {
  if (recos.length === 0) return null;

  return (
    <section>
      <div className="mb-3 flex items-baseline justify-between">
        <h2
          className="text-[11px] font-bold uppercase tracking-[0.14em]"
          style={{ color: "var(--color-warm-500)" }}
        >
          Para ti — basado en tu última semana
        </h2>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {recos.map((r) => (
          <RecoCard key={r.id} reco={r} />
        ))}
      </div>
    </section>
  );
}

function RecoCard({ reco }: { reco: HomeReco }) {
  const kindLabel =
    reco.kind === "book"
      ? "Libro"
      : reco.kind === "audio"
        ? "Audio"
        : reco.kind === "exercise"
          ? "Ejercicio"
          : "Carta";

  const href =
    reco.kind === "book"
      ? `/dashboard/biblioteca/${reco.id}`
      : reco.lockedByTier
        ? "/dashboard/plan"
        : `/dashboard/biblioteca/${reco.id}`;

  return (
    <Link
      href={href}
      className="flex flex-col gap-2.5 rounded-2xl border-[1.5px] bg-white p-3.5 transition-all hover:-translate-y-0.5"
      style={{ borderColor: "var(--color-warm-200)" }}
    >
      <div className="flex gap-2.5">
        <div
          className="h-16 w-12 shrink-0 rounded-[7px] shadow-sm"
          style={{ background: coverGradient(reco.cover) }}
          aria-hidden
        />
        <div className="min-w-0">
          <span
            className="text-[9.5px] font-bold uppercase tracking-[0.12em]"
            style={{ color: "var(--color-lavender-700)" }}
          >
            {kindLabel}
          </span>
          <div
            className="mt-1 text-[13px] font-bold leading-tight tracking-tight"
            style={{ color: "var(--color-warm-900)" }}
          >
            {reco.title}
          </div>
          <div
            className="mt-0.5 text-[11px]"
            style={{ color: "var(--color-warm-500)" }}
          >
            {reco.byline}
          </div>
        </div>
        {reco.lockedByTier ? (
          <span
            aria-label="Requiere Pro"
            className="self-start text-[10px]"
            title="Requiere Pro"
          >
            🔒
          </span>
        ) : null}
      </div>
      <div
        className="rounded-[9px] px-2.5 py-2 text-[11.5px] leading-snug"
        style={{
          color: "var(--color-warm-700)",
          background: "var(--color-warm-100)",
        }}
      >
        {reco.reason}
      </div>
      <span
        className="inline-flex items-center gap-1 text-[12px] font-semibold"
        style={{ color: "var(--color-lavender-700)" }}
      >
        Empezar →
      </span>
    </Link>
  );
}
