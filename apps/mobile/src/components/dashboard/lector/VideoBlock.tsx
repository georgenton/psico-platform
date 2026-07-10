import { ResizeMode, Video } from "expo-av";
import { StyleSheet, Text, View } from "react-native";
import type { VideoBlockInfo } from "@psico/types";
import { Colors, Radius, Spacing } from "@/theme";

/**
 * VideoBlock (mobile) — the reader's inline video capsule (backlog).
 *
 * Parity with the web VideoBlock: plays a real video with expo-av's native
 * controls when meta.videoUrl exists, else shows a player-shaped
 * "en producción" placeholder (mirrors Modo Guía's "Audio en producción").
 *
 * Book videos are public licensed content, so `info.url` is a direct public
 * URL — no signing, no crypto (ADR 0007 untouched).
 */
export function VideoBlock({ info }: { info: VideoBlockInfo }) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>🎬 VIDEO DEL CAPÍTULO</Text>

      {info.url ? (
        <Video
          style={styles.player}
          source={{ uri: info.url }}
          useNativeControls
          resizeMode={ResizeMode.CONTAIN}
          posterSource={info.poster ? { uri: info.poster } : undefined}
          usePoster={!!info.poster}
        />
      ) : (
        <View style={styles.placeholder}>
          <View style={styles.playCircle}>
            <Text style={styles.playIcon}>▶</Text>
          </View>
          <Text style={styles.placeholderTitle}>EN PRODUCCIÓN</Text>
          <Text style={styles.placeholderBody}>
            Pronto verás aquí una cápsula corta del autor.
          </Text>
        </View>
      )}

      {info.caption ? <Text style={styles.caption}>{info.caption}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginVertical: Spacing.lg },
  label: {
    fontSize: 10.5,
    fontWeight: "700",
    letterSpacing: 1.4,
    color: Colors.lavender[700],
    marginBottom: Spacing.xs,
  },
  player: {
    width: "100%",
    aspectRatio: 16 / 9,
    borderRadius: Radius.lg,
    backgroundColor: "#000",
  },
  placeholder: {
    width: "100%",
    aspectRatio: 16 / 9,
    borderRadius: Radius.lg,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: Colors.lavender[300],
    backgroundColor: Colors.lavender[100],
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.lg,
  },
  playCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "white",
    alignItems: "center",
    justifyContent: "center",
  },
  playIcon: { fontSize: 20, color: Colors.lavender[700] },
  placeholderTitle: {
    marginTop: Spacing.sm,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.2,
    color: Colors.lavender[700],
  },
  placeholderBody: {
    marginTop: 4,
    fontSize: 12.5,
    color: Colors.warm[600],
    textAlign: "center",
  },
  caption: {
    marginTop: Spacing.xs,
    fontSize: 12.5,
    lineHeight: 19,
    color: Colors.warm[600],
  },
});
