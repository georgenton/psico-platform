import type { PrismaClient } from "@prisma/client";

import { productionExperienceRepository } from "./experience-production-catalog";
import { resolveUnitForGuidePin } from "./experience-code-owned-identity";
import { validateExperienceDefinition } from "./experience-catalog";

/**
 * B4 / ADR 0026 — lo que hay que comprobar ANTES de archivar una definición.
 *
 * B2 midió que archivar el piloto desbloquea la preparación, y B3 cerró la
 * objeción que impedía recomendarlo: quien ya tiene un recorrido llega a él
 * por identidad exacta, aunque el capítulo deje de ofrecerlo. Quedaba una
 * condición, y se midió también: **sin su reserva de linaje, la identidad
 * histórica queda capturable.** Con la reserva, los dos intentos de captura
 * responden 409; sin ella, uno de los dos se acepta con 201.
 *
 * De ahí este procedimiento. No archiva nada — archivar es editar el catálogo
 * del build, que es un commit y una revisión, no una llamada. Lo que hace es
 * contestar, contra la base real, si archivar sería seguro, y crear la reserva
 * que falta cuando falta.
 *
 * ── Los cuatro veredictos, y por qué son cuatro ────────────────────────────
 *
 *   READY           la reserva existe y protege las dos claves. Adelante.
 *   NEEDS_RESERVATION   hay historia que proteger y no hay reserva. Archivar
 *                   ahora dejaría la identidad libre; `--apply` la crea.
 *   NOTHING_TO_PROTECT  ni sesiones ni reserva: un entorno donde esa
 *                   experiencia nunca existió. No hay nada que hacer, y
 *                   decir «falta la reserva» sería alarmar por una ausencia
 *                   que es correcta.
 *   CONFLICT        la unidad ya reserva esa clave para OTRO linaje. Eso no
 *                   se arregla aquí: es una contradicción editorial que
 *                   alguien tiene que mirar.
 *
 * ── Lo que nunca hace ──────────────────────────────────────────────────────
 *
 * Tocar sesiones, versiones o registros. Reescribir una reserva ajena. Y
 * archivar: el veredicto es una condición previa, no un permiso.
 */

export type PreArchiveVerdict =
  | "READY"
  | "NEEDS_RESERVATION"
  | "NOTHING_TO_PROTECT"
  | "CONFLICT"
  | "UNRESOLVED";

export interface PreArchiveReport {
  experienceKey: string;
  experienceVersion: number;
  guideKey: string | null;
  contentUnitId: string | null;
  /** Sesiones de CUALQUIER actor en el pin de esa guía. No se leen sus dueños. */
  sessions: number;
  reservationExists: boolean;
  /** Una reserva de esa unidad que ya usa alguna de las dos claves para otro linaje. */
  conflictingReservation: { experienceKey: string; guideKey: string } | null;
  verdict: PreArchiveVerdict;
  applied: boolean;
  detail: string;
}

/**
 * Comprueba —y opcionalmente crea— la reserva histórica de una definición.
 *
 * `apply: false` es de sólo lectura y se puede correr siempre. `apply: true`
 * escribe UNA fila de reserva, y sólo cuando el veredicto es
 * `NEEDS_RESERVATION`: nunca sobre un conflicto, nunca sobre una unidad que no
 * resuelve, y nunca cuando no hay nada que proteger.
 */
export async function preArchiveCheck(
  prisma: Pick<
    PrismaClient,
    "guideSession" | "experienceGuideReservation" | "chapterExperienceVersion"
  >,
  pin: { experienceKey: string; experienceVersion: number },
  apply = false,
): Promise<PreArchiveReport> {
  const base: PreArchiveReport = {
    experienceKey: pin.experienceKey,
    experienceVersion: pin.experienceVersion,
    guideKey: null,
    contentUnitId: null,
    sessions: 0,
    reservationExists: false,
    conflictingReservation: null,
    verdict: "UNRESOLVED",
    applied: false,
    detail: "",
  };

  // La definición, del catálogo del build o de la base, por identidad exacta.
  const enBase = await prisma.chapterExperienceVersion.findUnique({
    where: {
      experienceKey_experienceVersion: {
        experienceKey: pin.experienceKey,
        experienceVersion: pin.experienceVersion,
      },
    },
    select: { definitionJson: true, contentUnitId: true },
  });
  const delCatalogo = enBase
    ? null
    : await productionExperienceRepository.getExact(pin);
  const definicion = enBase
    ? validateExperienceDefinition(enBase.definitionJson)
    : delCatalogo;
  /**
   * ¿La identidad la envía el BUILD, o sólo existe en esta base?
   *
   * La distinción decide qué significa «no hay nada que proteger». Una fila
   * local sin sesiones es un borrador que nadie usó: su identidad no sale de
   * aquí. Una definición del catálogo del build es otra cosa — viaja en cada
   * despliegue, y puede tener sesiones en bases que esta instalación no ve.
   */
  const identidadDelBuild = delCatalogo !== null;
  if (definicion === null) {
    return { ...base, detail: "no existe una definición con esa identidad" };
  }
  base.guideKey = definicion.guidePin.guideKey;

  // La unidad: la que la fila ya nombra, o la que la guía resuelve. Nunca la
  // que sugiera el número del capítulo — ésa es la derivación por posición
  // que todo este modelo existe para evitar.
  const resuelta = enBase?.contentUnitId
    ? { unitId: enBase.contentUnitId }
    : await resolveUnitForGuidePin(prisma as never, definicion.guidePin);
  const unidad = resuelta?.unitId ?? null;
  if (!unidad) {
    return {
      ...base,
      detail: "no se pudo resolver el capítulo de esa guía en esta base",
    };
  }
  base.contentUnitId = unidad;

  base.sessions = await prisma.guideSession.count({
    where: {
      guideKey: definicion.guidePin.guideKey,
      guideVersion: definicion.guidePin.guideVersion,
    },
  });

  const reservas = await prisma.experienceGuideReservation.findMany({
    where: {
      contentUnitId: unidad,
      OR: [
        { experienceKey: pin.experienceKey },
        { guideKey: definicion.guidePin.guideKey },
      ],
    },
    select: { experienceKey: true, guideKey: true },
  });

  const propia = reservas.find(
    (r) =>
      r.experienceKey === pin.experienceKey &&
      r.guideKey === definicion.guidePin.guideKey,
  );
  if (propia) {
    return {
      ...base,
      reservationExists: true,
      verdict: "READY",
      detail: "la reserva existe y protege su clave de experiencia y su guía",
    };
  }

  const ajena = reservas[0];
  if (ajena) {
    // Una de las dos claves ya está tomada por otro linaje en esta unidad.
    // Crear la reserva fallaría contra el índice único, y «lo intenté y la
    // base dijo que no» es peor diagnóstico que nombrar la contradicción.
    return {
      ...base,
      conflictingReservation: ajena,
      verdict: "CONFLICT",
      detail:
        `la unidad ya reserva ${ajena.experienceKey}/${ajena.guideKey}, ` +
        "que comparte clave con ésta",
    };
  }

  if (base.sessions === 0 && !identidadDelBuild) {
    // Una fila local que nadie usó. Su identidad no sale de esta base, así
    // que archivarla no regala nada a nadie.
    return {
      ...base,
      verdict: "NOTHING_TO_PROTECT",
      detail:
        "ni sesiones ni reserva, y la identidad no viene del catálogo del " +
        "build: en esta base nunca existió y no sale de ella",
    };
  }

  // B5 — una identidad que el build envía NO es de esta base.
  //
  // La primera versión decía «nada que proteger» en cuanto no había sesiones
  // aquí, y eso daba por decidido en silencio que la clave quedaba libre. No
  // lo está: el ADR 0026 fija como invariante que no se puede capturar una
  // identidad histórica con un borrador nuevo, y esa invariante es sobre la
  // IDENTIDAD, no sobre los datos de una instalación. La misma clave existe
  // en cada despliegue de este build; que esta base no tenga sesiones dice
  // algo de esta base, no de la clave.
  //
  // Así que se reserva igual. Crear la reserva es barato y reversible;
  // dejar la clave suelta y descubrirlo cuando otro linaje la haya tomado,
  // no lo es.

  if (!apply) {
    return {
      ...base,
      verdict: "NEEDS_RESERVATION",
      detail: `hay ${base.sessions} sesión(es) y ninguna reserva; archivar ahora dejaría la identidad libre`,
    };
  }

  const escrito = await prisma.experienceGuideReservation.createMany({
    data: [
      {
        contentUnitId: unidad,
        experienceKey: pin.experienceKey,
        guideKey: definicion.guidePin.guideKey,
      },
    ],
    skipDuplicates: true,
  });

  // B5 — el veredicto sale de la BASE, nunca del contador.
  //
  // `skipDuplicates` salta ante CUALQUIER violación de unicidad, y aquí hay
  // dos índices en juego: `(unidad, experienceKey)` y `(unidad, guideKey)`.
  // Así que un cero puede significar dos cosas opuestas: que la reserva
  // exacta ya existía —idempotencia, correcto— o que **otro escritor tomó
  // esa guía para otro linaje** entre la lectura y la escritura. La primera
  // versión las confundía y respondía READY en las dos, que es un READY
  // falso justo en el caso que este procedimiento existe para evitar.
  //
  // La respuesta honesta es volver a mirar: lo que importa no es si esta
  // llamada escribió, sino si la reserva EXACTA está ahí.
  const confirmada = await prisma.experienceGuideReservation.findFirst({
    where: {
      contentUnitId: unidad,
      experienceKey: pin.experienceKey,
      guideKey: definicion.guidePin.guideKey,
    },
    select: { experienceKey: true },
  });
  if (confirmada) {
    return {
      ...base,
      reservationExists: true,
      verdict: "READY",
      applied: escrito.count > 0,
      detail:
        escrito.count > 0
          ? "reserva creada; las sesiones no se tocaron"
          : "ya existía —otra ejecución la creó primero—; el resultado es el mismo",
    };
  }

  // No está. Alguien se llevó una de las dos claves mientras tanto.
  const intruso = await prisma.experienceGuideReservation.findFirst({
    where: {
      contentUnitId: unidad,
      OR: [
        { experienceKey: pin.experienceKey },
        { guideKey: definicion.guidePin.guideKey },
      ],
    },
    select: { experienceKey: true, guideKey: true },
  });
  return {
    ...base,
    conflictingReservation: intruso,
    verdict: "CONFLICT",
    detail: intruso
      ? `otro escritor reservó ${intruso.experienceKey}/${intruso.guideKey} ` +
        "antes que esta ejecución; la reserva que hacía falta no existe"
      : "la reserva no quedó escrita y no hay ninguna que lo explique",
  };
}

/** El informe en líneas, para que un operador lo lea sin parsear JSON. */
export function renderPreArchive(r: PreArchiveReport): string {
  return [
    `EXPERIENCE_PRE_ARCHIVE=${r.verdict}`,
    `EXPERIENCE=${r.experienceKey}@${r.experienceVersion}`,
    `GUIDE=${r.guideKey ?? "(no resuelta)"}`,
    `CONTENT_UNIT=${r.contentUnitId ?? "(no resuelta)"}`,
    `SESSIONS=${r.sessions}`,
    `RESERVATION_EXISTS=${r.reservationExists}`,
    `RESERVATION_CREATED=${r.applied}`,
    `SESSIONS_TOUCHED=0`,
    `DETAIL=${r.detail}`,
  ].join("\n");
}
