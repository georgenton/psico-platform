import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Stack } from "expo-router";
import { terapiaApi } from "@psico/api-client";
import type { TherapySessionsListResponse } from "@psico/types";
import { Colors, Radius, Spacing } from "@/theme";

const STATUS_LABEL: Record<string, string> = {
  SCHEDULED: "Programada",
  IN_PROGRESS: "En curso",
  COMPLETED: "Completada",
  CANCELLED: "Cancelada",
  NO_SHOW: "No-show",
  MISSED: "Perdida",
};

const STATUS_COLOR: Record<string, { bg: string; fg: string }> = {
  SCHEDULED: { bg: Colors.lavender[100], fg: Colors.lavender[700] },
  IN_PROGRESS: { bg: Colors.sage[100], fg: Colors.sage[700] },
  COMPLETED: { bg: Colors.sage[100], fg: Colors.sage[700] },
  CANCELLED: { bg: Colors.rose[100], fg: Colors.rose[700] },
  NO_SHOW: { bg: Colors.rose[100], fg: Colors.rose[700] },
  MISSED: { bg: Colors.warm[100], fg: Colors.warm[700] },
};

export default function MisSesionesScreen() {
  const router = useRouter();
  const [data, setData] = useState<TherapySessionsListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await terapiaApi.listSessions("all");
      setData(res);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  useEffect(() => {
    void load();
  }, [load]);

  function onRefresh() {
    setRefreshing(true);
    void load();
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={Colors.lavender[500]} />
      </View>
    );
  }

  const upcoming = data?.upcoming ?? [];
  const past = data?.past ?? [];

  return (
    <>
      <Stack.Screen options={{ title: "Mis sesiones" }} />
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {error ? (
          <View style={styles.errorCard}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {upcoming.length === 0 && past.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>
              Aún no tienes sesiones. Cuando reserves la primera, la verás
              acá.
            </Text>
            <Pressable
              onPress={() => router.push("/(tabs)/terapia/terapeutas")}
              style={styles.ctaButton}
            >
              <Text style={styles.ctaButtonText}>Buscar terapeuta →</Text>
            </Pressable>
          </View>
        ) : null}

        {upcoming.length > 0 ? (
          <>
            <Text style={styles.sectionLabel}>Próximas</Text>
            {upcoming.map((s) => (
              <SessionRow
                key={s.id}
                session={s}
                onPress={() =>
                  router.push(`/(tabs)/terapia/sesiones/${s.id}`)
                }
              />
            ))}
          </>
        ) : null}

        {past.length > 0 ? (
          <>
            <Text style={styles.sectionLabel}>Pasadas</Text>
            {past.map((s) => (
              <SessionRow
                key={s.id}
                session={s}
                onPress={() =>
                  router.push(`/(tabs)/terapia/sesiones/${s.id}`)
                }
              />
            ))}
          </>
        ) : null}
      </ScrollView>
    </>
  );
}

function SessionRow({
  session,
  onPress,
}: {
  session: {
    id: string;
    status: string;
    therapist: { name: string };
    scheduledAt: string;
    durationMin: number;
  };
  onPress: () => void;
}) {
  const colors = STATUS_COLOR[session.status] ?? STATUS_COLOR.SCHEDULED;
  return (
    <Pressable onPress={onPress} style={styles.sessionCard}>
      <View style={styles.sessionHeader}>
        <Text style={styles.sessionName}>{session.therapist.name}</Text>
        <View
          style={[styles.statusPill, { backgroundColor: colors.bg }]}
        >
          <Text style={[styles.statusText, { color: colors.fg }]}>
            {STATUS_LABEL[session.status] ?? session.status}
          </Text>
        </View>
      </View>
      <Text style={styles.sessionWhen}>
        {new Date(session.scheduledAt).toLocaleString("es-419", {
          dateStyle: "medium",
          timeStyle: "short",
        })}{" "}
        · {session.durationMin} min
      </Text>
      <Ionicons
        name="chevron-forward"
        size={16}
        color={Colors.warm[400]}
        style={styles.chevron}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.warm[50],
  },
  scroll: {
    padding: Spacing.lg,
    paddingBottom: Spacing.xl * 2,
    backgroundColor: Colors.warm[50],
  },
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
    color: Colors.warm[700],
    textAlign: "center",
    lineHeight: 20,
    marginBottom: Spacing.md,
  },
  ctaButton: {
    backgroundColor: Colors.lavender[600],
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
    borderRadius: Radius.md,
  },
  ctaButtonText: { fontSize: 13, color: Colors.white, fontWeight: "600" },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    color: Colors.warm[500],
    marginBottom: Spacing.sm,
    marginTop: Spacing.md,
  },
  sessionCard: {
    backgroundColor: Colors.white,
    borderColor: Colors.warm[200],
    borderWidth: 1.5,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    position: "relative",
  },
  sessionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  sessionName: { fontSize: 15, fontWeight: "600", color: Colors.warm[900] },
  sessionWhen: { fontSize: 12, color: Colors.warm[700] },
  statusPill: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: 999,
  },
  statusText: { fontSize: 11, fontWeight: "600" },
  chevron: {
    position: "absolute",
    right: Spacing.md,
    top: "50%",
    marginTop: -8,
  },
});
