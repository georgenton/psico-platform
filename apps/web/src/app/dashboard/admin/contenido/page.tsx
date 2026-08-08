import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getSessionUser, isNextThrow, serverFetch } from "@/lib/api.server";
import type { BookList } from "./contracts";

export const metadata: Metadata = { title: "Pulso · Contenido" };
export const dynamic = "force-dynamic";

/**
 * Content Studio — the books an editor may open.
 *
 * The list comes from the studio endpoint rather than the public `/books`
 * because it answers something the catalog cannot: how many chapters a book has
 * to edit. It stops there. Creating or reordering books is not this vertical.
 */
export default async function ContentStudioBooksPage() {
  // ADMIN-only. Defensive — the API enforces the same thing.
  const user = getSessionUser();
  if (!user || user.role !== "ADMIN") redirect("/dashboard");

  let data: BookList | null = null;
  try {
    data = await serverFetch<BookList>("/pulso/content/books");
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
          Contenido editorial
        </h1>
        <p
          className="mt-1.5 text-[13.5px]"
          style={{ color: "var(--color-warm-600)" }}
        >
          Edita el texto de los capítulos. Los cambios quedan en un borrador del
          libro y nadie los ve hasta que publicas.
        </p>
      </header>

      {data === null || data.books.length === 0 ? (
        <p className="text-[13.5px]" style={{ color: "var(--color-warm-500)" }}>
          No pudimos cargar el catálogo.
        </p>
      ) : (
        <ul className="space-y-3">
          {data.books.map((b) => (
            <li
              key={b.slug}
              className="flex items-center justify-between gap-4 rounded-2xl border px-5 py-4"
              style={{
                borderColor: "var(--color-warm-200)",
                background: "var(--color-warm-50)",
              }}
            >
              <div className="min-w-0">
                <h2
                  className="truncate text-[15px] font-bold"
                  style={{ color: "var(--color-warm-900)" }}
                >
                  {b.title}
                </h2>
                {b.subtitle && (
                  <p
                    className="truncate text-[13px]"
                    style={{ color: "var(--color-warm-600)" }}
                  >
                    {b.subtitle}
                  </p>
                )}
                <p
                  className="mt-1 text-[12px]"
                  style={{ color: "var(--color-warm-500)" }}
                >
                  {b.authorName ?? "Sin autor"} · {b.totalChapters}{" "}
                  {b.totalChapters === 1 ? "capítulo" : "capítulos"} · {b.plan}
                  {b.isPublished ? "" : " · no publicado"}
                </p>
              </div>
              <Link
                href={`/dashboard/admin/contenido/${b.slug}`}
                className="shrink-0 rounded-full px-4 py-2 text-[13px] font-semibold"
                style={{
                  background: "var(--color-lavender-100)",
                  color: "var(--color-lavender-700)",
                }}
              >
                Editar contenido
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
