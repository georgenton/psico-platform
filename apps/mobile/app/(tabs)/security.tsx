import { useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { apiClient, diarioApi } from "@psico/api-client";
import { useAuth } from "@/context/auth";
import { ShowSeedPhraseCard } from "@/components/dashboard/security/ShowSeedPhraseCard";
import { LocalTextAnalysisCard } from "@/components/dashboard/security/LocalTextAnalysisCard";
import { DiaryLockCard } from "@/components/dashboard/security/DiaryLockCard";
import type {
  DiaryRawCipherEntry,
  PasswordChangeWithRekeyRequest,
  PasswordChangeWithRekeyResponse,
} from "@psico/types";
import {
  bytesToBase64Url,
  decryptString,
  deriveMasterKey,
  deriveSubKey,
  DIARY_KEY_INFO,
  encryptString,
  randomBytes,
} from "@psico/crypto";

import { useDiaryKey } from "@/crypto/diary-key-context";
import { Colors, Radius, Spacing } from "@/theme";

/**
 * Security screen (mobile) — password change with E2E re-encrypt.
 *
 * Mirrors web. Requires the diary to be unlocked AND the masterKey to be
 * present in memory (which means the user did a FRESH unlock during this
 * session — not a cold-start with cached subkey, since the master key is
 * RAM-only on mobile).
 *
 * The screen gates on those preconditions; if not met, it instructs the
 * user to go to Diario, lock, and unlock again. Slightly annoying UX cost
 * for a rare op (password change), in exchange for not having to store
 * the master key on disk.
 */
export default function SecurityScreen() {
  const { user } = useAuth();
  const {
    masterKey,
    key: oldDiaryKey,
    isLegacyAccount,
    adoptMasterKey,
  } = useDiaryKey();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [phase, setPhase] = useState<
    "idle" | "deriving" | "fetching" | "reencrypting" | "submitting" | "done"
  >("idle");
  const [error, setError] = useState<string | null>(null);
  const [rekeyedCount, setRekeyedCount] = useState<number | null>(null);

  const unlocked = masterKey !== null && oldDiaryKey !== null;

  async function handleSubmit() {
    setError(null);
    if (isLegacyAccount) {
      setError("Tu cuenta no tiene cifrado E2E activado.");
      return;
    }
    if (!unlocked) {
      setError(
        "Primero ve a Diario, bloquea y vuelve a desbloquear con tu contraseña actual. Luego regresa aquí.",
      );
      return;
    }
    if (!currentPassword) {
      setError("Ingresa tu contraseña actual.");
      return;
    }
    if (newPassword.length < 10) {
      setError("La nueva contraseña debe tener al menos 10 caracteres.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("La confirmación no coincide con la nueva contraseña.");
      return;
    }

    try {
      // ── Step 1: derive the new master + diary keys ────────────────────────
      setPhase("deriving");
      // We use the same secure RNG path as @psico/crypto — webcrypto's
      // getRandomValues works on RN/Hermes 0.74+ and ducks the need for
      // global typing here.
      const newSaltBytes = randomBytes(16);
      const newSaltB64 = bytesToBase64Url(newSaltBytes);
      const newMasterKey = await deriveMasterKey(newPassword, newSaltB64);
      const newDiaryKey = deriveSubKey(newMasterKey, DIARY_KEY_INFO);

      // ── Step 2: fetch every entry's raw cipher payload ────────────────────
      setPhase("fetching");
      const ciphers = await diarioApi.listRawCiphers();

      // ── Step 3: decrypt with old key, re-encrypt with new key ─────────────
      setPhase("reencrypting");
      const reencryptedEntries = ciphers.entries.map(
        (entry: DiaryRawCipherEntry) => {
          const bodyPlain = decryptString(
            { ciphertext: entry.textCiphertext, nonce: entry.textNonce },
            oldDiaryKey,
          );
          const bodyNew = encryptString(bodyPlain, newDiaryKey);
          let excerptOut:
            | { excerptCiphertext: string; excerptNonce: string }
            | undefined;
          if (entry.excerptCiphertext && entry.excerptNonce) {
            const excerptPlain = decryptString(
              {
                ciphertext: entry.excerptCiphertext,
                nonce: entry.excerptNonce,
              },
              oldDiaryKey,
            );
            const excerptNew = encryptString(excerptPlain, newDiaryKey);
            excerptOut = {
              excerptCiphertext: excerptNew.ciphertext,
              excerptNonce: excerptNew.nonce,
            };
          }
          return {
            id: entry.id,
            textCiphertext: bodyNew.ciphertext,
            textNonce: bodyNew.nonce,
            ...(excerptOut ?? {}),
          };
        },
      );

      // ── Step 4: POST the atomic password rotation ─────────────────────────
      setPhase("submitting");
      const payload: PasswordChangeWithRekeyRequest = {
        currentPassword,
        newPassword,
        newCryptoSalt: newSaltB64,
        reencryptedEntries,
      };
      const result = await apiClient.post<PasswordChangeWithRekeyResponse>(
        "/user/password-change-with-rekey",
        payload,
      );

      // ── Step 5: adopt the new master key locally ──────────────────────────
      await adoptMasterKey(newMasterKey);
      newMasterKey.fill(0);

      setRekeyedCount(result.rekeyed);
      setPhase("done");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setPhase("idle");
      const msg =
        err instanceof Error
          ? err.message
          : "No pudimos completar el cambio. Reintenta.";
      // Map the most common server error to user-friendly Spanish.
      if (/INVALID_CREDENTIALS|401/i.test(msg)) {
        setError("Tu contraseña actual no es correcta.");
      } else {
        setError(msg);
      }
    }
  }

  const busy = phase !== "idle" && phase !== "done";

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.scroll}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <Text style={styles.eyebrow}>Tu cuenta protegida</Text>
        <Text style={styles.title}>Seguridad</Text>
        <Text style={styles.subtitle}>
          Cambia tu contraseña, gestiona tu frase de respaldo y vuelve a ver el
          tour cuando lo necesites.
        </Text>
      </View>

      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.icon}>
            <Ionicons
              name="lock-closed"
              size={18}
              color={Colors.lavender[700]}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>Cambiar contraseña</Text>
            <Text style={styles.cardSubtitle}>
              Tu diario se re-cifra automáticamente en este dispositivo. El
              servidor nunca ve tu texto plano.
            </Text>
          </View>
        </View>

        {isLegacyAccount ? (
          <View style={styles.notice}>
            <Text style={styles.noticeText}>
              Tu cuenta no tiene cifrado E2E activado. Contacta soporte para
              activarlo antes de cambiar tu contraseña.
            </Text>
          </View>
        ) : !unlocked ? (
          <View style={styles.notice}>
            <Text style={styles.noticeText}>
              Para cambiar tu contraseña, primero ve a{" "}
              <Text style={{ fontWeight: "700" }}>Diario</Text>, bloquea y
              vuelve a desbloquear con tu contraseña actual. Luego regresa aquí.
            </Text>
          </View>
        ) : (
          <View style={{ marginTop: Spacing.md, gap: Spacing.md }}>
            <Field
              label="Contraseña actual"
              value={currentPassword}
              onChange={setCurrentPassword}
              disabled={busy}
            />
            <Field
              label="Nueva contraseña (mínimo 10 caracteres)"
              value={newPassword}
              onChange={setNewPassword}
              disabled={busy}
            />
            <Field
              label="Confirma la nueva contraseña"
              value={confirmPassword}
              onChange={setConfirmPassword}
              disabled={busy}
            />

            {error ? (
              <Text style={styles.error} accessibilityRole="alert">
                {error}
              </Text>
            ) : null}

            {phase !== "idle" ? (
              <Text style={styles.statusText}>
                {phase === "deriving"
                  ? "Derivando nueva clave (~1 segundo)…"
                  : phase === "fetching"
                    ? "Descargando entradas cifradas…"
                    : phase === "reencrypting"
                      ? "Re-cifrando entradas con la nueva clave…"
                      : phase === "submitting"
                        ? "Guardando atómicamente…"
                        : phase === "done"
                          ? `Listo · ${rekeyedCount} entrada${rekeyedCount === 1 ? "" : "s"} re-cifrada${rekeyedCount === 1 ? "" : "s"}.`
                          : ""}
              </Text>
            ) : null}

            <Pressable
              style={[styles.primaryButton, busy && { opacity: 0.5 }]}
              onPress={() => void handleSubmit()}
              disabled={busy}
            >
              <Text style={styles.primaryButtonText}>
                {busy ? "Procesando…" : "Cambiar contraseña"}
              </Text>
            </Pressable>

            <Text style={styles.helper}>
              ⓘ El servidor cierra todas tus otras sesiones después del cambio.
            </Text>
          </View>
        )}
      </View>

      <DiaryLockCard />

      <LocalTextAnalysisCard />

      <ShowSeedPhraseCard cryptoSalt={user?.cryptoSalt ?? null} />
    </ScrollView>
  );
}

function Field({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
}) {
  return (
    <View>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChange}
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
        textContentType="password"
        editable={!disabled}
      />
    </View>
  );
}

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
  header: {
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
  cardTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: Colors.warm[900],
  },
  cardSubtitle: {
    marginTop: 4,
    fontSize: 12,
    color: Colors.warm[500],
    lineHeight: 17,
  },
  notice: {
    marginTop: Spacing.md,
    backgroundColor: Colors.warm[50],
    borderWidth: 1,
    borderColor: Colors.warm[200],
    borderRadius: Radius.md,
    padding: 12,
  },
  noticeText: {
    fontSize: 12,
    color: Colors.warm[700],
    lineHeight: 17,
  },
  label: {
    fontSize: 10.5,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
    color: Colors.warm[500],
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
  },
  statusText: {
    fontSize: 12,
    color: Colors.warm[500],
  },
  primaryButton: {
    paddingVertical: 14,
    borderRadius: Radius.md,
    backgroundColor: Colors.sage[400],
    alignItems: "center",
  },
  primaryButtonText: {
    color: Colors.white,
    fontWeight: "700",
    fontSize: 14,
  },
  helper: {
    textAlign: "center",
    fontSize: 11,
    color: Colors.warm[500],
  },
});
