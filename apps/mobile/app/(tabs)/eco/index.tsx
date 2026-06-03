import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
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
  EcoPersona,
  EcoSseEvent,
  EcoThreadRailItem,
  EcoThreadResponse,
} from "@psico/types";
import { decryptString, encryptString } from "@psico/crypto";
import { useDiaryKey } from "@/crypto/diary-key-context";
import { CrisisModal } from "@/components/dashboard/eco/CrisisModal";
import { Colors, Radius, Spacing } from "@/theme";

const API_ROOT = process.env.EXPO_PUBLIC_API_URL ?? "";

/**
 * Eco chat (mobile) — Sprint front-eco.
 *
 * Single-screen experience:
 *   - Header shows persona + a "switch thread" button that opens a modal
 *     with the rail (no sidebar in RN — modal is the idiomatic pattern).
 *   - Body renders message history. USER bubbles decrypt with ecoKey;
 *     ASSISTANT/CRISIS/SUGGESTION bubbles render plaintext from server.
 *   - Composer streams the response via `ecoApi.sendMessage` (fetch +
 *     reader) and finalizes on `done` or `crisis`.
 *
 * The DiaryKeyProvider lives in the (tabs) layout, so `ecoKey` is already
 * available. If the user lands without unlock, we route them to Diario.
 */
export default function EcoScreen() {
  const { ecoKey, isLegacyAccount } = useDiaryKey();

  const [persona, setPersona] = useState<EcoPersona | null>(null);
  const [rail, setRail] = useState<EcoThreadRailItem[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [railModalOpen, setRailModalOpen] = useState(false);

  const [messages, setMessages] = useState<EcoMessage[]>([]);
  const [loadingThread, setLoadingThread] = useState(false);
  const [text, setText] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [sendError, setSendError] = useState<string | null>(null);
  const [crisisData, setCrisisData] = useState<{
    text: string;
    hotline: string;
    crisisPath: string;
  } | null>(null);
  const [reportingId, setReportingId] = useState<string | null>(null);
  const [reportFlash, setReportFlash] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView | null>(null);

  // ─── Boot: load persona + rail; auto-create first thread if needed ──────

  const refreshRail = useCallback(async () => {
    try {
      const res = await ecoApi.listThreads();
      setRail(res.rail);
    } catch {
      // Network blip — keep stale rail.
    }
  }, []);

  const ensureThread = useCallback(async () => {
    if (!ecoKey) return;
    try {
      const res = await ecoApi.listThreads();
      setRail(res.rail);
      if (res.rail.length === 0) {
        const created = await ecoApi.createThread();
        setActiveThreadId(created.id);
        await refreshRail();
      } else {
        setActiveThreadId((current) => current ?? res.rail[0]!.id);
      }
    } catch {
      // Stay on the empty state; user can hit "Nueva conversación".
    }
  }, [ecoKey, refreshRail]);

  useEffect(() => {
    let active = true;
    ecoApi
      .getCaps()
      .then((p) => {
        if (active) setPersona(p);
      })
      .catch(() => {
        if (active)
          setPersona({
            name: "Eco",
            voice: "Companion conversacional.",
            caps: [],
          });
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (ecoKey) void ensureThread();
  }, [ecoKey, ensureThread]);

  // ─── Load history when active thread changes ─────────────────────────────

  useEffect(() => {
    if (!activeThreadId) return;
    let active = true;
    setLoadingThread(true);
    setMessages([]);
    setStreamingText("");
    setSendError(null);
    ecoApi
      .getThread(activeThreadId)
      .then((res: EcoThreadResponse) => {
        if (active) setMessages(res.messages);
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
  }, [activeThreadId]);

  // ─── Send ────────────────────────────────────────────────────────────────

  const send = useCallback(async () => {
    if (!text.trim() || streaming || !activeThreadId || !ecoKey) return;
    const plain = text.trim();
    const envelope = encryptString(plain, ecoKey);

    setStreaming(true);
    setStreamingText("");
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
    let doneEvent: { messageId: string; quotaRemaining: number | null } | null =
      null;

    try {
      const token = apiClient.getAccessToken();
      await ecoApi.sendMessage(
        {
          threadId: activeThreadId,
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
                setStreamingText(buffered);
                break;
              case "crisis":
                crisis = ev.data;
                break;
              case "suggestion":
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
      setMessages((m) => m.filter((msg) => msg.id !== optimisticId));
      setText(plain);
      setStreaming(false);
      return;
    }

    if (crisis) {
      setCrisisData(crisis);
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
    void refreshRail();
  }, [text, streaming, activeThreadId, ecoKey, refreshRail]);

  // ─── Switch / create thread ──────────────────────────────────────────────

  const handleNewThread = useCallback(async () => {
    try {
      const created = await ecoApi.createThread();
      setActiveThreadId(created.id);
      await refreshRail();
      setRailModalOpen(false);
    } catch {
      // No-op; the user can retry.
    }
  }, [refreshRail]);

  // ─── Render ──────────────────────────────────────────────────────────────

  if (isLegacyAccount) {
    return (
      <Centered text="Tu cuenta no tiene cifrado E2E activado. Contacta soporte." />
    );
  }

  if (!ecoKey) {
    return (
      <Centered text="Desbloquea tu diario primero (la misma clave abre Eco)." />
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 80 : 0}
    >
      <Header persona={persona} onSwitchThread={() => setRailModalOpen(true)} />

      <ScrollView
        ref={scrollRef}
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        onContentSizeChange={() =>
          scrollRef.current?.scrollToEnd({ animated: true })
        }
      >
        {loadingThread ? (
          <ActivityIndicator color={Colors.lavender[500]} />
        ) : messages.length === 0 ? (
          <Welcome persona={persona} />
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
        {streamingText ? (
          <Bubble
            key="streaming"
            message={{
              id: "streaming",
              kind: "assistant",
              textCiphertext: null,
              textNonce: null,
              assistantText: streamingText,
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
        streaming={streaming}
        error={sendError}
      />

      <ThreadRailModal
        visible={railModalOpen}
        rail={rail}
        activeId={activeThreadId}
        ecoKey={ecoKey}
        onSelect={(id) => {
          setActiveThreadId(id);
          setRailModalOpen(false);
        }}
        onNew={handleNewThread}
        onClose={() => setRailModalOpen(false)}
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
    </KeyboardAvoidingView>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────

function Header({
  persona,
  onSwitchThread,
}: {
  persona: EcoPersona | null;
  onSwitchThread: () => void;
}) {
  return (
    <View style={styles.header}>
      <View style={styles.headerInfo}>
        <Text style={styles.headerIcon}>🌿</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerName}>{persona?.name ?? "Eco"}</Text>
          <Text style={styles.headerSub}>
            Companion · no reemplaza a un profesional
          </Text>
        </View>
      </View>
      <Pressable
        onPress={onSwitchThread}
        accessibilityLabel="Cambiar de hilo"
        style={styles.switchBtn}
      >
        <Ionicons name="list" size={20} color={Colors.warm[600]} />
      </Pressable>
    </View>
  );
}

function Welcome({ persona }: { persona: EcoPersona | null }) {
  return (
    <View style={styles.welcome}>
      <Text style={styles.welcomeTitle}>¿Cómo te sientes hoy?</Text>
      <Text style={styles.welcomeBody}>
        Hola. Soy {persona?.name ?? "Eco"}. Escribe lo que necesites. Si me
        cuentas algo grave, te conecto con ayuda profesional.
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
  /** When provided, long-press opens the report flow (assistant msgs only). */
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

  const Inner = onLongPress ? (
    <Pressable
      onLongPress={onLongPress}
      delayLongPress={400}
      style={({ pressed }) => [...bubbleStyle, pressed && { opacity: 0.7 }]}
    >
      <Text style={textStyle}>
        {body}
        {streaming ? <Text style={{ opacity: 0.5 }}> ▍</Text> : null}
      </Text>
    </Pressable>
  ) : (
    <View style={bubbleStyle}>
      <Text style={textStyle}>
        {body}
        {streaming ? <Text style={{ opacity: 0.5 }}> ▍</Text> : null}
      </Text>
    </View>
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

// ─── ReportModal ──────────────────────────────────────────────────────────

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

function ThreadRailModal({
  visible,
  rail,
  activeId,
  ecoKey,
  onSelect,
  onNew,
  onClose,
}: {
  visible: boolean;
  rail: EcoThreadRailItem[];
  activeId: string | null;
  ecoKey: Uint8Array;
  onSelect: (id: string) => void;
  onNew: () => void;
  onClose: () => void;
}) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.railBackdrop}>
        <View style={styles.railCard}>
          <View style={styles.railHeader}>
            <Text style={styles.railTitle}>Tus hilos</Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={22} color={Colors.warm[600]} />
            </Pressable>
          </View>
          <Pressable style={styles.newBtn} onPress={onNew}>
            <Text style={styles.newBtnText}>+ Nueva conversación</Text>
          </Pressable>
          <ScrollView style={{ maxHeight: 320 }}>
            {rail.length === 0 ? (
              <Text style={styles.railEmpty}>
                Aún no tienes hilos. Crea uno para empezar.
              </Text>
            ) : (
              rail.map((item) => (
                <RailRow
                  key={item.id}
                  item={item}
                  active={item.id === activeId}
                  ecoKey={ecoKey}
                  onPress={() => onSelect(item.id)}
                />
              ))
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function RailRow({
  item,
  active,
  ecoKey,
  onPress,
}: {
  item: EcoThreadRailItem;
  active: boolean;
  ecoKey: Uint8Array;
  onPress: () => void;
}) {
  const title = useMemo(() => {
    if (!item.titleCiphertext || !item.titleNonce) {
      return `Conversación · ${new Date(item.lastMessageAt).toLocaleDateString(
        "es-EC",
        { day: "numeric", month: "short" },
      )}`;
    }
    try {
      return decryptString(
        { ciphertext: item.titleCiphertext, nonce: item.titleNonce },
        ecoKey,
      );
    } catch {
      return "🔒 Hilo cifrado";
    }
  }, [item.titleCiphertext, item.titleNonce, item.lastMessageAt, ecoKey]);

  return (
    <Pressable
      onPress={onPress}
      style={[styles.railRow, active && styles.railRowActive]}
    >
      <Text
        style={[styles.railRowTitle, active && { color: Colors.lavender[700] }]}
      >
        {title}
      </Text>
      <Text style={styles.railRowSub}>
        {item.messageCount} {item.messageCount === 1 ? "mensaje" : "mensajes"}
      </Text>
    </Pressable>
  );
}

function Centered({ text }: { text: string }) {
  return (
    <View style={styles.centered}>
      <Text style={styles.centeredText}>{text}</Text>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.warm[50],
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.sm,
    gap: Spacing.sm,
  },
  headerInfo: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  headerIcon: {
    fontSize: 22,
  },
  headerName: {
    fontSize: 18,
    fontWeight: "700",
    color: Colors.warm[900],
  },
  headerSub: {
    fontSize: 11,
    color: Colors.warm[500],
  },
  switchBtn: {
    width: 36,
    height: 36,
    borderRadius: Radius.md,
    backgroundColor: Colors.warm[100],
    alignItems: "center",
    justifyContent: "center",
  },
  body: {
    flex: 1,
  },
  bodyContent: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.lg,
    gap: Spacing.sm,
  },
  welcome: {
    paddingVertical: Spacing.xl,
    paddingHorizontal: Spacing.md,
  },
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
  bubbleRow: {
    flexDirection: "row",
    width: "100%",
  },
  bubble: {
    maxWidth: "82%",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
  },
  bubbleUser: {
    backgroundColor: Colors.lavender[500],
  },
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
  bubbleText: {
    fontSize: 14,
    lineHeight: 20,
  },
  composer: {
    borderTopWidth: 1,
    borderTopColor: Colors.warm[200],
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.md,
    backgroundColor: Colors.white,
  },
  composerErr: {
    fontSize: 12,
    color: "#B91C1C",
    marginBottom: 4,
  },
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
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.lg,
    backgroundColor: Colors.warm[50],
  },
  centeredText: {
    fontSize: 14,
    color: Colors.warm[600],
    textAlign: "center",
    lineHeight: 20,
  },
  railBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  railCard: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: Radius.lg,
    borderTopRightRadius: Radius.lg,
    padding: Spacing.lg,
  },
  railHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  railTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: Colors.warm[900],
  },
  newBtn: {
    paddingVertical: 12,
    borderRadius: Radius.md,
    backgroundColor: Colors.sage[400],
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  newBtnText: {
    color: Colors.white,
    fontWeight: "700",
    fontSize: 14,
  },
  railEmpty: {
    fontSize: 12,
    color: Colors.warm[500],
    textAlign: "center",
    paddingVertical: Spacing.md,
  },
  railRow: {
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: Radius.md,
    marginBottom: 4,
  },
  railRowActive: {
    backgroundColor: Colors.lavender[50],
  },
  railRowTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: Colors.warm[800],
  },
  railRowSub: {
    fontSize: 11,
    color: Colors.warm[400],
    marginTop: 2,
  },
  // Report modal
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
  reportTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: Colors.warm[900],
  },
  reportSub: {
    fontSize: 12.5,
    color: Colors.warm[500],
    marginTop: 4,
  },
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
  reasonLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: Colors.warm[900],
  },
  reasonHint: {
    fontSize: 11.5,
    color: Colors.warm[500],
    marginTop: 2,
  },
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
  reportErr: {
    color: "#B91C1C",
    fontSize: 12,
    marginTop: 6,
  },
  reportActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  reportCancel: {
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
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
  reportSubmitText: {
    color: Colors.white,
    fontSize: 13,
    fontWeight: "700",
  },
  // Flash toast
  flash: {
    position: "absolute",
    top: 60,
    left: 16,
    right: 16,
    backgroundColor: Colors.sage[50],
    borderRadius: Radius.md,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  flashText: {
    color: Colors.sage[600],
    fontSize: 12.5,
    textAlign: "center",
  },
});
