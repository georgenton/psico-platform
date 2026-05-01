import Link from "next/link";
import type { Book } from "@psico/types";

const PLAN_LABEL: Record<string, string> = {
  FREE: "Gratuito",
  PRO: "Pro",
  ANNUAL: "Anual",
  B2B: "Empresa",
};

const COVER_GRADIENTS = [
  "linear-gradient(135deg, var(--color-lavender-400) 0%, var(--color-lavender-700) 100%)",
  "linear-gradient(135deg, var(--color-sage-400) 0%, var(--color-sage-700) 100%)",
  "linear-gradient(135deg, var(--color-lavender-300) 0%, var(--color-sage-500) 100%)",
];

export function BooksSection({ books }: { books: Book[] }) {
  return (
    <section
      id="libros"
      className="py-20 sm:py-24"
      style={{ background: "var(--color-lavender-50)" }}
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mb-14 text-center">
          <h2
            className="mb-4 text-3xl font-bold sm:text-4xl"
            style={{ color: "var(--color-warm-800)" }}
          >
            Libros disponibles
          </h2>
          <p className="text-lg" style={{ color: "var(--color-warm-500)" }}>
            Contenido creado por psicólogos para el contexto latinoamericano.
          </p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {books.map((book, i) => (
            <div
              key={book.id}
              className="flex flex-col overflow-hidden rounded-3xl"
              style={{ background: "white", boxShadow: "var(--shadow-card)" }}
            >
              {/* Cover placeholder */}
              <div
                className="flex h-44 items-center justify-center"
                style={{
                  background: COVER_GRADIENTS[i % COVER_GRADIENTS.length],
                }}
              >
                {book.coverUrl ? (
                  <img
                    src={book.coverUrl}
                    alt={book.title}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="text-5xl" role="img" aria-label="libro">
                    📖
                  </span>
                )}
              </div>

              {/* Content */}
              <div className="flex flex-1 flex-col p-6">
                {/* Plan badge */}
                <span
                  className="mb-3 self-start rounded-full px-3 py-0.5 text-xs font-semibold"
                  style={
                    book.plan === "FREE"
                      ? {
                          background: "var(--color-sage-100)",
                          color: "var(--color-sage-700)",
                        }
                      : {
                          background: "var(--color-lavender-100)",
                          color: "var(--color-lavender-700)",
                        }
                  }
                >
                  {PLAN_LABEL[book.plan] ?? book.plan}
                </span>

                <h3
                  className="mb-2 text-lg font-semibold"
                  style={{ color: "var(--color-warm-800)" }}
                >
                  {book.title}
                </h3>

                <p
                  className="mb-4 flex-1 text-sm leading-relaxed"
                  style={{ color: "var(--color-warm-500)" }}
                >
                  {book.description ??
                    "Contenido psicoeducativo para tu bienestar."}
                </p>

                <div className="flex items-center justify-between">
                  <span
                    className="text-xs"
                    style={{ color: "var(--color-warm-400)" }}
                  >
                    {book.totalChapters} capítulos
                  </span>
                  <Link
                    href="/register"
                    className="text-sm font-semibold transition-opacity hover:opacity-70"
                    style={{ color: "var(--color-lavender-600)" }}
                  >
                    Leer ahora →
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
