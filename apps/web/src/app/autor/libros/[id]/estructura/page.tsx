import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { AuthorBookDetail } from "@psico/types";
import { isNextThrow, serverFetch } from "@/lib/api.server";
import { StructureEditor } from "./StructureEditor";

export const metadata: Metadata = { title: "Estructura · Editor" };
export const dynamic = "force-dynamic";

export default async function StructurePage({
  params,
}: {
  params: { id: string };
}) {
  let book: AuthorBookDetail | null = null;
  try {
    book = await serverFetch<AuthorBookDetail>(`/autor/libros/${params.id}`, {
      cache: "no-store",
    });
  } catch (e) {
    if (isNextThrow(e)) throw e;
    notFound();
  }
  if (!book) notFound();

  const isFrozen = book.status === "IN_REVIEW" || book.status === "ARCHIVED";

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
          Estructura
        </h1>
        <p
          className="mt-1 text-[13px]"
          style={{ color: "var(--color-warm-500)" }}
        >
          Reordena, renombra, oculta o elimina capítulos. Los cambios se aplican
          al guardar.
        </p>
      </header>

      <StructureEditor
        bookId={params.id}
        chapters={book.structure}
        disabled={isFrozen}
      />
    </div>
  );
}
