import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Audio, type AVPlaybackStatus } from "expo-av";
import { Ionicons } from "@expo/vector-icons";
import { lectorApi } from "@psico/api-client";
import type {
  LectorAudioResponse,
  LectorAudioTranscriptSegment,
} from "@psico/types";
import { Colors, Radius, Spacing } from "@/theme";

const SPEED_OPTIONS = [0.75, 1, 1.25, 1.5] as const;
type SpeedRate = (typeof SPEED_OPTIONS)[number];

/**
 * LectorAudioBar — collapsible audio playback strip for the chapter.
 *
 * Compact "🔊 Audio" pill that, when tapped, expands into a play/pause
 * bar with a position label. Uses `expo-av` Audio.Sound — same library
 * the Voice recorder uses, so no extra deps.
 *
 * The audio URL is fetched on demand from `/api/lector/:bookId/:order/audio`
 * (signed R2, 1 h TTL). Pro-only — the server returns 403 for FREE;
 * we render an upsell instead of crashing the reader.
 *
 * Resources are released on unmount (sound.unloadAsync()) to avoid
 * leaking native audio sessions when the user navigates away.
 */
export function LectorAudioBar({
  bookId,
  chapterOrder,
  onActiveBlockChange,
}: {
  bookId: string;
  chapterOrder: number;
  /**
   * Called whenever the audio cursor crosses into / out of a transcript
   * segment with a non-null blockId. The screen uses this to scroll the
   * matching block into view.
   */
  onActiveBlockChange?: (blockId: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<
    "pro_required" | "not_found" | "other" | null
  >(null);
  const soundRef = useRef<Audio.Sound | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [positionMs, setPositionMs] = useState(0);
  const [durationMs, setDurationMs] = useState(0);
  const [speed, setSpeed] = useState<SpeedRate>(1);
  const [transcript, setTranscript] = useState<LectorAudioTranscriptSegment[]>(
    [],
  );
  const activeBlockRef = useRef<string | null>(null);

  // Defensive sort — backend may emit unsorted.
  const sortedSegments = useMemo(
    () => [...transcript].sort((a, b) => a.start - b.start),
    [transcript],
  );

  function findSegmentIndex(t: number): number {
    let lo = 0;
    let hi = sortedSegments.length - 1;
    let ans = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const s = sortedSegments[mid]!;
      if (s.start <= t) {
        ans = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    return ans;
  }

  const onStatus = useCallback(
    (status: AVPlaybackStatus) => {
      if (!status.isLoaded) return;
      setIsPlaying(status.isPlaying);
      setPositionMs(status.positionMillis);
      if (typeof status.durationMillis === "number") {
        setDurationMs(status.durationMillis);
      }
      // Transcript sync — server emits start/end in seconds.
      if (sortedSegments.length === 0) return;
      const t = status.positionMillis / 1000;
      const idx = findSegmentIndex(t);
      let target: string | null = null;
      if (idx >= 0) {
        const seg = sortedSegments[idx]!;
        if (t < seg.end) target = seg.blockId;
      }
      if (target !== activeBlockRef.current) {
        activeBlockRef.current = target;
        onActiveBlockChange?.(target);
      }
    },
    [sortedSegments, onActiveBlockChange],
  );

  const loadAndOpen = useCallback(async () => {
    if (soundRef.current) {
      setOpen(true);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = (await lectorApi.getAudio(
        bookId,
        chapterOrder,
      )) as LectorAudioResponse;
      const { sound } = await Audio.Sound.createAsync(
        { uri: data.url },
        { shouldPlay: false, progressUpdateIntervalMillis: 500 },
        onStatus,
      );
      soundRef.current = sound;
      setDurationMs(data.durationSec * 1000);
      setTranscript(data.transcript);
      setOpen(true);
    } catch (err) {
      const status =
        err && typeof err === "object" && "statusCode" in err
          ? (err as { statusCode?: number }).statusCode
          : undefined;
      if (status === 403) setError("pro_required");
      else if (status === 404) setError("not_found");
      else setError("other");
      setOpen(true);
    } finally {
      setLoading(false);
    }
  }, [bookId, chapterOrder, onStatus]);

  async function toggle() {
    if (!open) {
      await loadAndOpen();
      return;
    }
    if (soundRef.current) {
      await soundRef.current.pauseAsync();
    }
    setOpen(false);
  }

  async function togglePlay() {
    if (!soundRef.current) return;
    if (isPlaying) {
      await soundRef.current.pauseAsync();
    } else {
      await soundRef.current.playAsync();
    }
  }

  // Apply speed change to the underlying sound. `shouldCorrectPitch: true`
  // keeps voices natural at 1.25×/1.5× instead of chipmunk-ing them.
  useEffect(() => {
    if (!soundRef.current) return;
    void soundRef.current.setRateAsync(speed, true);
  }, [speed]);

  // Release the native audio session when the screen goes away.
  useEffect(() => {
    return () => {
      if (soundRef.current) {
        void soundRef.current.unloadAsync();
        soundRef.current = null;
      }
    };
  }, []);

  return (
    <View>
      <Pressable
        onPress={() => void toggle()}
        accessibilityRole="button"
        accessibilityLabel={open ? "Cerrar audio" : "Abrir audio"}
        style={({ pressed }) => [
          styles.pill,
          open && styles.pillOpen,
          pressed && { opacity: 0.7 },
        ]}
      >
        <Ionicons
          name={open ? "volume-mute" : "volume-high"}
          size={14}
          color={open ? Colors.lavender[700] : Colors.warm[700]}
        />
        <Text style={[styles.pillText, open && styles.pillTextOpen]}>
          Audio
        </Text>
      </Pressable>

      {open ? (
        <View style={styles.bar}>
          {loading ? (
            <ActivityIndicator color={Colors.lavender[500]} />
          ) : error === "pro_required" ? (
            <Text style={styles.proText}>🔒 Audio disponible en Pro</Text>
          ) : error === "not_found" ? (
            <Text style={styles.mutedText}>
              Este capítulo aún no tiene audio.
            </Text>
          ) : error === "other" ? (
            <View style={styles.row}>
              <Text style={styles.errorText}>No pudimos cargar el audio.</Text>
              <Pressable
                onPress={() => {
                  setError(null);
                  void loadAndOpen();
                }}
                style={styles.retryBtn}
              >
                <Text style={styles.retryText}>Reintentar</Text>
              </Pressable>
            </View>
          ) : (
            <View>
              <View style={styles.row}>
                <Pressable
                  onPress={() => void togglePlay()}
                  accessibilityLabel={
                    isPlaying ? "Pausar audio" : "Reproducir audio"
                  }
                  style={({ pressed }) => [
                    styles.playBtn,
                    pressed && { opacity: 0.7 },
                  ]}
                >
                  <Ionicons
                    name={isPlaying ? "pause" : "play"}
                    size={20}
                    color={Colors.warm[50]}
                  />
                </Pressable>
                <Text style={styles.timeText}>
                  {fmt(positionMs)} / {fmt(durationMs)}
                </Text>
              </View>
              <View style={styles.speedRow}>
                <Text style={styles.speedLabel}>Velocidad</Text>
                <View style={styles.speedChips}>
                  {SPEED_OPTIONS.map((opt) => {
                    const active = speed === opt;
                    return (
                      <Pressable
                        key={opt}
                        onPress={() => setSpeed(opt)}
                        accessibilityRole="button"
                        accessibilityState={{ selected: active }}
                        style={({ pressed }) => [
                          styles.speedChip,
                          active && styles.speedChipActive,
                          pressed && { opacity: 0.7 },
                        ]}
                      >
                        <Text
                          style={[
                            styles.speedChipText,
                            active && styles.speedChipTextActive,
                          ]}
                        >
                          {opt}×
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            </View>
          )}
        </View>
      ) : null}
    </View>
  );
}

function fmt(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: Radius.full,
    backgroundColor: Colors.warm[100],
  },
  pillOpen: {
    backgroundColor: Colors.lavender[100],
  },
  pillText: {
    fontSize: 12.5,
    fontWeight: "600",
    color: Colors.warm[700],
  },
  pillTextOpen: {
    color: Colors.lavender[700],
  },
  bar: {
    marginTop: Spacing.sm,
    padding: Spacing.md,
    borderRadius: Radius.lg,
    backgroundColor: Colors.warm[50],
    borderWidth: 1,
    borderColor: Colors.warm[200],
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  playBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.lavender[500],
    alignItems: "center",
    justifyContent: "center",
  },
  timeText: {
    fontSize: 13,
    fontVariant: ["tabular-nums"],
    color: Colors.warm[700],
  },
  speedRow: {
    marginTop: Spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  speedLabel: {
    fontSize: 11.5,
    color: Colors.warm[500],
  },
  speedChips: {
    flexDirection: "row",
    gap: 4,
  },
  speedChip: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: Radius.full,
    backgroundColor: Colors.warm[100],
  },
  speedChipActive: {
    backgroundColor: Colors.lavender[500],
  },
  speedChipText: {
    fontSize: 11,
    fontWeight: "700",
    color: Colors.warm[700],
  },
  speedChipTextActive: {
    color: "#fff",
  },
  proText: {
    fontSize: 13,
    fontWeight: "600",
    color: Colors.lavender[700],
    textAlign: "center",
  },
  mutedText: {
    fontSize: 13,
    color: Colors.warm[500],
    textAlign: "center",
  },
  errorText: {
    fontSize: 13,
    color: Colors.warm[700],
    flex: 1,
  },
  retryBtn: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: Radius.full,
    backgroundColor: Colors.warm[100],
  },
  retryText: {
    fontSize: 12,
    fontWeight: "600",
    color: Colors.warm[700],
  },
});
