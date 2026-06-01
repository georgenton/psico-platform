"use client";

import { useMemo } from "react";
import type { EcoThreadRailItem } from "@psico/types";
import { decryptString } from "@psico/crypto";

/**
 * ThreadRail — Sprint front-eco (web sidebar).
 *
 * Sidebar showing the user's last threads with a "Nuevo hilo" button.
 * Title ciphertexts are decrypted client-side with the ecoKey before
 * render — the server never sees plaintext.
 *
 * Threads without a title (just created, no first message yet) fall back
 * to "Conversación · {date}".
 */
export function ThreadRail({
  rail,
  activeId,
  onSelect,
  onNew,
  ecoKey,
}: {
  rail: EcoThreadRailItem[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  ecoKey: Uint8Array;
}) {
  return (
    <aside
      className="hidden w-64 shrink-0 sm:block"
      aria-label="Lista de hilos"
    >
      <button
        type="button"
        onClick={onNew}
        className="mb-3 w-full rounded-2xl px-4 py-3 text-left text-sm font-semibold text-white transition-opacity hover:opacity-90"
        style={{ background: "var(--color-sage-400)" }}
      >
        + Nueva conversación
      </button>
      <ul
        className="space-y-1 overflow-y-auto"
        style={{ maxHeight: "calc(100vh - 200px)" }}
      >
        {rail.map((item) => (
          <ThreadRow
            key={item.id}
            item={item}
            active={item.id === activeId}
            onSelect={onSelect}
            ecoKey={ecoKey}
          />
        ))}
        {rail.length === 0 ? (
          <li
            className="rounded-xl px-3 py-2 text-xs"
            style={{ color: "var(--color-warm-400)" }}
          >
            Aún no tienes hilos. Crea uno para empezar.
          </li>
        ) : null}
      </ul>
    </aside>
  );
}

function ThreadRow({
  item,
  active,
  onSelect,
  ecoKey,
}: {
  item: EcoThreadRailItem;
  active: boolean;
  onSelect: (id: string) => void;
  ecoKey: Uint8Array;
}) {
  // Decrypt once per (item, ecoKey) — useMemo dedupes if the rail
  // re-renders for unrelated state (e.g. active thread toggle).
  const title = useMemo(() => {
    if (!item.titleCiphertext || !item.titleNonce) {
      return formatFallback(item.lastMessageAt);
    }
    try {
      return decryptString(
        { ciphertext: item.titleCiphertext, nonce: item.titleNonce },
        ecoKey,
      );
    } catch {
      // Cipher couldn't be opened — likely the user rotated their password
      // before this thread was re-encrypted, or our key is stale. Show a
      // graceful fallback rather than crashing the rail.
      return "🔒 Hilo cifrado";
    }
  }, [item.titleCiphertext, item.titleNonce, item.lastMessageAt, ecoKey]);

  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(item.id)}
        className="block w-full rounded-xl px-3 py-2 text-left transition-colors"
        style={{
          background: active ? "var(--color-lavender-100)" : "transparent",
        }}
      >
        <p
          className="truncate text-[13px] font-semibold"
          style={{
            color: active
              ? "var(--color-lavender-700)"
              : "var(--color-warm-800)",
          }}
        >
          {title}
        </p>
        <p className="text-[11px]" style={{ color: "var(--color-warm-400)" }}>
          {item.messageCount} {item.messageCount === 1 ? "mensaje" : "mensajes"}
        </p>
      </button>
    </li>
  );
}

function formatFallback(date: Date | string): string {
  const d = new Date(date);
  return `Conversación · ${d.toLocaleDateString("es-EC", {
    day: "numeric",
    month: "short",
  })}`;
}
