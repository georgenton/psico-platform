import type { Metadata } from "next";
import Link from "next/link";
import type {
  TherapistDetail,
  TherapistReviewsResponse,
} from "@psico/types";
import { isNextThrow, serverFetch } from "@/lib/api.server";
import { FavoriteButton } from "@/components/dashboard/terapia/FavoriteButton";

export const metadata: Metadata = { title: "Terapeuta · Terapia" };
export const dynamic = "force-dynamic";

const COVER_TOKENS: Record<string, string> = {
  warm: "linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)",
  lavender: "linear-gradient(135deg, #e0e7ff 0%, #c7d2fe 100%)",
  cool: "linear-gradient(135deg, #cffafe 0%, #a5f3fc 100%)",
  mixed: "linear-gradient(135deg, #fce7f3 0%, #fbcfe8 100%)",
  sage: "linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%)",
};

const DAYS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

export default async function TherapistDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  let therapist: TherapistDetail | null = null;
  let reviews: TherapistReviewsResponse | null = null;
  let loadError: string | null = null;
  try {
    [therapist, reviews] = await Promise.all([
      serverFetch<TherapistDetail>(`/terapia/therapists/${id}`),
      serverFetch<TherapistReviewsResponse>(
        `/terapia/therapists/${id}/reviews?page=1&pageSize=5`,
      ),
    ]);
  } catch (err) {
    if (isNextThrow(err)) throw err;
    loadError = err instanceof Error ? err.message : "Error desconocido";
  }

  if (!therapist) {
    return (
      <div className="mx-auto max-w-3xl">
        <Link
          href="/dashboard/terapia/terapeutas"
          className="text-[13px]"
          style={{ color: "var(--color-lavender-700)" }}
        >
          ← Volver al directorio
        </Link>
        <div
          className="mt-4 rounded-2xl border-[1.5px] bg-white p-6 text-[13px]"
          style={{
            borderColor: "var(--color-rose-200)",
            color: "var(--color-rose-700)",
          }}
        >
          {loadError ?? "Terapeuta no encontrado."}
        </div>
      </div>
    );
  }

  const cover = COVER_TOKENS[therapist.coverToken] ?? COVER_TOKENS.warm;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        href="/dashboard/terapia/terapeutas"
        className="text-[13px]"
        style={{ color: "var(--color-lavender-700)" }}
      >
        ← Volver al directorio
      </Link>

      <div
        className="overflow-hidden rounded-2xl border-[1.5px] bg-white"
        style={{ borderColor: "var(--color-warm-200)" }}
      >
        <div className="h-28" style={{ background: cover }} aria-hidden />
        <div className="-mt-10 px-5 pb-5">
          <div className="flex items-end gap-4">
            <div
              className="flex h-20 w-20 flex-none items-center justify-center rounded-full border-4 border-white text-xl font-semibold text-white"
              style={{ background: "var(--color-lavender-500)" }}
            >
              {therapist.initials}
            </div>
            <div className="flex-1 pb-2">
              <h1
                className="text-[22px] font-bold"
                style={{ color: "var(--color-warm-900)" }}
              >
                {therapist.name}
              </h1>
              <p
                className="text-[13px]"
                style={{ color: "var(--color-warm-700)" }}
              >
                {therapist.title}
              </p>
            </div>
            <FavoriteButton
              therapistId={therapist.id}
              initial={therapist.isFavorite}
            />
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3 text-[13px]">
            <span
              className="rounded-full px-2.5 py-1 font-medium"
              style={{
                background: "var(--color-warm-50)",
                color: "var(--color-warm-700)",
              }}
            >
              ⭐ {therapist.avgRating.toFixed(1)} ({therapist.reviewsCount} reseñas)
            </span>
            <span style={{ color: "var(--color-warm-700)" }}>
              ${therapist.priceUsd.toFixed(0)} {therapist.currency} / sesión
            </span>
            {therapist.licenseVerified ? (
              <span
                style={{ color: "var(--color-sage-700)" }}
                className="text-[12px] font-medium"
              >
                ✓ Licencia verificada
              </span>
            ) : null}
          </div>

          <p
            className="mt-4 text-[14px] leading-relaxed"
            style={{ color: "var(--color-warm-700)" }}
          >
            {therapist.bioLong ?? therapist.bioShort}
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            {therapist.specialties.map((s) => (
              <span
                key={s}
                className="rounded-full px-3 py-1 text-[11px] font-medium"
                style={{
                  background: "var(--color-lavender-50)",
                  color: "var(--color-lavender-700)",
                }}
              >
                {s}
              </span>
            ))}
          </div>

          <div className="mt-5 flex gap-2">
            <Link
              href={`/dashboard/terapia/reservar/${therapist.id}`}
              className="rounded-xl px-4 py-2 text-[13px] font-medium text-white"
              style={{ background: "var(--color-lavender-600)" }}
            >
              Reservar primera sesión
            </Link>
          </div>
        </div>
      </div>

      {/* Approach + policies */}
      {therapist.approach || therapist.firstSessionPolicy ? (
        <section
          className="rounded-2xl border-[1.5px] bg-white p-5"
          style={{ borderColor: "var(--color-warm-200)" }}
        >
          {therapist.approach ? (
            <div className="mb-3">
              <p
                className="text-[12px] font-semibold uppercase tracking-wide"
                style={{ color: "var(--color-warm-500)" }}
              >
                Enfoque
              </p>
              <p
                className="mt-1 text-[13px]"
                style={{ color: "var(--color-warm-700)" }}
              >
                {therapist.approach}
              </p>
            </div>
          ) : null}
          {therapist.firstSessionPolicy ? (
            <div className="mb-3">
              <p
                className="text-[12px] font-semibold uppercase tracking-wide"
                style={{ color: "var(--color-warm-500)" }}
              >
                Primera sesión
              </p>
              <p
                className="mt-1 text-[13px]"
                style={{ color: "var(--color-warm-700)" }}
              >
                {therapist.firstSessionPolicy}
              </p>
            </div>
          ) : null}
          {therapist.cancellationPolicy ? (
            <div>
              <p
                className="text-[12px] font-semibold uppercase tracking-wide"
                style={{ color: "var(--color-warm-500)" }}
              >
                Cancelación
              </p>
              <p
                className="mt-1 text-[13px]"
                style={{ color: "var(--color-warm-700)" }}
              >
                {therapist.cancellationPolicy}
              </p>
            </div>
          ) : null}
        </section>
      ) : null}

      {/* Availability */}
      {therapist.availability.length > 0 ? (
        <section
          className="rounded-2xl border-[1.5px] bg-white p-5"
          style={{ borderColor: "var(--color-warm-200)" }}
        >
          <p
            className="text-[12px] font-semibold uppercase tracking-wide"
            style={{ color: "var(--color-warm-500)" }}
          >
            Horarios habituales ({therapist.availability[0]?.timezone})
          </p>
          <div className="mt-3 grid gap-2 text-[12px] sm:grid-cols-2">
            {therapist.availability.map((a, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between rounded-xl px-3 py-2"
                style={{ background: "var(--color-warm-50)" }}
              >
                <span style={{ color: "var(--color-warm-700)" }}>
                  {DAYS[a.dayOfWeek]}
                </span>
                <span
                  className="font-mono"
                  style={{ color: "var(--color-warm-900)" }}
                >
                  {formatMin(a.startMin)} – {formatMin(a.endMin)}
                </span>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* Reviews */}
      {reviews && reviews.items.length > 0 ? (
        <section>
          <p
            className="mb-2 text-[12px] font-semibold uppercase tracking-wide"
            style={{ color: "var(--color-warm-500)" }}
          >
            Reseñas
          </p>
          <ul className="space-y-2">
            {reviews.items.map((r) => (
              <li
                key={r.id}
                className="rounded-2xl border-[1.5px] bg-white p-4"
                style={{ borderColor: "var(--color-warm-200)" }}
              >
                <div className="flex items-center justify-between">
                  <span
                    className="text-[12px] font-semibold"
                    style={{ color: "var(--color-warm-900)" }}
                  >
                    {r.userInitials}
                  </span>
                  <span className="text-[12px]">⭐ {r.rating}</span>
                </div>
                {r.text ? (
                  <p
                    className="mt-2 text-[13px]"
                    style={{ color: "var(--color-warm-700)" }}
                  >
                    {r.text}
                  </p>
                ) : null}
                {r.tags.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {r.tags.map((t) => (
                      <span
                        key={t}
                        className="rounded-full px-2 py-0.5 text-[10px]"
                        style={{
                          background: "var(--color-warm-50)",
                          color: "var(--color-warm-700)",
                        }}
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function formatMin(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}
