import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { terapiaApi } from "@psico/api-client";
import type { TherapistDetail } from "@psico/types";
import { Colors, Radius, Spacing } from "@/theme";

export default function TerapeutaPerfilScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [therapist, setTherapist] = useState<TherapistDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [favoritePending, setFavoritePending] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await terapiaApi.getTherapist(id);
      setTherapist(data);
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

  async function handleFavorite() {
    if (!therapist || favoritePending) return;
    setFavoritePending(true);
    try {
      await terapiaApi.toggleFavorite(therapist.id);
      setTherapist((prev) =>
        prev ? { ...prev, isFavorite: !prev.isFavorite } : prev,
      );
    } catch {
      Alert.alert("Error", "No pudimos actualizar tu favorito.");
    } finally {
      setFavoritePending(false);
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

  const initials = therapist.name
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <View style={styles.header}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>
        <View style={styles.headerContent}>
          <Text style={styles.name}>{therapist.name}</Text>
          <Text style={styles.title}>{therapist.title}</Text>
          <Text style={styles.price}>
            ${therapist.priceUsd.toFixed(0)} {therapist.currency} · 50 min
          </Text>
        </View>
        <Pressable
          onPress={handleFavorite}
          disabled={favoritePending}
          style={styles.favoriteButton}
        >
          <Ionicons
            name={therapist.isFavorite ? "heart" : "heart-outline"}
            size={22}
            color={
              therapist.isFavorite ? Colors.rose[600] : Colors.warm[400]
            }
          />
        </Pressable>
      </View>

      {therapist.bioLong || therapist.bioShort ? (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Sobre {therapist.name}</Text>
          <Text style={styles.bodyText}>
            {therapist.bioLong ?? therapist.bioShort}
          </Text>
        </View>
      ) : null}

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Enfoques</Text>
        <View style={styles.chipRow}>
          {therapist.specialties.map((s) => (
            <Text key={s} style={styles.chip}>
              {s}
            </Text>
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Modalidades</Text>
        <View style={styles.chipRow}>
          {therapist.modalities.map((m) => (
            <Text key={m} style={styles.chip}>
              {m}
            </Text>
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Idiomas</Text>
        <View style={styles.chipRow}>
          {therapist.languages.map((l) => (
            <Text key={l} style={styles.chip}>
              {l}
            </Text>
          ))}
        </View>
      </View>

      <Pressable
        onPress={() =>
          router.push(`/(tabs)/terapia/terapeutas/${therapist.id}/reservar`)
        }
        style={styles.reserveButton}
      >
        <Text style={styles.reserveButtonText}>Reservar sesión →</Text>
      </Pressable>
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
  errorText: { fontSize: 13, color: Colors.rose[700] },
  header: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.white,
    borderColor: Colors.warm[200],
    borderWidth: 1.5,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    gap: Spacing.md,
    marginBottom: Spacing.lg,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.lavender[100],
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    fontSize: 18,
    fontWeight: "600",
    color: Colors.lavender[700],
  },
  headerContent: { flex: 1 },
  name: { fontSize: 18, fontWeight: "600", color: Colors.warm[900] },
  title: { fontSize: 12, color: Colors.warm[500], marginTop: 2 },
  price: {
    fontSize: 13,
    color: Colors.sage[700],
    marginTop: Spacing.xs,
    fontWeight: "600",
  },
  favoriteButton: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  section: { marginBottom: Spacing.md },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    color: Colors.warm[500],
    marginBottom: Spacing.xs,
  },
  bodyText: { fontSize: 13, color: Colors.warm[700], lineHeight: 20 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: Spacing.xs },
  chip: {
    fontSize: 12,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    backgroundColor: Colors.warm[100],
    borderRadius: 999,
    color: Colors.warm[700],
  },
  reserveButton: {
    backgroundColor: Colors.lavender[600],
    paddingVertical: Spacing.md,
    borderRadius: Radius.lg,
    alignItems: "center",
    marginTop: Spacing.md,
  },
  reserveButtonText: {
    fontSize: 15,
    color: Colors.white,
    fontWeight: "600",
  },
  disclaimer: {
    fontSize: 11,
    color: Colors.warm[500],
    textAlign: "center",
    marginTop: Spacing.sm,
    lineHeight: 16,
  },
  disclaimerEmphasis: { fontWeight: "600", color: Colors.warm[700] },
});
