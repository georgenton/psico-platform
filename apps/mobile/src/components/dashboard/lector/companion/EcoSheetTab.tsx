import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { ecoApi } from "@psico/api-client";
import type { EcoScope } from "@psico/types";
import { useDiaryKey } from "@/crypto/diary-key-context";
import { EcoChat } from "@/components/dashboard/eco/EcoChat";
import { UnlockGate } from "@/components/dashboard/diario/UnlockGate";
import { Colors, Spacing } from "@/theme";

/**
 * EcoSheetTab — the "Eco" tab of the reader companion sheet (mobile).
 *
 * Lets the user chat with Eco without leaving the chapter. Gates on `ecoKey`
 * (UnlockGate) and resolves the user's most recent thread, then embeds the
 * shared `EcoChat` (same component the full Eco screen uses). The passage they
 * highlighted seeds the composer.
 */
export function EcoSheetTab({
  passagePrompt,
  onSeedConsumed,
  scope,
}: {
  passagePrompt: string | null;
  onSeedConsumed: () => void;
  /** Fase H — reading context (scopes RAG + enables the resonance offer). */
  scope?: EcoScope;
}) {
  const { ecoKey, isLegacyAccount } = useDiaryKey();

  const [threadId, setThreadId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const bootstrapped = useRef(false);

  const bootstrap = useCallback(async () => {
    try {
      const res = await ecoApi.listThreads();
      if (res.rail.length > 0) {
        setThreadId(res.rail[0]!.id);
      } else {
        const created = await ecoApi.createThread();
        setThreadId(created.id);
      }
    } catch {
      setError("No pudimos abrir Eco aquí. Reintenta.");
    }
  }, []);

  useEffect(() => {
    if (!ecoKey || bootstrapped.current) return;
    bootstrapped.current = true;
    void bootstrap();
  }, [ecoKey, bootstrap]);

  if (isLegacyAccount) {
    return (
      <View style={styles.pad}>
        <Text style={styles.muted}>
          Tu cuenta aún no tiene activada la protección de privacidad. Contacta
          soporte para habilitar Eco.
        </Text>
      </View>
    );
  }

  if (!ecoKey) {
    return (
      <ScrollView
        contentContainerStyle={styles.unlockScroll}
        keyboardShouldPersistTaps="handled"
      >
        <UnlockGate context="eco" />
      </ScrollView>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>{error}</Text>
        <Pressable
          onPress={() => {
            setError(null);
            bootstrapped.current = false;
            void bootstrap();
          }}
          style={styles.retry}
        >
          <Text style={styles.retryText}>Reintentar</Text>
        </Pressable>
      </View>
    );
  }

  if (!threadId) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={Colors.lavender[500]} />
      </View>
    );
  }

  return (
    <EcoChat
      threadId={threadId}
      ecoKey={ecoKey}
      seed={passagePrompt}
      onSeedConsumed={onSeedConsumed}
      scope={scope}
    />
  );
}

const styles = StyleSheet.create({
  pad: { padding: Spacing.lg },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing.lg,
  },
  unlockScroll: { flexGrow: 1, justifyContent: "center", padding: Spacing.lg },
  muted: { fontSize: 13, color: Colors.warm[600], textAlign: "center" },
  retry: {
    marginTop: Spacing.md,
    borderRadius: 999,
    backgroundColor: Colors.sage[400],
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  retryText: { color: "white", fontWeight: "700", fontSize: 12.5 },
});
