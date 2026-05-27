import type { DiaryEntrySummary } from "@psico/types";

/**
 * EntryList — shows the user's diary entries as metadata-only cards.
 *
 * Until S6-crypto lands the client cannot decrypt `excerptCiphertext`; we
 * render the mood + tags + kind + relative date instead. When crypto is
 * wired this list lights up with the actual excerpts.
 *
 * Empty state is the most common case for v1 since no entries exist yet.
 */
export function EntryList({ entries }: { entries: DiaryEntrySummary[] }) {
  if (entries.length === 0) {
    return (
      <div
        className="rounded-2xl border-[1.5px] bg-white p-10 text-center"
        style={{ borderColor: "var(--color-warm-200)" }}
      >
        <div
          aria-hidden
          className="mx-auto flex h-14 w-14 items-center justify-center rounded-full text-[22px]"
          style={{ background: "var(--color-lavender-50)" }}
        >
          ✎
        </div>
        <h2
          className="mt-4 text-[18px] font-bold leading-tight"
          style={{ color: "var(--color-warm-900)" }}
        >
          Tu primera entrada empieza aquí
        </h2>
        <p
          className="mx-auto mt-1.5 max-w-md text-[13px] leading-relaxed"
          style={{ color: "var(--color-warm-500)" }}
        >
          Anota lo que sientes, sin pulir. Tu diario es privado — solo tú lo
          lees.
        </p>
      </div>
    );
  }

  return (
    <ol className="flex flex-col gap-3">
      {entries.map((e) => (
        <li key={e.id}>
          <EntryCard entry={e} />
        </li>
      ))}
    </ol>
  );
}

function EntryCard({ entry }: { entry: DiaryEntrySummary }) {
  const date = (
    entry.createdAt instanceof Date
      ? entry.createdAt
      : new Date(entry.createdAt)
  ).toLocaleDateString("es-EC", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  const time = (
    entry.createdAt instanceof Date
      ? entry.createdAt
      : new Date(entry.createdAt)
  ).toLocaleTimeString("es-EC", { hour: "2-digit", minute: "2-digit" });

  const kindLabel =
    entry.kind === "prompted"
      ? "Reflexión"
      : entry.kind === "voz"
        ? "Voz"
        : "Libre";

  return (
    <article
      className="rounded-2xl border-[1.5px] bg-white p-5"
      style={{ borderColor: "var(--color-warm-200)" }}
    >
      <header className="flex flex-wrap items-center gap-3 text-[11.5px]">
        <span
          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-semibold uppercase tracking-wider"
          style={{
            background: "var(--color-warm-100)",
            color: "var(--color-warm-700)",
          }}
        >
          {kindLabel}
        </span>
        <span className="font-mono" style={{ color: "var(--color-warm-500)" }}>
          {date} · {time}
        </span>
        <span
          className="inline-flex items-center gap-1.5"
          style={{ color: "var(--color-warm-600)" }}
        >
          <span
            aria-hidden
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{
              background:
                "linear-gradient(135deg, var(--color-lavender-300), var(--color-lavender-700))",
            }}
          />
          {entry.mood[0].toUpperCase() + entry.mood.slice(1)}
        </span>
      </header>

      {entry.promptText ? (
        <div
          className="mt-3 rounded-lg px-3 py-2 text-[12.5px] italic"
          style={{
            background: "var(--color-lavender-50)",
            color: "var(--color-lavender-700)",
          }}
        >
          ✎ {entry.promptText}
        </div>
      ) : null}

      <div
        className="mt-3 rounded-lg border border-dashed p-3 text-[12px]"
        style={{
          borderColor: "var(--color-warm-300)",
          color: "var(--color-warm-500)",
        }}
      >
        🔒 Contenido cifrado · pulsa para descifrar (próximamente)
      </div>

      {entry.tags.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {entry.tags.map((t) => (
            <span
              key={t}
              className="rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
              style={{
                background: "var(--color-warm-100)",
                color: "var(--color-warm-600)",
              }}
            >
              #{t}
            </span>
          ))}
        </div>
      ) : null}
    </article>
  );
}
