import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { terapiaApi } from "@psico/api-client";
import type { SessionPrepResponse } from "@psico/types";
import { Colors, Radius, Spacing } from "@/theme";

const STATUS_LABEL: Record<string, string> = {
  SCHEDULED: "Programada",
  IN_PROGRESS: "En curso",
  COMPLETED: "Completada",
  CANCELLED: "Cancelada",
  NO_SHOW: "No-show",
  MISSED: "Perdida",
};

const PAYMENT_LABEL: Record<string, string> = {
  PENDING: "Pago pendiente",
  PAID: "Pagado",
  FAILED: "Pago fallido",
  REFUNDED: "Reembolsado",
};

export default function SesionDetalleScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [data, setData] = useState<SessionPrepResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await terapiaApi.getSessionPrep(id);
      setData(res);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleJoin() {
    if (!data || acting) return;
    setActing(true);
    try {
      const res = await terapiaApi.joinSession(data.session.id);
      if (res.roomUrl.startsWith("https://")) {
        await Linking.openURL(res.roomUrl);
      } else {
        Alert.alert(
          "Sala demo",
          "El proveedor de video está en modo demo. Cuando se conecte Daily.co podrás unirte desde la app.",
        );
      }
    } catch (err) {
      Alert.alert(
        "Error",
        err instanceof Error ? err.message : "No pudimos abrir la sala.",
      );
    } finally {
      setActing(false);
    }
  }

  function handleCancel() {
    if (!data || acting) return;
    Alert.alert(
      "Cancelar sesión",
      "¿Cancelar esta sesión? Tendrás que reservar de nuevo.",
      [
        { text: "Volver", style: "cancel" },
        {
          text: "Cancelar sesión",
          style: "destructive",
          onPress: async () => {
            setActing(true);
            try {
              await terapiaApi.cancelSession(
                data.session.id,
                "Cancelado desde mobile",
                false,
              );
              await load();
            } catch (err) {
              Alert.alert(
                "Error",
                err instanceof Error
                  ? err.message
                  : "No pudimos cancelar.",
              );
            } finally {
              setActing(false);
            }
          },
        },
      ],
    );
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={Colors.lavender[500]} />
      </View>
    );
  }

  if (error || !data) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{error ?? "Sesión no encontrada."}</Text>
        <Pressable
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <Text style={styles.backButtonText}>← Volver</Text>
        </Pressable>
      </View>
    );
  }

  const start = new Date(data.session.scheduledAt);
  const end = new Date(start.getTime() + data.session.durationMin * 60 * 1000);
  const nowMs = Date.now();
  const inJoinWindow =
    nowMs >= start.getTime() - 5 * 60 * 1000 &&
    nowMs <= end.getTime() + 15 * 60 * 1000;

  const paymentColors =
    data.session.paymentStatus === "PAID"
      ? { bg: Colors.sage[100], fg: Colors.sage[700] }
      : { bg: Colors.rose[100], fg: Colors.rose[700] };

  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.cardHeaderText}>
            <Text style={styles.eyebrow}>
              {STATUS_LABEL[data.session.status]}
            </Text>
            <Text style={styles.therapistName}>
              {data.session.therapist.name}
            </Text>
            <Text style={styles.scheduledAt}>
              {start.toLocaleString("es-419", {
                dateStyle: "full",
                timeStyle: "short",
              })}{" "}
              · {data.session.durationMin} min
            </Text>
          </View>
          <View
            style={[styles.statusPill, { backgroundColor: paymentColors.bg }]}
          >
            <Text style={[styles.statusText, { color: paymentColors.fg }]}>
              {PAYMENT_LABEL[data.session.paymentStatus]}
            </Text>
          </View>
        </View>

        {inJoinWindow && data.session.status === "SCHEDULED" ? (
          <Pressable
            onPress={handleJoin}
            disabled={acting}
            style={styles.joinButton}
          >
            <Ionicons name="videocam" size={18} color={Colors.white} />
            <Text style={styles.joinButtonText}>Unirse a la sala</Text>
          </Pressable>
        ) : data.session.status === "SCHEDULED" ? (
          <View style={styles.infoNote}>
            <Text style={styles.infoNoteText}>
              La sala se abre 5 min antes de tu sesión.
            </Text>
          </View>
        ) : null}

        {data.session.status === "SCHEDULED" ? (
          <Pressable
            onPress={handleCancel}
            disabled={acting}
            style={styles.cancelButton}
          >
            <Text style={styles.cancelButtonText}>Cancelar</Text>
          </Pressable>
        ) : null}
      </View>

      {data.session.status === "SCHEDULED" ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Pre-sesión</Text>
          <Text style={styles.sectionBody}>
            Para escribir tu intención cifrada, abrí Psico en la web. Cuando
            la encriptación E2E móvil esté lista, podrás hacerlo desde acá.
          </Text>
          {data.prep.checkInMood ? (
            <Text style={styles.preview}>
              Mood actual: {data.prep.checkInMood}
            </Text>
          ) : null}
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.warm[50],
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  scroll: {
    padding: Spacing.lg,
    paddingBottom: Spacing.xl * 2,
    backgroundColor: Colors.warm[50],
  },
  errorText: { fontSize: 13, color: Colors.rose[700], textAlign: "center" },
  backButton: { padding: Spacing.sm },
  backButtonText: { fontSize: 13, color: Colors.lavender[700] },
  card: {
    backgroundColor: Colors.white,
    borderColor: Colors.warm[200],
    borderWidth: 1.5,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: Spacing.md,
  },
  cardHeaderText: { flex: 1, marginRight: Spacing.sm },
  eyebrow: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    color: Colors.lavender[700],
  },
  therapistName: {
    fontSize: 17,
    fontWeight: "600",
    color: Colors.warm[900],
    marginTop: 2,
  },
  scheduledAt: { fontSize: 12, color: Colors.warm[700], marginTop: 2 },
  statusPill: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: 999,
  },
  statusText: { fontSize: 11, fontWeight: "600" },
  joinButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.sage[600],
    paddingVertical: Spacing.sm + 2,
    borderRadius: Radius.md,
    gap: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  joinButtonText: { fontSize: 14, color: Colors.white, fontWeight: "600" },
  infoNote: {
    backgroundColor: Colors.warm[50],
    padding: Spacing.sm,
    borderRadius: Radius.md,
    marginBottom: Spacing.sm,
  },
  infoNoteText: { fontSize: 12, color: Colors.warm[700] },
  cancelButton: {
    borderColor: Colors.rose[300],
    borderWidth: 1.5,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.md,
    alignItems: "center",
  },
  cancelButtonText: {
    fontSize: 13,
    color: Colors.rose[700],
    fontWeight: "600",
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.warm[900],
    marginBottom: Spacing.xs,
  },
  sectionBody: { fontSize: 12, color: Colors.warm[700], lineHeight: 18 },
  preview: {
    fontSize: 12,
    color: Colors.warm[700],
    marginTop: Spacing.sm,
    fontStyle: "italic",
  },
});
