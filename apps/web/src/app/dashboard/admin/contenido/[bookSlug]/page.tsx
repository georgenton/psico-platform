import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { getSessionUser, isNextThrow, serverFetch } from "@/lib/api.server";
import type { BookState } from "../contracts";
import { CoverPanel } from "./CoverPanel";
import { CreateChapterPanel } from "./CreateChapterPanel";
import { PublishBookPanel } from "./PublishBookPanel";

export const metadata: Metadata = { title: "Pulso · Contenido del libro" };
export const dynamic = "force-dynamic";

/**
 * A book's editorial state.
 *
 * The important word on this page is BOOK. A draft accumulates edits across
 * chapters and publishes as one revision, so there is a "Publicar cambios del
 * libro" and deliberately no per-chapter publish — offering one would promise
 * something the data model cannot keep.
 */
export default async function ContentStudioBookPage({
  params,
}: {
  params: { bookSlug: string };
}) {
  const user = getSessionUser();
  if (!user || user.role !== "ADMIN") redirect("/dashboard");

  let state: BookState | null = null;
  try {
    state = await serverFetch<BookState>(
      `/pulso/content/books/${encodeURIComponent(params.bookSlug)}`,
    );
  } catch (err) {
    if (isNextThrow(err)) throw err;
    notFound();
  }
  if (!state) notFound();

  const changedTitles = state.chapters
    .filter((c) => c.changed)
    .map((c) => `Cap. ${c.order} · ${c.title}`);

  return (
    <div className="mx-auto max-w-[900px]">
      <header className="mb-6">
        <Link
          href="/dashboard/admin/contenido"
          className="text-[12px] font-semibold"
          style={{ color: "var(--color-lavender-600)" }}
        >
          ← Contenido editorial
        </Link>
        <h1
          className="mt-2 text-[22px] font-bold tracking-tight"
          style={{ color: "var(--color-warm-900)" }}
        >
          {state.book.title}
        </h1>
        <p
          className="mt-1.5 text-[13px]"
          style={{ color: "var(--color-warm-600)" }}
        >
          {state.publishedRevisionNumber === null
            ? "Sin revisión publicada"
            : `Publicado · revisión r${state.publishedRevisionNumber}`}
          {state.draftRevisionNumber !== null && (
            <>
              {" · "}
              <span style={{ color: "var(--color-lavender-700)" }}>
                Borrador · revisión r{state.draftRevisionNumber}
              </span>
            </>
          )}
        </p>
        {state.draftRevisionId !== null && (
          <p
            className="mt-1 text-[13px] font-semibold"
            style={{ color: "var(--color-lavender-700)" }}
          >
            {state.changedUnitCount}{" "}
            {state.changedUnitCount === 1
              ? "capítulo con cambios"
              : "capítulos con cambios"}
          </p>
        )}
      </header>

      <CoverPanel
        bookSlug={params.bookSlug}
        bookTitle={state.book.title}
        coverArtUrl={state.book.coverArtUrl}
      />

      {state.draftRevisionId !== null && state.draftRevisionNumber !== null && (
        <PublishBookPanel
          bookSlug={params.bookSlug}
          draftRevisionId={state.draftRevisionId}
          draftRevisionNumber={state.draftRevisionNumber}
          changedCount={state.changedUnitCount}
          changedTitles={changedTitles}
        />
      )}

      <CreateChapterPanel
        bookSlug={params.bookSlug}
        editingRevisionId={state.editingRevisionId}
        available={state.chapterCreationAvailable}
      />

      <ul className="mt-5 space-y-2">
        {state.chapters.map((c) => (
          <li
            key={c.order}
            className="flex items-center justify-between gap-4 rounded-xl border px-4 py-3"
            style={{
              borderColor: c.changed
                ? "var(--color-lavender-300)"
                : "var(--color-warm-200)",
              background: c.changed
                ? "var(--color-lavender-50)"
                : "var(--color-warm-50)",
            }}
          >
            <div className="min-w-0">
              <p
                className="text-[11px] font-bold uppercase tracking-[0.6px]"
                style={{ color: "var(--color-warm-500)" }}
              >
                Cap. {c.order}
                {c.isNewDraftChapter && " · nuevo"}
              </p>
              <p
                className="truncate text-[14.5px] font-semibold"
                style={{ color: "var(--color-warm-900)" }}
              >
                {c.title}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              {c.isNewDraftChapter ? (
                <span
                  className="rounded-full px-2.5 py-1 text-[11px] font-bold"
                  style={{
                    background: "var(--color-sage-100)",
                    color: "var(--color-sage-700)",
                  }}
                >
                  Sin publicar
                </span>
              ) : (
                c.changed && (
                  <span
                    className="rounded-full px-2.5 py-1 text-[11px] font-bold"
                    style={{
                      background: "var(--color-lavender-200)",
                      color: "var(--color-lavender-800)",
                    }}
                  >
                    Con cambios
                  </span>
                )
              )}
              {c.editable ? (
                <Link
                  href={`/dashboard/admin/contenido/${params.bookSlug}/${c.order}`}
                  className="rounded-full px-4 py-2 text-[13px] font-semibold"
                  style={{
                    background: "var(--color-lavender-100)",
                    color: "var(--color-lavender-700)",
                  }}
                >
                  Editar capítulo
                </Link>
              ) : (
                /* Listed because readers can open it, but there is nothing here
                   to edit yet — so no link that would only 404. */
                <span
                  className="rounded-full px-4 py-2 text-[13px] font-semibold"
                  style={{
                    background: "var(--color-warm-100)",
                    color: "var(--color-warm-600)",
                  }}
                >
                  Pendiente de sincronización
                </span>
              )}
            </div>
          </li>
        ))}
      </ul>

      <p
        className="mt-6 text-[12.5px]"
        style={{ color: "var(--color-warm-500)" }}
      >
        Las experiencias guiadas se administran aparte, en{" "}
        <Link
          href={`/dashboard/admin/experiencias/${params.bookSlug}`}
          style={{ color: "var(--color-lavender-600)" }}
        >
          Pulso · Experiencias
        </Link>
        .
      </p>
    </div>
  );
}
