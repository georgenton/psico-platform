import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type {
  BookManifest,
  ContentUnitMarks,
  ContentUnitRead,
  LectorChapterResponse,
} from "@psico/types";
import { classifyMarksReadFailure, shouldFetchUnitMarks } from "@psico/types";

import { ApiError } from "@/lib/api";
import { PaywallPro } from "@/components/dashboard/detalle/PaywallPro";
import { getAccessToken, isNextThrow, serverFetch } from "@/lib/api.server";
import { LectorShell } from "@/components/dashboard/lector/LectorShell";

export const dynamic = "force-dynamic";

const API_BASE = `${(process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001").replace(/\/$/, "")}/api`;

/** How to fetch the envelope — the ONLY thing the three routes differ by. */
export type ChapterFetch = () => Promise<LectorChapterResponse>;

export async function readerMetadata(
  fetchChapter: ChapterFetch,
): Promise<Metadata> {
  try {
    const detail = await fetchChapter();
    return {
      title: `${detail.chapter.title} · ${detail.book.title}`,
      description: detail.chapter.subtitle ?? undefined,
    };
  } catch (err) {
    if (isNextThrow(err)) throw err;
    return { title: "Lector" };
  }
}

/**
 * Resolve a chapter's blocks from Content Core (CC-6B).
 *
 * The lector envelope still owns the book/session/prefs/marks/audio, but the
 * block TEXT is now sourced from the canonical store: manifest (slug → server
 * editionKey + ordered units) → the unit at this reading order → its blocks.
 * The dual-read is fail-closed server-side, so a book never backfilled to
 * Content Core is served from legacy transparently (`source: "legacy"`).
 *
 * Returns `null` (→ "contenido temporalmente no disponible") only on a genuine
 * fault we must not mask: a CONTENT_CORE_INTEGRITY_ERROR (500), a retired/
 * missing unit (404), or a manifest whose order doesn't include this chapter.
 * We NEVER silently fall back to the lector's own blocks.
 */
async function resolveContentUnit(
  bookSlug: string,
  contentUnitKey: string,
): Promise<ContentUnitRead | null> {
  try {
    // The manifest is still read — for the server-owned editionKey, which the
    // browser must never fabricate from the slug.
    const manifest = await serverFetch<BookManifest>(
      `/content/books/${encodeURIComponent(bookSlug)}/manifest`,
    );
    // By KEY, never by order. Selecting "the unit at position 3" would put
    // position back at the centre of a URL built to escape it: after a
    // structural change the page would name one chapter and render another's
    // words. The key comes from the envelope, decided by the server.
    return await serverFetch<ContentUnitRead>(
      `/content/editions/${encodeURIComponent(manifest.editionKey)}/units/${encodeURIComponent(contentUnitKey)}`,
    );
  } catch (err) {
    if (isNextThrow(err)) throw err;
    // 404 (retired unit) or 500 (CONTENT_CORE_INTEGRITY_ERROR) → unavailable,
    // never legacy. Any auth error would have already tripped the lector fetch.
    if (err instanceof ApiError) return null;
    throw err;
  }
}

/**
 * The reader page, loaded once and shared by every route that renders it.
 *
 * Phase B.A introduced two canonical routes (`u/…`, `c/…`) beside the
 * compatibility positional one. They differ ONLY in how the envelope is
 * fetched, so the loading, the Content Core block resolution and the
 * source-aware marks read live here rather than being copied per route — three
 * copies of this would be three places for the marks fail-closed rule to drift.
 *
 * ── Sprint S6-front, CC-6B block source ──────────────────────────────────
 *
 * The server fetches the chapter envelope once at SSR time so the first paint
 * shows real content (helps Lighthouse, helps perceived speed, lets users
 * without JS at least see the text) and resolves the block text from Content
 * Core in the same request. All interactivity — highlights, annotations,
 * heartbeat, preferences — moves to the `LectorShell` client component.
 *
 * We deliberately pass the access token as a prop. The client component
 * uses it to call the API directly from the browser; that's the only way
 * to share the user's session with our client-side fetch without going
 * through Next.js Server Actions for every interaction (annotation create,
 * highlight delete, heartbeat tick — those happen too often).
 */
export async function renderReader(fetchChapter: ChapterFetch) {
  const accessToken = getAccessToken();
  if (!accessToken) notFound(); // Middleware should redirect; this is belt-and-suspenders.

  let chapter: LectorChapterResponse;
  try {
    chapter = await fetchChapter();
  } catch (err) {
    if (isNextThrow(err)) throw err;
    if (err instanceof ApiError && err.status === 404) notFound();
    // «Esto necesita Pro» no es una excepción: es un estado normal del
    // producto, y hasta ahora salía por el mismo desagüe que un fallo de
    // servidor. El comentario que había aquí decía que el 403 «burbujea al
    // error boundary del panel»; lo que ocurría de verdad era un 500 en blanco,
    // sin explicación y sin salida — justo a quien sigue un enlace compartido o
    // un marcador de cuando sí tenía Pro. Ver #736.
    if (esProRequerido(err)) return <LectorBloqueado />;
    throw err;
  }

  // Use the canonical book slug from the envelope (params.idOrSlug may be an id).
  const unit = await resolveContentUnit(
    chapter.book.slug,
    chapter.chapter.contentUnitKey,
  );

  // CC-6D: read marks SOURCE-AWARE. A content-core unit MUST read from the CC-6C
  // surface (its marks aren't in the envelope); a legacy unit uses the envelope's
  // marks and never hits the surface. On a content-core failure we classify —
  // auth (401/403) propagates (never a silent envelope fallback), anything else
  // (404/500/network) is a visible "unavailable" state. Fail-closed either way.
  let marks: ContentUnitMarks | null = null;
  let marksUnavailable = false;
  if (unit && shouldFetchUnitMarks(unit.source)) {
    try {
      marks = await serverFetch<ContentUnitMarks>(
        `/content/editions/${encodeURIComponent(unit.editionKey)}/units/${encodeURIComponent(unit.unitKey)}/marks`,
      );
    } catch (err) {
      if (isNextThrow(err)) throw err;
      const status = err instanceof ApiError ? err.status : undefined;
      // Propagate auth/authz — the dashboard error boundary / middleware handles it.
      if (classifyMarksReadFailure(status) === "auth") throw err;
      marks = null;
      marksUnavailable = true;
    }
  }

  return (
    <LectorShell
      apiBase={API_BASE}
      token={accessToken}
      initial={chapter}
      unit={unit}
      marks={marks}
      marksUnavailable={marksUnavailable}
      // The canonical slug from the envelope — the shell builds stable
      // hrefs from it, and `idOrSlug` may be an id.
      bookSlug={chapter.book.slug}
    />
  );
}

/**
 * ¿Es esta negativa un «hazte Pro»?
 *
 * Se mira `code`, que es el campo estable —el propio `ApiError` lo dice: el
 * texto de `message` puede cambiar sin romper el contrato—. Se acepta además
 * el token en `message` durante la transición: la Web y la API se despliegan
 * por separado, y si la Web llegara primero, `code` todavía vendría como
 * `FORBIDDEN` y volveríamos al 500 que esto viene a quitar. Se puede retirar
 * esa segunda rama cuando la API con `code: "PRO_REQUIRED"` esté desplegada en
 * todas partes.
 */
export function esProRequerido(err: unknown): boolean {
  if (!(err instanceof ApiError) || err.status !== 403) return false;
  return err.code === "PRO_REQUIRED" || err.message === "PRO_REQUIRED";
}

/** Alias con el nombre que usa la ruta posicional. */
export const renderChapterLocked = () => <LectorBloqueado />;

/**
 * Lo que ve quien abre un capítulo que su plan no cubre.
 *
 * No se pinta ni un bloque —el servidor no los ha entregado, así que no hay
 * nada que esconder— ni se dice nada del capítulo que el contrato no haya
 * dado. Sólo la razón y dos salidas.
 */
export function LectorBloqueado() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <PaywallPro
        titulo="Este capítulo está disponible con Pro"
        cuerpo="El primer capítulo de cada libro es gratuito. Para seguir leyendo este, y todos los demás, hazte Pro por $7/mes. Cancelas cuando quieras."
        volver={{
          href: "/dashboard/biblioteca",
          texto: "Volver a la biblioteca",
        }}
      />
    </div>
  );
}
