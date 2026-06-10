import { useEffect, useState } from "react";
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
import { Ionicons } from "@expo/vector-icons";
import { terapiaApi } from "@psico/api-client";
import type { CrisisResponse } from "@psico/types";
import { Colors, Radius, Spacing } from "@/theme";

export default function CrisisScreen() {
  const [data, setData] = useState<CrisisResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    terapiaApi
      .getCrisis("EC")
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((err) => {
        if (!cancelled)
          setError(
            err instanceof Error ? err.message : "Error desconocido",
          );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function callPhone(phone: string) {
    const url = `tel:${phone.replace(/[^+0-9]/g, "")}`;
    const can = await Linking.canOpenURL(url);
    if (!can) {
      Alert.alert("No disponible", "Tu dispositivo no puede hacer llamadas.");
      return;
    }
    await Linking.openURL(url);
  }

  async function openWhatsApp(num: string) {
    const url = `https://wa.me/${num.replace(/[^0-9]/g, "")}`;
    await Linking.openURL(url);
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={Colors.lavender[500]} />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <View style={styles.intro}>
        <Text style={styles.h1}>Estás haciendo lo correcto</Text>
        <Text style={styles.introBody}>
          Hay líneas que te pueden escuchar ahora mismo. Llamar es un paso
          valiente.
        </Text>
      </View>

      {error ? (
        <View style={styles.errorCard}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      {data ? (
        <>
          <Text style={styles.sectionLabel}>
            Líneas en{" "}
            {data.country === "EC" ? "Ecuador" : data.country}
          </Text>
          {data.lines.map((line) => (
            <View key={line.id} style={styles.lineCard}>
              <Text style={styles.lineName}>{line.name}</Text>
              <Text style={styles.lineMeta}>
                {line.availability} · {line.languages.join(", ")}
              </Text>
              <View style={styles.ctaRow}>
                <Pressable
                  onPress={() => callPhone(line.phone)}
                  style={styles.callButton}
                >
                  <Ionicons name="call" size={16} color={Colors.white} />
                  <Text style={styles.callButtonText}>
                    Llamar {line.phone}
                  </Text>
                </Pressable>
                {line.whatsapp ? (
                  <Pressable
                    onPress={() => openWhatsApp(line.whatsapp!)}
                    style={styles.outlineButton}
                  >
                    <Ionicons
                      name="logo-whatsapp"
                      size={14}
                      color={Colors.sage[700]}
                    />
                    <Text style={styles.outlineButtonText}>WhatsApp</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          ))}

          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Mientras tanto</Text>
            {data.safetyTipsShort.map((t, i) => (
              <View key={i} style={styles.bulletRow}>
                <Text style={styles.bulletDot}>•</Text>
                <Text style={styles.bulletText}>{t}</Text>
              </View>
            ))}
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Próximos pasos</Text>
            {data.nextSteps.map((t, i) => (
              <View key={i} style={styles.bulletRow}>
                <Text style={styles.bulletDot}>{i + 1}.</Text>
                <Text style={styles.bulletText}>{t}</Text>
              </View>
            ))}
          </View>
        </>
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
  },
  scroll: {
    padding: Spacing.lg,
    paddingBottom: Spacing.xl * 2,
    backgroundColor: Colors.warm[50],
  },
  intro: {
    backgroundColor: Colors.rose[50],
    borderColor: Colors.rose[200],
    borderWidth: 1.5,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
  },
  h1: {
    fontSize: 22,
    fontWeight: "700",
    color: Colors.rose[700],
    marginBottom: Spacing.xs,
  },
  introBody: {
    fontSize: 14,
    color: Colors.rose[700],
    lineHeight: 20,
  },
  errorCard: {
    backgroundColor: Colors.rose[50],
    borderColor: Colors.rose[200],
    borderWidth: 1.5,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  errorText: { fontSize: 13, color: Colors.rose[700] },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    color: Colors.warm[500],
    marginBottom: Spacing.sm,
    marginTop: Spacing.md,
  },
  lineCard: {
    backgroundColor: Colors.white,
    borderColor: Colors.warm[200],
    borderWidth: 1.5,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  lineName: { fontSize: 15, fontWeight: "600", color: Colors.warm[900] },
  lineMeta: {
    fontSize: 12,
    color: Colors.warm[500],
    marginTop: 2,
  },
  ctaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.xs,
    marginTop: Spacing.sm,
  },
  callButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    backgroundColor: Colors.rose[600],
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.md,
  },
  callButtonText: { fontSize: 13, color: Colors.white, fontWeight: "600" },
  outlineButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    borderColor: Colors.sage[300],
    borderWidth: 1.5,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.md,
  },
  outlineButtonText: { fontSize: 12, color: Colors.sage[700], fontWeight: "600" },
  section: {
    backgroundColor: Colors.white,
    borderColor: Colors.warm[200],
    borderWidth: 1.5,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    marginTop: Spacing.sm,
  },
  bulletRow: { flexDirection: "row", marginBottom: Spacing.xs, gap: Spacing.sm },
  bulletDot: { fontSize: 13, color: Colors.warm[500], width: 20 },
  bulletText: {
    flex: 1,
    fontSize: 13,
    color: Colors.warm[700],
    lineHeight: 20,
  },
});
