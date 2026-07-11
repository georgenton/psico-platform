import { useEffect, useState } from "react";
import { Alert, StyleSheet, Switch, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { usersApi } from "@psico/api-client";
import {
  setTextAnalysisConsentCache,
  textAnalysisConsent,
} from "@/lib/text-analysis-consent";
import { Colors, Radius, Spacing } from "@/theme";

/**
 * LocalTextAnalysisCard (mobile) — Fase D (V2, decision L4).
 *
 * Explicit consent for the ON-DEVICE reflection text analysis (TXT-L1),
 * twin of the web card. Self-loading: reads the current consent via the
 * cached helper (the auth context user does not carry privacy settings).
 * Default off; turning it off asks for confirmation because the server
 * deletes the derived numeric rows (consent cascade).
 */
export function LocalTextAnalysisCard() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [pending, setPending] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void textAnalysisConsent().then((v) => {
      if (alive) setEnabled(v);
    });
    return () => {
      alive = false;
    };
  }, []);

  async function save(next: boolean) {
    setPending(true);
    try {
      await usersApi.updatePrivacy({ localTextAnalysis: next });
      setEnabled(next);
      setTextAnalysisConsentCache(next);
      setFlash(
        next
          ? "Activado. Tus próximas reflexiones se analizarán en tu dispositivo."
          : "Desactivado. Borramos los datos derivados de tus reflexiones.",
      );
      setTimeout(() => setFlash(null), 4000);
    } catch {
      setFlash("No pudimos guardar el cambio. Reintenta.");
      setTimeout(() => setFlash(null), 4000);
    } finally {
      setPending(false);
    }
  }

  function onToggle(next: boolean) {
    if (!next) {
      Alert.alert(
        "¿Desactivar el análisis?",
        "Al desactivarlo también borramos los datos numéricos ya derivados de tus reflexiones.",
        [
          { text: "Cancelar", style: "cancel" },
          {
            text: "Desactivar y borrar",
            style: "destructive",
            onPress: () => void save(false),
          },
        ],
      );
      return;
    }
    void save(true);
  }

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.icon}>
          <Ionicons
            name="analytics-outline"
            size={18}
            color={Colors.lavender[700]}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>
            Análisis del lenguaje de tus reflexiones
          </Text>
          <Text style={styles.cardSubtitle}>
            Con tu permiso, la app analiza el texto de tus reflexiones en tu
            dispositivo — el texto nunca sale de él; solo suben números que
            ayudan a tu Mapa Emocional. Si lo desactivas, borramos esos datos
            derivados.
          </Text>
        </View>
        <Switch
          value={enabled === true}
          disabled={pending || enabled === null}
          onValueChange={onToggle}
          trackColor={{ true: Colors.sage[400], false: Colors.warm[200] }}
          accessibilityLabel="Análisis del lenguaje de tus reflexiones"
        />
      </View>
      {flash ? <Text style={styles.flash}>{flash}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.white,
    borderRadius: Radius.xl,
    borderWidth: 1.5,
    borderColor: Colors.warm[200],
    padding: Spacing.md,
    marginTop: Spacing.md,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  icon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: Colors.lavender[100],
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitle: {
    fontSize: 14.5,
    fontWeight: "700",
    color: Colors.warm[900],
  },
  cardSubtitle: {
    marginTop: 3,
    fontSize: 12.5,
    lineHeight: 18,
    color: Colors.warm[600],
  },
  flash: {
    marginTop: Spacing.sm,
    fontSize: 12.5,
    color: Colors.sage[600],
  },
});
