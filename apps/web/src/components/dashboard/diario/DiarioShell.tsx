"use client";

import type { DiaryEntrySummary, DiaryPromptOfTheDay } from "@psico/types";
import { DiaryKeyProvider, useDiaryKey } from "@/lib/crypto/diary-key-context";
import { ActiveComposer } from "./ActiveComposer";
import { ActiveEntryList } from "./ActiveEntryList";
import { UnlockGate } from "./UnlockGate";

/**
 * DiarioShell — client wrapper that picks UnlockGate (no key) or the active
 * (composer + decrypted list) UI based on the unlock state.
 *
 * Wrapping with <DiaryKeyProvider> here means the Server Component page
 * passes the `cryptoSalt` once and the rest of the tree calls `useDiaryKey`
 * without prop-drilling.
 */
export function DiarioShell({
  cryptoSalt,
  entries,
  prompt,
  apiBase,
  token,
}: {
  cryptoSalt: string | null;
  entries: DiaryEntrySummary[];
  prompt: DiaryPromptOfTheDay | null;
  apiBase: string;
  token: string | null;
}) {
  return (
    <DiaryKeyProvider cryptoSalt={cryptoSalt}>
      <DiarioInner
        entries={entries}
        prompt={prompt}
        apiBase={apiBase}
        token={token}
      />
    </DiaryKeyProvider>
  );
}

function DiarioInner({
  entries,
  prompt,
  apiBase,
  token,
}: {
  entries: DiaryEntrySummary[];
  prompt: DiaryPromptOfTheDay | null;
  apiBase: string;
  token: string | null;
}) {
  const { key } = useDiaryKey();

  if (!key) {
    return <UnlockGate />;
  }

  return (
    <>
      <ActiveComposer prompt={prompt} apiBase={apiBase} token={token} />
      <div className="mt-7 mb-3 flex items-baseline justify-between">
        <h2
          className="text-[12px] font-bold uppercase tracking-[0.14em]"
          style={{ color: "var(--color-warm-500)" }}
        >
          Entradas recientes
        </h2>
        <span
          className="text-[11px]"
          style={{ color: "var(--color-warm-400)" }}
        >
          {entries.length} {entries.length === 1 ? "entrada" : "entradas"}
        </span>
      </div>
      <ActiveEntryList entries={entries} />
    </>
  );
}
