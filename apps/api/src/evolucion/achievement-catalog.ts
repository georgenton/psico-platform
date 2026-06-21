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
  description: string;
  /** Lucide-style token. The web client maps it to an SVG icon. */
  icon: string;
  progressTarget: number;
  /** Pointer into `EvolucionStats` — drives the auto-unlock. */
  progressKey: ProgressKey;
  category: string;
}

export const ACHIEVEMENT_CATALOG: ReadonlyArray<AchievementSeed> = [
  // ── Reflexiones ─────────────────────────────────────────────────────
  {
    id: "first-reflection",
    label: "Primera reflexión",
    description: "Escribiste tu primera entrada en el diario.",
    icon: "pencil",
    progressTarget: 1,
    progressKey: "reflexiones",
    category: "reflexiones",
  },
  {
    id: "ten-reflections",
    label: "Diez reflexiones",
    description: "Diez entradas escritas. Tu voz se está haciendo presente.",
    icon: "pencil",
    progressTarget: 10,
    progressKey: "reflexiones",
    category: "reflexiones",
  },
  {
    id: "fifty-reflections",
    label: "Cincuenta reflexiones",
    description: "Cincuenta entradas. Tu archivo personal toma forma.",
    icon: "pencil",
    progressTarget: 50,
    progressKey: "reflexiones",
    category: "reflexiones",
  },
  {
    id: "hundred-reflections",
    label: "Cien reflexiones",
    description: "Tres dígitos. Pocos llegan a este número.",
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
    icon: "book",
    progressTarget: 1,
    progressKey: "capitulosCompletados",
    category: "lectura",
  },
  {
    id: "ten-chapters",
    label: "Diez capítulos",
    description: "Diez capítulos completados — un libro entero o más.",
    icon: "book",
    progressTarget: 10,
    progressKey: "capitulosCompletados",
    category: "lectura",
  },
  {
    id: "hour-of-reading",
    label: "Una hora leyendo",
    description: "60 minutos acumulados en el lector. Vas tomando ritmo.",
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
    icon: "flame",
    progressTarget: 3,
    progressKey: "rachaMasLarga",
    category: "rachas",
  },
  {
    id: "seven-day-streak",
    label: "Siete días seguidos",
    description: "Una semana completa. La constancia ya es tuya.",
    icon: "flame",
    progressTarget: 7,
    progressKey: "rachaMasLarga",
    category: "rachas",
  },
  {
    id: "thirty-day-streak",
    label: "Treinta días seguidos",
    description: "Un mes completo. Esto ya no es práctica, es identidad.",
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
    icon: "flame",
    progressTarget: 7,
    progressKey: "diasActivos30d",
    category: "presencia",
  },
  {
    id: "month-of-presence",
    label: "Mes consistente",
    description: "Veinte días activos en los últimos 30. Pocos sostienen esto.",
    icon: "flame",
    progressTarget: 20,
    progressKey: "diasActivos30d",
    category: "presencia",
  },
];
