import { useState } from "react";
import {
  Alert,
  Pressable,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { deriveMasterKey, masterKeyToSeedPhrase } from "@psico/crypto";
import { Colors, Radius, Spacing } from "@/theme";

/**
 * ShowSeedPhraseCard — Sprint seed-recovery (mobile).
 *
 * Permite que el usuario vea (otra vez) su frase de 24 palabras. Pide la
 * password como gate (la deriva localmente, igual que el unlock del
 * Diario y el flow de password change). Si la password está mal, el
 * masterKey deriva mal pero no podemos saberlo sin un cipher conocido —
 * por eso le pedimos al usuario que ya esté familiarizado con su seed
 * (post-modal del primer unlock).
 *
 * Seguridad: la frase solo vive en memoria del componente hasta que
 * "Ocultar" la borra del state. No la guardamos a SecureStore ni la
 * mandamos al backend.
 */
type Phase = "idle" | "asking" | "revealed";

export function ShowSeedPhraseCard({
  cryptoSalt,
}: {
  cryptoSalt: string | null;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [revealed, setRevealed] = useState<string | null>(null);

  async function deriveAndReveal() {
    if (!cryptoSalt) {
      Alert.alert(
        "Sin frase aún",
        "Esta cuenta no tiene cripto E2E inicializada. Crea una entrada de Diario primero para que se genere tu clave.",
      );
      return;
    }
    if (password.trim().length < 4) {
      Alert.alert("Contraseña corta", "Ingresa tu contraseña.");
      return;
    }
    setBusy(true);
    try {
      const masterKey = await deriveMasterKey(password, cryptoSalt);
      const words = masterKeyToSeedPhrase(masterKey);
      masterKey.fill(0); // zero out the master key buffer
      setRevealed(words);
      setPhase("revealed");
      setPassword("");
    } catch (e) {
      Alert.alert(
        "No pudimos derivar la clave",
        e instanceof Error ? e.message : "Intenta nuevamente.",
      );
    } finally {
      setBusy(false);
    }
  }

  function hide() {
    setRevealed(null);
    setPhase("idle");
  }

  async function copy() {
    if (!revealed) return;
    // Native Share es la forma estándar de exportar texto en RN sin agregar
    // expo-clipboard a las deps. El usuario puede mandar a Notes, a sí mismo
    // por email, etc.
    try {
      await Share.share({ message: revealed });
    } catch {
      // user cancelled — no-op
    }
  }

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.icon}>
          <Ionicons name="key" size={18} color={Colors.lavender[700]} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>Mi frase de respaldo</Text>
          <Text style={styles.cardSubtitle}>
            Tus 24 palabras. Si olvidas tu contraseña, son la única forma de
            recuperar tu Diario. Guárdalas offline.
          </Text>
        </View>
      </View>

      {phase === "idle" ? (
        <Pressable
          onPress={() => setPhase("asking")}
          style={styles.primaryBtn}
        >
          <Text style={styles.primaryBtnText}>Mostrar mi frase</Text>
        </Pressable>
      ) : null}

      {phase === "asking" ? (
        <View style={styles.askBlock}>
          <Text style={styles.label}>
            Tu contraseña (no la guardamos; solo derivamos la clave)
          </Text>
          <TextInput
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            placeholder="Tu contraseña actual"
            editable={!busy}
            autoCapitalize="none"
            autoComplete="current-password"
            style={styles.input}
          />
          <View style={styles.row}>
            <Pressable
              onPress={() => {
                setPhase("idle");
                setPassword("");
              }}
              disabled={busy}
              style={[styles.secondaryBtn, busy && { opacity: 0.5 }]}
            >
              <Text style={styles.secondaryBtnText}>Cancelar</Text>
            </Pressable>
            <Pressable
              onPress={deriveAndReveal}
              disabled={busy}
              style={[styles.primaryBtn, busy && { opacity: 0.5 }]}
            >
              <Text style={styles.primaryBtnText}>
                {busy ? "Derivando…" : "Revelar"}
              </Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {phase === "revealed" && revealed ? (
        <View style={styles.revealedBlock}>
          <View style={styles.wordsGrid}>
            {revealed.split(/\s+/).map((w, idx) => (
              <View key={`${idx}-${w}`} style={styles.wordCell}>
                <Text style={styles.wordIndex}>
                  {String(idx + 1).padStart(2, "0")}.
                </Text>
                <Text style={styles.wordText}>{w}</Text>
              </View>
            ))}
          </View>
          <View style={styles.row}>
            <Pressable onPress={copy} style={styles.copyBtn}>
              <Ionicons
                name="share-outline"
                size={13}
                color={Colors.warm[700]}
              />
              <Text style={styles.copyBtnText}>Compartir / Copiar</Text>
            </Pressable>
            <Pressable onPress={hide} style={styles.hideBtn}>
              <Text style={styles.hideBtnText}>Ocultar</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      <View style={styles.warning}>
        <Text style={styles.warningText}>
          ⚠️ Cualquiera con estas 24 palabras puede descifrar tu Diario para
          siempre. Trátalas como tu contraseña.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: Spacing.md,
    padding: Spacing.lg,
    backgroundColor: Colors.white,
    borderWidth: 1.5,
    borderColor: Colors.warm[200],
    borderRadius: Radius.lg,
  },
  cardHeader: {
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-start",
  },
  icon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.lavender[100],
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: Colors.warm[900],
  },
  cardSubtitle: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 16,
    color: Colors.warm[500],
  },
  primaryBtn: {
    marginTop: Spacing.md,
    paddingVertical: 12,
    backgroundColor: Colors.lavender[500],
    borderRadius: Radius.md,
    alignItems: "center",
    flex: 1,
  },
  primaryBtnText: {
    color: Colors.white,
    fontSize: 13,
    fontWeight: "700",
  },
  secondaryBtn: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: Colors.warm[100],
    borderRadius: Radius.md,
    alignItems: "center",
    flex: 1,
  },
  secondaryBtnText: {
    color: Colors.warm[700],
    fontSize: 13,
    fontWeight: "700",
  },
  askBlock: {
    marginTop: Spacing.md,
    gap: 8,
  },
  label: {
    fontSize: 11.5,
    fontWeight: "600",
    color: Colors.warm[700],
  },
  input: {
    borderWidth: 1.5,
    borderColor: Colors.warm[200],
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    fontSize: 14,
    color: Colors.warm[800],
    backgroundColor: Colors.warm[50],
  },
  row: {
    marginTop: 4,
    flexDirection: "row",
    gap: 8,
  },
  revealedBlock: {
    marginTop: Spacing.md,
    gap: 10,
  },
  wordsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    padding: Spacing.md,
    backgroundColor: Colors.lavender[50],
    borderWidth: 1.5,
    borderColor: Colors.lavender[300],
    borderRadius: Radius.md,
  },
  wordCell: {
    width: "48%",
    flexDirection: "row",
    gap: 6,
    alignItems: "baseline",
  },
  wordIndex: {
    fontSize: 10.5,
    fontWeight: "700",
    color: Colors.lavender[700],
    fontFamily: "Menlo",
  },
  wordText: {
    fontSize: 13,
    color: Colors.warm[900],
    fontFamily: "Menlo",
  },
  copyBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    backgroundColor: Colors.warm[100],
    borderRadius: Radius.md,
  },
  copyBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: Colors.warm[700],
  },
  hideBtn: {
    flex: 1,
    paddingVertical: 10,
    backgroundColor: Colors.rose[100],
    borderRadius: Radius.md,
    alignItems: "center",
  },
  hideBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: Colors.rose[700],
  },
  warning: {
    marginTop: Spacing.md,
    padding: Spacing.md,
    backgroundColor: Colors.rose[50],
    borderRadius: Radius.md,
  },
  warningText: {
    fontSize: 11.5,
    lineHeight: 15,
    color: Colors.rose[700],
  },
});
