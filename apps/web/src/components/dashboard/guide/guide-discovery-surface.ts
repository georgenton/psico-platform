import { guidePinKey, type GuidePin } from "./guide-pin";

/**
 * WHERE a guided reading is offered — a web presentation decision, not a
 * server one.
 *
 * The chapter screen grew two lists that answer the same question. The older
 * one lists the experiences the catalog publishes here; the newer one lists the
 * chapter's guided route. Publishing EEC-C01's five put them in both, so a
 * reader saw the same five readings twice, once as a route and once as a list
 * of cards that could not open.
 *
 * This says, per pin, which surface owns it:
 *
 *   route   — the chapter's guided route. Never in the legacy list.
 *   legacy  — the published-experiences list, as before. Parejas lives here.
 *   hidden  — runnable, but not OFFERED anywhere. The historical pilot: a
 *             session pinned to it must still resolve and resume, and that is
 *             a different question from whether we invite anyone to start one.
 *
 * A pin nobody classified defaults to `legacy`, so a book added tomorrow keeps
 * behaving exactly as it does today without editing this file.
 *
 * It is deliberately a lookup table and not a contract: no endpoint, no field
 * on the wire, nothing the server has to agree with. Which of two lists shows a
 * card is a question the browser can answer on its own.
 */

export type GuideDiscoverySurface = "route" | "legacy" | "hidden";

const SURFACES: ReadonlyMap<string, GuideDiscoverySurface> = new Map([
  // EEC-C01's five: the route is their home.
  ["eec-c1-teorias-como-lentes@1", "route"],
  ["eec-c1-rostro-como-pista@1", "route"],
  ["eec-c1-alarma-antes-del-relato@1", "route"],
  ["eec-c1-emocion-informa-no-manda@1", "route"],
  ["eec-c1-construida-no-significa-falsa@1", "route"],
  // The historical pilot. Its bundle stays so an open session still runs; it
  // is simply not offered as one more thing to start.
  ["eec-c1-cuerpo-antes-que-mente@1", "hidden"],
]);

export function guideDiscoverySurface(pin: GuidePin): GuideDiscoverySurface {
  const key = guidePinKey(pin);
  if (key === null) return "legacy";
  return SURFACES.get(key) ?? "legacy";
}

/** True when this pin belongs in the published-experiences list. */
export function belongsInLegacyExperienceList(pin: GuidePin): boolean {
  return guideDiscoverySurface(pin) === "legacy";
}
