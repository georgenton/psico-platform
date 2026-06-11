import type { Metadata } from "next";
import Link from "next/link";
import type { AuthorDashboardResponse } from "@psico/types";
import { isNextThrow, serverFetch } from "@/lib/api.server";
import { NewBookButton } from "./NewBookButton";

export const metadata: Metadata = { title: "Editor de autor · Dashboard" };
export const dynamic = "force-dynamic";

function formatDate(d: Date | string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("es-EC", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function statusLabel(status: string): { label: string; bg: string; fg: string } {
  switch (status) {
    case "DRAFT":
      return {
        label: "Borrador",
        bg: "var(--color-warm-100)",
        fg: "var(--color-warm-700)",
      };
    case "IN_REVIEW":
      return {
        label: "En revisión",
        bg: "var(--color-lavender-100)",
        fg: "var(--color-lavender-700)",
      };
    case "PUBLISHED":
      return {
        label: "Publicado",
        bg: "var(--color-sage-100)",
        fg: "var(--color-sage-700)",
      };
    case "ARCHIVED":
      return {
        label: "Archivado",
        bg: "var(--color-warm-100)",
        fg: "var(--color-warm-500)",
      };
    default:
      return { label: status, bg: "white", fg: "var(--color-warm-700)" };
  }
}

export default async function AuthorDashboardPage() {
  let data: AuthorDashboardResponse | null = null;
  let error: string | null = null;
  try {
    data = await serverFetch<AuthorDashboardResponse>("/autor/dashboard", {
      cache: "no-store",
    });
  } catch (e) {
    if (isNextThrow(e)) throw e;
    error = e instanceof Error ? e.message : "No pudimos cargar tus libros.";
  }

  if (!data) {
    return (
      <p
        className="rounded-2xl border-[1.5px] bg-white p-6 text-[13px]"
        style={{
          borderColor: "var(--color-warm-200)",
          color: "var(--color-warm-500)",
        }}
      >
        {error ?? "No pudimos cargar el dashboard."}
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p
            className="text-[11px] font-bold uppercase tracking-[0.14em]"
            style={{ color: "var(--color-lavender-500)" }}
          >
            Editor de autor · {data.author.tier === "pro-autor" ? "Pro" : "Free"}
          </p>
          <h1
            className="mt-1 text-[28px] font-bold tracking-tight"
            style={{ color: "var(--color-warm-900)" }}
          >
            Hola, {data.author.name}
          </h1>
          <p
            className="mt-1 text-[13px]"
            style={{ color: "var(--color-warm-500)" }}
          >
            Crea, edita y envía tus libros a revisión.
          </p>
        </div>
        <NewBookButton />
      </header>

      {data.books.length === 0 ? (
        <div
          className="rounded-2xl border-[1.5px] bg-white p-10 text-center"
          style={{ borderColor: "var(--color-warm-200)" }}
        >
          <p
            className="text-[15px] font-medium"
            style={{ color: "var(--color-warm-700)" }}
          >
            Todavía no tienes libros.
          </p>
          <p
            className="mx-auto mt-2 max-w-[420px] text-[13px]"
            style={{ color: "var(--color-warm-500)" }}
          >
            Empieza con un nuevo libro y agrega 3 capítulos para poder enviarlo
            a revisión.
          </p>
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.books.map((b) => {
            const status = statusLabel(b.status);
            return (
              <li key={b.id}>
                <Link
                  href={`/autor/libros/${b.id}`}
                  className="block rounded-2xl border-[1.5px] bg-white p-5 transition hover:border-[var(--color-lavender-400)]"
                  style={{ borderColor: "var(--color-warm-200)" }}
                >
                  <span
                    className="inline-block rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide"
                    style={{ background: status.bg, color: status.fg }}
                  >
                    {status.label}
                  </span>
                  <h2
                    className="mt-2 line-clamp-2 text-[16px] font-bold tracking-tight"
                    style={{ color: "var(--color-warm-900)" }}
                  >
                    {b.title}
                  </h2>
                  {b.subtitle ? (
                    <p
                      className="mt-1 line-clamp-2 text-[12.5px]"
                      style={{ color: "var(--color-warm-500)" }}
                    >
                      {b.subtitle}
                    </p>
                  ) : null}
                  <dl
                    className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11.5px]"
                    style={{ color: "var(--color-warm-600)" }}
                  >
                    <div className="flex gap-1">
                      <dt>Capítulos:</dt>
                      <dd className="font-medium">{b.chapters}</dd>
                    </div>
                    <div className="flex gap-1">
                      <dt>Editado:</dt>
                      <dd>{formatDate(b.lastEditedAt)}</dd>
                    </div>
                  </dl>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
