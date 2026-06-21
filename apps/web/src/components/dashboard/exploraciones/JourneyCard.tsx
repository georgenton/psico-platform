import Link from "next/link";
import type { JourneyListItem } from "@psico/types";

const COVER_GRADIENTS: Record<JourneyListItem["coverToken"], string> = {
  cool: "linear-gradient(135deg, var(--color-lavender-400) 0%, var(--color-lavender-700) 100%)",
  warm: "linear-gradient(135deg, #d97b4b 0%, #8a3b1c 100%)",
  mixed:
    "linear-gradient(135deg, var(--color-lavender-300) 0%, var(--color-sage-500) 100%)",
};

const BOOK_GRADIENTS: Record<string, string> = {
  cool: "linear-gradient(135deg, var(--color-lavender-400) 0%, var(--color-lavender-700) 100%)",
  warm: "linear-gradient(135deg, var(--color-sage-400) 0%, var(--color-sage-700) 100%)",
  mixed:
    "linear-gradient(135deg, var(--color-lavender-300) 0%, var(--color-sage-500) 100%)",
};

function durationLabel(minutes: number): string {
  if (minutes <= 0) return "—";
  if (minutes < 60) return `${minutes} min`;
  const h = Math.round(minutes / 60);
  return h === 1 ? "1 hora" : `${h} horas`;
}

/**
 * JourneyCard — Sprint B5.
 *
 * Each card surfaces the journey eyebrow + title + subtitle, the gradient
 * cover, the bundled books (gradient swatch + title + author), and the
 * total estimated duration. Tap on a book → /dashboard/biblioteca/<slug>;
 * no journey-level detail page in v1 (the cards ARE the detail).
 */
export function JourneyCard({ journey }: { journey: JourneyListItem }) {
  return (
    <article
      className="overflow-hidden rounded-3xl border bg-white"
      style={{
        borderColor: "var(--color-warm-200)",
        boxShadow: "var(--shadow-card)",
      }}
    >
      {/* Cover band */}
      <div
        className="relative h-40 w-full"
        style={{ background: COVER_GRADIENTS[journey.coverToken] }}
      >
        <span
          className="absolute left-5 top-4 inline-flex items-center gap-2 rounded-full bg-white/90 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em]"
          style={{ color: "var(--color-lavender-700)" }}
        >
          <span
            aria-hidden
            className="inline-block h-1.5 w-1.5 rounded-full"
            style={{ background: "var(--color-lavender-500)" }}
          />
          Exploración
        </span>
      </div>

      <div className="p-5 sm:p-6">
        <h2
          className="text-xl font-bold leading-tight"
          style={{ color: "var(--color-warm-900)" }}
        >
          {journey.title}
        </h2>
        <p
          className="mt-1 text-sm leading-relaxed"
          style={{ color: "var(--color-warm-600)" }}
        >
          {journey.subtitle}
        </p>
        {journey.description ? (
          <p
            className="mt-2 text-sm leading-relaxed"
            style={{ color: "var(--color-warm-500)" }}
          >
            {journey.description}
          </p>
        ) : null}

        <p
          className="mt-4 text-[10.5px] font-bold uppercase tracking-[0.14em]"
          style={{ color: "var(--color-lavender-600)" }}
        >
          {journey.books.length === 1
            ? "1 libro"
            : `${journey.books.length} libros`}{" "}
          · {durationLabel(journey.durationMinutes)}
        </p>

        {/* Bundled books */}
        <ul className="mt-2 space-y-2">
          {journey.books.map((book) => (
            <li key={book.slug}>
              <Link
                href={`/dashboard/biblioteca/${book.slug}`}
                className="flex items-center gap-3 rounded-xl border p-2.5 transition-colors hover:bg-warm-50"
                style={{ borderColor: "var(--color-warm-200)" }}
              >
                <div
                  className="h-10 w-10 shrink-0 rounded-lg"
                  style={{ background: BOOK_GRADIENTS[book.cover] }}
                />
                <div className="min-w-0 flex-1">
                  <p
                    className="truncate text-sm font-medium"
                    style={{ color: "var(--color-warm-800)" }}
                  >
                    {book.title}
                  </p>
                  <p
                    className="truncate text-xs"
                    style={{ color: "var(--color-warm-500)" }}
                  >
                    {book.authorName ?? "Sin autor"}
                    {book.durationMinutes > 0
                      ? ` · ${durationLabel(book.durationMinutes)}`
                      : ""}
                  </p>
                </div>
                <span
                  aria-hidden
                  className="text-sm"
                  style={{ color: "var(--color-lavender-600)" }}
                >
                  →
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </article>
  );
}
