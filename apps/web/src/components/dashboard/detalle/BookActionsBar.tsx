"use client";

import { useState, useTransition } from "react";

/**
 * BookActionsBar — chips de favorito + bookmark del detalle de libro.
 *
 * El estado inicial llega del Server Component (BookDetailResponse.isFavorite
 * e isBookmarked). El toggle dispara `POST /books/:slug/{favorite,bookmark}`
 * y aplica optimistic UI con rollback en caso de error.
 *
 * El endpoint backend responde `{ active: boolean }` con el estado final, así
 * que sincronizamos con la respuesta autoritativa.
 */
export function BookActionsBar({
  idOrSlug,
  initialFavorite,
  initialBookmarked,
  apiBase,
  token,
}: {
  idOrSlug: string;
  initialFavorite: boolean;
  initialBookmarked: boolean;
  apiBase: string;
  token: string | null;
}) {
  const [favorite, setFavorite] = useState(initialFavorite);
  const [bookmark, setBookmark] = useState(initialBookmarked);
  const [favPending, startFav] = useTransition();
  const [bmPending, startBm] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function toggle(
    kind: "favorite" | "bookmark",
    prev: boolean,
    setLocal: (v: boolean) => void,
    startWrapper: (cb: () => Promise<void>) => void,
  ) {
    if (!token) return;
    setLocal(!prev);
    setError(null);
    startWrapper(async () => {
      try {
        const res = await fetch(
          `${apiBase}/books/${encodeURIComponent(idOrSlug)}/${kind}`,
          { method: "POST", headers: { Authorization: `Bearer ${token}` } },
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { active: boolean };
        setLocal(data.active);
      } catch {
        // Rollback
        setLocal(prev);
        setError(
          kind === "favorite"
            ? "No pudimos actualizar tu favorito."
            : "No pudimos guardar el libro.",
        );
      }
    });
  }

  if (!token) return null;

  return (
    <div
      className="mt-3 flex flex-wrap items-center gap-2"
      data-testid="book-actions"
    >
      <button
        type="button"
        onClick={() =>
          toggle("favorite", favorite, setFavorite, (cb) => startFav(cb))
        }
        disabled={favPending}
        aria-pressed={favorite}
        aria-label={favorite ? "Quitar de favoritos" : "Marcar como favorito"}
        className="inline-flex items-center gap-1.5 rounded-full border-[1.5px] px-3.5 py-1.5 text-[12.5px] font-semibold transition-colors disabled:opacity-60"
        style={{
          background: favorite
            ? "var(--color-lavender-100)"
            : "var(--color-warm-50)",
          borderColor: favorite
            ? "var(--color-lavender-400)"
            : "var(--color-warm-200)",
          color: favorite
            ? "var(--color-lavender-700)"
            : "var(--color-warm-700)",
        }}
      >
        <span aria-hidden>{favorite ? "❤️" : "🤍"}</span>
        {favorite ? "Favorito" : "Favorito"}
      </button>

      <button
        type="button"
        onClick={() =>
          toggle("bookmark", bookmark, setBookmark, (cb) => startBm(cb))
        }
        disabled={bmPending}
        aria-pressed={bookmark}
        aria-label={bookmark ? "Quitar de guardados" : "Guardar para después"}
        className="inline-flex items-center gap-1.5 rounded-full border-[1.5px] px-3.5 py-1.5 text-[12.5px] font-semibold transition-colors disabled:opacity-60"
        style={{
          background: bookmark
            ? "var(--color-sage-100)"
            : "var(--color-warm-50)",
          borderColor: bookmark
            ? "var(--color-sage-400)"
            : "var(--color-warm-200)",
          color: bookmark ? "var(--color-sage-700)" : "var(--color-warm-700)",
        }}
      >
        <span aria-hidden>{bookmark ? "🔖" : "📑"}</span>
        {bookmark ? "Guardado" : "Guardar"}
      </button>

      {error ? (
        <span
          role="alert"
          className="text-[11.5px]"
          style={{ color: "var(--color-error-text, #B91C1C)" }}
        >
          {error}
        </span>
      ) : null}
    </div>
  );
}
