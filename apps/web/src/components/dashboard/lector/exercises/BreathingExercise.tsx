"use client";

import { useEffect, useRef, useState } from "react";
import type { BreatheExercise } from "@psico/types";

/**
 * BreathingExercise — a paced breathing overlay (backlog: actividades reales).
 *
 * Runs the exercise's inhale → hold → exhale cycle N times, with an animated
 * circle that grows on the inhale and shrinks on the exhale. Purely client-side
 * — no tracking; the value is the minute of paced breathing itself.
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
}: {
  exercise: BreatheExercise;
  onClose: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("inhale");
  const [cycle, setCycle] = useState(1);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const durations: Record<Exclude<Phase, "done">, number> = {
      inhale: exercise.inhaleSec,
      hold: exercise.holdSec,
      exhale: exercise.exhaleSec,
    };

    function schedule(next: Phase, nextCycle: number) {
      setPhase(next);
      setCycle(nextCycle);
      if (next === "done") return;
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
  }, [exercise]);

  const scale = phase === "inhale" || phase === "hold" ? 1 : 0.55;
  const transitionSec =
    phase === "inhale"
      ? exercise.inhaleSec
      : phase === "exhale"
        ? exercise.exhaleSec
        : 0.3;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center"
      style={{ background: "rgba(20, 30, 25, 0.92)" }}
      role="dialog"
      aria-label={exercise.title}
    >
      <p
        className="text-[11px] font-bold uppercase tracking-[0.2em]"
        style={{ color: "var(--color-sage-200)" }}
      >
        {exercise.title}
      </p>

      <div className="relative mt-10 flex h-[240px] w-[240px] items-center justify-center">
        <div
          aria-hidden
          className="absolute rounded-full"
          style={{
            width: 200,
            height: 200,
            background:
              "radial-gradient(circle, rgba(157,209,178,0.35), rgba(157,209,178,0.08))",
            transform: `scale(${scale})`,
            transition: `transform ${transitionSec}s ease-in-out`,
          }}
        />
        <div
          className="relative flex h-[120px] w-[120px] flex-col items-center justify-center rounded-full text-center"
          style={{ background: "rgba(157,209,178,0.9)" }}
        >
          <span className="text-[17px] font-bold" style={{ color: "#1B3B2C" }}>
            {PHASE_LABEL[phase]}
          </span>
          {phase !== "done" ? (
            <span className="text-[11px]" style={{ color: "#1B3B2C" }}>
              Ciclo {cycle}/{exercise.cycles}
            </span>
          ) : null}
        </div>
      </div>

      {phase === "done" ? (
        <p
          className="mt-10 max-w-xs text-center text-[13.5px]"
          style={{ color: "var(--color-sage-100)" }}
        >
          Nota cómo llegas ahora al capítulo. Cuando quieras, sigue leyendo.
        </p>
      ) : (
        <p
          className="mt-10 text-[13px]"
          style={{ color: "rgba(255,255,255,0.6)" }}
        >
          Sigue el ritmo del círculo.
        </p>
      )}

      <button
        type="button"
        onClick={onClose}
        className="mt-8 rounded-full px-6 py-2.5 text-[13px] font-semibold"
        style={{
          background:
            phase === "done"
              ? "var(--color-sage-400)"
              : "rgba(255,255,255,0.14)",
          color: "white",
        }}
      >
        {phase === "done" ? "Terminar" : "Salir"}
      </button>
    </div>
  );
}
