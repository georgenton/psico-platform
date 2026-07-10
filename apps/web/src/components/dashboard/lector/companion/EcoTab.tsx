"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { EcoPersona, EcoThreadListResponse } from "@psico/types";
import { useDiaryKey } from "@/lib/crypto/diary-key-context";
import { UnlockGate } from "@/components/dashboard/diario/UnlockGate";
import { ChatArea } from "@/components/dashboard/eco/ChatArea";

/**
 * EcoTab — the "Eco" tab of the reader companion dock.
 *
 * Lets the user chat with Eco WITHOUT leaving the chapter. This replaces the
 * old `router.push("/dashboard/eco")` handoff, which threw away the reading
 * position. The reader stays mounted behind the dock; the passage they
 * highlighted seeds the composer.
 *
 * Reuse: the streaming/crisis/reveal machinery all lives in `ChatArea`
 * (the same component the full Eco page uses). We only add the two things the
 * page's EcoShell owns — gating on `ecoKey` and resolving a thread — because
 * the web `apiClient` singleton isn't authenticated client-side (cookies live
 * on the server), so thread/caps reads go through an explicit fetch with the
 * token, exactly like EcoShell's `ecoFetch`.
 */

async function ecoFetch<T>(
  apiBase: string,
  token: string | null,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(`${apiBase}${path}`, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!res.ok) throw new Error(`ECO_HTTP_${res.status}`);
  return res.json() as Promise<T>;
}

export function EcoTab({
  apiBase,
  token,
  seed,
  onSeedConsumed,
}: {
  apiBase: string;
  token: string | null;
  /** Composer pre-fill from a highlighted passage (consumed once). */
  seed: string | null;
  onSeedConsumed: () => void;
}) {
  const { ecoKey, isLegacyAccount } = useDiaryKey();

  const [caps, setCaps] = useState<EcoPersona | null>(null);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const bootstrapped = useRef(false);

  // Resolve caps + a thread once the diary is unlocked. We reuse the user's
  // most recent thread so the reader conversation lands in the same place the
  // Eco page shows — no orphan "reader" threads. Create one only if the user
  // has none yet.
  const bootstrap = useCallback(async () => {
    try {
      const [persona, threads] = await Promise.all([
        ecoFetch<EcoPersona>(apiBase, token, "/eco/caps"),
        ecoFetch<EcoThreadListResponse>(apiBase, token, "/eco/threads"),
      ]);
      setCaps(persona);
      if (threads.rail.length > 0) {
        setThreadId(threads.rail[0]!.id);
      } else {
        const created = await ecoFetch<{ id: string }>(
          apiBase,
          token,
          "/eco/threads",
          { method: "POST", headers: { "Content-Type": "application/json" } },
        );
        setThreadId(created.id);
      }
    } catch {
      setError("No pudimos abrir Eco aquí. Reintenta.");
    }
  }, [apiBase, token]);

  useEffect(() => {
    if (!ecoKey || bootstrapped.current) return;
    bootstrapped.current = true;
    void bootstrap();
  }, [ecoKey, bootstrap]);

  if (isLegacyAccount) {
    return (
      <div className="flex-1 px-5 py-6">
        <p className="text-[13px]" style={{ color: "var(--color-warm-600)" }}>
          Tu cuenta aún no tiene activada la protección de privacidad. Contacta
          soporte para habilitarla antes de usar Eco.
        </p>
      </div>
    );
  }

  if (!ecoKey) {
    return (
      <div className="flex-1 overflow-y-auto px-5 py-6">
        <UnlockGate context="eco" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 px-5 py-6 text-center">
        <p className="text-[13px]" style={{ color: "var(--color-warm-600)" }}>
          {error}
        </p>
        <button
          type="button"
          onClick={() => {
            setError(null);
            bootstrapped.current = false;
            void bootstrap();
          }}
          className="mt-3 rounded-full px-4 py-1.5 text-[12px] font-semibold text-white"
          style={{ background: "var(--color-sage-400)" }}
        >
          Reintentar
        </button>
      </div>
    );
  }

  if (!caps || !threadId) {
    return (
      <div className="flex-1 px-5 py-6 text-center">
        <p className="text-[13px]" style={{ color: "var(--color-warm-500)" }}>
          Abriendo Eco…
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ChatArea
        threadId={threadId}
        caps={caps}
        apiBase={apiBase}
        token={token}
        ecoKey={ecoKey}
        onMessageSent={() => undefined}
        initialComposerText={seed}
        onComposerSeedConsumed={onSeedConsumed}
      />
    </div>
  );
}
