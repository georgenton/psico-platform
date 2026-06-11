"use client";

import { useRef, useState } from "react";
import type { AuthorAudioBlock } from "@psico/types";

const ALLOWED_TYPES = [
  "audio/mpeg",
  "audio/mp3",
  "audio/mp4",
  "audio/m4a",
  "audio/x-m4a",
  "audio/wav",
  "audio/webm",
  "audio/ogg",
];
const MAX_BYTES = 50 * 1024 * 1024;

/**
 * AudioUpload — Sprint S71.C-uploads.
 *
 * Sube un audio multipart al capítulo. Server lo guarda en R2 y appendea
 * un bloque AUDIO al final del array de bloques. El cliente recibe el
 * bloque renderable y lo agrega al editor para que el autor lo vea en su
 * lugar.
 */
type Phase = "idle" | "uploading" | "error";

export function AudioUpload({
  bookId,
  chapterN,
  disabled,
  apiBase,
  accessToken,
  onUploaded,
}: {
  bookId: string;
  chapterN: number;
  disabled: boolean;
  apiBase: string;
  accessToken: string;
  onUploaded: (block: AuthorAudioBlock, version: number) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);

    if (!ALLOWED_TYPES.includes(file.type)) {
      setError("Formato no soportado. MP3, M4A, WAV, WEBM u OGG.");
      e.target.value = "";
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("El audio no puede pesar más de 50 MB.");
      e.target.value = "";
      return;
    }

    setPhase("uploading");
    try {
      const form = new FormData();
      form.append("file", file);
      const title = titleRef.current?.value.trim();
      if (title) form.append("title", title);

      const res = await fetch(
        `${apiBase}/autor/libros/${bookId}/capitulos/${chapterN}/audio`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}` },
          body: form,
        },
      );
      if (!res.ok) {
        const body = await res.text();
        throw new Error(body || `HTTP ${res.status}`);
      }
      const data = (await res.json()) as {
        block: AuthorAudioBlock;
        version: number;
      };
      onUploaded(data.block, data.version);
      if (titleRef.current) titleRef.current.value = "";
      setPhase("idle");
    } catch (e2) {
      setError(e2 instanceof Error ? e2.message : "No pudimos subir el audio.");
      setPhase("error");
    } finally {
      if (e.target) e.target.value = "";
    }
  }

  return (
    <div
      className="space-y-3 rounded-2xl border-[1.5px] p-4"
      style={{
        borderColor: "var(--color-warm-200)",
        background: "var(--color-warm-50)",
      }}
    >
      <header>
        <h3
          className="text-[13px] font-bold tracking-tight"
          style={{ color: "var(--color-warm-900)" }}
        >
          🎧 Subir audio del capítulo
        </h3>
        <p
          className="mt-1 text-[11.5px]"
          style={{ color: "var(--color-warm-500)" }}
        >
          Se añade como un bloque AUDIO al final del capítulo (luego puedes
          reordenarlo). MP3, M4A, WAV, WEBM u OGG — máx 50 MB.
        </p>
      </header>

      <label className="block">
        <span
          className="block text-[11.5px] font-medium"
          style={{ color: "var(--color-warm-700)" }}
        >
          Título del audio (opcional)
        </span>
        <input
          ref={titleRef}
          type="text"
          placeholder="Capítulo introductorio"
          maxLength={200}
          disabled={disabled || phase === "uploading"}
          className="mt-1 w-full rounded-lg border-[1.5px] bg-white px-2 py-1 text-[12.5px] outline-none"
          style={{ borderColor: "var(--color-warm-200)" }}
        />
      </label>

      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          accept=".mp3,.m4a,.wav,.webm,.ogg,audio/*"
          onChange={onPick}
          disabled={disabled || phase === "uploading"}
          className="hidden"
        />
        <button
          type="button"
          disabled={disabled || phase === "uploading"}
          onClick={() => inputRef.current?.click()}
          className="rounded-full px-3 py-1.5 text-[12px] font-semibold disabled:opacity-50"
          style={{
            background: "var(--color-lavender-500)",
            color: "white",
          }}
        >
          {phase === "uploading" ? "Subiendo…" : "Elegir archivo"}
        </button>
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
