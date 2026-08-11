"use client";

import { useRef, useState } from "react";
import { assetUrl } from "@/lib/asset-url";

/**
 * One illustration, as the editor sees it.
 *
 * The alt field is marked required and left empty on a new image rather than
 * pre-filled with the filename. A plausible-looking default is worse than a
 * blank: it satisfies the check while telling a screen-reader user nothing, and
 * nobody ever goes back to fix a field that already looks done.
 *
 * Replacing the file swaps the URL in LOCAL state only. Like any other edit it
 * becomes real on save, and the previous object is left in storage — older
 * revisions still point at it, and an editor who changes their mind before
 * saving has not destroyed anything.
 */

interface Props {
  index: number;
  caption: string;
  meta: Record<string, unknown>;
  onCaptionChange: (value: string) => void;
  onMetaChange: (meta: Record<string, unknown>) => void;
  onUpload: (file: File) => Promise<string | null>;
}

const str = (v: unknown): string => (typeof v === "string" ? v : "");

export function ImageBlockRow({
  index,
  caption,
  meta,
  onCaptionChange,
  onMetaChange,
  onUpload,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [replacing, setReplacing] = useState(false);
  const [thumbnailFailed, setThumbnailFailed] = useState(false);

  const imageUrl = str(meta.imageUrl);
  const alt = str(meta.alt);
  const credit = str(meta.credit);
  const altMissing = !alt.trim();

  async function replace(file: File) {
    setReplacing(true);
    const url = await onUpload(file);
    setReplacing(false);
    if (url) {
      // A fresh upload deserves a fresh verdict; the previous failure was about
      // a different file.
      setThumbnailFailed(false);
      onMetaChange({ ...meta, imageUrl: url });
    }
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div className="flex flex-wrap gap-4">
      {imageUrl &&
        (thumbnailFailed ? (
          // An upload that stored bytes but cannot be displayed is exactly the
          // bug this row used to hide: a coloured rectangle looked like an image
          // that had simply not decoded, so an editor kept working and published
          // a chapter whose figure nobody could see. Say what happened.
          <div
            role="status"
            className="flex h-[110px] w-[150px] flex-col items-center justify-center rounded-lg px-2 text-center"
            style={{
              background: "var(--color-warm-100)",
              border: "1px dashed var(--color-rose-300, #fda4af)",
            }}
          >
            <span
              className="text-[11.5px] font-semibold"
              style={{ color: "var(--color-rose-700, #be123c)" }}
            >
              No pudimos mostrar esta imagen
            </span>
            <span
              className="mt-1 text-[10.5px] leading-tight"
              style={{ color: "var(--color-warm-600)" }}
            >
              Vuelve a subirla o avisa al equipo.
            </span>
          </div>
        ) : (
          // Decorative in the EDITOR: the alt field right beside it carries the
          // real description, and announcing a draft twice helps nobody.
          <img
            src={assetUrl(imageUrl)}
            alt=""
            onError={() => setThumbnailFailed(true)}
            className="h-[110px] w-[150px] rounded-lg object-cover"
            style={{ background: "var(--color-warm-100)" }}
          />
        ))}

      <div className="min-w-[240px] flex-1 space-y-2">
        <label className="block">
          <span
            className="text-[11.5px] font-semibold"
            style={{
              color: altMissing
                ? "var(--color-rose-600, #be123c)"
                : "var(--color-warm-600)",
            }}
          >
            Texto alternativo (obligatorio)
          </span>
          <input
            value={alt}
            onChange={(e) => onMetaChange({ ...meta, alt: e.target.value })}
            aria-label={`Texto alternativo de la imagen ${index + 1}`}
            aria-invalid={altMissing}
            placeholder="Qué muestra la imagen, para quien no puede verla"
            className="mt-1 w-full rounded-lg border px-3 py-2 text-[13.5px]"
            style={{
              borderColor: altMissing
                ? "var(--color-rose-400, #fb7185)"
                : "var(--color-warm-200)",
              color: "var(--color-warm-800)",
            }}
          />
        </label>

        <label className="block">
          <span
            className="text-[11.5px] font-semibold"
            style={{ color: "var(--color-warm-600)" }}
          >
            Pie de imagen (opcional)
          </span>
          <input
            value={caption}
            onChange={(e) => onCaptionChange(e.target.value)}
            aria-label={`Pie de la imagen ${index + 1}`}
            className="mt-1 w-full rounded-lg border px-3 py-2 text-[13.5px]"
            style={{
              borderColor: "var(--color-warm-200)",
              color: "var(--color-warm-800)",
            }}
          />
        </label>

        <label className="block">
          <span
            className="text-[11.5px] font-semibold"
            style={{ color: "var(--color-warm-600)" }}
          >
            Crédito (opcional)
          </span>
          <input
            value={credit}
            onChange={(e) => onMetaChange({ ...meta, credit: e.target.value })}
            aria-label={`Crédito de la imagen ${index + 1}`}
            className="mt-1 w-full rounded-lg border px-3 py-2 text-[13.5px]"
            style={{
              borderColor: "var(--color-warm-200)",
              color: "var(--color-warm-800)",
            }}
          />
        </label>

        <div>
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            aria-label={`Reemplazar la imagen ${index + 1}`}
            disabled={replacing}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void replace(f);
            }}
            className="block w-full text-[12.5px]"
          />
          <p
            className="mt-1 text-[12px]"
            style={{ color: "var(--color-warm-500)" }}
          >
            {replacing
              ? "Subiendo…"
              : "Reemplazar el archivo requiere guardar el borrador."}
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * Adding an image is upload-then-place: the file has to exist somewhere before
 * a block can point at it, but the block itself is local until saved.
 */
export function AddImageButton({
  onUpload,
  onUploaded,
}: {
  onUpload: (file: File) => Promise<string | null>;
  onUploaded: (imageUrl: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        aria-hidden
        tabIndex={-1}
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          setBusy(true);
          const url = await onUpload(file);
          setBusy(false);
          if (inputRef.current) inputRef.current.value = "";
          if (url) onUploaded(url);
        }}
      />
      <button
        type="button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        className="rounded-full px-3 py-1.5 text-[12.5px] font-semibold disabled:opacity-60"
        style={{
          background: "var(--color-warm-100)",
          color: "var(--color-warm-700)",
        }}
      >
        {busy ? "Subiendo…" : "+ Imagen"}
      </button>
    </>
  );
}
