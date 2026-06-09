import Link from "next/link";
import type { TherapistListItem, TherapistSummary } from "@psico/types";

const COVER_TOKENS: Record<string, string> = {
  warm: "linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)",
  lavender: "linear-gradient(135deg, #e0e7ff 0%, #c7d2fe 100%)",
  cool: "linear-gradient(135deg, #cffafe 0%, #a5f3fc 100%)",
  mixed: "linear-gradient(135deg, #fce7f3 0%, #fbcfe8 100%)",
  sage: "linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%)",
};

export function TherapistCard({
  therapist,
  href,
}: {
  therapist: TherapistListItem | TherapistSummary;
  href: string;
}) {
  const cover =
    COVER_TOKENS[therapist.coverToken ?? "warm"] ?? COVER_TOKENS.warm;
  const isList = "isFavorite" in therapist;
  return (
    <Link
      href={href}
      className="block overflow-hidden rounded-2xl border-[1.5px] bg-white transition hover:border-[var(--color-lavender-400)]"
      style={{ borderColor: "var(--color-warm-200)" }}
    >
      <div className="h-20" style={{ background: cover }} aria-hidden />
      <div className="-mt-8 flex items-start gap-3 p-4">
        <div
          className="flex h-16 w-16 flex-none items-center justify-center rounded-full border-4 border-white text-lg font-semibold text-white"
          style={{ background: "var(--color-lavender-500)" }}
        >
          {therapist.initials}
        </div>
        <div className="flex-1 pt-1">
          <p
            className="text-[15px] font-semibold"
            style={{ color: "var(--color-warm-900)" }}
          >
            {therapist.name}
          </p>
          <p
            className="text-[12px]"
            style={{ color: "var(--color-warm-500)" }}
          >
            {therapist.title}
          </p>
          {isList && (therapist as TherapistListItem).bioShort ? (
            <p
              className="mt-1.5 text-[12px] leading-snug"
              style={{ color: "var(--color-warm-700)" }}
            >
              {(therapist as TherapistListItem).bioShort}
            </p>
          ) : null}
        </div>
      </div>
      <div
        className="flex items-center justify-between border-t px-4 py-3 text-[12px]"
        style={{
          borderColor: "var(--color-warm-100)",
          color: "var(--color-warm-700)",
        }}
      >
        <span>
          ⭐ {therapist.avgRating.toFixed(1)} ({therapist.reviewsCount})
        </span>
        <span className="font-semibold">
          ${therapist.priceUsd.toFixed(0)} {therapist.currency}
        </span>
      </div>
    </Link>
  );
}
