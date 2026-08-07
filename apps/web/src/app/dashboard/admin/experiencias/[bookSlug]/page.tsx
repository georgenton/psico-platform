import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { BookDetailResponse } from "@psico/types";

import { getSessionUser, isNextThrow, serverFetch } from "@/lib/api.server";

export const metadata: Metadata = { title: "Pulso · Capítulos" };
export const dynamic = "force-dynamic";

/**
 * CMS V1 (#637) — the chapters of one book.
 *
 * Read-only navigation. No create, no delete, no reorder, no prose editing:
 * chapter authoring is #580 and needs Content Core structure work this vertical
 * deliberately does not touch.
 */
export default async function AdminExperienceChaptersPage({
  params,
}: {
  params: { bookSlug: string };
}) {
  const user = getSessionUser();
  if (!user || user.role !== "ADMIN") redirect("/dashboard");

  let detail: BookDetailResponse | null = null;
  try {
    detail = await serverFetch<BookDetailResponse>(
      `/books/${encodeURIComponent(params.bookSlug)}`,
    );
  } catch (err) {
    if (isNextThrow(err)) throw err;
  }

  const chapters = detail?.chaptersList ?? [];

  return (
    <div className="mx-auto max-w-[900px]">
      <header className="mb-6">
        <Link
          href="/dashboard/admin/experiencias"
          className="text-[12.5px]"
          style={{ color: "var(--color-lavender-600)" }}
        >
          ← Libros
        </Link>
        <h1
          className="mt-2 text-[22px] font-bold tracking-tight"
          style={{ color: "var(--color-warm-900)" }}
        >
          {detail?.book.title ?? params.bookSlug}
        </h1>
        <p
          className="mt-1.5 text-[13.5px]"
          style={{ color: "var(--color-warm-600)" }}
        >
          Elige un capítulo para ver su media y sus experiencias.
        </p>
      </header>

      {chapters.length === 0 ? (
        <p className="text-[13.5px]" style={{ color: "var(--color-warm-500)" }}>
          Este libro no tiene capítulos que podamos leer.
        </p>
      ) : (
        <ul
          className="overflow-hidden rounded-2xl"
          style={{
            background: "#fff",
            border: "1px solid var(--color-warm-200)",
          }}
        >
          {chapters.map((chapter, i) => (
            <li
              key={chapter.n}
              style={{
                borderTop: i === 0 ? "none" : "1px solid var(--color-warm-100)",
              }}
            >
              <Link
                href={`/dashboard/admin/experiencias/${params.bookSlug}/${chapter.n}`}
                className="flex items-center justify-between gap-4 px-5 py-4"
                data-testid={`admin-chapter-${chapter.n}`}
              >
                <span className="min-w-0">
                  <span
                    className="block text-[12px] font-bold uppercase tracking-[0.5px]"
                    style={{ color: "var(--color-warm-400)" }}
                  >
                    Capítulo {chapter.n}
                  </span>
                  <span
                    className="block text-[14.5px] font-semibold"
                    style={{ color: "var(--color-warm-900)" }}
                  >
                    {chapter.title}
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
