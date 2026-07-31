"use client";

import styles from "./guided-reading-prototype.module.css";
import {
  GUIDE_CHECKPOINTS,
  scenePartLabel,
  type GuideSceneIndex,
} from "./guided-reading-prototype.fixture";

/**
 * Progreso en dos niveles distintos (GR-022).
 *
 * - Checkpoint: Concepto · Práctica · Recordar. En producción es server-owned;
 *   aquí está simulado por el fixture.
 * - Parte visual dentro del checkpoint: «Concepto · parte 2 de 3». Es estado
 *   de presentación.
 *
 * Nunca se presentan las ocho escenas como ocho pasos persistidos.
 */
export function PrototypeProgress({
  scene,
  completed,
}: {
  scene: GuideSceneIndex;
  /** Checkpoints simulados ya confirmados. */
  completed: readonly string[];
}) {
  const activeCheckpoint = GUIDE_CHECKPOINTS.find((checkpoint) =>
    checkpoint.scenes.includes(scene),
  );
  const part = scenePartLabel(scene);

  return (
    <div className={styles.progress}>
      <ol className={styles.checkpoints}>
        {GUIDE_CHECKPOINTS.map((checkpoint) => {
          const done = completed.includes(checkpoint.key);
          const active = activeCheckpoint?.key === checkpoint.key;
          return (
            <li
              key={checkpoint.key}
              className={`${styles.checkpoint} ${done ? styles.checkpointDone : ""} ${
                active ? styles.checkpointActive : ""
              }`}
              aria-current={active ? "step" : undefined}
            >
              <span className={styles.checkpointBar} aria-hidden="true" />
              <span>
                {done ? "✓ " : ""}
                {checkpoint.label}
              </span>
            </li>
          );
        })}
      </ol>
      <p className={styles.partLabel}>
        {part ?? "Cierre de la lectura guiada"}
      </p>
    </div>
  );
}
