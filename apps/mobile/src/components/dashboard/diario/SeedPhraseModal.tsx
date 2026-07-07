import { useMemo, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { masterKeyToSeedPhrase } from "@psico/crypto";
import { apiClient } from "@psico/api-client";
import { Colors, Radius, Spacing } from "@/theme";

/**
 * SeedPhraseModal (mobile) — first-unlock backup flow.
 *
 * Mirrors the web modal (2026-07 redesign — "suave, rápido, cómodo"):
 *   - 12 words (not 24) — half the wall.
 *   - "Guardar mis palabras" opens the native share sheet so the user can
 *     drop them into Notes / a password manager / send to themselves. No
 *     re-type quiz.
 *   - One checkbox: "Ya las guardé en un lugar seguro." Then continue.
 *   - The words can be viewed again in Perfil → Seguridad.
 *
 * Privacy invariants:
 *   - The phrase is computed from masterKey IN-MEMORY only.
 *   - We never log, screenshot-cache, or persist the words anywhere.
 *   - If the user dismisses without confirming, no acknowledgment is sent —
 *     the modal pops up again on next unlock.
 */
export function SeedPhraseModal({
  masterKey,
  onAcknowledged,
}: {
  masterKey: Uint8Array;
  onAcknowledged: () => void;
}) {
  const phrase = useMemo(() => masterKeyToSeedPhrase(masterKey), [masterKey]);
  const words = useMemo(() => phrase.split(" "), [phrase]);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleShare() {
    const numbered = words.map((w, i) => `${i + 1}. ${w}`).join("\n");
    try {
      await Share.share({
        message:
          "Frase de recuperación de tu diario\nGuárdala en un lugar seguro.\n\n" +
          numbered,
      });
    } catch {
      // User cancelled the share sheet — nothing to do.
    }
  }

  async function handleContinue() {
    setSubmitting(true);
    setError(null);
    try {
      await apiClient.post<{ ok: true; shownAt: string }>(
        "/user/crypto-seed-acknowledged",
        {},
      );
      onAcknowledged();
    } catch {
      setError(
        "No pudimos guardar la confirmación. Reintenta en unos segundos.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.headerBg}>
            <View style={styles.iconCircle}>
              <Ionicons name="key" size={20} color={Colors.lavender[700]} />
            </View>
            <Text style={styles.title}>Guarda tu frase de recuperación</Text>
            <Text style={styles.subtitle}>
              Si olvidas tu contraseña, estas 12 palabras son la única forma de
              recuperar tu diario. No las guardamos por ti.
            </Text>
          </View>

          <ScrollView contentContainerStyle={styles.body}>
            <View style={styles.grid}>
              {words.map((w, i) => (
                <View key={i} style={styles.wordCell}>
                  <Text style={styles.wordIdx}>{i + 1}.</Text>
                  <Text style={styles.wordText}>{w}</Text>
                </View>
              ))}
            </View>

            <Pressable style={styles.secondaryButton} onPress={handleShare}>
              <Ionicons
                name="share-outline"
                size={16}
                color={Colors.warm[700]}
              />
              <Text style={styles.secondaryButtonText}>
                Guardar mis palabras
              </Text>
            </Pressable>

            <Text style={styles.noticeText}>
              Guárdalas en un lugar seguro — en tu gestor de contraseñas o en
              papel. Podrás volver a verlas en{" "}
              <Text style={{ fontWeight: "700" }}>Perfil → Seguridad</Text>.
            </Text>

            <Pressable
              style={styles.checkRow}
              onPress={() => setSaved((v) => !v)}
            >
              <View style={[styles.checkbox, saved && styles.checkboxOn]}>
                {saved ? (
                  <Ionicons name="checkmark" size={14} color={Colors.white} />
                ) : null}
              </View>
              <Text style={styles.checkLabel}>
                Ya las guardé en un lugar seguro
              </Text>
            </Pressable>

            {error ? (
              <Text style={styles.error} accessibilityRole="alert">
                {error}
              </Text>
            ) : null}

            <Pressable
              style={[
                styles.primaryButton,
                (!saved || submitting) && { opacity: 0.5 },
              ]}
              onPress={() => void handleContinue()}
              disabled={!saved || submitting}
            >
              <Text style={styles.primaryButtonText}>
                {submitting ? "Guardando…" : "Continuar"}
              </Text>
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    paddingHorizontal: Spacing.md,
  },
  card: {
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    overflow: "hidden",
    maxHeight: "90%",
  },
  headerBg: {
    backgroundColor: Colors.lavender[50],
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.lg,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.white,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
  },
  title: {
    marginTop: Spacing.sm,
    fontSize: 18,
    fontWeight: "700",
    color: Colors.warm[900],
    textAlign: "center",
  },
  subtitle: {
    marginTop: 6,
    fontSize: 12,
    color: Colors.warm[600],
    textAlign: "center",
    lineHeight: 17,
  },
  body: {
    padding: Spacing.lg,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  wordCell: {
    width: "31%",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Colors.warm[50],
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
  },
  wordIdx: {
    fontSize: 10,
    fontFamily: "monospace",
    color: Colors.warm[400],
    minWidth: 18,
    textAlign: "right",
  },
  wordText: {
    fontSize: 13,
    fontWeight: "500",
    color: Colors.warm[800],
  },
  secondaryButton: {
    marginTop: Spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    borderColor: Colors.warm[200],
    backgroundColor: Colors.white,
  },
  secondaryButtonText: {
    fontSize: 13,
    fontWeight: "700",
    color: Colors.warm[700],
  },
  noticeText: {
    marginTop: Spacing.sm,
    fontSize: 11,
    color: Colors.warm[500],
    lineHeight: 16,
  },
  checkRow: {
    marginTop: Spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: Colors.warm[50],
    padding: 12,
    borderRadius: Radius.md,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: Colors.warm[300],
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxOn: {
    backgroundColor: Colors.sage[400],
    borderColor: Colors.sage[400],
  },
  checkLabel: {
    fontSize: 13,
    fontWeight: "500",
    color: Colors.warm[700],
  },
  error: {
    marginTop: 10,
    fontSize: 12,
    color: "#B91C1C",
  },
  primaryButton: {
    marginTop: Spacing.lg,
    paddingVertical: 14,
    borderRadius: Radius.md,
    backgroundColor: Colors.sage[400],
    alignItems: "center",
  },
  primaryButtonText: {
    color: Colors.white,
    fontWeight: "700",
    fontSize: 14,
  },
});
