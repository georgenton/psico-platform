"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import type { BookListItem } from "@psico/types";
import { coverGradient } from "../cover-gradients";
import { relativeTime } from "@/lib/relative-time";

/**
 * BookCard — grid card. Mirrors `web-card` from
 * docs/design/biblioteca/biblioteca.css.
 *
 * The card carries the toggle state for favorite/bookmark as optimistic UI:
 * the button flips immediately, then dispatches POST /books/:id/{favorite,bookmark}.
 * If the API fails we revert. This keeps the interaction crisp without a
 * server round-trip per click.
 */
export function BookCard({
  book,
  apiBase,
  token,
}: {
  book: BookListItem;
  apiBase: string;
  token: string | null;
}) {
  const [favActive, setFavActive] = useState(book.isFavorite);
  const [bmActive, setBmActive] = useState(book.isBookmarked);
  const [, startTransition] = useTransition();

  const tierLabel = book.tierRequired === "free" ? "Gratuito" : "Pro";
  const ratingLabel = book.rating > 0 ? book.rating.toFixed(1) : "—";
  const started = book.userProgress?.progressPct
    ? book.userProgress.progressPct > 0
    : false;
  const pct = book.userProgress?.progressPct ?? 0;

  async function toggle(kind: "favorite" | "bookmark") {
    if (!token) return;
    const setLocal = kind === "favorite" ? setFavActive : setBmActive;
    const current = kind === "favorite" ? favActive : bmActive;
    setLocal(!current);
    startTransition(async () => {
      try {
        const res = await fetch(
          `${apiBase}/books/${encodeURIComponent(book.id)}/${kind}`,
          { method: "POST", headers: { Authorization: `Bearer ${token}` } },
        );
        if (!res.ok) setLocal(current);
      } catch {
        setLocal(current);
      }
    });
  }

  return (
    <article
      className="flex flex-col overflow-hidden rounded-2xl border-[1.5px] bg-white transition-all hover:-translate-y-0.5"
      style={{ borderColor: "var(--color-warm-200)" }}
    >
      {/* Cover */}
      <Link
        href={`/dashboard/biblioteca/${book.slug}`}
        className="relative block h-44"
        style={{
          background: book.coverArtUrl
            ? `url(${book.coverArtUrl}) center/cover`
            : coverGradient(book.cover),
        }}
        aria-label={`Ver detalle de ${book.title}`}
      >
        {!book.coverArtUrl ? (
          <span
            aria-hidden
            className="absolute inset-0 flex items-center justify-center text-[36px]"
            style={{ color: "rgba(255,255,255,0.85)" }}
          >
            📖
          </span>
        ) : null}
        {book.tierRequired === "pro" ? (
          <span
            className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/35 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white backdrop-blur-sm"
            aria-label="Requiere Pro"
          >
            🔒 Pro
          </span>
        ) : null}
      </Link>

      {/* Body */}
      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-start justify-between gap-2">
          <h3
            className="line-clamp-2 text-[14px] font-bold leading-snug tracking-tight"
            style={{ color: "var(--color-warm-900)" }}
          >
            {book.title}
          </h3>
          <button
            type="button"
            onClick={() => toggle("favorite")}
            disabled={!token}
            aria-label={favActive ? "Quitar de favoritos" : "Marcar favorito"}
            aria-pressed={favActive}
            className="shrink-0 text-[16px] leading-none transition-transform hover:scale-110 disabled:opacity-30"
            style={{
              color: favActive
                ? "var(--color-lavender-600)"
                : "var(--color-warm-400)",
            }}
          >
            {favActive ? "♥" : "♡"}
          </button>
        </div>
        {book.authorName ? (
          <div
            className="mt-1 text-[12px]"
            style={{ color: "var(--color-warm-500)" }}
          >
            {book.authorName}
          </div>
        ) : null}
        {book.subtitle ? (
          <p
            className="mt-2 line-clamp-2 text-[12px] leading-snug"
            style={{ color: "var(--color-warm-600)" }}
          >
            {book.subtitle}
          </p>
        ) : null}

        <div
          className="mt-3 flex flex-wrap items-center gap-1.5 text-[11px]"
          style={{ color: "var(--color-warm-500)" }}
        >
          <span>{book.chapters} caps</span>
          {book.durationMinutes > 0 ? (
            <>
              <span style={{ color: "var(--color-warm-300)" }}>·</span>
              <span>{book.durationMinutes} min</span>
            </>
          ) : null}
          {book.reviewCount > 0 ? (
            <>
              <span style={{ color: "var(--color-warm-300)" }}>·</span>
              <span>★ {ratingLabel}</span>
            </>
          ) : null}
        </div>

        {(() => {
          // Prefer the more recent of the two markers. Whichever the user did
          // last is the more relevant "I touched this recently" signal.
          const fav = book.favoritedAt ? new Date(book.favoritedAt) : null;
          const bm = book.bookmarkedAt ? new Date(book.bookmarkedAt) : null;
          const mostRecent = fav && bm ? (fav > bm ? fav : bm) : (fav ?? bm);
          if (!mostRecent) return null;
          const label = relativeTime(mostRecent);
          const icon = fav && (!bm || fav >= bm) ? "❤️" : "🔖";
          return (
            <div
              className="mt-2.5 inline-flex items-center gap-1 text-[10.5px]"
              style={{ color: "var(--color-warm-500)" }}
            >
              <span aria-hidden>{icon}</span>
              <span>{label}</span>
            </div>
          );
        })()}
        {started && book.tierRequired !== "pro" ? (
          <div className="mt-3 flex items-center gap-2">
            <div
              className="h-1 flex-1 overflow-hidden rounded-full"
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
            <span
              className="font-mono text-[10px] font-semibold"
              style={{ color: "var(--color-lavender-700)" }}
            >
              {pct}%
            </span>
          </div>
        ) : null}

        <div className="mt-4 flex items-center justify-between gap-2">
          <Link
            href={`/dashboard/biblioteca/${book.slug}`}
            className="inline-flex flex-1 items-center justify-center rounded-xl px-3 py-2 text-[12px] font-semibold transition-opacity hover:opacity-90"
            style={
              book.tierRequired === "pro"
                ? {
                    background: "var(--color-warm-100)",
                    color: "var(--color-warm-700)",
                  }
                : {
                    background: "var(--color-lavender-100)",
                    color: "var(--color-lavender-700)",
                  }
            }
          >
            {book.tierRequired === "pro"
              ? "Desbloquear con Pro →"
              : started
                ? "Seguir leyendo →"
                : "Empezar →"}
          </Link>
          <button
            type="button"
            onClick={() => toggle("bookmark")}
            disabled={!token}
            aria-label={bmActive ? "Quitar marcador" : "Guardar para luego"}
            aria-pressed={bmActive}
            className="rounded-xl px-2 py-2 text-[13px] transition-colors disabled:opacity-30"
            style={{
              color: bmActive
                ? "var(--color-lavender-600)"
                : "var(--color-warm-400)",
              background: bmActive ? "var(--color-lavender-50)" : "transparent",
            }}
          >
            {bmActive ? "🔖" : "📑"}
          </button>
        </div>
      </div>

      {/* Tier badge — small accessibility hint */}
      <span className="sr-only">{tierLabel}</span>
    </article>
  );
}
