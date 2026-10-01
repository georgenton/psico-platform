"use client";

import { useRef, useState } from "react";
import type { UserMeResponse } from "@psico/types";
import { assetUrl } from "@/lib/asset-url";

const MAX_BYTES = 5 * 1024 * 1024;
/**
 * No GIF. The API accepts PNG, JPEG and WebP — the same set as Content Studio
 * and `/autor` — so offering GIF here would send a file the server refuses.
 *
 * Nothing that worked is lost: avatars used to be stored as a URL into the
 * private bucket that no browser could load, so a GIF avatar never displayed
 * either. It just failed later and more quietly.
 */
const ALLOWED = /^image\/(png|jpeg|webp)$/i;

export function AvatarUploadCard({ me }: { me: UserMeResponse }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(
    me.user.avatarUrl ?? null,
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    if (!ALLOWED.test(file.type)) {
      setError("Formato no soportado. Usa PNG, JPG o WebP.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("La imagen pesa más de 5 MB. Prueba con una más ligera.");
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
        PNG, JPG o WebP. Hasta 5 MB. Se reduce a un cuadrado.
      </p>

      <div className="mt-4 flex items-center gap-4">
        {avatarUrl ? (
          <img
            // The API returns a path on itself (`/api/content-assets/...`) that
            // redirects to a short-lived signed GET, because the bucket is
            // private. Rendering it raw would resolve against THIS origin and
            // 404; `assetUrl` puts it back on the API. Absolute values — a
            // Google sign-in picture, say — pass through untouched.
            src={assetUrl(avatarUrl)}
            alt="Tu avatar"
            className="h-16 w-16 rounded-full object-cover"
            data-testid="avatar-preview"
          />
        ) : (
          <div
            // Mismo monograma que en la cabecera del perfil y, hasta ahora,
            // mismo 3.24:1. Aquí además pesa semibold a 20 px, que no llega a
            // «texto grande», así que su umbral era 4.5 y medía 3.63:1.
            className="flex h-16 w-16 items-center justify-center rounded-full text-xl font-semibold"
            style={{
              background: "var(--bg-brand-strong)",
              color: "var(--fg-on-brand)",
            }}
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
              style={{ color: "var(--color-rose-700)" }}
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
