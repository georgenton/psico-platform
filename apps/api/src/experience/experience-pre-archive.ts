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
  const definicion = enBase
    ? validateExperienceDefinition(enBase.definitionJson)
    : await productionExperienceRepository.getExact(pin);
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

  if (base.sessions === 0) {
    return {
      ...base,
      verdict: "NOTHING_TO_PROTECT",
      detail:
        "ni sesiones ni reserva: en esta base esa experiencia nunca existió",
    };
  }

  if (!apply) {
    return {
      ...base,
      verdict: "NEEDS_RESERVATION",
      detail: `hay ${base.sessions} sesión(es) y ninguna reserva; archivar ahora dejaría la identidad libre`,
    };
  }

  // Idempotente por el índice único: dos ejecuciones simultáneas no crean dos
  // filas, y la segunda no se cae — `createMany` con `skipDuplicates` deja que
  // gane la primera y la otra se encuentra el trabajo hecho.
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

  return {
    ...base,
    reservationExists: true,
    verdict: "READY",
    applied: escrito.count > 0,
    detail:
      escrito.count > 0
        ? "reserva creada; las sesiones no se tocaron"
        : "otra ejecución la creó primero; el resultado es el mismo",
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
