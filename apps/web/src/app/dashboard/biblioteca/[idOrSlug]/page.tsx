import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import type { BookDetailResponse } from "@psico/types";

import { ApiError } from "@/lib/api";
import { getAccessToken, getSessionUser, serverFetch } from "@/lib/api.server";
import { BookHero } from "@/components/dashboard/detalle/BookHero";
import { ChaptersList } from "@/components/dashboard/detalle/ChaptersList";
import { ReviewsSection } from "@/components/dashboard/detalle/ReviewsSection";

export const dynamic = "force-dynamic";

const API_BASE = `${(process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001").replace(/\/$/, "")}/api`;

type Params = { idOrSlug: string };

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  try {
    const detail = await serverFetch<BookDetailResponse>(
      `/books/${encodeURIComponent(params.idOrSlug)}`,
    );
    return {
      title: detail.book.title,
      description: detail.book.subtitle ?? detail.book.description ?? undefined,
    };
  } catch {
    return { title: "Libro" };
  }
}

export default async function BookDetailPage({ params }: { params: Params }) {
  const user = getSessionUser();
  const accessToken = getAccessToken();

  let detail: BookDetailResponse;
  try {
    detail = await serverFetch<BookDetailResponse>(
      `/books/${encodeURIComponent(params.idOrSlug)}`,
    );
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }

  const isFreePlan = (user?.plan ?? "FREE") === "FREE";
  const isLocked = detail.book.tierRequired === "pro" && isFreePlan;

  return (
    <div className="mx-auto max-w-[1080px]">
      {/* Breadcrumb */}
      <nav
        aria-label="Migajas"
        className="mb-5 text-[12px]"
        style={{ color: "var(--color-warm-500)" }}
      >
        <Link
          href="/dashboard/biblioteca"
          className="hover:underline"
          style={{ color: "var(--color-lavender-700)" }}
        >
          ← Biblioteca
        </Link>
      </nav>

      <BookHero
        book={detail.book}
        author={detail.author}
        userProgress={detail.userProgress}
        isLocked={isLocked}
        apiBase={API_BASE}
        token={accessToken}
        idOrSlug={params.idOrSlug}
      />

      {/* About */}
      {detail.book.summary || detail.book.description ? (
        <section className="mt-10">
          <h2
            className="mb-3 text-[12px] font-bold uppercase tracking-[0.14em]"
            style={{ color: "var(--color-warm-500)" }}
          >
            Sobre este libro
          </h2>
          <div
            className="rounded-2xl border-[1.5px] bg-white p-6"
            style={{ borderColor: "var(--color-warm-200)" }}
          >
            {detail.book.summary ? (
              <p
                className="text-[15px] leading-relaxed"
                style={{ color: "var(--color-warm-800)" }}
              >
                {detail.book.summary}
              </p>
            ) : null}
            {detail.book.description &&
            detail.book.description !== detail.book.summary ? (
              <p
                className="mt-3 text-[13.5px] leading-relaxed"
                style={{ color: "var(--color-warm-600)" }}
              >
                {detail.book.description}
              </p>
            ) : null}
          </div>
        </section>
      ) : null}

      {/* Chapters */}
      <div className="mt-10">
        <ChaptersList chapters={detail.chaptersList} />
      </div>

      {/* Reviews */}
      <div className="mt-10">
        <ReviewsSection
          rating={detail.rating}
          reviews={detail.reviews}
          userProgress={detail.userProgress}
        />
      </div>

      {/* Paywall block when locked */}
      {isLocked ? (
        <section className="mt-10">
          <div
            className="relative overflow-hidden rounded-2xl p-7 text-white"
            style={{
              background:
                "linear-gradient(135deg, var(--color-lavender-500), var(--color-lavender-800))",
            }}
          >
            <h3 className="text-[18px] font-bold leading-tight tracking-tight">
              Este libro está disponible con Pro
            </h3>
            <p
              className="mt-2 max-w-md text-[13px] leading-relaxed"
              style={{ color: "rgba(255,255,255,0.85)" }}
            >
              Por $7/mes accedes a todos los libros, audios guiados y Eco dentro
              del capítulo. Cancelas cuando quieras.
            </p>
            <Link
              href="/dashboard/plan"
              className="mt-4 inline-flex items-center gap-1.5 rounded-xl px-5 py-3 text-[13px] font-semibold text-white"
              style={{ background: "var(--color-sage-400)" }}
            >
              Hazte Pro →
            </Link>
          </div>
        </section>
      ) : null}
    </div>
  );
}
