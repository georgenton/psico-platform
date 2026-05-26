import type { Metadata } from "next";
import Link from "next/link";
import type { Book, Subscription } from "@psico/types";

import { apiFetch, ApiError } from "@/lib/api";
import { serverFetch, getSessionUser } from "@/lib/api.server";

export const metadata: Metadata = { title: "Inicio" };

// ── Book card ──────────────────────────────────────────────────────────────

const COVER_GRADIENTS = [
  "linear-gradient(135deg, var(--color-lavender-400) 0%, var(--color-lavender-700) 100%)",
  "linear-gradient(135deg, var(--color-sage-400) 0%, var(--color-sage-700) 100%)",
  "linear-gradient(135deg, var(--color-lavender-300) 0%, var(--color-sage-500) 100%)",
];

function BookCard({
  book,
  index,
  locked,
}: {
  book: Book;
  index: number;
  locked: boolean;
}) {
  return (
    <div
      className="flex flex-col overflow-hidden rounded-3xl"
      style={{ background: "white", boxShadow: "var(--shadow-card)" }}
    >
      {/* Cover */}
      <div
        className="relative flex h-36 items-center justify-center"
        style={{ background: COVER_GRADIENTS[index % COVER_GRADIENTS.length] }}
      >
        <span className="text-4xl" role="img" aria-label="libro">
          📖
        </span>
        {locked && (
          <div
            className="absolute inset-0 flex items-center justify-center rounded-t-3xl"
            style={{ background: "rgba(0,0,0,0.35)" }}
          >
            <span className="text-3xl">🔒</span>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex flex-1 flex-col p-5">
        <h3
          className="mb-1 text-base font-semibold leading-snug"
          style={{ color: "var(--color-warm-800)" }}
        >
          {book.title}
        </h3>
        <p
          className="mb-4 flex-1 text-xs leading-relaxed"
          style={{ color: "var(--color-warm-500)" }}
        >
          {book.description ?? "Contenido psicoeducativo para tu bienestar."}
        </p>

        {/* TODO senior: replace hardcoded 0% with real progress from
            GET /content/progress once that endpoint is wired to this page */}
        <div className="mb-3">
          <div className="mb-1 flex items-center justify-between text-xs">
            <span style={{ color: "var(--color-warm-500)" }}>Progreso</span>
            <span
              className="font-medium"
              style={{ color: "var(--color-lavender-600)" }}
            >
              0%
            </span>
          </div>
          <div
            className="h-1.5 w-full overflow-hidden rounded-full"
            style={{ background: "var(--color-warm-200)" }}
          >
            <div
              className="h-full rounded-full"
              style={{
                width: "0%",
                background: "var(--color-lavender-400)",
              }}
            />
          </div>
        </div>

        {locked ? (
          <Link
            href="/dashboard/plan"
            className="block rounded-xl py-2 text-center text-xs font-semibold transition-opacity hover:opacity-80"
            style={{
              background: "var(--color-warm-100)",
              color: "var(--color-warm-600)",
            }}
          >
            Desbloquear con Pro →
          </Link>
        ) : (
          <Link
            href={`/dashboard/books/${book.slug}`}
            className="block rounded-xl py-2 text-center text-xs font-semibold transition-opacity hover:opacity-80"
            style={{
              background: "var(--color-lavender-100)",
              color: "var(--color-lavender-700)",
            }}
          >
            Empezar lectura →
          </Link>
        )}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────

export default async function DashboardPage() {
  const user = getSessionUser();

  const [books, subscription] = await Promise.all([
    // /content/books is public — no JWT needed
    apiFetch<Book[]>("/content/books").catch((err: unknown) => {
      console.error("[DashboardPage] Failed to fetch books:", err);
      return [] as Book[];
    }),
    serverFetch<Subscription>("/subscriptions/me").catch((err: unknown) => {
      // FREE users may not have a subscription record yet
      if (
        err instanceof ApiError &&
        (err.status === 404 || err.status === 401)
      ) {
        return null;
      }
      return null;
    }),
  ]);

  const userPlan = subscription?.plan ?? user?.plan ?? "FREE";
  const isFreePlan = userPlan === "FREE";

  const firstName = user?.email?.split("@")[0] ?? "Usuario";

  return (
    <div className="max-w-5xl">
      {/* Greeting */}
      <div className="mb-8">
        <h1
          className="text-2xl font-bold mb-1"
          style={{ color: "var(--color-warm-800)" }}
        >
          Hola, {firstName} 👋
        </h1>
        <p className="text-sm" style={{ color: "var(--color-warm-500)" }}>
          Continúa tu camino al bienestar emocional
        </p>
      </div>

      {/* Upgrade banner — only for FREE users */}
      {isFreePlan && (
        <div
          className="mb-8 flex flex-col gap-4 rounded-3xl p-6 sm:flex-row sm:items-center sm:justify-between"
          style={{
            background:
              "linear-gradient(135deg, var(--color-lavender-500) 0%, var(--color-lavender-800) 100%)",
          }}
        >
          <div>
            <h2 className="mb-1 text-lg font-bold" style={{ color: "white" }}>
              Desbloquea todo el contenido
            </h2>
            <p className="text-sm" style={{ color: "rgba(255,255,255,0.8)" }}>
              Actualiza a Pro por{" "}
              <strong style={{ color: "white" }}>$7/mes</strong> y accede a
              todos los libros, audios y la IA companion.
            </p>
          </div>
          <Link
            href="/dashboard/plan"
            className="btn-sage shrink-0"
            style={{ whiteSpace: "nowrap" }}
          >
            Actualizar a Pro →
          </Link>
        </div>
      )}

      {/* Books section */}
      <section>
        <h2
          className="mb-5 text-lg font-semibold"
          style={{ color: "var(--color-warm-800)" }}
        >
          Tus libros
        </h2>

        {books.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--color-warm-400)" }}>
            No hay libros disponibles por el momento.
          </p>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {books.map((book, i) => {
              // A book is locked if it requires PRO/ANNUAL and user is FREE
              const locked = book.plan !== "FREE" && isFreePlan;
              return (
                <BookCard key={book.id} book={book} index={i} locked={locked} />
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
