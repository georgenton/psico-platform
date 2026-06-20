import Link from "next/link";
import type { InsightToday } from "@psico/types";

/**
 * InsightTodayCard — Sprint B3.
 *
 * Renders the daily insight that lives at the top of the redesigned home.
 * The shape is shipped by `HomeResponse.insightToday` (B1, rule-based v1;
 * v2 will be LLM-backed). When `null` we render nothing — the caller is
 * responsible for the fallback (typically nothing, the rest of the Home
 * already speaks).
 *
 * Visual: lavender accent ribbon + eyebrow tag + headline + body + optional
 * CTA pill. Mirrors the "Insight del día" treatment from
 * `docs/design/redesign-v2/dashboard/index.html` §inicio.
 */

const KIND_LABELS: Record<InsightToday["kind"], string> = {
  streak: "Tu racha",
  "mood-trend": "Patrón de ánimo",
  "book-progress": "Lectura en curso",
  neutral: "Insight del día",
};

export function InsightTodayCard({
  insight,
}: {
  insight: InsightToday | null;
}) {
  if (!insight) return null;

  return (
    <article
      className="relative overflow-hidden rounded-3xl border p-6 sm:p-7"
      style={{
        background:
          "linear-gradient(135deg, var(--color-lavender-50) 0%, white 60%)",
        borderColor: "var(--color-lavender-200)",
        boxShadow: "var(--shadow-soft)",
      }}
    >
      {/* Accent ribbon */}
      <div
        aria-hidden
        className="absolute left-0 top-0 h-full w-1.5"
        style={{ background: "var(--color-lavender-500)" }}
      />

      <p
        className="inline-flex items-center gap-2 text-[10.5px] font-bold uppercase tracking-[0.16em]"
        style={{ color: "var(--color-lavender-700)" }}
      >
        <span
          aria-hidden
          className="inline-block h-1.5 w-1.5 rounded-full"
          style={{ background: "var(--color-lavender-500)" }}
        />
        {KIND_LABELS[insight.kind]}
      </p>

      <h2
        className="mt-2 text-[22px] font-bold leading-tight sm:text-[24px]"
        style={{ color: "var(--color-warm-900)" }}
      >
        {insight.headline}
      </h2>

      <p
        className="mt-2 max-w-[640px] text-[15px] leading-relaxed"
        style={{ color: "var(--color-warm-600)" }}
      >
        {insight.body}
      </p>

      {insight.ctaHref ? (
        <Link
          href={insight.ctaHref}
          className="mt-4 inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition-colors"
          style={{
            background: "var(--color-lavender-500)",
            borderColor: "var(--color-lavender-500)",
            color: "white",
          }}
        >
          {insight.ctaLabel ?? "Continuar"}
          <span aria-hidden>→</span>
        </Link>
      ) : null}
    </article>
  );
}
