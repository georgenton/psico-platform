import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { getSessionUser, isNextThrow, serverFetch } from "@/lib/api.server";
import type { BookState } from "../contracts";
import { BookStructurePanel } from "./BookStructurePanel";
import { CoverPanel } from "./CoverPanel";

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

      <BookStructurePanel
        bookSlug={params.bookSlug}
        chapters={state.chapters}
        editingRevisionId={state.editingRevisionId}
        draftRevisionId={state.draftRevisionId}
        draftRevisionNumber={state.draftRevisionNumber}
        changedUnitCount={state.changedUnitCount}
        changedTitles={changedTitles}
        structureChanged={state.structureChanged}
        chapterCreationAvailable={state.chapterCreationAvailable}
        reorderAvailable={state.reorderAvailable}
        reorderBlockedReason={state.reorderBlockedReason}
      />

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
