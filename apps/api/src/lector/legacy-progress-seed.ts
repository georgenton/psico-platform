import type { PrismaClient } from "@prisma/client";

/**
 * CC · cuando un capítulo deja de ser espejo, su avance tiene que venirse con él.
 *
 * ── El problema, medido ────────────────────────────────────────────────────
 *
 * El lector sirve un capítulo desde las filas legadas mientras Content Core sea
 * una copia fiel, y pasa a servirlo desde Content Core en cuanto una ingesta
 * acuña un bloque sin origen legado (`publishedUnitIsLegacyMirror`). Ese cambio
 * es por diseño y no avisa a nadie.
 *
 * Pero el avance de lectura está anclado a UNA de las dos identidades: el
 * esquema declara que `ReadingSession` lleva `chapterId` **o**
 * `contentUnitId`, nunca los dos. El camino nativo busca por
 * `(userId, contentUnitId)`, así que el día del cambio no encuentra la fila
 * legada y crea una nueva **a cero**.
 *
 * Medido en staging el 2026-11-13, antes de reabrir el capítulo 1: **7
 * posiciones de lectura** en ese capítulo, las siete con `contentUnitId` nulo,
 * y una de ellas con el capítulo **terminado** — 85 %, 1 560 segundos,
 * `completedAt` puesto. Sin esto, esa persona abre el capítulo que ya acabó y
 * lo ve sin empezar.
 *
 * ── Por qué SEMBRAR y no trasladar ─────────────────────────────────────────
 *
 * La alternativa era mover la fila: poner `contentUnitId`, quitar `chapterId`.
 * Se descartó por dos razones, y la segunda es la que decide:
 *
 *   1. es una migración sobre el avance de personas reales, y necesita su
 *      inversa para poder volver atrás;
 *   2. **rompe la vuelta atrás.** Si se repunta la revisión publicada a la
 *      anterior, el lector vuelve al camino legado y busca por
 *      `(userId, chapterId)` — que el traslado habría dejado en nulo.
 *
 * Sembrar es aditivo: la fila legada **no se toca**. La nueva fila nativa nace
 * con las cifras que la persona ya tenía, y si algún día se vuelve atrás, el
 * camino legado encuentra su fila exactamente como la dejó.
 *
 * Lo que la siembra NO promete, y conviene decirlo en vez de dejarlo implícito:
 * el avance que se escriba por la vía nativa **después** del cambio vive en la
 * fila nativa. Volver atrás recupera el contenido y el avance anterior, no ese.
 *
 * ── De dónde sale el capítulo legado ───────────────────────────────────────
 *
 * No hay columna `ContentUnit.legacyChapterId`, y no se añade una: el enlace ya
 * existe en los datos. Cada `ContentBlock` que vino del backfill guarda su
 * `legacyBlockId`, y ese `ChapterBlock` sabe de qué capítulo es. Derivarlo es
 * la misma decisión que toma `publishedUnitIsLegacyMirror`: preguntarle a los
 * datos en vez de a una columna que alguien tiene que acordarse de rellenar.
 */

type Db = Pick<
  PrismaClient,
  "contentBlock" | "chapterBlock" | "readingSession"
>;

/** Lo que se copia a la fila nueva. Nada más: ni identidad, ni fechas de vista. */
export interface LegacyProgressSeed {
  progressPct: number;
  timeSpentSec: number;
  startedAt: Date;
  completedAt: Date | null;
  lastBlockId: string | null;
}

/**
 * El capítulo legado del que esta unidad es (o era) espejo, o `null`.
 *
 * `null` para una unidad nacida en Content Studio: no hubo capítulo legado
 * nunca, así que no hay avance anterior que recuperar y la fila nueva nace a
 * cero, que es lo correcto.
 */
export async function legacyChapterIdForUnit(
  db: Db,
  unitId: string,
): Promise<string | null> {
  // Basta UNO. Todos los bloques de una unidad adoptada pertenecen al mismo
  // capítulo legado, y después de una ingesta sólo los acuñados nuevos pierden
  // el origen — los demás lo conservan.
  const conOrigen = await db.contentBlock.findFirst({
    where: { unitId, legacyBlockId: { not: null } },
    select: { legacyBlockId: true },
  });
  if (conOrigen?.legacyBlockId == null) return null;
  const legado = await db.chapterBlock.findUnique({
    where: { id: conOrigen.legacyBlockId },
    select: { chapterId: true },
  });
  return legado?.chapterId ?? null;
}

/**
 * El avance que esta persona tenía en el capítulo legado de esta unidad.
 *
 * `null` cuando no hay nada que sembrar: ni capítulo legado, ni sesión suya en
 * él. Una lectura, y sólo en la primera visita nativa.
 */
export async function legacyProgressSeedFor(
  db: Db,
  input: { userId: string; unitId: string },
): Promise<LegacyProgressSeed | null> {
  const chapterId = await legacyChapterIdForUnit(db, input.unitId);
  if (chapterId === null) return null;

  const previa = await db.readingSession.findUnique({
    where: { userId_chapterId: { userId: input.userId, chapterId } },
    select: {
      progressPct: true,
      timeSpentSec: true,
      startedAt: true,
      completedAt: true,
      lastBlockId: true,
    },
  });
  if (previa === null) return null;

  return {
    progressPct: previa.progressPct,
    timeSpentSec: previa.timeSpentSec,
    startedAt: previa.startedAt,
    completedAt: previa.completedAt,
    lastBlockId: previa.lastBlockId,
  };
}

/**
 * El sitio por el que iba, dicho en el vocabulario que el camino nativo sirve.
 *
 * `ReadingSession.lastBlockId` guarda un `ChapterBlock.id`, y el camino nativo
 * direcciona cada bloque por su `blockKey` (`id: b.blockKey`). Entregar el id
 * legado tal cual dejaría al cliente buscando un bloque que no está en la
 * página, así que no encontraría dónde continuar — con el avance intacto en el
 * servidor.
 *
 * Se traduce **al proyectar**, nunca en el almacenamiento. Guardar el
 * `blockKey` dejaría al camino legado con un valor que no reconoce, y con eso
 * la vuelta atrás volvería a perder el sitio. El almacenamiento se queda en el
 * vocabulario de quien lo escribió.
 *
 * `null` cuando el bloque ya no se publica: la frase por la que iba no está en
 * esta página, y mandar un ancla que no existe es peor que no mandar ninguna.
 */
export async function nativeLastBlockRef(
  db: Db,
  input: { lastBlockId: string | null; servedBlockKeys: ReadonlySet<string> },
): Promise<string | null> {
  if (input.lastBlockId === null) return null;
  // Ya es nativo: una sesión creada por el camino nativo escribe `blockKey`.
  if (input.servedBlockKeys.has(input.lastBlockId)) return input.lastBlockId;

  const cb = await db.contentBlock.findFirst({
    where: { legacyBlockId: input.lastBlockId },
    select: { blockKey: true },
  });
  if (cb === null) return null;
  return input.servedBlockKeys.has(cb.blockKey) ? cb.blockKey : null;
}
