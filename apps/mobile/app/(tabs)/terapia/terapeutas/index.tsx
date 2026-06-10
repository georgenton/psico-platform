import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { terapiaApi } from "@psico/api-client";
import type {
  TherapistListItem,
  TherapistListResponse,
} from "@psico/types";
import { Colors, Radius, Spacing } from "@/theme";

export default function DirectorioScreen() {
  const router = useRouter();
  const [data, setData] = useState<TherapistListResponse | null>(null);
  const [search, setSearch] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (q: string) => {
      try {
        const res = await terapiaApi.listTherapists({
          search: q || undefined,
          limit: 20,
        });
        setData(res);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error desconocido");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [],
  );

  useEffect(() => {
    void load("");
  }, [load]);

  // Debounced search
  useEffect(() => {
    const id = setTimeout(() => {
      setLoading(true);
      void load(search);
    }, 280);
    return () => clearTimeout(id);
  }, [search, load]);

  function onRefresh() {
    setRefreshing(true);
    void load(search);
  }

  return (
    <ScrollView
      contentContainerStyle={styles.scroll}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      <View style={styles.searchRow}>
        <Ionicons name="search" size={18} color={Colors.warm[500]} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Buscá por nombre, enfoque o tema"
          placeholderTextColor={Colors.warm[400]}
          style={styles.searchInput}
          autoCorrect={false}
        />
      </View>

      {error ? (
        <View style={styles.errorCard}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      {loading ? (
        <View style={styles.centerInline}>
          <ActivityIndicator color={Colors.lavender[500]} />
        </View>
      ) : data && data.items.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>
            Sin terapeutas que coincidan. Reintenta con otros términos.
          </Text>
        </View>
      ) : null}

      {data?.items.map((t) => (
        <TherapistCard
          key={t.id}
          therapist={t}
          onPress={() => router.push(`/(tabs)/terapia/terapeutas/${t.id}`)}
        />
      ))}

      {data && data.total > data.items.length ? (
        <Text style={styles.moreText}>
          Mostrando {data.items.length} de {data.total}. Refiná la búsqueda
          para ver más.
        </Text>
      ) : null}
    </ScrollView>
  );
}

function TherapistCard({
  therapist,
  onPress,
}: {
  therapist: TherapistListItem;
  onPress: () => void;
}) {
  const initials = therapist.name
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <Pressable onPress={onPress} style={styles.therapistCard}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{initials}</Text>
      </View>
      <View style={styles.therapistContent}>
        <Text style={styles.therapistName}>{therapist.name}</Text>
        <Text style={styles.therapistTitle}>{therapist.title}</Text>
        <View style={styles.metaRow}>
          {therapist.languages.slice(0, 2).map((l) => (
            <Text key={l} style={styles.metaChip}>
              {l}
            </Text>
          ))}
          <Text style={styles.metaPrice}>
            ${therapist.priceUsd.toFixed(0)}
          </Text>
        </View>
      </View>
      <Ionicons name="chevron-forward" size={18} color={Colors.warm[400]} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  scroll: {
    padding: Spacing.lg,
    paddingBottom: Spacing.xl * 2,
    backgroundColor: Colors.warm[50],
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.white,
    borderColor: Colors.warm[200],
    borderWidth: 1.5,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    marginBottom: Spacing.md,
    gap: Spacing.sm,
  },
  searchInput: { flex: 1, fontSize: 14, color: Colors.warm[900] },
  errorCard: {
    backgroundColor: Colors.rose[50],
    borderColor: Colors.rose[200],
    borderWidth: 1.5,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  errorText: { fontSize: 13, color: Colors.rose[700] },
  emptyCard: {
    backgroundColor: Colors.white,
    borderColor: Colors.warm[200],
    borderWidth: 1.5,
    borderRadius: Radius.lg,
    padding: Spacing.xl,
    alignItems: "center",
  },
  emptyText: {
    fontSize: 13,
    color: Colors.warm[500],
    textAlign: "center",
  },
  centerInline: { padding: Spacing.lg, alignItems: "center" },
  therapistCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.white,
    borderColor: Colors.warm[200],
    borderWidth: 1.5,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    gap: Spacing.md,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.lavender[100],
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.lavender[700],
  },
  therapistContent: { flex: 1 },
  therapistName: { fontSize: 15, fontWeight: "600", color: Colors.warm[900] },
  therapistTitle: { fontSize: 12, color: Colors.warm[500], marginTop: 2 },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    marginTop: Spacing.xs,
  },
  metaChip: {
    fontSize: 11,
    paddingHorizontal: Spacing.xs + 2,
    paddingVertical: 1,
    backgroundColor: Colors.warm[100],
    borderRadius: 4,
    color: Colors.warm[700],
  },
  metaPrice: {
    fontSize: 12,
    fontWeight: "600",
    color: Colors.sage[700],
    marginLeft: "auto",
  },
  moreText: {
    fontSize: 12,
    color: Colors.warm[500],
    textAlign: "center",
    marginTop: Spacing.md,
  },
});
