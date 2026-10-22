import type { ChapterExperiencePublicView } from "@psico/types";

import { routePinKey } from "./guide-route-verdict";

/**
 * Which pins of a chapter may begin a NEW session.
 *
 * Three conditions, and all three are the server's own answers — this derives
 * nothing the browser could be wrong about:
 *
 *   1. There is a published experience for the pin. Discovery lists what is
 *      published; a pin absent from it has nothing to open.
 *   2. The server says it is `startable`. Published and startable are
 *      different questions: a pin retired for new starts stays published so
 *      the sessions already on it can finish, and `POST /guide/sessions`
 *      answers 410. Absent reads as "I could not ask", which is not a yes.
 *   3. Exactly ONE published experience claims it. Two is not a choice the
 *      client may make silently — picking the first would start whichever the
 *      list happened to order first, and the reader would have no way of
 *      knowing which journey they were in.
 *
 * It says nothing about continuing or reviewing. Those belong to a session
 * that already exists and resolves its own pinned version; gating them on this
 * would take away progress that is already somebody's.
 */
export function runnablePinsFrom(
  experiences: readonly ChapterExperiencePublicView[],
): ReadonlySet<string> {
  const cuantas = new Map<string, number>();
  for (const e of experiences) {
    const clave = routePinKey(e.guidePin);
    cuantas.set(clave, (cuantas.get(clave) ?? 0) + 1);
  }

  const ejecutables = new Set<string>();
  for (const e of experiences) {
    const clave = routePinKey(e.guidePin);
    if (e.startable !== true) continue;
    if ((cuantas.get(clave) ?? 0) !== 1) continue;
    ejecutables.add(clave);
  }
  return ejecutables;
}
