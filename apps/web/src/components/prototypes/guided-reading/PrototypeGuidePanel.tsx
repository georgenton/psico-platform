"use client";

import { useEffect, useState } from "react";
import styles from "./guided-reading-prototype.module.css";
import { PrototypeProgress } from "./PrototypeProgress";
import {
  EVOLUTION_NOTE,
  GUIDE_ANCHOR_SCENE,
  GUIDE_CLIP,
  GUIDE_COMPLETION,
  GUIDE_COVER,
  GUIDE_FEEDBACK,
  GUIDE_PRACTICE,
  GUIDE_RECALL,
  PRACTICE_EXPLICIT_ROUTE_REQUIRED,
  PROTOTYPE_CHECKIN_WRITE,
  PROTOTYPE_CLIENT_GRADING,
  PROTOTYPE_EVOLUTION_WRITE,
  PROTOTYPE_RESONANCE_WRITE,
  type GuideCheckpointKey,
  type GuideSceneIndex,
  type PrototypeOutcome,
} from "./guided-reading-prototype.fixture";

/**
 * Panel de Lectura guiada — ocho escenas de presentación sobre tres
 * checkpoints.
 *
 * En escritorio es un panel lateral y en móvil un bottom sheet: mismo DOM,
 * distinta media query. El texto del capítulo nunca desaparece.
 *
 * GR-1 no integra el Guide runtime. Todo lo que ocurre aquí es estado local:
 * no hay `GuideSession`, ni receipts, ni idempotencia, ni recovery. El
 * feedback del recall llega del fixture y **nunca** de la opción elegida
 * (`PROTOTYPE_CLIENT_GRADING=false`).
 *
 * El estado local vive en este componente a propósito: la raíz lo reinicia
 * remontando el panel con una `key` nueva cuando la persona repite la guía.
 */
export function PrototypeGuidePanel({
  scene,
  outcome,
  completedCheckpoints,
  resonance,
  checkin,
  onScene,
  onClose,
  onGoToPassage,
  onConfirmCheckpoint,
  onResonance,
  onCheckin,
  onRepeat,
}: {
  scene: Exclude<GuideSceneIndex, 0>;
  outcome: PrototypeOutcome;
  completedCheckpoints: readonly GuideCheckpointKey[];
  resonance: "yes" | "no" | null;
  checkin: boolean;
  onScene: (scene: GuideSceneIndex) => void;
  onClose: () => void;
  onGoToPassage: () => void;
  onConfirmCheckpoint: (
    checkpoint: GuideCheckpointKey,
    next: GuideSceneIndex,
  ) => void;
  onResonance: (choice: "yes" | "no") => void;
  onCheckin: () => void;
  onRepeat: () => void;
}) {
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [clipPlaying, setClipPlaying] = useState(false);
  const [clipTranscript, setClipTranscript] = useState(false);
  const [clipAudioOnly, setClipAudioOnly] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [practiceReady, setPracticeReady] = useState(false);
  const [passageLocated, setPassageLocated] = useState(false);

  useEffect(() => {
    if (remaining === null) return;
    if (remaining <= 0) {
      setRemaining(null);
      setPracticeReady(true);
      return;
    }
    const id = setTimeout(
      () => setRemaining((value) => (value ?? 1) - 1),
      1000,
    );
    return () => clearTimeout(id);
  }, [remaining]);

  // Terminar la pausa por cualquiera de las dos rutas explícitas.
  const finishPractice = () => {
    setRemaining(null);
    setPracticeReady(true);
  };

  const locatePassage = () => {
    onGoToPassage();
    setPassageLocated(true);
  };

  const back = () => {
    if (scene === 1) {
      onClose();
      return;
    }
    onScene((scene - 1) as GuideSceneIndex);
  };

  return (
    <aside
      className={styles.panel}
      aria-label="Lectura guiada"
      data-testid="guide-panel"
      data-scene={scene}
    >
      <span className={styles.sheetHandle} aria-hidden="true" />

      <header className={styles.panelHeader}>
        <button
          type="button"
          className={styles.iconButton}
          onClick={back}
          aria-label="Volver a la escena anterior"
        >
          ←
        </button>
        <span className={styles.panelHeaderTitle}>Lectura guiada</span>
        <span className={styles.spacer} />
        <button
          type="button"
          className={styles.iconButton}
          onClick={onClose}
          aria-label="Cerrar lectura guiada"
        >
          ✕
        </button>
      </header>

      {scene > 1 ? (
        <PrototypeProgress scene={scene} completed={completedCheckpoints} />
      ) : null}

      <div className={styles.panelBody}>
        {scene === 1 ? (
          <>
            <p className={styles.sceneEyebrow}>{GUIDE_COVER.eyebrow}</p>
            <h2 className={styles.sceneTitle}>{GUIDE_COVER.title}</h2>
            <p className={styles.sceneText}>{GUIDE_COVER.description}</p>
            <ul className={styles.metaList}>
              <li className={styles.metaItem}>{GUIDE_COVER.durationLabel}</li>
              {GUIDE_COVER.pieces.map((piece) => (
                <li key={piece} className={styles.metaItem}>
                  {piece}
                </li>
              ))}
            </ul>
          </>
        ) : null}

        {scene === 2 ? (
          <>
            <p className={styles.sceneEyebrow}>Concepto</p>
            <h2 className={styles.sceneTitle}>{GUIDE_CLIP.title}</h2>
            <div
              className={`${styles.clipCanvas} ${
                clipAudioOnly ? styles.clipCanvasAudio : ""
              }`}
              data-testid="clip-canvas"
              data-representation={clipAudioOnly ? "audio" : "video"}
            >
              <span aria-hidden="true" style={{ fontSize: "var(--text-3xl)" }}>
                {clipAudioOnly ? "◍" : clipPlaying ? "❚❚" : "▶"}
              </span>
              {clipAudioOnly ? (
                <span className={styles.clipCanvasCaption}>
                  {GUIDE_CLIP.audioOnlyCaption}
                </span>
              ) : null}
            </div>
            <p className={styles.sceneText}>{GUIDE_CLIP.durationLabel}</p>
            <div className={styles.rowWrap}>
              <button
                type="button"
                className={`${styles.chip} ${clipPlaying ? styles.chipOn : ""}`}
                aria-pressed={clipPlaying}
                onClick={() => setClipPlaying((value) => !value)}
              >
                Reproducir
              </button>
              <button
                type="button"
                className={`${styles.chip} ${clipTranscript ? styles.chipOn : ""}`}
                aria-expanded={clipTranscript}
                onClick={() => setClipTranscript((value) => !value)}
              >
                Leer transcripción
              </button>
              <button
                type="button"
                className={`${styles.chip} ${clipAudioOnly ? styles.chipOn : ""}`}
                aria-pressed={clipAudioOnly}
                onClick={() => setClipAudioOnly((value) => !value)}
              >
                {clipAudioOnly
                  ? GUIDE_CLIP.backToVideoLabel
                  : GUIDE_CLIP.audioOnlyLabel}
              </button>
            </div>
            {clipTranscript ? (
              <div className={styles.transcriptBox}>
                {GUIDE_CLIP.transcript.map((line) => (
                  <p key={line}>{line}</p>
                ))}
              </div>
            ) : null}
          </>
        ) : null}

        {scene === 3 ? (
          <>
            <p className={styles.sceneEyebrow}>Concepto</p>
            <h2 className={styles.sceneTitle}>{GUIDE_ANCHOR_SCENE.title}</h2>
            <p className={styles.sceneText}>{GUIDE_ANCHOR_SCENE.description}</p>
            {passageLocated ? (
              <p className={styles.locatedNote} data-testid="passage-located">
                {GUIDE_ANCHOR_SCENE.locatedLabel}
              </p>
            ) : null}
            <p
              className={styles.sceneText}
              style={{ marginTop: "var(--space-lg)" }}
            >
              {GUIDE_ANCHOR_SCENE.explanation}
            </p>
          </>
        ) : null}

        {scene === 4 ? (
          <>
            <p className={styles.sceneEyebrow}>Práctica</p>
            <h2 className={styles.sceneTitle}>{GUIDE_PRACTICE.title}</h2>
            <p className={styles.sceneText}>{GUIDE_PRACTICE.intro}</p>
            <ol className={styles.sceneText}>
              {GUIDE_PRACTICE.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>

            {remaining !== null ? (
              <div className={styles.timerBox}>
                <span className={styles.timerValue}>{remaining}</span>
                <span className={styles.timeLabel}>segundos de pausa</span>
              </div>
            ) : null}

            <div className={styles.rowWrap}>
              {remaining === null ? (
                <button
                  type="button"
                  className={styles.chip}
                  onClick={() => setRemaining(GUIDE_PRACTICE.timerSeconds)}
                >
                  {GUIDE_PRACTICE.startTimerCta}
                </button>
              ) : (
                <button
                  type="button"
                  className={styles.chip}
                  onClick={finishPractice}
                >
                  {GUIDE_PRACTICE.finishEarlyCta}
                </button>
              )}
              <button
                type="button"
                className={styles.chip}
                onClick={finishPractice}
              >
                {GUIDE_PRACTICE.skipTimerCta}
              </button>
            </div>

            <p className={styles.privacyNote}>{GUIDE_PRACTICE.privacyNote}</p>
            <p className={styles.privacyNote}>
              {practiceReady
                ? "Cuando quieras, confirma abajo que terminaste."
                : "Elige una de las dos opciones para poder confirmar."}
            </p>
          </>
        ) : null}

        {scene === 5 ? (
          <>
            <p className={styles.sceneEyebrow}>Recordar</p>
            <h2 className={styles.sceneTitle}>{GUIDE_RECALL.question}</h2>
            <div
              className={styles.optionList}
              role="radiogroup"
              aria-label="Opciones"
            >
              {GUIDE_RECALL.options.map((option) => {
                const selected = selectedOption === option.optionKey;
                return (
                  <button
                    key={option.optionKey}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setSelectedOption(option.optionKey)}
                    className={`${styles.option} ${selected ? styles.optionSelected : ""}`}
                  >
                    <span className={styles.optionBullet} aria-hidden="true" />
                    <span>{option.text}</span>
                  </button>
                );
              })}
            </div>
            <p className={styles.privacyNote}>{GUIDE_RECALL.note}</p>
          </>
        ) : null}

        {scene === 6 ? (
          <>
            <p className={styles.sceneEyebrow}>Recordar</p>
            <div
              data-testid="guide-feedback"
              data-outcome={outcome}
              className={`${styles.feedbackCard} ${
                outcome === "correct"
                  ? styles.feedbackCorrect
                  : styles.feedbackReview
              }`}
            >
              <p className={styles.feedbackBadge}>
                {GUIDE_FEEDBACK[outcome].badge}
              </p>
              <h2 className={styles.sceneTitle}>
                {GUIDE_FEEDBACK[outcome].title}
              </h2>
              <p className={styles.sceneText} style={{ marginBottom: 0 }}>
                {GUIDE_FEEDBACK[outcome].body}
              </p>
            </div>
            <p className={styles.privacyNote}>
              Este prototipo muestra el resultado que trae el fixture. No evalúa
              tu respuesta.
            </p>
          </>
        ) : null}

        {scene === 7 ? (
          <>
            <p className={styles.sceneEyebrow}>{GUIDE_COMPLETION.eyebrow}</p>
            <p className={styles.sceneText}>{GUIDE_COMPLETION.intro}</p>
            <ul className={styles.checklist}>
              {GUIDE_COMPLETION.achievements.map((item) => (
                <li key={item} className={styles.checklistItem}>
                  <span className={styles.checkMark} aria-hidden="true">
                    ✓
                  </span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>

            <p className={styles.evolutionNote} data-testid="evolution-note">
              {EVOLUTION_NOTE}
            </p>

            <div className={styles.resonance}>
              <p className={styles.sceneText} style={{ marginBottom: 0 }}>
                {GUIDE_COMPLETION.resonanceQuestion}
              </p>
              <div className={styles.resonanceRow}>
                <button
                  type="button"
                  className={`${styles.chip} ${resonance === "yes" ? styles.chipOn : ""}`}
                  aria-pressed={resonance === "yes"}
                  onClick={() => onResonance("yes")}
                >
                  {GUIDE_COMPLETION.resonanceYes}
                </button>
                <button
                  type="button"
                  className={`${styles.chip} ${checkin ? styles.chipOn : ""}`}
                  aria-pressed={checkin}
                  onClick={onCheckin}
                >
                  {GUIDE_COMPLETION.checkinCta}
                </button>
                <button
                  type="button"
                  className={`${styles.chip} ${resonance === "no" ? styles.chipOn : ""}`}
                  aria-pressed={resonance === "no"}
                  onClick={() => onResonance("no")}
                >
                  {GUIDE_COMPLETION.resonanceNo}
                </button>
              </div>
              {resonance !== null ? (
                <p className={styles.privacyNote}>
                  {GUIDE_COMPLETION.resonanceConfirmed}
                </p>
              ) : null}
              {checkin ? (
                <p className={styles.privacyNote}>
                  {GUIDE_COMPLETION.checkinConfirmed}
                </p>
              ) : null}
            </div>
          </>
        ) : null}
      </div>

      <footer className={styles.panelFooter}>
        {scene === 1 ? (
          <button
            type="button"
            className={styles.primaryButton}
            onClick={() => onScene(2)}
          >
            {GUIDE_COVER.cta}
          </button>
        ) : null}

        {scene === 2 ? (
          <button
            type="button"
            className={styles.primaryButton}
            onClick={() => onScene(3)}
          >
            Continuar
          </button>
        ) : null}

        {/*
          Jerarquía de la escena del pasaje: primero localizarlo, después
          cerrar el checkpoint. Hasta que el pasaje no se localiza, la acción
          de completar el concepto ni siquiera existe en el DOM.
        */}
        {scene === 3 && !passageLocated ? (
          <button
            type="button"
            className={styles.primaryButton}
            onClick={locatePassage}
          >
            {GUIDE_ANCHOR_SCENE.cta}
          </button>
        ) : null}

        {scene === 3 && passageLocated ? (
          <>
            <button
              type="button"
              className={styles.primaryButton}
              onClick={() => onConfirmCheckpoint("concepto", 4)}
            >
              {GUIDE_ANCHOR_SCENE.continueCta}
            </button>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={onGoToPassage}
            >
              {GUIDE_ANCHOR_SCENE.cta}
            </button>
          </>
        ) : null}

        {scene === 4 ? (
          <button
            type="button"
            className={styles.primaryButton}
            // La confirmación exige una ruta explícita: sin pausa terminada ni
            // «continuar sin temporizador» el botón no se puede pulsar.
            disabled={PRACTICE_EXPLICIT_ROUTE_REQUIRED && !practiceReady}
            onClick={() => onConfirmCheckpoint("practica", 5)}
          >
            {GUIDE_PRACTICE.checkpointCta}
          </button>
        ) : null}

        {scene === 5 ? (
          <button
            type="button"
            className={styles.primaryButton}
            disabled={selectedOption === null}
            onClick={() => {
              // El prototipo no compara la selección con nada:
              // PROTOTYPE_CLIENT_GRADING = false.
              void PROTOTYPE_CLIENT_GRADING;
              // El checkpoint `Recordar` NO se cierra aquí: primero llega el
              // feedback y solo el cierre lo marca como completado.
              onScene(6);
            }}
          >
            {GUIDE_RECALL.cta}
          </button>
        ) : null}

        {scene === 6 ? (
          <button
            type="button"
            className={styles.primaryButton}
            onClick={() => onConfirmCheckpoint("recordar", 7)}
          >
            Continuar
          </button>
        ) : null}

        {scene === 7 ? (
          <>
            <button
              type="button"
              className={styles.primaryButton}
              onClick={() => {
                // Cerrar no escribe nada: ni Mi Evolución, ni Resonance, ni
                // check-in. El prototipo solo anuncia el destino.
                void PROTOTYPE_EVOLUTION_WRITE;
                void PROTOTYPE_RESONANCE_WRITE;
                void PROTOTYPE_CHECKIN_WRITE;
                onClose();
              }}
            >
              {GUIDE_COMPLETION.actions[0]}
            </button>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={onGoToPassage}
            >
              {GUIDE_COMPLETION.actions[1]}
            </button>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={onRepeat}
            >
              {GUIDE_COMPLETION.actions[2]}
            </button>
          </>
        ) : null}
      </footer>
    </aside>
  );
}
