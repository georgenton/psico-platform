"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  EcoMessage,
  EcoPersona,
  EcoScope,
  EcoSource,
  EcoSseEvent,
  EcoThreadResponse,
} from "@psico/types";
import { ecoApi, resonancesApi } from "@psico/api-client";
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
 * Streaming feel: the LLM emits deltas in bursts (10–40 chars at a time),
 * which used to "pop" the text in jerky chunks. We now accumulate the full
 * text as it arrives (`streamTarget`) and reveal it through `useSmoothReveal`,
 * a typewriter buffer that catches up a few characters per animation frame —
 * so the reader sees a calm, steady stream regardless of network jitter.
 * Before the first token lands we show an animated three-dot "thinking"
 * indicator instead of frozen placeholder text.
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
  initialComposerText,
  onComposerSeedConsumed,
  scope,
}: {
  threadId: string;
  caps: EcoPersona;
  apiBase: string;
  token: string | null;
  ecoKey: Uint8Array;
  onMessageSent: () => void;
  /** Sprint B — reader→Eco handoff: pre-fill the composer once (then clear). */
  initialComposerText?: string | null;
  onComposerSeedConsumed?: () => void;
  /**
   * Fase H — reading context for a reader-dock conversation. Scopes the RAG
   * to the book and lets the server offer the chapter's concept as a
   * confirmable resonance. Absent on the standalone Eco page.
   */
  scope?: EcoScope;
}) {
  const [messages, setMessages] = useState<EcoMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [text, setText] = useState("");
  // Streaming state machine:
  //   "idle"      — nothing in flight
  //   "receiving" — SSE stream open, deltas arriving
  //   "revealing" — stream closed, typewriter still catching up to the target
  const [phase, setPhase] = useState<"idle" | "receiving" | "revealing">(
    "idle",
  );
  // Full assistant text accumulated so far (the reveal target).
  const [streamTarget, setStreamTarget] = useState("");
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
  // Fase H — sources retrieved for the last reply + the resonance offer.
  const [lastSources, setLastSources] = useState<EcoSource[]>([]);
  const [offer, setOffer] = useState<{
    conceptKey: string;
    conceptLabel: string;
    bookSlug: string;
    chapterOrder: number;
  } | null>(null);
  const [offerState, setOfferState] = useState<
    "idle" | "saving" | "done" | "error"
  >("idle");

  // Sprint B — seed the composer from a reader→Eco handoff exactly once.
  const seededRef = useRef(false);
  useEffect(() => {
    if (seededRef.current || !initialComposerText) return;
    seededRef.current = true;
    setText(initialComposerText);
    onComposerSeedConsumed?.();
  }, [initialComposerText, onComposerSeedConsumed]);

  // Holds the finalized reply while the typewriter finishes revealing it, so
  // we can swap the streaming bubble for a persisted message with no snap.
  const finalizeRef = useRef<{
    id: string;
    text: string;
  } | null>(null);

  const busy = phase !== "idle";
  const displayed = useSmoothReveal(streamTarget, busy);

  // ─── Load history when thread changes ────────────────────────────────────

  useEffect(() => {
    let active = true;
    setLoading(true);
    setHistoryError(null);
    setMessages([]);
    setStreamTarget("");
    setPhase("idle");
    finalizeRef.current = null;
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

  // Scroll to bottom on new messages + every typewriter tick. We skip this
  // when `loadingMore` is true — that's the only path that prepends to the
  // list and the user is reading at the top, not the bottom.
  useEffect(() => {
    if (loadingMore) return;
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, displayed, phase, loadingMore]);

  // ─── Commit the reply once the typewriter catches up ─────────────────────
  //
  // While `phase === "revealing"` the stream is already closed and the full
  // text lives in `streamTarget`; we wait for `displayed` to reach it, then
  // persist the assistant bubble and go idle. Because both bubbles render the
  // exact same text at that instant, the swap is invisible.
  useEffect(() => {
    if (phase !== "revealing") return;
    if (displayed.length < streamTarget.length) return;
    const fin = finalizeRef.current;
    finalizeRef.current = null;
    if (fin && fin.text) {
      setMessages((m) => [
        ...m,
        {
          id: fin.id,
          kind: "assistant",
          textCiphertext: null,
          textNonce: null,
          assistantText: fin.text,
          suggestedBookId: null,
          createdAt: new Date(),
        },
      ]);
    }
    setPhase("idle");
    setStreamTarget("");
    onMessageSent();
  }, [phase, displayed, streamTarget, onMessageSent]);

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
    if (!text.trim() || busy) return;
    const plain = text.trim();
    const envelope = encryptString(plain, ecoKey);

    finalizeRef.current = null;
    setPhase("receiving");
    setStreamTarget("");
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
    let doneMessageId: string | null = null;

    try {
      await ecoApi.sendMessage(
        {
          threadId,
          textPlaintext: plain,
          textCiphertext: envelope.ciphertext,
          textNonce: envelope.nonce,
          ...(scope ? { scope } : {}),
        },
        {
          baseUrl: apiBase.replace(/\/api$/, ""), // ecoApi adds /api itself
          accessToken: token,
          onEvent: (ev: EcoSseEvent) => {
            switch (ev.event) {
              case "delta":
                buffered += ev.data.text;
                setStreamTarget(buffered);
                break;
              case "crisis":
                crisis = ev.data;
                break;
              case "suggestion":
                // v1 just appends a note. Future: render a book/exercise card.
                buffered += `\n\n📚 Sugerencia: ${ev.data.rationale}`;
                setStreamTarget(buffered);
                break;
              case "done":
                doneMessageId = ev.data.messageId;
                // Fase H — surface the retrieved sources + the resonance offer.
                setLastSources(ev.data.sources ?? []);
                if (ev.data.resonanceOffer) {
                  setOffer(ev.data.resonanceOffer);
                  setOfferState("idle");
                }
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
      finalizeRef.current = null;
      setStreamTarget("");
      setPhase("idle");
      return;
    }

    // Crisis takes over immediately — it should feel urgent, not gently typed.
    if (crisis) {
      setCrisisData(crisis);
      setMessages((m) => [
        ...m,
        {
          id: doneMessageId ?? `crisis-${Date.now()}`,
          kind: "crisis",
          textCiphertext: null,
          textNonce: null,
          assistantText: crisis!.text,
          suggestedBookId: null,
          createdAt: new Date(),
        },
      ]);
      finalizeRef.current = null;
      setStreamTarget("");
      setPhase("idle");
      onMessageSent();
      return;
    }

    if (buffered) {
      // Hand off to the reveal phase: keep streaming the target visually until
      // the typewriter catches up, then the commit effect persists the bubble.
      finalizeRef.current = {
        id: doneMessageId ?? `local-asst-${Date.now()}`,
        text: buffered,
      };
      setPhase("revealing");
    } else {
      // No text and no crisis (shouldn't happen) — just go idle.
      setStreamTarget("");
      setPhase("idle");
      onMessageSent();
    }
  }, [text, busy, ecoKey, threadId, apiBase, token, onMessageSent, scope]);

  const confirmOffer = useCallback(async () => {
    if (!offer) return;
    setOfferState("saving");
    try {
      await resonancesApi.confirm({ ...offer, source: "eco" });
      setOfferState("done");
    } catch {
      setOfferState("error");
    }
  }, [offer]);

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
          ) : messages.length === 0 && !busy ? (
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
          {/* While Eco is composing we keep a live bubble. Before the first
              token lands (`displayed` empty) it shows an animated three-dot
              "thinking" indicator; once text arrives the typewriter reveals it
              with a soft caret. On finalize the commit effect swaps it for a
              persisted bubble with identical text — no snap. */}
          {busy ? (
            <MessageBubble
              key="streaming"
              message={{
                id: "streaming",
                kind: "assistant",
                textCiphertext: null,
                textNonce: null,
                assistantText: displayed,
                suggestedBookId: null,
                createdAt: new Date(),
              }}
              ecoKey={ecoKey}
              streaming
            />
          ) : null}
        </div>

        {/* Fase H — retrieved sources (deterministic, "contexto consultado") */}
        {lastSources.length > 0 ? (
          <div
            className="mx-5 mb-1 text-[11px]"
            style={{ color: "var(--color-warm-400)" }}
          >
            Contexto consultado:{" "}
            {lastSources
              .map((s) =>
                s.chapterTitle
                  ? `${s.bookTitle} · ${s.chapterTitle}`
                  : s.bookTitle,
              )
              .join(" · ")}
          </div>
        ) : null}

        {/* Fase H — the ARC resonance offer (Eco proposes, the user confirms) */}
        {offer ? (
          <div
            className="mx-5 mb-2 rounded-xl px-3 py-2"
            role="status"
            style={{
              background: "var(--color-lavender-50)",
              border: "1px solid var(--color-lavender-200)",
            }}
          >
            {offerState === "done" ? (
              <p
                className="text-[12.5px]"
                style={{ color: "var(--color-lavender-700)" }}
              >
                🌱 Añadido a tu mapa. Puedes verlo en <b>Mis resonancias</b>.
              </p>
            ) : (
              <div className="flex items-center justify-between gap-3">
                <p
                  className="text-[12.5px] leading-snug"
                  style={{ color: "var(--color-warm-700)" }}
                >
                  ¿Te resonó el tema <b>«{offer.conceptLabel}»</b>? Solo entra a
                  tu mapa si tú lo confirmas.
                </p>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    disabled={offerState === "saving"}
                    onClick={() => void confirmOffer()}
                    className="rounded-lg px-3 py-1.5 text-[12px] font-bold text-white"
                    style={{ background: "var(--color-lavender-500)" }}
                  >
                    {offerState === "saving" ? "…" : "🌱 Añadir"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setOffer(null)}
                    className="rounded-lg px-2 py-1.5 text-[12px]"
                    style={{ color: "var(--color-warm-500)" }}
                  >
                    Ahora no
                  </button>
                </div>
              </div>
            )}
            {offerState === "error" ? (
              <p
                className="mt-1 text-[11px]"
                style={{ color: "var(--color-rose-600, #b25454)" }}
              >
                No pudimos guardarlo. Reintenta.
              </p>
            ) : null}
          </div>
        ) : null}

        {/* Composer */}
        <Composer
          text={text}
          onChange={setText}
          onSend={() => void send()}
          streaming={busy}
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

// ─── Smooth reveal hook ────────────────────────────────────────────────────

/**
 * Typewriter buffer for streamed text.
 *
 * The LLM streams deltas in bursts, so the raw target text jumps in chunks.
 * This hook animates a `displayed` slice that catches up to `target` a few
 * characters per animation frame: a steady base cadence that accelerates
 * gently when far behind (so long replies don't drag) and is capped so it
 * never dumps a whole chunk at once. Users with `prefers-reduced-motion` get
 * the full text instantly.
 *
 * `active` gates the loop: pass `false` between streams and the buffer resets.
 */
function useSmoothReveal(target: string, active: boolean): string {
  const [displayed, setDisplayed] = useState("");
  const displayedRef = useRef("");
  const targetRef = useRef(target);
  const lastRef = useRef(0);
  targetRef.current = target;

  // Reset the buffer whenever we go idle so the next stream starts clean.
  useEffect(() => {
    if (!active) {
      displayedRef.current = "";
      lastRef.current = 0;
      setDisplayed("");
    }
  }, [active]);

  useEffect(() => {
    if (!active) return;
    if (typeof window === "undefined") return;

    const reduce =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let raf = 0;
    const step = (now: number) => {
      const tgt = targetRef.current;
      const cur = displayedRef.current;
      if (cur.length < tgt.length) {
        if (reduce) {
          displayedRef.current = tgt;
          setDisplayed(tgt);
        } else {
          const gap = tgt.length - cur.length;
          const dt = lastRef.current ? now - lastRef.current : 16;
          // Base ~90 cps, accelerating with the backlog, capped at 300 cps so
          // no single frame reveals a jarring jump.
          const cps = Math.min(300, 90 + gap * 3);
          const reveal = Math.max(1, Math.round((dt / 1000) * cps));
          const next = tgt.slice(0, cur.length + Math.min(gap, reveal));
          displayedRef.current = next;
          setDisplayed(next);
        }
      }
      lastRef.current = now;
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
      lastRef.current = 0;
    };
  }, [active]);

  return displayed;
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

/** Soft companion avatar shown beside Eco's (non-user) bubbles. */
function EcoAvatar({ crisis }: { crisis?: boolean }) {
  return (
    <div
      aria-hidden
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[13px]"
      style={{
        background: crisis ? "#FEE2E2" : "var(--color-sage-50, #F0F6EE)",
        border: `1px solid ${crisis ? "#FCA5A5" : "var(--color-sage-100, #DDEAD8)"}`,
      }}
    >
      🌿
    </div>
  );
}

/** Animated three-dot "Eco is thinking" indicator. */
function TypingDots() {
  return (
    <span
      className="flex items-center gap-1 py-1"
      role="status"
      aria-label="Eco está pensando"
    >
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="inline-block h-1.5 w-1.5 rounded-full"
          style={{
            background: "var(--color-sage-400)",
            animation: "eco-typing 1.2s ease-in-out infinite",
            animationDelay: `${i * 0.18}s`,
          }}
        />
      ))}
    </span>
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

  // The streaming bubble shows the "thinking" dots until the first token lands.
  const thinking = streaming && body.length === 0;

  return (
    <div
      className={`flex items-end gap-2 ${isUser ? "flex-row-reverse" : "flex-row"}`}
      style={{ animation: "eco-fade-in 0.25s var(--easing-default, ease)" }}
    >
      {!isUser ? <EcoAvatar crisis={isCrisis} /> : null}
      <div
        className={`flex max-w-[82%] flex-col ${isUser ? "items-end" : "items-start"}`}
      >
        <div
          className="rounded-2xl px-4 py-2.5"
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
          {thinking ? (
            <TypingDots />
          ) : (
            <p className="whitespace-pre-wrap text-[14px] leading-relaxed">
              {body}
              {streaming ? (
                <span
                  aria-hidden
                  className="ml-0.5 inline-block h-[1.05em] w-[2px] translate-y-[2px] rounded-full align-middle"
                  style={{
                    background: "var(--color-sage-400)",
                    animation: "eco-caret 1s step-end infinite",
                  }}
                />
              ) : null}
            </p>
          )}
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
