"use client";

import { useRef, useState } from "react";
import type { UserMeResponse } from "@psico/types";

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = /^image\/(png|jpeg|webp|gif)$/i;

export function AvatarUploadCard({ me }: { me: UserMeResponse }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(
    me.user.avatarUrl ?? null,
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    if (!ALLOWED.test(file.type)) {
      setError("Formato no soportado. Usá PNG, JPG, WebP o GIF.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("La imagen pesa más de 5 MB. Probá una más liviana.");
      return;
    }
    setError(null);
    setPending(true);

    const form = new FormData();
    form.append("file", file);

    try {
      // POST as multipart to the API proxy. We pull token from cookies via
      // the Bearer header that serverFetch normally sets, but for file
      // uploads we route through our own /api/avatar route below.
      const res = await fetch("/api/avatar", {
        method: "POST",
        body: form,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message ?? "upload-failed");
      }
      const data = (await res.json()) as { avatarUrl: string };
      setAvatarUrl(data.avatarUrl);
    } catch (err) {
      setError(
        err instanceof Error && err.message.includes("5 MB")
          ? err.message
          : "No pudimos subir tu avatar. Reintenta.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <section
      className="rounded-2xl border-[1.5px] bg-white p-5"
      style={{ borderColor: "var(--color-warm-200)" }}
      data-testid="avatar-card"
    >
      <h2
        className="text-[14px] font-semibold"
        style={{ color: "var(--color-warm-900)" }}
      >
        Foto de perfil
      </h2>
      <p
        className="mt-0.5 text-[12px]"
        style={{ color: "var(--color-warm-500)" }}
      >
        PNG, JPG, WebP o GIF. Hasta 5 MB. Se reduce a un cuadrado.
      </p>

      <div className="mt-4 flex items-center gap-4">
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt="Tu avatar"
            className="h-16 w-16 rounded-full object-cover"
            data-testid="avatar-preview"
          />
        ) : (
          <div
            className="flex h-16 w-16 items-center justify-center rounded-full text-xl font-semibold text-white"
            style={{ background: "var(--color-lavender-500)" }}
            data-testid="avatar-placeholder"
          >
            {me.user.initials}
          </div>
        )}
        <div className="flex-1">
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="hidden"
            onChange={(e) => {
              const file = e.currentTarget.files?.[0];
              if (file) void handleFile(file);
              e.currentTarget.value = "";
            }}
            data-testid="avatar-input"
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={pending}
            className="rounded-xl border-[1.5px] bg-white px-3 py-1.5 text-[12px] font-medium disabled:opacity-50"
            style={{
              borderColor: "var(--color-warm-300)",
              color: "var(--color-warm-700)",
            }}
            data-testid="avatar-pick-btn"
          >
            {pending ? "Subiendo..." : avatarUrl ? "Cambiar" : "Subir imagen"}
          </button>
          {error ? (
            <p
              className="mt-2 text-[12px]"
              style={{ color: "var(--color-rose-600)" }}
              role="alert"
            >
              {error}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
