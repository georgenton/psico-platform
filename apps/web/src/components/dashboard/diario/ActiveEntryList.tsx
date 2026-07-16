"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { DiaryEntrySummary } from "@psico/types";
import { decryptString } from "@psico/crypto";
import { useDiaryKey } from "@/lib/crypto/diary-key-context";

/**
 * ActiveEntryList — decrypts excerpts client-side using the diary key.
 *
 * Strategy:
 *   - Entries from the server carry `excerptCiphertext` + `excerptNonce`
 *     (may be null for entries with no excerpt).
 *   - On mount we try to decrypt every excerpt. Successful decrypt → render
 *     the preview text. Failure → "Cifrado con otra clave" (the entry was
 *     written before a password change, or the entry is corrupted).
 *   - We do NOT fetch the full body on the list view — that's a per-entry
 *     click-to-expand future feature.
 *
 * The decrypt is memoized so re-renders (e.g. toggling tags) don't re-run
 * the AEAD verify.
 */
export function ActiveEntryList({ entries }: { entries: DiaryEntrySummary[] }) {
  const { key } = useDiaryKey();
  const [expanded, setExpanded] = useState<string | null>(null);

  const decrypted = useMemo(() => {
    if (!key) return new Map<string, string | null>();
    const out = new Map<string, string | null>();
    for (const e of entries) {
      if (!e.excerptCiphertext || !e.excerptNonce) {
        out.set(e.id, null);
        continue;
      }
      try {
        out.set(
          e.id,
          decryptString(
            {
              ciphertext: e.excerptCiphertext,
              nonce: e.excerptNonce,
            },
            key,
          ),
        );
      } catch {
        out.set(e.id, null);
      }
    }
    return out;
  }, [entries, key]);

  if (entries.length === 0) {
    return (
      <div
        className="rounded-2xl border-[1.5px] bg-white p-10 text-center"
        style={{ borderColor: "var(--color-warm-200)" }}
      >
        <div
          aria-hidden
          className="mx-auto flex h-14 w-14 items-center justify-center rounded-full text-[22px]"
          style={{ background: "var(--color-lavender-50)" }}
        >
          ✎
        </div>
        <h2
          className="mt-4 text-[18px] font-bold leading-tight"
          style={{ color: "var(--color-warm-900)" }}
        >
          Tu primera entrada empieza aquí
        </h2>
        <p
          className="mx-auto mt-1.5 max-w-md text-[13px] leading-relaxed"
          style={{ color: "var(--color-warm-500)" }}
        >
          Anota lo que sientes, sin pulir. Tu diario es privado — solo tú lo
          lees.
        </p>
      </div>
    );
  }

  return (
    <ol className="flex flex-col gap-3">
      {entries.map((entry) => (
        <li key={entry.id}>
          <EntryCard
            entry={entry}
            decryptedExcerpt={decrypted.get(entry.id) ?? null}
            expanded={expanded === entry.id}
            onToggle={() =>
              setExpanded((prev) => (prev === entry.id ? null : entry.id))
            }
          />
        </li>
      ))}
    </ol>
  );
}

function EntryCard({
  entry,
  decryptedExcerpt,
  expanded,
  onToggle,
}: {
  entry: DiaryEntrySummary;
  decryptedExcerpt: string | null;
  expanded: boolean;
  onToggle: () => void;
}) {
  const date = (
    entry.createdAt instanceof Date
      ? entry.createdAt
      : new Date(entry.createdAt)
  ).toLocaleDateString("es-EC", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  const time = (
    entry.createdAt instanceof Date
      ? entry.createdAt
      : new Date(entry.createdAt)
  ).toLocaleTimeString("es-EC", { hour: "2-digit", minute: "2-digit" });

  const kindLabel =
    entry.kind === "prompted"
      ? "Reflexión"
      : entry.kind === "voz"
        ? "Voz"
        : "Libre";

  return (
    <article
      className="rounded-2xl border-[1.5px] bg-white p-5 transition-all hover:border-[var(--color-lavender-300)]"
      style={{ borderColor: "var(--color-warm-200)" }}
    >
      <Link
        href={`/dashboard/reflexiones/${entry.id}`}
        className="block no-underline"
        aria-label={`Abrir entrada del ${date}`}
      >
        <header className="flex flex-wrap items-center gap-3 text-[11.5px]">
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-semibold uppercase tracking-wider"
            style={{
              background: "var(--color-warm-100)",
              color: "var(--color-warm-700)",
            }}
          >
            {kindLabel}
          </span>
          <span
            className="font-mono"
            style={{ color: "var(--color-warm-500)" }}
          >
            {date} · {time}
          </span>
          {entry.mood ? (
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
              {entry.mood[0].toUpperCase() + entry.mood.slice(1)}
            </span>
          ) : (
            // PR-2B: an entry with no explicit mood pick — never fabricate one.
            <span className="italic" style={{ color: "var(--color-warm-500)" }}>
              Sin ánimo registrado
            </span>
          )}
        </header>

        {entry.promptText ? (
          <div
            className="mt-3 rounded-lg px-3 py-2 text-[12.5px] italic"
            style={{
              background: "var(--color-lavender-50)",
              color: "var(--color-lavender-700)",
            }}
          >
            ✎ {entry.promptText}
          </div>
        ) : null}

        {/* Decrypted excerpt or fallback */}
        {decryptedExcerpt ? (
          <p
            className="mt-3 text-[13.5px] leading-relaxed"
            style={{ color: "var(--color-warm-800)" }}
          >
            {expanded
              ? decryptedExcerpt
              : decryptedExcerpt.length > 180
                ? `${decryptedExcerpt.slice(0, 180)}…`
                : decryptedExcerpt}
          </p>
        ) : (
          <div
            className="mt-3 rounded-lg border border-dashed p-3 text-[12px]"
            style={{
              borderColor: "var(--color-warm-300)",
              color: "var(--color-warm-500)",
            }}
          >
            🔒 Esta entrada no tiene preview cifrado · abre detalle para
            descifrar el cuerpo completo
          </div>
        )}
      </Link>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        {entry.tags.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {entry.tags.map((t) => (
              <span
                key={t}
                className="rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
                style={{
                  background: "var(--color-warm-100)",
                  color: "var(--color-warm-600)",
                }}
              >
                #{t}
              </span>
            ))}
          </div>
        ) : (
          <span />
        )}
        {decryptedExcerpt && decryptedExcerpt.length > 180 ? (
          <button
            type="button"
            onClick={onToggle}
            className="text-[12px] font-semibold"
            style={{ color: "var(--color-lavender-700)" }}
          >
            {expanded ? "Mostrar menos" : "Mostrar más"}
          </button>
        ) : null}
      </div>
    </article>
  );
}
