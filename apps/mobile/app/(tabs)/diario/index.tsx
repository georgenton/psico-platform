import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { diarioApi } from "@psico/api-client";
import { decryptString, encryptString } from "@psico/crypto";
import type {
  CreateDiaryEntryRequest,
  DiaryEntrySummary,
  DiaryPromptOfTheDay,
} from "@psico/types";
import { useAuth } from "@/context/auth";
import { useDiaryKey } from "@/crypto/diary-key-context";
import { SeedPhraseModal } from "@/components/dashboard/diario/SeedPhraseModal";
import { UnlockGate } from "@/components/dashboard/diario/UnlockGate";
import { Colors, Radius, Spacing } from "@/theme";
import { apiClient } from "@psico/api-client";
import type { UserMeResponse } from "@psico/types";

/**
 * Diario — mobile, fully functional with E2E encryption.
 *
 * The DiaryKeyProvider lives one level up in app/(tabs)/_layout.tsx so the
 * unlock state survives navigation across tabs (specifically: Seguridad
 * needs the in-memory master key to perform password-change-with-rekey).
 * Here we just read from it.
 */
export default function DiarioScreen() {
  const { user } = useAuth();
  if (!user) return null;
  return <DiarioInner />;
}

function DiarioInner() {
  const { key, masterKey, loadingPersisted } = useDiaryKey();
  const [entries, setEntries] = useState<DiaryEntrySummary[]>([]);
  const [prompt, setPrompt] = useState<DiaryPromptOfTheDay | null>(null);
  const [loading, setLoading] = useState(true);
  // Seed phrase modal trigger. We fetch /user/me lazily once the user is
  // unlocked so we know whether they've already acknowledged the backup.
  const [seedAlreadyShown, setSeedAlreadyShown] = useState<boolean | null>(
    null,
  );

  const load = useCallback(async () => {
    try {
      const [list, p] = await Promise.all([
        diarioApi.list({ perPage: 30 }),
        diarioApi.getPromptOfTheDay().catch(() => null),
      ]);
      setEntries(list.entries);
      setPrompt(p);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Once the diary is unlocked AND we have the master key in memory (fresh
  // unlock — not a cold-start with cached subkey), check whether we still
  // owe the user the seed phrase backup flow.
  useEffect(() => {
    if (!key || !masterKey || seedAlreadyShown !== null) return;
    void (async () => {
      try {
        const me = await apiClient.get<UserMeResponse>("/user/me");
        setSeedAlreadyShown(me.cryptoSeedShownAt !== null);
      } catch {
        // If /user/me fails, suppress the modal to avoid annoying loops.
        setSeedAlreadyShown(true);
      }
    })();
  }, [key, masterKey, seedAlreadyShown]);

  if (loadingPersisted) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={Colors.lavender[500]} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.scroll}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <Text style={styles.title}>Tu diario</Text>
        <Text style={styles.subtitle}>
          Un espacio para nombrar lo que pasa adentro. Cifrado en tu
          dispositivo.
        </Text>
      </View>

      {!key ? (
        <UnlockGate />
      ) : (
        <ActiveDiarioBody
          entries={entries}
          prompt={prompt}
          loading={loading}
          onCreated={load}
        />
      )}

      {key && masterKey && seedAlreadyShown === false ? (
        <SeedPhraseModal
          masterKey={masterKey}
          onAcknowledged={() => setSeedAlreadyShown(true)}
        />
      ) : null}
    </ScrollView>
  );
}

// ─── Active body ─────────────────────────────────────────────────────────────

function ActiveDiarioBody({
  entries,
  prompt,
  loading,
  onCreated,
}: {
  entries: DiaryEntrySummary[];
  prompt: DiaryPromptOfTheDay | null;
  loading: boolean;
  onCreated: () => void;
}) {
  const { key, lock } = useDiaryKey();
  const [text, setText] = useState("");
  const [mood, setMood] = useState("calma");
  const [submitting, setSubmitting] = useState(false);

  async function handleSave() {
    if (!key || !text.trim() || submitting) return;
    setSubmitting(true);
    try {
      const trimmed = text.trim();
      const envelope = encryptString(trimmed, key);
      const excerptText =
        trimmed.length > 140 ? `${trimmed.slice(0, 140).trimEnd()}…` : trimmed;
      const excerpt = encryptString(excerptText, key);
      const body: CreateDiaryEntryRequest = {
        mood,
        kind: prompt ? "prompted" : "free",
        promptId: prompt?.id,
        textCiphertext: envelope.ciphertext,
        textNonce: envelope.nonce,
        excerptCiphertext: excerpt.ciphertext,
        excerptNonce: excerpt.nonce,
      };
      await diarioApi.create(body);
      setText("");
      onCreated();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      {/* Composer */}
      <View style={styles.composer}>
        {/* Mood chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 6, paddingVertical: 2 }}
        >
          {MOODS.map((m) => {
            const active = m.id === mood;
            return (
              <Pressable
                key={m.id}
                onPress={() => setMood(m.id)}
                disabled={submitting}
                style={[
                  styles.moodChip,
                  active
                    ? {
                        backgroundColor: Colors.warm[900],
                        borderColor: Colors.warm[900],
                      }
                    : {
                        backgroundColor: Colors.warm[50],
                        borderColor: Colors.warm[200],
                      },
                ]}
              >
                <Text style={{ fontSize: 12 }}>{m.emoji}</Text>
                <Text
                  style={[
                    styles.moodChipText,
                    { color: active ? Colors.white : Colors.warm[800] },
                  ]}
                >
                  {m.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <TextInput
          style={styles.input}
          value={text}
          onChangeText={setText}
          placeholder="¿Cómo llegas hoy? Escribe lo que necesites — nadie lo lee más que tú."
          placeholderTextColor={Colors.warm[400]}
          multiline
          numberOfLines={4}
          editable={!submitting}
        />

        {prompt ? (
          <View style={styles.promptCard}>
            <Text style={styles.promptEyebrow}>Prompt del día</Text>
            <Pressable
              onPress={() =>
                setText((t) =>
                  t ? `${t}\n\n${prompt.text}` : `${prompt.text}\n\n`,
                )
              }
              style={styles.promptBtn}
            >
              <Text style={styles.promptText}>✎ {prompt.text}</Text>
            </Pressable>
          </View>
        ) : null}

        <View style={styles.composerFoot}>
          <Pressable onPress={lock}>
            <Text style={styles.lockBtn}>🔒 Bloquear diario</Text>
          </Pressable>
          <Pressable
            disabled={submitting || !text.trim()}
            onPress={handleSave}
            style={[
              styles.saveBtn,
              (submitting || !text.trim()) && { opacity: 0.5 },
            ]}
          >
            <Ionicons name="create" size={14} color={Colors.white} />
            <Text style={styles.saveBtnText}>
              {submitting ? "Cifrando…" : "Guardar"}
            </Text>
          </Pressable>
        </View>
      </View>

      {/* Entries */}
      <View style={styles.sectionH}>
        <Text style={styles.sectionTitle}>Entradas recientes</Text>
        <Text style={styles.sectionCount}>
          {entries.length} {entries.length === 1 ? "entrada" : "entradas"}
        </Text>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="small" color={Colors.lavender[500]} />
        </View>
      ) : entries.length === 0 ? (
        <View style={styles.emptyCard}>
          <View style={styles.emptyIcon}>
            <Ionicons name="create" size={22} color={Colors.lavender[700]} />
          </View>
          <Text style={styles.emptyTitle}>Tu primera entrada empieza aquí</Text>
          <Text style={styles.emptySub}>
            Anota lo que sientes, sin pulir. Tu diario es privado — solo tú lo
            lees.
          </Text>
        </View>
      ) : (
        entries.map((e) => <EntryCard key={e.id} entry={e} />)
      )}
    </>
  );
}

// ─── EntryCard with decryption ───────────────────────────────────────────────

function EntryCard({ entry }: { entry: DiaryEntrySummary }) {
  const router = useRouter();
  const { key } = useDiaryKey();
  const [expanded, setExpanded] = useState(false);

  const decrypted = (() => {
    if (!key || !entry.excerptCiphertext || !entry.excerptNonce) return null;
    try {
      return decryptString(
        {
          ciphertext: entry.excerptCiphertext,
          nonce: entry.excerptNonce,
        },
        key,
      );
    } catch {
      return null;
    }
  })();

  const date = new Date(entry.createdAt).toLocaleDateString("es-EC", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  const time = new Date(entry.createdAt).toLocaleTimeString("es-EC", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const kindLabel =
    entry.kind === "prompted"
      ? "Reflexión"
      : entry.kind === "voz"
        ? "Voz"
        : "Libre";

  return (
    <Pressable
      style={styles.entryCard}
      onPress={() => router.push(`/(tabs)/diario/${entry.id}`)}
    >
      <View style={styles.entryHead}>
        <View style={styles.kindBadge}>
          <Text style={styles.kindBadgeText}>{kindLabel}</Text>
        </View>
        <Text style={styles.entryDate}>
          {date} · {time}
        </Text>
      </View>

      <View style={styles.moodRow}>
        <View
          style={[styles.moodSwatch, { backgroundColor: Colors.lavender[400] }]}
        />
        <Text style={styles.moodName}>
          {entry.mood[0]?.toUpperCase() + entry.mood.slice(1)}
        </Text>
      </View>

      {entry.promptText ? (
        <View style={styles.entryPrompt}>
          <Text style={styles.entryPromptText}>✎ {entry.promptText}</Text>
        </View>
      ) : null}

      {decrypted ? (
        <Text style={styles.entryBody}>
          {expanded
            ? decrypted
            : decrypted.length > 160
              ? `${decrypted.slice(0, 160)}…`
              : decrypted}
        </Text>
      ) : (
        <View style={styles.cipherPlaceholder}>
          <Ionicons name="lock-closed" size={11} color={Colors.warm[500]} />
          <Text style={styles.cipherText}>
            Esta entrada no tiene preview cifrado · abre detalle para descifrar
          </Text>
        </View>
      )}

      <View style={styles.entryFoot}>
        {entry.tags.length > 0 ? (
          <View style={styles.tagsRow}>
            {entry.tags.map((t) => (
              <View key={t} style={styles.tag}>
                <Text style={styles.tagText}>#{t}</Text>
              </View>
            ))}
          </View>
        ) : (
          <View />
        )}
        {decrypted && decrypted.length > 160 ? (
          <Pressable
            onPress={(e) => {
              e.stopPropagation?.();
              setExpanded((v) => !v);
            }}
          >
            <Text style={styles.expandBtn}>
              {expanded ? "Mostrar menos" : "Mostrar más"}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </Pressable>
  );
}

// ─── Constants ───────────────────────────────────────────────────────────────

const MOODS = [
  { id: "calma", emoji: "😌", label: "Calma" },
  { id: "foco", emoji: "🎯", label: "Foco" },
  { id: "energia", emoji: "✨", label: "Energía" },
  { id: "reflexion", emoji: "🕊", label: "Reflexión" },
  { id: "alegria", emoji: "😊", label: "Alegría" },
  { id: "ansiedad", emoji: "😟", label: "Ansiedad" },
  { id: "tristeza", emoji: "😔", label: "Tristeza" },
] as const;

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.warm[50],
  },
  scroll: {
    padding: Spacing.md,
    paddingBottom: Spacing.xxl,
  },
  center: {
    alignItems: "center",
    paddingVertical: Spacing.lg,
  },

  header: {
    marginBottom: Spacing.md,
  },
  title: {
    fontSize: 26,
    fontWeight: "700",
    color: Colors.warm[900],
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 13,
    color: Colors.warm[500],
    marginTop: 4,
    lineHeight: 18,
  },

  composer: {
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    borderWidth: 1.5,
    borderColor: Colors.warm[200],
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  moodChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: Radius.full,
    borderWidth: 1.5,
  },
  moodChipText: {
    fontSize: 12,
    fontWeight: "700",
  },
  input: {
    minHeight: 90,
    textAlignVertical: "top",
    padding: Spacing.sm,
    backgroundColor: Colors.warm[50],
    borderRadius: Radius.md,
    borderWidth: 1.5,
    borderColor: Colors.warm[200],
    fontSize: 14,
    lineHeight: 20,
    color: Colors.warm[800],
    marginTop: Spacing.sm,
  },
  promptCard: {
    marginTop: Spacing.sm,
  },
  promptEyebrow: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
    color: Colors.warm[500],
    marginBottom: 6,
  },
  promptBtn: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 10,
    backgroundColor: Colors.white,
    borderWidth: 1.5,
    borderColor: Colors.warm[200],
    borderRadius: Radius.md,
  },
  promptText: {
    fontSize: 12.5,
    color: Colors.warm[800],
  },
  composerFoot: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: Spacing.sm + 2,
  },
  lockBtn: {
    fontSize: 11,
    color: Colors.warm[500],
    textDecorationLine: "underline",
  },
  saveBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    backgroundColor: Colors.sage[400],
    borderRadius: Radius.md,
  },
  saveBtnText: {
    color: Colors.white,
    fontSize: 12.5,
    fontWeight: "700",
  },

  sectionH: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    marginTop: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: Colors.warm[500],
  },
  sectionCount: {
    fontSize: 11,
    color: Colors.warm[400],
  },

  emptyCard: {
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    borderWidth: 1.5,
    borderColor: Colors.warm[200],
    padding: Spacing.lg,
    alignItems: "center",
  },
  emptyIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.lavender[50],
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.sm,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: Colors.warm[900],
    textAlign: "center",
  },
  emptySub: {
    fontSize: 12.5,
    color: Colors.warm[500],
    textAlign: "center",
    marginTop: 6,
    lineHeight: 17,
  },

  entryCard: {
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    borderWidth: 1.5,
    borderColor: Colors.warm[200],
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  entryHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
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
  entryDate: {
    fontSize: 11,
    color: Colors.warm[500],
  },
  moodRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
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
  entryPrompt: {
    marginTop: Spacing.sm,
    padding: Spacing.sm,
    backgroundColor: Colors.lavender[50],
    borderRadius: Radius.sm,
  },
  entryPromptText: {
    fontSize: 12,
    fontStyle: "italic",
    color: Colors.lavender[700],
  },
  entryBody: {
    fontSize: 13.5,
    lineHeight: 19,
    color: Colors.warm[800],
    marginTop: Spacing.sm,
  },
  cipherPlaceholder: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: Spacing.sm,
    padding: Spacing.sm,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: Colors.warm[300],
  },
  cipherText: {
    fontSize: 11,
    color: Colors.warm[500],
    flex: 1,
  },
  entryFoot: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: Spacing.sm,
  },
  tagsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  tag: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    backgroundColor: Colors.warm[100],
    borderRadius: Radius.full,
  },
  tagText: {
    fontSize: 10.5,
    fontWeight: "600",
    color: Colors.warm[600],
  },
  expandBtn: {
    fontSize: 12,
    fontWeight: "700",
    color: Colors.lavender[700],
  },
});
