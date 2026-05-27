import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ApiError, subscriptionApi } from "@psico/api-client";
import type { Subscription } from "@psico/types";
import { Colors, Radius, Spacing } from "@/theme";

/**
 * SubscriptionActions (mobile) — Sprint front-fase1.
 *
 * Active subscribers see a card with three controls:
 *   - "Gestionar suscripción" → opens Stripe Customer Portal in browser.
 *   - "Cancelar" → modal with optional reason → POST /cancel.
 *   - When `cancelAtPeriodEnd=true`, the cancel button is replaced with
 *     a "Reactivar" CTA.
 *
 * `onChanged` is a callback the parent uses to re-fetch /usage and
 * /subscriptions/me after a successful action — no router.refresh()
 * equivalent in RN.
 */
export function SubscriptionActions({
  subscription,
  onChanged,
}: {
  subscription: Subscription;
  onChanged: () => void;
}) {
  const [portalLoading, setPortalLoading] = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [reactivateLoading, setReactivateLoading] = useState(false);
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [reason, setReason] = useState("");

  async function handlePortal() {
    setPortalLoading(true);
    try {
      const session = await subscriptionApi.createPortalSession(
        "https://psico.app/account",
      );
      const { Linking } = await import("react-native");
      await Linking.openURL(session.url);
    } catch (err) {
      Alert.alert(
        "Error",
        err instanceof ApiError
          ? err.message
          : "No pudimos abrir el portal de pagos.",
      );
    } finally {
      setPortalLoading(false);
    }
  }

  async function handleCancel() {
    setCancelLoading(true);
    try {
      await subscriptionApi.cancel(
        reason.trim() ? { reason: reason.trim() } : {},
      );
      setCancelModalOpen(false);
      setReason("");
      onChanged();
    } catch (err) {
      Alert.alert(
        "Error",
        err instanceof ApiError
          ? err.message
          : "No pudimos cancelar tu suscripción.",
      );
    } finally {
      setCancelLoading(false);
    }
  }

  async function handleReactivate() {
    setReactivateLoading(true);
    try {
      await subscriptionApi.reactivate();
      onChanged();
    } catch (err) {
      Alert.alert(
        "Error",
        err instanceof ApiError
          ? err.message
          : "No pudimos reactivar tu suscripción.",
      );
    } finally {
      setReactivateLoading(false);
    }
  }

  const isCancelling = subscription.cancelAtPeriodEnd;

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <View style={styles.badge}>
            <Ionicons
              name="checkmark-circle"
              size={14}
              color={Colors.sage[600]}
            />
            <Text style={styles.badgeText}>
              Plan {subscription.plan} activo
            </Text>
          </View>
          <Text style={styles.dateLabel}>
            {isCancelling ? "Termina el" : "Próxima renovación"}
          </Text>
          <Text style={styles.date}>
            {formatDate(subscription.currentPeriodEnd)}
          </Text>
        </View>
      </View>

      {isCancelling ? (
        <View style={styles.cancellingBanner}>
          <Text style={styles.cancellingText}>
            Tu suscripción no se renovará automáticamente.
          </Text>
        </View>
      ) : null}

      <View style={styles.actions}>
        <Pressable
          style={[styles.btnPrimary, portalLoading && styles.btnDisabled]}
          onPress={handlePortal}
          disabled={portalLoading}
        >
          {portalLoading ? (
            <ActivityIndicator size="small" color={Colors.lavender[700]} />
          ) : (
            <>
              <Ionicons
                name="card-outline"
                size={16}
                color={Colors.lavender[700]}
              />
              <Text style={styles.btnPrimaryText}>Gestionar</Text>
            </>
          )}
        </Pressable>

        {isCancelling ? (
          <Pressable
            style={[styles.btnSage, reactivateLoading && styles.btnDisabled]}
            onPress={handleReactivate}
            disabled={reactivateLoading}
          >
            {reactivateLoading ? (
              <ActivityIndicator size="small" color={Colors.white} />
            ) : (
              <Text style={styles.btnSageText}>Reactivar</Text>
            )}
          </Pressable>
        ) : (
          <Pressable
            style={styles.btnGhost}
            onPress={() => setCancelModalOpen(true)}
          >
            <Text style={styles.btnGhostText}>Cancelar suscripción</Text>
          </Pressable>
        )}
      </View>

      <Modal
        visible={cancelModalOpen}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setCancelModalOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>¿Cancelar tu suscripción?</Text>
            <Text style={styles.modalBody}>
              Tu plan Pro se mantendrá activo hasta el fin del período actual.
              Después tu cuenta volverá al plan gratuito. Puedes reactivar en
              cualquier momento antes de esa fecha.
            </Text>
            <Text style={styles.label}>
              ¿Algo que podamos mejorar? (opcional)
            </Text>
            <TextInput
              value={reason}
              onChangeText={setReason}
              multiline
              maxLength={480}
              numberOfLines={3}
              placeholder="Tu respuesta nos ayuda a hacer el producto mejor."
              placeholderTextColor={Colors.warm[400]}
              style={styles.textarea}
            />
            <View style={styles.modalActions}>
              <Pressable
                onPress={() => {
                  setCancelModalOpen(false);
                  setReason("");
                }}
                disabled={cancelLoading}
              >
                <Text style={styles.modalLink}>Atrás</Text>
              </Pressable>
              <Pressable
                onPress={handleCancel}
                disabled={cancelLoading}
                style={[styles.btnDanger, cancelLoading && styles.btnDisabled]}
              >
                {cancelLoading ? (
                  <ActivityIndicator size="small" color={Colors.white} />
                ) : (
                  <Text style={styles.btnDangerText}>
                    Confirmar cancelación
                  </Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString("es-EC", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    borderWidth: 1.5,
    borderColor: Colors.warm[200],
    padding: Spacing.lg,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-start",
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: Colors.sage[100],
    marginBottom: Spacing.sm,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: Colors.sage[600],
  },
  dateLabel: {
    fontSize: 12,
    color: Colors.warm[500],
  },
  date: {
    fontSize: 15,
    fontWeight: "700",
    color: Colors.warm[800],
    marginTop: 2,
  },
  cancellingBanner: {
    marginTop: Spacing.md,
    backgroundColor: "#FEF9E7",
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: "#FDE68A",
    padding: 10,
  },
  cancellingText: {
    fontSize: 12,
    color: "#B45309",
    lineHeight: 17,
  },
  actions: {
    marginTop: Spacing.md,
    gap: Spacing.sm,
  },
  btnPrimary: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.md,
    backgroundColor: Colors.lavender[100],
  },
  btnPrimaryText: {
    fontSize: 14,
    fontWeight: "700",
    color: Colors.lavender[700],
  },
  btnGhost: {
    paddingVertical: 6,
    alignItems: "center",
  },
  btnGhostText: {
    fontSize: 13,
    fontWeight: "500",
    color: Colors.warm[500],
    textDecorationLine: "underline",
  },
  btnSage: {
    paddingVertical: 12,
    borderRadius: Radius.md,
    backgroundColor: Colors.sage[400],
    alignItems: "center",
  },
  btnSageText: {
    fontSize: 14,
    fontWeight: "700",
    color: Colors.white,
  },
  btnDanger: {
    paddingVertical: 10,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.md,
    backgroundColor: "#B91C1C",
  },
  btnDangerText: {
    fontSize: 14,
    fontWeight: "700",
    color: Colors.white,
  },
  btnDisabled: {
    opacity: 0.5,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    paddingHorizontal: Spacing.md,
  },
  modalCard: {
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    borderWidth: 1.5,
    borderColor: Colors.warm[200],
    padding: Spacing.lg,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: Colors.warm[900],
  },
  modalBody: {
    marginTop: 6,
    fontSize: 13,
    color: Colors.warm[600],
    lineHeight: 19,
  },
  label: {
    marginTop: Spacing.md,
    fontSize: 10.5,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
    color: Colors.warm[500],
    marginBottom: 6,
  },
  textarea: {
    backgroundColor: Colors.warm[50],
    borderRadius: Radius.md,
    borderWidth: 1.5,
    borderColor: Colors.warm[200],
    paddingHorizontal: Spacing.sm + 2,
    paddingVertical: 10,
    fontSize: 13,
    color: Colors.warm[800],
    minHeight: 72,
    textAlignVertical: "top",
  },
  modalActions: {
    marginTop: Spacing.md,
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: Spacing.md,
  },
  modalLink: {
    fontSize: 14,
    color: Colors.warm[600],
    fontWeight: "500",
  },
});
