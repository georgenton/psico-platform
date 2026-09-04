/**
 * The words that belong to the product rather than to any one guide.
 *
 * They live apart from `guide-reader-copy` for one reason: two modules need
 * them — that file and the EEC-C01 microguides that build their copy from the
 * approved manifests — and importing across those two directly makes a cycle
 * whose only symptom is an empty registry at module-eval time.
 */
/** Words that are the product's, not a chapter's — identical in every guide. */
export const READER_GUIDE_SHARED = {
  modeLabel: "🌱 Lectura guiada",
  resonance: {
    question: "¿Esta idea fue personalmente significativa para ti?",
    yes: "Esto me resonó",
    no: "Ahora no",
    saved: "Añadido a tu mapa. Puedes verlo (y quitarlo) en Mis resonancias.",
    error: "No pudimos guardarlo. Reintenta.",
  },
  checkin: {
    action: "Registrar mi momento",
    note: "Opcional. Lo eliges tú; la guía no interpreta cómo te sientes.",
  },
  unavailable: "Lectura guiada no disponible por ahora.",
  close: "Cerrar",
  panelLabel: "Lectura guiada",
} as const;
