import type { Metadata } from "next";

import "./landing.css";
import { LANDING_HTML } from "./_landing-html";
import { LandingClient } from "./_landing-client";

/**
 * Landing — Sprint A redesign.
 *
 * The new landing is a transformation-platform pitch (vs the old library
 * framing). Markup + styles come 1:1 from `docs/design/redesign-v2/landing/`;
 * we mount the body HTML via `dangerouslySetInnerHTML` and hand interactivity
 * to `LandingClient` (radar SVG + reveal-on-scroll), which renders nothing
 * and operates on the DOM with `useEffect`.
 *
 * The wrapping `<main className="psico psico-landing">` scopes the design's
 * typography/reset to this page only — the dashboard and auth pages keep
 * their own styling because their components don't carry the `.psico` class.
 *
 * Auth CTAs (Login + Crear cuenta) were already rewritten from `#` to
 * `/login` + `/register` in `_landing-html.ts`. Footer legal links remain
 * `#` until those pages ship.
 */

export const metadata: Metadata = {
  title: "Psico — Te estás descubriendo",
  description:
    "No es una app para sentirte mejor. Es una práctica para verte con claridad — y avanzar.",
};

export const revalidate = 3600;

export default function HomePage() {
  return (
    <>
      <main
        className="psico psico-landing"
        dangerouslySetInnerHTML={{ __html: LANDING_HTML }}
      />
      <LandingClient />
    </>
  );
}
