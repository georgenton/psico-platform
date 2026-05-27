import { useMemo, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { masterKeyToSeedPhrase } from "@psico/crypto";
import { apiClient } from "@psico/api-client";
import { Colors, Radius, Spacing } from "@/theme";

/**
 * SeedPhraseModal (mobile) — first-unlock backup flow.
 *
 * Mirrors the web modal: render the 24-word BIP39 phrase derived from the
 * user's master key, then ask them to retype 3 random positions before
 * marking `cryptoSeedShownAt` server-side via apiClient.
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
  const [confirmIndexes] = useState<number[]>(() => pickThreeIndexes());
  const [step, setStep] = useState<"view" | "confirm">("view");
  const [inputs, setInputs] = useState<string[]>(["", "", ""]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleConfirm() {
    const ok = confirmIndexes.every(
      (idx, slot) =>
        inputs[slot].trim().toLowerCase() === words[idx].toLowerCase(),
    );
    if (!ok) {
      setError(
        "Una o más palabras no coinciden. Revísalas — el orden y la ortografía importan.",
      );
      return;
    }
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
    <Modal
      visible
      transparent
      animationType="fade"
      statusBarTranslucent
      // We intentionally do NOT wire onRequestClose — the user must reach the
      // confirm step to dismiss. Android back button is no-op (handled by
      // the parent screen).
    >
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.headerBg}>
            <View style={styles.iconCircle}>
              <Ionicons name="key" size={20} color={Colors.lavender[700]} />
            </View>
            <Text style={styles.title}>Anota tu frase de recuperación</Text>
            <Text style={styles.subtitle}>
              Si olvidas tu contraseña, estas 24 palabras son la única forma de
              recuperar tu diario. No las guardamos.
            </Text>
          </View>

          {step === "view" ? (
            <ScrollView contentContainerStyle={styles.body}>
              <View style={styles.grid}>
                {words.map((w, i) => (
                  <View key={i} style={styles.wordCell}>
                    <Text style={styles.wordIdx}>{i + 1}.</Text>
                    <Text style={styles.wordText}>{w}</Text>
                  </View>
                ))}
              </View>
              <View style={styles.notice}>
                <Text style={styles.noticeText}>
                  <Text style={{ fontWeight: "700" }}>Cómo guardarlas: </Text>
                  en papel, en un lugar seguro. Evita capturas de pantalla.
                </Text>
              </View>
              <Pressable
                style={styles.primaryButton}
                onPress={() => setStep("confirm")}
              >
                <Text style={styles.primaryButtonText}>
                  Las anoté, continuar
                </Text>
              </Pressable>
            </ScrollView>
          ) : (
            <ScrollView contentContainerStyle={styles.body}>
              <Text style={styles.bodyText}>
                Para confirmar que las anotaste, escribe las palabras que
                corresponden a estas posiciones:
              </Text>
              {confirmIndexes.map((idx, slot) => (
                <View key={idx} style={{ marginTop: Spacing.md }}>
                  <Text style={styles.label}>Palabra #{idx + 1}</Text>
                  <TextInput
                    style={styles.input}
                    value={inputs[slot]}
                    onChangeText={(v) => {
                      const next = [...inputs];
                      next[slot] = v;
                      setInputs(next);
                    }}
                    autoCapitalize="none"
                    autoCorrect={false}
                    spellCheck={false}
                  />
                </View>
              ))}
              {error ? (
                <Text style={styles.error} accessibilityRole="alert">
                  {error}
                </Text>
              ) : null}
              <Pressable
                style={[
                  styles.primaryButton,
                  (submitting || inputs.some((v) => !v.trim())) && {
                    opacity: 0.5,
                  },
                ]}
                onPress={() => void handleConfirm()}
                disabled={submitting || inputs.some((v) => !v.trim())}
              >
                <Text style={styles.primaryButtonText}>
                  {submitting ? "Guardando…" : "Confirmar"}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  setStep("view");
                  setInputs(["", "", ""]);
                  setError(null);
                }}
              >
                <Text style={styles.backLink}>← Volver a ver las palabras</Text>
              </Pressable>
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

function pickThreeIndexes(): number[] {
  const chosen = new Set<number>();
  while (chosen.size < 3) {
    chosen.add(Math.floor(Math.random() * 24));
  }
  return [...chosen].sort((a, b) => a - b);
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
  bodyText: {
    fontSize: 13,
    color: Colors.warm[700],
    lineHeight: 19,
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
  notice: {
    marginTop: Spacing.md,
    backgroundColor: Colors.warm[50],
    borderColor: Colors.warm[200],
    borderWidth: 1,
    borderRadius: Radius.md,
    padding: 10,
  },
  noticeText: {
    fontSize: 11,
    color: Colors.warm[600],
    lineHeight: 16,
  },
  label: {
    fontSize: 10.5,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
    color: Colors.warm[500],
    marginBottom: 6,
  },
  input: {
    backgroundColor: Colors.warm[50],
    borderWidth: 1.5,
    borderColor: Colors.warm[200],
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.sm + 2,
    paddingVertical: 10,
    fontSize: 14,
    color: Colors.warm[800],
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
  backLink: {
    marginTop: Spacing.md,
    textAlign: "center",
    fontSize: 12,
    color: Colors.warm[500],
    textDecorationLine: "underline",
  },
});
