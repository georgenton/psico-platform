import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type {
  AuthorBookDetail,
  AuthorPublicationState,
} from "@psico/types";
import { getAccessToken, isNextThrow, serverFetch } from "@/lib/api.server";
import { BookMetaForm } from "./BookMetaForm";
import { PublicationCard } from "./PublicationCard";
import { ArchiveButton } from "./ArchiveButton";
import { CoverImageUpload } from "./CoverImageUpload";

const API_BASE = `${(process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001").replace(/\/$/, "")}/api`;

export const metadata: Metadata = { title: "Libro · Editor" };
export const dynamic = "force-dynamic";

export default async function AuthorBookPage({
  params,
}: {
  params: { id: string };
}) {
  let book: AuthorBookDetail | null = null;
  let pub: AuthorPublicationState | null = null;
  try {
    [book, pub] = await Promise.all([
      serverFetch<AuthorBookDetail>(`/autor/libros/${params.id}`, {
        cache: "no-store",
      }),
      serverFetch<AuthorPublicationState>(
        `/autor/libros/${params.id}/publicacion`,
        { cache: "no-store" },
      ),
    ]);
  } catch (e) {
    if (isNextThrow(e)) throw e;
    notFound();
  }
  if (!book) notFound();

  const isFrozen = book.status === "IN_REVIEW" || book.status === "ARCHIVED";

  return (
    <div className="space-y-6">
      <header>
        <Link
          href="/autor/dashboard"
          className="text-[12px] font-medium"
          style={{ color: "var(--color-warm-500)" }}
        >
          ← Mis libros
        </Link>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p
              className="text-[11px] font-bold uppercase tracking-[0.14em]"
              style={{ color: "var(--color-lavender-500)" }}
            >
              {book.status === "PUBLISHED"
                ? "Publicado"
                : book.status === "IN_REVIEW"
                  ? "En revisión"
                  : book.status === "ARCHIVED"
                    ? "Archivado"
                    : "Borrador"}
            </p>
            <h1
              className="mt-1 text-[28px] font-bold tracking-tight"
              style={{ color: "var(--color-warm-900)" }}
            >
              {book.title}
            </h1>
            {book.subtitle ? (
              <p
                className="mt-1 text-[13px]"
                style={{ color: "var(--color-warm-500)" }}
              >
                {book.subtitle}
              </p>
            ) : null}
          </div>
          {book.status !== "ARCHIVED" ? (
            <ArchiveButton bookId={book.id} />
          ) : null}
        </div>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[2fr_1fr]">
        <section className="space-y-6">
          <BookMetaForm book={book} disabled={isFrozen} />

          <article
            className="rounded-2xl border-[1.5px] bg-white p-5"
            style={{ borderColor: "var(--color-warm-200)" }}
          >
            <h2
              className="mb-3 text-[15px] font-bold tracking-tight"
              style={{ color: "var(--color-warm-900)" }}
            >
              Imagen de portada
            </h2>
            <CoverImageUpload
              bookId={book.id}
              currentUrl={book.coverArtUrl}
              disabled={isFrozen}
              apiBase={API_BASE}
              accessToken={getAccessToken() ?? ""}
            />
          </article>

          <article
            className="rounded-2xl border-[1.5px] bg-white p-5"
            style={{ borderColor: "var(--color-warm-200)" }}
          >
            <header className="flex items-center justify-between">
              <h2
                className="text-[15px] font-bold tracking-tight"
                style={{ color: "var(--color-warm-900)" }}
              >
                Capítulos
              </h2>
              <Link
                href={`/autor/libros/${book.id}/estructura`}
                className="text-[12px] font-medium hover:underline"
                style={{ color: "var(--color-lavender-700)" }}
              >
                Editar estructura
              </Link>
            </header>
            {book.structure.length === 0 ? (
              <p
                className="mt-3 text-[13px]"
                style={{ color: "var(--color-warm-500)" }}
              >
                Este libro aún no tiene capítulos.
              </p>
            ) : (
              <ol className="mt-3 space-y-1">
                {book.structure.map((c) => (
                  <li key={c.id}>
                    <Link
                      href={`/autor/libros/${book.id}/capitulos/${c.n}`}
                      className="flex items-center justify-between rounded-xl px-3 py-2 text-[13px] transition hover:bg-[var(--color-warm-50)]"
                      style={{ color: "var(--color-warm-800)" }}
                    >
                      <span className="flex items-center gap-3">
                        <span
                          className="inline-block w-6 text-right text-[11.5px] font-bold"
                          style={{ color: "var(--color-warm-400)" }}
                        >
                          {c.n}.
                        </span>
                        <span className="font-medium">
                          {c.title || `Capítulo ${c.n}`}
                        </span>
                        {c.isHidden ? (
                          <span
                            className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase"
                            style={{
                              background: "var(--color-warm-100)",
                              color: "var(--color-warm-500)",
                            }}
                          >
                            Oculto
                          </span>
                        ) : null}
                        {c.isLocked ? (
                          <span
                            className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase"
                            style={{
                              background: "var(--color-lavender-100)",
                              color: "var(--color-lavender-700)",
                            }}
                          >
                            Pro
                          </span>
                        ) : null}
                      </span>
                      <span
                        className="text-[11.5px]"
                        style={{ color: "var(--color-warm-400)" }}
                      >
                        Abrir →
                      </span>
                    </Link>
                  </li>
                ))}
              </ol>
            )}
          </article>
        </section>

        <aside>
          <PublicationCard bookId={book.id} publication={pub} />
        </aside>
      </div>
    </div>
  );
}
