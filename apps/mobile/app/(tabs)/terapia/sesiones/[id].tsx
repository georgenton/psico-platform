import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { decryptString, encryptString } from "@psico/crypto";
import { terapiaApi } from "@psico/api-client";
import { THERAPY_MOODS } from "@psico/types";
import type { SessionPrepResponse } from "@psico/types";
import { Colors, Radius, Spacing } from "@/theme";
import { useDiaryKey } from "@/crypto/diary-key-context";
import { FeedbackModal } from "@/components/dashboard/terapia/FeedbackModal";
import { RescheduleModal } from "@/components/dashboard/terapia/RescheduleModal";

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

const MOODS = THERAPY_MOODS;

export default function SesionDetalleScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { key } = useDiaryKey();
  const [data, setData] = useState<SessionPrepResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState(false);

  // Pre-session state
  const [intention, setIntention] = useState("");
  const [intentionLoaded, setIntentionLoaded] = useState(false);
  const [mood, setMood] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const lastSavedIntention = useRef("");

  // Modals
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await terapiaApi.getSessionPrep(id);
      setData(res);
      setMood(res.prep.checkInMood);
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

  // Decrypt intention once key is available
  useEffect(() => {
    if (!data || !key || intentionLoaded) return;
    if (!data.prep.intentionCiphertext || !data.prep.intentionNonce) {
      setIntentionLoaded(true);
      return;
    }
    try {
      const plain = decryptString(
        {
          ciphertext: data.prep.intentionCiphertext,
          nonce: data.prep.intentionNonce,
        },
        key,
      );
      setIntention(plain);
      lastSavedIntention.current = plain;
      setIntentionLoaded(true);
    } catch {
      setError("No pudimos leer la intención cifrada.");
      setIntentionLoaded(true);
    }
  }, [key, intentionLoaded, data]);

  async function handleSaveIntention() {
    if (!data || !key || acting) return;
    if (intention === lastSavedIntention.current) return;
    setActing(true);
    try {
      const trimmed = intention.trim();
      if (trimmed) {
        const env = encryptString(trimmed, key);
        const updated = await terapiaApi.updateSessionPrep(data.session.id, {
          intentionCiphertext: env.ciphertext,
          intentionNonce: env.nonce,
        });
        setData(updated);
      } else {
        const updated = await terapiaApi.updateSessionPrep(data.session.id, {
          intentionCiphertext: "",
          intentionNonce: "",
        });
        setData(updated);
      }
      lastSavedIntention.current = intention;
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2000);
    } catch (err) {
      Alert.alert(
        "Error",
        err instanceof Error ? err.message : "No pudimos guardar.",
      );
    } finally {
      setActing(false);
    }
  }

  async function handleMood(m: string) {
    if (!data) return;
    setMood(m);
    try {
      await terapiaApi.updateSessionPrep(data.session.id, {
        checkInMood: m,
      });
    } catch {
      // swallow — mood is best-effort UX
    }
  }

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
                err instanceof Error ? err.message : "No pudimos cancelar.",
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
        <Pressable onPress={() => router.back()} style={styles.backButton}>
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
  const canCloseSession =
    nowMs > end.getTime() &&
    (data.session.status === "SCHEDULED" ||
      data.session.status === "IN_PROGRESS") &&
    data.session.paymentStatus === "PAID";
  const canEditPrep = data.session.paymentStatus === "PAID" && key !== null;

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
        ) : data.session.status === "SCHEDULED" && !canCloseSession ? (
          <View style={styles.infoNote}>
            <Text style={styles.infoNoteText}>
              La sala se abre 5 min antes de tu sesión.
            </Text>
          </View>
        ) : null}

        {data.session.status === "SCHEDULED" && !canCloseSession ? (
          <View style={styles.actionRow}>
            <Pressable
              onPress={() => setRescheduleOpen(true)}
              disabled={acting}
              style={styles.rescheduleButton}
            >
              <Text style={styles.rescheduleButtonText}>Re-agendar</Text>
            </Pressable>
            <Pressable
              onPress={handleCancel}
              disabled={acting}
              style={styles.cancelButton}
            >
              <Text style={styles.cancelButtonText}>Cancelar</Text>
            </Pressable>
          </View>
        ) : null}

        {canCloseSession ? (
          <Pressable
            onPress={() => setFeedbackOpen(true)}
            disabled={acting}
            style={styles.closeButton}
          >
            <Text style={styles.closeButtonText}>
              Cerrar y dejar feedback →
            </Text>
          </Pressable>
        ) : null}
      </View>

      {data.session.status === "SCHEDULED" ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Pre-sesión</Text>
          <Text style={styles.sectionBody}>
            Lo que escribas se cifra en este dispositivo. Tu terapeuta solo
            podrá verlo si decides compartirlo dentro de la sala.
          </Text>

          {!key ? (
            <View style={styles.lockedNote}>
              <Text style={styles.lockedNoteText}>
                🔐 Desbloqueá tu Diario en la pestaña Diario para escribir tu
                intención.
              </Text>
            </View>
          ) : data.session.paymentStatus !== "PAID" ? (
            <View style={styles.lockedNote}>
              <Text style={styles.lockedNoteText}>
                Confirmá el pago para empezar a preparar tu sesión.
              </Text>
            </View>
          ) : (
            <>
              <Text style={styles.fieldLabel}>Cómo te estás sintiendo</Text>
              <View style={styles.chipRow}>
                {MOODS.map((m) => {
                  const active = mood === m.id;
                  return (
                    <Pressable
                      key={m.id}
                      onPress={() => handleMood(m.id)}
                      style={[
                        styles.moodChip,
                        {
                          backgroundColor: active
                            ? Colors.lavender[100]
                            : Colors.warm[100],
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.moodChipText,
                          {
                            color: active
                              ? Colors.lavender[700]
                              : Colors.warm[700],
                          },
                        ]}
                      >
                        {m.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text style={styles.fieldLabel}>¿Qué querés tratar?</Text>
              <TextInput
                value={intention}
                onChangeText={setIntention}
                onBlur={handleSaveIntention}
                editable={canEditPrep && !acting}
                multiline
                numberOfLines={6}
                placeholder="Escribí lo que tengas en mente. Es para vos. Cifrado punta-a-punta."
                placeholderTextColor={Colors.warm[400]}
                style={styles.intentionInput}
              />
              <View style={styles.intentionFooter}>
                {savedFlash ? (
                  <Text style={{ color: Colors.sage[700], fontSize: 11 }}>
                    ✓ Guardado
                  </Text>
                ) : (
                  <Text style={{ color: Colors.warm[500], fontSize: 11 }}>
                    Se guarda al salir del campo.
                  </Text>
                )}
                <Text style={{ color: Colors.warm[500], fontSize: 11 }}>
                  {intention.length} caracteres
                </Text>
              </View>
            </>
          )}
        </View>
      ) : null}

      {feedbackOpen ? (
        <FeedbackModal
          sessionId={data.session.id}
          visible={feedbackOpen}
          onClose={() => setFeedbackOpen(false)}
          onDone={load}
        />
      ) : null}

      {rescheduleOpen ? (
        <RescheduleModal
          sessionId={data.session.id}
          therapistId={data.session.therapist.id}
          currentSlotIso={data.session.scheduledAt}
          visible={rescheduleOpen}
          onClose={() => setRescheduleOpen(false)}
          onDone={load}
        />
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
  actionRow: { flexDirection: "row", gap: Spacing.sm },
  rescheduleButton: {
    flex: 1,
    borderColor: Colors.lavender[300],
    borderWidth: 1.5,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.md,
    alignItems: "center",
  },
  rescheduleButtonText: {
    fontSize: 13,
    color: Colors.lavender[700],
    fontWeight: "600",
  },
  cancelButton: {
    flex: 1,
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
  closeButton: {
    backgroundColor: Colors.lavender[600],
    paddingVertical: Spacing.sm + 2,
    borderRadius: Radius.md,
    alignItems: "center",
  },
  closeButtonText: { fontSize: 14, color: Colors.white, fontWeight: "600" },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.warm[900],
    marginBottom: Spacing.xs,
  },
  sectionBody: { fontSize: 12, color: Colors.warm[700], lineHeight: 18 },
  lockedNote: {
    marginTop: Spacing.sm,
    backgroundColor: Colors.warm[50],
    padding: Spacing.sm,
    borderRadius: Radius.md,
  },
  lockedNoteText: { fontSize: 12, color: Colors.warm[700], lineHeight: 18 },
  fieldLabel: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    color: Colors.warm[500],
    marginTop: Spacing.md,
    marginBottom: Spacing.xs,
  },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: Spacing.xs },
  moodChip: {
    paddingHorizontal: Spacing.sm + 2,
    paddingVertical: Spacing.xs,
    borderRadius: 999,
  },
  moodChipText: { fontSize: 12, fontWeight: "500" },
  intentionInput: {
    backgroundColor: Colors.white,
    borderColor: Colors.warm[200],
    borderWidth: 1.5,
    borderRadius: Radius.md,
    padding: Spacing.sm + 2,
    fontSize: 13,
    color: Colors.warm[900],
    minHeight: 120,
    textAlignVertical: "top",
  },
  intentionFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: Spacing.xs,
  },
});
