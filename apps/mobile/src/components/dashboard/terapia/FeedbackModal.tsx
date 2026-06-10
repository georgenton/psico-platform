import { useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { encryptString } from "@psico/crypto";
import { terapiaApi } from "@psico/api-client";
import { Colors, Radius, Spacing } from "@/theme";
import { useDiaryKey } from "@/crypto/diary-key-context";

const TAGS = [
  "empático",
  "puntual",
  "claro",
  "me-ayudó",
  "incómodo",
  "no-conectamos",
];

interface Props {
  sessionId: string;
  visible: boolean;
  onClose: () => void;
  onDone: () => void;
}

export function FeedbackModal({
  sessionId,
  visible,
  onClose,
  onDone,
}: Props) {
  const { key } = useDiaryKey();
  const [rating, setRating] = useState(0);
  const [tags, setTags] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function toggleTag(t: string) {
    setTags((cur) =>
      cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t],
    );
  }

  async function handleSubmit() {
    if (rating === 0) {
      setError("Elegí un rating (1 a 5).");
      return;
    }
    setError(null);
    setPending(true);
    try {
      const trimmed = note.trim();
      type FeedbackBody = Parameters<typeof terapiaApi.submitFeedback>[1];
      const body: FeedbackBody = { rating, tags };
      if (trimmed && key) {
        const env = encryptString(trimmed, key);
        body.noteCiphertext = env.ciphertext;
        body.noteNonce = env.nonce;
      }
      await terapiaApi.submitFeedback(sessionId, body);
      onDone();
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "No pudimos guardar tu feedback.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          style={styles.sheet}
        >
          <Text style={styles.title}>¿Cómo te fue?</Text>
          <Text style={styles.subtitle}>
            Tu nota se cifra antes de salir del dispositivo. Solo vos podés
            leerla.
          </Text>

          <View style={styles.starsRow}>
            {[1, 2, 3, 4, 5].map((n) => (
              <Pressable
                key={n}
                onPress={() => setRating(n)}
                hitSlop={6}
              >
                <Text
                  style={[
                    styles.star,
                    {
                      color:
                        rating >= n
                          ? Colors.lavender[600]
                          : Colors.warm[300],
                    },
                  ]}
                >
                  ★
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.fieldLabel}>Tags</Text>
          <View style={styles.chipRow}>
            {TAGS.map((t) => {
              const active = tags.includes(t);
              return (
                <Pressable
                  key={t}
                  onPress={() => toggleTag(t)}
                  style={[
                    styles.tagChip,
                    {
                      backgroundColor: active
                        ? Colors.lavender[100]
                        : Colors.warm[100],
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.tagChipText,
                      {
                        color: active
                          ? Colors.lavender[700]
                          : Colors.warm[700],
                      },
                    ]}
                  >
                    {t}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.fieldLabel}>Nota (opcional, E2E)</Text>
          <TextInput
            value={note}
            onChangeText={setNote}
            multiline
            numberOfLines={3}
            placeholder="Algo que querés recordar de esta sesión…"
            placeholderTextColor={Colors.warm[400]}
            style={styles.noteInput}
          />
          {note && !key ? (
            <Text style={styles.helperText}>
              Desbloqueá tu Diario para cifrar la nota.
            </Text>
          ) : null}

          {error ? (
            <View style={styles.errorBlock}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <View style={styles.footer}>
            <Pressable
              onPress={onClose}
              disabled={pending}
              style={styles.cancelLink}
            >
              <Text style={styles.cancelLinkText}>Cancelar</Text>
            </Pressable>
            <Pressable
              onPress={handleSubmit}
              disabled={pending}
              style={styles.submitButton}
            >
              <Text style={styles.submitButtonText}>
                {pending ? "Guardando…" : "Cerrar sesión"}
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    maxHeight: "85%",
  },
  scrollContent: {
    padding: Spacing.lg,
    paddingBottom: Spacing.xl,
  },
  title: { fontSize: 18, fontWeight: "600", color: Colors.warm[900] },
  subtitle: {
    fontSize: 12,
    color: Colors.warm[500],
    marginTop: Spacing.xs,
  },
  starsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginVertical: Spacing.md,
  },
  star: { fontSize: 36 },
  fieldLabel: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    color: Colors.warm[500],
    marginTop: Spacing.md,
    marginBottom: Spacing.xs,
  },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: Spacing.xs },
  tagChip: {
    paddingHorizontal: Spacing.sm + 2,
    paddingVertical: Spacing.xs,
    borderRadius: 999,
  },
  tagChipText: { fontSize: 12, fontWeight: "500" },
  noteInput: {
    backgroundColor: Colors.white,
    borderColor: Colors.warm[200],
    borderWidth: 1.5,
    borderRadius: Radius.md,
    padding: Spacing.sm + 2,
    fontSize: 13,
    color: Colors.warm[900],
    minHeight: 80,
    textAlignVertical: "top",
  },
  helperText: {
    fontSize: 11,
    color: Colors.warm[500],
    marginTop: Spacing.xs,
  },
  errorBlock: {
    backgroundColor: Colors.rose[50],
    padding: Spacing.sm,
    borderRadius: Radius.md,
    marginTop: Spacing.md,
  },
  errorText: { fontSize: 12, color: Colors.rose[700] },
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: Spacing.lg,
  },
  cancelLink: { padding: Spacing.sm },
  cancelLinkText: { fontSize: 13, color: Colors.warm[700] },
  submitButton: {
    backgroundColor: Colors.sage[600],
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
    borderRadius: Radius.md,
  },
  submitButtonText: { fontSize: 14, color: Colors.white, fontWeight: "600" },
});
