/**
 * ACHIEVEMENT_CATALOG — Sprint E2.
 *
 * Source of truth for the Achievement table content. The seed upserts these
 * rows so a fresh DB has the catalog populated; the EvolucionService maps
 * each `id` to a `progressKey` that points at the matching stat in
 * `EvolucionStats`, so unlocking is automatic — no event bus, no hooks.
 *
 * To add a new achievement:
 *   1. Push a new entry below (stable id, ascending order keeps ordering
 *      deterministic).
 *   2. Make sure `progressKey` is one of the EvolucionStats keys, and
 *      `progressTarget` is the threshold to flip `unlockedAt`.
 *   3. Re-run the seed (`pnpm prisma:seed`). Existing users' progress will
 *      auto-update the next time they open /api/evolucion.
 *
 * `pendingDescription` is NOT seeded and needs no re-seed: it lives in code and
 * is resolved per response by `describeMilestone`. The `Achievement` table only
 * ever held one sentence, written for the day it is earned, so someone who had
 * not written anything read «Escribiste tu primera entrada en el diario.».
 */

export type ProgressKey =
  | "reflexiones"
  | "capitulosCompletados"
  | "minutosLectura"
  | "rachaActual"
  | "rachaMasLarga"
  | "diasActivos30d";

export interface AchievementSeed {
  id: string;
  label: string;
  /** Lo que se lee cuando YA se consiguió. Es la que se siembra. */
  description: string;
  /**
   * Lo que se lee mientras falta: qué hacer, en presente y sin darlo por hecho.
   *
   * Dice lo que el contador MIDE, no lo que suena bien. «Presencia» cuenta días
   * con una entrada en el diario, así que pide escribir y no «aparecer». Y los
   * días seguidos todavía no los cuenta nadie —`User.longestStreakDays` se lee
   * y no se escribe en ningún sitio—, así que esos tres lo dicen en vez de
   * invitar a algo que no se puede completar.
   */
  pendingDescription: string;
  /** Lucide-style token. The web client maps it to an SVG icon. */
  icon: string;
  progressTarget: number;
  /** Pointer into `EvolucionStats` — drives the auto-unlock. */
  progressKey: ProgressKey;
  category: string;
}

/**
 * Días seguidos: el contador existe en la base y nadie lo escribe.
 *
 * El día que algo lo escriba, esta constante sobra y los tres hitos pueden
 * invitar como los demás. `achievement-catalog.spec.ts` avisa cuando pase.
 */
export const STREAKS_NOT_COUNTED_YET =
  "Todavía no llevamos la cuenta de los días seguidos.";

export const ACHIEVEMENT_CATALOG: ReadonlyArray<AchievementSeed> = [
  // ── Reflexiones ─────────────────────────────────────────────────────
  {
    id: "first-reflection",
    label: "Primera reflexión",
    description: "Escribiste tu primera entrada en el diario.",
    pendingDescription: "Escribe tu primera entrada en el diario.",
    icon: "pencil",
    progressTarget: 1,
    progressKey: "reflexiones",
    category: "reflexiones",
  },
  {
    id: "ten-reflections",
    label: "Diez reflexiones",
    description: "Diez entradas escritas. Tu voz se está haciendo presente.",
    pendingDescription: "Llega a diez entradas en el diario.",
    icon: "pencil",
    progressTarget: 10,
    progressKey: "reflexiones",
    category: "reflexiones",
  },
  {
    id: "fifty-reflections",
    label: "Cincuenta reflexiones",
    description: "Cincuenta entradas. Tu archivo personal toma forma.",
    pendingDescription: "Llega a cincuenta entradas en el diario.",
    icon: "pencil",
    progressTarget: 50,
    progressKey: "reflexiones",
    category: "reflexiones",
  },
  {
    id: "hundred-reflections",
    label: "Cien reflexiones",
    description: "Tres dígitos. Pocos llegan a este número.",
    pendingDescription: "Llega a cien entradas en el diario.",
    icon: "pencil",
    progressTarget: 100,
    progressKey: "reflexiones",
    category: "reflexiones",
  },
  // ── Lectura ─────────────────────────────────────────────────────────
  {
    id: "first-chapter",
    label: "Primer capítulo",
    description: "Terminaste tu primer capítulo. Inicio del recorrido.",
    pendingDescription: "Termina tu primer capítulo.",
    icon: "book",
    progressTarget: 1,
    progressKey: "capitulosCompletados",
    category: "lectura",
  },
  {
    id: "ten-chapters",
    label: "Diez capítulos",
    description: "Diez capítulos completados — un libro entero o más.",
    pendingDescription: "Termina diez capítulos.",
    icon: "book",
    progressTarget: 10,
    progressKey: "capitulosCompletados",
    category: "lectura",
  },
  {
    id: "hour-of-reading",
    label: "Una hora leyendo",
    description: "60 minutos acumulados en el lector. Vas tomando ritmo.",
    pendingDescription: "Suma 60 minutos de lectura.",
    icon: "book",
    progressTarget: 60,
    progressKey: "minutosLectura",
    category: "lectura",
  },
  // ── Rachas ──────────────────────────────────────────────────────────
  {
    id: "three-day-streak",
    label: "Tres días seguidos",
    description: "Apareciste tres días en fila. El hábito se está armando.",
    pendingDescription: STREAKS_NOT_COUNTED_YET,
    icon: "flame",
    progressTarget: 3,
    progressKey: "rachaMasLarga",
    category: "rachas",
  },
  {
    id: "seven-day-streak",
    label: "Siete días seguidos",
    description: "Una semana completa. La constancia ya es tuya.",
    pendingDescription: STREAKS_NOT_COUNTED_YET,
    icon: "flame",
    progressTarget: 7,
    progressKey: "rachaMasLarga",
    category: "rachas",
  },
  {
    id: "thirty-day-streak",
    label: "Treinta días seguidos",
    description: "Un mes completo. Esto ya no es práctica, es identidad.",
    pendingDescription: STREAKS_NOT_COUNTED_YET,
    icon: "flame",
    progressTarget: 30,
    progressKey: "rachaMasLarga",
    category: "rachas",
  },
  // ── Presencia ───────────────────────────────────────────────────────
  {
    id: "week-of-presence",
    label: "Una semana presente",
    description: "Siete días activos en los últimos 30. Vas mostrándote.",
    pendingDescription:
      "Escribe en tu diario en siete días distintos de los últimos 30.",
    icon: "flame",
    progressTarget: 7,
    progressKey: "diasActivos30d",
    category: "presencia",
  },
  {
    id: "month-of-presence",
    label: "Mes consistente",
    description: "Veinte días activos en los últimos 30. Pocos sostienen esto.",
    pendingDescription:
      "Escribe en tu diario en veinte días distintos de los últimos 30.",
    icon: "flame",
    progressTarget: 20,
    progressKey: "diasActivos30d",
    category: "presencia",
  },
];

const CATALOG_BY_ID = new Map(ACHIEVEMENT_CATALOG.map((a) => [a.id, a]));

/**
 * La frase de un hito según si ya se consiguió.
 *
 * `stored` es la descripción sembrada en `Achievement`. Conseguido, es la que
 * manda —es la que siempre se ha leído—; pendiente, la de código. Un hito que
 * la base tenga y el catálogo no, conserva su texto: no hay otro que decir.
 */
export function describeMilestone(
  id: string,
  stored: string,
  unlockedAt: Date | string | null,
): string {
  if (unlockedAt) return stored;
  return CATALOG_BY_ID.get(id)?.pendingDescription ?? stored;
}
