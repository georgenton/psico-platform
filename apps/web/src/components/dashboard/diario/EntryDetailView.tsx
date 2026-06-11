"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { DiaryDetailResponse } from "@psico/types";
import { decryptString, encryptString } from "@psico/crypto";
import { DiaryKeyProvider, useDiaryKey } from "@/lib/crypto/diary-key-context";
import { UnlockGate } from "./UnlockGate";

const EXCERPT_MAX_CHARS = 280;

/**
 * EntryDetailView — wraps the detail in a DiaryKeyProvider so the same
 * UnlockGate / decryption flow as the list page applies.
 *
 * The Server Component page fetches the entry with full ciphertext + nonce
 * (the body, not just the excerpt). When the key is present, this client
 * component decrypts the body and renders it; otherwise the UnlockGate is
 * shown.
 *
 * Delete: simple confirm + DELETE /api/diario/entries/:id, then redirect
 * to /dashboard/diario. router.refresh() is not enough because we navigate
 * away — router.push handles that.
 */
export function EntryDetailView({
  detail,
  cryptoSalt,
  apiBase,
  token,
}: {
  detail: DiaryDetailResponse;
  cryptoSalt: string | null;
  apiBase: string;
  token: string | null;
}) {
  return (
    <DiaryKeyProvider cryptoSalt={cryptoSalt}>
      <EntryDetailInner detail={detail} apiBase={apiBase} token={token} />
    </DiaryKeyProvider>
  );
}

function EntryDetailInner({
  detail,
  apiBase,
  token,
}: {
  detail: DiaryDetailResponse;
  apiBase: string;
  token: string | null;
}) {
  const { key } = useDiaryKey();

  if (!key) {
    return (
      <div>
        <BreadcrumbBack />
        <UnlockGate />
      </div>
    );
  }

  return (
    <DecryptedDetail
      detail={detail}
      apiBase={apiBase}
      token={token}
      diaryKey={key}
    />
  );
}

function DecryptedDetail({
  detail,
  apiBase,
  token,
  diaryKey,
}: {
  detail: DiaryDetailResponse;
  apiBase: string;
  token: string | null;
  diaryKey: Uint8Array;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [deleting, startDelete] = useTransition();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [savedFlash, setSavedFlash] = useState(false);
  const [saving, startSave] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const decryption = useMemo(() => {
    try {
      return {
        ok: true as const,
        text: decryptString(
          {
            ciphertext: detail.entry.textCiphertext,
            nonce: detail.entry.textNonce,
          },
          diaryKey,
        ),
      };
    } catch {
      return { ok: false as const, text: null };
    }
  }, [detail.entry.textCiphertext, detail.entry.textNonce, diaryKey]);

  async function handleDelete() {
    if (!token) return;
    setError(null);
    startDelete(async () => {
      try {
        const res = await fetch(
          `${apiBase}/diario/entries/${encodeURIComponent(detail.entry.id)}`,
          { method: "DELETE", headers: { Authorization: `Bearer ${token}` } },
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        router.push("/dashboard/diario");
      } catch {
        setError("No pudimos borrar la entrada. Reintenta.");
      }
    });
  }

  function startEdit() {
    if (!decryption.ok) return;
    setDraft(decryption.text);
    setEditing(true);
    setError(null);
  }

  function cancelEdit() {
    setEditing(false);
    setDraft("");
    setError(null);
  }

  async function handleSave() {
    if (!token) return;
    const trimmed = draft.trim();
    if (trimmed.length < 1) {
      setError("La entrada no puede quedar vacía.");
      return;
    }
    setError(null);
    startSave(async () => {
      try {
        const body = encryptString(trimmed, diaryKey);
        const excerpt = encryptString(
          trimmed.slice(0, EXCERPT_MAX_CHARS),
          diaryKey,
        );
        const res = await fetch(
          `${apiBase}/diario/entries/${encodeURIComponent(detail.entry.id)}`,
          {
            method: "PATCH",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              textCiphertext: body.ciphertext,
              textNonce: body.nonce,
              excerptCiphertext: excerpt.ciphertext,
              excerptNonce: excerpt.nonce,
            }),
          },
        );
        if (!res.ok) {
          const txt = await res.text();
          throw new Error(txt || `HTTP ${res.status}`);
        }
        // Update local view + flash + close editor. We refresh server
        // state via router.refresh so related cards (and the list when
        // user navigates back) reload from source of truth.
        setEditing(false);
        setSavedFlash(true);
        setTimeout(() => setSavedFlash(false), 2500);
        router.refresh();
      } catch (e) {
        setError(
          e instanceof Error
            ? `No pudimos guardar: ${e.message}`
            : "No pudimos guardar los cambios.",
        );
      }
    });
  }

  const created =
    detail.entry.createdAt instanceof Date
      ? detail.entry.createdAt
      : new Date(detail.entry.createdAt);

  return (
    <div>
      <BreadcrumbBack />

      {/* Meta header */}
      <header className="mb-5 flex flex-wrap items-center gap-3 text-[12px]">
        <span
          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-semibold uppercase tracking-wider"
          style={{
            background: "var(--color-warm-100)",
            color: "var(--color-warm-700)",
          }}
        >
          {detail.entry.kind === "prompted"
            ? "Reflexión"
            : detail.entry.kind === "voz"
              ? "Voz"
              : "Libre"}
        </span>
        <span className="font-mono" style={{ color: "var(--color-warm-500)" }}>
          {created.toLocaleDateString("es-EC", {
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric",
          })}
          {" · "}
          {created.toLocaleTimeString("es-EC", {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
        <span
          className="inline-flex items-center gap-1.5"
          style={{ color: "var(--color-warm-600)" }}
        >
          <span
            aria-hidden
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{
              background:
                "linear-gradient(135deg, var(--color-lavender-300), var(--color-lavender-700))",
            }}
          />
          {detail.entry.mood[0].toUpperCase() + detail.entry.mood.slice(1)}
        </span>
      </header>

      {/* Prompt (if any) */}
      {detail.entry.promptText ? (
        <div
          className="mb-5 rounded-2xl p-4 text-[13px] italic"
          style={{
            background: "var(--color-lavender-50)",
            color: "var(--color-lavender-700)",
            border: "1.5px solid var(--color-lavender-100)",
          }}
        >
          ✎ {detail.entry.promptText}
        </div>
      ) : null}

      {/* Body — decrypted or failure or editing */}
      {decryption.ok && editing ? (
        <article
          className="rounded-2xl border-[1.5px] bg-white p-5"
          style={{ borderColor: "var(--color-lavender-300)" }}
        >
          <label className="block">
            <span
              className="mb-2 block text-[12px] font-bold uppercase tracking-[0.14em]"
              style={{ color: "var(--color-lavender-700)" }}
            >
              Editar entrada
            </span>
            <textarea
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={Math.max(8, Math.min(24, draft.split("\n").length + 1))}
              maxLength={20000}
              disabled={saving}
              className="w-full resize-y rounded-xl border-[1.5px] bg-white px-3 py-2 text-[15px] leading-relaxed outline-none"
              style={{
                borderColor: "var(--color-warm-200)",
                color: "var(--color-warm-800)",
              }}
            />
          </label>
          <p
            className="mt-2 text-right text-[11px]"
            style={{ color: "var(--color-warm-500)" }}
          >
            {draft.length.toLocaleString("es-EC")} / 20.000 caracteres ·
            cifrado en tu dispositivo antes de salir
          </p>
          <div className="mt-3 flex flex-wrap justify-end gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={cancelEdit}
              className="rounded-full px-4 py-2 text-[12.5px] font-medium"
              style={{
                background: "var(--color-warm-100)",
                color: "var(--color-warm-700)",
              }}
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={handleSave}
              className="rounded-full px-4 py-2 text-[12.5px] font-semibold disabled:opacity-50"
              style={{
                background: "var(--color-lavender-500)",
                color: "white",
              }}
            >
              {saving ? "Guardando…" : "Guardar cambios"}
            </button>
          </div>
        </article>
      ) : decryption.ok ? (
        <article
          className="rounded-2xl border-[1.5px] bg-white p-7"
          style={{ borderColor: "var(--color-warm-200)" }}
        >
          <p
            className="whitespace-pre-wrap text-[15px] leading-relaxed"
            style={{ color: "var(--color-warm-800)" }}
          >
            {decryption.text}
          </p>
          {savedFlash ? (
            <p
              className="mt-3 text-[11.5px] font-medium"
              style={{ color: "var(--color-sage-700)" }}
            >
              ✓ Cambios guardados
            </p>
          ) : null}
        </article>
      ) : (
        <div
          className="rounded-2xl border-[1.5px] p-6 text-center text-[13px]"
          style={{
            borderColor: "var(--color-warm-300)",
            background: "var(--color-warm-100)",
            color: "var(--color-warm-600)",
          }}
        >
          🔒 No pudimos descifrar esta entrada con tu clave actual. Puede haber
          sido cifrada con una contraseña anterior — usa el flow de recuperación
          con seed phrase (próximamente) para acceder.
        </div>
      )}

      {/* Tags */}
      {detail.entry.tags.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {detail.entry.tags.map((t) => (
            <span
              key={t}
              className="rounded-full px-3 py-1 text-[12px] font-semibold"
              style={{
                background: "var(--color-warm-100)",
                color: "var(--color-warm-600)",
              }}
            >
              #{t}
            </span>
          ))}
        </div>
      ) : null}

      {/* Related entry IDs (server-side, not decrypted; just IDs) */}
      {detail.relatedEntryIds.length > 0 ? (
        <div className="mt-7">
          <h3
            className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em]"
            style={{ color: "var(--color-warm-500)" }}
          >
            Entradas relacionadas
          </h3>
          <ul className="space-y-1.5">
            {detail.relatedEntryIds.map((id) => (
              <li key={id}>
                <Link
                  href={`/dashboard/diario/${id}`}
                  className="text-[13px] font-semibold underline-offset-2 hover:underline"
                  style={{ color: "var(--color-lavender-700)" }}
                >
                  Abrir entrada relacionada →
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* Actions */}
      <footer className="mt-8 flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/dashboard/diario"
          className="text-[13px] font-semibold underline-offset-2 hover:underline"
          style={{ color: "var(--color-warm-600)" }}
        >
          ← Volver al diario
        </Link>
        {confirming ? (
          <div className="flex flex-wrap items-center gap-2">
            <span
              className="text-[12px]"
              style={{ color: "var(--color-warm-700)" }}
            >
              ¿Borrar esta entrada para siempre?
            </span>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={deleting}
              className="rounded-lg px-3 py-2 text-[12px] font-semibold"
              style={{
                background: "var(--color-warm-100)",
                color: "var(--color-warm-700)",
              }}
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className="rounded-lg px-3 py-2 text-[12px] font-semibold text-white disabled:opacity-50"
              style={{ background: "var(--color-error-mobile, #e53e3e)" }}
            >
              {deleting ? "Borrando…" : "Sí, borrar"}
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {decryption.ok && !editing ? (
              <button
                type="button"
                onClick={startEdit}
                className="rounded-lg px-3 py-2 text-[12px] font-semibold"
                style={{
                  background: "var(--color-lavender-100)",
                  color: "var(--color-lavender-700)",
                }}
              >
                ✎ Editar
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => setConfirming(true)}
              disabled={editing}
              className="rounded-lg px-3 py-2 text-[12px] font-semibold disabled:opacity-50"
              style={{
                background: "var(--color-warm-100)",
                color: "var(--color-warm-700)",
              }}
            >
              🗑 Borrar entrada
            </button>
          </div>
        )}
      </footer>

      {error ? (
        <p
          className="mt-3 text-[12px]"
          style={{ color: "var(--color-error-text, #B91C1C)" }}
          role="alert"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}

function BreadcrumbBack() {
  return (
    <nav
      aria-label="Volver"
      className="mb-5 text-[12px]"
      style={{ color: "var(--color-warm-500)" }}
    >
      <Link
        href="/dashboard/diario"
        className="hover:underline"
        style={{ color: "var(--color-lavender-700)" }}
      >
        ← Diario
      </Link>
    </nav>
  );
}
