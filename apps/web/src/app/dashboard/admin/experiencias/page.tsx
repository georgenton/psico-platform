import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { BookListResponse } from "@psico/types";

import { getSessionUser, isNextThrow, serverFetch } from "@/lib/api.server";

export const metadata: Metadata = { title: "Pulso · Experiencias" };
export const dynamic = "force-dynamic";

/**
 * CMS V1 (#637) — step one of the vertical: the books an editor may open.
 *
 * The catalog read is the EXISTING `/books` endpoint, not a duplicate written
 * for the back-office. The only thing the CMS adds is what nothing else can
 * answer, and a list of books is not that.
 *
 * This administers experiences ON books. It does not author books: creating,
 * renaming or reordering chapters is #580, and doing it here would mean
 * untangling entitlement from several legacy identities first.
 */
export default async function AdminExperienceBooksPage() {
  // ADMIN-only. Defensive — the API enforces the same thing.
  const user = getSessionUser();
  if (!user || user.role !== "ADMIN") redirect("/dashboard");

  let books: BookListResponse | null = null;
  try {
    books = await serverFetch<BookListResponse>("/books");
  } catch (err) {
    if (isNextThrow(err)) throw err;
  }

  return (
    <div className="mx-auto max-w-[900px]">
      <header className="mb-6">
        <p
          className="mb-1 text-[11px] font-bold uppercase tracking-[0.6px]"
          style={{ color: "var(--color-lavender-500)" }}
        >
          Pulso · Admin
        </p>
        <h1
          className="text-[22px] font-bold tracking-tight"
          style={{ color: "var(--color-warm-900)" }}
        >
          Experiencias de capítulo
        </h1>
        <p
          className="mt-1.5 text-[13.5px]"
          style={{ color: "var(--color-warm-600)" }}
        >
          Elige un libro para ver sus capítulos y las experiencias guiadas que
          publican.
        </p>
      </header>

      {books === null || books.books.length === 0 ? (
        <p className="text-[13.5px]" style={{ color: "var(--color-warm-500)" }}>
          No pudimos cargar el catálogo.
        </p>
      ) : (
        <ul
          className="overflow-hidden rounded-2xl"
          style={{
            background: "#fff",
            border: "1px solid var(--color-warm-200)",
          }}
        >
          {books.books.map((book, i) => (
            <li
              key={book.id}
              style={{
                borderTop: i === 0 ? "none" : "1px solid var(--color-warm-100)",
              }}
            >
              <Link
                href={`/dashboard/admin/experiencias/${book.slug}`}
                className="flex items-center justify-between gap-4 px-5 py-4"
                data-testid={`admin-book-${book.slug}`}
              >
                <span className="min-w-0">
                  <span
                    className="block text-[14.5px] font-semibold"
                    style={{ color: "var(--color-warm-900)" }}
                  >
                    {book.title}
                  </span>
                  <span
                    className="block text-[12.5px]"
                    style={{ color: "var(--color-warm-500)" }}
                  >
                    {book.slug} · {book.chapters}{" "}
                    {book.chapters === 1 ? "capítulo" : "capítulos"}
                  </span>
                </span>
                <span
                  className="shrink-0 text-[13px] font-semibold"
                  style={{ color: "var(--color-lavender-600)" }}
                >
                  Abrir →
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
