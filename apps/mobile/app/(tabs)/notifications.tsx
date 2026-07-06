import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { usersApi } from "@psico/api-client";
import type {
  UpdateNotificationsRequest,
  UserNotificationSettings,
} from "@psico/types";
import { Colors, Radius, Spacing } from "@/theme";
import { TimezoneCard } from "@/components/dashboard/notifications/TimezoneCard";

/**
 * Notifications settings — Sprint S45 (mobile).
 *
 * Mirrors the web /dashboard/notifications page. Toggles update
 * optimistically; failures roll back and surface inline.
 *
 * UX choices:
 * - Each row is independent. No "Save" button — the toggle IS the save.
 * - reminderTime uses a plain TextInput with HH:MM hint (RN core doesn't
 *   ship a time picker; we keep zero deps for v1, add a Pressable+modal
 *   picker if UX feedback asks for it).
 */
const ROWS: Array<{
  key: keyof UserNotificationSettings;
  label: string;
  hint: string;
}> = [
  {
    key: "dailyReminder",
    label: "Recordatorio diario",
    hint: "Te notificamos a tu hora para escribir o leer.",
  },
  {
    key: "streakReminders",
    label: "Recordatorios de racha",
    hint: "Avisos cuando tu racha esté por romperse.",
  },
  {
    key: "ecoReplies",
    label: "Respuestas de Eco",
    hint: "Te avisamos cuando Eco termine una respuesta larga.",
  },
  {
    key: "weeklyReport",
    label: "Resumen semanal",
    hint: "Email cada lunes con tu mapa emocional.",
  },
  {
    key: "terapiaReminders",
    label: "Recordatorios de terapia",
    hint: "Avisos antes de tu próxima sesión (v2).",
  },
];

export default function NotificationsScreen() {
  const [state, setState] = useState<UserNotificationSettings | null>(null);
  const [timezone, setTimezone] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [savedFlash, setSavedFlash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const me = await usersApi.getMe();
      setState(me.notifications);
      setTimezone(me.user.timezone ?? null);
    } catch {
      setError("No pudimos cargar tus preferencias. Reintenta.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(patch: UpdateNotificationsRequest) {
    if (!state) return;
    const prev = state;
    setState({ ...state, ...patch });
    setError(null);
    setSubmitting(true);
    try {
      const next = await usersApi.updateNotifications(patch);
      setState(next);
      setSavedFlash("Guardado");
      setTimeout(() => setSavedFlash(null), 2500);
    } catch {
      setState(prev);
      setError("No pudimos guardar el cambio.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading || !state) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={Colors.lavender[500]} />
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: Colors.warm[50] }}
      contentContainerStyle={{ padding: Spacing.md, paddingBottom: 48 }}
    >
      <View style={styles.head}>
        <Text style={styles.eyebrow}>Tu ritmo, tus reglas</Text>
        <Text style={styles.title}>Notificaciones</Text>
        <Text style={styles.subtitle}>
          Controla qué te avisamos y cuándo. Los cambios entran en vigor en el
          próximo ciclo.
        </Text>
      </View>

      {savedFlash ? (
        <View style={styles.flash}>
          <Ionicons
            name="checkmark-circle"
            size={14}
            color={Colors.sage[500]}
          />
          <Text style={styles.flashText}>{savedFlash}</Text>
        </View>
      ) : null}
      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      <TimezoneCard
        currentTimezone={timezone}
        onChanged={(next) => setTimezone(next)}
      />

      <View style={styles.card}>
        {ROWS.map((r, idx) => {
          const v = state[r.key] as boolean;
          return (
            <View
              key={r.key}
              style={[styles.row, idx > 0 && styles.rowBorderTop]}
            >
              <View style={{ flex: 1, marginRight: Spacing.md }}>
                <Text style={styles.rowLabel}>{r.label}</Text>
                <Text style={styles.rowHint}>{r.hint}</Text>
              </View>
              <Switch
                value={v}
                onValueChange={() => void save({ [r.key]: !v })}
                disabled={submitting}
                trackColor={{
                  true: Colors.lavender[500],
                  false: Colors.warm[300],
                }}
                thumbColor={Colors.white}
              />
            </View>
          );
        })}

        <View style={[styles.row, styles.rowBorderTop]}>
          <View style={{ flex: 1, marginRight: Spacing.md }}>
            <Text style={styles.rowLabel}>Hora del recordatorio</Text>
            <Text style={styles.rowHint}>
              {state.dailyReminder
                ? "Hora local. Formato HH:MM."
                : "Activa el recordatorio diario primero."}
            </Text>
          </View>
          <TextInput
            value={state.reminderTime}
            editable={state.dailyReminder && !submitting}
            onSubmitEditing={(e) =>
              void save({ reminderTime: e.nativeEvent.text })
            }
            placeholder="20:00"
            placeholderTextColor={Colors.warm[400]}
            keyboardType="numbers-and-punctuation"
            style={[
              styles.timeInput,
              (!state.dailyReminder || submitting) && { opacity: 0.5 },
            ]}
            maxLength={5}
          />
        </View>
      </View>

      <Pressable style={styles.refreshBtn} onPress={() => void load()}>
        <Ionicons name="refresh" size={14} color={Colors.warm[600]} />
        <Text style={styles.refreshText}>Recargar</Text>
      </Pressable>

      <Text style={styles.footnote}>
        Estos ajustes se sincronizan entre web y mobile. El servidor es la
        fuente de verdad.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.warm[50],
  },
  head: {
    marginBottom: Spacing.md,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: Colors.lavender[500],
  },
  title: {
    marginTop: 6,
    fontSize: 26,
    fontWeight: "700",
    color: Colors.warm[900],
    letterSpacing: -0.5,
  },
  subtitle: {
    marginTop: 8,
    fontSize: 14,
    color: Colors.warm[600],
    lineHeight: 20,
  },
  flash: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Colors.sage[50],
    borderRadius: Radius.md,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: Spacing.sm,
  },
  flashText: {
    fontSize: 12.5,
    color: Colors.sage[600],
    fontWeight: "600",
  },
  errorBox: {
    backgroundColor: "#FEE2E2",
    borderRadius: Radius.md,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: Spacing.sm,
  },
  errorText: {
    color: "#B91C1C",
    fontSize: 12.5,
  },
  card: {
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    borderWidth: 1.5,
    borderColor: Colors.warm[200],
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: Spacing.md,
  },
  rowBorderTop: {
    borderTopWidth: 1,
    borderTopColor: Colors.warm[100],
  },
  rowLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.warm[900],
  },
  rowHint: {
    marginTop: 2,
    fontSize: 12,
    color: Colors.warm[500],
  },
  timeInput: {
    borderWidth: 1.5,
    borderColor: Colors.warm[200],
    borderRadius: Radius.md,
    paddingVertical: 6,
    paddingHorizontal: 10,
    fontSize: 14,
    color: Colors.warm[800],
    minWidth: 70,
    textAlign: "center",
  },
  refreshBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-end",
    marginTop: Spacing.sm,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  refreshText: {
    fontSize: 12,
    color: Colors.warm[600],
    fontWeight: "600",
  },
  footnote: {
    fontSize: 11,
    color: Colors.warm[400],
    marginTop: Spacing.md,
    textAlign: "center",
  },
});
