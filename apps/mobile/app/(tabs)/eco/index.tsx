import { useCallback, useEffect, useMemo, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { ecoApi } from "@psico/api-client";
import type { EcoPersona, EcoScope, EcoThreadRailItem } from "@psico/types";
import { decryptString } from "@psico/crypto";
import { consumeEcoReaderHandoff } from "@/lib/eco/reader-handoff";
import { useDiaryKey } from "@/crypto/diary-key-context";
import { EcoChat } from "@/components/dashboard/eco/EcoChat";
import { EcoSuggestions } from "@/components/dashboard/eco/EcoSuggestions";
import { UnlockGate } from "@/components/dashboard/diario/UnlockGate";
import { Colors, Radius, Spacing } from "@/theme";

/**
 * Eco chat (mobile) — Sprint front-eco.
 *
 * Thin wrapper around the reusable `EcoChat` component (Sprint reader-companion
 * dock). This screen owns the thread rail + persona; the message list, SSE
 * send, crisis + report flows all live in EcoChat, shared with the reader
 * companion sheet.
 */
export default function EcoScreen() {
  const { ecoKey, isLegacyAccount } = useDiaryKey();

  const [persona, setPersona] = useState<EcoPersona | null>(null);
  const [rail, setRail] = useState<EcoThreadRailItem[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [railModalOpen, setRailModalOpen] = useState(false);
  const [seed, setSeed] = useState<string | null>(null);
  const [scope, setScope] = useState<EcoScope | undefined>(undefined);
  const [showSuggestions, setShowSuggestions] = useState(true);

  // ─── Boot: load persona + rail; auto-create first thread if needed ──────

  const refreshRail = useCallback(async () => {
    try {
      const res = await ecoApi.listThreads();
      setRail(res.rail);
    } catch {
      // Network blip — keep stale rail.
    }
  }, []);

  const ensureThread = useCallback(async () => {
    if (!ecoKey) return;
    try {
      const res = await ecoApi.listThreads();
      setRail(res.rail);
      if (res.rail.length === 0) {
        const created = await ecoApi.createThread();
        setActiveThreadId(created.id);
        await refreshRail();
      } else {
        setActiveThreadId((current) => current ?? res.rail[0]!.id);
      }
    } catch {
      // Stay on the empty state; user can hit "Nueva conversación".
    }
  }, [ecoKey, refreshRail]);

  useEffect(() => {
    let active = true;
    ecoApi
      .getCaps()
      .then((p) => {
        if (active) setPersona(p);
      })
      .catch(() => {
        if (active)
          setPersona({
            name: "Eco",
            voice: "Companion conversacional.",
            caps: [],
          });
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (ecoKey) void ensureThread();
  }, [ecoKey, ensureThread]);

  // ─── Reader → Eco handoff (Sprint B) ─────────────────────────────────────
  //
  // Back-compat: if anything still navigates here with a stashed prompt,
  // consume it on focus and seed the composer via EcoChat.
  useFocusEffect(
    useCallback(() => {
      const handoff = consumeEcoReaderHandoff();
      if (handoff) {
        setSeed(handoff.text);
        if (handoff.scope) setScope(handoff.scope);
        setShowSuggestions(false);
      }
    }, []),
  );

  const handleNewThread = useCallback(async () => {
    try {
      const created = await ecoApi.createThread();
      setActiveThreadId(created.id);
      await refreshRail();
      setRailModalOpen(false);
    } catch {
      // No-op; the user can retry.
    }
  }, [refreshRail]);

  // ─── Render ──────────────────────────────────────────────────────────────

  if (isLegacyAccount) {
    return (
      <Centered text="Tu cuenta no tiene cifrado E2E activado. Contacta soporte." />
    );
  }

  if (!ecoKey) {
    return (
      <KeyboardAvoidingView
        style={styles.root}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.unlockScroll}
          keyboardShouldPersistTaps="handled"
        >
          <UnlockGate context="eco" />
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 80 : 0}
    >
      <Header persona={persona} onSwitchThread={() => setRailModalOpen(true)} />

      {showSuggestions ? (
        <EcoSuggestions
          onPick={(s) => {
            setSeed(s.prompt);
            setScope(s.scope ?? undefined);
            setShowSuggestions(false);
          }}
        />
      ) : null}

      {activeThreadId ? (
        <EcoChat
          threadId={activeThreadId}
          ecoKey={ecoKey}
          personaName={persona?.name ?? "Eco"}
          seed={seed}
          scope={scope}
          onSeedConsumed={() => setSeed(null)}
          onMessageSent={() => {
            setShowSuggestions(false);
            void refreshRail();
          }}
        />
      ) : (
        <View style={styles.centered}>
          <Text style={styles.centeredText}>Abriendo tu conversación…</Text>
        </View>
      )}

      <ThreadRailModal
        visible={railModalOpen}
        rail={rail}
        activeId={activeThreadId}
        ecoKey={ecoKey}
        onSelect={(id) => {
          setActiveThreadId(id);
          setRailModalOpen(false);
        }}
        onNew={handleNewThread}
        onClose={() => setRailModalOpen(false)}
      />
    </KeyboardAvoidingView>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────

function Header({
  persona,
  onSwitchThread,
}: {
  persona: EcoPersona | null;
  onSwitchThread: () => void;
}) {
  return (
    <View style={styles.header}>
      <View style={styles.headerInfo}>
        <Text style={styles.headerIcon}>🌿</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerName}>{persona?.name ?? "Eco"}</Text>
          <Text style={styles.headerSub}>
            Companion · no reemplaza a un profesional
          </Text>
        </View>
      </View>
      <Pressable
        onPress={onSwitchThread}
        accessibilityLabel="Cambiar de hilo"
        style={styles.switchBtn}
      >
        <Ionicons name="list" size={20} color={Colors.warm[600]} />
      </Pressable>
    </View>
  );
}

function ThreadRailModal({
  visible,
  rail,
  activeId,
  ecoKey,
  onSelect,
  onNew,
  onClose,
}: {
  visible: boolean;
  rail: EcoThreadRailItem[];
  activeId: string | null;
  ecoKey: Uint8Array;
  onSelect: (id: string) => void;
  onNew: () => void;
  onClose: () => void;
}) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.railBackdrop}>
        <View style={styles.railCard}>
          <View style={styles.railHeader}>
            <Text style={styles.railTitle}>Tus hilos</Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={22} color={Colors.warm[600]} />
            </Pressable>
          </View>
          <Pressable style={styles.newBtn} onPress={onNew}>
            <Text style={styles.newBtnText}>+ Nueva conversación</Text>
          </Pressable>
          <ScrollView style={{ maxHeight: 320 }}>
            {rail.length === 0 ? (
              <Text style={styles.railEmpty}>
                Aún no tienes hilos. Crea uno para empezar.
              </Text>
            ) : (
              rail.map((item) => (
                <RailRow
                  key={item.id}
                  item={item}
                  active={item.id === activeId}
                  ecoKey={ecoKey}
                  onPress={() => onSelect(item.id)}
                />
              ))
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function RailRow({
  item,
  active,
  ecoKey,
  onPress,
}: {
  item: EcoThreadRailItem;
  active: boolean;
  ecoKey: Uint8Array;
  onPress: () => void;
}) {
  const title = useMemo(() => {
    if (!item.titleCiphertext || !item.titleNonce) {
      return `Conversación · ${new Date(item.lastMessageAt).toLocaleDateString(
        "es-EC",
        { day: "numeric", month: "short" },
      )}`;
    }
    try {
      return decryptString(
        { ciphertext: item.titleCiphertext, nonce: item.titleNonce },
        ecoKey,
      );
    } catch {
      return "🔒 Hilo cifrado";
    }
  }, [item.titleCiphertext, item.titleNonce, item.lastMessageAt, ecoKey]);

  return (
    <Pressable
      onPress={onPress}
      style={[styles.railRow, active && styles.railRowActive]}
    >
      <Text
        style={[styles.railRowTitle, active && { color: Colors.lavender[700] }]}
      >
        {title}
      </Text>
      <Text style={styles.railRowSub}>
        {item.messageCount} {item.messageCount === 1 ? "mensaje" : "mensajes"}
      </Text>
    </Pressable>
  );
}

function Centered({ text }: { text: string }) {
  return (
    <View style={styles.centered}>
      <Text style={styles.centeredText}>{text}</Text>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.warm[50] },
  unlockScroll: { flexGrow: 1, justifyContent: "center", padding: Spacing.lg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.sm,
    gap: Spacing.sm,
  },
  headerInfo: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  headerIcon: { fontSize: 22 },
  headerName: { fontSize: 18, fontWeight: "700", color: Colors.warm[900] },
  headerSub: { fontSize: 11, color: Colors.warm[500] },
  switchBtn: {
    width: 36,
    height: 36,
    borderRadius: Radius.md,
    backgroundColor: Colors.warm[100],
    alignItems: "center",
    justifyContent: "center",
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.lg,
    backgroundColor: Colors.warm[50],
  },
  centeredText: {
    fontSize: 14,
    color: Colors.warm[600],
    textAlign: "center",
    lineHeight: 20,
  },
  railBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  railCard: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: Radius.lg,
    borderTopRightRadius: Radius.lg,
    padding: Spacing.lg,
  },
  railHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  railTitle: { fontSize: 18, fontWeight: "700", color: Colors.warm[900] },
  newBtn: {
    paddingVertical: 12,
    borderRadius: Radius.md,
    backgroundColor: Colors.sage[400],
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  newBtnText: { color: Colors.white, fontWeight: "700", fontSize: 14 },
  railEmpty: {
    fontSize: 12,
    color: Colors.warm[500],
    textAlign: "center",
    paddingVertical: Spacing.md,
  },
  railRow: {
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: Radius.md,
    marginBottom: 4,
  },
  railRowActive: { backgroundColor: Colors.lavender[50] },
  railRowTitle: { fontSize: 13, fontWeight: "700", color: Colors.warm[800] },
  railRowSub: { fontSize: 11, color: Colors.warm[400], marginTop: 2 },
});
