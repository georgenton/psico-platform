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
import { terapiaApi } from "@psico/api-client";
import type { TherapyNotificationsListResponse } from "@psico/types";
import { Colors, Radius, Spacing } from "@/theme";

export default function NotificacionesScreen() {
  const router = useRouter();
  const [data, setData] = useState<TherapyNotificationsListResponse | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [marking, setMarking] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await terapiaApi.listNotifications();
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

  async function handleMarkAll() {
    if (marking) return;
    setMarking(true);
    try {
      await terapiaApi.markAllNotificationsRead();
      await load();
    } catch {
      // swallow
    } finally {
      setMarking(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={Colors.lavender[500]} />
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={styles.scroll}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.h1}>Notificaciones</Text>
          {data ? (
            <Text style={styles.subtitle}>
              {data.unreadCount > 0
                ? `${data.unreadCount} sin leer`
                : "Todas al día"}
            </Text>
          ) : null}
        </View>
        {data && data.unreadCount > 0 ? (
          <Pressable
            onPress={handleMarkAll}
            disabled={marking}
            style={styles.markButton}
          >
            <Text style={styles.markButtonText}>
              {marking ? "…" : "Marcar leídas"}
            </Text>
          </Pressable>
        ) : null}
      </View>

      {error ? (
        <View style={styles.errorCard}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      {data && data.items.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>
            Cuando reservés tu próxima sesión, te avisamos por acá.
          </Text>
        </View>
      ) : null}

      {data?.items.map((n) => {
        const unread = !n.readAt;
        return (
          <Pressable
            key={n.id}
            onPress={() => {
              if (n.actionUrl) {
                router.push(n.actionUrl);
              }
            }}
            style={[
              styles.notifCard,
              {
                borderColor: unread
                  ? Colors.lavender[300]
                  : Colors.warm[200],
                backgroundColor: unread ? Colors.lavender[50] : Colors.white,
              },
            ]}
          >
            <View style={styles.notifContent}>
              <Text style={styles.notifTitle}>{n.title}</Text>
              <Text style={styles.notifBody}>{n.body}</Text>
              <Text style={styles.notifDate}>
                {new Date(n.createdAt).toLocaleString("es-419", {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </Text>
            </View>
            {unread ? <View style={styles.unreadDot} /> : null}
          </Pressable>
        );
      })}
    </ScrollView>
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
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  h1: {
    fontSize: 22,
    fontWeight: "700",
    color: Colors.warm[900],
  },
  subtitle: {
    fontSize: 12,
    color: Colors.warm[500],
    marginTop: 2,
  },
  markButton: {
    borderColor: Colors.warm[300],
    borderWidth: 1.5,
    paddingHorizontal: Spacing.sm + 2,
    paddingVertical: Spacing.xs + 2,
    borderRadius: Radius.md,
  },
  markButtonText: { fontSize: 12, color: Colors.warm[700], fontWeight: "600" },
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
  notifCard: {
    flexDirection: "row",
    borderWidth: 1.5,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    gap: Spacing.sm,
  },
  notifContent: { flex: 1 },
  notifTitle: { fontSize: 14, fontWeight: "600", color: Colors.warm[900] },
  notifBody: { fontSize: 12, color: Colors.warm[700], marginTop: 2 },
  notifDate: { fontSize: 11, color: Colors.warm[500], marginTop: Spacing.xs },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.lavender[600],
    marginTop: 6,
  },
});
