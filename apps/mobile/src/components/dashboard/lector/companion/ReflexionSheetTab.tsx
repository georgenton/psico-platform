import { useEffect, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { diarioApi, emotionalMapApi } from "@psico/api-client";
import { analyzeReflectionText, DIARY_MOODS } from "@psico/types";
import type { CreateDiaryEntryRequest } from "@psico/types";
import { encryptString } from "@psico/crypto";
import { useDiaryKey } from "@/crypto/diary-key-context";
import { UnlockGate } from "@/components/dashboard/diario/UnlockGate";
import { textAnalysisConsent } from "@/lib/text-analysis-consent";
import { Colors, Radius, Spacing } from "@/theme";

/**
 * ReflexionSheetTab — the "Reflexión" tab of the reader companion sheet.
 *
 * A reflexión is an E2E-encrypted diary entry about the READER — what a passage
 * stirred in them (distinct from a nota, which is plaintext and about the text).
 * Same crypto as the Diario composer: encrypt in the app with the diary key,
 * upload only ciphertext; analyze on device and upload only numbers (Etapa 6).
 * Feeds the Mapa Emocional.
 */

/** Build the reflexión seed from a highlighted passage. */
export function reflexionSeed(passage: string): string {
  const clean = passage.trim().replace(/\s+/g, " ");
  const quote =
    clean.length > 200 ? `${clean.slice(0, 200).trimEnd()}…` : clean;
  return `Leí esto: «${quote}»\n\nMe hizo pensar en… `;
}

export function ReflexionSheetTab({
  seed,
  onSeedConsumed,
  onAskEco,
}: {
  /** Pre-computed composer seed (a quoted passage or an exercise prompt). */
  seed: string | null;
  onSeedConsumed: () => void;
  /** Post-save nudge — switch the sheet to Eco, seeded (backlog). */
  onAskEco?: () => void;
}) {
  const { key, isLegacyAccount } = useDiaryKey();
  const router = useRouter();

  const [text, setText] = useState("");
  const [mood, setMood] = useState("ok");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!seed) return;
    setText((prev) => (prev ? prev : seed));
    onSeedConsumed();
  }, [seed, onSeedConsumed]);

  async function handleSave() {
    if (!key || !text.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const trimmed = text.trim();
      const envelope = encryptString(trimmed, key);
      const excerptText =
        trimmed.length > 140 ? `${trimmed.slice(0, 140).trimEnd()}…` : trimmed;
      const excerpt = encryptString(excerptText, key);
      const body: CreateDiaryEntryRequest = {
        mood,
        kind: "free",
        textCiphertext: envelope.ciphertext,
        textNonce: envelope.nonce,
        excerptCiphertext: excerpt.ciphertext,
        excerptNonce: excerpt.nonce,
      };
      const created = await diarioApi.create(body);
      // Etapa 6 — analyze on device, upload ONLY numbers. Fase D (L4):
      // requires explicit consent — without it we don't analyze at all.
      if (await textAnalysisConsent().catch(() => false)) {
        const features = analyzeReflectionText(trimmed);
        if (features) {
          void emotionalMapApi
            .logTextFeatures({ ...features, entryId: created.id })
            .catch(() => undefined);
        }
      }
      setText("");
      setSaved(true);
    } catch {
      setError("No pudimos guardar tu reflexión. Reintenta.");
    } finally {
      setSaving(false);
    }
  }

  if (isLegacyAccount) {
    return (
      <View style={styles.pad}>
        <Text style={styles.muted}>
          Tu cuenta aún no tiene activada la protección de privacidad. Contacta
          soporte para escribir reflexiones cifradas.
        </Text>
      </View>
    );
  }

  if (!key) {
    return (
      <ScrollView
        contentContainerStyle={styles.unlockScroll}
        keyboardShouldPersistTaps="handled"
      >
        <UnlockGate context="diario" />
      </ScrollView>
    );
  }

  if (saved) {
    return (
      <View style={styles.savedWrap}>
        <Text style={styles.savedIcon}>🪷</Text>
        <Text style={styles.savedTitle}>Guardado en tu diario</Text>
        <Text style={styles.savedBody}>
          Tu reflexión quedó cifrada y sumó a tu Mapa Emocional.
        </Text>
        {onAskEco ? (
          <Pressable onPress={onAskEco} style={styles.savedEcoBtn}>
            <Text style={styles.savedAgainText}>🌿 Conversarlo con Eco</Text>
          </Pressable>
        ) : null}
        <Pressable onPress={() => setSaved(false)} style={styles.savedAgainBtn}>
          <Text style={styles.savedAgainTextMuted}>Escribir otra</Text>
        </Pressable>
        <Pressable onPress={() => router.push("/reflexiones" as never)}>
          <Text style={styles.savedLink}>Ver en Reflexiones →</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.body}
      contentContainerStyle={styles.bodyContent}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.eyebrow}>
        Una reflexión es sobre ti — se cifra y solo tú la lees
      </Text>

      <View style={styles.moodRow}>
        {DIARY_MOODS.map((m) => {
          const active = m.id === mood;
          return (
            <Pressable
              key={m.id}
              onPress={() => setMood(m.id)}
              disabled={saving}
              style={[styles.moodChip, active && styles.moodChipActive]}
            >
              <Text
                style={[
                  styles.moodChipText,
                  active && styles.moodChipTextActive,
                ]}
              >
                {m.emoji} {m.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <TextInput
        value={text}
        onChangeText={setText}
        editable={!saving}
        multiline
        placeholder="¿Qué te movió de lo que leíste? Nadie lo lee más que tú."
        placeholderTextColor={Colors.warm[400]}
        style={styles.input}
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable
        onPress={handleSave}
        disabled={saving || !text.trim()}
        style={[styles.saveBtn, (saving || !text.trim()) && { opacity: 0.5 }]}
      >
        <Text style={styles.saveBtnText}>
          {saving ? "Cifrando…" : "🪷 Guardar reflexión"}
        </Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  pad: { padding: Spacing.lg },
  unlockScroll: { flexGrow: 1, justifyContent: "center", padding: Spacing.lg },
  muted: { fontSize: 13, color: Colors.warm[600], textAlign: "center" },
  body: { flex: 1 },
  bodyContent: { padding: Spacing.lg },
  eyebrow: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1,
    color: Colors.warm[500],
    marginBottom: Spacing.sm,
  },
  moodRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  moodChip: {
    borderWidth: 1.5,
    borderColor: Colors.warm[200],
    backgroundColor: Colors.warm[50],
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  moodChipActive: {
    backgroundColor: Colors.warm[900],
    borderColor: Colors.warm[900],
  },
  moodChipText: { fontSize: 11.5, fontWeight: "600", color: Colors.warm[800] },
  moodChipTextActive: { color: Colors.warm[50] },
  input: {
    marginTop: Spacing.md,
    minHeight: 140,
    borderWidth: 1.5,
    borderColor: Colors.warm[200],
    backgroundColor: Colors.warm[50],
    borderRadius: Radius.md,
    padding: Spacing.sm + 2,
    fontSize: 14,
    lineHeight: 21,
    color: Colors.warm[800],
    textAlignVertical: "top",
  },
  error: { marginTop: Spacing.sm, fontSize: 12, color: "#B91C1C" },
  saveBtn: {
    marginTop: Spacing.md,
    borderRadius: Radius.md,
    backgroundColor: Colors.sage[400],
    paddingVertical: 13,
    alignItems: "center",
  },
  saveBtnText: { color: "white", fontWeight: "700", fontSize: 13 },
  savedWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing.xl,
    gap: 6,
  },
  savedIcon: { fontSize: 26 },
  savedTitle: { fontSize: 15, fontWeight: "700", color: Colors.warm[900] },
  savedBody: {
    fontSize: 12.5,
    color: Colors.warm[500],
    textAlign: "center",
    marginBottom: Spacing.sm,
  },
  savedEcoBtn: {
    borderRadius: 999,
    backgroundColor: Colors.sage[500],
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginBottom: Spacing.xs,
  },
  savedAgainBtn: {
    borderRadius: 999,
    backgroundColor: Colors.warm[100],
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  savedAgainText: { color: "white", fontWeight: "700", fontSize: 12.5 },
  savedAgainTextMuted: {
    color: Colors.warm[800],
    fontWeight: "700",
    fontSize: 12.5,
  },
  savedLink: {
    marginTop: 8,
    fontSize: 12.5,
    color: Colors.lavender[700],
    fontWeight: "600",
  },
});
