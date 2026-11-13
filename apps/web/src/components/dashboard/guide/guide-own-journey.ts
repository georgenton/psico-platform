/**
 * B5 — ¿tiene esta persona un recorrido PROPIO en este capítulo, abrible hoy?
 *
 * Una pregunta distinta de las tres que ya había, y la que faltaba.
 *
 * `useChapterExperience` resuelve el recorrido propio **del pin que se le pasa**,
 * y el lector le pasa el pin PREDETERMINADO del capítulo. Eso cubre «el capítulo
 * no publica nada y esta persona tiene una sesión en ese mismo pin» —un pin
 * archivado sigue siendo suyo— y **no** cubre el caso de al lado: una sesión en
 * OTRO pin del mismo capítulo. El comentario de esa llamada prometía distinguir
 * «este capítulo no publica nada» de «no publica nada Y esta persona tiene un
 * recorrido propio aquí»; cumplía la promesa sólo para un pin de los cinco.
 *
 * Qué pasaba, medido: la tarjeta del recorrido ofrece «Continuar» porque su
 * veredicto sale del libro mayor del guía, que no depende del CMS; al pulsarla,
 * `openRouteGuide` abre el panel y el efecto que vigila la pestaña lo **cierra en
 * el mismo commit**, porque la oferta valía `none` y la pestaña estaba oculta.
 * Un clic sin consecuencia sobre el avance propio de alguien.
 *
 * ── Lo que esto NO es ──────────────────────────────────────────────────────
 *
 * **No es una selección del cliente.** Lo que se lee aquí son los estados que el
 * servidor devolvió por pin exacto, en la respuesta del lote: `status` sale del
 * ledger, `applicability` la decide el servidor resolviendo unidad y objetivo
 * editorial a identidades internas, y `presentation` dice si hay definición que
 * reproducir. Que el lector haya tocado una tarjeta no prueba nada por sí solo,
 * y por eso no entra en este predicado: la prueba es la respuesta del servidor.
 *
 * **No es permiso para empezar.** Pide `CONTINUE` o `COMPLETED` —una sesión que
 * ya existe—, así que nunca convierte un `START` en una puerta. Quien no tenga
 * recorrido propio no recibe pestaña, que es el control contrario.
 */

import type {
  GuideApplicability,
  GuideCardPresentation,
  GuideExperienceCardStatus,
} from "@psico/types";

/**
 * Lo que hace falta saber de UN pin, y nada más.
 *
 * Deliberadamente más laxo que `GuideExperienceCardState`: `applicability` y
 * `presentation` llegan opcionales porque una respuesta legada no los trae, y la
 * ausencia de una respuesta **no** es un sí.
 */
export interface OwnJourneyFacts {
  status: GuideExperienceCardStatus;
  applicability?: GuideApplicability | null;
  presentation?: GuideCardPresentation | null;
}

/**
 * Las tres condiciones, y son las MISMAS tres que `openRouteGuide` exige antes
 * de abrir algo. Deliberadamente: si la pestaña apareciera con un criterio más
 * laxo que el de la apertura, volveríamos a ofrecer una puerta que el clic
 * rechaza — que es el defecto que la oferta vino a quitar.
 */
function esRecorridoPropioAbrible(f: OwnJourneyFacts): boolean {
  // 1 · Existe una sesión de esta persona. `START` no lo es.
  if (f.status !== "CONTINUE" && f.status !== "COMPLETED") return false;
  // 2 · El servidor admite ese pin en el capítulo que está en pantalla.
  //     Cualquier cosa que no sea exactamente «APPLIES» —incluida la ausencia
  //     de respuesta— se lee como «no podemos saberlo», no como un sí.
  if (f.applicability !== "APPLIES") return false;
  // 3 · Hay definición que reproducir. `PREPARING` es el caso de las cinco
  //     microguías antes de publicarse: estado real, nada que pintar.
  //     Un pin SIN `presentation` se comporta como antes de que ese campo
  //     existiera, que es lo que conserva el repaso de una versión histórica.
  if (f.presentation === "PREPARING") return false;
  return true;
}

/**
 * ¿Alguno de los pines que el servidor contestó es un recorrido propio abrible?
 *
 * Toma un iterable y no el mapa entero para que la prueba no tenga que construir
 * la autoridad: lo que decide es la forma de cada estado, no de dónde salió.
 */
export function hasOwnOpenableJourney(
  states: Iterable<OwnJourneyFacts>,
): boolean {
  for (const s of states) if (esRecorridoPropioAbrible(s)) return true;
  return false;
}
