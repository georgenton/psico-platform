import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

/**
 * CC-7.5 / PR #596 / CC-7.R1 — the player mount reads the actor scope AND the
 * pilot availability from context.
 *
 * The Guide page is identity-free: the layout resolves the scope once and
 * publishes it through `GuideActorScopeProvider`, and the Exploraciones
 * template publishes the pilot boolean through `GuideAvailabilityProvider`. The
 * mount reads both and fails closed on either — never mounting the player,
 * never touching storage — availability first.
 */

vi.mock("next/link", () => ({
  __esModule: true,
  default: ({ href, children }: { href: string; children: ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

/**
 * GR-6 — the mount now renders the ONE canonical player. `GuidePlayer` is gone;
 * the reader panel and this standalone page mount the same `ExperiencePlayer`,
 * which is the property this file protects when it asserts the scope reaches it.
 *
 * Both spies are `vi.hoisted` because the real player pulls `guide-recovery`
 * through its own import graph: a plain `const` would be read by the hoisted
 * mock factory before it is initialised.
 */
/**
 * B4 — el propio avance, que ahora se consulta incluso con el rollout
 * cerrado. Por defecto: esta persona no tiene nada aquí, que es el caso que
 * las pruebas de CC-7.R1 describían.
 *
 * B5 — `status` se declara con su unión entera, no con `as const`. Escrito
 * `"ready" as const`, el tipo del campo quedaba fijado en `"ready"` y el caso
 * «el servidor todavía no contesta» no compilaba. Vitest no se enteró —SWC
 * borra los tipos sin comprobarlos— y el CI de este PR tampoco, por lo que
 * dice el informe de B5 sobre `--affected`.
 */
const { propio } = vi.hoisted(() => ({
  propio: {
    current: {
      status: "ready" as "loading" | "ready" | "error",
      state: "NOT_STARTED" as "NOT_STARTED" | "ACTIVE" | "COMPLETED" | null,
      session: null as { stepsCompleted: number; totalSteps: number } | null,
    },
  },
}));

vi.mock("./use-guide-own-state", () => ({
  useGuideOwnState: () => propio.current,
}));

const { playerScopes, recoveryRead, experience } = vi.hoisted(() => ({
  playerScopes: [] as (string | undefined)[],
  // If the mount ever read recovery for a null scope, this spy would fire.
  recoveryRead: vi.fn(() => "empty" as const),
  experience: vi.fn(),
}));

vi.mock("../experience/ExperiencePlayer", () => ({
  ExperiencePlayer: ({ actorScope }: { actorScope: string }) => {
    playerScopes.push(actorScope);
    return <div data-testid="guide-player" data-scope={actorScope} />;
  },
}));

vi.mock("./guide-recovery", () => ({
  guideRecoveryState: recoveryRead,
}));

// GR-6 — the journey is SERVER-owned: the mount asks discovery for it and can
// only play what comes back. Faking the hook here is faking the API response.
vi.mock("../experience/use-chapter-experience", () => ({
  useChapterExperience: (input: { enabled: boolean }) => experience(input),
}));

import { GuidePlayerMount } from "./GuidePlayerMount";
import { GuideActorScopeProvider } from "./guide-actor-scope";
import { GuideAvailabilityProvider } from "./guide-availability";
import { EEC_EXPERIENCE } from "./guide-test-fixtures";

const SCOPE = "S".repeat(43);

beforeEach(() => {
  propio.current = { status: "ready", state: "NOT_STARTED", session: null };
  playerScopes.length = 0;
  recoveryRead.mockClear();
  experience.mockReset();
  experience.mockReturnValue({ status: "ready", definition: EEC_EXPERIENCE });
});

/** Both providers — availability defaults to `true` unless overridden. */
function mount(scope: string | null, available = true): ReactNode {
  return (
    <GuideAvailabilityProvider available={available}>
      <GuideActorScopeProvider scope={scope}>
        <GuidePlayerMount />
      </GuideActorScopeProvider>
    </GuideAvailabilityProvider>
  );
}

describe("GuidePlayerMount", () => {
  it("mounts the player with the scope from context when available", () => {
    render(mount(SCOPE));

    const player = screen.getByTestId("guide-player");
    expect(player).toHaveAttribute("data-scope", SCOPE);
    expect(playerScopes.at(-1)).toBe(SCOPE);
  });

  it("fails closed with no scope: no player, no storage read", () => {
    render(mount(null));

    expect(screen.queryByTestId("guide-player")).toBeNull();
    expect(
      screen.getByText(/no pudimos preparar tu guía/i),
    ).toBeInTheDocument();
    // The player never mounts, so recovery is never read for an unknown actor.
    expect(recoveryRead).not.toHaveBeenCalled();
  });

  it("shows the not-available card (with a way back) when the pilot gate is closed", () => {
    // Availability is checked BEFORE the scope — even with a valid scope, a
    // closed gate never mounts the player.
    render(mount(SCOPE, false));

    expect(screen.queryByTestId("guide-player")).toBeNull();
    expect(
      screen.getByText(/esta guía no está disponible por ahora/i),
    ).toBeInTheDocument();
    const back = screen.getByText(/volver a exploraciones/i);
    expect(back).toHaveAttribute("href", "/dashboard/exploraciones");
    expect(recoveryRead).not.toHaveBeenCalled();
  });

  it("shows no stale content while discovery is still loading", () => {
    experience.mockReturnValue({ status: "loading", definition: null });
    render(mount(SCOPE));

    // Not a player, and not the previous reader's journey either: with no
    // definition there is nothing this build may legitimately draw.
    expect(screen.queryByTestId("guide-player")).toBeNull();
    expect(screen.queryByText(EEC_EXPERIENCE.title)).toBeNull();
  });

  it("fails closed when discovery answers with no experience for this pin", () => {
    experience.mockReturnValue({ status: "ready", definition: null });
    render(mount(SCOPE));

    expect(screen.queryByTestId("guide-player")).toBeNull();
    // B3 — la frase cambió, y el cambio es el punto. «Vuelve a intentarlo en
    // un momento» presentaba una retirada editorial como una avería pasajera:
    // invitaba a reintentar algo que no va a cambiar nunca. Lo que de verdad
    // ocurre es que el capítulo ya no la ofrece y esta persona no tiene un
    // recorrido propio en ella — quien lo tiene llega por identidad exacta y
    // sí ve el reproductor.
    expect(screen.getByText(/ya no está disponible/i)).toBeInTheDocument();
    expect(screen.queryByText(/vuelve a intentarlo/i)).toBeNull();
  });

  it("no afirma nada mientras la respuesta no ha llegado", () => {
    // Antes, «no disponible» parpadeaba durante la carga porque `definition`
    // empieza en null. Decir algo falso con seguridad y corregirlo medio
    // segundo después es peor que esperar.
    experience.mockReturnValue({ status: "loading", definition: null });
    render(mount(SCOPE));

    expect(screen.queryByText(/ya no está disponible/i)).toBeNull();
    expect(screen.getByText(/buscando tu recorrido/i)).toBeInTheDocument();
  });

  it("does not even ask discovery when a gate is closed", () => {
    render(mount(SCOPE, false));
    expect(experience).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: false }),
    );

    cleanup();
    experience.mockClear();
    render(mount(null));
    expect(experience).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: false }),
    );
  });

  it("fails closed when there is no provider at all", () => {
    // Both contexts default: availability false → the not-available card.
    render(<GuidePlayerMount />);
    expect(screen.queryByTestId("guide-player")).toBeNull();
    expect(
      screen.getByText(/esta guía no está disponible por ahora/i),
    ).toBeInTheDocument();
  });
});

/**
 * B4 — consultar lo propio no es ejecutar una operación nueva.
 *
 * Quedarse fuera del rollout borraba de la vista el recorrido que una persona
 * ya había hecho. El servidor nunca dijo eso: `GuideRolloutGuard` protege los
 * cinco COMANDOS y ninguna lectura, así que `/guide/sessions/state` contesta
 * igual con el rollout cerrado. La política ya distinguía los dos permisos;
 * el cliente los confundía.
 *
 * Y lo que NO se hace: montar el reproductor. Existe para ejecutar un
 * recorrido, y ejecutar es justo lo que aquí no está permitido — sus botones
 * acabarían en un 503 que nadie anunció.
 */
describe("GuidePlayerMount — con el rollout cerrado y algo propio", () => {
  it("dice en qué punto quedó un recorrido abierto, sin ofrecer seguirlo", () => {
    propio.current = {
      status: "ready",
      state: "ACTIVE",
      session: { stepsCompleted: 1, totalSteps: 3 },
    };
    render(mount(SCOPE, false));

    expect(screen.getByText(/tu recorrido está en pausa/i)).toBeInTheDocument();
    expect(screen.getByText(/paso 1 de 3/i)).toBeInTheDocument();
    // Ni reproductor ni promesa de continuar.
    expect(screen.queryByTestId("guide-player")).toBeNull();
    expect(screen.queryByText(/continuar experiencia/i)).toBeNull();
  });

  it("reconoce un recorrido terminado, sin ofrecer repetirlo", () => {
    propio.current = {
      status: "ready",
      state: "COMPLETED",
      session: { stepsCompleted: 3, totalSteps: 3 },
    };
    render(mount(SCOPE, false));

    expect(screen.getByText(/terminaste este recorrido/i)).toBeInTheDocument();
    expect(screen.getByText(/3 de 3 pasos/i)).toBeInTheDocument();
    expect(screen.queryByTestId("guide-player")).toBeNull();
    expect(screen.queryByText(/repetir/i)).toBeNull();
  });

  it("control negativo — sin nada propio, sigue diciendo lo de antes", () => {
    propio.current = { status: "ready", state: "NOT_STARTED", session: null };
    render(mount(SCOPE, false));

    expect(
      screen.getByText(/esta guía no está disponible por ahora/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/pausa|terminaste/i)).toBeNull();
  });

  it("y mientras el servidor no contesta no afirma nada", () => {
    propio.current = { status: "loading", state: null, session: null };
    render(mount(SCOPE, false));

    expect(screen.getByText(/buscando tu recorrido/i)).toBeInTheDocument();
    expect(screen.queryByText(/no está disponible/i)).toBeNull();
  });
});
