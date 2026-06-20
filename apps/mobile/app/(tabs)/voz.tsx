import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Audio } from "expo-av";
import type { VoiceTranscribeResponse } from "@psico/types";
import { ApiError, apiClient } from "@psico/api-client";
import { setVoiceHandoff } from "@/lib/voice/handoff";
import { Colors, Radius, Spacing } from "@/theme";

/**
 * Voz screen (mobile) — Sprint front-voz.
 *
 * State machine: idle → recording → stopped → transcribing → ready
 *   (errors at any step land back at idle with a banner)
 *
 * Decisions:
 *   - expo-av Audio.Recording with HighQuality preset (.m4a on iOS,
 *     .webm on Android — both server-accepted).
 *   - Hard cap at MAX_RECORDING_MS to avoid runaway costs.
 *   - No waveform / no pause for v1 (single take, retake if unhappy).
 *
 * Handoff: on "Usar este texto" we stash the transcript in the in-memory
 * handoff module and `router.back()` to wherever the user came from
 * (Diario composer, in practice). The Diario screen's useEffect consumes
 * the handoff on mount.
 */

const MAX_RECORDING_MS = 10 * 60 * 1000;

export default function VozScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ return?: string }>();

  const [phase, setPhase] = useState<
    "idle" | "recording" | "stopped" | "transcribing" | "ready"
  >("idle");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [transcribed, setTranscribed] =
    useState<VoiceTranscribeResponse | null>(null);
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState<{
    code: "PERMISSION" | "PRO_REQUIRED" | "QUOTA_EXCEEDED" | "OTHER";
    message: string;
  } | null>(null);

  const recordingRef = useRef<Audio.Recording | null>(null);
  const recordedUriRef = useRef<string | null>(null);
  const recordedMimeRef = useRef<string>("audio/m4a");
  const startTsRef = useRef<number>(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ─── Timer tick ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (phase !== "recording") return;
    tickRef.current = setInterval(() => {
      const elapsed = Date.now() - startTsRef.current;
      setElapsedMs(elapsed);
      if (elapsed >= MAX_RECORDING_MS) {
        void handleStop();
      }
    }, 250);
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
    };
    // `handleStop` is stable-by-closure — it reads refs only, doesn't need
    // to be in the deps array.
  }, [phase]);

  // Cleanup on unmount — if the user navigates away mid-recording, make
  // sure we release the audio session.
  useEffect(() => {
    return () => {
      if (recordingRef.current) {
        void recordingRef.current.stopAndUnloadAsync().catch(() => {});
      }
    };
  }, []);

  // ─── Recording lifecycle ────────────────────────────────────────────────

  async function handleStart() {
    setError(null);
    try {
      const perm = await Audio.requestPermissionsAsync();
      if (!perm.granted) {
        setError({
          code: "PERMISSION",
          message:
            "Necesitamos acceso al micrófono. Abre Ajustes y permite el micrófono para esta app.",
        });
        return;
      }
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const recording = new Audio.Recording();
      await recording.prepareToRecordAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY,
      );
      await recording.startAsync();
      recordingRef.current = recording;
      startTsRef.current = Date.now();
      setElapsedMs(0);
      setPhase("recording");
    } catch (err) {
      setError({
        code: "OTHER",
        message:
          err instanceof Error
            ? err.message
            : "No pudimos iniciar la grabación.",
      });
    }
  }

  async function handleStop() {
    try {
      const recording = recordingRef.current;
      if (!recording) return;
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      if (!uri) throw new Error("Sin URI del audio");
      recordedUriRef.current = uri;
      // iOS produces .m4a (audio/m4a), Android produces .webm or .m4a
      // depending on hardware. Sniff by extension for the right MIME.
      recordedMimeRef.current = mimeForUri(uri);
      recordingRef.current = null;
      setPhase("stopped");
    } catch (err) {
      setError({
        code: "OTHER",
        message:
          err instanceof Error ? err.message : "Error al detener la grabación.",
      });
    }
  }

  async function handleTranscribe() {
    const uri = recordedUriRef.current;
    if (!uri) return;
    setPhase("transcribing");
    setError(null);
    try {
      // RN FormData accepts the {uri, name, type} shape natively. We avoid
      // the Blob round-trip (fetch(file://) + .blob()) because some Android
      // releases mis-handle the multipart boundary when the body is a Blob.
      const form = new FormData();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (form as any).append("audio", {
        uri,
        name: fileNameFor(recordedMimeRef.current),
        type: recordedMimeRef.current,
      });

      const result = await apiClient.postFormData<VoiceTranscribeResponse>(
        "/voz/transcribe",
        form,
      );
      setTranscribed(result);
      setTranscript(result.transcript);
      setPhase("ready");
    } catch (err) {
      const status = err instanceof ApiError ? err.statusCode : 0;
      if (status === 403) {
        setError({
          code: "PRO_REQUIRED",
          message: "Voz es una función Pro. Mejora tu plan para usarla.",
        });
      } else if (status === 402) {
        setError({
          code: "QUOTA_EXCEEDED",
          message:
            "Ya usaste tus minutos de voz para este período. Vuelve al inicio del próximo ciclo.",
        });
      } else {
        setError({
          code: "OTHER",
          message:
            err instanceof Error
              ? err.message
              : "No pudimos transcribir el audio.",
        });
      }
      setPhase("stopped");
      // Keep the URI around so the user can retry without re-recording.
    }
  }

  function handleRetake() {
    recordedUriRef.current = null;
    setTranscribed(null);
    setTranscript("");
    setError(null);
    setPhase("idle");
  }

  function handleUseTranscript() {
    if (!transcript.trim()) return;
    setVoiceHandoff(transcript);
    const returnTo = (params.return as string) ?? "/(tabs)/reflexiones";
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace(returnTo as never);
    }
  }

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.scroll}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <Text style={styles.title}>Voz</Text>
        <Text style={styles.subtitle}>
          Habla y nosotros transcribimos. Tu audio no se almacena.
        </Text>
      </View>

      {error?.code === "PRO_REQUIRED" ? (
        <View style={styles.card}>
          <Text style={styles.errorTitle}>Voz es Pro</Text>
          <Text style={styles.errorBody}>{error.message}</Text>
          <Pressable
            style={styles.btnPrimary}
            onPress={() => router.push("/(tabs)/plan" as never)}
          >
            <Text style={styles.btnPrimaryText}>Ver planes</Text>
          </Pressable>
        </View>
      ) : error?.code === "QUOTA_EXCEEDED" ? (
        <View style={styles.card}>
          <Text style={styles.errorTitle}>Sin minutos disponibles</Text>
          <Text style={styles.errorBody}>{error.message}</Text>
          <Pressable style={styles.btnGhost} onPress={() => router.back()}>
            <Text style={styles.btnGhostText}>Volver</Text>
          </Pressable>
        </View>
      ) : phase === "ready" && transcribed ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>¿Está bien transcrito?</Text>
          <Text style={styles.metaText}>
            {transcribed.durationSec.toFixed(1)}s · {transcribed.provider}.
            Puedes editarlo antes de usarlo.
          </Text>
          <TextInput
            value={transcript}
            onChangeText={setTranscript}
            multiline
            style={styles.textarea}
            placeholder="Tu transcripción aparecerá aquí…"
            placeholderTextColor={Colors.warm[400]}
          />
          <View style={styles.row}>
            <Pressable style={styles.btnGhost} onPress={handleRetake}>
              <Text style={styles.btnGhostText}>Volver a grabar</Text>
            </Pressable>
            <Pressable
              style={[
                styles.btnPrimary,
                !transcript.trim() && styles.btnDisabled,
              ]}
              onPress={handleUseTranscript}
              disabled={!transcript.trim()}
            >
              <Text style={styles.btnPrimaryText}>Usar este texto</Text>
            </Pressable>
          </View>
        </View>
      ) : phase === "transcribing" ? (
        <View style={[styles.card, styles.center]}>
          <ActivityIndicator size="large" color={Colors.lavender[500]} />
          <Text style={styles.metaText}>Transcribiendo…</Text>
        </View>
      ) : phase === "stopped" ? (
        <View style={[styles.card, styles.center]}>
          <Text style={styles.bodyText}>
            Grabaste{" "}
            <Text style={styles.bold}>{formatDuration(elapsedMs)}</Text>. ¿Lo
            transcribimos?
          </Text>
          <View style={styles.row}>
            <Pressable style={styles.btnGhost} onPress={handleRetake}>
              <Text style={styles.btnGhostText}>Descartar</Text>
            </Pressable>
            <Pressable
              style={styles.btnPrimary}
              onPress={() => void handleTranscribe()}
            >
              <Text style={styles.btnPrimaryText}>Transcribir</Text>
            </Pressable>
          </View>
        </View>
      ) : phase === "recording" ? (
        <View style={[styles.card, styles.center]}>
          <View style={styles.timerRow}>
            <View style={styles.recordingDot} />
            <Text style={styles.timer}>{formatDuration(elapsedMs)}</Text>
          </View>
          <Text style={styles.metaText}>Grabando…</Text>
          <Pressable
            style={[styles.recordBtn, styles.recordBtnStop]}
            onPress={() => void handleStop()}
            accessibilityLabel="Detener grabación"
          >
            <View style={styles.stopIcon} />
          </Pressable>
        </View>
      ) : (
        <View style={[styles.card, styles.center]}>
          <Text style={styles.bodyText}>
            Toca el botón para empezar a grabar. Tu audio{" "}
            <Text style={styles.bold}>no se almacena</Text>.
          </Text>
          <Pressable
            style={styles.recordBtn}
            onPress={() => void handleStart()}
            accessibilityLabel="Empezar a grabar"
          >
            <Ionicons name="mic" size={36} color={Colors.white} />
          </Pressable>
          <Text style={styles.smallMeta}>
            Máximo {Math.round(MAX_RECORDING_MS / 60000)} minutos.
          </Text>
          {error?.code === "PERMISSION" ? (
            <Text style={styles.error}>{error.message}</Text>
          ) : error ? (
            <Text style={styles.error}>{error.message}</Text>
          ) : null}
        </View>
      )}
    </ScrollView>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function mimeForUri(uri: string): string {
  const lower = uri.toLowerCase();
  if (lower.endsWith(".webm")) return "audio/webm";
  if (lower.endsWith(".ogg")) return "audio/ogg";
  if (lower.endsWith(".mp4")) return "audio/mp4";
  if (lower.endsWith(".wav")) return "audio/wav";
  if (lower.endsWith(".mp3")) return "audio/mpeg";
  return "audio/m4a"; // iOS default
}

function fileNameFor(mime: string): string {
  if (mime.includes("webm")) return "audio.webm";
  if (mime.includes("ogg")) return "audio.ogg";
  if (mime.includes("mp4")) return "audio.mp4";
  if (mime.includes("wav")) return "audio.wav";
  if (mime.includes("mpeg") || mime.includes("mp3")) return "audio.mp3";
  return "audio.m4a";
}

// ─── Styles ───────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.warm[50],
  },
  scroll: {
    padding: Spacing.lg,
    paddingBottom: Spacing.xxl,
    gap: Spacing.md,
  },
  header: {
    gap: 4,
    marginBottom: Spacing.sm,
  },
  title: {
    fontSize: 26,
    fontWeight: "700",
    color: Colors.warm[900],
  },
  subtitle: {
    fontSize: 13,
    color: Colors.warm[500],
    lineHeight: 18,
  },
  card: {
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    borderWidth: 1.5,
    borderColor: Colors.warm[200],
    padding: Spacing.lg,
  },
  center: {
    alignItems: "center",
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: Colors.warm[900],
  },
  errorTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: Colors.warm[900],
  },
  errorBody: {
    marginTop: 6,
    fontSize: 13,
    color: Colors.warm[600],
    lineHeight: 19,
  },
  bodyText: {
    fontSize: 14,
    color: Colors.warm[600],
    lineHeight: 20,
    textAlign: "center",
  },
  bold: {
    fontWeight: "700",
    color: Colors.warm[800],
  },
  metaText: {
    marginTop: 6,
    fontSize: 12,
    color: Colors.warm[500],
    textAlign: "center",
  },
  smallMeta: {
    marginTop: Spacing.sm,
    fontSize: 11,
    color: Colors.warm[400],
  },
  timerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  recordingDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#B91C1C",
  },
  timer: {
    fontSize: 30,
    fontFamily: "monospace",
    fontWeight: "700",
    color: Colors.warm[900],
  },
  recordBtn: {
    marginTop: Spacing.lg,
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: Colors.sage[400],
    alignItems: "center",
    justifyContent: "center",
  },
  recordBtnStop: {
    backgroundColor: "#B91C1C",
    width: 76,
    height: 76,
    borderRadius: 38,
  },
  stopIcon: {
    width: 24,
    height: 24,
    borderRadius: 4,
    backgroundColor: Colors.white,
  },
  textarea: {
    marginTop: Spacing.sm + 2,
    minHeight: 140,
    backgroundColor: Colors.warm[50],
    borderRadius: Radius.md,
    borderWidth: 1.5,
    borderColor: Colors.warm[200],
    paddingHorizontal: Spacing.sm + 2,
    paddingVertical: 10,
    fontSize: 14,
    color: Colors.warm[800],
    textAlignVertical: "top",
  },
  row: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  btnPrimary: {
    paddingVertical: 10,
    paddingHorizontal: Spacing.md + 2,
    borderRadius: Radius.md,
    backgroundColor: Colors.sage[400],
  },
  btnPrimaryText: {
    color: Colors.white,
    fontWeight: "700",
    fontSize: 13,
  },
  btnGhost: {
    paddingVertical: 10,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.md,
    backgroundColor: Colors.warm[100],
  },
  btnGhostText: {
    color: Colors.warm[700],
    fontWeight: "700",
    fontSize: 13,
  },
  btnDisabled: {
    opacity: 0.5,
  },
  error: {
    marginTop: Spacing.sm,
    fontSize: 12,
    color: "#B91C1C",
    textAlign: "center",
  },
});
