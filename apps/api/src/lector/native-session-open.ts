import type { PrismaClient, ReadingSession } from "@prisma/client";
import { legacyProgressSeedFor } from "./legacy-progress-seed";

/**
 * Abrir la sesión de lectura nativa de una unidad, sin pisar a quien escriba a
 * la vez.
 *
 * ── Lo que esto arregla ────────────────────────────────────────────────────
 *
 * La siembra del corte (`legacy-progress-seed.ts`) decide si escribir mirando
 * si la fila está **en blanco**, y entre esa lectura y la escritura hay tres
 * consultas más —derivar el capítulo legado y leer su sesión—. La versión
 * anterior cerraba esa ventana con un `update` condicionado **sólo por id**, y
 * creaba la fila con `findUnique` + `create`. Dos defectos de la misma familia,
 * los dos reproducidos antes de arreglarlos:
 *
 *   1. **Lo escrito durante la inicialización se perdía.** Un latido o un
 *      «capítulo terminado» que llegara mientras se buscaba la semilla quedaba
 *      sustituido después por las cifras legadas.
 *   2. **Una de dos primeras aperturas fallaba.** Las dos leen «no existe», las
 *      dos intentan crear, y la segunda tropieza con la unicidad
 *      `(userId, contentUnitId)` — P2002. La fila seguía siendo una, pero a esa
 *      persona se le caía el capítulo.
 *
 * ── Por qué una condición sobre los datos y no un cerrojo ──────────────────
 *
 * Un cerrojo que los escritores no tomen no protege nada, y los escritores
 * reales —`nativeHeartbeat` y `completeNativeChapter`— son `upsert`s sueltos que
 * nadie va a reescribir para pedir permiso. Así que la protección va donde
 * ellos sí pasan: **la fila**.
 *
 *   - La creación se resuelve en la base, con `upsert` sobre la clave única. Su
 *     rama de conflicto **no siembra**: quien ganó pudo ser un latido con
 *     avance de verdad, y sembrar encima sería el defecto 1 por otra puerta.
 *     Es además la misma forma que ya usa el camino legado al abrir un capítulo
 *     (`update: { lastSeenAt }`), de modo que los dos caminos abren igual.
 *   - La siembra va con **comparar-y-fijar**: escribe sólo mientras la fila
 *     siga en blanco. Y «en blanco» no es una convención nuestra que haya que
 *     recordar: cualquier escritura con contenido —progreso, tiempo, posición o
 *     completado— la rompe por definición, porque esas son exactamente las
 *     cuatro columnas que los dos escritores tocan.
 *
 * Si alguien ganó la carrera, no se escribe y **se devuelve el estado actual**,
 * que es lo que esa persona tiene que ver.
 *
 * ── Lo que esto NO promete ─────────────────────────────────────────────────
 *
 * El latido **lee y luego escribe**, y lo hace sobre DOS columnas:
 *
 *   - `timeSpentSec = existente + delta`, que es una suma sobre lo leído;
 *   - `progressPct = max(existente, enviado)`, que es un máximo sobre lo leído.
 *
 * Si lee la fila en blanco y escribe después de que la siembra haya puesto las
 * cifras legadas, el latido gana en las dos: el tiempo se recalcula desde 0 y
 * el máximo se toma contra 0, así que **puede sustituir tanto el tiempo como
 * el porcentaje sembrados**. La **actividad** se conserva, que es el
 * invariante; lo que queda tapado es el avance legado.
 *
 * La fila legada sigue intacta y ninguna apertura posterior vuelve a sembrar,
 * porque la fila ya registra. Queda como **deuda separada**, y con su alcance
 * dicho: un incremento atómico **sólo del tiempo** no la cerraría — el máximo
 * del porcentaje tiene el mismo problema y necesita su propia escritura
 * condicionada. No se observó esta pérdida en staging.
 */

type Db = Pick<
  PrismaClient,
  "contentBlock" | "chapterBlock" | "readingSession"
>;

/**
 * Puntos de control para las regresiones de concurrencia, y **sólo** para
 * ellas: producción llama a esta función sin tercer argumento.
 *
 * Existen porque la intercalación que hay que demostrar es de milisegundos y
 * una carrera que «casi siempre» falla no es una regresión. Mismo criterio que
 * el `nowIso` de los trabajos programados: una costura declarada, inerte
 * cuando nadie la pasa.
 */
export interface OpenNativeSessionSeams {
  /** Después de leer la fila, antes de decidir qué hacer con ella. */
  afterRead?: () => Promise<void>;
  /** Después de resolver la semilla legada, antes de escribir. */
  beforeWrite?: () => Promise<void>;
}

/**
 * Las cuatro columnas que definen «esta fila no registra nada todavía».
 *
 * Una sola declaración, usada como predicado en memoria y como cláusula del
 * comparar-y-fijar. Separarlas sería invitar a que una de las dos se quede
 * atrás.
 */
const EN_BLANCO = {
  progressPct: 0,
  timeSpentSec: 0,
  completedAt: null,
  lastBlockId: null,
} as const;

function estaEnBlanco(fila: {
  progressPct: number;
  timeSpentSec: number;
  completedAt: Date | null;
  lastBlockId: string | null;
}): boolean {
  return (
    fila.progressPct === EN_BLANCO.progressPct &&
    fila.timeSpentSec === EN_BLANCO.timeSpentSec &&
    fila.completedAt === EN_BLANCO.completedAt &&
    fila.lastBlockId === EN_BLANCO.lastBlockId
  );
}

export async function openNativeReadingSession(
  db: Db,
  input: { userId: string; contentUnitId: string },
  seams: OpenNativeSessionSeams = {},
): Promise<ReadingSession> {
  const { userId, contentUnitId } = input;
  const clave = { userId_contentUnitId: { userId, contentUnitId } };

  const existente = await db.readingSession.findUnique({ where: clave });
  await seams.afterRead?.();

  // Una fila nativa que NUNCA ha registrado nada no es prueba de que esta
  // persona no tenga avance: es lo que deja una visita en el hueco entre el
  // corte y el despliegue de esta siembra. Y la pérdida sería de ida: creada la
  // fila, una siembra que sólo mirara «¿existe?» no volvería a mirar.
  //
  // Así que la condición es «fila en blanco», no «fila ausente». Es idempotente
  // —sembrar dos veces escribe lo mismo— y deja de aplicar en cuanto la persona
  // lee algo.
  if (existente !== null && !estaEnBlanco(existente)) {
    // Same truthful-recency refresh as the legacy reader, and the same
    // restraint: only `lastSeenAt`.
    return db.readingSession.update({
      where: { id: existente.id },
      data: { lastSeenAt: new Date() },
    });
  }

  const semilla = await legacyProgressSeedFor(db, {
    userId,
    unitId: contentUnitId,
  });
  await seams.beforeWrite?.();

  if (existente === null) {
    // Primera apertura. Dos a la vez leen «no existe» y las dos llegan aquí: el
    // `upsert` por la clave única lo resuelve en la base, así que ninguna de las
    // dos se cae. La rama de conflicto sólo refresca la última vista.
    return db.readingSession.upsert({
      where: clave,
      create: {
        userId,
        contentUnitId,
        lastSeenAt: new Date(),
        ...(semilla ?? {}),
      },
      update: { lastSeenAt: new Date() },
    });
  }

  if (semilla === null) {
    // Fila en blanco y nada que sembrar: se queda como estaba.
    return db.readingSession.update({
      where: { id: existente.id },
      data: { lastSeenAt: new Date() },
    });
  }

  // Comparar-y-fijar: la semilla entra sólo si la fila SIGUE en blanco.
  await db.readingSession.updateMany({
    where: { id: existente.id, ...EN_BLANCO },
    data: { lastSeenAt: new Date(), ...semilla },
  });

  // El recuento no decide nada a propósito. Con 1, la siembra entró; con 0,
  // alguien escribió durante la inicialización. En los dos casos lo que hay que
  // devolver es lo que la fila dice AHORA — y releerla también cubre el latido
  // que llegue después del comparar-y-fijar.
  const actual = await db.readingSession.findUnique({ where: clave });
  if (actual !== null) return actual;

  // La fila desapareció entre medias. Hoy nadie borra una `ReadingSession`; si
  // algún día alguien lo hace, abrir el capítulo no debe reventar por eso.
  return db.readingSession.upsert({
    where: clave,
    create: {
      userId,
      contentUnitId,
      lastSeenAt: new Date(),
      ...semilla,
    },
    update: { lastSeenAt: new Date() },
  });
}
