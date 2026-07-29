"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import styles from "./guided-reading-prototype.module.css";
import { ChapterModeSelector } from "./ChapterModeSelector";
import { PrototypeGuidePanel } from "./PrototypeGuidePanel";
import { PrototypeMediaExperience } from "./PrototypeMediaExperience";
import { PrototypeReaderCanvas } from "./PrototypeReaderCanvas";
import {
  CHAPTER,
  type GuideCheckpointKey,
  type GuideSceneIndex,
  type PrototypeInitialState,
  type PrototypeMode,
} from "./guided-reading-prototype.fixture";

/**
 * Los checkpoints ya cerrados se derivan de la escena inicial para que las
 * capturas deterministas muestren un progreso coherente.
 *
 * `Recordar` solo cuenta como cerrado en el cierre (escena 7): durante el
 * feedback el checkpoint sigue abierto.
 */
function completedForScene(scene: GuideSceneIndex): GuideCheckpointKey[] {
  const done: GuideCheckpointKey[] = [];
  if (scene >= 4) done.push("concepto");
  if (scene >= 5) done.push("practica");
  if (scene >= 7) done.push("recordar");
  return done;
}

/**
 * Raíz del prototipo visual de Guided Reading V1 (GR-1).
 *
 * Aislado por diseño: no hace `fetch`, no usa `localStorage`/`sessionStorage`
 * ni cookies, no llama al API Guide y no escribe en Mi Evolución ni en el Mapa
 * Emocional. Todo el estado vive en React y se pierde al recargar, que es
 * exactamente lo que queremos para una revisión de diseño.
 */
export function GuidedReadingPrototype({
  initial,
}: {
  initial: PrototypeInitialState;
}) {
  const [mode, setMode] = useState<PrototypeMode>(initial.mode);
  const [scene, setScene] = useState<GuideSceneIndex>(initial.scene);
  const [completed, setCompleted] = useState<GuideCheckpointKey[]>(() =>
    completedForScene(initial.scene),
  );
  const [resonance, setResonance] = useState<"yes" | "no" | null>(null);
  const [checkin, setCheckin] = useState(false);
  const [anchorFlash, setAnchorFlash] = useState(false);
  // El selector nace grande y se compacta en cuanto la persona elige. Con un
  // `?mode=` explícito la elección ya está hecha.
  const [hasChosen, setHasChosen] = useState(initial.mode !== "read");
  // Cambiar esta `key` remonta el panel y reinicia TODO su estado local:
  // reproducción del clip, transcripción, solo-audio, temporizador, opción
  // elegida y pasaje localizado.
  const [runId, setRunId] = useState(0);

  const anchorRef = useRef<HTMLQuoteElement | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (flashTimer.current) clearTimeout(flashTimer.current);
    },
    [],
  );

  const goToPassage = useCallback(() => {
    const node = anchorRef.current;
    if (!node) return;
    // 1) scroll · 2) foco accesible · 3) highlight temporal.
    // El panel permanece abierto y la ruta no cambia.
    if (typeof node.scrollIntoView === "function") {
      node.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    node.focus();
    setAnchorFlash(true);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setAnchorFlash(false), 1800);
  }, []);

  const selectMode = useCallback((next: PrototypeMode) => {
    setHasChosen(true);
    setMode(next);
    setScene(next === "guide" ? 1 : 0);
  }, []);

  const closeGuide = useCallback(() => {
    setMode("read");
    setScene(0);
  }, []);

  const confirmCheckpoint = useCallback(
    (checkpoint: GuideCheckpointKey, next: GuideSceneIndex) => {
      setCompleted((current) =>
        current.includes(checkpoint) ? current : [...current, checkpoint],
      );
      setScene(next);
    },
    [],
  );

  /** «Repetir la guía» vuelve al punto de partida, no a mitad del recorrido. */
  const repeatGuide = useCallback(() => {
    setScene(1);
    setCompleted([]);
    setResonance(null);
    setCheckin(false);
    setRunId((value) => value + 1);
  }, []);

  const panelOpen = mode === "guide" && scene >= 1;

  return (
    <div className={styles.page}>
      <header className={styles.topbar}>
        <div className={styles.topbarInner}>
          <span className={styles.eyebrow}>Prototipo · revisión de diseño</span>
          <span className={styles.bookTitle}>{CHAPTER.bookTitle}</span>
          <span className={styles.chapterTitle}>
            {CHAPTER.partLabel} · Cap. {CHAPTER.chapterNumber} —{" "}
            {CHAPTER.chapterTitle}
          </span>
        </div>
      </header>

      <main
        className={`${styles.layout} ${panelOpen ? styles.layoutWithPanel : ""}`}
      >
        <div className={styles.readerCol}>
          <ChapterModeSelector
            mode={mode}
            compact={hasChosen}
            onSelect={selectMode}
          />

          {mode === "listen" || mode === "watch" ? (
            <PrototypeMediaExperience mode={mode} />
          ) : (
            <PrototypeReaderCanvas
              anchorRef={anchorRef}
              anchorFlash={anchorFlash}
            />
          )}
        </div>

        {panelOpen ? (
          <PrototypeGuidePanel
            key={runId}
            scene={scene as Exclude<GuideSceneIndex, 0>}
            outcome={initial.outcome}
            completedCheckpoints={completed}
            resonance={resonance}
            checkin={checkin}
            onScene={setScene}
            onClose={closeGuide}
            onGoToPassage={goToPassage}
            onConfirmCheckpoint={confirmCheckpoint}
            onResonance={setResonance}
            onCheckin={() => setCheckin(true)}
            onRepeat={repeatGuide}
          />
        ) : null}
      </main>
    </div>
  );
}
