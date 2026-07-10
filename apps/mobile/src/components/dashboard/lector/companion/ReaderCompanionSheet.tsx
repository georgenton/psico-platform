import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { AnnotationSummary } from "@psico/types";
import { passageToEcoPrompt } from "@/lib/eco/reader-handoff";
import { Colors, Radius, Spacing } from "@/theme";
import { EcoSheetTab } from "./EcoSheetTab";
import { NotesSheetTab } from "./NotesSheetTab";
import { ReflexionSheetTab, reflexionSeed } from "./ReflexionSheetTab";

export type SheetTab = "eco" | "notas" | "reflexion";

/**
 * ReaderCompanionSheet — the reader's companion panel (mobile).
 *
 * A bottom sheet with three tools (parity with the web companion dock):
 *   - 🌿 Eco       — chat without leaving the chapter (shared EcoChat).
 *   - ✎ Notas      — plaintext margin notes about the text.
 *   - 🪷 Reflexión — an E2E-encrypted diary entry about the reader (feeds the Mapa).
 *
 * Opened from a highlighted passage (long-press) or the header. The active tab
 * is seeded with the passage; each tab consumes it once.
 */
export function ReaderCompanionSheet({
  visible,
  tab,
  onTabChange,
  onClose,
  passage,
  ecoSeed,
  reflexionSeedOverride,
  onPassageConsumed,
  annotations,
  pendingBlockId,
  onClearPending,
  onCreateNote,
  onDeleteNote,
}: {
  visible: boolean;
  tab: SheetTab;
  onTabChange: (tab: SheetTab) => void;
  onClose: () => void;
  /** Raw highlighted passage (wrapped per-tab), or null. */
  passage: string | null;
  /** A ready-made Eco prompt (e.g. a chapter topic) that overrides `passage`. */
  ecoSeed?: string | null;
  /** A ready-made Reflexión seed (e.g. a chapter exercise) overriding `passage`. */
  reflexionSeedOverride?: string | null;
  onPassageConsumed: () => void;
  annotations: AnnotationSummary[];
  pendingBlockId: string | null;
  onClearPending: () => void;
  onCreateNote: (blockId: string, text: string) => Promise<void>;
  onDeleteNote: (id: string) => void;
}) {
  const TABS: Array<{ id: SheetTab; label: string }> = [
    { id: "eco", label: "🌿 Eco" },
    { id: "notas", label: "✎ Notas" },
    { id: "reflexion", label: "🪷 Reflexión" },
  ];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <Pressable style={styles.backdropTap} onPress={onClose} />
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.sheet}
        >
          <View style={styles.grabberWrap}>
            <View style={styles.grabber} />
          </View>

          <View style={styles.header}>
            <View style={styles.tabBar}>
              {TABS.map((t) => {
                const active = t.id === tab;
                return (
                  <Pressable
                    key={t.id}
                    onPress={() => onTabChange(t.id)}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: active }}
                    style={[styles.tab, active && styles.tabActive]}
                  >
                    <Text
                      style={[styles.tabText, active && styles.tabTextActive]}
                    >
                      {t.label}
                      {t.id === "notas" && annotations.length > 0
                        ? ` ${annotations.length}`
                        : ""}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Pressable
              onPress={onClose}
              hitSlop={8}
              accessibilityLabel="Cerrar"
            >
              <Ionicons name="close" size={22} color={Colors.warm[600]} />
            </Pressable>
          </View>

          <View style={styles.content}>
            {tab === "eco" ? (
              <EcoSheetTab
                passagePrompt={
                  ecoSeed ?? (passage ? passageToEcoPrompt(passage) : null)
                }
                onSeedConsumed={onPassageConsumed}
              />
            ) : tab === "reflexion" ? (
              <ReflexionSheetTab
                seed={
                  reflexionSeedOverride ??
                  (passage ? reflexionSeed(passage) : null)
                }
                onSeedConsumed={onPassageConsumed}
              />
            ) : (
              <NotesSheetTab
                annotations={annotations}
                pendingBlockId={pendingBlockId}
                onClearPending={onClearPending}
                onCreate={onCreateNote}
                onDelete={onDeleteNote}
              />
            )}
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  backdropTap: { flex: 1 },
  sheet: {
    height: "92%",
    backgroundColor: Colors.warm[50],
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    overflow: "hidden",
  },
  grabberWrap: { alignItems: "center", paddingTop: 8, paddingBottom: 2 },
  grabber: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.warm[200],
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.warm[100],
  },
  tabBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Colors.warm[100],
    borderRadius: 999,
    padding: 3,
    flex: 1,
  },
  tab: {
    flex: 1,
    borderRadius: 999,
    paddingVertical: 6,
    alignItems: "center",
  },
  tabActive: { backgroundColor: "white" },
  tabText: { fontSize: 11.5, fontWeight: "600", color: Colors.warm[600] },
  tabTextActive: { color: Colors.warm[900] },
  content: { flex: 1 },
});
