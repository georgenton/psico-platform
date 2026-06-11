"use client";

import { useRef, useState } from "react";

/**
 * CoverImageUpload — Sprint S71.C-uploads.
 *
 * Componente independiente para subir la portada del libro. Reemplaza
 * `AuthorBook.coverArtUrl` en una sola llamada multipart.
 *
 * Multipart no se hace vía server action porque Next.js no soporta File
 * en server actions de forma nativa — el cliente hace fetch directo al
 * backend con el JWT del usuario.
 */
type Phase = "idle" | "uploading" | "error";

export function CoverImageUpload({
  bookId,
  currentUrl,
  disabled,
  apiBase,
  accessToken,
  onUploaded,
}: {
  bookId: string;
  currentUrl: string | null;
  disabled: boolean;
  apiBase: string;
  accessToken: string;
  onUploaded?: (url: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [url, setUrl] = useState<string | null>(currentUrl);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);

    if (file.size > 5 * 1024 * 1024) {
      setError("La imagen no puede pesar más de 5 MB.");
      e.target.value = "";
      return;
    }
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("Solo JPG, PNG o WebP.");
      e.target.value = "";
      return;
    }

    setPhase("uploading");
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`${apiBase}/autor/libros/${bookId}/cover-image`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: form,
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(body || `HTTP ${res.status}`);
      }
      const data = (await res.json()) as { coverArtUrl: string };
      setUrl(data.coverArtUrl);
      onUploaded?.(data.coverArtUrl);
      setPhase("idle");
    } catch (e2) {
      setError(e2 instanceof Error ? e2.message : "No pudimos subir la imagen.");
      setPhase("error");
    } finally {
      if (e.target) e.target.value = "";
    }
  }

  return (
    <div className="space-y-2">
      <span
        className="block text-[12px] font-medium"
        style={{ color: "var(--color-warm-700)" }}
      >
        Imagen de portada (opcional, sobreescribe el gradient)
      </span>
      <div className="flex flex-wrap items-center gap-3">
        {url ? (
          <img
            src={url}
            alt="Portada actual"
            className="h-24 w-16 rounded-lg object-cover"
            style={{
              border: "1.5px solid var(--color-warm-200)",
              background: "var(--color-warm-50)",
            }}
          />
        ) : (
          <div
            className="flex h-24 w-16 items-center justify-center rounded-lg text-[10px]"
            style={{
              border: "1.5px dashed var(--color-warm-300)",
              color: "var(--color-warm-500)",
            }}
          >
            Sin imagen
          </div>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={onPick}
          disabled={disabled || phase === "uploading"}
          className="hidden"
        />
        <div className="flex flex-col gap-1">
          <button
            type="button"
            disabled={disabled || phase === "uploading"}
            onClick={() => inputRef.current?.click()}
            className="rounded-full px-3 py-1.5 text-[12px] font-semibold transition disabled:opacity-50"
            style={{
              background: "var(--color-lavender-500)",
              color: "white",
            }}
          >
            {phase === "uploading" ? "Subiendo…" : url ? "Cambiar imagen" : "Subir imagen"}
          </button>
          <span
            className="text-[10.5px]"
            style={{ color: "var(--color-warm-500)" }}
          >
            JPG, PNG, WebP — máx 5 MB
          </span>
        </div>
      </div>
      {error ? (
        <p
          className="text-[11.5px]"
          style={{ color: "var(--color-rose-700)" }}
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
