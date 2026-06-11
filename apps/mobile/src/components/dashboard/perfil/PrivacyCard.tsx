import { useState } from "react";
import { Alert, StyleSheet, Switch, Text, View } from "react-native";
import { usersApi } from "@psico/api-client";
import type { UserPrivacySettings } from "@psico/types";
import { Colors, Radius, Spacing } from "@/theme";

type Field = keyof Pick<
  UserPrivacySettings,
  "shareDiaryWithTherapist" | "anonymizedAnalytics" | "marketingEmail"
>;

const ROWS: Array<{ key: Field; title: string; hint: string }> = [
  {
    key: "shareDiaryWithTherapist",
    title: "Permitir compartir Diario con terapeuta",
    hint:
      "Cuando un terapeuta lo solicite, podrás aceptar compartir entradas (re-encrypt efímero).",
  },
  {
    key: "anonymizedAnalytics",
    title: "Analíticas anónimas",
    hint: "Compartimos uso (no contenido) para mejorar la plataforma.",
  },
  {
    key: "marketingEmail",
    title: "Correos de novedades",
    hint: "Catálogo, mejoras, ofertas. Operacionales siempre se envían.",
  },
];

/**
 * PrivacyCard — paridad mobile del web. Toggle inmediato con rollback
 * si el PATCH falla.
 */
export function PrivacyCard({
  initial,
  onChanged,
}: {
  initial: UserPrivacySettings;
  onChanged?: (next: UserPrivacySettings) => void;
}) {
  const [state, setState] = useState<UserPrivacySettings>(initial);
  const [pendingKey, setPendingKey] = useState<Field | null>(null);

  async function toggle(field: Field) {
    const previous = state[field];
    const next = !previous;
    setState({ ...state, [field]: next });
    setPendingKey(field);
    try {
      await usersApi.updatePrivacy({ [field]: next });
      onChanged?.({ ...state, [field]: next });
    } catch (e) {
      setState({ ...state, [field]: previous });
      Alert.alert(
        "No pudimos guardar",
        e instanceof Error ? e.message : "Reintenta en un momento.",
      );
    } finally {
      setPendingKey(null);
    }
  }

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Privacidad</Text>
      <Text style={styles.subtitle}>
        Decide qué compartes con la plataforma y terceros.
      </Text>

      {ROWS.map((row, idx) => (
        <View
          key={row.key}
          style={[styles.row, idx === 0 && { borderTopWidth: 0 }]}
        >
          <View style={styles.rowText}>
            <Text style={styles.rowTitle}>{row.title}</Text>
            <Text style={styles.rowHint}>{row.hint}</Text>
          </View>
          <Switch
            value={state[row.key]}
            onValueChange={() => toggle(row.key)}
            disabled={pendingKey === row.key}
            trackColor={{
              false: Colors.warm[200],
              true: Colors.lavender[500],
            }}
            thumbColor={Colors.white}
          />
        </View>
      ))}

      <View style={styles.footer}>
        <Text style={styles.footerText}>
          💡 Tu Diario sigue cifrado E2E. Aún con &quot;compartir con
          terapeuta&quot; activo, cada entrada se re-encripta solo para el
          terapeuta. Nosotros nunca vemos el texto.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: Spacing.md,
    padding: Spacing.lg,
    backgroundColor: Colors.white,
    borderWidth: 1.5,
    borderColor: Colors.warm[200],
    borderRadius: Radius.lg,
  },
  title: {
    fontSize: 15,
    fontWeight: "700",
    color: Colors.warm[900],
  },
  subtitle: {
    marginTop: 2,
    fontSize: 12,
    color: Colors.warm[500],
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.warm[100],
  },
  rowText: {
    flex: 1,
    paddingRight: 8,
  },
  rowTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: Colors.warm[900],
  },
  rowHint: {
    marginTop: 2,
    fontSize: 11,
    lineHeight: 14,
    color: Colors.warm[500],
  },
  footer: {
    marginTop: 12,
    padding: 10,
    backgroundColor: Colors.warm[50],
    borderRadius: Radius.md,
  },
  footerText: {
    fontSize: 11,
    lineHeight: 14,
    color: Colors.warm[600],
  },
});
