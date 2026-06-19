"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  EcoMessage,
  EcoPersona,
  EcoSseEvent,
  EcoThreadResponse,
} from "@psico/types";
import { ecoApi } from "@psico/api-client";
import { decryptString, encryptString } from "@psico/crypto";
import { CrisisModal } from "./CrisisModal";
import { ReportMessageModal } from "./ReportMessageModal";

/**
 * ChatArea — Sprint front-eco (web).
 *
 * The chat surface for a single active thread. Loads the message history,
 * decrypts USER ciphertexts inline, and streams Eco's replies via the
 * Server-Sent Events consumer from `@psico/api-client`.
 *
 * Sending a message:
 *   1. Encrypt the plaintext with ecoKey → { ciphertext, nonce }.
 *   2. Optimistically append a USER message to the visible list.
 *   3. Start an SSE stream — relay `delta` events into a growing
 *      assistant-message bubble, finalize on `done`, surface `crisis`
 *      via a non-dismissable modal, show inline error banner on `error`.
 *
 * Crisis events take over the UI: we set `crisisData` and render the
 * modal — per ADR 0007 + 08-eco.md design, the user MUST see the
 * derivation message.
 */
export function ChatArea({
  threadId,
  caps,
  apiBase,
  token,
  ecoKey,
  onMessageSent,
}: {
  threadId: string;
  caps: EcoPersona;
  apiBase: string;
  token: string | null;
  ecoKey: Uint8Array;
  onMessageSent: () => void;
}) {
  const [messages, setMessages] = useState<EcoMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState<string>("");
  const [sendError, setSendError] = useState<string | null>(null);
  const [crisisData, setCrisisData] = useState<{
    text: string;
    hotline: string;
    crisisPath: string;
  } | null>(null);
  const [reportingId, setReportingId] = useState<string | null>(null);
  const [reportFlash, setReportFlash] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // ─── Load history when thread changes ────────────────────────────────────

  useEffect(() => {
    let active = true;
    setLoading(true);
    setHistoryError(null);
    setMessages([]);
    setStreamingText("");
    setSendError(null);
    fetch(`${apiBase}/eco/threads/${threadId}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<EcoThreadResponse>;
      })
      .then((res) => {
        if (!active) return;
        setMessages(res.messages);
        setHasMore(res.hasMore);
      })
      .catch(() => {
        if (active) setHistoryError("No pudimos cargar este hilo.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [threadId, apiBase, token]);

  // Scroll to bottom on new messages + streaming deltas. We skip this when
  // `loadingMore` is true — that's the only path that prepends to the list
  // and the user is reading at the top, not the bottom.
  useEffect(() => {
    if (loadingMore) return;
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streamingText, loadingMore]);

  // ─── Load older (pagination) ─────────────────────────────────────────────

  const loadOlder = useCallback(async () => {
    if (!hasMore || loadingMore || messages.length === 0) return;
    const oldestId = messages[0]?.id;
    if (!oldestId || oldestId.startsWith("local-")) return; // optimistic msg
    setLoadingMore(true);

    // Snapshot scroll geometry so we can restore position after prepending.
    const el = scrollRef.current;
    const prevHeight = el?.scrollHeight ?? 0;
    const prevTop = el?.scrollTop ?? 0;

    try {
      const res = await fetch(
        `${apiBase}/eco/threads/${threadId}?cursor=${encodeURIComponent(oldestId)}`,
        { headers: token ? { Authorization: `Bearer ${token}` } : undefined },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as EcoThreadResponse;
      setMessages((prev) => [...data.messages, ...prev]);
      setHasMore(data.hasMore);

      // After React commits, restore scroll so the user stays anchored on
      // the message they were reading.
      requestAnimationFrame(() => {
        if (el) {
          const delta = el.scrollHeight - prevHeight;
          el.scrollTop = prevTop + delta;
        }
      });
    } catch {
      // Silent fail — user can retry by scrolling again.
    } finally {
      setLoadingMore(false);
    }
  }, [hasMore, loadingMore, messages, apiBase, threadId, token]);

  // ─── Send ────────────────────────────────────────────────────────────────

  const send = useCallback(async () => {
    if (!text.trim() || streaming) return;
    const plain = text.trim();
    const envelope = encryptString(plain, ecoKey);

    setStreaming(true);
    setStreamingText("");
    setSendError(null);
    setText("");

    // Optimistically push the user's message so it shows immediately
    // even before the server confirms.
    const optimisticId = `local-${Date.now()}`;
    const optimisticUser: EcoMessage = {
      id: optimisticId,
      kind: "user",
      textCiphertext: envelope.ciphertext,
      textNonce: envelope.nonce,
      assistantText: null,
      suggestedBookId: null,
      createdAt: new Date(),
    };
    setMessages((m) => [...m, optimisticUser]);

    let buffered = "";
    let crisis: { text: string; hotline: string; crisisPath: string } | null =
      null;
    let doneEvent: { messageId: string; quotaRemaining: number | null } | null =
      null;

    try {
      await ecoApi.sendMessage(
        {
          threadId,
          textPlaintext: plain,
          textCiphertext: envelope.ciphertext,
          textNonce: envelope.nonce,
        },
        {
          baseUrl: apiBase.replace(/\/api$/, ""), // ecoApi adds /api itself
          accessToken: token,
          onEvent: (ev: EcoSseEvent) => {
            switch (ev.event) {
              case "delta":
                buffered += ev.data.text;
                setStreamingText(buffered);
                break;
              case "crisis":
                crisis = ev.data;
                break;
              case "suggestion":
                // v1 just appends a note. Future: render a book/exercise card.
                buffered += `\n\n📚 Sugerencia: ${ev.data.rationale}`;
                setStreamingText(buffered);
                break;
              case "done":
                doneEvent = ev.data;
                break;
              case "error":
                setSendError(ev.data.message);
                break;
            }
          },
        },
      );
    } catch (err) {
      setSendError(
        err instanceof Error
          ? err.message
          : "No pudimos enviar tu mensaje. Reintenta.",
      );
      // Roll back the optimistic user msg so the user can edit + resend.
      setMessages((m) => m.filter((msg) => msg.id !== optimisticId));
      setText(plain);
      setStreaming(false);
      return;
    }

    // Finalize: replace optimistic user-id with the real assistant message.
    if (crisis) {
      setCrisisData(crisis);
      // Persist a placeholder CRISIS bubble in the list too so the thread
      // re-reads the same.
      setMessages((m) => [
        ...m,
        {
          id: doneEvent?.messageId ?? `crisis-${Date.now()}`,
          kind: "crisis",
          textCiphertext: null,
          textNonce: null,
          assistantText: crisis!.text,
          suggestedBookId: null,
          createdAt: new Date(),
        },
      ]);
    } else if (buffered) {
      setMessages((m) => [
        ...m,
        {
          id: doneEvent?.messageId ?? `local-asst-${Date.now()}`,
          kind: "assistant",
          textCiphertext: null,
          textNonce: null,
          assistantText: buffered,
          suggestedBookId: null,
          createdAt: new Date(),
        },
      ]);
    }
    setStreamingText("");
    setStreaming(false);
    onMessageSent();
  }, [text, streaming, ecoKey, threadId, apiBase, token, onMessageSent]);

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <>
      <section
        className="flex flex-col rounded-3xl bg-white"
        style={{
          border: "1.5px solid var(--color-warm-200)",
          minHeight: "calc(100vh - 180px)",
          maxHeight: "calc(100vh - 180px)",
        }}
      >
        {/* Header with persona */}
        <header
          className="border-b px-5 py-3"
          style={{ borderColor: "var(--color-warm-100)" }}
        >
          <div className="flex items-center gap-3">
            <span aria-hidden className="text-xl">
              🌿
            </span>
            <div>
              <p
                className="text-[14px] font-bold"
                style={{ color: "var(--color-warm-900)" }}
              >
                {caps.name}
              </p>
              <p
                className="text-[11px]"
                style={{ color: "var(--color-warm-500)" }}
              >
                Companion · no reemplaza a un profesional
              </p>
            </div>
          </div>
        </header>

        {/* Report-sent flash banner */}
        {reportFlash ? (
          <div
            className="mx-5 mt-3 rounded-xl px-3 py-2 text-[12px]"
            role="status"
            style={{
              background: "var(--color-sage-50, #F0F6EE)",
              color: "var(--color-sage-700, #2F5A2A)",
            }}
          >
            {reportFlash}
          </div>
        ) : null}

        {/* Messages */}
        <div
          ref={scrollRef}
          className="flex-1 space-y-3 overflow-y-auto px-5 py-4"
        >
          {hasMore && messages.length > 0 ? (
            <div className="flex justify-center pb-2">
              <button
                type="button"
                onClick={() => void loadOlder()}
                disabled={loadingMore}
                className="rounded-full border-[1.5px] bg-white px-3 py-1 text-[11.5px] font-semibold disabled:opacity-60"
                style={{
                  borderColor: "var(--color-warm-200)",
                  color: "var(--color-warm-600)",
                }}
              >
                {loadingMore ? "Cargando…" : "↑ Mensajes anteriores"}
              </button>
            </div>
          ) : null}
          {loading ? (
            <p
              className="text-center text-[12px]"
              style={{ color: "var(--color-warm-400)" }}
            >
              Cargando…
            </p>
          ) : historyError ? (
            <p
              className="text-center text-[12px]"
              style={{ color: "var(--color-error-text, #B91C1C)" }}
            >
              {historyError}
            </p>
          ) : messages.length === 0 ? (
            <Welcome caps={caps} />
          ) : (
            messages.map((msg) => (
              <MessageBubble
                key={msg.id}
                message={msg}
                ecoKey={ecoKey}
                onReport={
                  msg.kind === "assistant" && !msg.id.startsWith("local-")
                    ? () => setReportingId(msg.id)
                    : undefined
                }
              />
            ))
          )}
          {/* While we're waiting for Eco we need *some* visible feedback even
              when the first SSE delta hasn't arrived yet (Anthropic typically
              takes 1–3s to emit its first token, longer over a flaky link).
              Without this bubble the chat looked frozen and QA reported "no
              response" even when the request was in flight. Once any chunk
              lands we swap to the live-text variant; on `done` both clear. */}
          {streaming ? (
            <MessageBubble
              key="streaming"
              message={{
                id: "streaming",
                kind: "assistant",
                textCiphertext: null,
                textNonce: null,
                assistantText: streamingText || "Eco está pensando…",
                suggestedBookId: null,
                createdAt: new Date(),
              }}
              ecoKey={ecoKey}
              streaming
            />
          ) : null}
        </div>

        {/* Composer */}
        <Composer
          text={text}
          onChange={setText}
          onSend={() => void send()}
          streaming={streaming}
          error={sendError}
        />
      </section>

      {crisisData ? (
        <CrisisModal
          text={crisisData.text}
          hotline={crisisData.hotline}
          crisisPath={crisisData.crisisPath}
          onClose={() => setCrisisData(null)}
        />
      ) : null}

      {reportingId ? (
        <ReportMessageModal
          messageId={reportingId}
          onClose={(sent) => {
            setReportingId(null);
            if (sent) {
              setReportFlash("Gracias — recibimos tu reporte.");
              setTimeout(() => setReportFlash(null), 4000);
            }
          }}
        />
      ) : null}
    </>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────

function Welcome({ caps }: { caps: EcoPersona }) {
  return (
    <div className="py-8 text-center">
      <p
        className="text-sm leading-relaxed"
        style={{ color: "var(--color-warm-600)" }}
      >
        Hola. Soy <strong>{caps.name}</strong>. {caps.voice.split(". ")[0]}.
      </p>
      <p
        className="mx-auto mt-3 max-w-md text-xs"
        style={{ color: "var(--color-warm-400)" }}
      >
        Escribe lo que necesites. Si me cuentas algo grave, te conecto con ayuda
        profesional.
      </p>
    </div>
  );
}

function MessageBubble({
  message,
  ecoKey,
  streaming = false,
  onReport,
}: {
  message: EcoMessage;
  ecoKey: Uint8Array;
  streaming?: boolean;
  /** When provided, renders the "Reportar" affordance under the bubble. */
  onReport?: () => void;
}) {
  const isUser = message.kind === "user";
  const isCrisis = message.kind === "crisis";

  // Decrypt USER ciphertext on render. Memoised so re-renders (e.g. someone
  // else's typing) don't re-run the AEAD verify.
  const body = useMemo(() => {
    if (isUser && message.textCiphertext && message.textNonce) {
      try {
        return decryptString(
          { ciphertext: message.textCiphertext, nonce: message.textNonce },
          ecoKey,
        );
      } catch {
        return "🔒 Mensaje cifrado";
      }
    }
    return message.assistantText ?? "";
  }, [
    isUser,
    message.textCiphertext,
    message.textNonce,
    message.assistantText,
    ecoKey,
  ]);

  return (
    <div className={`flex flex-col ${isUser ? "items-end" : "items-start"}`}>
      <div
        className="max-w-[80%] rounded-2xl px-4 py-2.5"
        style={
          isCrisis
            ? {
                background: "#FEE2E2",
                color: "#7F1D1D",
                border: "1px solid #FCA5A5",
              }
            : isUser
              ? {
                  background: "var(--color-lavender-500)",
                  color: "white",
                }
              : {
                  background: "var(--color-warm-50)",
                  color: "var(--color-warm-800)",
                  border: "1px solid var(--color-warm-100)",
                }
        }
      >
        <p className="whitespace-pre-wrap text-[14px] leading-relaxed">
          {body}
          {streaming ? (
            <span
              aria-hidden
              className="ml-0.5 inline-block h-3 w-1 animate-pulse align-middle"
              style={{ background: "var(--color-warm-500)" }}
            />
          ) : null}
        </p>
      </div>
      {onReport && !streaming ? (
        <button
          type="button"
          onClick={onReport}
          className="mt-0.5 text-[10.5px] underline-offset-2 hover:underline"
          style={{ color: "var(--color-warm-400)" }}
          aria-label="Reportar esta respuesta"
        >
          Reportar
        </button>
      ) : null}
    </div>
  );
}

function Composer({
  text,
  onChange,
  onSend,
  streaming,
  error,
}: {
  text: string;
  onChange: (v: string) => void;
  onSend: () => void;
  streaming: boolean;
  error: string | null;
}) {
  return (
    <footer
      className="border-t px-4 py-3"
      style={{ borderColor: "var(--color-warm-100)" }}
    >
      {error ? (
        <p
          className="mb-2 text-[12px]"
          role="alert"
          style={{ color: "var(--color-error-text, #B91C1C)" }}
        >
          {error}
        </p>
      ) : null}
      <div className="flex items-end gap-2">
        <textarea
          value={text}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              onSend();
            }
          }}
          placeholder="Escribe lo que necesites… (Enter para enviar, Shift+Enter para nueva línea)"
          rows={2}
          disabled={streaming}
          className="flex-1 resize-none rounded-xl border-[1.5px] bg-[var(--color-warm-50)] px-3 py-2 text-[14px] outline-none focus:border-[var(--color-lavender-400)] disabled:opacity-60"
          style={{
            borderColor: "var(--color-warm-200)",
            color: "var(--color-warm-800)",
          }}
        />
        <button
          type="button"
          onClick={onSend}
          disabled={streaming || !text.trim()}
          className="rounded-xl px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          style={{ background: "var(--color-sage-400)" }}
        >
          {streaming ? "…" : "Enviar"}
        </button>
      </div>
    </footer>
  );
}
