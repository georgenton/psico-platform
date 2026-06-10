import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { terapiaApi } from "@psico/api-client";
import type { TherapistAvailabilityResponse } from "@psico/types";
import { Colors, Radius, Spacing } from "@/theme";

interface Props {
  sessionId: string;
  therapistId: string;
  currentSlotIso: string;
  visible: boolean;
  onClose: () => void;
  onDone: () => void;
}

export function RescheduleModal({
  sessionId,
  therapistId,
  currentSlotIso,
  visible,
  onClose,
  onDone,
}: Props) {
  const [availability, setAvailability] =
    useState<TherapistAvailabilityResponse | null>(null);
  const [slotIso, setSlotIso] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setAvailability(null);
    terapiaApi
      .getAvailability(therapistId, 14)
      .then((data) => {
        if (!cancelled) setAvailability(data);
      })
      .catch((err) => {
        if (!cancelled)
          setError(
            err instanceof Error ? err.message : "Error desconocido",
          );
      });
    return () => {
      cancelled = true;
    };
  }, [visible, therapistId]);

  async function handleSubmit() {
    if (!slotIso) return;
    setError(null);
    setPending(true);
    try {
      await terapiaApi.rescheduleSession(sessionId, slotIso);
      onDone();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos re-agendar.");
    } finally {
      setPending(false);
    }
  }

  const slotsByDay = availability
    ? groupSlotsByDay(availability.slots, currentSlotIso)
    : null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.title}>Cambiar de horario</Text>
          <Text style={styles.subtitle}>
            Elegí un slot libre del mismo terapeuta. Tu pago se mantiene.
          </Text>

          {error ? (
            <View style={styles.errorBlock}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {!availability ? (
            <View style={styles.centerInline}>
              <ActivityIndicator color={Colors.lavender[500]} />
            </View>
          ) : slotsByDay && slotsByDay.length === 0 ? (
            <Text style={styles.emptyText}>
              Sin horarios libres en los próximos 14 días.
            </Text>
          ) : (
            <ScrollView style={styles.slotsScroll}>
              {slotsByDay?.map((day) => (
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
                                color: selected
                                  ? Colors.white
                                  : Colors.warm[700],
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
            </ScrollView>
          )}

          <View style={styles.footer}>
            <Pressable
              onPress={onClose}
              disabled={pending}
              style={styles.cancelLink}
            >
              <Text style={styles.cancelLinkText}>Cancelar</Text>
            </Pressable>
            <Pressable
              onPress={handleSubmit}
              disabled={!slotIso || pending}
              style={[
                styles.submitButton,
                { opacity: !slotIso || pending ? 0.5 : 1 },
              ]}
            >
              <Text style={styles.submitButtonText}>
                {pending ? "Guardando…" : "Confirmar cambio"}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

interface DayBucket {
  key: string;
  label: string;
  slots: { iso: string; available: boolean }[];
}

function groupSlotsByDay(
  slots: { iso: string; available: boolean }[],
  currentSlotIso: string,
): DayBucket[] {
  const groups = new Map<string, DayBucket>();
  for (const s of slots) {
    if (s.iso === currentSlotIso) continue;
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
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    padding: Spacing.lg,
    maxHeight: "85%",
  },
  title: { fontSize: 18, fontWeight: "600", color: Colors.warm[900] },
  subtitle: {
    fontSize: 12,
    color: Colors.warm[500],
    marginTop: Spacing.xs,
  },
  errorBlock: {
    backgroundColor: Colors.rose[50],
    padding: Spacing.sm,
    borderRadius: Radius.md,
    marginTop: Spacing.md,
  },
  errorText: { fontSize: 12, color: Colors.rose[700] },
  centerInline: { padding: Spacing.lg, alignItems: "center" },
  emptyText: {
    fontSize: 13,
    color: Colors.warm[500],
    marginTop: Spacing.md,
    textAlign: "center",
  },
  slotsScroll: { maxHeight: 320, marginTop: Spacing.md },
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
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: Spacing.lg,
  },
  cancelLink: { padding: Spacing.sm },
  cancelLinkText: { fontSize: 13, color: Colors.warm[700] },
  submitButton: {
    backgroundColor: Colors.lavender[600],
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
    borderRadius: Radius.md,
  },
  submitButtonText: { fontSize: 14, color: Colors.white, fontWeight: "600" },
});
