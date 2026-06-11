import type { Metadata } from "next";
import type { BookListResponse } from "@psico/types";

import { getAccessToken, serverFetch } from "@/lib/api.server";
import { BookCard } from "@/components/dashboard/biblioteca/BookCard";
import { Filters } from "@/components/dashboard/biblioteca/Filters";
import { Pagination } from "@/components/dashboard/biblioteca/Pagination";

export const metadata: Metadata = { title: "Mi biblioteca" };
export const dynamic = "force-dynamic";

const API_BASE = `${(process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001").replace(/\/$/, "")}/api`;

type SearchParams = {
  view?: string;
  categoryId?: string;
  authorId?: string;
  sort?: string;
  q?: string;
  page?: string;
};

export default async function BibliotecaPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const accessToken = getAccessToken();

  // Build the API query from URL params. We pass through only the keys the
  // backend accepts (see ListBooksQueryDto).
  const qs = new URLSearchParams();
  if (searchParams.view) qs.set("view", searchParams.view);
  if (searchParams.categoryId) qs.set("categoryId", searchParams.categoryId);
  if (searchParams.authorId) qs.set("authorId", searchParams.authorId);
  if (searchParams.sort) qs.set("sort", searchParams.sort);
  if (searchParams.q) qs.set("q", searchParams.q);
  if (searchParams.page) qs.set("page", searchParams.page);

  const path = qs.toString() ? `/books?${qs.toString()}` : "/books";
  const data = await serverFetch<BookListResponse>(path).catch(
    (): BookListResponse => ({
      books: [],
      pagination: { page: 1, perPage: 24, total: 0 },
      categories: [],
      authors: [],
    }),
  );

  const view = (searchParams.view ?? "catalogo") as
    | "catalogo"
    | "mis"
    | "recos"
    | "favoritos"
    | "guardados";
  const sectionTitle =
    view === "mis"
      ? "Mis libros"
      : view === "recos"
        ? "Sugerencias para ti"
        : view === "favoritos"
          ? "Tus favoritos"
          : view === "guardados"
            ? "Guardados para después"
            : "Todo el catálogo";

  return (
    <div className="mx-auto max-w-[1080px]">
      {/* Hero */}
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1
            className="text-[28px] font-bold leading-tight tracking-tight sm:text-[32px]"
            style={{ color: "var(--color-warm-900)" }}
          >
            Tu biblioteca
          </h1>
          <p
            className="mt-1.5 text-[14px] leading-relaxed"
            style={{ color: "var(--color-warm-500)" }}
          >
            {data.pagination.total === 0
              ? "Tu catálogo se está cargando — empieza por explorar."
              : `${data.pagination.total} libro${data.pagination.total === 1 ? "" : "s"} disponible${data.pagination.total === 1 ? "" : "s"}.`}
          </p>
        </div>
      </header>

      {/* Filters */}
      <Filters categories={data.categories} authors={data.authors} />

      {/* Section header */}
      <div className="mt-7 mb-3 flex items-baseline justify-between">
        <h2
          className="text-[12px] font-bold uppercase tracking-[0.14em]"
          style={{ color: "var(--color-warm-500)" }}
        >
          {sectionTitle}
        </h2>
        <span
          className="text-[11px]"
          style={{ color: "var(--color-warm-400)" }}
        >
          {data.books.length} resultado{data.books.length === 1 ? "" : "s"}
        </span>
      </div>

      {/* Grid */}
      {data.books.length === 0 ? (
        <EmptyResults view={view} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {data.books.map((book) => (
            <BookCard
              key={book.id}
              book={book}
              apiBase={API_BASE}
              token={accessToken}
            />
          ))}
        </div>
      )}

      <Pagination
        page={data.pagination.page}
        perPage={data.pagination.perPage}
        total={data.pagination.total}
      />
    </div>
  );
}

function EmptyResults({
  view,
}: {
  view: "catalogo" | "mis" | "recos" | "favoritos" | "guardados";
}) {
  const copy =
    view === "mis"
      ? {
          title: "Aún no has empezado ningún libro",
          sub: "Cuando abras tu primer capítulo, lo verás aquí.",
        }
      : view === "recos"
        ? {
            title: "Tus sugerencias están en camino",
            sub: "Lee algunas páginas y Eco aprenderá qué recomendarte.",
          }
        : view === "favoritos"
          ? {
              title: "Aún no tienes libros favoritos",
              sub: "Marca el corazón ❤️ en cualquier libro para que aparezca aquí.",
            }
          : view === "guardados"
            ? {
                title: "Aún no tienes libros guardados",
                sub: "Toca 📑 Guardar en un libro para leerlo más tarde.",
              }
            : {
                title: "No encontramos libros con esos filtros",
                sub: "Intenta sin filtros o cambia la búsqueda.",
              };
  return (
    <div
      className="rounded-2xl border-[1.5px] bg-white p-12 text-center"
      style={{ borderColor: "var(--color-warm-200)" }}
    >
      <h3
        className="text-[18px] font-bold leading-tight"
        style={{ color: "var(--color-warm-900)" }}
      >
        {copy.title}
      </h3>
      <p
        className="mx-auto mt-2 max-w-md text-[13px]"
        style={{ color: "var(--color-warm-500)" }}
      >
        {copy.sub}
      </p>
    </div>
  );
}
