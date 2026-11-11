/**
 * Un catálogo embarcado con UNA definición publicada, para las pruebas.
 *
 * ── Por qué existe ─────────────────────────────────────────────────────────
 *
 * Cuatro invariantes del puente de vinculación necesitan que exista una
 * definición **embarcada y publicada** que reserve una guía:
 *
 *   1. que una definición embarcada se ubique por los objetivos de su guía y
 *      no por el número del capítulo, y que SIGA a la unidad cuando el número
 *      se mueve;
 *   2. que la lista del CMS dé UNA instantánea cuando una reordenación aterriza
 *      a mitad de la lectura;
 *   3. que una fila legada no pueda tomar una guía que una definición embarcada
 *      ya tiene (`CODE_OWNED_GUIDE_COLLISION`);
 *   4. que esa guía se ofrezca como `RESERVED_BY_ANOTHER_EXPERIENCE`.
 *
 * Las cuatro usaban el piloto de EEC **del catálogo de producción** como el
 * ejemplo de esa reserva. Eso las ataba a una decisión editorial: el día que
 * ese piloto se archive —que es justamente lo que propone el candidato— las
 * cuatro dejan de ejercitar su invariante y pasan a comprobar cero, sin que
 * nada en el código del puente haya cambiado.
 *
 * Una prueba que se vuelve vacua con una decisión de catálogo no estaba
 * midiendo el puente: estaba midiendo el catálogo. Así que el caso publicado
 * se declara **aquí**, y el invariante se sostiene con independencia de lo que
 * el build decida publicar mañana.
 *
 * ── Qué NO es ──────────────────────────────────────────────────────────────
 *
 * No es un doble ni un stub. La definición es la real, su `guidePin` es el
 * real, y `guideFor` es el resolutor de producción: los objetivos se resuelven
 * con las mismas tablas, las mismas consultas y los mismos modos de fallo.
 * Lo único que se declara aquí es **qué publica este catálogo**, que es
 * precisamente la variable que no debe venir de una decisión editorial.
 *
 * Y no sustituye a la comprobación del efecto del archivado: que un piloto
 * archivado deje de ofrecerse y de reservar es un hecho sobre el catálogo de
 * PRODUCCIÓN, y se comprueba aparte, contra él.
 */

import type { ChapterExperienceDefinition } from "@psico/types";

import {
  productionCodeOwnedCatalog,
  type CodeOwnedCatalog,
  type CodeOwnedClaimResolver,
  codeOwnedClaimsForUnit,
} from "./experience-code-owned-identity";
import { EEC_C1_EXPERIENCE } from "./experience-production-catalog";

/**
 * El piloto de EEC, publicado — cualquiera que sea su estado en el build.
 *
 * Se parte de la definición real para que su `guidePin`, sus escenas y sus
 * ataduras sean las de producción; sólo el `status` se fija, porque es el dato
 * que la prueba necesita declarar en vez de heredar.
 */
export const PILOTO_PUBLICADO_PARA_PRUEBAS: ChapterExperienceDefinition = {
  ...EEC_C1_EXPERIENCE,
  status: "PUBLISHED",
};

/**
 * El catálogo que esas cuatro pruebas usan.
 *
 * `guideFor` delega en el de producción a propósito: el registro de guías no es
 * lo que se está sustituyendo, y un `guideFor` propio convertiría un fallo de
 * resolución real en un falso verde.
 */
export const CATALOGO_CON_PILOTO_PUBLICADO: CodeOwnedCatalog = {
  definitions: [PILOTO_PUBLICADO_PARA_PRUEBAS],
  guideFor: productionCodeOwnedCatalog.guideFor,
};

/** El resolutor de reclamaciones sobre ese catálogo, para inyectar al servicio. */
export const reclamacionesConPilotoPublicado: CodeOwnedClaimResolver = (
  db,
  contentUnitId,
) => codeOwnedClaimsForUnit(db, contentUnitId, CATALOGO_CON_PILOTO_PUBLICADO);
