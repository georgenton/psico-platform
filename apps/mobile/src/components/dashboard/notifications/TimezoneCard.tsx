import { useMemo, useState } from "react";
import {
  Alert,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { usersApi } from "@psico/api-client";
import { Colors, Radius, Spacing } from "@/theme";

/**
 * TimezoneCard — Sprint S54 (mobile).
 *
 * Mirrors the web version: shows the user's stored timezone, their
 * device's current timezone, and lets them either tap "Use device's"
 * to align, or pick another timezone from a modal list.
 *
 * RN doesn't ship a <select>, so we use a Modal with a FlatList over
 * `Intl.supportedValuesOf("timeZone")` (Hermes 0.74+ supports it; we
 * fall back to a small hardcoded list).
 */

const FALLBACK_TIMEZONES = [
  "UTC",
  "America/Guayaquil",
  "America/Bogota",
  "America/Lima",
  "America/Mexico_City",
  "America/Buenos_Aires",
  "America/Santiago",
  "America/Sao_Paulo",
  "America/Caracas",
  "America/New_York",
  "America/Los_Angeles",
  "America/Chicago",
  "Europe/Madrid",
  "Europe/Lisbon",
  "Europe/London",
  "Europe/Berlin",
  "Europe/Paris",
  "Asia/Tokyo",
  "Asia/Seoul",
  "Asia/Shanghai",
  "Asia/Kolkata",
  "Australia/Sydney",
];

function listAllTimezones(): string[] {
  try {
    const intlExt = Intl as unknown as {
      supportedValuesOf?: (key: "timeZone") => string[];
    };
    if (typeof intlExt.supportedValuesOf === "function") {
      return intlExt.supportedValuesOf("timeZone");
    }
  } catch {
    // fall through
  }
  return FALLBACK_TIMEZONES;
}

function detectDeviceTimezone(): string | null {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return typeof tz === "string" && tz.length > 0 ? tz : null;
  } catch {
    return null;
  }
}

export function TimezoneCard({
  currentTimezone,
  onChanged,
}: {
  currentTimezone: string | null;
  onChanged?: (next: string) => void;
}) {
  const [storedTz, setStoredTz] = useState<string | null>(currentTimezone);
  const [picking, setPicking] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const deviceTz = useMemo(detectDeviceTimezone, []);
  const options = useMemo(
    () => Array.from(new Set(listAllTimezones())).sort(),
    [],
  );

  async function commit(next: string) {
    if (submitting) return;
    setSubmitting(true);
    try {
      await usersApi.updateTimezone({ timezone: next });
      setStoredTz(next);
      onChanged?.(next);
    } catch {
      Alert.alert(
        "No pudimos guardar el cambio",
        "Revisa tu conexión y reintenta.",
      );
    } finally {
      setSubmitting(false);
      setPicking(false);
    }
  }

  const mismatch =
    storedTz !== null && deviceTz !== null && storedTz !== deviceTz;

  return (
    <View style={styles.card} testID="timezone-card">
      <View style={styles.headerRow}>
        <Ionicons name="time-outline" size={18} color={Colors.warm[700]} />
        <Text style={styles.title}>Zona horaria</Text>
      </View>
      <Text style={styles.subtitle}>
        Usamos esta zona para enviarte el digest semanal y los recordatorios a
        tu hora local.
      </Text>

      <View style={styles.fields}>
        <View style={styles.fieldCol}>
          <Text style={styles.fieldLabel}>En tu cuenta</Text>
          <Text style={styles.fieldValue} testID="stored-tz">
            {storedTz ?? "No configurada (UTC)"}
          </Text>
        </View>
        <View style={styles.fieldCol}>
          <Text style={styles.fieldLabel}>Tu dispositivo</Text>
          <Text style={styles.fieldValue} testID="device-tz">
            {deviceTz ?? "Desconocida"}
          </Text>
        </View>
      </View>

      {mismatch ? (
        <Pressable
          onPress={() => deviceTz && void commit(deviceTz)}
          disabled={submitting}
          style={styles.useDeviceBtn}
          testID="use-device-tz"
        >
          <Text style={styles.useDeviceBtnText}>
            Usar la de mi dispositivo ({deviceTz})
          </Text>
        </Pressable>
      ) : null}

      <Pressable
        onPress={() => setPicking(true)}
        disabled={submitting}
        style={styles.changeBtn}
        testID="change-tz"
      >
        <Text style={styles.changeBtnText}>Elegir manualmente</Text>
        <Ionicons name="chevron-forward" size={16} color={Colors.warm[500]} />
      </Pressable>

      <Modal
        visible={picking}
        animationType="slide"
        transparent={false}
        onRequestClose={() => setPicking(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Pressable onPress={() => setPicking(false)} hitSlop={12}>
              <Text style={styles.cancelText}>Cancelar</Text>
            </Pressable>
            <Text style={styles.modalTitle}>Elegir zona horaria</Text>
            <View style={{ width: 60 }} />
          </View>
          <FlatList
            data={options}
            keyExtractor={(tz) => tz}
            initialNumToRender={30}
            renderItem={({ item }) => {
              const active = item === storedTz;
              return (
                <Pressable
                  onPress={() => void commit(item)}
                  style={[
                    styles.tzRow,
                    active && { backgroundColor: Colors.lavender[50] },
                  ]}
                >
                  <Text
                    style={[
                      styles.tzRowText,
                      active && { color: Colors.lavender[700] },
                    ]}
                  >
                    {item}
                  </Text>
                  {active ? (
                    <Ionicons
                      name="checkmark"
                      size={18}
                      color={Colors.lavender[700]}
                    />
                  ) : null}
                </Pressable>
              );
            }}
          />
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#fff",
    borderRadius: Radius.lg,
    borderWidth: 1.5,
    borderColor: Colors.warm[200],
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  title: {
    fontSize: 15,
    fontWeight: "600",
    color: Colors.warm[900],
  },
  subtitle: {
    marginTop: 2,
    fontSize: 12,
    color: Colors.warm[500],
  },
  fields: {
    flexDirection: "row",
    marginTop: Spacing.sm,
    gap: Spacing.md,
  },
  fieldCol: { flex: 1 },
  fieldLabel: {
    fontSize: 11,
    color: Colors.warm[500],
  },
  fieldValue: {
    marginTop: 2,
    fontSize: 13,
    fontWeight: "500",
    color: Colors.warm[900],
  },
  useDeviceBtn: {
    marginTop: Spacing.sm,
    alignSelf: "flex-start",
    borderWidth: 1.5,
    borderColor: Colors.sage[400],
    borderRadius: 999,
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
  },
  useDeviceBtnText: {
    fontSize: 12,
    fontWeight: "500",
    color: Colors.sage[600],
  },
  changeBtn: {
    marginTop: Spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: Colors.warm[100],
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
  },
  changeBtnText: {
    fontSize: 13,
    fontWeight: "500",
    color: Colors.warm[900],
  },
  modalContainer: {
    flex: 1,
    backgroundColor: "#fff",
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    paddingTop: Spacing.xl,
    borderBottomWidth: 1,
    borderBottomColor: Colors.warm[200],
  },
  cancelText: {
    fontSize: 14,
    color: Colors.lavender[700],
    width: 60,
  },
  modalTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.warm[900],
  },
  tzRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.md,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.warm[100],
  },
  tzRowText: {
    fontSize: 14,
    color: Colors.warm[900],
  },
});
