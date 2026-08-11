"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { uploadCoverAction } from "../actions";
import { assetUrl } from "@/lib/asset-url";

/**
 * The catalog cover.
 *
 * Deliberately NOT called "Guardar borrador". A cover is metadata about the
 * book, not a block inside a chapter — it has no revision to belong to, so it
 * takes effect the moment it uploads. Labelling it like an editorial save would
 * imply a draft that does not exist and a publish step that will never come.
 */
export function CoverPanel({
  bookSlug,
  bookTitle,
  coverArtUrl,
}: {
  bookSlug: string;
  bookTitle: string;
  coverArtUrl: string | null;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function upload() {
    if (!file) return;
    setPending(true);
    setError(null);
    const form = new FormData();
    form.append("file", file);
    const result = await uploadCoverAction(bookSlug, form);
    setPending(false);
    if (result.ok) {
      setFile(null);
      setDone(true);
      if (inputRef.current) inputRef.current.value = "";
      router.refresh();
      return;
    }
    setError(result.error ?? "No pudimos actualizar la portada.");
  }

  return (
    <section
      className="mb-5 rounded-2xl border px-5 py-4"
      style={{
        borderColor: "var(--color-warm-200)",
        background: "var(--color-warm-50)",
      }}
    >
      <h2
        className="text-[11px] font-bold uppercase tracking-[0.6px]"
        style={{ color: "var(--color-warm-500)" }}
      >
        Portada del catálogo
      </h2>

      <div className="mt-3 flex flex-wrap items-start gap-4">
        {coverArtUrl ? (
          // Decorative here: the book's title is right beside it, so announcing
          // the image again would only repeat what a reader already has.
          <img
            src={assetUrl(coverArtUrl)}
            alt=""
            className="h-[132px] w-[92px] rounded-lg object-cover"
            style={{ background: "var(--color-warm-100)" }}
          />
        ) : (
          <div
            aria-hidden
            className="flex h-[132px] w-[92px] items-center justify-center rounded-lg text-[11px]"
            style={{
              background:
                "linear-gradient(140deg, var(--color-lavender-200), var(--color-sage-200))",
              color: "var(--color-warm-700)",
            }}
          >
            Sin portada
          </div>
        )}

        <div className="min-w-[220px] flex-1">
          <p className="text-[13px]" style={{ color: "var(--color-warm-600)" }}>
            Se aplica de inmediato al catálogo. No forma parte del borrador del
            libro.
          </p>
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            aria-label={`Elegir portada para ${bookTitle}`}
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setDone(false);
              setError(null);
            }}
            className="mt-3 block w-full text-[13px]"
          />
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={upload}
              disabled={!file || pending}
              className="rounded-full px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-50"
              style={{ background: "var(--color-lavender-600)" }}
            >
              {pending ? "Subiendo…" : "Actualizar portada"}
            </button>
            {done && (
              <span
                role="status"
                className="text-[13px] font-semibold"
                style={{ color: "var(--color-sage-700)" }}
              >
                Portada actualizada
              </span>
            )}
            {error && (
              <span role="alert" className="text-[13px] text-red-700">
                {error}
              </span>
            )}
          </div>
          <p
            className="mt-2 text-[12px]"
            style={{ color: "var(--color-warm-500)" }}
          >
            JPG, PNG o WebP · hasta 5 MB.
          </p>
        </div>
      </div>
    </section>
  );
}
