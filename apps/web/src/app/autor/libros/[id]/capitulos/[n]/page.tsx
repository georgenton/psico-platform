import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { AuthorBookChapter, AuthorBookDetail } from "@psico/types";
import { isNextThrow, serverFetch } from "@/lib/api.server";
import { ChapterEditor } from "./ChapterEditor";

export const metadata: Metadata = { title: "Capítulo · Editor" };
export const dynamic = "force-dynamic";

export default async function AuthorChapterPage({
  params,
}: {
  params: { id: string; n: string };
}) {
  const n = Number(params.n);
  if (!Number.isInteger(n) || n < 1) notFound();

  let book: AuthorBookDetail | null = null;
  let chapter: AuthorBookChapter | null = null;
  try {
    [book, chapter] = await Promise.all([
      serverFetch<AuthorBookDetail>(`/autor/libros/${params.id}`, {
        cache: "no-store",
      }),
      serverFetch<AuthorBookChapter>(
        `/autor/libros/${params.id}/capitulos/${n}`,
        { cache: "no-store" },
      ),
    ]);
  } catch (e) {
    if (isNextThrow(e)) throw e;
    notFound();
  }
  if (!book || !chapter) notFound();

  const isFrozen = book.status === "IN_REVIEW" || book.status === "ARCHIVED";
  const prev = n > 1 ? n - 1 : null;
  const next = book.structure.find((c) => c.n === n + 1) ? n + 1 : null;

  return (
    <div className="space-y-5">
      <header>
        <Link
          href={`/autor/libros/${params.id}`}
          className="text-[12px] font-medium"
          style={{ color: "var(--color-warm-500)" }}
        >
          ← {book.title}
        </Link>
        <h1
          className="mt-2 text-[24px] font-bold tracking-tight"
          style={{ color: "var(--color-warm-900)" }}
        >
          Capítulo {chapter.n}
        </h1>
      </header>

      <ChapterEditor
        bookId={params.id}
        chapter={chapter}
        disabled={isFrozen}
      />

      <nav className="flex items-center justify-between">
        {prev ? (
          <Link
            href={`/autor/libros/${params.id}/capitulos/${prev}`}
            className="text-[12.5px] font-medium hover:underline"
            style={{ color: "var(--color-warm-700)" }}
          >
            ← Capítulo {prev}
          </Link>
        ) : (
          <span />
        )}
        {next ? (
          <Link
            href={`/autor/libros/${params.id}/capitulos/${next}`}
            className="text-[12.5px] font-medium hover:underline"
            style={{ color: "var(--color-warm-700)" }}
          >
            Capítulo {next} →
          </Link>
        ) : null}
      </nav>
    </div>
  );
}
