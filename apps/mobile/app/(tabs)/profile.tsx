import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { usersApi } from "@psico/api-client";
import type { UserMeResponse, UserPlan } from "@psico/types";

import { useAuth } from "@/context/auth";
import { Colors, Radius, Spacing } from "@/theme";
import { StatsGrid } from "@/components/dashboard/perfil/StatsGrid";
import { AchievementsList } from "@/components/dashboard/perfil/AchievementsList";
import { DangerZone } from "@/components/dashboard/perfil/DangerZone";
import { EmailChangeCard } from "@/components/dashboard/perfil/EmailChangeCard";
import { PrivacyCard } from "@/components/dashboard/perfil/PrivacyCard";

const PLAN_LABEL: Record<UserPlan, string> = {
  FREE: "Gratuito",
  PRO: "Pro",
  ANNUAL: "Pro Anual",
  B2B: "Empresarial",
};

const PLAN_COLOR: Record<UserPlan, string> = {
  FREE: Colors.warm[500],
  PRO: Colors.lavender[500],
  ANNUAL: Colors.lavender[600],
  B2B: Colors.sage[500],
};

export default function ProfileScreen() {
  const { user, logout } = useAuth();
  const router = useRouter();

  const [me, setMe] = useState<UserMeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await usersApi.getMe();
      setMe(data);
    } catch {
      // ignore; the header below still shows the cached `useAuth` user
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleLogout = () => {
    Alert.alert("Cerrar sesión", "¿Estás seguro que deseas salir?", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Cerrar sesión",
        style: "destructive",
        onPress: async () => {
          setLoggingOut(true);
          await logout();
        },
      },
    ]);
  };

  if (!user) return null;

  const planColor = PLAN_COLOR[user.plan];

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.scroll}
      showsVerticalScrollIndicator={false}
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
      {/* screen-head — Sprint H5 */}
      <View style={styles.head}>
        <Text style={styles.eyebrow}>Tu cuenta</Text>
        <Text style={styles.title}>Mi Perfil</Text>
        <Text style={styles.subtitle}>
          Tu identidad en Psico. Aquí gestionas tu información, privacidad y
          ajustes de la app.
        </Text>
      </View>

      {/* Avatar */}
      <View style={styles.avatarSection}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {(me?.user.initials || user.name.slice(0, 2)).toUpperCase()}
          </Text>
        </View>
        <Text style={styles.name}>{me?.user.firstName ?? user.name}</Text>
        <Text style={styles.email}>{user.email}</Text>
        <View style={[styles.planBadge, { backgroundColor: planColor + "20" }]}>
          <Ionicons name="diamond" size={12} color={planColor} />
          <Text style={[styles.planLabel, { color: planColor }]}>
            Plan {PLAN_LABEL[user.plan]}
          </Text>
        </View>
      </View>

      {/* Loading skeleton for stats/achievements section */}
      {loading && !me ? (
        <View style={styles.loading}>
          <ActivityIndicator color={Colors.lavender[500]} />
        </View>
      ) : null}

      {/* Stats (Sprint S57) */}
      {me ? <StatsGrid stats={me.stats} /> : null}

      {/* Email change (Sprint S59) */}
      {me ? <EmailChangeCard me={me} /> : null}

      {/* Privacy (Sprint Perfil) */}
      {me ? (
        <PrivacyCard
          initial={me.privacy}
          onChanged={(next) =>
            setMe((prev) => (prev ? { ...prev, privacy: next } : prev))
          }
        />
      ) : null}

      {/* Achievements (Sprint S57) */}
      {me ? <AchievementsList achievements={me.achievements} /> : null}

      {/* Vistas — Sprint H1b + H1d */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Tu camino</Text>
        <ShortcutRow
          icon="compass-outline"
          label="Mi Mapa Emocional"
          hint="Comprensión emocional y 6 dimensiones"
          onPress={() => router.push("/(tabs)/mapa")}
        />
        <ShortcutRow
          icon="trending-up-outline"
          label="Mi Evolución"
          hint="Hitos, racha y comprensión mes a mes"
          onPress={() => router.push("/(tabs)/evolucion")}
        />
        <ShortcutRow
          icon="map-outline"
          label="Exploraciones"
          hint="Recorridos guiados hacia algo que quieres trabajar"
          onPress={() => router.push("/(tabs)/exploraciones")}
        />
      </View>

      {/* Shortcuts */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Ajustes</Text>
        <ShortcutRow
          icon="notifications-outline"
          label="Notificaciones"
          hint="Push, email digest, recordatorios"
          onPress={() => router.push("/(tabs)/notifications")}
        />
        <ShortcutRow
          icon="key-outline"
          label="Seguridad"
          hint="Contraseña, frase de respaldo"
          onPress={() => router.push("/(tabs)/security")}
        />
        <ShortcutRow
          icon="card-outline"
          label="Mi plan"
          hint="Suscripción, uso, facturas"
          onPress={() => router.push("/(tabs)/plan")}
        />
      </View>

      {/* Danger zone (Sprint S57) */}
      {me ? <DangerZone me={me} onChanged={() => void load()} /> : null}

      {/* Logout */}
      <Pressable
        style={[styles.logoutBtn, loggingOut && styles.logoutBtnDisabled]}
        onPress={handleLogout}
        disabled={loggingOut}
      >
        {loggingOut ? (
          <ActivityIndicator color={Colors.error} />
        ) : (
          <>
            <Ionicons name="log-out-outline" size={20} color={Colors.error} />
            <Text style={styles.logoutText}>Cerrar sesión</Text>
          </>
        )}
      </Pressable>
    </ScrollView>
  );
}

function ShortcutRow({
  icon,
  label,
  hint,
  onPress,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  hint: string;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.shortcutCard} onPress={onPress}>
      <View style={shortcutStyles.iconWrap}>
        <Ionicons name={icon} size={18} color={Colors.lavender[500]} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={shortcutStyles.label}>{label}</Text>
        <Text style={shortcutStyles.hint}>{hint}</Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={Colors.warm[400]} />
    </Pressable>
  );
}

const shortcutStyles = StyleSheet.create({
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: Radius.sm,
    backgroundColor: Colors.lavender[50],
    alignItems: "center",
    justifyContent: "center",
  },
  label: { fontSize: 13, fontWeight: "600", color: Colors.warm[900] },
  hint: { fontSize: 11, color: Colors.warm[500], marginTop: 2 },
});

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.warm[50] },
  scroll: {
    padding: Spacing.lg,
    paddingBottom: Spacing.xxl,
    gap: Spacing.lg,
  },
  head: {
    marginBottom: Spacing.sm,
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
  avatarSection: {
    alignItems: "center",
    paddingVertical: Spacing.lg,
    gap: Spacing.sm,
  },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: Radius.full,
    backgroundColor: Colors.lavender[500],
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.xs,
  },
  avatarText: { fontSize: 32, fontWeight: "700", color: "#fff" },
  name: { fontSize: 22, fontWeight: "700", color: Colors.warm[800] },
  email: { fontSize: 14, color: Colors.warm[500] },
  planBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    borderRadius: Radius.full,
    marginTop: Spacing.xs,
  },
  planLabel: { fontSize: 12, fontWeight: "700" },
  loading: { paddingVertical: Spacing.lg, alignItems: "center" },
  section: { gap: Spacing.sm },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: Colors.warm[500],
    textTransform: "uppercase",
    letterSpacing: 0.5,
    paddingHorizontal: Spacing.xs,
  },
  shortcutCard: {
    backgroundColor: "#fff",
    borderRadius: Radius.lg,
    borderWidth: 1.5,
    borderColor: Colors.warm[200],
    padding: Spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  logoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    backgroundColor: "#fff",
    borderRadius: Radius.lg,
    paddingVertical: 16,
    borderWidth: 1.5,
    borderColor: "#fed7d7",
    marginTop: Spacing.sm,
  },
  logoutBtnDisabled: { opacity: 0.6 },
  logoutText: { fontSize: 15, fontWeight: "700", color: Colors.error },
});
