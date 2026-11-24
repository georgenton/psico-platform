import { StyleSheet, Text, View } from "react-native";
import { EMAIL_CHANGE_UNAVAILABLE_NOTICE } from "@psico/types";
import type { UserMeResponse } from "@psico/types";
import { Colors, Radius, Spacing } from "@/theme";

/**
 * El correo de la cuenta, sólo para leerlo. Gemela de la tarjeta web, y por la
 * misma razón: el enlace de confirmación que anunciaba el formulario llevaba a
 * una página que no existe. Ver `docs/product/tarea-cambio-de-correo.md`.
 */
export function EmailChangeCard({ me }: { me: UserMeResponse }) {
  return (
    <View style={styles.wrap} testID="email-change-card">
      <Text style={styles.title}>Correo de la cuenta</Text>
      <View style={styles.row}>
        <Text style={styles.rowLabel}>{me.user.email}</Text>
        <Text style={styles.rowHint}>{EMAIL_CHANGE_UNAVAILABLE_NOTICE}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.sm },
  title: {
    fontSize: 13,
    fontWeight: "700",
    color: Colors.warm[500],
    textTransform: "uppercase",
    letterSpacing: 0.5,
    paddingHorizontal: Spacing.xs,
  },
  row: {
    backgroundColor: "#fff",
    borderRadius: Radius.lg,
    borderWidth: 1.5,
    borderColor: Colors.warm[200],
    padding: Spacing.md,
  },
  rowLabel: { fontSize: 13, fontWeight: "600", color: Colors.warm[900] },
  rowHint: { fontSize: 11, color: Colors.warm[500], marginTop: 2 },
});
