import {
  Linking,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Colors, Radius, Spacing } from "@/theme";

/**
 * CrisisModal (mobile) — Sprint front-eco.
 *
 * Mirrors the web modal. The hotline button dials via `tel:` deeplink; the
 * canned text comes verbatim from the server's `crisis` SSE event (no
 * client-side rewriting — preserves the audit trail).
 */
export function CrisisModal({
  text,
  hotline,
  onClose,
}: {
  text: string;
  hotline: string;
  /** Server-supplied path within the app for the crisis page (v2). */
  crisisPath: string;
  onClose: () => void;
}) {
  return (
    <Modal
      visible
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.headerBg}>
            <View style={styles.iconCircle}>
              <Text style={styles.icon}>💛</Text>
            </View>
            <Text style={styles.title}>Estamos contigo</Text>
          </View>
          <View style={styles.body}>
            <Text style={styles.bodyText}>{text}</Text>
            <Pressable
              style={styles.callBtn}
              onPress={() => {
                const digits = hotline.replace(/\s|\(.+?\)/g, "");
                void Linking.openURL(`tel:${digits}`);
              }}
            >
              <Text style={styles.callBtnText}>📞 Llamar · {hotline}</Text>
            </Pressable>
            <Pressable style={styles.ackBtn} onPress={onClose}>
              <Text style={styles.ackBtnText}>Entendido</Text>
            </Pressable>
            <Text style={styles.foot}>
              Si no estás en Ecuador, busca tu línea local en{" "}
              <Text
                onPress={() =>
                  void Linking.openURL("https://findahelpline.com")
                }
                style={styles.link}
              >
                findahelpline.com
              </Text>
              .
            </Text>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    paddingHorizontal: Spacing.md,
  },
  card: {
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    borderWidth: 1.5,
    borderColor: "#FCA5A5",
    overflow: "hidden",
  },
  headerBg: {
    backgroundColor: "#FEE2E2",
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.sm + 2,
    alignItems: "center",
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.white,
    alignItems: "center",
    justifyContent: "center",
  },
  icon: {
    fontSize: 22,
  },
  title: {
    marginTop: Spacing.sm,
    fontSize: 18,
    fontWeight: "700",
    color: "#7F1D1D",
  },
  body: {
    padding: Spacing.lg,
  },
  bodyText: {
    fontSize: 14,
    color: Colors.warm[800],
    lineHeight: 20,
  },
  callBtn: {
    marginTop: Spacing.lg,
    paddingVertical: 14,
    borderRadius: Radius.md,
    backgroundColor: "#B91C1C",
    alignItems: "center",
  },
  callBtnText: {
    color: Colors.white,
    fontWeight: "700",
    fontSize: 14,
  },
  ackBtn: {
    marginTop: Spacing.sm,
    paddingVertical: 12,
    borderRadius: Radius.md,
    backgroundColor: Colors.warm[100],
    alignItems: "center",
  },
  ackBtnText: {
    color: Colors.warm[700],
    fontWeight: "700",
    fontSize: 14,
  },
  foot: {
    marginTop: Spacing.md,
    fontSize: 11,
    color: Colors.warm[500],
    textAlign: "center",
  },
  link: {
    textDecorationLine: "underline",
    color: Colors.lavender[600],
  },
});
