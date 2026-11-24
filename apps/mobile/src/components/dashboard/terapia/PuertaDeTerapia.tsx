import { useEffect, useState, type ReactNode } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { terapiaApi } from "@psico/api-client";
import type { TherapyHistoryPresence } from "@psico/types";

import { TerapiaCerrada } from "@/components/dashboard/terapia/TerapiaCerrada";
import { Colors } from "@/theme";

/**
 * Envuelve una pantalla de OFERTA: directorio, ficha, reserva.
 *
 * Pregunta al hub y sólo monta la pantalla con un sí explícito. Así lo que hay
 * dentro no llega a pedir el directorio ni una agenda, también si se entra por
 * un enlace directo. Cerrada es la respuesta además cuando la API no contesta o
 * es una anterior que no publica `offer`.
 */
type Estado =
  | { fase: "cargando" }
  | { fase: "cerrada"; historial: TherapyHistoryPresence | null }
  | { fase: "abierta" };

export function PuertaDeTerapia({ children }: { children: ReactNode }) {
  const [estado, setEstado] = useState<Estado>({ fase: "cargando" });

  useEffect(() => {
    let cancelado = false;
    terapiaApi
      .getHub()
      .then((hub) => {
        if (cancelado) return;
        setEstado(
          (hub.offer?.open ?? false)
            ? { fase: "abierta" }
            : { fase: "cerrada", historial: hub.history ?? null },
        );
      })
      .catch(() => {
        if (!cancelado) setEstado({ fase: "cerrada", historial: null });
      });
    return () => {
      cancelado = true;
    };
  }, []);

  if (estado.fase === "cargando") {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={Colors.lavender[500]} />
      </View>
    );
  }
  if (estado.fase === "cerrada") {
    return <TerapiaCerrada historial={estado.historial} />;
  }
  return <>{children}</>;
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.warm[50],
  },
});
