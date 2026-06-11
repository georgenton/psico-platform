"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState, useTransition } from "react";
import type {
  BookAuthorSummary,
  BookCategory,
  BookListSort,
  BookListView,
} from "@psico/types";

/**
 * Filters — sticky control bar above the catalog grid.
 *
 * URL is the source of truth: every filter writes a querystring; the page
 * re-renders the grid via Next App Router. Search uses a 250ms debounce to
 * avoid a request per keystroke.
 */
export function Filters({
  categories,
  authors,
}: {
  categories: BookCategory[];
  authors: BookAuthorSummary[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [, startTransition] = useTransition();

  const view = (params.get("view") ?? "catalogo") as BookListView;
  const sort = (params.get("sort") ?? "recent") as BookListSort;
  const categoryId = params.get("categoryId") ?? "";
  const authorId = params.get("authorId") ?? "";
  const qInitial = params.get("q") ?? "";

  // pushParams is declared first so the debounce effect below can reference
  // it without hitting the temporal dead zone.
  const pushParams = useCallback(
    (patch: Record<string, string | undefined>) => {
      const next = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (!v) next.delete(k);
        else next.set(k, v);
      }
      // Going back to page 1 whenever a filter changes (except sort within view).
      next.delete("page");
      const qs = next.toString();
      startTransition(() => {
        router.push(qs ? `${pathname}?${qs}` : pathname);
      });
    },
    [params, pathname, router],
  );

  // Local input state for the search box (debounced into the URL).
  const [searchValue, setSearchValue] = useState(qInitial);

  // Sync local search input when the URL changes from outside (e.g. tab click).
  useEffect(() => {
    setSearchValue(qInitial);
  }, [qInitial]);

  // Debounce search → URL. Triggers when the local input changes.
  useEffect(() => {
    if (searchValue === qInitial) return;
    const handle = setTimeout(() => {
      pushParams({ q: searchValue });
    }, 250);
    return () => clearTimeout(handle);
  }, [searchValue, qInitial, pushParams]);

  return (
    <div className="flex flex-col gap-3">
      {/* Tabs */}
      <div
        className="inline-flex items-center gap-1 rounded-full border-[1.5px] bg-white p-1"
        style={{ borderColor: "var(--color-warm-200)" }}
      >
        {(
          [
            { id: "catalogo", label: "Catálogo" },
            { id: "mis", label: "Mis libros" },
            { id: "favoritos", label: "Favoritos" },
            { id: "guardados", label: "Guardados" },
            { id: "recos", label: "Sugerencias" },
          ] as const
        ).map((tab) => {
          const active = view === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => pushParams({ view: tab.id })}
              className="rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold transition-colors"
              style={
                active
                  ? {
                      background: "var(--color-warm-900)",
                      color: "white",
                    }
                  : { color: "var(--color-warm-600)" }
              }
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {/* Search */}
        <label
          className="inline-flex items-center gap-2 rounded-full border-[1.5px] bg-white px-3 py-1.5"
          style={{ borderColor: "var(--color-warm-200)" }}
        >
          <span aria-hidden style={{ color: "var(--color-warm-400)" }}>
            🔎
          </span>
          <input
            type="search"
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            placeholder="Buscar libros, autores…"
            className="w-44 border-0 bg-transparent text-[13px] outline-none placeholder:text-[var(--color-warm-400)] sm:w-56"
            aria-label="Buscar"
          />
        </label>

        {/* Category select */}
        <select
          value={categoryId}
          onChange={(e) =>
            pushParams({ categoryId: e.target.value || undefined })
          }
          className="rounded-full border-[1.5px] bg-white px-3 py-1.5 text-[12.5px] font-medium outline-none"
          style={{
            borderColor: "var(--color-warm-200)",
            color: "var(--color-warm-700)",
          }}
        >
          <option value="">Todas las categorías</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label} {c.count > 0 ? `(${c.count})` : ""}
            </option>
          ))}
        </select>

        {/* Author select */}
        <select
          value={authorId}
          onChange={(e) =>
            pushParams({ authorId: e.target.value || undefined })
          }
          className="rounded-full border-[1.5px] bg-white px-3 py-1.5 text-[12.5px] font-medium outline-none"
          style={{
            borderColor: "var(--color-warm-200)",
            color: "var(--color-warm-700)",
          }}
        >
          <option value="">Todos los autores</option>
          {authors.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} {a.bookCount > 0 ? `(${a.bookCount})` : ""}
            </option>
          ))}
        </select>

        {/* Sort */}
        <select
          value={sort}
          onChange={(e) =>
            pushParams({ sort: (e.target.value as BookListSort) || undefined })
          }
          className="ml-auto rounded-full border-[1.5px] bg-white px-3 py-1.5 text-[12.5px] font-medium outline-none"
          style={{
            borderColor: "var(--color-warm-200)",
            color: "var(--color-warm-700)",
          }}
          aria-label="Ordenar por"
        >
          <option value="recent">Recientes</option>
          <option value="alpha">A — Z</option>
          <option value="marina">Sugerido</option>
        </select>
      </div>
    </div>
  );
}
