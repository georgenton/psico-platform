import type {
  BookRating,
  BookReviewSummary,
  BookUserProgressSummary,
} from "@psico/types";

/**
 * ReviewsSection — average + breakdown + first 5 reviews.
 *
 * Mirrors the rating breakdown and reviews block from
 * docs/design/detalle/web.jsx. The "Escribir reseña" CTA is enabled only
 * when the user has completed the book (`userProgress?.completedAt != null`)
 * — backend enforces the same rule but UX-wise we don't even show the
 * button as enabled otherwise.
 *
 * The write modal is intentionally deferred (it needs a client-side form
 * with rating + textarea, and is its own user testing surface). For S5-front
 * we expose the button disabled with a tooltip explaining when it'll unlock.
 */
export function ReviewsSection({
  rating,
  reviews,
  userProgress,
}: {
  rating: BookRating;
  reviews: BookReviewSummary[];
  userProgress: BookUserProgressSummary | null;
}) {
  const canReview = userProgress?.completedAt != null;

  return (
    <section>
      <div className="mb-3 flex items-baseline justify-between">
        <h2
          className="text-[12px] font-bold uppercase tracking-[0.14em]"
          style={{ color: "var(--color-warm-500)" }}
        >
          Reseñas
        </h2>
        <button
          type="button"
          disabled={!canReview}
          title={
            canReview
              ? "Escribir reseña"
              : "Termina el libro para escribir una reseña"
          }
          className="rounded-full px-3 py-1.5 text-[12px] font-semibold disabled:opacity-50"
          style={{
            background: canReview
              ? "var(--color-lavender-100)"
              : "var(--color-warm-100)",
            color: canReview
              ? "var(--color-lavender-700)"
              : "var(--color-warm-500)",
          }}
        >
          ✎ Escribir reseña
        </button>
      </div>

      <div className="grid gap-5 lg:grid-cols-[260px_1fr]">
        {/* Rating summary */}
        <div
          className="rounded-2xl border-[1.5px] bg-white p-5"
          style={{ borderColor: "var(--color-warm-200)" }}
        >
          <div className="flex items-baseline gap-2">
            <span
              className="text-[36px] font-bold leading-none"
              style={{ color: "var(--color-warm-900)" }}
            >
              {rating.avg > 0 ? rating.avg.toFixed(1) : "—"}
            </span>
            <span style={{ color: "var(--color-warm-400)" }}>/ 5</span>
          </div>
          <div
            className="mt-1 text-[12px]"
            style={{ color: "var(--color-warm-500)" }}
          >
            {rating.count} reseña{rating.count === 1 ? "" : "s"}
          </div>
          <div className="mt-4 space-y-1.5">
            {([5, 4, 3, 2, 1] as const).map((star) => {
              const count = rating.breakdown[star];
              const pct =
                rating.count > 0 ? Math.round((count / rating.count) * 100) : 0;
              return (
                <div key={star} className="flex items-center gap-2 text-[11px]">
                  <span
                    className="w-3 font-mono"
                    style={{ color: "var(--color-warm-500)" }}
                  >
                    {star}
                  </span>
                  <span aria-hidden style={{ color: "var(--color-warm-400)" }}>
                    ★
                  </span>
                  <div
                    className="h-1.5 flex-1 overflow-hidden rounded-full"
                    style={{ background: "var(--color-warm-200)" }}
                  >
                    <div
                      className="h-full"
                      style={{
                        width: `${pct}%`,
                        background: "var(--color-lavender-400)",
                      }}
                    />
                  </div>
                  <span
                    className="w-7 text-right font-mono"
                    style={{ color: "var(--color-warm-500)" }}
                  >
                    {count}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Reviews list */}
        <div className="flex flex-col gap-3">
          {reviews.length === 0 ? (
            <div
              className="rounded-2xl border-[1.5px] bg-white p-6 text-center text-[13px]"
              style={{
                borderColor: "var(--color-warm-200)",
                color: "var(--color-warm-500)",
              }}
            >
              Aún no hay reseñas. Sé el primero en compartir cómo te resonó.
            </div>
          ) : (
            reviews.map((r) => <ReviewCard key={r.id} review={r} />)
          )}
        </div>
      </div>
    </section>
  );
}

function ReviewCard({ review }: { review: BookReviewSummary }) {
  const date = (
    review.createdAt instanceof Date
      ? review.createdAt
      : new Date(review.createdAt)
  ).toLocaleDateString("es-EC", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  return (
    <article
      className="rounded-2xl border-[1.5px] bg-white p-5"
      style={{ borderColor: "var(--color-warm-200)" }}
    >
      <header className="flex items-center gap-3">
        <span
          className="inline-flex h-9 w-9 items-center justify-center rounded-full text-[12px] font-bold text-white"
          style={{ background: "var(--color-lavender-500)" }}
          aria-hidden
        >
          {review.userInitials}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span
              className="text-[11px]"
              style={{ color: "var(--color-warm-500)" }}
            >
              {review.userCity ?? "Lector"} · {date}
            </span>
          </div>
          <div
            className="mt-0.5 inline-flex gap-0.5 text-[13px]"
            aria-label={`Calificación ${review.rating} de 5`}
          >
            {[1, 2, 3, 4, 5].map((i) => (
              <span
                key={i}
                style={{
                  color:
                    i <= review.rating
                      ? "var(--color-lavender-500)"
                      : "var(--color-warm-200)",
                }}
              >
                ★
              </span>
            ))}
          </div>
        </div>
      </header>
      <p
        className="mt-3 text-[13.5px] leading-relaxed"
        style={{ color: "var(--color-warm-700)" }}
      >
        {review.text}
      </p>
    </article>
  );
}
