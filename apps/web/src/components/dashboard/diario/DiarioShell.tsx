"use client";

import { useState } from "react";
import type { DiaryEntrySummary, DiaryPromptOfTheDay } from "@psico/types";
import { useDiaryKey } from "@/lib/crypto/diary-key-context";
import { ActiveComposer } from "./ActiveComposer";
import { ActiveEntryList } from "./ActiveEntryList";
import { SeedPhraseModal } from "./SeedPhraseModal";
import { UnlockGate } from "./UnlockGate";

/**
 * DiarioShell — client wrapper that picks UnlockGate (no key) or the active
 * (composer + decrypted list) UI based on the unlock state.
 *
 * The DiaryKeyProvider lives one level up in DashboardShell so unlock state
 * survives navigation (Diario → Seguridad → back). Here we just read from it.
 *
 * `seedAlreadyShown` toggles the post-unlock SeedPhraseModal. The flag is
 * set by `/api/user/me.cryptoSeedShownAt`; once the user confirms the
 * three-word check we update it locally so the modal doesn't flash again
 * before `router.refresh()` lands.
 */
export function DiarioShell({
  seedAlreadyShown,
  entries,
  prompt,
  apiBase,
  token,
}: {
  seedAlreadyShown: boolean;
  entries: DiaryEntrySummary[];
  prompt: DiaryPromptOfTheDay | null;
  apiBase: string;
  token: string | null;
}) {
  return (
    <DiarioInner
      seedAlreadyShown={seedAlreadyShown}
      entries={entries}
      prompt={prompt}
      apiBase={apiBase}
      token={token}
    />
  );
}

function DiarioInner({
  seedAlreadyShown,
  entries,
  prompt,
  apiBase,
  token,
}: {
  seedAlreadyShown: boolean;
  entries: DiaryEntrySummary[];
  prompt: DiaryPromptOfTheDay | null;
  apiBase: string;
  token: string | null;
}) {
  const { key, masterKey } = useDiaryKey();
  // Local override: once the user confirms, hide the modal immediately even
  // if router.refresh hasn't re-fetched /user/me yet.
  const [ackInThisSession, setAckInThisSession] = useState(false);

  if (!key) {
    return <UnlockGate />;
  }

  const showSeedModal = !seedAlreadyShown && !ackInThisSession && masterKey;

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
      {showSeedModal ? (
        <SeedPhraseModal
          masterKey={masterKey}
          apiBase={apiBase}
          token={token}
          onAcknowledged={() => setAckInThisSession(true)}
        />
      ) : null}
    </>
  );
}
