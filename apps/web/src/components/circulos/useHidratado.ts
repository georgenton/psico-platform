"use client";

import { useEffect, useState } from "react";

/**
 * Has this screen's JavaScript taken charge of the markup yet?
 *
 * Every door into a Dúo — create, accept an invitation, consent to begin — is
 * a button whose whole behaviour lives in an `onClick`. Its markup, though,
 * arrives from the server and is on screen, looking ready, before React has
 * attached anything to it. A press inside that window is swallowed: no
 * navigation, no error, no spinner, nothing at all. On a developer machine the
 * gap is a few milliseconds and nobody notices. Over a real network to a
 * hosted Web it is long enough to eat somebody's first press at the entrance
 * of an activity they were invited to — and the natural reading of a button
 * that does nothing is that the thing is broken.
 *
 * `false` during the server's render and the first client render, so the
 * control can be rendered disabled while it genuinely cannot act; `true` once
 * the effect has run, which is exactly the moment the press starts to mean
 * something.
 *
 * It is deliberately not a "loading" flag: nothing is being fetched, and the
 * screen has nothing else to say. The button is simply not yet a button.
 */
export function useHidratado(): boolean {
  const [hidratado, setHidratado] = useState(false);
  useEffect(() => setHidratado(true), []);
  return hidratado;
}
