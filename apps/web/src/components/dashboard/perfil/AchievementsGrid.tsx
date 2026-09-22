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
          style={{ color: "var(--fg-strong)" }}
        >
          Logros
        </h2>
        <p
          className="rounded-2xl border-[1.5px] bg-white p-5 text-[13px]"
          style={{
            borderColor: "var(--color-warm-200)",
            color: "var(--fg-muted)",
          }}
        >
          Empezá a usar FeelVerse — leer un capítulo, escribir en el diario,
          charlar con Eco — y mostraremos acá tus logros.
        </p>
      </section>
    );
  }

  return (
    <section data-testid="achievements-grid">
      <h2
        className="mb-2 text-[14px] font-semibold"
        style={{ color: "var(--fg-strong)" }}
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
                // Aquí había `opacity: 0.7` para los logros por conseguir. El
                // token de texto que usan estas tarjetas llega a 5.29:1 por sí
                // solo, pero atenuar la tarjeta entera lo bajaba a 2.90 —el
                // contraste no se perdía en el color, se perdía en la opacidad.
                //
                // Que un logro está pendiente ya lo dicen tres cosas: el 🔒 en
                // lugar del icono, el borde neutro en lugar del verde, y la
                // barra de progreso que sólo aparece en los pendientes. La
                // jerarquía se mantiene sin dejar el texto a medio leer.
              }}
              data-testid={`achievement-${a.id}`}
            >
              <div className="text-[20px]" aria-hidden>
                {a.icon || (unlocked ? "🏆" : "🔒")}
              </div>
              <p
                className="mt-1 text-[12px] font-semibold leading-tight"
                style={{ color: "var(--fg-strong)" }}
              >
                {a.label}
              </p>
              <p
                className="mt-1 text-[11px] leading-tight"
                style={{ color: "var(--fg-muted)" }}
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
                    style={{ color: "var(--fg-muted)" }}
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
