"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { DiaryDetailResponse } from "@psico/types";
import { decryptString, encryptString } from "@psico/crypto";
import { DiaryKeyProvider, useDiaryKey } from "@/lib/crypto/diary-key-context";
import { UnlockGate } from "./UnlockGate";

const EXCERPT_MAX_CHARS = 280;
const TAGS_MAX = 12;
const TAG_MAX_CHARS = 32;
const MOODS: Array<{ id: string; emoji: string; label: string }> = [
  { id: "calma", emoji: "😌", label: "Calma" },
  { id: "foco", emoji: "🎯", label: "Foco" },
  { id: "energia", emoji: "✨", label: "Energía" },
  { id: "reflexion", emoji: "🕊", label: "Reflexión" },
  { id: "alegria", emoji: "😊", label: "Alegría" },
  { id: "ansiedad", emoji: "😟", label: "Ansiedad" },
  { id: "tristeza", emoji: "😔", label: "Tristeza" },
];

function normalizeTag(raw: string): string | null {
  const cleaned = raw.trim().replace(/^#+/, "").toLowerCase();
  if (!cleaned) return null;
  if (cleaned.length > TAG_MAX_CHARS) return null;
  return cleaned;
}

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
  const [draftMood, setDraftMood] = useState<string>(detail.entry.mood);
  const [draftTags, setDraftTags] = useState<string[]>(detail.entry.tags);
  const [tagDraft, setTagDraft] = useState("");
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
    setDraftMood(detail.entry.mood);
    setDraftTags(detail.entry.tags);
    setTagDraft("");
    setEditing(true);
    setError(null);
  }

  function cancelEdit() {
    setEditing(false);
    setDraft("");
    setTagDraft("");
    setError(null);
  }

  function commitTag(raw: string) {
    const cleaned = normalizeTag(raw);
    if (!cleaned) return;
    if (draftTags.includes(cleaned)) {
      setTagDraft("");
      return;
    }
    if (draftTags.length >= TAGS_MAX) return;
    setDraftTags([...draftTags, cleaned]);
    setTagDraft("");
  }

  function removeTag(t: string) {
    setDraftTags(draftTags.filter((x) => x !== t));
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
        const payload: Record<string, unknown> = {
          textCiphertext: body.ciphertext,
          textNonce: body.nonce,
          excerptCiphertext: excerpt.ciphertext,
          excerptNonce: excerpt.nonce,
        };
        if (draftMood !== detail.entry.mood) payload.mood = draftMood;
        // Send tags array whenever the user changed it (even to empty).
        const tagsChanged =
          draftTags.length !== detail.entry.tags.length ||
          draftTags.some((t, i) => t !== detail.entry.tags[i]);
        if (tagsChanged) payload.tags = draftTags;
        const res = await fetch(
          `${apiBase}/diario/entries/${encodeURIComponent(detail.entry.id)}`,
          {
            method: "PATCH",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
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
            {draft.length.toLocaleString("es-EC")} / 20.000 caracteres · cifrado
            en tu dispositivo antes de salir
          </p>

          {/* Mood selector */}
          <div className="mt-4">
            <span
              className="mb-2 block text-[11.5px] font-bold uppercase tracking-[0.12em]"
              style={{ color: "var(--color-lavender-700)" }}
            >
              Mood
            </span>
            <div
              className="flex flex-wrap gap-1.5"
              role="radiogroup"
              aria-label="Mood"
            >
              {MOODS.map((m) => {
                const active = m.id === draftMood;
                return (
                  <button
                    key={m.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    disabled={saving}
                    onClick={() => setDraftMood(m.id)}
                    className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-semibold"
                    style={{
                      background: active
                        ? "var(--color-lavender-100)"
                        : "var(--color-warm-50)",
                      borderColor: active
                        ? "var(--color-lavender-400)"
                        : "var(--color-warm-200)",
                      color: active
                        ? "var(--color-lavender-700)"
                        : "var(--color-warm-700)",
                    }}
                  >
                    <span aria-hidden>{m.emoji}</span>
                    <span>{m.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Tags */}
          <div className="mt-4">
            <span
              className="mb-2 block text-[11.5px] font-bold uppercase tracking-[0.12em]"
              style={{ color: "var(--color-lavender-700)" }}
            >
              Etiquetas
            </span>
            <div className="flex flex-wrap items-center gap-1.5">
              {draftTags.map((t) => (
                <span
                  key={t}
                  className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-semibold"
                  style={{
                    background: "var(--color-warm-100)",
                    color: "var(--color-warm-700)",
                  }}
                >
                  #{t}
                  <button
                    type="button"
                    aria-label={`Quitar ${t}`}
                    disabled={saving}
                    onClick={() => removeTag(t)}
                    className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full text-[11px] font-bold leading-none"
                    style={{
                      background: "var(--color-warm-200)",
                      color: "var(--color-warm-700)",
                    }}
                  >
                    ×
                  </button>
                </span>
              ))}
              {draftTags.length < TAGS_MAX ? (
                <input
                  type="text"
                  value={tagDraft}
                  onChange={(e) => setTagDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === ",") {
                      e.preventDefault();
                      commitTag(tagDraft);
                    } else if (
                      e.key === "Backspace" &&
                      tagDraft.length === 0 &&
                      draftTags.length > 0
                    ) {
                      removeTag(draftTags[draftTags.length - 1]);
                    }
                  }}
                  onBlur={() => {
                    if (tagDraft.trim()) commitTag(tagDraft);
                  }}
                  disabled={saving}
                  placeholder="añadir etiqueta…"
                  maxLength={TAG_MAX_CHARS}
                  className="rounded-full border-[1.5px] bg-white px-2.5 py-1 text-[12px] outline-none"
                  style={{
                    borderColor: "var(--color-warm-200)",
                    color: "var(--color-warm-800)",
                  }}
                  aria-label="Añadir etiqueta"
                />
              ) : null}
            </div>
            <p
              className="mt-1 text-[11px]"
              style={{ color: "var(--color-warm-500)" }}
            >
              {draftTags.length}/{TAGS_MAX} · Enter o coma para añadir
            </p>
          </div>

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

      {/* Tags — hidden in edit mode (chips live inside the editor) */}
      {!editing && detail.entry.tags.length > 0 ? (
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
