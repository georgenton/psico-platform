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
import { terapiaApi } from "@psico/api-client";
import type { TherapyHubResponse } from "@psico/types";
import { Colors, Radius, Spacing } from "@/theme";

export default function TerapiaHubScreen() {
  const router = useRouter();
  const [hub, setHub] = useState<TherapyHubResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const data = await terapiaApi.getHub();
      setHub(data);
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

  return (
    <ScrollView
      contentContainerStyle={styles.scroll}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      <Text style={styles.h1}>Terapia</Text>
      <Text style={styles.intro}>{hub?.intro ?? ""}</Text>

      {error ? (
        <View style={styles.errorCard}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      {hub?.nextSession ? (
        <Pressable
          onPress={() =>
            router.push(`/(tabs)/terapia/sesiones/${hub.nextSession!.id}`)
          }
          style={styles.nextSessionCard}
        >
          <Text style={styles.eyebrow}>Tu próxima sesión</Text>
          <Text style={styles.nextSessionName}>
            {hub.nextSession.therapist.name}
          </Text>
          <Text style={styles.nextSessionWhen}>
            {new Date(hub.nextSession.scheduledAt).toLocaleString("es-419", {
              dateStyle: "full",
              timeStyle: "short",
            })}
          </Text>
          <View style={styles.row}>
            <Text style={styles.nextSessionMeta}>
              {hub.nextSession.durationMin} min · {hub.nextSession.modality}
            </Text>
            <Ionicons
              name="arrow-forward"
              size={16}
              color={Colors.lavender[700]}
            />
          </View>
        </Pressable>
      ) : null}

      <Text style={styles.sectionLabel}>Empezá por acá</Text>

      <Pressable
        onPress={() => router.push("/(tabs)/terapia/terapeutas")}
        style={styles.actionCard}
      >
        <Ionicons name="search" size={22} color={Colors.lavender[700]} />
        <View style={styles.actionContent}>
          <Text style={styles.actionTitle}>Encontrar terapeuta</Text>
          <Text style={styles.actionDescription}>
            Catálogo con filtros por enfoque, idioma, precio.
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={Colors.warm[500]} />
      </Pressable>

      <Pressable
        onPress={() => router.push("/(tabs)/terapia/crisis")}
        style={[styles.actionCard, styles.actionCardCrisis]}
      >
        <Ionicons name="heart" size={22} color={Colors.rose[700]} />
        <View style={styles.actionContent}>
          <Text style={[styles.actionTitle, { color: Colors.rose[700] }]}>
            Apoyo inmediato
          </Text>
          <Text style={styles.actionDescription}>
            Líneas de crisis y primeros pasos.
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={Colors.rose[400]} />
      </Pressable>

      <Pressable
        onPress={() => router.push("/(tabs)/terapia/recetas")}
        style={styles.actionCard}
      >
        <Ionicons name="clipboard" size={22} color={Colors.sage[600]} />
        <View style={styles.actionContent}>
          <Text style={styles.actionTitle}>Lo que tu terapeuta sugirió</Text>
          <Text style={styles.actionDescription}>
            Libros, audios y ejercicios pendientes.
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={Colors.warm[500]} />
      </Pressable>

      <Pressable
        onPress={() => router.push("/(tabs)/terapia/notificaciones")}
        style={styles.actionCard}
      >
        <Ionicons name="notifications" size={22} color={Colors.lavender[700]} />
        <View style={styles.actionContent}>
          <Text style={styles.actionTitle}>Notificaciones</Text>
          <Text style={styles.actionDescription}>
            Recordatorios y avisos de tus sesiones.
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={Colors.warm[500]} />
      </Pressable>

      {hub?.activeTherapist ? (
        <>
          <Text style={styles.sectionLabel}>Tu terapeuta</Text>
          <Pressable
            onPress={() =>
              router.push(
                `/(tabs)/terapia/terapeutas/${hub.activeTherapist!.id}`,
              )
            }
            style={styles.therapistCard}
          >
            <Text style={styles.therapistName}>
              {hub.activeTherapist.name}
            </Text>
            <Text style={styles.therapistTitle}>
              {hub.activeTherapist.title}
            </Text>
            {hub.activeTherapist.title ? (
              <Text style={styles.therapistBio} numberOfLines={3}>
                {hub.activeTherapist.title}
              </Text>
            ) : null}
          </Pressable>
        </>
      ) : null}

      {hub?.recentPrescriptions && hub.recentPrescriptions.length > 0 ? (
        <>
          <Text style={styles.sectionLabel}>Lo que tu terapeuta sugirió</Text>
          {hub.recentPrescriptions.slice(0, 3).map((p) => (
            <View key={p.id} style={styles.prescriptionCard}>
              <Text style={styles.prescriptionKind}>{p.kind}</Text>
              {p.note ? (
                <Text style={styles.prescriptionNote} numberOfLines={2}>
                  {p.note}
                </Text>
              ) : null}
            </View>
          ))}
        </>
      ) : null}

      <Pressable
        onPress={() => router.push("/(tabs)/terapia/sesiones")}
        style={styles.linkRow}
      >
        <Text style={styles.linkText}>Ver todas mis sesiones →</Text>
      </Pressable>
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
  h1: {
    fontSize: 26,
    fontWeight: "700",
    color: Colors.warm[900],
    marginBottom: Spacing.sm,
  },
  intro: {
    fontSize: 14,
    color: Colors.warm[700],
    lineHeight: 20,
    marginBottom: Spacing.lg,
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
  nextSessionCard: {
    backgroundColor: Colors.lavender[50],
    borderColor: Colors.lavender[200],
    borderWidth: 1.5,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    color: Colors.lavender[700],
    marginBottom: Spacing.xs,
  },
  nextSessionName: {
    fontSize: 18,
    fontWeight: "600",
    color: Colors.warm[900],
  },
  nextSessionWhen: {
    fontSize: 13,
    color: Colors.warm[700],
    marginTop: 2,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: Spacing.sm,
  },
  nextSessionMeta: {
    fontSize: 12,
    color: Colors.warm[500],
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    color: Colors.warm[500],
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  actionCard: {
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
  actionCardCrisis: {
    borderColor: Colors.rose[200],
    backgroundColor: Colors.rose[50],
  },
  actionContent: { flex: 1 },
  actionTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: Colors.warm[900],
  },
  actionDescription: {
    fontSize: 12,
    color: Colors.warm[500],
    marginTop: 2,
  },
  therapistCard: {
    backgroundColor: Colors.white,
    borderColor: Colors.warm[200],
    borderWidth: 1.5,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  therapistName: { fontSize: 16, fontWeight: "600", color: Colors.warm[900] },
  therapistTitle: { fontSize: 12, color: Colors.warm[500], marginTop: 2 },
  therapistBio: {
    fontSize: 12,
    color: Colors.warm[700],
    lineHeight: 18,
    marginTop: Spacing.sm,
  },
  prescriptionCard: {
    backgroundColor: Colors.white,
    borderColor: Colors.warm[200],
    borderWidth: 1.5,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.xs,
  },
  prescriptionKind: {
    fontSize: 13,
    fontWeight: "600",
    color: Colors.warm[900],
  },
  prescriptionNote: {
    fontSize: 12,
    color: Colors.warm[700],
    marginTop: 2,
  },
  linkRow: {
    paddingVertical: Spacing.md,
    marginTop: Spacing.sm,
  },
  linkText: {
    fontSize: 13,
    color: Colors.lavender[700],
    fontWeight: "500",
  },
});
