"use client";

import styles from "./guided-reading-prototype.module.css";
import {
  MODE_OPTIONS,
  type PrototypeMode,
} from "./guided-reading-prototype.fixture";

/**
 * Escena 0 — Selector.
 *
 * Presenta el capítulo como unidad y las cuatro maneras de vivirlo. Elegir
 * «Lectura guiada» solo cambia estado local: en el prototipo no se crea
 * ninguna sesión (`GUIDE_AUTOSTART=false`).
 *
 * Nace grande —es la pregunta de entrada— y se compacta en cuanto la persona
 * elige, para que el protagonismo pase al contenido. En compacto queda una
 * sola fila: nunca una tarjeta suelta en una segunda línea.
 */
export function ChapterModeSelector({
  mode,
  compact,
  onSelect,
}: {
  mode: PrototypeMode;
  compact: boolean;
  onSelect: (mode: PrototypeMode) => void;
}) {
  if (compact) {
    return (
      <nav
        className={styles.modeStrip}
        aria-label="Cómo vivir este capítulo"
        data-testid="mode-selector"
        data-variant="compact"
      >
        {MODE_OPTIONS.map((option) => (
          <button
            key={option.mode}
            type="button"
            aria-pressed={mode === option.mode}
            onClick={() => onSelect(option.mode)}
            className={`${styles.modeStripItem} ${
              mode === option.mode ? styles.modeStripItemOn : ""
            }`}
          >
            <span aria-hidden="true">{option.icon}</span>
            <span>{option.shortLabel}</span>
          </button>
        ))}
      </nav>
    );
  }

  return (
    <section
      className={styles.modeCard}
      aria-labelledby="proto-mode-question"
      data-testid="mode-selector"
      data-variant="full"
    >
      <h2 id="proto-mode-question" className={styles.modeQuestion}>
        ¿Cómo quieres vivir este capítulo?
      </h2>
      <div
        className={styles.modeGrid}
        role="group"
        aria-labelledby="proto-mode-question"
      >
        {MODE_OPTIONS.map((option) => (
          <button
            key={option.mode}
            type="button"
            aria-pressed={mode === option.mode}
            onClick={() => onSelect(option.mode)}
            className={`${styles.modeButton} ${
              mode === option.mode ? styles.modeButtonActive : ""
            }`}
          >
            <span className={styles.modeIcon} aria-hidden="true">
              {option.icon}
            </span>
            <span className={styles.modeLabel}>{option.label}</span>
            <span className={styles.modeHint}>{option.hint}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
