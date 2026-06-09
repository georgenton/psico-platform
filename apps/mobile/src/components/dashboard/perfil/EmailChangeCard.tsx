import { useState } from "react";
import {
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { usersApi } from "@psico/api-client";
import type { UserMeResponse } from "@psico/types";
import { Colors, Radius, Spacing } from "@/theme";

export function EmailChangeCard({ me }: { me: UserMeResponse }) {
  const [open, setOpen] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  async function submit() {
    const trimmed = newEmail.trim().toLowerCase();
    if (!trimmed || trimmed === me.user.email.toLowerCase()) {
      setError("Tiene que ser un email distinto al actual.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const res = await usersApi.requestEmailChange({ newEmail: trimmed });
      setSentTo(res.verificationSentTo);
      setOpen(false);
      setNewEmail("");
      Alert.alert(
        "Verificación enviada",
        `Te enviamos un enlace de confirmación a ${res.verificationSentTo}.`,
      );
    } catch {
      setError("No pudimos enviar la verificación. Reintenta.");
    } finally {
      setPending(false);
    }
  }

  return (
    <View style={styles.wrap} testID="email-change-card">
      <Text style={styles.title}>Email de la cuenta</Text>
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text style={styles.rowLabel}>{me.user.email}</Text>
          {sentTo ? (
            <Text style={styles.successText}>
              Te enviamos un enlace de confirmación a {sentTo}.
            </Text>
          ) : (
            <Text style={styles.rowHint}>
              Cambiarlo dispara una verificación al email nuevo.
            </Text>
          )}
        </View>
        {!sentTo ? (
          <Pressable
            onPress={() => setOpen(true)}
            style={styles.btnOutline}
            testID="email-change-toggle"
          >
            <Text style={styles.btnOutlineText}>Cambiar</Text>
          </Pressable>
        ) : null}
      </View>

      <Modal
        visible={open}
        animationType="slide"
        transparent={false}
        onRequestClose={() => setOpen(false)}
      >
        <View style={modalStyles.container}>
          <View style={modalStyles.header}>
            <Pressable onPress={() => setOpen(false)} hitSlop={12}>
              <Text style={modalStyles.cancel}>Cancelar</Text>
            </Pressable>
            <Text style={modalStyles.title}>Cambiar email</Text>
            <View style={{ width: 60 }} />
          </View>
          <View style={modalStyles.body}>
            <Text style={modalStyles.label}>Nuevo email</Text>
            <TextInput
              value={newEmail}
              onChangeText={setNewEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              editable={!pending}
              placeholder="tu-nuevo@email.com"
              placeholderTextColor={Colors.warm[400]}
              style={modalStyles.input}
              testID="email-change-input"
            />
            {error ? <Text style={modalStyles.error}>{error}</Text> : null}
            <Pressable
              onPress={submit}
              disabled={pending}
              style={[modalStyles.submit, pending && { opacity: 0.5 }]}
              testID="email-change-submit"
            >
              <Text style={modalStyles.submitText}>
                {pending ? "Enviando..." : "Enviar verificación"}
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.sm },
  title: {
    fontSize: 13,
    fontWeight: "700",
    color: Colors.warm[500],
    textTransform: "uppercase",
    letterSpacing: 0.5,
    paddingHorizontal: Spacing.xs,
  },
  row: {
    backgroundColor: "#fff",
    borderRadius: Radius.lg,
    borderWidth: 1.5,
    borderColor: Colors.warm[200],
    padding: Spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  rowLabel: { fontSize: 13, fontWeight: "600", color: Colors.warm[900] },
  rowHint: { fontSize: 11, color: Colors.warm[500], marginTop: 2 },
  successText: { fontSize: 11, color: Colors.sage[600], marginTop: 4 },
  btnOutline: {
    borderWidth: 1.5,
    borderColor: Colors.warm[300],
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
  },
  btnOutlineText: { fontSize: 12, fontWeight: "600", color: Colors.warm[700] },
});

const modalStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    paddingTop: Spacing.xl,
    borderBottomWidth: 1,
    borderBottomColor: Colors.warm[200],
  },
  cancel: { fontSize: 14, color: Colors.lavender[700], width: 60 },
  title: { fontSize: 14, fontWeight: "600", color: Colors.warm[900] },
  body: { padding: Spacing.md, gap: Spacing.sm },
  label: { fontSize: 11, fontWeight: "600", color: Colors.warm[700] },
  input: {
    borderWidth: 1.5,
    borderColor: Colors.warm[200],
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    fontSize: 13,
    color: Colors.warm[900],
    backgroundColor: "#fff",
  },
  error: { fontSize: 12, color: Colors.error },
  submit: {
    marginTop: Spacing.sm,
    backgroundColor: Colors.lavender[500],
    borderRadius: Radius.md,
    paddingVertical: 12,
    alignItems: "center",
  },
  submitText: { color: "#fff", fontSize: 13, fontWeight: "600" },
});
