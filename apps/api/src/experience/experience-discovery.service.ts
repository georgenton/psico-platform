/**
 * GR-6 — which published experiences present a given chapter.
 *
 * The whole service is a pass-through to the definition repository, and that
 * is the point: it is the seam the CMS will replace. When definitions move
 * from code into a database, only `ExperienceDefinitionRepository` changes —
 * this service, the controller, the client and the twelve renderers do not.
 *
 * It answers with what is PUBLISHED and nothing else. Drafts and archives stay
 * resolvable by exact version (a pinned session must keep meaning something
 * after its version is retired), but they are never offered.
 */

import { Inject, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import type { ChapterExperiencePublicView } from "@psico/types";
import { toPublicExperienceView } from "./experience-public-view";
import {
  EXPERIENCE_DEFINITION_REPOSITORY,
  type ExperienceDefinitionRepository,
} from "./experience-definition.repository";

export interface ChapterExperienceDiscoveryParams {
  bookSlug: string;
  chapterOrder: number;
}

@Injectable()
export class ExperienceDiscoveryService {
  constructor(
    @Inject(EXPERIENCE_DEFINITION_REPOSITORY)
    private readonly repository: ExperienceDefinitionRepository,
    // Lo único que hace falta de la pila de guías es una pregunta: «¿tiene
    // esta persona una sesión en este pin?». Importar GuideModule entero
    // traería el stack de comandos para responder un `findFirst`.
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Zero to many, in a declared order. An empty list is a real answer — this
   * chapter simply has no guided journey — and it is deliberately the same
   * answer a chapter with only drafts gives, because "nothing to offer you" is
   * the honest reading of both.
   */
  async listPublishedForChapter(
    params: ChapterExperienceDiscoveryParams,
  ): Promise<ChapterExperiencePublicView[]> {
    // La publicación del libro, que faltaba. El manejador recibía un slug y
    // consultaba `chapterExperienceVersion` sin tocar `Book` en ningún punto,
    // así que una obra retirada seguía entregando la copia editorial de su
    // recorrido —títulos y cuerpo de cada escena, notas, y la pregunta y las
    // etiquetas de opción de los RECALL— a cualquiera con sesión que supiera
    // el slug. Entra por «slug» en la matriz de disponibilidad.
    //
    // Honestidad sobre el alcance: hoy es LATENTE, porque la UAT del
    // 2026-10-22 midió `ChapterExperienceVersion` con cero filas. El contrato
    // se afirma en el código, no en el estado de una tabla.
    //
    // «No ofrecer» y «no existe» dan la misma respuesta: la lista vacía, que
    // ya es la respuesta honesta de un capítulo sin recorrido. No se
    // distingue una obra retirada de una sin guías.
    if (!(await this.obraOfrecida(params.bookSlug))) return [];
    const definitions = await this.repository.listPublishedForChapter(params);
    return definitions.map(toPublicExperienceView);
  }

  /**
   * Tolera la ausencia de fila: una obra que este catálogo no conoce no gana
   * aquí una exigencia que no tenía, y el repositorio responderá por ella.
   */
  private async obraOfrecida(bookSlug: string): Promise<boolean> {
    const libro = await this.prisma.book.findUnique({
      where: { slug: bookSlug },
      select: { isPublished: true },
    });
    return libro ? libro.isPublished : true;
  }

  /**
   * B3 · Prioridad B — la experiencia que una persona YA empezó, por su
   * identidad exacta, aunque el capítulo no la ofrezca.
   *
   * El descubrimiento lista lo PUBLICADO, y eso está bien: es una oferta. Pero
   * era también el único sitio del que el navegador podía sacar una
   * definición, así que retirar una de la lista dejaba sin camino a quien ya
   * tenía un recorrido ahí. Medido en B2: el registro seguía entero —la sesión
   * COMPLETED con su resumen— y la pantalla decía «No pudimos preparar tu
   * guía», porque sin definición no hay reproductor que montar.
   *
   * Lo que autoriza aquí no es el estado de publicación: es la **propiedad**.
   * El servidor comprueba que esta persona tiene una sesión en el pin EXACTO
   * de esta experiencia, y sólo entonces devuelve la definición.
   *
   * Tres cosas que esto NO es:
   *
   *   - no es una puerta trasera al descubrimiento: sin sesión propia responde
   *     exactamente lo mismo que si la experiencia no existiera;
   *   - no es un modo de leer borradores: un borrador en base no resuelve por
   *     este puerto, y uno declarado en código se rechaza aquí explícitamente;
   *   - no empieza nada. `POST /guide/sessions` sigue siendo el único camino
   *     para abrir una sesión, y sigue negando los pines retirados.
   */
  async getOwnedExact(input: {
    userId: string;
    experienceKey: string;
    experienceVersion: number;
  }): Promise<ChapterExperiencePublicView | null> {
    const definition = await this.repository.getExact({
      experienceKey: input.experienceKey,
      experienceVersion: input.experienceVersion,
    });
    if (definition === null) return null;
    // Un borrador no es un recorrido histórico. El puerto de base ya los filtra;
    // esto cubre el caso de uno declarado en código, que hoy no existe y
    // mañana podría — y sería contenido editorial sin publicar.
    if (definition.status === "DRAFT") return null;

    // La propiedad, sobre el pin exacto de ESTA experiencia. CANCELLED no
    // cuenta: el propio `findExperienceState` la lee como «no empezada», y
    // ofrecer un recorrido que alguien canceló sería desenterrarlo.
    const propia = await this.prisma.guideSession.findFirst({
      where: {
        userId: input.userId,
        guideKey: definition.guidePin.guideKey,
        guideVersion: definition.guidePin.guideVersion,
        status: { in: ["ACTIVE", "COMPLETED"] },
      },
      select: { id: true },
    });
    if (propia === null) return null;

    return toPublicExperienceView(definition);
  }
}
