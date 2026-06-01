import type { HomeEcoMoment } from "@psico/types";

/**
 * EcoMomentCard — mirrors `web-marina` from docs/design/inicio/inicio.css.
 *
 * Surfaces the daily prompt and the last AI activity. The "pendingMessages"
 * badge stays at 0 until AIModule conversational layer lands (Sprint S10).
 * The CTA is a placeholder link to /dashboard/eco that does not exist yet —
 * we render it so the visual hierarchy is honest about where this goes.
 */
export function EcoMomentCard({ moment }: { moment: HomeEcoMoment }) {
  return (
    <article
      className="relative overflow-hidden rounded-[20px] border-[1.5px] p-6"
      style={{
        borderColor: "var(--color-lavender-100)",
        background:
          "linear-gradient(135deg, var(--color-lavender-50) 0%, var(--color-warm-50) 100%)",
      }}
    >
      {/* Decorative radial accent */}
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-[120px] -right-[80px] h-[220px] w-[220px] rounded-full"
        style={{
          background:
            "radial-gradient(circle, var(--color-sage-100), transparent 70%)",
        }}
      />

      <header className="relative flex items-center gap-3">
        <span
          className="inline-flex h-[38px] w-[38px] items-center justify-center rounded-full text-[13px] font-bold text-white"
          style={{
            background:
              "linear-gradient(135deg, var(--color-lavender-300), var(--color-sage-400))",
          }}
        >
          ✦
        </span>
        <div>
          <div
            className="text-[13.5px] font-semibold leading-tight"
            style={{ color: "var(--color-warm-900)" }}
          >
            Eco
          </div>
          <div
            className="mt-0.5 text-[11px] font-semibold"
            style={{ color: "var(--color-lavender-700)" }}
          >
            ✦ Hoy contigo
          </div>
        </div>
      </header>

      <p
        className="relative mt-4 max-w-[60ch] text-[15.5px] leading-relaxed"
        style={{ color: "var(--color-warm-800)" }}
      >
        {moment.prompt}
      </p>

      {moment.pendingMessages > 0 ? (
        <div
          className="relative mt-3 inline-flex items-center gap-2 rounded-full px-3 py-1 text-[12px] font-semibold"
          style={{
            background: "var(--color-lavender-100)",
            color: "var(--color-lavender-700)",
          }}
        >
          <span aria-hidden>•</span>
          {moment.pendingMessages} mensaje
          {moment.pendingMessages === 1 ? "" : "s"} sin leer
        </div>
      ) : null}

      <div className="relative mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-[10px] px-4 py-2.5 text-[13px] font-semibold text-white transition-opacity hover:opacity-90"
          style={{ background: "var(--color-lavender-700)" }}
          disabled
          title="Eco conversacional llega en Sprint S10"
        >
          ✦ Hablar con Eco
        </button>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-[10px] bg-transparent px-4 py-2.5 text-[13px] font-semibold transition-colors hover:opacity-100"
          style={{ color: "var(--color-warm-600)" }}
          disabled
          title="Eco conversacional llega en Sprint S10"
        >
          Ver historial →
        </button>
      </div>
    </article>
  );
}
