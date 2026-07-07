import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { isValidSeedPhrase, seedPhraseToMasterKey } from "@psico/crypto";
import { useDiaryKey } from "@/crypto/diary-key-context";
import { Colors, Radius, Spacing } from "@/theme";

/**
 * UnlockGate (mobile) — password input that derives + persists the diary key.
 *
 * On submit, the password is fed to Argon2id (~800ms on mid-range phones).
 * The resulting subkey is cached in SecureStore so subsequent app launches
 * load it without re-deriving. Cold-start UX cost: zero. First-time UX cost:
 * one password prompt + ~1s.
 *
 * For legacy accounts (cryptoSalt === null) we show a neutral "feature
 * unavailable" card pointing users to support.
 */
export function UnlockGate() {
  const { unlock, adoptMasterKey, unlocking, error, isLegacyAccount } =
    useDiaryKey();
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"password" | "seed">("password");
  const [seedText, setSeedText] = useState("");
  const [seedError, setSeedError] = useState<string | null>(null);

  async function handleSeedUnlock() {
    setSeedError(null);
    const trimmed = seedText.trim();
    if (!isValidSeedPhrase(trimmed)) {
      setSeedError(
        "Esta frase no es válida. Revisa que sean exactamente 12 palabras.",
      );
      return;
    }
    try {
      const recovered = seedPhraseToMasterKey(trimmed);
      await adoptMasterKey(recovered);
      recovered.fill(0);
      setSeedText("");
    } catch {
      setSeedError(
        "No pudimos recuperar la clave. Verifícala palabra por palabra.",
      );
    }
  }

  if (isLegacyAccount) {
    return (
      <View style={styles.card}>
        <View style={[styles.icon, { backgroundColor: Colors.warm[100] }]}>
          <Ionicons name="lock-open" size={22} color={Colors.warm[600]} />
        </View>
        <Text style={styles.title}>
          Tu cuenta no tiene cifrado E2E activado
        </Text>
        <Text style={styles.subtitle}>
          Las cuentas creadas antes del módulo de cripto no tienen un salt
          Argon2id. Contacta soporte para activarlo.
        </Text>
      </View>
    );
  }

  if (mode === "seed") {
    return (
      <View style={styles.card}>
        <View style={[styles.icon, { backgroundColor: Colors.lavender[50] }]}>
          <Ionicons name="key" size={22} color={Colors.lavender[700]} />
        </View>
        <Text style={styles.title}>Recupera con tu frase de respaldo</Text>
        <Text style={styles.subtitle}>
          Escribe las 12 palabras separadas por espacio. Usa esta opción solo si
          olvidaste tu contraseña.
        </Text>

        <Text style={styles.label}>Frase de 12 palabras</Text>
        <TextInput
          style={[styles.input, styles.seedInput]}
          value={seedText}
          onChangeText={setSeedText}
          placeholder="palabra1 palabra2 palabra3 …"
          placeholderTextColor={Colors.warm[400]}
          multiline
          numberOfLines={4}
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="none"
        />

        {seedError ? (
          <Text style={styles.error} accessibilityRole="alert">
            {seedError}
          </Text>
        ) : null}

        <Pressable
          style={[styles.button, !seedText.trim() && { opacity: 0.5 }]}
          onPress={handleSeedUnlock}
          disabled={!seedText.trim()}
        >
          <Text style={styles.buttonText}>Recuperar acceso</Text>
        </Pressable>

        <Pressable
          onPress={() => {
            setMode("password");
            setSeedError(null);
            setSeedText("");
          }}
        >
          <Text style={styles.linkButton}>Volver a usar contraseña</Text>
        </Pressable>

        <Text style={styles.helper}>
          ⓘ La recuperación es 100% local. Tu frase no se envía al servidor.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <View style={[styles.icon, { backgroundColor: Colors.lavender[50] }]}>
        <Ionicons name="lock-closed" size={22} color={Colors.lavender[700]} />
      </View>
      <Text style={styles.title}>Desbloquea tu diario</Text>
      <Text style={styles.subtitle}>
        Tu diario se cifra en tu dispositivo con una clave derivada de tu
        contraseña. Ingrésala una sola vez para esta instalación.
      </Text>

      <Text style={styles.label}>Contraseña de tu cuenta</Text>
      <TextInput
        style={styles.input}
        value={password}
        onChangeText={setPassword}
        placeholder="••••••••"
        placeholderTextColor={Colors.warm[400]}
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
        textContentType="password"
        editable={!unlocking}
      />

      {error ? (
        <Text style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}

      <Pressable
        style={[styles.button, (!password || unlocking) && { opacity: 0.5 }]}
        onPress={() => password && unlock(password)}
        disabled={!password || unlocking}
      >
        <Text style={styles.buttonText}>
          {unlocking ? "Derivando clave…" : "Desbloquear"}
        </Text>
      </Pressable>

      <Pressable onPress={() => setMode("seed")}>
        <Text style={styles.linkButton}>
          Olvidé mi contraseña — usar frase de respaldo
        </Text>
      </Pressable>

      <Text style={styles.helper}>
        ⓘ La derivación toma ~1 segundo. Tu contraseña nunca sale del
        dispositivo.
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
  icon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignSelf: "center",
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 17,
    fontWeight: "700",
    color: Colors.warm[900],
    textAlign: "center",
    marginTop: Spacing.sm + 2,
  },
  subtitle: {
    fontSize: 12.5,
    color: Colors.warm[500],
    textAlign: "center",
    marginTop: 6,
    lineHeight: 17,
  },
  label: {
    fontSize: 10.5,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
    color: Colors.warm[500],
    marginTop: Spacing.lg,
    marginBottom: 6,
  },
  input: {
    backgroundColor: Colors.warm[50],
    borderRadius: Radius.md,
    borderWidth: 1.5,
    borderColor: Colors.warm[200],
    paddingHorizontal: Spacing.sm + 2,
    paddingVertical: 10,
    fontSize: 14,
    color: Colors.warm[800],
  },
  error: {
    fontSize: 12,
    color: "#B91C1C",
    marginTop: 8,
  },
  button: {
    marginTop: Spacing.md,
    paddingVertical: 14,
    borderRadius: Radius.md,
    backgroundColor: Colors.sage[400],
    alignItems: "center",
  },
  buttonText: {
    color: Colors.white,
    fontWeight: "700",
    fontSize: 14,
  },
  helper: {
    fontSize: 11,
    color: Colors.warm[500],
    textAlign: "center",
    marginTop: Spacing.sm + 2,
  },
  seedInput: {
    minHeight: 90,
    textAlignVertical: "top",
    fontFamily: "monospace",
  },
  linkButton: {
    fontSize: 12,
    color: Colors.warm[500],
    textAlign: "center",
    textDecorationLine: "underline",
    marginTop: Spacing.sm + 2,
  },
});
