"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  EcoPersona,
  EcoThreadCreatedResponse,
  EcoThreadListResponse,
  EcoThreadRailItem,
} from "@psico/types";
import { useDiaryKey } from "@/lib/crypto/diary-key-context";
import { UnlockGate } from "@/components/dashboard/diario/UnlockGate";
import { consumeEcoReaderHandoff } from "@/lib/eco/reader-handoff";
import { ChatArea } from "./ChatArea";
import { ThreadRail } from "./ThreadRail";

/**
 * Direct-fetch helper for the non-stream Eco calls. We don't use the
 * `@psico/api-client` singleton on web because it isn't configured
 * client-side (cookies live in the server). The streaming call inside
 * ChatArea uses `ecoApi.sendMessage` which accepts an explicit baseUrl +
 * token.
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

/**
 * EcoShell — Sprint front-eco (web).
 *
 * Top-level client tree for the Eco chat page. Responsibilities:
 *
 *   1. Hold the active thread id + thread rail state.
 *   2. Gate UI on `ecoKey` from DiaryKeyContext (the user must be unlocked).
 *   3. Refresh the rail after new threads / new messages so the sidebar
 *      stays current.
 *
 * The provider (`DiaryKeyProvider`) lives in the dashboard layout — we
 * only consume it here. If the user lands directly on /dashboard/eco
 * without unlocking the diary first, we render a minimal CTA pointing
 * them to /dashboard/reflexiones to unlock once.
 */
export function EcoShell({
  caps,
  initialRail,
  apiBase,
  token,
}: {
  caps: EcoPersona;
  initialRail: EcoThreadRailItem[];
  apiBase: string;
  token: string | null;
}) {
  const { ecoKey, isLegacyAccount } = useDiaryKey();

  const [rail, setRail] = useState<EcoThreadRailItem[]>(initialRail);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(
    initialRail[0]?.id ?? null,
  );

  // Sprint B — reader→Eco handoff. If the user arrived by tapping "🌿 Eco"
  // on a highlight or a chapter topic, pre-fill the composer with the passage
  // + lead-in. Read once on mount (the consume() clears sessionStorage).
  const [composerSeed, setComposerSeed] = useState<string | null>(null);
  const handoffChecked = useRef(false);
  useEffect(() => {
    if (handoffChecked.current) return;
    handoffChecked.current = true;
    const handoff = consumeEcoReaderHandoff();
    if (handoff) setComposerSeed(handoff.text);
  }, []);

  // After a new message lands, the rail row's lastMessageAt + messageCount
  // change — refetch so the sidebar reorders. We don't broadcast every
  // delta; just one refresh per completed message.
  const refreshRail = useCallback(async () => {
    try {
      const next = await ecoFetch<EcoThreadListResponse>(
        apiBase,
        token,
        "/eco/threads",
      );
      setRail(next.rail);
    } catch {
      // Network blip — keep the stale rail; the user can refresh manually.
    }
  }, [apiBase, token]);

  // Creates a new thread, makes it active, refreshes rail.
  const createThread = useCallback(async () => {
    try {
      const created = await ecoFetch<EcoThreadCreatedResponse>(
        apiBase,
        token,
        "/eco/threads",
        { method: "POST", headers: { "Content-Type": "application/json" } },
      );
      setActiveThreadId(created.id);
      await refreshRail();
    } catch {
      // No-op — the user can hit "Nuevo hilo" again. Surfacing transient
      // errors here would be noisy.
    }
  }, [apiBase, token, refreshRail]);

  // If we landed without an active thread (empty rail), auto-create one
  // so the composer has something to write to. We track "did we already
  // try" with a ref to avoid double-firing in React strict mode + to keep
  // the deps array minimal (re-running on rail/activeThreadId would loop
  // immediately after the first create).
  const autoCreateAttempted = useRef(false);
  useEffect(() => {
    if (autoCreateAttempted.current) return;
    if (!activeThreadId && rail.length === 0 && ecoKey) {
      autoCreateAttempted.current = true;
      void createThread();
    }
  }, [ecoKey, rail.length, activeThreadId, createThread]);

  if (isLegacyAccount) {
    return <LegacyFallback />;
  }

  if (!ecoKey) {
    // Unlock IN PLACE — no detour to Diario. Deriving the key here fills the
    // shared context, so this component re-renders straight into the chat.
    // The user stays in Eco the whole time.
    return (
      <div className="mx-auto w-full max-w-md">
        <UnlockGate context="eco" />
      </div>
    );
  }

  // Sprint F3 — uses the design's `.eco-layout` (1fr 320px grid). Chat
  // takes the wide column, the rail (threads + disclaimer) the narrow one.
  return (
    <div className="eco-layout">
      <div className="min-w-0">
        {activeThreadId ? (
          <ChatArea
            threadId={activeThreadId}
            caps={caps}
            apiBase={apiBase}
            token={token}
            ecoKey={ecoKey}
            onMessageSent={refreshRail}
            initialComposerText={composerSeed}
            onComposerSeedConsumed={() => setComposerSeed(null)}
          />
        ) : (
          <EmptyState onNew={createThread} />
        )}
      </div>
      <div className="eco-rail">
        <ThreadRail
          rail={rail}
          activeId={activeThreadId}
          onSelect={setActiveThreadId}
          onNew={createThread}
          ecoKey={ecoKey}
        />
        <EcoDisclaimer />
      </div>
    </div>
  );
}

function EcoDisclaimer() {
  return (
    <div className="eco-disclaimer">
      <svg
        className="ic"
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M6 10 H18 a1 1 0 0 1 1 1 V19 a1 1 0 0 1-1 1 H6 a1 1 0 0 1-1-1 V11 a1 1 0 0 1 1-1 Z" />
        <path d="M8 10 V7 a4 4 0 0 1 8 0 V10" />
      </svg>
      Eco es un acompañante de autoconocimiento — complementa, no reemplaza, la
      terapia profesional.
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────

function LegacyFallback() {
  return (
    <div
      className="rounded-2xl p-6 text-center"
      style={{
        background: "var(--color-warm-50)",
        border: "1.5px solid var(--color-warm-200)",
        color: "var(--color-warm-600)",
      }}
    >
      <p className="text-sm">
        Tu cuenta aún no tiene activada la protección de privacidad. Contacta
        soporte para habilitarla antes de usar Eco.
      </p>
    </div>
  );
}

function EmptyState({ onNew }: { onNew: () => void }) {
  return (
    <div
      className="flex flex-col items-center justify-center rounded-3xl bg-white p-10 text-center"
      style={{
        border: "1.5px solid var(--color-warm-200)",
        minHeight: "60vh",
      }}
    >
      <span aria-hidden className="text-4xl">
        🌿
      </span>
      <h2
        className="mt-4 text-xl font-bold"
        style={{ color: "var(--color-warm-900)" }}
      >
        ¿Cómo te sientes hoy?
      </h2>
      <p
        className="mx-auto mt-2 max-w-md text-sm leading-relaxed"
        style={{ color: "var(--color-warm-600)" }}
      >
        Eco es un companion para nombrar lo que pasa adentro. No reemplaza a un
        profesional, pero está aquí para escucharte sin juzgar.
      </p>
      <button
        type="button"
        onClick={onNew}
        className="mt-6 rounded-2xl px-6 py-3 text-sm font-semibold text-white"
        style={{ background: "var(--color-sage-400)" }}
      >
        Empezar una conversación
      </button>
    </div>
  );
}
