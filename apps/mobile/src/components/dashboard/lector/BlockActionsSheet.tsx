import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import type { HighlightColor } from "@psico/types";
import { Colors, Radius, Spacing } from "@/theme";

/**
 * BlockActionsSheet — bottom-sheet menu shown when the user long-presses
 * a paragraph in the mobile reader (Sprint mobile-highlights v1).
 *
 * Three actions are always present: pick a highlight color (Yellow / Blue /
 * Pink), add an annotation, cancel. A fourth (destructive) "Quitar
 * resaltado" appears when the block already has at least one highlight.
 *
 * Why "block-level" highlights v1:
 *   React Native 0.76 has no first-party text-selection API. The libraries
 *   that wrap it (react-native-selectable-text) are unmaintained for the
 *   SDK 52 + new arch combo. Block-level satisfies the user need (mark
 *   passages I want to remember) and ships now. Character-level can come
 *   later with the same backend contract — startOffset/endOffset will
 *   land in (0, content.length] instead of (0, 0).
 */

export const HIGHLIGHT_COLOR_TINTS: Record<
  HighlightColor,
  { bg: string; border: string; label: string }
> = {
  YELLOW: { bg: "#FEF3C7", border: "#F59E0B", label: "Amarillo" },
  BLUE: { bg: "#DBEAFE", border: "#3B82F6", label: "Azul" },
  PINK: { bg: "#FCE7F3", border: "#EC4899", label: "Rosa" },
};

const HIGHLIGHT_COLORS: HighlightColor[] = ["YELLOW", "BLUE", "PINK"];

export function highlightStyleFor(color: HighlightColor) {
  const tint = HIGHLIGHT_COLOR_TINTS[color];
  return {
    backgroundColor: tint.bg,
    borderLeftWidth: 4,
    borderLeftColor: tint.border,
    paddingLeft: Spacing.md,
  };
}

export function BlockActionsSheet({
  hasHighlight,
  onPickColor,
  onAddNote,
  onAskEco,
  onRemoveHighlights,
  onCancel,
}: {
  hasHighlight: boolean;
  onPickColor: (color: HighlightColor) => void;
  onAddNote: () => void;
  /** Sprint B — take this paragraph to Eco to explore it. */
  onAskEco: () => void;
  onRemoveHighlights: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable
        onPress={onCancel}
        style={styles.modalBackdrop}
        accessibilityLabel="Cerrar menú"
      >
        <Pressable style={styles.modalSheet} onPress={() => undefined}>
          <Text style={styles.modalTitle}>Acciones del párrafo</Text>

          <View style={styles.swatchRow}>
            {HIGHLIGHT_COLORS.map((color) => {
              const tint = HIGHLIGHT_COLOR_TINTS[color];
              return (
                <Pressable
                  key={color}
                  onPress={() => onPickColor(color)}
                  accessibilityLabel={`Resaltar ${tint.label.toLowerCase()}`}
                  accessibilityRole="button"
                  style={({ pressed }) => [
                    styles.swatch,
                    { backgroundColor: tint.bg, borderColor: tint.border },
                    pressed && { opacity: 0.6 },
                  ]}
                >
                  <Text style={styles.swatchLabel}>{tint.label}</Text>
                </Pressable>
              );
            })}
          </View>

          <Pressable
            onPress={onAddNote}
            style={styles.actionRow}
            accessibilityRole="button"
          >
            <Text style={styles.actionRowText}>✏️ Añadir nota</Text>
          </Pressable>

          <Pressable
            onPress={onAskEco}
            style={styles.actionRow}
            accessibilityRole="button"
          >
            <Text style={styles.actionRowText}>🌿 Conversar con Eco</Text>
          </Pressable>

          {hasHighlight && (
            <Pressable
              onPress={onRemoveHighlights}
              style={[styles.actionRow, styles.destructiveRow]}
              accessibilityRole="button"
            >
              <Text style={[styles.actionRowText, styles.destructiveText]}>
                🗑️ Quitar resaltado
              </Text>
            </Pressable>
          )}

          <Pressable
            onPress={onCancel}
            style={[styles.actionRow, styles.cancelRow]}
            accessibilityRole="button"
          >
            <Text style={styles.actionRowText}>Cancelar</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: "white",
    padding: Spacing.lg,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: "700",
    marginBottom: Spacing.md,
    color: Colors.warm[900],
  },
  swatchRow: { flexDirection: "row", gap: 12, marginBottom: Spacing.md },
  swatch: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: Radius.md,
    borderWidth: 2,
    alignItems: "center",
  },
  swatchLabel: { fontSize: 13, fontWeight: "600", color: Colors.warm[900] },
  actionRow: {
    paddingVertical: 14,
    paddingHorizontal: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.warm[100],
  },
  actionRowText: { fontSize: 15, color: Colors.warm[900], fontWeight: "500" },
  destructiveRow: {},
  destructiveText: { color: "#B91C1C" },
  cancelRow: { marginTop: 4 },
});
