import type { AchievementProgress } from "@psico/types";

export function AchievementsGrid({
  achievements,
}: {
  achievements: AchievementProgress[];
}) {
  if (achievements.length === 0) {
    return (
      <section data-testid="achievements-empty">
        <h2
          className="mb-2 text-[14px] font-semibold"
          style={{ color: "var(--color-warm-900)" }}
        >
          Logros
        </h2>
        <p
          className="rounded-2xl border-[1.5px] bg-white p-5 text-[13px]"
          style={{
            borderColor: "var(--color-warm-200)",
            color: "var(--color-warm-500)",
          }}
        >
          Empezá a usar Psico — leer un capítulo, escribir en el diario, charlar
          con Eco — y mostraremos acá tus logros.
        </p>
      </section>
    );
  }

  return (
    <section data-testid="achievements-grid">
      <h2
        className="mb-2 text-[14px] font-semibold"
        style={{ color: "var(--color-warm-900)" }}
      >
        Logros
      </h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {achievements.map((a) => {
          const unlocked = Boolean(a.unlockedAt);
          const pct =
            a.progressTarget > 0
              ? Math.min(
                  100,
                  Math.round((a.progressCurrent / a.progressTarget) * 100),
                )
              : 0;
          return (
            <article
              key={a.id}
              className="rounded-2xl border-[1.5px] bg-white p-3"
              style={{
                borderColor: unlocked
                  ? "var(--color-sage-300)"
                  : "var(--color-warm-200)",
                opacity: unlocked ? 1 : 0.7,
              }}
              data-testid={`achievement-${a.id}`}
            >
              <div className="text-[20px]" aria-hidden>
                {a.icon || (unlocked ? "🏆" : "🔒")}
              </div>
              <p
                className="mt-1 text-[12px] font-semibold leading-tight"
                style={{ color: "var(--color-warm-900)" }}
              >
                {a.label}
              </p>
              <p
                className="mt-1 text-[11px] leading-tight"
                style={{ color: "var(--color-warm-500)" }}
              >
                {a.description}
              </p>
              {!unlocked ? (
                <div className="mt-2">
                  <div
                    className="h-1.5 w-full rounded-full"
                    style={{ background: "var(--color-warm-200)" }}
                  >
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${pct}%`,
                        background: "var(--color-lavender-500)",
                      }}
                    />
                  </div>
                  <p
                    className="mt-1 text-[10px]"
                    style={{ color: "var(--color-warm-500)" }}
                  >
                    {a.progressCurrent}/{a.progressTarget}
                  </p>
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}
