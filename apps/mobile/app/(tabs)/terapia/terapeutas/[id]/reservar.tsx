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
import { useLocalSearchParams } from "expo-router";
import { terapiaApi } from "@psico/api-client";
import type {
  TherapistAvailabilityResponse,
  TherapistDetail,
  TherapyModality,
} from "@psico/types";
import { Colors, Radius, Spacing } from "@/theme";

const MODALITY_LABEL: Record<TherapyModality, string> = {
  INDIVIDUAL: "Individual",
  COUPLE: "Pareja",
  FAMILY: "Familia",
};

// Web origin where Stripe success/cancel URLs live.
const WEB_ORIGIN =
  process.env.EXPO_PUBLIC_WEB_ORIGIN ?? "https://psico-platform-web.vercel.app";

export default function ReservarScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [therapist, setTherapist] = useState<TherapistDetail | null>(null);
  const [availability, setAvailability] =
    useState<TherapistAvailabilityResponse | null>(null);
  const [modality, setModality] = useState<TherapyModality | null>(null);
  const [slotIso, setSlotIso] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    try {
      const [t, a] = await Promise.all([
        terapiaApi.getTherapist(id),
        terapiaApi.getAvailability(id, 14),
      ]);
      setTherapist(t);
      setAvailability(a);
      if (t.modalities.length === 1) setModality(t.modalities[0]);
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

  async function handleSubmit() {
    if (!therapist || !modality || !slotIso || submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      const res = await terapiaApi.createBooking({
        therapistId: therapist.id,
        slotIso,
        modality,
        durationMin: 50,
        successUrl: `${WEB_ORIGIN}/dashboard/terapia/sesiones?paid=true`,
        cancelUrl: `${WEB_ORIGIN}/dashboard/terapia/terapeutas/${therapist.id}`,
      });
      if (res.checkoutUrl) {
        await Linking.openURL(res.checkoutUrl);
      } else {
        Alert.alert(
          "Reserva creada",
          "Tu sesión está pendiente de pago. Abrila en Mi sesiones para continuar.",
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos crear la reserva.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={Colors.lavender[500]} />
      </View>
    );
  }

  if (error || !therapist) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>
          {error ?? "Terapeuta no encontrado."}
        </Text>
      </View>
    );
  }

  const slotsByDay = availability ? groupSlotsByDay(availability.slots) : null;

  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <Text style={styles.h1}>Reservar con {therapist.name}</Text>

      <Text style={styles.sectionLabel}>Modalidad</Text>
      <View style={styles.chipRow}>
        {therapist.modalities.map((m) => {
          const active = modality === m;
          return (
            <Pressable
              key={m}
              onPress={() => setModality(m)}
              style={[
                styles.modalityChip,
                {
                  borderColor: active
                    ? Colors.lavender[500]
                    : Colors.warm[200],
                  backgroundColor: active
                    ? Colors.lavender[50]
                    : Colors.white,
                },
              ]}
            >
              <Text
                style={[
                  styles.modalityChipText,
                  {
                    color: active
                      ? Colors.lavender[700]
                      : Colors.warm[700],
                  },
                ]}
              >
                {MODALITY_LABEL[m]}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.sectionLabel}>Horario</Text>
      {availability && availability.timezone ? (
        <Text style={styles.tzNote}>
          Próximos 14 días · {availability.timezone}
        </Text>
      ) : null}
      {!slotsByDay || slotsByDay.length === 0 ? (
        <Text style={styles.emptyText}>
          Sin horarios disponibles. Reintentá más tarde.
        </Text>
      ) : (
        <View>
          {slotsByDay.map((day) => (
            <View key={day.key} style={styles.dayBlock}>
              <Text style={styles.dayLabel}>{day.label}</Text>
              <View style={styles.slotRow}>
                {day.slots.map((s) => {
                  const selected = slotIso === s.iso;
                  return (
                    <Pressable
                      key={s.iso}
                      disabled={!s.available}
                      onPress={() => setSlotIso(s.iso)}
                      style={[
                        styles.slot,
                        {
                          backgroundColor: selected
                            ? Colors.lavender[600]
                            : Colors.warm[100],
                          opacity: s.available ? 1 : 0.3,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.slotText,
                          {
                            color: selected ? Colors.white : Colors.warm[700],
                          },
                        ]}
                      >
                        {new Date(s.iso).toLocaleTimeString("es-419", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ))}
        </View>
      )}

      <View style={styles.summary}>
        <Text style={styles.summaryLabel}>Total</Text>
        <Text style={styles.summaryValue}>
          ${therapist.priceUsd.toFixed(2)} {therapist.currency}
        </Text>
      </View>

      <Pressable
        onPress={handleSubmit}
        disabled={!modality || !slotIso || submitting}
        style={[
          styles.payButton,
          {
            opacity: !modality || !slotIso || submitting ? 0.5 : 1,
          },
        ]}
      >
        <Text style={styles.payButtonText}>
          {submitting ? "Procesando…" : "Pagar y reservar"}
        </Text>
      </Pressable>

      <Text style={styles.disclaimer}>
        El pago se hace en Stripe (en tu navegador). Al volver, vas a ver la
        sesión en "Mis sesiones".
      </Text>
    </ScrollView>
  );
}

interface DayBucket {
  key: string;
  label: string;
  slots: { iso: string; available: boolean }[];
}

function groupSlotsByDay(
  slots: { iso: string; available: boolean }[],
): DayBucket[] {
  const groups = new Map<string, DayBucket>();
  for (const s of slots) {
    const date = new Date(s.iso);
    const key = date.toISOString().slice(0, 10);
    const label = date.toLocaleDateString("es-419", {
      weekday: "long",
      day: "numeric",
      month: "short",
    });
    if (!groups.has(key)) {
      groups.set(key, { key, label, slots: [] });
    }
    groups.get(key)!.slots.push({ iso: s.iso, available: s.available });
  }
  return Array.from(groups.values()).filter((d) =>
    d.slots.some((s) => s.available),
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
  errorText: { fontSize: 13, color: Colors.rose[700], textAlign: "center" },
  h1: {
    fontSize: 22,
    fontWeight: "700",
    color: Colors.warm[900],
    marginBottom: Spacing.md,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    color: Colors.warm[500],
    marginTop: Spacing.md,
    marginBottom: Spacing.xs,
  },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: Spacing.xs },
  modalityChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderWidth: 1.5,
    borderRadius: Radius.md,
  },
  modalityChipText: { fontSize: 13, fontWeight: "500" },
  tzNote: {
    fontSize: 11,
    color: Colors.warm[500],
    marginBottom: Spacing.sm,
  },
  emptyText: {
    fontSize: 13,
    color: Colors.warm[500],
    marginTop: Spacing.sm,
  },
  dayBlock: { marginBottom: Spacing.md },
  dayLabel: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    color: Colors.warm[500],
    marginBottom: Spacing.xs,
  },
  slotRow: { flexDirection: "row", flexWrap: "wrap", gap: Spacing.xs },
  slot: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs + 2,
    borderRadius: Radius.sm,
  },
  slotText: { fontSize: 11, fontFamily: "Courier", fontWeight: "600" },
  summary: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    backgroundColor: Colors.white,
    borderColor: Colors.warm[200],
    borderWidth: 1.5,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    marginTop: Spacing.lg,
  },
  summaryLabel: { fontSize: 12, color: Colors.warm[700], fontWeight: "600" },
  summaryValue: { fontSize: 17, color: Colors.warm[900], fontWeight: "700" },
  payButton: {
    backgroundColor: Colors.sage[600],
    paddingVertical: Spacing.md,
    borderRadius: Radius.lg,
    alignItems: "center",
    marginTop: Spacing.md,
  },
  payButtonText: { fontSize: 15, color: Colors.white, fontWeight: "600" },
  disclaimer: {
    fontSize: 11,
    color: Colors.warm[500],
    textAlign: "center",
    marginTop: Spacing.sm,
    lineHeight: 16,
  },
});
