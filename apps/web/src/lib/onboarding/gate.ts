/**
 * Who gets sent to the onboarding, and who gets the tour.
 *
 * ── Why this is a function and not four lines inside the layout ────────────
 *
 * It used to be four lines inside `dashboard/layout.tsx`, an async Server
 * Component that calls `redirect()`. That is close to untestable: exercising
 * it needs a Next request scope, and `redirect` works by throwing a framework
 * sentinel. So the decision was never covered, and it is not a trivial one —
 * it reads three nullable timestamps and has to get four different people
 * right:
 *
 *   · somebody who just registered            → onboarding
 *   · somebody who skipped it                 → dashboard, no tour (they
 *                                               opted out of exactly this)
 *   · somebody who finished it                → dashboard WITH the tour
 *   · somebody coming back later              → dashboard, no tour
 *
 * The decision is pure: three timestamps in, one verdict out. Pulling it out
 * leaves the layout doing the two things only it can do — fetching, and
 * throwing the redirect — and lets the rule itself be enumerated in tests.
 */

/** The three timestamps `/user/me` reports, any of which may be absent. */
export interface OnboardingStateLike {
  completedAt?: string | Date | null;
  skippedAt?: string | Date | null;
  tourCompletedAt?: string | Date | null;
}

export type OnboardingGate =
  /** Not decided yet: no row, or a row with neither outcome set. */
  | { kind: "redirect"; to: "/onboarding" }
  | { kind: "dashboard"; showTour: boolean };

export function resolveOnboardingGate(
  state: OnboardingStateLike | null | undefined,
): OnboardingGate {
  const completed = Boolean(state?.completedAt);
  const skipped = Boolean(state?.skippedAt);

  // "No row" and "row with neither outcome" are the same person: someone who
  // has not decided about onboarding yet.
  if (!completed && !skipped) return { kind: "redirect", to: "/onboarding" };

  // The tour is a reward for finishing, not a consolation for skipping.
  // Someone who skipped the onboarding said no to being walked through the
  // product; handing them a five-step walkthrough would be the same
  // interruption under a different name.
  const showTour = completed && !state?.tourCompletedAt;
  return { kind: "dashboard", showTour };
}

/** Dónde corre el tour: la pantalla de la que habla su primer paso. */
export const TOUR_ROUTE = "/dashboard";

/**
 * ¿Encaja el tour en ESTA pantalla?
 *
 * ── Qué arregla, medido ───────────────────────────────────────────────────
 *
 * Al terminar el onboarding, quien elige un libro aterriza en su capítulo
 * (`/dashboard/biblioteca/:libro/lector/1`), que es lo que pidió — y eso se
 * conserva. Pero el tour se monta en el layout de `/dashboard`, que envuelve
 * también al lector, así que aparecía encima del capítulo. El problema no era
 * que tapara el texto: era que el **paso 1 de 5 dice «Tu Inicio · Este es tu
 * punto de partida cada día»** mientras la persona está mirando otra pantalla.
 * Los cinco pasos describen la navegación, y la navegación se entiende desde
 * Inicio.
 *
 * Así que el tour se pospone, no se cancela: `tourCompletedAt` sigue en nulo
 * —nadie lo ha visto ni lo ha saltado— y la primera vez que esa persona pase
 * por Inicio, ahí está. `resolveOnboardingGate` sigue contestando QUIÉN lo ve;
 * esto contesta DÓNDE, que es una pregunta de navegación y por eso se evalúa
 * en el cliente.
 *
 * La barra final se normaliza porque `/dashboard` y `/dashboard/` son la misma
 * pantalla y nada garantiza cuál llega.
 */
export function tourFitsRoute(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  const normalizado =
    pathname.length > 1 && pathname.endsWith("/")
      ? pathname.replace(/\/+$/, "")
      : pathname;
  return normalizado === TOUR_ROUTE;
}
