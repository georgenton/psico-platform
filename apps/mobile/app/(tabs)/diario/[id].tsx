import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { diarioApi } from "@psico/api-client";
import { decryptString } from "@psico/crypto";
import type { DiaryDetailResponse } from "@psico/types";
import { useAuth } from "@/context/auth";
import { DiaryKeyProvider, useDiaryKey } from "@/crypto/diary-key-context";
import { UnlockGate } from "@/components/dashboard/diario/UnlockGate";
import { Colors, Radius, Spacing } from "@/theme";

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

      {decryption.ok ? (
        <View style={styles.bodyCard}>
          <Text style={styles.bodyText}>{decryption.text}</Text>
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
        <Pressable
          onPress={handleDelete}
          disabled={deleting}
          style={[styles.deleteBtn, deleting && { opacity: 0.5 }]}
        >
          <Ionicons name="trash" size={13} color={Colors.white} />
          <Text style={styles.deleteText}>
            {deleting ? "Borrando…" : "Borrar"}
          </Text>
        </Pressable>
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
});
