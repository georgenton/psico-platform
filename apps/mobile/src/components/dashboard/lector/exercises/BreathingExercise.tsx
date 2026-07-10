import { useEffect, useRef, useState } from "react";
import {
  Animated,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { BreatheExercise } from "@psico/types";
import { Colors } from "@/theme";

/**
 * BreathingExercise — a paced breathing overlay (backlog: actividades reales).
 *
 * Runs the exercise's inhale → hold → exhale cycle N times with an animated
 * circle that grows on the inhale and shrinks on the exhale. Purely client-side.
 */
type Phase = "inhale" | "hold" | "exhale" | "done";

const PHASE_LABEL: Record<Phase, string> = {
  inhale: "Inhala",
  hold: "Sostén",
  exhale: "Exhala",
  done: "Listo",
};

export function BreathingExercise({
  exercise,
  onClose,
  onReflect,
  onAskEco,
}: {
  exercise: BreatheExercise;
  onClose: () => void;
  /** Post-exercise nudge — write how you feel now (opens Reflexión). */
  onReflect?: () => void;
  /** Post-exercise nudge — take the calm into a chat with Eco. */
  onAskEco?: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("inhale");
  const [cycle, setCycle] = useState(1);
  const scale = useRef(new Animated.Value(0.55)).current;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const durations: Record<Exclude<Phase, "done">, number> = {
      inhale: exercise.inhaleSec,
      hold: exercise.holdSec,
      exhale: exercise.exhaleSec,
    };

    function animateTo(target: number, seconds: number) {
      Animated.timing(scale, {
        toValue: target,
        duration: seconds * 1000,
        useNativeDriver: true,
      }).start();
    }

    function schedule(next: Phase, nextCycle: number) {
      setPhase(next);
      setCycle(nextCycle);
      if (next === "done") {
        animateTo(0.7, 0.4);
        return;
      }
      if (next === "inhale") animateTo(1, durations.inhale);
      else if (next === "exhale") animateTo(0.55, durations.exhale);
      // hold keeps the current scale.
      const ms = durations[next] * 1000;
      timerRef.current = setTimeout(() => {
        if (next === "inhale") schedule("hold", nextCycle);
        else if (next === "hold") schedule("exhale", nextCycle);
        else if (next === "exhale") {
          if (nextCycle >= exercise.cycles) schedule("done", nextCycle);
          else schedule("inhale", nextCycle + 1);
        }
      }, ms);
    }

    schedule("inhale", 1);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [exercise, scale]);

  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Text style={styles.title}>{exercise.title}</Text>

        <View style={styles.stage}>
          <Animated.View
            style={[styles.halo, { transform: [{ scale }] }]}
            pointerEvents="none"
          />
          <View style={styles.core}>
            <Text style={styles.phase}>{PHASE_LABEL[phase]}</Text>
            {phase !== "done" ? (
              <Text style={styles.cycle}>
                Ciclo {cycle}/{exercise.cycles}
              </Text>
            ) : null}
          </View>
        </View>

        <Text style={styles.hint}>
          {phase === "done"
            ? "Nota cómo llegas ahora al capítulo. Cuando quieras, sigue leyendo."
            : "Sigue el ritmo del círculo."}
        </Text>

        {phase === "done" && (onReflect || onAskEco) ? (
          <View style={styles.nudgeRow}>
            {onReflect ? (
              <Pressable
                onPress={() => {
                  onClose();
                  onReflect();
                }}
                style={styles.nudgeBtn}
              >
                <Text style={styles.nudgeText}>🪷 Escribir cómo me siento</Text>
              </Pressable>
            ) : null}
            {onAskEco ? (
              <Pressable
                onPress={() => {
                  onClose();
                  onAskEco();
                }}
                style={styles.nudgeBtn}
              >
                <Text style={styles.nudgeText}>🌿 Conversar con Eco</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        <Pressable
          onPress={onClose}
          style={[styles.btn, phase === "done" && styles.btnDone]}
        >
          <Text style={styles.btnText}>
            {phase === "done" ? "Terminar" : "Salir"}
          </Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(20,30,25,0.94)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  title: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 2,
    textTransform: "uppercase",
    color: Colors.sage[100],
  },
  stage: {
    marginTop: 40,
    width: 240,
    height: 240,
    alignItems: "center",
    justifyContent: "center",
  },
  halo: {
    position: "absolute",
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: "rgba(157,209,178,0.25)",
  },
  core: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "rgba(157,209,178,0.92)",
    alignItems: "center",
    justifyContent: "center",
  },
  phase: { fontSize: 17, fontWeight: "700", color: "#1B3B2C" },
  cycle: { fontSize: 11, color: "#1B3B2C", marginTop: 2 },
  hint: {
    marginTop: 40,
    fontSize: 13.5,
    color: "rgba(255,255,255,0.7)",
    textAlign: "center",
    maxWidth: 280,
    lineHeight: 20,
  },
  nudgeRow: {
    marginTop: 24,
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 8,
  },
  nudgeBtn: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.25)",
    paddingHorizontal: 16,
    paddingVertical: 9,
  },
  nudgeText: { color: "white", fontWeight: "700", fontSize: 12.5 },
  btn: {
    marginTop: 24,
    borderRadius: 999,
    paddingHorizontal: 26,
    paddingVertical: 11,
    backgroundColor: "rgba(255,255,255,0.14)",
  },
  btnDone: { backgroundColor: Colors.sage[400] },
  btnText: { color: "white", fontWeight: "700", fontSize: 13 },
});
