import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  AppState,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import {
  lectorApi,
  annotationsApi,
  highlightsApi,
  resonancesApi,
} from "@psico/api-client";
import type {
  AnnotationSummary,
  BreatheExercise,
  ChapterBlockSummary,
  HighlightColor,
  HighlightSummary,
  LectorChapterResponse,
} from "@psico/types";
import {
  reflectExerciseSeed,
  breatheReflectSeed,
  breatheEcoSeed,
  reflexionEcoSeed,
  videoBlockInfo,
  chapterConcept,
} from "@psico/types";
import { Colors, Radius, Spacing } from "@/theme";
import { LectorAudioBar } from "@/components/dashboard/lector/LectorAudioBar";
import { EcoTopicCard } from "@/components/dashboard/lector/EcoTopicCard";
import { ChapterExercises } from "@/components/dashboard/lector/exercises/ChapterExercises";
import { BreathingExercise } from "@/components/dashboard/lector/exercises/BreathingExercise";
import { VideoBlock } from "@/components/dashboard/lector/VideoBlock";
import {
  BlockActionsSheet,
  highlightStyleFor,
} from "@/components/dashboard/lector/BlockActionsSheet";
import {
  ReaderCompanionSheet,
  type SheetTab,
} from "@/components/dashboard/lector/companion/ReaderCompanionSheet";

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

  // Companion sheet state (Eco · Notas · Reflexión). The sheet is the reader's
  // bottom panel — it keeps the chapter behind it so the user never loses their
  // place when they open Eco, a note, or a reflexión.
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetTab, setSheetTab] = useState<SheetTab>("notas");
  const [sheetPassage, setSheetPassage] = useState<string | null>(null);
  const [sheetEcoSeed, setSheetEcoSeed] = useState<string | null>(null);
  const [sheetReflexionSeed, setSheetReflexionSeed] = useState<string | null>(
    null,
  );
  // ARC — was the Reflexión sheet opened from a chapter exercise? If so, the
  // tab offers the chapter concept as a resonance on save.
  const [sheetReflexionFromExercise, setSheetReflexionFromExercise] =
    useState(false);

  // Breathing exercise overlay (chapter activity).
  const [breatheExercise, setBreatheExercise] =
    useState<BreatheExercise | null>(null);

  function openCompanion(
    tab: SheetTab,
    opts?: {
      passage?: string;
      ecoSeed?: string;
      reflexionSeed?: string;
      blockId?: string;
      fromExercise?: boolean;
    },
  ) {
    setSheetTab(tab);
    setSheetPassage(opts?.passage ?? null);
    setSheetEcoSeed(opts?.ecoSeed ?? null);
    setSheetReflexionSeed(opts?.reflexionSeed ?? null);
    setSheetReflexionFromExercise(opts?.fromExercise ?? false);
    if (opts?.blockId) setPendingBlockId(opts.blockId);
    setSheetOpen(true);
  }

  // Highlight state — Sprint mobile-highlights v1.
  //
  // We ship "block-level" highlights: a long-press marks the entire block
  // (startOffset=0, endOffset=block.content.length). Character-level
  // selection in RN would require maintained libraries that don't exist
  // for RN 0.76 / Expo SDK 52 — block-level is the pragmatic compromise.
  const [highlights, setHighlights] = useState<HighlightSummary[]>([]);
  // The block currently driving the action sheet (long-pressed).
  const [actionBlockId, setActionBlockId] = useState<string | null>(null);

  // Block layout tracking for scroll → currentBlock inference.
  const blockOffsetsRef = useRef<Record<string, number>>({});
  const scrollOffsetRef = useRef<number>(0);
  const lastBlockIdRef = useRef<string>("");
  const progressRef = useRef<number>(0);
  const lastTickRef = useRef<number>(Date.now());
  const scrollViewRef = useRef<ScrollView | null>(null);
  const lastAudioScrolledRef = useRef<string | null>(null);

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
        setHighlights(data.highlights);
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

  // ── Highlight CRUD ────────────────────────────────────────────────────

  async function createHighlight(blockId: string, color: HighlightColor) {
    const block = chapter?.blocks.find((b) => b.id === blockId);
    if (!block) return;
    // Block-level v1: span the whole block content. The backend validates
    // 0 ≤ startOffset < endOffset ≤ content.length so we land exactly at
    // the bounds.
    const startOffset = 0;
    const endOffset = block.content.length;

    // Optimistic insert with a temp ID so the UI tints immediately. We
    // swap to the server ID once create() resolves; on failure we drop
    // the temp row.
    const tempId = `temp-${Date.now()}`;
    const optimistic: HighlightSummary = {
      id: tempId,
      blockId,
      startOffset,
      endOffset,
      color,
      note: null,
      createdAt: new Date() as unknown as HighlightSummary["createdAt"],
    };
    setHighlights((prev) => [...prev, optimistic]);
    try {
      const res = await highlightsApi.create({
        blockId,
        startOffset,
        endOffset,
        color,
      });
      setHighlights((prev) =>
        prev.map((h) => (h.id === tempId ? res.highlight : h)),
      );
    } catch {
      setHighlights((prev) => prev.filter((h) => h.id !== tempId));
      Alert.alert("Error", "No pudimos guardar el resaltado.");
    }
  }

  async function deleteHighlight(id: string) {
    const snapshot = highlights.find((h) => h.id === id);
    setHighlights((prev) => prev.filter((h) => h.id !== id));
    try {
      await highlightsApi.delete(id);
    } catch {
      if (snapshot) setHighlights((prev) => [...prev, snapshot]);
    }
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

  const highlightsByBlock = new Map<string, HighlightSummary[]>();
  for (const h of highlights) {
    const list = highlightsByBlock.get(h.blockId) ?? [];
    list.push(h);
    highlightsByBlock.set(h.blockId, list);
  }

  return (
    <View style={styles.container}>
      <ScrollView
        ref={scrollViewRef}
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={250}
        onScroll={onScroll}
      >
        <Text style={styles.chapterEyebrow}>
          {chapter.chapter.partNumber != null
            ? `${chapter.book.title.toUpperCase()} · PARTE ${romanize(chapter.chapter.partNumber)}`
            : chapter.book.title.toUpperCase()}
        </Text>
        <Text style={styles.chapterTitle}>
          Cap. {chapter.chapter.order} · {chapter.chapter.title}
        </Text>

        <EcoTopicCard
          bookSlug={chapter.book.slug}
          chapterOrder={chapter.chapter.order}
          chapterTitle={chapter.chapter.title}
          onOpenEco={(prompt) => openCompanion("eco", { ecoSeed: prompt })}
        />

        {chapter.chapter.audioAvailable ? (
          <View style={styles.audioWrap}>
            <LectorAudioBar
              bookId={chapter.book.id}
              chapterOrder={chapter.chapter.order}
              onActiveBlockChange={(blockId) => {
                if (!blockId) return;
                if (lastAudioScrolledRef.current === blockId) return;
                const y = blockOffsetsRef.current[blockId];
                if (typeof y !== "number" || !scrollViewRef.current) return;
                // Scroll a bit above the block so it sits comfortably in
                // the viewport instead of at the very top edge.
                scrollViewRef.current.scrollTo({
                  y: Math.max(0, y - 64),
                  animated: true,
                });
                lastAudioScrolledRef.current = blockId;
              }}
            />
          </View>
        ) : null}

        {chapter.blocks.map((b) => (
          <BlockView
            key={b.id}
            block={b}
            annotations={annotationsByBlock.get(b.id) ?? []}
            highlights={highlightsByBlock.get(b.id) ?? []}
            onLongPress={() => setActionBlockId(b.id)}
            onDeleteAnnotation={deleteAnnotation}
            onLayout={(y) => {
              blockOffsetsRef.current[b.id] = y;
            }}
          />
        ))}

        <ChapterExercises
          bookSlug={chapter.book.slug}
          chapterOrder={chapter.chapter.order}
          onReflect={(prompt) =>
            openCompanion("reflexion", {
              reflexionSeed: reflectExerciseSeed(prompt),
              fromExercise: true,
            })
          }
          onBreathe={(ex) => setBreatheExercise(ex)}
        />

        <View style={styles.completeWrap}>
          <Pressable onPress={handleComplete} style={styles.completeButton}>
            <Text style={styles.completeText}>✓ Marcar como leído</Text>
          </Pressable>
        </View>
      </ScrollView>

      {/* Block actions sheet — long-press menu (Sprint mobile-highlights) */}
      {actionBlockId && (
        <BlockActionsSheet
          hasHighlight={(highlightsByBlock.get(actionBlockId) ?? []).length > 0}
          onPickColor={async (color) => {
            setActionBlockId(null);
            await createHighlight(actionBlockId, color);
          }}
          onAddNote={() => {
            const id = actionBlockId;
            setActionBlockId(null);
            openCompanion("notas", { blockId: id });
          }}
          onReflect={() => {
            const block = chapter.blocks.find((b) => b.id === actionBlockId);
            setActionBlockId(null);
            if (block) openCompanion("reflexion", { passage: block.content });
          }}
          onAskEco={() => {
            const block = chapter.blocks.find((b) => b.id === actionBlockId);
            setActionBlockId(null);
            if (block) openCompanion("eco", { passage: block.content });
          }}
          resonanceLabel={
            chapterConcept(
              chapter.book.slug,
              chapter.chapter.order,
              chapter.chapter.title,
            ).label
          }
          onResonar={async () => {
            setActionBlockId(null);
            const concept = chapterConcept(
              chapter.book.slug,
              chapter.chapter.order,
              chapter.chapter.title,
            );
            try {
              await resonancesApi.confirm({
                conceptKey: concept.key,
                conceptLabel: concept.label,
                bookSlug: chapter.book.slug,
                chapterOrder: chapter.chapter.order,
                source: "highlight",
              });
              Alert.alert(
                "Añadido a tu mapa 🌱",
                "Puedes verlo (y quitarlo) en Mis resonancias, dentro de tu Mapa Emocional.",
              );
            } catch {
              Alert.alert("No pudimos guardarlo", "Reintenta en un momento.");
            }
          }}
          onRemoveHighlights={async () => {
            const list = highlightsByBlock.get(actionBlockId) ?? [];
            setActionBlockId(null);
            await Promise.all(list.map((h) => deleteHighlight(h.id)));
          }}
          onCancel={() => setActionBlockId(null)}
        />
      )}

      {/* Companion sheet — Eco · Notas · Reflexión (bottom panel) */}
      <ReaderCompanionSheet
        visible={sheetOpen}
        tab={sheetTab}
        onTabChange={setSheetTab}
        onClose={() => {
          setSheetOpen(false);
          setPendingBlockId(null);
          setSheetPassage(null);
          setSheetEcoSeed(null);
          setSheetReflexionSeed(null);
        }}
        passage={sheetPassage}
        ecoSeed={sheetEcoSeed}
        reflexionSeedOverride={sheetReflexionSeed}
        reflexionFromExercise={sheetReflexionFromExercise}
        concept={chapterConcept(
          chapter.book.slug,
          chapter.chapter.order,
          chapter.chapter.title,
        )}
        onPassageConsumed={() => {
          setSheetPassage(null);
          setSheetEcoSeed(null);
          setSheetReflexionSeed(null);
        }}
        onReflexionAskEco={() =>
          openCompanion("eco", { ecoSeed: reflexionEcoSeed() })
        }
        annotations={annotations}
        pendingBlockId={pendingBlockId}
        onClearPending={() => setPendingBlockId(null)}
        onCreateNote={createAnnotation}
        onDeleteNote={deleteAnnotation}
        scope={{
          bookSlug: chapter.book.slug,
          chapterOrder: chapter.chapter.order,
        }}
      />

      {breatheExercise ? (
        <BreathingExercise
          exercise={breatheExercise}
          onClose={() => setBreatheExercise(null)}
          onReflect={() =>
            openCompanion("reflexion", {
              reflexionSeed: breatheReflectSeed(),
              fromExercise: true,
            })
          }
          onAskEco={() => openCompanion("eco", { ecoSeed: breatheEcoSeed() })}
        />
      ) : null}
    </View>
  );
}

// ───────────────────────────────────────────────────────────────────────
// Subcomponents
// ───────────────────────────────────────────────────────────────────────

function BlockView({
  block,
  annotations,
  highlights,
  onLongPress,
  onDeleteAnnotation,
  onLayout,
}: {
  block: ChapterBlockSummary;
  annotations: AnnotationSummary[];
  highlights: HighlightSummary[];
  onLongPress: () => void;
  onDeleteAnnotation: (id: string) => void;
  onLayout: (y: number) => void;
}) {
  // Video capsule (VIDEO kind, or a legacy 🎬 EXERCISE mock) → dedicated
  // player; no highlight/annotation overlay or long-press applies.
  const video = videoBlockInfo(block);
  if (video) {
    return (
      <View onLayout={(e) => onLayout(e.nativeEvent.layout.y)}>
        <VideoBlock info={video} />
      </View>
    );
  }

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

  // First highlight wins for the visual tint (block-level v1 — usually
  // there's only one anyway). Multi-color overlap is rare and the design
  // doesn't define what should happen; we just use the earliest one.
  const tintColor = highlights[0]?.color;
  const highlightStyle = tintColor ? highlightStyleFor(tintColor) : null;

  return (
    <View
      onLayout={(e) => onLayout(e.nativeEvent.layout.y)}
      style={[styles.block, blockStyle, highlightStyle]}
      testID={`block-${block.id}${tintColor ? `-${tintColor.toLowerCase()}` : ""}`}
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

// ───────────────────────────────────────────────────────────────────────

const ROMAN = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];
function romanize(n: number): string {
  return ROMAN[n] ?? String(n);
}

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
  audioWrap: {
    marginBottom: Spacing.lg,
    alignItems: "flex-start",
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
});
