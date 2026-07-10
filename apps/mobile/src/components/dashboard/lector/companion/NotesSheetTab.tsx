import { useEffect, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { AnnotationSummary } from "@psico/types";
import { Colors, Radius, Spacing } from "@/theme";

/**
 * NotesSheetTab — the "Notas" tab of the reader companion sheet.
 *
 * A nota (`Annotation`) is a short plaintext note about a passage of the book —
 * not encrypted (by design), distinct from a reflexión. Shows a composer when a
 * block is pending (the user picked "Nota" on a long-press) + the full list of
 * the chapter's notes, with delete.
 */
export function NotesSheetTab({
  annotations,
  pendingBlockId,
  onClearPending,
  onCreate,
  onDelete,
}: {
  annotations: AnnotationSummary[];
  pendingBlockId: string | null;
  onClearPending: () => void;
  onCreate: (blockId: string, text: string) => Promise<void>;
  onDelete: (id: string) => void;
}) {
  const [draft, setDraft] = useState("");

  useEffect(() => {
    if (!pendingBlockId) setDraft("");
  }, [pendingBlockId]);

  return (
    <ScrollView
      style={styles.body}
      contentContainerStyle={styles.bodyContent}
      keyboardShouldPersistTaps="handled"
    >
      {pendingBlockId ? (
        <View style={styles.composer}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            multiline
            autoFocus
            placeholder="Escribe tu nota sobre este pasaje…"
            placeholderTextColor={Colors.warm[400]}
            style={styles.input}
          />
          <View style={styles.composerActions}>
            <Pressable
              onPress={() => {
                setDraft("");
                onClearPending();
              }}
              style={styles.cancelBtn}
            >
              <Text style={styles.cancelText}>Cancelar</Text>
            </Pressable>
            <Pressable
              onPress={async () => {
                if (!draft.trim()) return;
                await onCreate(pendingBlockId, draft.trim());
                setDraft("");
                onClearPending();
              }}
              disabled={!draft.trim()}
              style={[styles.saveBtn, !draft.trim() && { opacity: 0.5 }]}
            >
              <Text style={styles.saveText}>Guardar</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {annotations.length === 0 ? (
        <Text style={styles.empty}>
          Aún no hay notas en este capítulo. Mantén presionado un párrafo y
          elige “Añadir nota”.
        </Text>
      ) : (
        annotations.map((a) => (
          <View key={a.id} style={styles.noteCard}>
            <Text style={styles.noteText}>{a.text}</Text>
            <View style={styles.noteFooter}>
              <Text style={styles.noteDate}>
                {new Date(a.createdAt).toLocaleDateString("es-EC", {
                  day: "numeric",
                  month: "short",
                })}
              </Text>
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
                        onPress: () => onDelete(a.id),
                      },
                    ],
                  )
                }
                hitSlop={8}
              >
                <Ionicons
                  name="trash-outline"
                  size={16}
                  color={Colors.warm[500]}
                />
              </Pressable>
            </View>
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1 },
  bodyContent: { padding: Spacing.lg, gap: Spacing.sm },
  composer: {
    backgroundColor: Colors.lavender[50],
    borderRadius: Radius.md,
    padding: Spacing.sm + 2,
    marginBottom: Spacing.sm,
  },
  input: {
    minHeight: 70,
    borderWidth: 1.5,
    borderColor: Colors.warm[200],
    backgroundColor: "white",
    borderRadius: Radius.md,
    padding: 10,
    fontSize: 13,
    color: Colors.warm[900],
    textAlignVertical: "top",
  },
  composerActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  cancelBtn: { paddingHorizontal: 12, paddingVertical: 7 },
  cancelText: { color: Colors.warm[500], fontWeight: "600", fontSize: 12 },
  saveBtn: {
    borderRadius: Radius.md,
    backgroundColor: Colors.lavender[500],
    paddingHorizontal: 16,
    paddingVertical: 7,
  },
  saveText: { color: "white", fontWeight: "700", fontSize: 12 },
  empty: {
    fontSize: 13,
    color: Colors.warm[500],
    textAlign: "center",
    paddingVertical: Spacing.xl,
  },
  noteCard: {
    borderWidth: 1.5,
    borderColor: Colors.warm[200],
    backgroundColor: "white",
    borderRadius: Radius.md,
    padding: Spacing.sm + 2,
  },
  noteText: { fontSize: 13, lineHeight: 20, color: Colors.warm[800] },
  noteFooter: {
    marginTop: Spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  noteDate: { fontSize: 11, color: Colors.warm[500] },
});
