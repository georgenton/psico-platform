import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { apiClient, ecoApi } from "@psico/api-client";
import type {
  EcoMessage,
  EcoMessageReportReason,
  EcoSseEvent,
  EcoThreadResponse,
} from "@psico/types";
import { decryptString, encryptString } from "@psico/crypto";
import { CrisisModal } from "@/components/dashboard/eco/CrisisModal";
import { Colors, Radius, Spacing } from "@/theme";

const API_ROOT = process.env.EXPO_PUBLIC_API_URL ?? "";

/**
 * EcoChat — the single-thread chat surface, extracted from the Eco screen so
 * BOTH the full Eco tab and the reader companion sheet can embed it.
 *
 * Owns: message history + pagination, the SSE send pipeline (delta / crisis /
 * suggestion / done / error), the typewriter reveal, the crisis modal, and the
 * per-message report flow. The container provides the outer layout (a
 * KeyboardAvoidingView + a header or tab bar) and a resolved `threadId`.
 *
 * `seed` pre-fills the composer once (reader → Eco handoff); `onMessageSent`
 * lets the container refresh a thread rail after a reply lands.
 */
export function EcoChat({
  threadId,
  ecoKey,
  personaName = "Eco",
  seed,
  onSeedConsumed,
  onMessageSent,
}: {
  threadId: string;
  ecoKey: Uint8Array;
  personaName?: string;
  seed?: string | null;
  onSeedConsumed?: () => void;
  onMessageSent?: () => void;
}) {
  const [messages, setMessages] = useState<EcoMessage[]>([]);
  const [loadingThread, setLoadingThread] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [text, setText] = useState("");
  const [phase, setPhase] = useState<"idle" | "receiving" | "revealing">(
    "idle",
  );
  const [streamTarget, setStreamTarget] = useState("");
  const finalizeRef = useRef<{ id: string; text: string } | null>(null);
  const busy = phase !== "idle";
  const displayed = useSmoothReveal(streamTarget, busy);
  const [sendError, setSendError] = useState<string | null>(null);
  const [crisisData, setCrisisData] = useState<{
    text: string;
    hotline: string;
    crisisPath: string;
  } | null>(null);
  const [reportingId, setReportingId] = useState<string | null>(null);
  const [reportFlash, setReportFlash] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView | null>(null);

  // Seed the composer once from a reader → Eco handoff.
  const seededRef = useRef(false);
  useEffect(() => {
    if (seededRef.current || !seed) return;
    seededRef.current = true;
    setText(seed);
    onSeedConsumed?.();
  }, [seed, onSeedConsumed]);

  // ─── Load history when thread changes ────────────────────────────────────
  useEffect(() => {
    let active = true;
    setLoadingThread(true);
    setMessages([]);
    setHasMore(false);
    finalizeRef.current = null;
    setStreamTarget("");
    setPhase("idle");
    setSendError(null);
    ecoApi
      .getThread(threadId)
      .then((res: EcoThreadResponse) => {
        if (active) {
          setMessages(res.messages);
          setHasMore(res.hasMore);
        }
      })
      .catch(() => {
        // Keep messages empty; the user can compose a new one.
      })
      .finally(() => {
        if (active) setLoadingThread(false);
      });
    return () => {
      active = false;
    };
  }, [threadId]);

  // ─── Load older (pagination) ─────────────────────────────────────────────
  const loadOlder = useCallback(async () => {
    if (!hasMore || loadingMore || messages.length === 0) return;
    const oldestId = messages[0]?.id;
    if (!oldestId || oldestId.startsWith("local-")) return;
    setLoadingMore(true);
    try {
      const res = await ecoApi.getThread(threadId, oldestId);
      setMessages((prev) => [...res.messages, ...prev]);
      setHasMore(res.hasMore);
    } catch {
      // Silent fail — user can re-tap.
    } finally {
      setLoadingMore(false);
    }
  }, [threadId, hasMore, loadingMore, messages]);

  // ─── Send ────────────────────────────────────────────────────────────────
  const send = useCallback(async () => {
    if (!text.trim() || busy || !ecoKey) return;
    const plain = text.trim();
    const envelope = encryptString(plain, ecoKey);

    finalizeRef.current = null;
    setPhase("receiving");
    setStreamTarget("");
    setSendError(null);
    setText("");

    const optimisticId = `local-${Date.now()}`;
    setMessages((m) => [
      ...m,
      {
        id: optimisticId,
        kind: "user",
        textCiphertext: envelope.ciphertext,
        textNonce: envelope.nonce,
        assistantText: null,
        suggestedBookId: null,
        createdAt: new Date(),
      },
    ]);

    let buffered = "";
    let crisis: { text: string; hotline: string; crisisPath: string } | null =
      null;
    let doneMessageId: string | null = null;

    try {
      const token = apiClient.getAccessToken();
      await ecoApi.sendMessage(
        {
          threadId,
          textPlaintext: plain,
          textCiphertext: envelope.ciphertext,
          textNonce: envelope.nonce,
        },
        {
          baseUrl: API_ROOT.replace(/\/$/, ""),
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
                buffered += `\n\n📚 Sugerencia: ${ev.data.rationale}`;
                setStreamTarget(buffered);
                break;
              case "done":
                doneMessageId = ev.data.messageId;
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
      setMessages((m) => m.filter((msg) => msg.id !== optimisticId));
      setText(plain);
      finalizeRef.current = null;
      setStreamTarget("");
      setPhase("idle");
      return;
    }

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
      onMessageSent?.();
      return;
    }

    if (buffered) {
      finalizeRef.current = {
        id: doneMessageId ?? `local-asst-${Date.now()}`,
        text: buffered,
      };
      setPhase("revealing");
    } else {
      setStreamTarget("");
      setPhase("idle");
      onMessageSent?.();
    }
  }, [text, busy, threadId, ecoKey, onMessageSent]);

  // ─── Commit the reply once the typewriter catches up ─────────────────────
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
    onMessageSent?.();
  }, [phase, displayed, streamTarget, onMessageSent]);

  return (
    <View style={styles.chatRoot}>
      <ScrollView
        ref={scrollRef}
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        onContentSizeChange={() => {
          if (loadingMore) return;
          scrollRef.current?.scrollToEnd({ animated: true });
        }}
      >
        {hasMore && messages.length > 0 ? (
          <Pressable
            onPress={() => void loadOlder()}
            disabled={loadingMore}
            style={({ pressed }) => [
              styles.loadOlderBtn,
              pressed && { opacity: 0.7 },
              loadingMore && { opacity: 0.5 },
            ]}
          >
            {loadingMore ? (
              <ActivityIndicator color={Colors.lavender[600]} size="small" />
            ) : (
              <Text style={styles.loadOlderText}>↑ Mensajes anteriores</Text>
            )}
          </Pressable>
        ) : null}
        {loadingThread ? (
          <ActivityIndicator color={Colors.lavender[500]} />
        ) : messages.length === 0 ? (
          <Welcome personaName={personaName} />
        ) : (
          messages.map((msg) => (
            <Bubble
              key={msg.id}
              message={msg}
              ecoKey={ecoKey}
              onLongPress={
                msg.kind === "assistant" && !msg.id.startsWith("local-")
                  ? () => setReportingId(msg.id)
                  : undefined
              }
            />
          ))
        )}
        {busy ? (
          <Bubble
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
      </ScrollView>

      <Composer
        text={text}
        onChange={setText}
        onSend={() => void send()}
        streaming={busy}
        error={sendError}
      />

      {crisisData ? (
        <CrisisModal
          text={crisisData.text}
          hotline={crisisData.hotline}
          crisisPath={crisisData.crisisPath}
          onClose={() => setCrisisData(null)}
        />
      ) : null}

      {reportingId ? (
        <ReportModal
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

      {reportFlash ? (
        <View style={styles.flash} pointerEvents="none">
          <Text style={styles.flashText}>{reportFlash}</Text>
        </View>
      ) : null}
    </View>
  );
}

// ─── Typewriter buffer ──────────────────────────────────────────────────────

/**
 * SSE deltas arrive in bursts; this reveals the accumulated `target` a few
 * chars per frame so the reply streams in calmly instead of popping in chunks.
 */
function useSmoothReveal(target: string, active: boolean): string {
  const [displayed, setDisplayed] = useState("");
  const displayedRef = useRef("");
  const targetRef = useRef(target);
  const lastRef = useRef(0);
  targetRef.current = target;

  useEffect(() => {
    if (!active) {
      displayedRef.current = "";
      lastRef.current = 0;
      setDisplayed("");
    }
  }, [active]);

  useEffect(() => {
    if (!active) return;
    let raf = 0;
    const step = (now: number) => {
      const tgt = targetRef.current;
      const cur = displayedRef.current;
      if (cur.length < tgt.length) {
        const gap = tgt.length - cur.length;
        const dt = lastRef.current ? now - lastRef.current : 16;
        const cps = Math.min(300, 90 + gap * 3);
        const reveal = Math.max(1, Math.round((dt / 1000) * cps));
        const next = tgt.slice(0, cur.length + Math.min(gap, reveal));
        displayedRef.current = next;
        setDisplayed(next);
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

/** Animated three-dot "Eco is thinking" indicator. */
function TypingDots() {
  const a = useRef(new Animated.Value(0)).current;
  const b = useRef(new Animated.Value(0)).current;
  const c = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const pulse = (v: Animated.Value) =>
      Animated.sequence([
        Animated.timing(v, {
          toValue: 1,
          duration: 320,
          useNativeDriver: true,
        }),
        Animated.timing(v, {
          toValue: 0,
          duration: 320,
          useNativeDriver: true,
        }),
      ]);
    const loop = Animated.loop(
      Animated.stagger(160, [pulse(a), pulse(b), pulse(c)]),
    );
    loop.start();
    return () => loop.stop();
  }, [a, b, c]);
  const dotStyle = (v: Animated.Value) => ({
    opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }),
    transform: [
      {
        translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, -3] }),
      },
    ],
  });
  return (
    <View style={styles.typingDots}>
      <Animated.View style={[styles.typingDot, dotStyle(a)]} />
      <Animated.View style={[styles.typingDot, dotStyle(b)]} />
      <Animated.View style={[styles.typingDot, dotStyle(c)]} />
    </View>
  );
}

function Welcome({ personaName }: { personaName: string }) {
  return (
    <View style={styles.welcome}>
      <Text style={styles.welcomeTitle}>¿Cómo te sientes hoy?</Text>
      <Text style={styles.welcomeBody}>
        Hola. Soy {personaName}. Escribe lo que necesites. Si me cuentas algo
        grave, te conecto con ayuda profesional.
      </Text>
    </View>
  );
}

function Bubble({
  message,
  ecoKey,
  streaming = false,
  onLongPress,
}: {
  message: EcoMessage;
  ecoKey: Uint8Array;
  streaming?: boolean;
  onLongPress?: () => void;
}) {
  const isUser = message.kind === "user";
  const isCrisis = message.kind === "crisis";

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

  const bubbleStyle = [
    styles.bubble,
    isCrisis
      ? styles.bubbleCrisis
      : isUser
        ? styles.bubbleUser
        : styles.bubbleAssistant,
  ];
  const textStyle = [
    styles.bubbleText,
    {
      color: isCrisis ? "#7F1D1D" : isUser ? Colors.white : Colors.warm[800],
    },
  ];

  const thinking = streaming && body.length === 0;
  const content = thinking ? (
    <TypingDots />
  ) : (
    <Text style={textStyle}>
      {body}
      {streaming ? <Text style={{ opacity: 0.5 }}> ▍</Text> : null}
    </Text>
  );

  const Inner = onLongPress ? (
    <Pressable
      onLongPress={onLongPress}
      delayLongPress={400}
      style={({ pressed }) => [...bubbleStyle, pressed && { opacity: 0.7 }]}
    >
      {content}
    </Pressable>
  ) : (
    <View style={bubbleStyle}>{content}</View>
  );

  return (
    <View
      style={[
        styles.bubbleRow,
        { justifyContent: isUser ? "flex-end" : "flex-start" },
      ]}
    >
      {Inner}
    </View>
  );
}

const REPORT_REASONS: Array<{
  value: EcoMessageReportReason;
  label: string;
  hint: string;
}> = [
  {
    value: "HALLUCINATION",
    label: "Eco inventó información",
    hint: "Hechos o citas que no existen.",
  },
  {
    value: "OFF_TONE",
    label: "El tono no fue apropiado",
    hint: "Frío, sermoneador, condescendiente.",
  },
  {
    value: "SENSITIVE_CONTENT",
    label: "Tocó algo sensible mal",
    hint: "Trivializó o dijo algo dañino.",
  },
  {
    value: "CRISIS_MISHANDLED",
    label: "No detectó una crisis",
    hint: "Yo necesitaba ayuda urgente.",
  },
  { value: "OTHER", label: "Otra cosa", hint: "Cuéntanos en el comentario." },
];

function ReportModal({
  messageId,
  onClose,
}: {
  messageId: string;
  onClose: (sent: boolean) => void;
}) {
  const [reason, setReason] = useState<EcoMessageReportReason | null>(null);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    if (!reason) return;
    setSubmitting(true);
    setErr(null);
    try {
      await ecoApi.reportMessage(messageId, {
        reason,
        comment: comment.trim() || undefined,
      });
      onClose(true);
    } catch {
      setErr("No pudimos enviar el reporte. Reintenta.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={() => onClose(false)}
    >
      <View style={styles.reportBackdrop}>
        <View style={styles.reportCard}>
          <Text style={styles.reportTitle}>Reportar respuesta de Eco</Text>
          <Text style={styles.reportSub}>
            Nos ayuda a que el companion no te falle de la misma manera dos
            veces.
          </Text>

          <ScrollView style={{ maxHeight: 280, marginTop: Spacing.md }}>
            {REPORT_REASONS.map((r) => {
              const active = r.value === reason;
              return (
                <Pressable
                  key={r.value}
                  onPress={() => setReason(r.value)}
                  style={[styles.reasonRow, active && styles.reasonRowActive]}
                >
                  <Text style={styles.reasonLabel}>{r.label}</Text>
                  <Text style={styles.reasonHint}>{r.hint}</Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <Text style={styles.commentLabel}>COMENTARIO (OPCIONAL)</Text>
          <TextInput
            value={comment}
            onChangeText={(t) => setComment(t.slice(0, 500))}
            placeholder="¿Qué hubieras necesitado escuchar?"
            placeholderTextColor={Colors.warm[400]}
            multiline
            style={styles.commentInput}
          />
          <Text style={styles.commentCount}>{comment.length}/500</Text>

          {err ? <Text style={styles.reportErr}>{err}</Text> : null}

          <View style={styles.reportActions}>
            <Pressable
              onPress={() => onClose(false)}
              style={styles.reportCancel}
            >
              <Text style={styles.reportCancelText}>Cancelar</Text>
            </Pressable>
            <Pressable
              onPress={submit}
              disabled={!reason || submitting}
              style={[
                styles.reportSubmit,
                (!reason || submitting) && { opacity: 0.5 },
              ]}
            >
              <Text style={styles.reportSubmitText}>
                {submitting ? "Enviando…" : "Enviar"}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
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
    <View style={styles.composer}>
      {error ? <Text style={styles.composerErr}>{error}</Text> : null}
      <View style={styles.composerRow}>
        <TextInput
          value={text}
          onChangeText={onChange}
          editable={!streaming}
          multiline
          placeholder="Escribe lo que necesites…"
          placeholderTextColor={Colors.warm[400]}
          style={styles.composerInput}
        />
        <Pressable
          onPress={onSend}
          disabled={streaming || !text.trim()}
          style={[
            styles.sendBtn,
            (streaming || !text.trim()) && { opacity: 0.5 },
          ]}
        >
          <Ionicons name="send" size={18} color={Colors.white} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  chatRoot: { flex: 1 },
  typingDots: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: 4,
  },
  typingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.sage[400],
  },
  body: { flex: 1 },
  bodyContent: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.lg,
    gap: Spacing.sm,
  },
  loadOlderBtn: {
    alignSelf: "center",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.lg,
    backgroundColor: Colors.lavender[50],
    borderWidth: 1.5,
    borderColor: Colors.lavender[200],
    marginBottom: Spacing.sm,
  },
  loadOlderText: {
    fontSize: 13,
    fontWeight: "600",
    color: Colors.lavender[700],
  },
  welcome: { paddingVertical: Spacing.xl, paddingHorizontal: Spacing.md },
  welcomeTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: Colors.warm[800],
    textAlign: "center",
  },
  welcomeBody: {
    marginTop: Spacing.sm,
    fontSize: 14,
    color: Colors.warm[600],
    textAlign: "center",
    lineHeight: 20,
  },
  bubbleRow: { flexDirection: "row", width: "100%" },
  bubble: {
    maxWidth: "82%",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
  },
  bubbleUser: { backgroundColor: Colors.lavender[500] },
  bubbleAssistant: {
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.warm[100],
  },
  bubbleCrisis: {
    backgroundColor: "#FEE2E2",
    borderWidth: 1,
    borderColor: "#FCA5A5",
  },
  bubbleText: { fontSize: 14, lineHeight: 20 },
  composer: {
    borderTopWidth: 1,
    borderTopColor: Colors.warm[200],
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.md,
    backgroundColor: Colors.white,
  },
  composerErr: { fontSize: 12, color: "#B91C1C", marginBottom: 4 },
  composerRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: Spacing.sm,
  },
  composerInput: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    backgroundColor: Colors.warm[50],
    borderRadius: Radius.md,
    borderWidth: 1.5,
    borderColor: Colors.warm[200],
    paddingHorizontal: Spacing.sm + 2,
    paddingVertical: 8,
    fontSize: 14,
    color: Colors.warm[800],
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: Radius.md,
    backgroundColor: Colors.sage[400],
    alignItems: "center",
    justifyContent: "center",
  },
  reportBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.md,
  },
  reportCard: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: Colors.white,
    borderRadius: Radius.xl,
    padding: Spacing.lg,
  },
  reportTitle: { fontSize: 18, fontWeight: "700", color: Colors.warm[900] },
  reportSub: { fontSize: 12.5, color: Colors.warm[500], marginTop: 4 },
  reasonRow: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    borderColor: Colors.warm[200],
    backgroundColor: Colors.white,
    marginBottom: 6,
  },
  reasonRowActive: {
    backgroundColor: Colors.lavender[50],
    borderColor: Colors.lavender[500],
  },
  reasonLabel: { fontSize: 13, fontWeight: "700", color: Colors.warm[900] },
  reasonHint: { fontSize: 11.5, color: Colors.warm[500], marginTop: 2 },
  commentLabel: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.2,
    color: Colors.warm[500],
    marginTop: Spacing.md,
    marginBottom: 6,
  },
  commentInput: {
    minHeight: 70,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    borderColor: Colors.warm[200],
    backgroundColor: Colors.warm[50],
    padding: 10,
    color: Colors.warm[800],
    fontSize: 13,
    textAlignVertical: "top",
  },
  commentCount: {
    textAlign: "right",
    marginTop: 4,
    fontSize: 10.5,
    color: Colors.warm[400],
  },
  reportErr: { color: "#B91C1C", fontSize: 12, marginTop: 6 },
  reportActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  reportCancel: { paddingVertical: 10, paddingHorizontal: 14 },
  reportCancelText: {
    color: Colors.warm[600],
    fontSize: 13,
    fontWeight: "600",
  },
  reportSubmit: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: Radius.md,
    backgroundColor: Colors.lavender[500],
  },
  reportSubmitText: { color: Colors.white, fontSize: 13, fontWeight: "700" },
  flash: {
    position: "absolute",
    top: 12,
    left: 16,
    right: 16,
    backgroundColor: Colors.sage[50],
    borderRadius: Radius.md,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  flashText: { color: Colors.sage[600], fontSize: 12.5, textAlign: "center" },
});
