import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useState } from "react";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import type { UserPlan } from "@psico/types";
import { useAuth } from "@/context/auth";
import { Colors, Radius, Spacing } from "@/theme";

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

function initials(name: string): string {
  return name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

export default function ProfileScreen() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  if (!user) return null;

  const handleLogout = () => {
    Alert.alert("Cerrar sesión", "¿Estás seguro que deseas salir?", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Cerrar sesión",
        style: "destructive",
        onPress: async () => {
          setLoggingOut(true);
          await logout();
          // AuthGate redirects to login automatically
        },
      },
    ]);
  };

  const planColor = PLAN_COLOR[user.plan];

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.scroll}
      showsVerticalScrollIndicator={false}
    >
      {/* Avatar */}
      <View style={styles.avatarSection}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials(user.name)}</Text>
        </View>
        <Text style={styles.name}>{user.name}</Text>
        <Text style={styles.email}>{user.email}</Text>
        <View style={[styles.planBadge, { backgroundColor: planColor + "20" }]}>
          <Ionicons name="diamond" size={12} color={planColor} />
          <Text style={[styles.planLabel, { color: planColor }]}>
            Plan {PLAN_LABEL[user.plan]}
          </Text>
        </View>
      </View>

      {/* Account section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Cuenta</Text>
        <View style={styles.card}>
          <SettingsRow icon="person-outline" label="Nombre" value={user.name} />
          <View style={styles.divider} />
          <SettingsRow icon="mail-outline" label="Correo" value={user.email} />
          <View style={styles.divider} />
          <SettingsRow
            icon="shield-checkmark-outline"
            label="Rol"
            value={
              user.role === "ADMIN"
                ? "Administrador"
                : user.role === "PSYCHOLOGIST"
                  ? "Psicólogo"
                  : "Usuario"
            }
          />
        </View>
      </View>

      {/* Security shortcut */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Seguridad</Text>
        <Pressable
          style={styles.card}
          onPress={() => router.push("/(tabs)/security")}
        >
          <View style={rowStyles.row}>
            <View style={rowStyles.iconWrap}>
              <Ionicons
                name="key-outline"
                size={18}
                color={Colors.lavender[500]}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={rowStyles.label}>
                Contraseña y frase de respaldo
              </Text>
              <Text style={rowStyles.value}>Cambiar contraseña</Text>
            </View>
            <Ionicons
              name="chevron-forward"
              size={18}
              color={Colors.warm[400]}
            />
          </View>
        </Pressable>
      </View>

      {/* App section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>App</Text>
        <View style={styles.card}>
          <SettingsRow
            icon="information-circle-outline"
            label="Versión"
            value="1.0.0"
          />
          <View style={styles.divider} />
          <SettingsRow
            icon="globe-outline"
            label="Plataforma"
            value="Psico Platform"
          />
        </View>
      </View>

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

type SettingsRowProps = {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  value: string;
};

function SettingsRow({ icon, label, value }: SettingsRowProps) {
  return (
    <View style={rowStyles.row}>
      <View style={rowStyles.iconWrap}>
        <Ionicons name={icon} size={18} color={Colors.lavender[500]} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={rowStyles.label}>{label}</Text>
        <Text style={rowStyles.value}>{value}</Text>
      </View>
    </View>
  );
}

const rowStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    gap: Spacing.sm,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: Radius.sm,
    backgroundColor: Colors.lavender[50],
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    fontSize: 12,
    color: Colors.warm[500],
  },
  value: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.warm[800],
  },
});

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.warm[50],
  },
  scroll: {
    padding: Spacing.lg,
    paddingBottom: Spacing.xxl,
    gap: Spacing.lg,
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
  avatarText: {
    fontSize: 32,
    fontWeight: "700",
    color: Colors.white,
  },
  name: {
    fontSize: 22,
    fontWeight: "700",
    color: Colors.warm[800],
  },
  email: {
    fontSize: 14,
    color: Colors.warm[500],
  },
  planBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    borderRadius: Radius.full,
    marginTop: Spacing.xs,
  },
  planLabel: {
    fontSize: 12,
    fontWeight: "700",
  },
  section: {
    gap: Spacing.sm,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: Colors.warm[500],
    textTransform: "uppercase",
    letterSpacing: 0.5,
    paddingHorizontal: Spacing.xs,
  },
  card: {
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    overflow: "hidden",
    shadowColor: Colors.warm[900],
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.warm[100],
    marginLeft: Spacing.lg + 32 + Spacing.sm,
  },
  logoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    paddingVertical: 16,
    borderWidth: 1.5,
    borderColor: "#fed7d7",
    marginTop: Spacing.sm,
  },
  logoutBtnDisabled: {
    opacity: 0.6,
  },
  logoutText: {
    fontSize: 15,
    fontWeight: "700",
    color: Colors.error,
  },
});
