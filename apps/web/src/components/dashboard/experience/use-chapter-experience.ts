"use client";

/**
 * GR-6 — asking the server which journey presents this chapter.
 *
 * This hook is the reason the browser no longer ships a catalog. An earlier
 * draft imported the production definitions from `@psico/types`, which read as
 * a tidy "one source of truth" and was in fact the wrong boundary: a
 * definition compiled into the bundle cannot change when a CMS publishes, so
 * every editorial edit would have been a deploy and a stale client could keep
 * rendering a journey the server had already replaced.
 *
 * So the definitions come over the wire, at their exact immutable versions,
 * and this hook is the whole of the client's involvement.
 *
 * It fails closed in both directions: while the answer is unknown there is no
 * definition to render, and an answer that names no journey for this guide is
 * `null` rather than somebody else's journey.
 */

import { useEffect, useState } from "react";
import {
  ApiError,
  EXPERIENCE_DISCOVERY_PARAMS_INVALID,
  experienceApi,
} from "@psico/api-client";
import type { ChapterExperiencePublicView } from "@psico/types";
import type { GuidePin } from "../guide/guide-pin";

export type ChapterExperienceStatus = "loading" | "ready" | "error";

export interface ChapterExperienceResult {
  status: ChapterExperienceStatus;
  /** The single published experience pinned to `pin`, or `null`. */
  definition: ChapterExperiencePublicView | null;
  /**
   * GR-7 — everything discovery published for this chapter, in the server's
   * order. Chapter Home lists these; the player takes one of them.
   *
   * Same read, same request. A second hook for "the list" would have meant a
   * second request for an answer this one already holds, and two places to
   * change when the route does.
   */
  items: readonly ChapterExperiencePublicView[];
  /**
   * Whether the SECOND read — the own-journey lookup by exact pin — failed for
   * a reason that is not «you have no session there».
   *
   * It exists because `definition === null` was being read as a fact about the
   * catalog, and after a swallowed transport failure it is not one. A 404 from
   * that lookup IS the normal answer and leaves this false; anything else
   * leaves it true, and the caller must not turn it into certainty of absence.
   */
  ownedLookupFailed: boolean;
}

/**
 * The published experience whose `guidePin` matches, or `null`.
 *
 * Exported for tests and reused by the hook. Two published experiences pinned
 * to the same guide is ambiguous rather than a tie to break, so it also
 * answers `null`: picking one would hide a catalog mistake.
 */
export function selectExperienceForGuidePin(
  items: readonly ChapterExperiencePublicView[],
  pin: GuidePin,
): ChapterExperiencePublicView | null {
  // No status check: the route serves PUBLISHED and nothing else, so
  // re-filtering here would be the client second-guessing a promise it cannot
  // verify anyway.
  const matches = items.filter(
    (d) =>
      d.guidePin.guideKey === pin.guideKey &&
      d.guidePin.guideVersion === pin.guideVersion,
  );
  return matches.length === 1
    ? (matches[0] as ChapterExperiencePublicView)
    : null;
}

/**
 * B3 — pregunta por un recorrido propio cuyo pin la oferta no lista.
 *
 * Silenciosa ante un 404 a propósito: ésa es la respuesta normal —no hay sesión
 * de esta persona en ese pin— y convertirla en un error de pantalla haría que
 * «este capítulo no tiene este recorrido» se leyera como una avería.
 *
 * **Y sólo ante un 404.** Antes atrapaba todo con un `catch` desnudo, de modo
 * que una caída de red, un token caducado o un 500 devolvían exactamente lo
 * mismo que «no tienes nada aquí» — y el panel acababa afirmando una decisión
 * editorial a partir de una consulta que no llegó a contestar. Un fallo que no
 * es 404 se declara, y quien llame decide; lo que no puede es dar una ausencia
 * por cierta.
 *
 * El `experienceKey` se deriva del `guideKey` porque hoy el pin de guía y la
 * identidad de la experiencia coinciden en todo lo que el build publica. Si
 * algún día dejan de coincidir, esto devolverá 404 y la pantalla dirá lo que
 * decía antes — se degrada a lo anterior, no a algo peor.
 */
async function resolveOwned(
  guideKey: string,
  guideVersion: number,
): Promise<{ view: ChapterExperiencePublicView | null; failed: boolean }> {
  try {
    const propia = await experienceApi.getOwnByPin({
      experienceKey: guideKey,
      experienceVersion: guideVersion,
    });
    const vista = propia?.experience ?? null;
    // Y aun así se comprueba el pin: pedir por identidad y creerse lo que
    // vuelva sin mirar sería aceptar el recorrido de otra guía.
    const propio =
      vista &&
      vista.guidePin.guideKey === guideKey &&
      vista.guidePin.guideVersion === guideVersion
        ? vista
        : null;
    return { view: propio, failed: false };
  } catch (err) {
    // 404 = «no hay sesión tuya en ese pin», que es un hecho y no una avería.
    // 400 = el servidor rechazó la forma del pin, que tampoco deja nada que
    // abrir. Los dos son respuestas; cualquier otra cosa es una pregunta sin
    // contestar — red caída, 401 por sesión caducada, 5xx — y se declara.
    if (err instanceof ApiError)
      return {
        view: null,
        failed: err.statusCode !== 404 && err.statusCode !== 400,
      };
    // El cliente rechaza localmente un pin mal formado, sin salir a la red.
    // Es un hecho sobre el pin, no una avería: se trata como el 400 de arriba.
    if (
      err instanceof Error &&
      err.message === EXPERIENCE_DISCOVERY_PARAMS_INVALID
    )
      return { view: null, failed: false };
    return { view: null, failed: true };
  }
}

export function useChapterExperience(input: {
  bookSlug: string;
  chapterOrder: number;
  /** `null` when the caller wants the chapter's list rather than one journey. */
  pin: GuidePin | null;
  /** Only ask once the reader is actually looking at a guided surface. */
  enabled?: boolean;
  /**
   * Cambiar este valor vuelve a preguntar.
   *
   * Hace falta porque la respuesta ya no se pide sólo al entrar en la portada
   * del capítulo: la pestaña guiada también necesita saber si hay algo que
   * ofrecer, y eso se pregunta en la superficie de lectura. Antes el
   * `enabled: surface === "home"` servía de dos cosas a la vez —cuándo
   * preguntar y cuándo volver a preguntar— y al dejar la lectura encendida se
   * perdió la segunda: el catálogo podía haber cambiado mientras la persona
   * leía y la lista seguía mostrando lo de antes.
   */
  reloadKey?: string | number;
}): ChapterExperienceResult {
  const { bookSlug, chapterOrder, enabled = true, reloadKey = 0 } = input;
  // `pin: null` is Chapter Home asking: it wants the list and has no single
  // journey in mind, so `definition` stays null and only `items` is read.
  const guideKey = input.pin?.guideKey ?? null;
  const guideVersion = input.pin?.guideVersion ?? null;
  const [state, setState] = useState<ChapterExperienceResult>({
    status: "loading",
    definition: null,
    items: [],
    ownedLookupFailed: false,
  });

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await experienceApi.listPublishedForChapter({
          bookSlug,
          chapterOrder,
        });
        if (cancelled) return;
        const items = Array.isArray(res.items) ? res.items : [];
        let definition =
          guideKey !== null && guideVersion !== null
            ? selectExperienceForGuidePin(items, { guideKey, guideVersion })
            : null;

        // B3 — el capítulo no la ofrece, pero quizá ya es de esta persona.
        //
        // El descubrimiento lista lo publicado, que es una oferta. Un
        // recorrido retirado deja de estar en esa lista y, hasta ahora, eso
        // dejaba al reproductor sin nada que montar: quien tenía una sesión
        // ahí veía «No pudimos preparar tu guía» con su avance intacto en el
        // servidor. Si el pin pedido no está en la oferta, se pregunta por él
        // con su identidad exacta; el servidor contesta sólo si la sesión es
        // de quien pregunta, y 404 en cualquier otro caso.
        //
        // Sólo cuando hay un pin concreto que buscar: la portada del capítulo
        // pide la LISTA y no tiene a quién preguntarle esto.
        let ownedLookupFailed = false;
        if (definition === null && guideKey !== null && guideVersion !== null) {
          const propio = await resolveOwned(guideKey, guideVersion);
          if (cancelled) return;
          definition = propio.view;
          ownedLookupFailed = propio.failed;
        }

        setState({
          status: "ready",
          definition,
          // Fail closed on a shape that is not a list: no experiences is a
          // state this product handles, an undefined one is not.
          items,
          ownedLookupFailed,
        });
      } catch {
        // A failed read is not a definition — and it is not an absence either.
        //
        // This used to say the caller «renders the same fail-closed surface it
        // renders for "no journey here", because from the reader's side those
        // are the same fact: nothing to open». That was true while there was
        // ONE message. It stopped being true the moment the panel learned to
        // say «este capítulo todavía no tiene recorrido guiado publicado»,
        // which attributes an editorial decision to a request that never
        // answered. `status: "error"` is the caller's cue to explain a failure.
        if (!cancelled)
          setState({
            status: "error",
            definition: null,
            items: [],
            ownedLookupFailed: false,
          });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, bookSlug, chapterOrder, guideKey, guideVersion, reloadKey]);

  return state;
}
