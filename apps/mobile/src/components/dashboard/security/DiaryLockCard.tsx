import { Pressable, StyleSheet, Switch, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useDiaryKey } from "@/crypto/diary-key-context";
import { DiarySecurityInfo } from "@/components/dashboard/diario/DiarySecurityInfo";
import { Colors, Radius, Spacing } from "@/theme";

/**
 * DiaryLockCard (mobile) — Perfil → Seguridad control for the E2E diary/Eco
 * lock. Mirrors the web card: toggle "recordar", toggle Face ID / huella
 * (shown only when the device supports it), and "Bloquear ahora".
 */
export function DiaryLockCard() {
  const {
    key,
    isLegacyAccount,
    remember,
    setRemember,
    biometricLock,
    setBiometricLock,
    biometricAvailable,
    biometricLabel,
    lock,
  } = useDiaryKey();

  if (isLegacyAccount) return null;

  const unlocked = key !== null;

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.icon}>
          <Ionicons
            name="finger-print"
            size={18}
            color={Colors.lavender[700]}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>Bloqueo del diario y Eco</Text>
          <Text style={styles.cardSubtitle}>
            Se abren con la misma contraseña de tu cuenta. Solo tú puedes
            leerlos.
          </Text>
        </View>
      </View>

      <View style={{ marginTop: Spacing.sm }}>
        <DiarySecurityInfo />
      </View>

      {/* Remember toggle */}
      <View style={styles.row}>
        <View style={{ flex: 1, paddingRight: 10 }}>
          <Text style={styles.rowTitle}>Recordar en este dispositivo</Text>
          <Text style={styles.rowHelp}>
            {remember
              ? "Activado: no te pediremos la contraseña la próxima vez."
              : "Desactivado: te pediremos la contraseña cada vez."}
          </Text>
        </View>
        <Switch
          value={remember}
          onValueChange={setRemember}
          trackColor={{ true: Colors.sage[400], false: Colors.warm[200] }}
        />
      </View>

      {/* Biometric toggle — only when the device supports it */}
      {biometricAvailable ? (
        <View style={styles.row}>
          <View style={{ flex: 1, paddingRight: 10 }}>
            <Text style={styles.rowTitle}>
              Pedir {biometricLabel} para abrir
            </Text>
            <Text style={styles.rowHelp}>
              {biometricLock
                ? `Activado: desbloqueas con ${biometricLabel} en vez de la contraseña.`
                : "Desactivado: se abre directo sin verificación."}
            </Text>
          </View>
          <Switch
            value={biometricLock}
            onValueChange={setBiometricLock}
            trackColor={{ true: Colors.sage[400], false: Colors.warm[200] }}
          />
        </View>
      ) : null}

      {/* Lock now */}
      <Pressable
        style={[styles.lockButton, !unlocked && { opacity: 0.5 }]}
        onPress={() => void lock()}
        disabled={!unlocked}
      >
        <Ionicons name="lock-closed" size={15} color={Colors.warm[700]} />
        <Text style={styles.lockButtonText}>Bloquear ahora</Text>
      </Pressable>
      <Text style={styles.status}>
        {unlocked
          ? "Tu diario está desbloqueado en esta sesión."
          : "Tu diario está bloqueado."}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    borderWidth: 1.5,
    borderColor: Colors.warm[200],
    padding: Spacing.lg,
  },
  cardHeader: {
    flexDirection: "row",
    gap: Spacing.sm + 2,
    alignItems: "flex-start",
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.lavender[50],
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitle: { fontSize: 16, fontWeight: "700", color: Colors.warm[900] },
  cardSubtitle: {
    marginTop: 4,
    fontSize: 12,
    color: Colors.warm[500],
    lineHeight: 17,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: Spacing.md,
    backgroundColor: Colors.warm[50],
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.sm + 2,
    paddingVertical: 10,
  },
  rowTitle: { fontSize: 13, fontWeight: "700", color: Colors.warm[800] },
  rowHelp: {
    fontSize: 11.5,
    color: Colors.warm[500],
    marginTop: 2,
    lineHeight: 15,
  },
  lockButton: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    justifyContent: "center",
    marginTop: Spacing.md,
    paddingVertical: 12,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    borderColor: Colors.warm[300],
  },
  lockButtonText: { fontSize: 13, fontWeight: "700", color: Colors.warm[700] },
  status: {
    marginTop: 8,
    fontSize: 11.5,
    color: Colors.warm[400],
    textAlign: "center",
  },
});
