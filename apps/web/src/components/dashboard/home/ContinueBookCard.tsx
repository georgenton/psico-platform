import Link from "next/link";
import type { HomeContinueBook } from "@psico/types";
import { coverGradient } from "../cover-gradients";

/**
 * ContinueBookCard — hero card showing the user's last-touched book.
 *
 * Mirrors `web-continue` from docs/design/inicio/inicio.css. The CTA links to
 * the book detail page (S5-front) which then dispatches the reader (future
 * sprint). For now: clicking takes the user to /dashboard/biblioteca/:bookId
 * where they can resume from chapter N.
 */
export function ContinueBookCard({ book }: { book: HomeContinueBook }) {
  const pct = Math.max(0, Math.min(100, Math.round(book.progressPct)));
  const lastRead = formatRelative(book.lastReadAt);

  return (
    <article
      className="grid grid-cols-1 items-center gap-5 rounded-[20px] border-[1.5px] bg-white p-5 sm:grid-cols-[112px_1fr_auto] sm:p-[18px_22px]"
      style={{ borderColor: "var(--color-warm-200)" }}
    >
      {/* Cover */}
      <div
        className="flex h-[148px] w-full items-center justify-center rounded-xl shadow-sm sm:w-[112px]"
        style={{ background: coverGradient(book.cover) }}
        aria-hidden
      >
        <span
          className="text-[30px]"
          style={{ color: "rgba(255,255,255,0.85)" }}
        >
          📖
        </span>
      </div>

      {/* Meta */}
      <div className="min-w-0">
        <span
          className="text-[10px] font-bold uppercase tracking-[0.14em]"
          style={{ color: "var(--color-lavender-700)" }}
        >
          Continúa donde quedaste
        </span>
        <h3
          className="mt-2 text-[19px] font-bold leading-tight tracking-tight"
          style={{ color: "var(--color-warm-900)" }}
        >
          {book.title}
        </h3>
        <div
          className="mt-1 text-[13px]"
          style={{ color: "var(--color-warm-500)" }}
        >
          {book.author}
        </div>
        <div
          className="mt-2.5 text-[13.5px] leading-snug"
          style={{ color: "var(--color-warm-700)" }}
        >
          Siguiente · Cap. {book.chapterN} — {book.chapterTitle}
        </div>
        <div
          className="mt-2 flex flex-wrap items-center gap-2.5 text-[11.5px]"
          style={{ color: "var(--color-warm-500)" }}
        >
          <span>{lastRead}</span>
          <span style={{ color: "var(--color-warm-300)" }}>·</span>
          <span
            className="inline-block h-1 w-[110px] overflow-hidden rounded-full"
            style={{ background: "var(--color-warm-200)" }}
            aria-hidden
          >
            <span
              className="block h-full"
              style={{
                width: `${pct}%`,
                background: "var(--color-lavender-500)",
              }}
            />
          </span>
          <span
            className="font-mono text-[11px] font-semibold"
            style={{ color: "var(--color-lavender-700)" }}
          >
            {pct}%
          </span>
        </div>
      </div>

      {/* CTA */}
      <Link
        href={`/dashboard/biblioteca/${book.bookId}`}
        className="inline-flex items-center gap-1.5 self-start rounded-xl px-5 py-3 text-[13px] font-semibold text-white transition-colors sm:self-center"
        style={{ background: "var(--color-sage-400)" }}
      >
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="currentColor"
          aria-hidden
        >
          <path d="M8 5v14l11-7z" />
        </svg>
        Seguir leyendo
      </Link>
    </article>
  );
}

function formatRelative(date: Date | string): string {
  const d = date instanceof Date ? date : new Date(date);
  const diffMs = Date.now() - d.getTime();
  const diffH = Math.floor(diffMs / (1000 * 60 * 60));
  if (diffH < 1) return "hace minutos";
  if (diffH < 24) return `hace ${diffH} h`;
  const diffD = Math.floor(diffH / 24);
  if (diffD === 1) return "ayer";
  if (diffD < 7) return `hace ${diffD} días`;
  return d.toLocaleDateString("es-EC", { day: "numeric", month: "short" });
}
