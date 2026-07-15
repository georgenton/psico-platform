"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  analyzeReflectionText,
  DIARY_MOODS,
  EXPLICIT_SELECTION_VERSION,
} from "@psico/types";
import type {
  CreateDiaryEntryRequest,
  DiaryMoodId,
  DiaryPromptOfTheDay,
} from "@psico/types";
import { encryptString } from "@psico/crypto";
import { useDiaryKey } from "@/lib/crypto/diary-key-context";
import { consumeVoiceHandoff } from "@/lib/voice/handoff";
import { textAnalysisConsent } from "@/lib/text-analysis-consent";

/**
 * ActiveComposer — runs when the diary key is unlocked.
 *
 * Flow:
 *   1. User picks mood + writes text.
 *   2. On submit: encryptString(text, diaryKey) → { ciphertext, nonce }.
 *   3. POST /api/reflexiones/entries with the cipher envelope + plain metadata.
 *   4. Router.refresh() so the Server Component re-fetches the new list.
 *
 * The plaintext NEVER goes on the wire. The encrypt call happens entirely
 * in the browser; the network payload is opaque base64url.
 *
 * Excerpt: we currently send only the body cipher. A separate excerpt
 * cipher would be a future optimization to avoid downloading + decrypting
 * full bodies on the list view.
 */
export function ActiveComposer({
  prompt,
  apiBase,
  token,
}: {
  prompt: DiaryPromptOfTheDay | null;
  apiBase: string;
  token: string | null;
}) {
  const { key, lock } = useDiaryKey();
  const router = useRouter();
  const [text, setText] = useState("");
  // PR-2B: no mood is picked by default. Never coerce to "ok"/neutral — a
  // reflexión saved without a pick has no mood, and the OU dynamics model must
  // only ever read moods the user actively selected.
  const [mood, setMood] = useState<DiaryMoodId | null>(null);
  const [submitting, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const moods = DIARY_MOODS;
  const todayLabel = new Date().toLocaleDateString("es-EC", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  // Sprint front-voz: if the user just came back from /dashboard/voz with
  // a transcribed text, pre-fill the composer. Only runs once per mount —
  // `consumeVoiceHandoff` clears the sessionStorage key on read.
  useEffect(() => {
    const handoff = consumeVoiceHandoff();
    if (handoff) {
      setText((prev) => (prev ? `${prev}\n\n${handoff.text}` : handoff.text));
    }
  }, []);

  async function handleSubmit() {
    if (!key || !text.trim() || !token) return;
    setError(null);
    startTransition(async () => {
      try {
        const trimmed = text.trim();
        const envelope = encryptString(trimmed, key);
        // Excerpt: first ~140 chars of plaintext, encrypted with a SEPARATE
        // nonce so the list view can render a preview without downloading
        // the full body. We always send it (even for short entries) — when
        // the body is shorter than 140 chars the excerpt equals the body.
        const excerptText =
          trimmed.length > 140
            ? `${trimmed.slice(0, 140).trimEnd()}…`
            : trimmed;
        const excerpt = encryptString(excerptText, key);
        const body: CreateDiaryEntryRequest = {
          kind: prompt ? "prompted" : "free",
          promptId: prompt?.id,
          textCiphertext: envelope.ciphertext,
          textNonce: envelope.nonce,
          excerptCiphertext: excerpt.ciphertext,
          excerptNonce: excerpt.nonce,
        };
        // PR-2B: only attach a mood when the user explicitly tapped one. A
        // tapped mood is eligible for the dynamics model, so we send the
        // attestation (`explicit-v1`) alongside it. No pick → omit BOTH
        // fields (sending the version without a mood is a 400).
        if (mood) {
          body.mood = mood;
          body.moodSelectionVersion = EXPLICIT_SELECTION_VERSION;
        }
        const res = await fetch(`${apiBase}/reflexiones/entries`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        // Etapa 6 — analyze the plaintext ON DEVICE and upload ONLY numbers
        // (the text itself never goes on the wire). Fase D (L4): requires the
        // user's explicit consent — without it we don't even analyze locally.
        // Best-effort: any failure here must not affect the save.
        try {
          const created = (await res.json().catch(() => null)) as {
            id?: string;
          } | null;
          if (await textAnalysisConsent(apiBase, token)) {
            const features = analyzeReflectionText(trimmed);
            if (features) {
              void fetch(`${apiBase}/emotional-map/text-features`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ ...features, entryId: created?.id }),
              }).catch(() => undefined);
            }
          }
        } catch {
          // ignore — self-knowledge signal is optional, the entry is saved
        }
        setText("");
        // Force the Server Component to re-fetch the list so the new entry
        // shows up immediately.
        router.refresh();
      } catch {
        setError("No pudimos guardar la entrada. Reintenta.");
      }
    });
  }

  return (
    <section
      className="rounded-2xl border-[1.5px] bg-white p-5"
      style={{ borderColor: "var(--color-warm-200)" }}
    >
      <div className="flex items-center justify-between text-[11.5px]">
        <div className="flex flex-wrap items-center gap-1.5">
          {moods.map((m) => {
            const active = m.id === mood;
            return (
              <button
                key={m.id}
                type="button"
                // PR-2B: tapping the active chip deselects it (back to no mood).
                onClick={() => setMood((prev) => (prev === m.id ? null : m.id))}
                aria-pressed={active}
                disabled={submitting}
                className="inline-flex items-center gap-1.5 rounded-full border-[1.5px] px-3 py-1 text-[11.5px] font-semibold transition-colors"
                style={
                  active
                    ? {
                        // warm-900 inverts to a light tone in the Noche
                        // ambient, so the active chip's text must invert with
                        // it (warm-50) — literal white would vanish on it.
                        background: "var(--color-warm-900)",
                        color: "var(--color-warm-50)",
                        borderColor: "var(--color-warm-900)",
                      }
                    : {
                        background: "var(--color-warm-50)",
                        color: "var(--color-warm-800)",
                        borderColor: "var(--color-warm-200)",
                      }
                }
              >
                <span>{m.emoji}</span>
                {m.label}
              </button>
            );
          })}
          {mood === null ? (
            <span
              className="text-[11px] italic"
              style={{ color: "var(--color-warm-500)" }}
            >
              Sin ánimo registrado
            </span>
          ) : null}
        </div>
        <span className="font-mono" style={{ color: "var(--color-warm-500)" }}>
          {todayLabel}
        </span>
      </div>

      <textarea
        rows={5}
        value={text}
        onChange={(e) => setText(e.target.value)}
        disabled={submitting}
        placeholder="¿Cómo llegas hoy? Escribe lo que necesites — nadie lo lee más que tú."
        className="mt-3 w-full resize-none rounded-xl border-[1.5px] bg-[var(--color-warm-50)] p-3 text-[14px] leading-relaxed outline-none focus:border-[var(--color-lavender-400)]"
        style={{
          borderColor: "var(--color-warm-200)",
          color: "var(--color-warm-800)",
        }}
      />

      {prompt ? (
        <div className="mt-3">
          <span
            className="text-[10.5px] font-bold uppercase tracking-[0.14em]"
            style={{ color: "var(--color-warm-500)" }}
          >
            Prompt del día
          </span>
          <button
            type="button"
            onClick={() =>
              setText((t) =>
                t ? `${t}\n\n${prompt.text}` : `${prompt.text}\n\n`,
              )
            }
            className="mt-1.5 block w-full rounded-xl border-[1.5px] bg-white px-3.5 py-2.5 text-left text-[12.5px] transition-colors hover:bg-[var(--color-warm-50)]"
            style={{
              borderColor: "var(--color-warm-200)",
              color: "var(--color-warm-800)",
            }}
          >
            ✎ {prompt.text}
          </button>
        </div>
      ) : null}

      {error ? (
        <p
          className="mt-2 text-[12px]"
          role="alert"
          style={{ color: "var(--color-error-text, #B91C1C)" }}
        >
          {error}
        </p>
      ) : null}

      <footer className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={lock}
            className="text-[11.5px] underline-offset-2 hover:underline"
            style={{ color: "var(--color-warm-500)" }}
          >
            🔒 Bloquear diario
          </button>
          {/* Sprint front-voz: voice-to-text entry point. */}
          <Link
            href="/dashboard/voz?return=/dashboard/reflexiones"
            className="inline-flex items-center gap-1.5 rounded-full border-[1.5px] px-3 py-1 text-[11.5px] font-semibold transition-colors hover:bg-[var(--color-warm-50)]"
            style={{
              borderColor: "var(--color-warm-200)",
              color: "var(--color-warm-700)",
            }}
            aria-label="Dictar entrada por voz"
          >
            🎙️ Dictar
          </Link>
        </div>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting || !text.trim()}
          className="inline-flex items-center gap-1.5 rounded-xl px-5 py-3 text-[13px] font-semibold text-white disabled:opacity-50"
          style={{ background: "var(--color-sage-400)" }}
        >
          {submitting ? "Cifrando…" : "✎ Guardar entrada"}
        </button>
      </footer>
    </section>
  );
}
