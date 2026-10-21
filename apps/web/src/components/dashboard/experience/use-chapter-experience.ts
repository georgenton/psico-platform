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
import { experienceApi } from "@psico/api-client";
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
 * Silenciosa a propósito: un 404 aquí es la respuesta normal —no hay sesión de
 * esta persona en ese pin— y convertirlo en un error de pantalla haría que
 * «este capítulo no tiene este recorrido» se leyera como una avería.
 *
 * El `experienceKey` se deriva del `guideKey` porque hoy el pin de guía y la
 * identidad de la experiencia coinciden en todo lo que el build publica. Si
 * algún día dejan de coincidir, esto devolverá 404 y la pantalla dirá lo que
 * decía antes — se degrada a lo anterior, no a algo peor.
 */
async function resolveOwned(
  guideKey: string,
  guideVersion: number,
): Promise<ChapterExperiencePublicView | null> {
  try {
    const propia = await experienceApi.getOwnByPin({
      experienceKey: guideKey,
      experienceVersion: guideVersion,
    });
    const vista = propia?.experience ?? null;
    // Y aun así se comprueba el pin: pedir por identidad y creerse lo que
    // vuelva sin mirar sería aceptar el recorrido de otra guía.
    return vista &&
      vista.guidePin.guideKey === guideKey &&
      vista.guidePin.guideVersion === guideVersion
      ? vista
      : null;
  } catch {
    return null;
  }
}

export function useChapterExperience(input: {
  bookSlug: string;
  chapterOrder: number;
  /** `null` when the caller wants the chapter's list rather than one journey. */
  pin: GuidePin | null;
  /** Only ask once the reader is actually looking at a guided surface. */
  enabled?: boolean;
}): ChapterExperienceResult {
  const { bookSlug, chapterOrder, enabled = true } = input;
  // `pin: null` is Chapter Home asking: it wants the list and has no single
  // journey in mind, so `definition` stays null and only `items` is read.
  const guideKey = input.pin?.guideKey ?? null;
  const guideVersion = input.pin?.guideVersion ?? null;
  const [state, setState] = useState<ChapterExperienceResult>({
    status: "loading",
    definition: null,
    items: [],
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
        if (definition === null && guideKey !== null && guideVersion !== null) {
          definition = await resolveOwned(guideKey, guideVersion);
          if (cancelled) return;
        }

        setState({
          status: "ready",
          definition,
          // Fail closed on a shape that is not a list: no experiences is a
          // state this product handles, an undefined one is not.
          items,
        });
      } catch {
        // A failed read is not a definition. The caller renders the same
        // fail-closed surface it renders for "no journey here", because from
        // the reader's side those are the same fact: nothing to open.
        if (!cancelled)
          setState({ status: "error", definition: null, items: [] });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, bookSlug, chapterOrder, guideKey, guideVersion]);

  return state;
}
