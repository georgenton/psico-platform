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
import { ApiError, usersApi } from "@psico/api-client";
import {
  ACCOUNT_DELETION_CANCELLED_NOTE,
  ACCOUNT_DELETION_CANCEL_PROMPT,
  DATA_EXPORT_SUMMARY,
  accountDeletionDateLabel,
  accountDeletionNotice,
  cancelAccountDeletionErrorCopy,
} from "@psico/types";
import type { UserMeResponse } from "@psico/types";
import { Colors, Radius, Spacing } from "@/theme";

export function DangerZone({
  me,
  onChanged,
}: {
  me: UserMeResponse;
  onChanged?: () => void;
}) {
  const [deleteOpen, setDeleteOpen] = useState(false);
  // The request this screen has already seen cancelled. `me` is reloaded after
  // it, but a reload that fails must not leave «Borrado programado» on screen
  // for something the server confirmed is gone. Named by the request, so asking
  // again later is scheduled like any other.
  const [undone, setUndone] = useState<string | null>(null);

  const alreadyExported = me.privacy.dataExportRequested;
  const alreadyScheduled = me.privacy.accountDeleteRequested;
  const requestKey = alreadyScheduled ? String(alreadyScheduled) : null;

  async function requestExport() {
    if (alreadyExported) {
      Alert.alert(
        "Ya solicitaste un export",
        "Solo puedes pedir una exportación cada 30 días.",
      );
      return;
    }
    try {
      const res = await usersApi.requestDataExport();
      const eta = new Date(res.expectedAt);
      Alert.alert(
        "Export en camino",
        `Te enviaremos un email cuando esté listo (≈${eta.toLocaleString("es-419")}).`,
      );
      onChanged?.();
    } catch {
      Alert.alert(
        "No pudimos procesar el pedido",
        "Reintenta en unos minutos.",
      );
    }
  }

  if (requestKey && requestKey !== undone) {
    return (
      <ScheduledDeletion
        notice={accountDeletionNotice(
          // The day the SERVER says it happens. Absent on a server that
          // predates the field, and then no day is printed: the request's own
          // date is not a stand-in for it.
          me.privacy.accountDeleteScheduledFor,
          me.user.timezone,
        )}
        onCancelled={() => {
          setUndone(requestKey);
          onChanged?.();
        }}
      />
    );
  }

  return (
    <View style={styles.wrap} testID="danger-zone">
      <Text style={styles.title}>Zona sensible</Text>

      {/* Export */}
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text style={styles.rowLabel}>Exportar mis datos</Text>
          <Text style={styles.rowHint}>
            {DATA_EXPORT_SUMMARY} Solo 1 vez cada 30 días.
          </Text>
        </View>
        <Pressable
          onPress={requestExport}
          style={styles.btnOutline}
          testID="export-btn"
        >
          <Text style={styles.btnOutlineText}>
            {alreadyExported ? "Ya pedido" : "Solicitar"}
          </Text>
        </Pressable>
      </View>

      {/* Delete */}
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.rowLabel, { color: Colors.error }]}>
            Eliminar mi cuenta
          </Text>
          <Text style={styles.rowHint}>
            Cooldown de 30 días. Tu Diario se pierde sin la frase de respaldo.
          </Text>
        </View>
        <Pressable
          onPress={() => setDeleteOpen(true)}
          style={styles.btnDanger}
          testID="delete-toggle"
        >
          <Text style={styles.btnDangerText}>Eliminar</Text>
        </Pressable>
      </View>

      <DeleteAccountModal
        timezone={me.user.timezone}
        visible={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onScheduled={() => {
          setDeleteOpen(false);
          onChanged?.();
        }}
      />
    </View>
  );
}

/** «Borrado programado»: the day it happens, and the way out until then. */
function ScheduledDeletion({
  notice,
  onCancelled,
}: {
  notice: string;
  onCancelled: () => void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function cancel() {
    setPending(true);
    setError(null);
    try {
      await usersApi.cancelAccountDeletion();
    } catch (err) {
      setPending(false);
      setError(
        cancelAccountDeletionErrorCopy(
          err instanceof ApiError ? err.statusCode : null,
        ),
      );
      return;
    }
    Alert.alert("Eliminación cancelada", ACCOUNT_DELETION_CANCELLED_NOTE);
    onCancelled();
  }

  function confirm() {
    Alert.alert("¿Conservar tu cuenta?", ACCOUNT_DELETION_CANCEL_PROMPT, [
      { text: "Volver", style: "cancel" },
      { text: "Sí, conservarla", onPress: () => void cancel() },
    ]);
  }

  return (
    <View style={[styles.row, styles.scheduledRow]} testID="delete-scheduled">
      <View>
        <Text style={styles.scheduledTitle}>Borrado programado</Text>
        <Text style={styles.scheduledHint}>{notice}</Text>
      </View>
      {error ? (
        <Text
          style={styles.scheduledHint}
          accessibilityRole="alert"
          testID="delete-cancel-error"
        >
          {error}
        </Text>
      ) : null}
      <Pressable
        onPress={confirm}
        disabled={pending}
        style={[styles.btnDanger, pending && { opacity: 0.5 }]}
        testID="delete-cancel"
      >
        <Text style={styles.btnDangerText}>
          {pending ? "Cancelando..." : "Cancelar la eliminación"}
        </Text>
      </Pressable>
    </View>
  );
}

function DeleteAccountModal({
  timezone,
  visible,
  onClose,
  onScheduled,
}: {
  timezone: string | null;
  visible: boolean;
  onClose: () => void;
  onScheduled: () => void;
}) {
  const [password, setPassword] = useState("");
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!password) {
      setError("Necesitamos tu contraseña.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const res = await usersApi.requestAccountDeletion({
        password,
        reason: reason || undefined,
      });
      Alert.alert(
        "Borrado programado",
        `Tu cuenta se eliminará el ${accountDeletionDateLabel(res.deleteAt, timezone)}.`,
      );
      onScheduled();
    } catch {
      setError("Contraseña incorrecta o pedido en curso.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={onClose}
    >
      <View style={modalStyles.container}>
        <View style={modalStyles.header}>
          <Pressable onPress={onClose} hitSlop={12}>
            <Text style={modalStyles.cancel}>Cancelar</Text>
          </Pressable>
          <Text style={modalStyles.title}>Eliminar cuenta</Text>
          <View style={{ width: 60 }} />
        </View>
        <View style={modalStyles.body}>
          <Text style={modalStyles.label}>Contraseña actual</Text>
          <TextInput
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            editable={!pending}
            style={modalStyles.input}
            testID="delete-password"
          />
          <Text style={modalStyles.label}>Razón (opcional)</Text>
          <TextInput
            value={reason}
            onChangeText={setReason}
            multiline
            numberOfLines={3}
            maxLength={500}
            editable={!pending}
            style={[modalStyles.input, { minHeight: 80 }]}
          />
          {error ? <Text style={modalStyles.error}>{error}</Text> : null}
          <Pressable
            onPress={submit}
            disabled={pending}
            style={[modalStyles.confirmBtn, pending && { opacity: 0.5 }]}
            testID="delete-confirm"
          >
            <Text style={modalStyles.confirmText}>
              {pending ? "Procesando..." : "Confirmar borrado"}
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
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
  scheduledRow: {
    flexDirection: "column",
    alignItems: "flex-start",
    backgroundColor: "#fef2f2",
    borderColor: "#fecaca",
  },
  rowLabel: { fontSize: 13, fontWeight: "600", color: Colors.warm[900] },
  rowHint: { fontSize: 11, color: Colors.warm[500], marginTop: 2 },
  scheduledTitle: { fontSize: 14, fontWeight: "700", color: Colors.error },
  scheduledHint: { fontSize: 12, color: Colors.error, marginTop: 4 },
  btnOutline: {
    borderWidth: 1.5,
    borderColor: Colors.warm[300],
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
  },
  btnOutlineText: { fontSize: 12, fontWeight: "600", color: Colors.warm[700] },
  btnDanger: {
    borderWidth: 1.5,
    borderColor: "#fecaca",
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
  },
  btnDangerText: { fontSize: 12, fontWeight: "600", color: Colors.error },
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
    marginBottom: Spacing.sm,
  },
  error: { fontSize: 12, color: Colors.error, marginTop: -4 },
  confirmBtn: {
    backgroundColor: Colors.error,
    borderRadius: Radius.md,
    paddingVertical: 12,
    alignItems: "center",
    marginTop: Spacing.sm,
  },
  confirmText: { color: "#fff", fontSize: 13, fontWeight: "600" },
});
