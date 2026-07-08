import { useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors, Radius, Spacing } from "@/theme";

/**
 * DiarySecurityInfo (mobile) — "¿Por qué?" chip that opens a detailed modal
 * explaining the E2E lock in plain language: it's your account password, only
 * you can read it, and YOU decide remember-vs-ask / biometrics. Parity with
 * the web PrivacyInfoButton "diario" variant.
 */
export function DiarySecurityInfo() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Pressable
        style={styles.chip}
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel="Cómo protegemos tu diario"
      >
        <Ionicons
          name="information-circle-outline"
          size={13}
          color={Colors.lavender[700]}
        />
        <Text style={styles.chipText}>¿Por qué?</Text>
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <View style={styles.backdrop}>
          <View style={styles.card}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.emoji}>🔒</Text>
              <Text style={styles.title}>Solo tú puedes leer tu diario</Text>
              <Text style={styles.lead}>
                Piensa en tu diario como una{" "}
                <Text style={styles.b}>caja fuerte con una llave única</Text> —
                tú eres el único que la tiene.
              </Text>

              <Row emoji="🔑">
                Tu llave se crea con{" "}
                <Text style={styles.b}>
                  la misma contraseña con la que inicias sesión
                </Text>
                . No memorizas una clave aparte.
              </Row>
              <Row emoji="👀">
                Ni nuestro equipo puede abrir tu diario. Solo vemos texto
                revuelto que no significa nada.
              </Row>
              <Row emoji="📝">
                Si olvidas tu contraseña, nadie puede recuperar lo que
                escribiste. Por eso te damos una{" "}
                <Text style={styles.b}>frase de respaldo de 12 palabras</Text> —
                guárdala en un lugar seguro.
              </Row>

              <View style={styles.divider} />

              <Text style={styles.sectionTitle}>🤝 Tú decides cómo entrar</Text>
              <Text style={styles.sectionBody}>
                Como nadie más que tú puede abrirlo, también eres tú quien
                decide qué tan cómodo o qué tan estricto quieres que sea:
              </Text>
              <Row emoji="💾">
                <Text style={styles.b}>Recordar en este dispositivo:</Text>{" "}
                entras sin escribir la contraseña cada vez.
              </Row>
              <Row emoji="🙂">
                <Text style={styles.b}>Face ID / huella:</Text> desbloqueas con
                tu rostro o tu dedo, rápido y seguro en tu teléfono.
              </Row>
              <Row emoji="🔒">
                <Text style={styles.b}>Pedir cada vez:</Text> te pedimos la
                contraseña en cada sesión. Ideal en equipos compartidos.
              </Row>
              <Text style={styles.note}>
                Puedes cambiar esto cuando quieras en Perfil → Seguridad.
                Recordarlo es tan seguro como tu propio teléfono: por eso la
                decisión es tuya.
              </Text>

              <Pressable style={styles.button} onPress={() => setOpen(false)}>
                <Text style={styles.buttonText}>Entendido</Text>
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

function Row({
  emoji,
  children,
}: {
  emoji: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowEmoji}>{emoji}</Text>
      <Text style={styles.rowText}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "center",
    backgroundColor: Colors.lavender[50],
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  chipText: { fontSize: 12, fontWeight: "600", color: Colors.lavender[700] },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(30,20,50,0.55)",
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing.lg,
  },
  card: {
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    width: "100%",
    maxHeight: "85%",
  },
  emoji: { fontSize: 40, textAlign: "center", marginBottom: 8 },
  title: {
    fontSize: 19,
    fontWeight: "700",
    textAlign: "center",
    color: Colors.warm[900],
    marginBottom: 10,
  },
  lead: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
    color: Colors.warm[700],
    marginBottom: 18,
  },
  b: { fontWeight: "700", color: Colors.warm[800] },
  row: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 12,
    alignItems: "flex-start",
  },
  rowEmoji: { fontSize: 18, width: 26 },
  rowText: { flex: 1, fontSize: 13.5, lineHeight: 19, color: Colors.warm[700] },
  divider: {
    height: 1,
    backgroundColor: Colors.warm[100],
    marginVertical: 8,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: Colors.warm[900],
    marginTop: 8,
    marginBottom: 6,
  },
  sectionBody: {
    fontSize: 13.5,
    lineHeight: 19,
    color: Colors.warm[700],
    marginBottom: 12,
  },
  note: {
    fontSize: 12.5,
    lineHeight: 18,
    color: Colors.warm[500],
    marginTop: 4,
    marginBottom: 18,
  },
  button: {
    backgroundColor: Colors.lavender[600],
    borderRadius: Radius.md,
    paddingVertical: 13,
    alignItems: "center",
  },
  buttonText: { color: Colors.white, fontWeight: "700", fontSize: 14 },
});
