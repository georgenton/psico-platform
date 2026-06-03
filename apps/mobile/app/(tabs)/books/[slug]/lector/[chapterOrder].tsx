import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  AppState,
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
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { lectorApi, annotationsApi } from "@psico/api-client";
import type {
  AnnotationSummary,
  ChapterBlockSummary,
  LectorChapterResponse,
} from "@psico/types";
import { Colors, Radius, Spacing } from "@/theme";

/**
 * Mobile reader screen — Sprint S6-front.
 *
 * Trade-offs vs. the web reader:
 *   - No text-selection-based highlighting. RN's native selection menu can't
 *     easily attach custom actions, and a long-press menu over a TextInput
 *     would require a TextInput per block (heavy + breaks rendering). v1
 *     ships annotations only; highlights come later.
 *   - Annotations are created via a long-press on a block → modal prompt.
 *   - Audio (Modo Guía) is deferred to a future sprint with expo-av.
 *
 * Heartbeat
 * ---------
 * Same contract as web: every 5 s, PATCH /api/lector/session with the
 * lastBlockId currently visible. We don't have IntersectionObserver in
 * RN — instead we infer the current block from the ScrollView's content
 * offset and the cumulative block heights (measured on layout).
 */

const TICK_MS = 5_000;

export default function LectorScreen() {
  const { slug, chapterOrder } = useLocalSearchParams<{
    slug: string;
    chapterOrder: string;
  }>();
  const router = useRouter();
  const order = Number(chapterOrder ?? "1");

  const [chapter, setChapter] = useState<LectorChapterResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Annotation state.
  const [annotations, setAnnotations] = useState<AnnotationSummary[]>([]);
  const [pendingBlockId, setPendingBlockId] = useState<string | null>(null);

  // Block layout tracking for scroll → currentBlock inference.
  const blockOffsetsRef = useRef<Record<string, number>>({});
  const scrollOffsetRef = useRef<number>(0);
  const lastBlockIdRef = useRef<string>("");
  const progressRef = useRef<number>(0);
  const lastTickRef = useRef<number>(Date.now());

  // ── Load chapter ──────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    lectorApi
      .getChapter(slug ?? "", order)
      .then((data) => {
        if (cancelled) return;
        setChapter(data);
        setAnnotations(data.annotations);
        lastBlockIdRef.current =
          data.session.lastBlockId ?? data.blocks[0]?.id ?? "";
        progressRef.current = data.session.progressPct;
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        const status =
          (e as { statusCode?: number; status?: number })?.statusCode ??
          (e as { status?: number })?.status;
        if (status === 403) {
          setError("Este capítulo es Pro. Actualiza tu plan para leerlo.");
        } else if (status === 404) {
          setError("No encontramos este capítulo.");
        } else {
          setError("No pudimos cargar el capítulo. Reintenta.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [slug, order]);

  // ── Heartbeat ─────────────────────────────────────────────────────────

  useEffect(() => {
    if (!chapter) return;
    const handle = setInterval(async () => {
      if (AppState.currentState !== "active") return;
      const now = Date.now();
      const deltaSec = Math.min(
        60,
        Math.round((now - lastTickRef.current) / 1000),
      );
      lastTickRef.current = now;
      try {
        const res = await lectorApi.heartbeat({
          bookId: chapter.book.id,
          chapterOrder: chapter.chapter.order,
          lastBlockId: lastBlockIdRef.current,
          timeSpentDeltaSec: deltaSec,
          progressPct: progressRef.current,
        });
        progressRef.current = res.progressPct;
      } catch {
        // Swallow.
      }
    }, TICK_MS);
    return () => clearInterval(handle);
  }, [chapter]);

  // ── Annotation CRUD ───────────────────────────────────────────────────

  async function createAnnotation(blockId: string, text: string) {
    try {
      const res = await annotationsApi.create({ blockId, text });
      setAnnotations((prev) => [...prev, res.annotation]);
    } catch {
      Alert.alert("Error", "No pudimos guardar la nota.");
    }
  }

  async function deleteAnnotation(id: string) {
    const snapshot = annotations.find((a) => a.id === id);
    setAnnotations((prev) => prev.filter((a) => a.id !== id));
    try {
      await annotationsApi.delete(id);
    } catch {
      if (snapshot) setAnnotations((prev) => [...prev, snapshot]);
    }
  }

  function promptAnnotation(blockId: string) {
    // RN's Alert.prompt is iOS-only; we use a controlled modal pattern via
    // state. Setting pendingBlockId opens the composer rendered below.
    setPendingBlockId(blockId);
  }

  // ── Complete handler ──────────────────────────────────────────────────

  async function handleComplete() {
    if (!chapter) return;
    try {
      const res = await lectorApi.complete(
        chapter.book.slug,
        chapter.chapter.order,
      );
      if (res.nextChapter !== null) {
        router.replace(
          `/books/${chapter.book.slug}/lector/${res.nextChapter}` as never,
        );
      } else {
        router.back();
      }
    } catch {
      Alert.alert("Error", "No pudimos marcar el capítulo. Reintenta.");
    }
  }

  // ── Scroll → currentBlock inference ───────────────────────────────────

  function onScroll(e: { nativeEvent: { contentOffset: { y: number } } }) {
    const y = e.nativeEvent.contentOffset.y;
    scrollOffsetRef.current = y;
    if (!chapter) return;
    // Find the block whose offset is closest to (and not past) the scroll y.
    let best = chapter.blocks[0]?.id ?? "";
    let bestY = -Infinity;
    for (const b of chapter.blocks) {
      const off = blockOffsetsRef.current[b.id] ?? 0;
      if (off <= y + 100 && off > bestY) {
        best = b.id;
        bestY = off;
      }
    }
    lastBlockIdRef.current = best;
    const idx = chapter.blocks.findIndex((b) => b.id === best);
    if (idx >= 0) {
      const ratio = (idx + 1) / chapter.blocks.length;
      if (ratio > progressRef.current) progressRef.current = ratio;
    }
  }

  // ── Render ────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={Colors.lavender[500]} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Ionicons name="alert-circle" size={32} color={Colors.warm[500]} />
        <Text style={styles.errorText}>{error}</Text>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backButtonText}>Volver</Text>
        </Pressable>
      </View>
    );
  }

  if (!chapter) return null;

  const annotationsByBlock = new Map<string, AnnotationSummary[]>();
  for (const a of annotations) {
    const list = annotationsByBlock.get(a.blockId) ?? [];
    list.push(a);
    annotationsByBlock.set(a.blockId, list);
  }

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={250}
        onScroll={onScroll}
      >
        <Text style={styles.chapterEyebrow}>
          {chapter.book.title.toUpperCase()}
        </Text>
        <Text style={styles.chapterTitle}>
          Cap. {chapter.chapter.order} · {chapter.chapter.title}
        </Text>

        {chapter.blocks.map((b) => (
          <BlockView
            key={b.id}
            block={b}
            annotations={annotationsByBlock.get(b.id) ?? []}
            onLongPress={() => promptAnnotation(b.id)}
            onDeleteAnnotation={deleteAnnotation}
            onLayout={(y) => {
              blockOffsetsRef.current[b.id] = y;
            }}
          />
        ))}

        <View style={styles.completeWrap}>
          <Pressable onPress={handleComplete} style={styles.completeButton}>
            <Text style={styles.completeText}>✓ Marcar como leído</Text>
          </Pressable>
        </View>
      </ScrollView>

      {/* Annotation composer modal */}
      {pendingBlockId && (
        <AnnotationComposer
          onCancel={() => setPendingBlockId(null)}
          onSubmit={async (text) => {
            await createAnnotation(pendingBlockId, text);
            setPendingBlockId(null);
          }}
        />
      )}
    </View>
  );
}

// ───────────────────────────────────────────────────────────────────────
// Subcomponents
// ───────────────────────────────────────────────────────────────────────

function BlockView({
  block,
  annotations,
  onLongPress,
  onDeleteAnnotation,
  onLayout,
}: {
  block: ChapterBlockSummary;
  annotations: AnnotationSummary[];
  onLongPress: () => void;
  onDeleteAnnotation: (id: string) => void;
  onLayout: (y: number) => void;
}) {
  const blockStyle = (() => {
    switch (block.kind) {
      case "HEADING":
        return styles.blockHeading;
      case "QUOTE":
        return styles.blockQuote;
      case "PAUSE":
        return styles.blockPause;
      case "EXERCISE":
        return styles.blockExercise;
      default:
        return styles.blockParagraph;
    }
  })();

  return (
    <View
      onLayout={(e) => onLayout(e.nativeEvent.layout.y)}
      style={[styles.block, blockStyle]}
    >
      {block.kind === "PAUSE" && (
        <Text style={styles.specialLabel}>🌿 PAUSA</Text>
      )}
      {block.kind === "EXERCISE" && (
        <Text style={styles.specialLabel}>✎ EJERCICIO</Text>
      )}

      <Pressable onLongPress={onLongPress}>
        <Text
          style={[
            styles.blockText,
            block.kind === "HEADING" && styles.blockTextHeading,
            block.kind === "QUOTE" && styles.blockTextQuote,
          ]}
        >
          {block.content}
        </Text>
      </Pressable>

      {annotations.length > 0 && (
        <View style={styles.annotationsList}>
          {annotations.map((a) => (
            <View key={a.id} style={styles.annotationItem}>
              <Text style={styles.annotationText}>📝 {a.text}</Text>
              <Pressable
                onPress={() =>
                  Alert.alert(
                    "Eliminar nota",
                    "¿Seguro que quieres eliminarla?",
                    [
                      { text: "Cancelar", style: "cancel" },
                      {
                        text: "Eliminar",
                        style: "destructive",
                        onPress: () => onDeleteAnnotation(a.id),
                      },
                    ],
                  )
                }
              >
                <Ionicons
                  name="trash-outline"
                  size={16}
                  color={Colors.warm[500]}
                />
              </Pressable>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

function AnnotationComposer({
  onCancel,
  onSubmit,
}: {
  onCancel: () => void;
  onSubmit: (text: string) => Promise<void>;
}) {
  const [text, setText] = useState("");

  return (
    <Modal transparent animationType="fade" onRequestClose={onCancel}>
      <KeyboardAvoidingView
        style={styles.modalBackdrop}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <View style={styles.modalSheet}>
          <Text style={styles.modalTitle}>Nueva nota</Text>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Escribe tu nota…"
            multiline
            style={styles.modalInput}
            autoFocus
          />
          <View style={styles.modalActions}>
            <Pressable onPress={onCancel} style={styles.modalCancel}>
              <Text style={styles.modalCancelText}>Cancelar</Text>
            </Pressable>
            <Pressable
              onPress={async () => {
                if (!text.trim()) return;
                await onSubmit(text.trim());
              }}
              style={[styles.modalSubmit, !text.trim() && { opacity: 0.5 }]}
              disabled={!text.trim()}
            >
              <Text style={styles.modalSubmitText}>Guardar</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ───────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.warm[50] },
  scroll: { padding: Spacing.lg, paddingBottom: Spacing.xxl },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing.lg,
    backgroundColor: Colors.warm[50],
  },
  errorText: {
    marginTop: Spacing.md,
    fontSize: 14,
    color: Colors.warm[600],
    textAlign: "center",
  },
  backButton: {
    marginTop: Spacing.lg,
    paddingHorizontal: Spacing.lg,
    paddingVertical: 10,
    borderRadius: Radius.lg,
    backgroundColor: Colors.lavender[500],
  },
  backButtonText: { color: "white", fontWeight: "700" },
  chapterEyebrow: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.5,
    color: Colors.warm[500],
    marginBottom: 4,
  },
  chapterTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: Colors.warm[900],
    marginBottom: Spacing.lg,
  },
  block: { marginBottom: Spacing.md },
  blockHeading: { marginTop: Spacing.lg },
  blockQuote: {
    borderLeftWidth: 3,
    borderLeftColor: Colors.lavender[300],
    paddingLeft: Spacing.md,
  },
  blockPause: {
    backgroundColor: Colors.sage[50],
    borderRadius: Radius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.sage[100],
  },
  blockExercise: {
    backgroundColor: Colors.lavender[50],
    borderRadius: Radius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.lavender[200],
  },
  blockParagraph: {},
  specialLabel: {
    fontSize: 10.5,
    fontWeight: "700",
    letterSpacing: 1.4,
    marginBottom: 6,
    color: Colors.sage[600],
  },
  blockText: { fontSize: 16, lineHeight: 26, color: Colors.warm[800] },
  blockTextHeading: {
    fontSize: 20,
    fontWeight: "700",
    color: Colors.warm[900],
  },
  blockTextQuote: { fontStyle: "italic", color: Colors.warm[700] },
  annotationsList: { marginTop: Spacing.sm, gap: 6 },
  annotationItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: Colors.lavender[50],
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    borderRadius: Radius.md,
  },
  annotationText: { flex: 1, fontSize: 13, color: Colors.warm[700] },
  completeWrap: { marginTop: Spacing.xl, alignItems: "center" },
  completeButton: {
    paddingHorizontal: Spacing.xl,
    paddingVertical: 14,
    borderRadius: Radius.lg,
    backgroundColor: Colors.sage[500],
  },
  completeText: { color: "white", fontWeight: "700", fontSize: 14 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: "white",
    padding: Spacing.lg,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: "700",
    marginBottom: Spacing.md,
    color: Colors.warm[900],
  },
  modalInput: {
    minHeight: 80,
    padding: Spacing.sm,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.warm[200],
    fontSize: 14,
    color: Colors.warm[900],
    textAlignVertical: "top",
  },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12,
    marginTop: Spacing.md,
  },
  modalCancel: { paddingHorizontal: 16, paddingVertical: 10 },
  modalCancelText: { color: Colors.warm[500], fontWeight: "600" },
  modalSubmit: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: Radius.md,
    backgroundColor: Colors.lavender[500],
  },
  modalSubmitText: { color: "white", fontWeight: "700" },
});
