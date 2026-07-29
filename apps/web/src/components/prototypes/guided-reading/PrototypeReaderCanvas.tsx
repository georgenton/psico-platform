"use client";

import type { MutableRefObject } from "react";
import styles from "./guided-reading-prototype.module.css";
import {
  READER_BLOCKS,
  READER_DEMO_NOTE,
} from "./guided-reading-prototype.fixture";

/**
 * Superficie de lectura del prototipo.
 *
 * Muestra texto editorial de demostración, controles de lectura visuales,
 * una marca simulada y el acceso visual a Eco y Reflexión. Ninguno de esos
 * controles ejecuta lógica: en GR-1 son presentación.
 *
 * El bloque marcado como `anchor` es el destino visual de «Ir al pasaje»
 * (`PROTOTYPE_ANCHOR_KIND=VISUAL_PLACEHOLDER`). No corresponde a un
 * `blockKey` real de Content Core.
 */
export function PrototypeReaderCanvas({
  anchorRef,
  anchorFlash,
}: {
  anchorRef: MutableRefObject<HTMLQuoteElement | null>;
  anchorFlash: boolean;
}) {
  return (
    <article className={styles.reader} aria-label="Texto del capítulo">
      <div className={styles.readerToolbar}>
        <button type="button" className={styles.chip} disabled>
          Aa
        </button>
        <button type="button" className={styles.chip} disabled>
          Tema claro
        </button>
        <button type="button" className={styles.chip} disabled>
          Ancho cómodo
        </button>
        <span className={styles.spacer} />
        <span className={styles.timeLabel}>Cap. 1 · 12 min de lectura</span>
      </div>

      <p className={styles.demoNote}>{READER_DEMO_NOTE}</p>

      {READER_BLOCKS.map((block) => {
        if (block.kind === "heading") {
          return (
            <h2 key={block.id} className={styles.blockHeading}>
              {block.text}
            </h2>
          );
        }
        if (block.kind === "quote") {
          return (
            <blockquote
              key={block.id}
              ref={block.anchor ? anchorRef : undefined}
              tabIndex={block.anchor ? -1 : undefined}
              data-testid={block.anchor ? "prototype-anchor" : undefined}
              className={`${styles.blockQuote} ${styles.anchorTarget} ${
                block.anchor && anchorFlash ? styles.anchorFlash : ""
              }`}
            >
              {block.text}
            </blockquote>
          );
        }
        return (
          <p key={block.id} className={styles.blockParagraph}>
            <span className={block.marked ? styles.marked : undefined}>
              {block.text}
            </span>
          </p>
        );
      })}

      <div className={styles.readerFooter}>
        <button type="button" className={styles.chip} disabled>
          🌿 Preguntarle a Eco
        </button>
        <button type="button" className={styles.chip} disabled>
          🪷 Escribir una reflexión
        </button>
        <button type="button" className={styles.chip} disabled>
          ✎ Notas
        </button>
      </div>
    </article>
  );
}
