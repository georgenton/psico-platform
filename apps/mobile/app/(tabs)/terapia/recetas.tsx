import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect } from "expo-router";
import { terapiaApi } from "@psico/api-client";
import type { TherapyPrescriptionItem } from "@psico/types";
import { Colors, Radius, Spacing } from "@/theme";

const KIND_LABEL: Record<string, string> = {
  BOOK: "📖 Libro",
  AUDIO: "🎧 Audio",
  EXERCISE: "🧘 Ejercicio",
  CARTA: "✉️ Carta",
};

export default function RecetasScreen() {
  const [items, setItems] = useState<TherapyPrescriptionItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await terapiaApi.listPrescriptions();
      setItems(res);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  useEffect(() => {
    void load();
  }, [load]);

  async function handleToggle(item: TherapyPrescriptionItem) {
    const next = !item.completedAt;
    // Optimistic
    setItems((prev) =>
      prev
        ? prev.map((p) =>
            p.id === item.id
              ? {
                  ...p,
                  completedAt: next ? new Date().toISOString() : null,
                }
              : p,
          )
        : prev,
    );
    try {
      await terapiaApi.updatePrescription(item.id, next);
    } catch {
      // Revert on error
      void load();
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={Colors.lavender[500]} />
      </View>
    );
  }

  const open = items?.filter((p) => !p.completedAt) ?? [];
  const done = items?.filter((p) => p.completedAt) ?? [];

  return (
    <ScrollView
      contentContainerStyle={styles.scroll}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            void load();
          }}
        />
      }
    >
      <Text style={styles.h1}>Lo que tu terapeuta sugirió</Text>

      {error ? (
        <View style={styles.errorCard}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      {items && items.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>
            Cuando tengas tu primera sesión, las sugerencias que te dé tu
            terapeuta aparecerán acá.
          </Text>
        </View>
      ) : null}

      {open.length > 0 ? (
        <>
          <Text style={styles.sectionLabel}>Pendientes</Text>
          {open.map((p) => (
            <PrescriptionCard
              key={p.id}
              item={p}
              onToggle={() => handleToggle(p)}
            />
          ))}
        </>
      ) : null}

      {done.length > 0 ? (
        <>
          <Text style={styles.sectionLabel}>Completadas</Text>
          {done.map((p) => (
            <PrescriptionCard
              key={p.id}
              item={p}
              onToggle={() => handleToggle(p)}
            />
          ))}
        </>
      ) : null}
    </ScrollView>
  );
}

function PrescriptionCard({
  item,
  onToggle,
}: {
  item: TherapyPrescriptionItem;
  onToggle: () => void;
}) {
  const completed = !!item.completedAt;
  return (
    <View
      style={[
        styles.card,
        {
          borderColor: completed ? Colors.sage[200] : Colors.warm[200],
        },
      ]}
    >
      <View style={{ flex: 1 }}>
        <Text style={styles.kind}>
          {KIND_LABEL[item.kind] ?? item.kind} · {item.dosage ?? "Sin dosis"}
        </Text>
        {item.note ? (
          <Text style={styles.note} numberOfLines={3}>
            {item.note}
          </Text>
        ) : null}
        {item.dueBy && !completed ? (
          <Text style={styles.dueBy}>
            Sugerido para antes del{" "}
            {new Date(item.dueBy).toLocaleDateString("es-419", {
              dateStyle: "long",
            })}
          </Text>
        ) : null}
      </View>
      <Pressable
        onPress={onToggle}
        style={[
          styles.toggleButton,
          {
            borderColor: completed ? Colors.sage[400] : Colors.warm[300],
            backgroundColor: completed ? Colors.sage[50] : Colors.white,
          },
        ]}
      >
        <Text
          style={[
            styles.toggleButtonText,
            { color: completed ? Colors.sage[700] : Colors.warm[700] },
          ]}
        >
          {completed ? "✓ Hecho" : "Marcar"}
        </Text>
      </Pressable>
    </View>
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
  h1: {
    fontSize: 22,
    fontWeight: "700",
    color: Colors.warm[900],
    marginBottom: Spacing.md,
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
  emptyCard: {
    backgroundColor: Colors.white,
    borderColor: Colors.warm[200],
    borderWidth: 1.5,
    borderRadius: Radius.lg,
    padding: Spacing.xl,
    alignItems: "center",
  },
  emptyText: {
    fontSize: 13,
    color: Colors.warm[500],
    textAlign: "center",
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    color: Colors.warm[500],
    marginBottom: Spacing.sm,
    marginTop: Spacing.md,
  },
  card: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: Colors.white,
    borderWidth: 1.5,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    gap: Spacing.sm,
  },
  kind: { fontSize: 13, fontWeight: "600", color: Colors.warm[900] },
  note: { fontSize: 12, color: Colors.warm[700], marginTop: 2 },
  dueBy: { fontSize: 11, color: Colors.warm[500], marginTop: 2 },
  toggleButton: {
    borderWidth: 1.5,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs + 2,
    borderRadius: Radius.md,
  },
  toggleButtonText: { fontSize: 11, fontWeight: "600" },
});
