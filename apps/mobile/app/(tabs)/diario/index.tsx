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
import { Ionicons } from "@expo/vector-icons";
import { diarioApi } from "@psico/api-client";
import type { DiaryEntrySummary, DiaryPromptOfTheDay } from "@psico/types";
import { useAuth } from "@/context/auth";
import { Colors, Radius, Spacing } from "@/theme";

/**
 * Diario — mobile.
 *
 * Same E2E-encryption gap as the web (see CryptoNotice). The composer is
 * visible but the Save button is disabled with a tooltip explaining the
 * crypto module lands in S6-crypto. Until then, the user can write text
 * locally and the server never sees it.
 *
 * The list renders existing entries' metadata (mood, tags, kind, date).
 * The body says "Cifrado · descifrar próximamente" — we cannot decrypt
 * without the client cripto module.
 */
export default function DiarioScreen() {
  const { user } = useAuth();
  const [entries, setEntries] = useState<DiaryEntrySummary[]>([]);
  const [prompt, setPrompt] = useState<DiaryPromptOfTheDay | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState("");

  const load = useCallback(async () => {
    setError(null);
    try {
      const [list, p] = await Promise.all([
        diarioApi.list({ perPage: 30 }),
        diarioApi.getPromptOfTheDay().catch(() => null),
      ]);
      setEntries(list.entries);
      setPrompt(p);
    } catch {
      setError("No se pudo cargar el diario.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (!user) return null;

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.scroll}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Tu diario</Text>
        <Text style={styles.subtitle}>
          Un espacio para nombrar lo que pasa adentro. Cifrado en tu
          dispositivo.
        </Text>
      </View>

      {/* Crypto notice */}
      <View style={styles.cryptoNotice}>
        <View style={styles.cryptoIcon}>
          <Ionicons name="lock-closed" size={14} color={Colors.lavender[700]} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.cryptoTitle}>
            Diario cifrado de extremo a extremo
          </Text>
          <Text style={styles.cryptoSub}>
            Tu texto se cifra en tu dispositivo con una clave derivada de tu
            contraseña. El módulo de cifrado llega en el próximo sprint; por
            ahora puedes ver la estructura.
          </Text>
        </View>
      </View>

      {/* Composer */}
      <View style={styles.composer}>
        <View style={styles.composerHead}>
          <View style={styles.moodPill}>
            <View
              style={[
                styles.moodPillDot,
                { backgroundColor: Colors.sage[400] },
              ]}
            />
            <Text style={styles.moodPillText}>Calma</Text>
            <Text style={styles.moodPillChange}>· cambiar</Text>
          </View>
          <Text style={styles.composerDate}>
            {new Date().toLocaleDateString("es-EC", {
              weekday: "short",
              day: "numeric",
              month: "short",
            })}
          </Text>
        </View>

        <TextInput
          style={styles.composerInput}
          value={text}
          onChangeText={setText}
          placeholder="¿Cómo llegas hoy? Escribe lo que necesites — nadie lo lee más que tú."
          placeholderTextColor={Colors.warm[400]}
          multiline
          numberOfLines={4}
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
          <View style={styles.composerFootLeft}>
            <Ionicons name="lock-closed" size={11} color={Colors.warm[500]} />
            <Text style={styles.composerFootText}>
              Privado · cifrado en tu dispositivo
            </Text>
          </View>
          <Pressable disabled style={[styles.saveBtn, { opacity: 0.5 }]}>
            <Ionicons name="create" size={14} color={Colors.white} />
            <Text style={styles.saveBtnText}>Guardar (próximamente)</Text>
          </Pressable>
        </View>
      </View>

      {/* Entries section */}
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
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>{error}</Text>
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
    </ScrollView>
  );
}

// ─── EntryCard ───────────────────────────────────────────────────────────────

function EntryCard({ entry }: { entry: DiaryEntrySummary }) {
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
    <View style={styles.entryCard}>
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

      <View style={styles.cipherPlaceholder}>
        <Ionicons name="lock-closed" size={11} color={Colors.warm[500]} />
        <Text style={styles.cipherText}>
          Contenido cifrado · descifrar próximamente
        </Text>
      </View>

      {entry.tags.length > 0 ? (
        <View style={styles.tagsRow}>
          {entry.tags.map((t) => (
            <View key={t} style={styles.tag}>
              <Text style={styles.tagText}>#{t}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

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
  errorText: {
    fontSize: 13,
    color: Colors.warm[500],
    textAlign: "center",
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

  cryptoNotice: {
    flexDirection: "row",
    gap: 10,
    padding: Spacing.md,
    backgroundColor: Colors.lavender[50],
    borderRadius: Radius.lg,
    borderWidth: 1.5,
    borderColor: Colors.lavender[200],
    marginBottom: Spacing.md,
  },
  cryptoIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.white,
    borderWidth: 1.5,
    borderColor: Colors.lavender[200],
    alignItems: "center",
    justifyContent: "center",
  },
  cryptoTitle: {
    fontSize: 12.5,
    fontWeight: "700",
    color: Colors.warm[900],
  },
  cryptoSub: {
    fontSize: 11.5,
    color: Colors.warm[700],
    marginTop: 4,
    lineHeight: 16,
  },

  composer: {
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    borderWidth: 1.5,
    borderColor: Colors.warm[200],
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  composerHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  moodPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: Colors.white,
    borderWidth: 1.5,
    borderColor: Colors.warm[200],
    borderRadius: Radius.full,
  },
  moodPillDot: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
  },
  moodPillText: {
    fontSize: 12,
    fontWeight: "700",
    color: Colors.warm[800],
  },
  moodPillChange: {
    fontSize: 11,
    color: Colors.warm[400],
  },
  composerDate: {
    fontSize: 11,
    color: Colors.warm[500],
  },
  composerInput: {
    minHeight: 80,
    textAlignVertical: "top",
    padding: Spacing.sm,
    backgroundColor: Colors.warm[50],
    borderRadius: Radius.md,
    borderWidth: 1.5,
    borderColor: Colors.warm[200],
    fontSize: 14,
    lineHeight: 20,
    color: Colors.warm[800],
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
  composerFootLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  composerFootText: {
    fontSize: 10.5,
    color: Colors.warm[500],
  },
  saveBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    backgroundColor: Colors.warm[900],
    borderRadius: Radius.md,
  },
  saveBtnText: {
    color: Colors.white,
    fontSize: 12,
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
  },
  tagsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: Spacing.sm,
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
});
