import type { ReactNode } from "react";

/**
 * PlaceholderCard — Sprint B2.
 *
 * Renders the "Próximamente" state used by the three new sections that the
 * Sidebar surfaces but don't have real pages yet (Mi Evolución, Mapa Emocional,
 * Exploraciones). Keeps copy + style consistent so the redesign nav is fully
 * navigable without dead links.
 */
export function PlaceholderCard({
  title,
  subtitle,
  body,
  icon,
}: {
  title: string;
  subtitle: string;
  body: ReactNode;
  icon: string;
}) {
  return (
    <div className="mx-auto max-w-2xl py-10">
      <div
        className="rounded-3xl border p-8 text-center"
        style={{
          background: "white",
          borderColor: "var(--color-warm-200)",
          boxShadow: "var(--shadow-card)",
        }}
      >
        <div
          aria-hidden
          className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full text-2xl"
          style={{
            background: "var(--color-lavender-50)",
            color: "var(--color-lavender-600)",
          }}
        >
          {icon}
        </div>
        <p
          className="text-xs font-bold uppercase tracking-[0.18em]"
          style={{ color: "var(--color-lavender-600)" }}
        >
          {subtitle}
        </p>
        <h1
          className="mt-2 text-2xl font-bold"
          style={{ color: "var(--color-warm-800)" }}
        >
          {title}
        </h1>
        <div
          className="mt-3 text-sm leading-relaxed"
          style={{ color: "var(--color-warm-600)" }}
        >
          {body}
        </div>
      </div>
    </div>
  );
}
