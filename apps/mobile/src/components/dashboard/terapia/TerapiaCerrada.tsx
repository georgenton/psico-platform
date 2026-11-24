import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import type { TherapyHistoryPresence } from "@psico/types";
import {
  THERAPY_OFFER_CLOSED_BODY,
  THERAPY_OFFER_CLOSED_MESSAGE,
} from "@psico/types";

import { Colors, Radius, Spacing } from "@/theme";

/**
 * Lo que se ve donde se ofrecería terapia. Gemelo del de la web: dice que no se
 * ofrece, dónde hay ayuda ahora y, sólo si la persona tiene algo, cómo volver a
 * verlo.
 */
const HISTORIAL = [
  {
    clave: "sessions",
    ruta: "/(tabs)/terapia/sesiones",
    texto: "Tus sesiones",
  },
  {
    clave: "prescriptions",
    ruta: "/(tabs)/terapia/recetas",
    texto: "Lo que te sugirieron",
  },
  {
    clave: "notifications",
    ruta: "/(tabs)/terapia/notificaciones",
    texto: "Tus avisos",
  },
] as const satisfies ReadonlyArray<{
  clave: keyof TherapyHistoryPresence;
  ruta: string;
  texto: string;
}>;

export function TerapiaCerrada({
  historial,
}: {
  /**
   * `null` = no se pudo saber, y se dice. Ausente = quien lo usa ya está dentro
   * del historial y no hay nada que enlazar.
   */
  historial?: TherapyHistoryPresence | null;
}) {
  const router = useRouter();
  const enlaces = HISTORIAL.filter((e) => historial?.[e.clave] ?? false);

  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <Text style={styles.h1}>Terapia</Text>

      <View style={styles.card}>
        <Text style={styles.titulo}>{THERAPY_OFFER_CLOSED_MESSAGE}</Text>
        <Text style={styles.cuerpo}>{THERAPY_OFFER_CLOSED_BODY}</Text>
        <Pressable
          onPress={() => router.push("/(tabs)/ayuda")}
          accessibilityRole="button"
          style={styles.boton}
        >
          <Text style={styles.botonTexto}>Ayuda inmediata</Text>
        </Pressable>
      </View>

      {enlaces.length > 0 ? (
        <>
          <Text style={styles.seccion}>Tu historial</Text>
          {enlaces.map((e) => (
            <Pressable
              key={e.clave}
              onPress={() => router.push(e.ruta)}
              accessibilityRole="button"
              style={styles.fila}
            >
              <Text style={styles.filaTexto}>{e.texto}</Text>
              <Ionicons
                name="chevron-forward"
                size={16}
                color={Colors.warm[400]}
              />
            </Pressable>
          ))}
        </>
      ) : null}

      {historial === null ? (
        <Text style={styles.nota}>
          No pudimos comprobar si tienes historial de terapia. Vuelve a
          intentarlo en un momento.
        </Text>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    padding: Spacing.lg,
    paddingBottom: Spacing.xl * 2,
    backgroundColor: Colors.warm[50],
  },
  h1: {
    fontSize: 26,
    fontWeight: "700",
    color: Colors.warm[900],
    marginBottom: Spacing.md,
  },
  card: {
    backgroundColor: Colors.white,
    borderColor: Colors.warm[200],
    borderWidth: 1.5,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
  },
  titulo: { fontSize: 15, fontWeight: "600", color: Colors.warm[900] },
  cuerpo: {
    fontSize: 14,
    color: Colors.warm[700],
    lineHeight: 20,
    marginTop: Spacing.xs,
  },
  boton: {
    alignSelf: "flex-start",
    justifyContent: "center",
    minHeight: 44,
    backgroundColor: Colors.lavender[600],
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.md,
    marginTop: Spacing.md,
  },
  botonTexto: { fontSize: 14, fontWeight: "600", color: Colors.white },
  seccion: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    color: Colors.warm[500],
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  fila: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 44,
    backgroundColor: Colors.white,
    borderColor: Colors.warm[200],
    borderWidth: 1.5,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
  },
  filaTexto: { fontSize: 14, fontWeight: "500", color: Colors.lavender[700] },
  nota: {
    fontSize: 13,
    color: Colors.warm[500],
    lineHeight: 19,
    marginTop: Spacing.lg,
  },
});
