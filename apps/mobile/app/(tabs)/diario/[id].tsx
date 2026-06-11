import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { diarioApi } from "@psico/api-client";
import { decryptString, encryptString } from "@psico/crypto";
import type { DiaryDetailResponse } from "@psico/types";
import { useAuth } from "@/context/auth";
import { DiaryKeyProvider, useDiaryKey } from "@/crypto/diary-key-context";
import { UnlockGate } from "@/components/dashboard/diario/UnlockGate";
import { Colors, Radius, Spacing } from "@/theme";

const EXCERPT_MAX_CHARS = 280;
const TAGS_MAX = 12;
const TAG_MAX_CHARS = 32;
const MOODS: Array<{ id: string; emoji: string; label: string }> = [
  { id: "calma", emoji: "😌", label: "Calma" },
  { id: "foco", emoji: "🎯", label: "Foco" },
  { id: "energia", emoji: "✨", label: "Energía" },
  { id: "reflexion", emoji: "🕊", label: "Reflexión" },
  { id: "alegria", emoji: "😊", label: "Alegría" },
  { id: "ansiedad", emoji: "😟", label: "Ansiedad" },
  { id: "tristeza", emoji: "😔", label: "Tristeza" },
];

function normalizeTag(raw: string): string | null {
  const cleaned = raw.trim().replace(/^#+/, "").toLowerCase();
  if (!cleaned) return null;
  if (cleaned.length > TAG_MAX_CHARS) return null;
  return cleaned;
}

/**
 * Diary entry detail — mobile.
 *
 * Mirrors apps/web/src/components/dashboard/diario/EntryDetailView.tsx
 * with the same gate-or-decrypt pattern. Body decrypt happens locally;
 * delete uses confirm via native Alert and routes back to /diario on success.
 */
export default function DiaryEntryDetailScreen() {
  const { user } = useAuth();
  if (!user) return null;

  return (
    <DiaryKeyProvider cryptoSalt={user.cryptoSalt}>
      <Inner />
    </DiaryKeyProvider>
  );
}

function Inner() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { key, loadingPersisted } = useDiaryKey();
  const [detail, setDetail] = useState<DiaryDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setError(null);
    try {
      const data = await diarioApi.getDetail(id);
      setDetail(data);
    } catch {
      setError("No se pudo cargar la entrada.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  if (loadingPersisted || loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={Colors.lavender[500]} />
      </View>
    );
  }

  if (error || !detail) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>
          {error ?? "Entrada no encontrada."}
        </Text>
      </View>
    );
  }

  if (!key) {
    return (
      <ScrollView contentContainerStyle={styles.scroll}>
        <UnlockGate />
      </ScrollView>
    );
  }

  return <Decrypted detail={detail} diaryKey={key} />;
}

function Decrypted({
  detail,
  diaryKey,
}: {
  detail: DiaryDetailResponse;
  diaryKey: Uint8Array;
}) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [draftMood, setDraftMood] = useState<string>(detail.entry.mood);
  const [draftTags, setDraftTags] = useState<string[]>(detail.entry.tags);
  const [tagDraft, setTagDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  const decryption = useMemo(() => {
    try {
      return {
        ok: true as const,
        text: decryptString(
          {
            ciphertext: detail.entry.textCiphertext,
            nonce: detail.entry.textNonce,
          },
          diaryKey,
        ),
      };
    } catch {
      return { ok: false as const, text: null };
    }
  }, [detail.entry.textCiphertext, detail.entry.textNonce, diaryKey]);

  function handleDelete() {
    Alert.alert(
      "¿Borrar esta entrada?",
      "No podrás recuperarla — el cifrado E2E no tiene rollback.",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Borrar",
          style: "destructive",
          onPress: async () => {
            setDeleting(true);
            try {
              await diarioApi.remove(detail.entry.id);
              router.replace("/(tabs)/diario");
            } catch {
              Alert.alert("No pudimos borrar", "Reintenta en un momento.");
            } finally {
              setDeleting(false);
            }
          },
        },
      ],
    );
  }

  function startEdit() {
    if (!decryption.ok) return;
    setDraft(decryption.text);
    setDraftMood(detail.entry.mood);
    setDraftTags(detail.entry.tags);
    setTagDraft("");
    setEditing(true);
  }

  function cancelEdit() {
    setEditing(false);
    setDraft("");
    setTagDraft("");
  }

  function commitTag(raw: string) {
    const cleaned = normalizeTag(raw);
    if (!cleaned) return;
    if (draftTags.includes(cleaned)) {
      setTagDraft("");
      return;
    }
    if (draftTags.length >= TAGS_MAX) return;
    setDraftTags([...draftTags, cleaned]);
    setTagDraft("");
  }

  function removeTag(t: string) {
    setDraftTags(draftTags.filter((x) => x !== t));
  }

  async function handleSave() {
    const trimmed = draft.trim();
    if (trimmed.length < 1) {
      Alert.alert("Vacío", "La entrada no puede quedar vacía.");
      return;
    }
    setSaving(true);
    try {
      const body = encryptString(trimmed, diaryKey);
      const excerpt = encryptString(
        trimmed.slice(0, EXCERPT_MAX_CHARS),
        diaryKey,
      );
      const payload: Record<string, unknown> = {
        textCiphertext: body.ciphertext,
        textNonce: body.nonce,
        excerptCiphertext: excerpt.ciphertext,
        excerptNonce: excerpt.nonce,
      };
      if (draftMood !== detail.entry.mood) payload.mood = draftMood;
      const tagsChanged =
        draftTags.length !== detail.entry.tags.length ||
        draftTags.some((t, i) => t !== detail.entry.tags[i]);
      if (tagsChanged) payload.tags = draftTags;
      await diarioApi.update(
        detail.entry.id,
        payload as Parameters<typeof diarioApi.update>[1],
      );
      // Mutate local detail so the body re-decrypts to the new cipher
      detail.entry.textCiphertext = body.ciphertext;
      detail.entry.textNonce = body.nonce;
      if (draftMood !== detail.entry.mood) detail.entry.mood = draftMood;
      if (tagsChanged) detail.entry.tags = draftTags;
      setEditing(false);
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2500);
    } catch (e) {
      Alert.alert(
        "No pudimos guardar",
        e instanceof Error ? e.message : "Reintenta en un momento.",
      );
    } finally {
      setSaving(false);
    }
  }

  const created = new Date(detail.entry.createdAt);

  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <View style={styles.metaRow}>
        <View style={styles.kindBadge}>
          <Text style={styles.kindBadgeText}>
            {detail.entry.kind === "prompted"
              ? "Reflexión"
              : detail.entry.kind === "voz"
                ? "Voz"
                : "Libre"}
          </Text>
        </View>
        <Text style={styles.dateText}>
          {created.toLocaleDateString("es-EC", {
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric",
          })}
          {" · "}
          {created.toLocaleTimeString("es-EC", {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </Text>
      </View>

      <View style={styles.moodRow}>
        <View
          style={[styles.moodSwatch, { backgroundColor: Colors.lavender[400] }]}
        />
        <Text style={styles.moodName}>
          {detail.entry.mood[0]?.toUpperCase() + detail.entry.mood.slice(1)}
        </Text>
      </View>

      {detail.entry.promptText ? (
        <View style={styles.promptBlock}>
          <Text style={styles.promptText}>✎ {detail.entry.promptText}</Text>
        </View>
      ) : null}

      {decryption.ok && editing ? (
        <View style={styles.editorCard}>
          <Text style={styles.editorLabel}>EDITAR ENTRADA</Text>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            multiline
            editable={!saving}
            maxLength={20000}
            placeholder="Escribe tu entrada…"
            style={styles.editorInput}
            textAlignVertical="top"
          />
          <Text style={styles.editorCount}>
            {draft.length.toLocaleString("es-EC")} / 20.000 · cifrado en tu
            dispositivo
          </Text>

          {/* Mood selector */}
          <Text style={styles.editorSubLabel}>MOOD</Text>
          <View style={styles.moodChipRow}>
            {MOODS.map((m) => {
              const active = m.id === draftMood;
              return (
                <Pressable
                  key={m.id}
                  onPress={() => setDraftMood(m.id)}
                  disabled={saving}
                  style={[
                    styles.moodChip,
                    active && styles.moodChipActive,
                    saving && { opacity: 0.5 },
                  ]}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                >
                  <Text style={styles.moodChipEmoji}>{m.emoji}</Text>
                  <Text
                    style={[
                      styles.moodChipLabel,
                      active && styles.moodChipLabelActive,
                    ]}
                  >
                    {m.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Tags */}
          <Text style={styles.editorSubLabel}>ETIQUETAS</Text>
          <View style={styles.tagChipRow}>
            {draftTags.map((t) => (
              <View key={t} style={styles.tagChip}>
                <Text style={styles.tagChipText}>#{t}</Text>
                <Pressable
                  onPress={() => removeTag(t)}
                  disabled={saving}
                  accessibilityLabel={`Quitar ${t}`}
                  style={styles.tagChipRemove}
                >
                  <Text style={styles.tagChipRemoveText}>×</Text>
                </Pressable>
              </View>
            ))}
          </View>
          {draftTags.length < TAGS_MAX ? (
            <TextInput
              value={tagDraft}
              onChangeText={setTagDraft}
              onSubmitEditing={() => commitTag(tagDraft)}
              onBlur={() => {
                if (tagDraft.trim()) commitTag(tagDraft);
              }}
              editable={!saving}
              maxLength={TAG_MAX_CHARS}
              placeholder="añadir etiqueta…"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="done"
              style={styles.tagInput}
              accessibilityLabel="Añadir etiqueta"
            />
          ) : null}
          <Text style={styles.tagCount}>
            {draftTags.length}/{TAGS_MAX} · Enter para añadir
          </Text>

          <View style={styles.editorActions}>
            <Pressable
              onPress={cancelEdit}
              disabled={saving}
              style={[styles.cancelBtn, saving && { opacity: 0.5 }]}
            >
              <Text style={styles.cancelText}>Cancelar</Text>
            </Pressable>
            <Pressable
              onPress={handleSave}
              disabled={saving}
              style={[styles.saveBtn, saving && { opacity: 0.5 }]}
            >
              <Text style={styles.saveText}>
                {saving ? "Guardando…" : "Guardar"}
              </Text>
            </Pressable>
          </View>
        </View>
      ) : decryption.ok ? (
        <View style={styles.bodyCard}>
          <Text style={styles.bodyText}>{decryption.text}</Text>
          {savedFlash ? (
            <Text style={styles.savedFlashText}>✓ Cambios guardados</Text>
          ) : null}
        </View>
      ) : (
        <View style={styles.cipherCard}>
          <Ionicons name="lock-closed" size={14} color={Colors.warm[500]} />
          <Text style={styles.cipherText}>
            No pudimos descifrar esta entrada con tu clave actual.
          </Text>
        </View>
      )}

      {detail.entry.tags.length > 0 ? (
        <View style={styles.tagsRow}>
          {detail.entry.tags.map((t) => (
            <View key={t} style={styles.tag}>
              <Text style={styles.tagText}>#{t}</Text>
            </View>
          ))}
        </View>
      ) : null}

      <View style={styles.footer}>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.backText}>← Volver al diario</Text>
        </Pressable>
        <View style={styles.footerRight}>
          {decryption.ok && !editing ? (
            <Pressable onPress={startEdit} style={styles.editBtn}>
              <Ionicons
                name="create-outline"
                size={13}
                color={Colors.lavender[700]}
              />
              <Text style={styles.editText}>Editar</Text>
            </Pressable>
          ) : null}
          <Pressable
            onPress={handleDelete}
            disabled={deleting || editing}
            style={[
              styles.deleteBtn,
              (deleting || editing) && { opacity: 0.5 },
            ]}
          >
            <Ionicons name="trash" size={13} color={Colors.white} />
            <Text style={styles.deleteText}>
              {deleting ? "Borrando…" : "Borrar"}
            </Text>
          </Pressable>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    padding: Spacing.md,
    paddingBottom: Spacing.xxl,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing.lg,
    backgroundColor: Colors.warm[50],
  },
  errorText: {
    fontSize: 14,
    color: Colors.warm[600],
    textAlign: "center",
  },

  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    alignItems: "center",
  },
  kindBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: Colors.warm[100],
    borderRadius: Radius.full,
  },
  kindBadgeText: {
    fontSize: 9.5,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: Colors.warm[700],
  },
  dateText: {
    fontSize: 11,
    color: Colors.warm[500],
  },

  moodRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: Spacing.sm,
  },
  moodSwatch: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  moodName: {
    fontSize: 12,
    color: Colors.warm[600],
  },

  promptBlock: {
    marginTop: Spacing.md,
    padding: Spacing.sm + 2,
    backgroundColor: Colors.lavender[50],
    borderWidth: 1.5,
    borderColor: Colors.lavender[100],
    borderRadius: Radius.md,
  },
  promptText: {
    fontSize: 13,
    fontStyle: "italic",
    color: Colors.lavender[700],
  },

  bodyCard: {
    marginTop: Spacing.md,
    padding: Spacing.lg,
    backgroundColor: Colors.white,
    borderWidth: 1.5,
    borderColor: Colors.warm[200],
    borderRadius: Radius.lg,
  },
  bodyText: {
    fontSize: 15,
    lineHeight: 22,
    color: Colors.warm[800],
  },

  cipherCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: Spacing.md,
    padding: Spacing.md,
    backgroundColor: Colors.warm[100],
    borderWidth: 1.5,
    borderColor: Colors.warm[300],
    borderRadius: Radius.md,
  },
  cipherText: {
    fontSize: 12,
    color: Colors.warm[600],
    flex: 1,
  },

  tagsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: Spacing.md,
  },
  tag: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    backgroundColor: Colors.warm[100],
    borderRadius: Radius.full,
  },
  tagText: {
    fontSize: 11,
    fontWeight: "700",
    color: Colors.warm[600],
  },

  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: Spacing.xl,
  },
  backText: {
    fontSize: 12,
    fontWeight: "700",
    color: Colors.warm[600],
    textDecorationLine: "underline",
  },
  deleteBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    backgroundColor: Colors.error,
    borderRadius: Radius.md,
  },
  deleteText: {
    color: Colors.white,
    fontSize: 12,
    fontWeight: "700",
  },
  footerRight: {
    flexDirection: "row",
    gap: 8,
  },
  editBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    backgroundColor: Colors.lavender[100],
    borderRadius: Radius.md,
  },
  editText: {
    color: Colors.lavender[700],
    fontSize: 12,
    fontWeight: "700",
  },

  editorCard: {
    marginTop: Spacing.md,
    padding: Spacing.md,
    backgroundColor: Colors.white,
    borderWidth: 1.5,
    borderColor: Colors.lavender[300],
    borderRadius: Radius.lg,
  },
  editorLabel: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.8,
    color: Colors.lavender[700],
    marginBottom: 6,
  },
  editorInput: {
    minHeight: 180,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 15,
    lineHeight: 22,
    color: Colors.warm[800],
    backgroundColor: Colors.warm[50],
    borderRadius: Radius.md,
    borderWidth: 1.5,
    borderColor: Colors.warm[200],
  },
  editorCount: {
    marginTop: 6,
    fontSize: 11,
    color: Colors.warm[500],
    textAlign: "right",
  },
  editorActions: {
    marginTop: Spacing.md,
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
  },
  cancelBtn: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    backgroundColor: Colors.warm[100],
    borderRadius: Radius.md,
  },
  cancelText: {
    color: Colors.warm[700],
    fontSize: 12,
    fontWeight: "700",
  },
  saveBtn: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    backgroundColor: Colors.lavender[500],
    borderRadius: Radius.md,
  },
  saveText: {
    color: Colors.white,
    fontSize: 12,
    fontWeight: "700",
  },
  savedFlashText: {
    marginTop: 8,
    fontSize: 12,
    fontWeight: "700",
    color: Colors.sage[700],
  },

  editorSubLabel: {
    marginTop: Spacing.md,
    marginBottom: 6,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.8,
    color: Colors.lavender[700],
  },
  moodChipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  moodChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: Colors.warm[50],
    borderWidth: 1.5,
    borderColor: Colors.warm[200],
    borderRadius: Radius.full,
  },
  moodChipActive: {
    backgroundColor: Colors.lavender[100],
    borderColor: Colors.lavender[400],
  },
  moodChipEmoji: {
    fontSize: 13,
  },
  moodChipLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: Colors.warm[700],
  },
  moodChipLabelActive: {
    color: Colors.lavender[700],
  },

  tagChipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 6,
  },
  tagChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: Colors.warm[100],
    borderRadius: Radius.full,
  },
  tagChipText: {
    fontSize: 12,
    fontWeight: "700",
    color: Colors.warm[700],
  },
  tagChipRemove: {
    width: 16,
    height: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.warm[200],
    borderRadius: 8,
  },
  tagChipRemoveText: {
    fontSize: 11,
    fontWeight: "700",
    color: Colors.warm[700],
    lineHeight: 12,
  },
  tagInput: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 12,
    color: Colors.warm[800],
    backgroundColor: Colors.warm[50],
    borderRadius: Radius.md,
    borderWidth: 1.5,
    borderColor: Colors.warm[200],
  },
  tagCount: {
    marginTop: 4,
    fontSize: 11,
    color: Colors.warm[500],
  },
});
