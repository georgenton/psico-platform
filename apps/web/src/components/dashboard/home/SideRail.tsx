import Link from "next/link";
import type { HomeShortcut, HomeStats, HomeUser } from "@psico/types";

/**
 * SideRail — fixed-width sidebar containing UpgradeCard (free only) +
 * StreakCard + ShortcutsCard. Mirrors `web-col-side` from
 * docs/design/inicio/inicio.css.
 */
export function SideRail({
  user,
  stats,
  shortcuts,
}: {
  user: HomeUser;
  stats: HomeStats;
  shortcuts: HomeShortcut[];
}) {
  return (
    <aside className="flex flex-col gap-4">
      {user.tier === "free" ? <UpgradeCard /> : null}
      <StreakCard streakDays={stats.streakDays} />
      <ShortcutsCard shortcuts={shortcuts} />
    </aside>
  );
}

function UpgradeCard() {
  return (
    <div
      className="relative overflow-hidden rounded-[18px] p-5 text-white"
      style={{
        background:
          "linear-gradient(135deg, var(--color-lavender-500), var(--color-lavender-800))",
      }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -right-[30px] -top-[50px] h-[180px] w-[180px] rounded-full opacity-[0.45]"
        style={{
          background:
            "radial-gradient(circle, var(--color-sage-300), transparent 70%)",
        }}
      />
      <span
        className="relative text-[10px] font-bold uppercase tracking-[0.14em]"
        style={{ color: "rgba(255,255,255,0.7)" }}
      >
        Plan Pro · $7/mes
      </span>
      <h3 className="relative mt-2 text-[15px] font-bold leading-tight tracking-tight text-white">
        Desbloquea toda la biblioteca
      </h3>
      <p
        className="relative mt-2 text-[12.5px] leading-relaxed"
        style={{ color: "rgba(255,255,255,0.78)" }}
      >
        Acceso a todos los libros, audios, Eco dentro del capítulo y modo
        offline.
      </p>
      <Link
        href="/dashboard/plan"
        className="relative mt-3 inline-flex items-center gap-1.5 self-start rounded-[10px] px-3.5 py-2.5 text-[12.5px] font-semibold text-white"
        style={{ background: "var(--color-sage-400)" }}
      >
        Actualizar a Pro
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
      </Link>
    </div>
  );
}

function StreakCard({ streakDays }: { streakDays: number }) {
  // 14-day target; the ring fills proportionally.
  const target = 14;
  const p = Math.min(streakDays / target, 1);
  const angle = Math.round(p * 360);

  return (
    <div
      className="rounded-[18px] border-[1.5px] bg-white p-5"
      style={{ borderColor: "var(--color-warm-200)" }}
    >
      <span
        className="text-[10px] font-bold uppercase tracking-[0.14em]"
        style={{ color: "var(--color-warm-500)" }}
      >
        Tu racha
      </span>
      <div className="mt-3 flex items-center gap-3.5">
        <div
          className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full"
          style={{
            background: `conic-gradient(var(--color-sage-400) ${angle}deg, var(--color-warm-200) 0)`,
          }}
        >
          <div
            className="flex h-[52px] w-[52px] items-center justify-center rounded-full bg-white text-[18px] font-bold"
            style={{ color: "var(--color-warm-900)" }}
          >
            {streakDays}
          </div>
        </div>
        <div className="min-w-0">
          <div
            className="text-[13px] font-semibold leading-tight"
            style={{ color: "var(--color-warm-800)" }}
          >
            {streakDays} días seguidos
          </div>
          <div
            className="mt-1 text-[11.5px] leading-snug"
            style={{ color: "var(--color-warm-500)" }}
          >
            {streakDays === 0
              ? "Empieza hoy — un capítulo basta."
              : "Sigue así, día a día."}
          </div>
        </div>
      </div>
    </div>
  );
}

function ShortcutsCard({ shortcuts }: { shortcuts: HomeShortcut[] }) {
  const ICONS: Record<HomeShortcut["id"], string> = {
    diario: "✎",
    eco: "✦",
    biblioteca: "📚",
    terapia: "🎧",
  };
  const SUBS: Record<HomeShortcut["id"], string> = {
    diario: "Anota cómo te sientes",
    eco: "Pregúntale lo que sea",
    biblioteca: "Tus libros",
    terapia: "Sesiones de terapia",
  };
  const HREFS: Record<HomeShortcut["id"], string> = {
    diario: "/dashboard/diario",
    eco: "/dashboard", // placeholder — Eco UI lands in S10-front
    biblioteca: "/dashboard/biblioteca",
    terapia: "/dashboard/plan", // placeholder — Terapia is v2
  };

  return (
    <div
      className="overflow-hidden rounded-[18px] border-[1.5px] bg-white"
      style={{ borderColor: "var(--color-warm-200)" }}
    >
      {shortcuts.map((s, idx) => (
        <Link
          key={s.id}
          href={HREFS[s.id]}
          className="grid grid-cols-[30px_1fr_14px] items-center gap-3 px-4 py-3 text-inherit no-underline transition-colors hover:bg-[var(--color-warm-50)]"
          style={{
            borderBottom:
              idx < shortcuts.length - 1
                ? "1px solid var(--color-warm-100)"
                : undefined,
          }}
        >
          <span
            className="inline-flex h-[30px] w-[30px] items-center justify-center rounded-lg text-[16px] leading-none"
            style={{ background: "var(--color-warm-100)" }}
            aria-hidden
          >
            {ICONS[s.id]}
          </span>
          <div className="min-w-0">
            <div
              className="truncate text-[13px] font-semibold leading-tight"
              style={{ color: "var(--color-warm-900)" }}
            >
              {s.label}
            </div>
            <div
              className="mt-0.5 truncate text-[11.5px]"
              style={{ color: "var(--color-warm-500)" }}
            >
              {SUBS[s.id]}
              {s.badge ? ` · ${s.badge}` : ""}
            </div>
          </div>
          <span aria-hidden style={{ color: "var(--color-warm-400)" }}>
            →
          </span>
        </Link>
      ))}
    </div>
  );
}
