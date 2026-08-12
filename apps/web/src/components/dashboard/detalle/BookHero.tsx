"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type {
  BookAuthorDetail,
  BookDetail,
  BookUserProgressSummary,
  ReaderChapterRef,
} from "@psico/types";
import { readerChapterPath } from "@psico/types";
import { coverGradient } from "../cover-gradients";
import { assetUrl } from "@/lib/asset-url";

/**
 * BookHero — top section of /dashboard/biblioteca/[idOrSlug].
 *
 * Mirrors `web-hero` from docs/design/detalle/detalle.css. The CTA does two
 * things in one transition:
 *  1. POST /api/books/:idOrSlug/start to register the touch on the backend.
 *  2. Navigate to that chapter's canonical reader URL.
 *
 * Both halves used to be wrong. The start call's failure was swallowed and the
 * reader opened anyway, so somebody whose start never registered saw the
 * chapter open and the state they expected never appear. And the chapter to
 * open was derived from a percentage — `ceil(pct/100 * chapters)` — which is a
 * guess at a POSITION, and a position names different chapters at different
 * times. Both targets are now server-owned `ReaderChapterRef`s.
 *
 * `isLocked` is computed by the page (server-side) so we can render the
 * paywall variant straight away — no client-side network call to know it.
 */
export function BookHero({
  book,
  author,
  userProgress,
  isLocked,
  apiBase,
  token,
  idOrSlug,
  firstReaderRef,
  continueReaderRef,
}: {
  book: BookDetail;
  author: BookAuthorDetail | null;
  userProgress: BookUserProgressSummary | null;
  isLocked: boolean;
  apiBase: string;
  token: string | null;
  idOrSlug: string;
  /** The book's first chapter, for somebody who has not opened it. */
  firstReaderRef: ReaderChapterRef | null;
  /** Where the reader left off. Null when there is nothing to resume. */
  continueReaderRef: ReaderChapterRef | null;
}) {
  const router = useRouter();
  const [starting, startTransition] = useTransition();
  const [started, setStarted] = useState(userProgress !== null);
  const [failed, setFailed] = useState(false);
  // Used for the progress readout only. A percentage is fine as a percentage;
  // what it must never do is decide which chapter to open.
  const pct = userProgress?.progressPct ?? 0;

  // Resume where the reader was; otherwise open the book's first chapter.
  // Both come from the server — nothing here converts a number into a chapter.
  const target = (started ? continueReaderRef : null) ?? firstReaderRef;

  async function handleStart() {
    if (!token || isLocked || !target) return;
    startTransition(async () => {
      setFailed(false);

      // Already started: navigating is not a state change, so there is nothing
      // to register. Re-posting Start would only risk failing a journey that
      // had no reason to touch the server at all.
      if (!started) {
        let ok = false;
        try {
          const res = await fetch(
            `${apiBase}/books/${encodeURIComponent(idOrSlug)}/start`,
            { method: "POST", headers: { Authorization: `Bearer ${token}` } },
          );
          ok = res.ok;
        } catch {
          ok = false;
        }
        // Fail closed. Opening the reader on a failed start tells somebody the
        // book is under way when the server does not think so — and the reader
        // would then look identical to a successful start.
        if (!ok) {
          setFailed(true);
          return;
        }
        setStarted(true);
      }

      router.push(readerChapterPath(book.slug, target));
    });
  }

  const ctaLabel = isLocked
    ? "Hazte Pro para leer"
    : started
      ? "Seguir leyendo"
      : "Empezar a leer";

  return (
    <section className="grid gap-6 lg:grid-cols-[260px_1fr] lg:items-start">
      {/* Cover */}
      <div className="flex justify-center lg:block">
        <div
          className="flex h-[340px] w-[240px] items-center justify-center rounded-2xl shadow-xl"
          style={{
            background: book.coverArtUrl
              ? `url(${assetUrl(book.coverArtUrl)}) center/cover`
              : coverGradient(book.cover),
          }}
          aria-hidden
        >
          {!book.coverArtUrl ? (
            <span
              className="text-[64px]"
              style={{ color: "rgba(255,255,255,0.85)" }}
            >
              📖
            </span>
          ) : null}
        </div>
      </div>

      {/* Meta */}
      <div className="min-w-0">
        {book.categoryLabel ? (
          <span
            className="text-[10.5px] font-bold uppercase tracking-[0.14em]"
            style={{ color: "var(--color-lavender-700)" }}
          >
            {book.categoryLabel}
          </span>
        ) : null}
        <h1
          className="mt-2 text-[32px] font-bold leading-[1.1] tracking-tight sm:text-[40px]"
          style={{ color: "var(--color-warm-900)" }}
        >
          {book.title}
        </h1>
        {book.subtitle ? (
          <p
            className="mt-1.5 text-[16px] leading-relaxed"
            style={{ color: "var(--color-warm-500)" }}
          >
            {book.subtitle}
          </p>
        ) : null}

        {/* Author */}
        {author ? (
          <div className="mt-4 flex items-center gap-3">
            <span
              className="inline-flex h-10 w-10 items-center justify-center rounded-full text-[13px] font-bold text-white"
              style={{ background: "var(--color-lavender-500)" }}
              aria-hidden
            >
              {author.initials}
            </span>
            <div>
              <div
                className="text-[14px] font-semibold"
                style={{ color: "var(--color-warm-900)" }}
              >
                {author.name}
                {author.isVerified ? (
                  <span
                    className="ml-1 text-[12px]"
                    style={{ color: "var(--color-sage-500)" }}
                    title="Verificado"
                  >
                    ✓
                  </span>
                ) : null}
              </div>
              {author.title ? (
                <div
                  className="mt-0.5 text-[12px]"
                  style={{ color: "var(--color-warm-500)" }}
                >
                  {author.title}
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        {/* Stats row */}
        <div
          className="mt-5 flex flex-wrap items-center gap-4 rounded-2xl border-[1.5px] bg-white px-5 py-3.5"
          style={{ borderColor: "var(--color-warm-200)" }}
        >
          <Stat value={book.chapters} label="Capítulos" />
          {book.durationMinutes > 0 ? (
            <Stat value={`${book.durationMinutes}m`} label="Lectura" />
          ) : null}
          {book.pages ? <Stat value={book.pages} label="Páginas" /> : null}
          {book.audioAvailable ? <Stat value="✓" label="Audio" /> : null}
          {book.exercisesAvailable ? (
            <Stat value="✓" label="Ejercicios" />
          ) : null}
        </div>

        {/* Progress */}
        {pct > 0 && pct < 100 ? (
          <div className="mt-4">
            <div
              className="flex items-center justify-between text-[12px]"
              style={{ color: "var(--color-warm-500)" }}
            >
              <span>
                Tu progreso ·{" "}
                <strong style={{ color: "var(--color-warm-800)" }}>
                  {pct}%
                </strong>
              </span>
            </div>
            <div
              className="mt-1.5 h-1.5 overflow-hidden rounded-full"
              style={{ background: "var(--color-warm-200)" }}
              aria-hidden
            >
              <div
                className="h-full"
                style={{
                  width: `${pct}%`,
                  background: "var(--color-lavender-500)",
                }}
              />
            </div>
          </div>
        ) : null}

        {/* CTAs */}
        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={isLocked ? undefined : handleStart}
            disabled={starting || !token}
            className="inline-flex items-center gap-2 rounded-xl px-5 py-3 text-[14px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
            style={{
              background: isLocked
                ? "var(--color-warm-900)"
                : "var(--color-sage-400)",
            }}
          >
            {isLocked ? "🔒" : "▶"} {starting ? "Abriendo…" : ctaLabel}
          </button>
          {failed ? (
            // Fixed copy. The server's own words could carry ids, a URL, or a
            // database term, and none of that helps somebody who just wants to
            // read a book.
            <p
              role="alert"
              className="text-[13px]"
              style={{ color: "var(--color-rose-600, #b4405a)" }}
            >
              No pudimos iniciar el libro. Inténtalo de nuevo.
            </p>
          ) : null}
          {book.audioAvailable && !isLocked ? (
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-xl border-[1.5px] bg-white px-5 py-3 text-[14px] font-semibold"
              style={{
                borderColor: "var(--color-warm-200)",
                color: "var(--color-warm-700)",
              }}
              disabled
              title="Reproductor de audio llega en S8"
            >
              🎧 Escuchar audio
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function Stat({ value, label }: { value: number | string; label: string }) {
  return (
    <div>
      <div
        className="text-[16px] font-bold leading-none"
        style={{ color: "var(--color-warm-900)" }}
      >
        {value}
      </div>
      <div
        className="mt-1 text-[10.5px] font-semibold uppercase tracking-wider"
        style={{ color: "var(--color-warm-500)" }}
      >
        {label}
      </div>
    </div>
  );
}
