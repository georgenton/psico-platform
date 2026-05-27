import type { HomeGreeting, HomeUser } from "@psico/types";

/**
 * GreetingHero — top section of /dashboard.
 *
 * Backend resolves greeting copy on the server (HomeService.buildGreeting),
 * which means the time-of-day logic + mood-aware overrides already happened.
 * The client just renders text + an eyebrow with the user's locale chip and
 * a small "streak" badge on the right (per docs/design/inicio/web.jsx).
 */
export function GreetingHero({
  user,
  greeting,
  todayLabel,
}: {
  user: HomeUser;
  greeting: HomeGreeting;
  todayLabel: string;
}) {
  return (
    <header className="mb-4 grid grid-cols-1 gap-6 sm:grid-cols-[1fr_auto] sm:items-end">
      <div>
        <span
          className="inline-flex items-center gap-2 text-[10.5px] font-bold uppercase tracking-[0.14em]"
          style={{ color: "var(--color-lavender-700)" }}
        >
          <span
            aria-hidden
            className="inline-block h-1.5 w-1.5 rounded-full"
            style={{ background: "var(--color-lavender-500)" }}
          />
          {todayLabel}
          {user.city ? ` · ${user.city}` : ""}
        </span>
        <h1
          className="mt-2 text-[28px] font-bold leading-[1.08] tracking-tight sm:text-[36px]"
          style={{ color: "var(--color-warm-900)" }}
        >
          {greeting.text}, {user.firstName}.
        </h1>
        {greeting.subtitle ? (
          <p
            className="mt-1.5 max-w-[560px] text-[15px] leading-relaxed"
            style={{ color: "var(--color-warm-500)" }}
          >
            {greeting.subtitle}
          </p>
        ) : null}
      </div>

      <div
        className="flex flex-col items-start gap-2 pb-1 sm:items-end"
        style={{ color: "var(--color-warm-500)" }}
      >
        <span className="font-mono text-xs tracking-wide">
          Tu racha ·{" "}
          <strong
            className="font-bold"
            style={{ color: "var(--color-warm-800)" }}
          >
            {user.streakDays} días
          </strong>
        </span>
      </div>
    </header>
  );
}
