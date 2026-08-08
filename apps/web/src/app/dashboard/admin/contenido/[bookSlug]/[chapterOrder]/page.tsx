import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { getSessionUser, isNextThrow, serverFetch } from "@/lib/api.server";
import type { BookState, ChapterContent } from "../../contracts";
import { ChapterEditor } from "./ChapterEditor";
import { MediaSection } from "./MediaSection";

export const metadata: Metadata = { title: "Pulso · Editar capítulo" };
export const dynamic = "force-dynamic";

/**
 * The chapter editor's shell.
 *
 * The load happens here so the editor opens with real text rather than a
 * spinner, and so the concurrency token is fixed at the moment the page was
 * rendered — which is exactly what the token is supposed to mean.
 */
export default async function ContentStudioChapterPage({
  params,
}: {
  params: { bookSlug: string; chapterOrder: string };
}) {
  const user = getSessionUser();
  if (!user || user.role !== "ADMIN") redirect("/dashboard");

  const order = Number.parseInt(params.chapterOrder, 10);
  if (!Number.isFinite(order)) notFound();

  let chapter: ChapterContent | null = null;
  let book: BookState | null = null;
  try {
    [chapter, book] = await Promise.all([
      serverFetch<ChapterContent>(
        `/pulso/content/books/${encodeURIComponent(params.bookSlug)}/chapters/${order}`,
      ),
      serverFetch<BookState>(
        `/pulso/content/books/${encodeURIComponent(params.bookSlug)}`,
      ),
    ]);
  } catch (err) {
    if (isNextThrow(err)) throw err;
    notFound();
  }
  if (!chapter) notFound();

  return (
    <>
      <ChapterEditor
        bookSlug={params.bookSlug}
        chapterOrder={order}
        bookTitle={book?.book.title ?? "Contenido editorial"}
        initial={chapter}
      />
      {/* Media sits beside the text, not inside the editor: it has its own
          lifecycle and its own publish, and mixing the two would suggest one
          "Guardar borrador" covers both. */}
      <div className="mx-auto max-w-[860px]">
        <MediaSection bookSlug={params.bookSlug} chapterOrder={order} />
      </div>
    </>
  );
}
