import { useEffect, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { onboardingApi } from "@psico/api-client";
import type { OnboardingTourStep } from "@psico/types";

import { Colors, Radius, Spacing } from "@/theme";

/**
 * TourOverlay — Sprint S37 (mobile).
 *
 * Mobile counterpart of the web `_TourOverlay.tsx`. Since the tabs at
 * the bottom of the screen are the navigation in mobile, we don't try
 * to highlight them — we render a centered card with the step title +
 * body and let the user scrub through.
 *
 * Trigger lives in `(tabs)/_layout.tsx`: when `me.onboardingState.
 * completedAt && !tourCompletedAt`, mount this with `onClose` that
 * flips the parent flag.
 *
 * Saltar/Terminar both POST `/api/onboarding/tour/complete`. The
 * difference is how many steps we report seeing — for analytics.
 */
export function TourOverlay({ onClose }: { onClose: () => void }) {
  const [steps, setSteps] = useState<OnboardingTourStep[] | null>(null);
  const [stepIdx, setStepIdx] = useState(0);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    onboardingApi
      .getTour()
      .then((res) => {
        if (cancelled) return;
        if (res.steps.length === 0) {
          // No steps configured — silently mark complete.
          finish(0);
        } else {
          setSteps(res.steps);
        }
      })
      .catch(() => {
        // Tour is optional; design says "Error: ignorable".
        if (!cancelled) onClose();
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function finish(stepsCompleted: number) {
    setClosing(true);
    try {
      await onboardingApi.completeTour({ stepsCompleted });
    } catch {
      // Network failure OK — the next /user/me will clean this up.
    }
    onClose();
  }

  if (!steps) return null;
  const step = steps[stepIdx];
  if (!step) return null;

  const isFirst = stepIdx === 0;
  const isLast = stepIdx === steps.length - 1;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.eyebrow}>
            PASO {stepIdx + 1} DE {steps.length}
          </Text>
          <Text style={styles.title}>{step.title}</Text>
          <Text style={styles.body}>{step.body}</Text>

          <View style={styles.actions}>
            <Pressable
              style={styles.skip}
              onPress={() => void finish(stepIdx)}
              disabled={closing}
            >
              <Text style={styles.skipText}>Saltar tour</Text>
            </Pressable>

            <View style={styles.navRow}>
              {!isFirst ? (
                <Pressable
                  style={styles.secondary}
                  onPress={() => setStepIdx((i) => Math.max(0, i - 1))}
                  disabled={closing}
                >
                  <Text style={styles.secondaryText}>Anterior</Text>
                </Pressable>
              ) : null}
              <Pressable
                style={styles.primary}
                onPress={() => {
                  if (isLast) {
                    void finish(steps.length);
                  } else {
                    setStepIdx((i) => i + 1);
                  }
                }}
                disabled={closing}
              >
                <Text style={styles.primaryText}>
                  {isLast ? "Terminar" : "Siguiente"}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing.md,
  },
  card: {
    width: "100%",
    maxWidth: 380,
    backgroundColor: Colors.white,
    borderRadius: Radius.xl,
    padding: Spacing.lg,
  },
  eyebrow: {
    color: Colors.lavender[500],
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.4,
  },
  title: {
    color: Colors.warm[900],
    fontSize: 20,
    fontWeight: "700",
    marginTop: 6,
    lineHeight: 26,
  },
  body: {
    color: Colors.warm[600],
    fontSize: 13.5,
    lineHeight: 21,
    marginTop: 10,
  },
  actions: {
    marginTop: Spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.sm,
  },
  skip: {
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  skipText: {
    color: Colors.warm[500],
    fontSize: 12.5,
    fontWeight: "600",
    textDecorationLine: "underline",
  },
  navRow: {
    flexDirection: "row",
    gap: 6,
  },
  primary: {
    backgroundColor: Colors.lavender[500],
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: Radius.md,
  },
  primaryText: {
    color: Colors.white,
    fontSize: 12.5,
    fontWeight: "700",
  },
  secondary: {
    borderWidth: 1.5,
    borderColor: Colors.warm[200],
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: Radius.md,
    backgroundColor: Colors.white,
  },
  secondaryText: {
    color: Colors.warm[700],
    fontSize: 12.5,
    fontWeight: "600",
  },
});
