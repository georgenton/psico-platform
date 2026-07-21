/**
 * CC-7.4B.2 — CLOSED, server-side catalog of the Exercise rows the Content Core
 * backfill materializes for the FIRST Guide V1 unit.
 *
 * This is the executable authority for exactly two editorially-approved
 * definitions (PR #591, merge dc33f7f):
 *
 *   1. a CATALOG_PRACTICE target  → Exercise type REFLECTION;
 *   2. an ACTIVE_RECALL target    → Exercise type QUIZ, objective recall.
 *
 * Pure data + literal types, NO Nest, NO Prisma import — the backfill
 * (`exercise-ingestion.ts`) consumes it. Kept OUT of `@psico/types` on purpose:
 * `correctOptionKey` is an INTERNAL grading datum (CC-7.3) and must never reach
 * a shared package that the web/mobile clients import.
 *
 * Adding/altering a definition is an EDITORIAL act: it requires a new approval
 * doc + a new stable identity/version (never a silent rewrite — the ingestion
 * fails closed on drift). See docs/product/exercise-content-first-guide-unit.md.
 */

/** A recall option — a stable key plus its display label. Nothing else: the
 * strict recall parser (CC-7.3) rejects any option carrying extra fields. */
export interface ObjectiveRecallOption {
  readonly key: string;
  readonly label: string;
}

/**
 * The exact `Exercise.content` JSON of an objective recall QUIZ. The key SET is
 * frozen to what `parseRecallCatalogContent` accepts — `recallMode`,
 * `conceptKey`, `options`, `correctOptionKey` — and nothing else. The question
 * lives in `Exercise.title`, never here.
 */
export interface ObjectiveRecallContent {
  readonly recallMode: "objective";
  readonly conceptKey: string;
  readonly options: readonly ObjectiveRecallOption[];
  readonly correctOptionKey: string;
}

/** CATALOG_PRACTICE definition — resolved to exactly one editorial ChapterBlock
 * at ingestion time; its stored content is closed (`practiceKind` +
 * server-owned `sourceBlockKey`). */
export interface PracticeExerciseDefinition {
  readonly exerciseKey: string;
  readonly bookSlug: string;
  readonly chapterOrder: number;
  readonly order: number;
  readonly type: "REFLECTION";
  readonly title: string;
  /** The exact editorial heading whose ChapterBlock anchors the practice. */
  readonly sourceHeading: string;
  readonly practiceKind: "guided_reflection";
}

/** ACTIVE_RECALL definition — the editorially-approved objective item. */
export interface ObjectiveRecallDefinition {
  /** Equals the Guide `itemKey`; stored as the Exercise row id. */
  readonly exerciseKey: string;
  readonly bookSlug: string;
  readonly chapterOrder: number;
  readonly order: number;
  readonly type: "QUIZ";
  /** The question stem (Exercise.title). */
  readonly title: string;
  readonly content: ObjectiveRecallContent;
}

/** The pair of targets a single unit contributes to the first GuideDefinition. */
export interface UnitExerciseDefinitions {
  readonly practice: PracticeExerciseDefinition;
  readonly recall: ObjectiveRecallDefinition;
}

/**
 * Keyed by `Book.slug` → the unit-level exercise pairs. A book absent from this
 * map contributes ZERO exercise rows (the backfill simply skips it), so the
 * change is inert for every book except the ones enumerated here.
 */
export const EXERCISE_INGESTION_CATALOG: Readonly<
  Record<string, readonly UnitExerciseDefinitions[]>
> = {
  "emociones-en-construccion": [
    {
      practice: {
        exerciseKey: "eec-c1-practice-escucharte-por-dentro",
        bookSlug: "emociones-en-construccion",
        chapterOrder: 1,
        order: 1,
        type: "REFLECTION",
        title: "Una exploración emocional guiada: escucharte por dentro",
        sourceHeading:
          "🌿 Una exploración emocional guiada: escucharte por dentro",
        practiceKind: "guided_reflection",
      },
      recall: {
        exerciseKey: "eec-c1-recall-cuerpo-antes-que-mente",
        bookSlug: "emociones-en-construccion",
        chapterOrder: 1,
        order: 2,
        type: "QUIZ",
        title:
          "Según el capítulo 1, ¿cómo describe el libro la relación temporal entre la reacción del cuerpo y la comprensión consciente de una emoción?",
        content: {
          recallMode: "objective",
          conceptKey: "eec-cuerpo-antes-que-mente",
          options: [
            {
              key: "opcion-cuerpo-primero",
              label:
                "El cuerpo puede reaccionar antes de que la mente alcance a identificar o nombrar lo que está sintiendo.",
            },
            {
              key: "opcion-mente-primero",
              label:
                "La mente identifica primero la emoción y solamente después el cuerpo comienza a reaccionar.",
            },
            {
              key: "opcion-simultanea",
              label:
                "El cuerpo y la mente siempre reaccionan de manera simultánea, consciente y perfectamente coordinada.",
            },
          ],
          correctOptionKey: "opcion-cuerpo-primero",
        },
      },
    },
  ],
};
