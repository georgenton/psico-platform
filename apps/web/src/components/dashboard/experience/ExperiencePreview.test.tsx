import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * CMS V1 (#637) — the preview seam.
 *
 * Two claims, and the whole design depends on both:
 *
 *   1. there is still ONE player. The live component and the preview render the
 *      same surface through the same registry, so what an editor approves is
 *      what a reader gets;
 *   2. the preview writes NOTHING — not to the network, not to `localStorage`.
 *      An editor stepping through a draft must not record progress, move the
 *      reader's cursor, or save a resonance.
 */

const { useGuideRunSpy } = vi.hoisted(() => {
  // A run at its cover: enough for the surface to render, and the shape the
  // live hook really returns before anything has started.
  const liveRun = {
    screen: "cover",
    session: null,
    step: null,
    error: null,
    retry: null,
    busy: false,
    booting: false,
    recallOutcome: null,
    recoverable: null,
    facts: { confirmedStepKeys: [], recalls: [] },
    serverSummary: null,
    choice: null,
    setChoice: () => {},
    start: async () => {},
    adopt: () => {},
    completeStep: () => {},
    submitRecall: () => {},
    finish: () => {},
    cancel: () => {},
    retryPending: () => {},
    restart: () => {},
  };
  return { useGuideRunSpy: vi.fn(() => liveRun) };
});

vi.mock("../guide/use-guide-run", () => ({ useGuideRun: useGuideRunSpy }));

import { ExperiencePlayer, ExperiencePlayerSurface } from "./ExperiencePlayer";
import { ExperiencePreview } from "./ExperiencePreview";
import { rendererForSceneKind } from "./experience-scene-registry";
import { EEC_BUNDLE, EEC_EXPERIENCE } from "../guide/guide-test-fixtures";

/** Every non-GET request that left the page, of any kind. */
let writes: string[] = [];

beforeEach(() => {
  cleanup();
  localStorage.clear();
  writes = [];
  useGuideRunSpy.mockClear();
  vi.spyOn(globalThis, "fetch").mockImplementation(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const method = (init?.method ?? "GET").toUpperCase();
      if (method !== "GET") writes.push(`${method} ${String(input)}`);
      return new Response("{}", { status: 200 });
    },
  );
});

describe("one player, two sources of state", () => {
  it("keeps the live player on the server-owned run", () => {
    // `ExperiencePlayer` is the ONLY caller of `useGuideRun`, and stays so.
    render(
      <ExperiencePlayer
        actorScope={"S".repeat(43)}
        definition={EEC_EXPERIENCE}
        bundle={EEC_BUNDLE}
      />,
    );

    expect(useGuideRunSpy).toHaveBeenCalledTimes(1);
  });

  it("never asks the live runtime for a preview", () => {
    render(
      <ExperiencePreview definition={EEC_EXPERIENCE} bundle={EEC_BUNDLE} />,
    );

    expect(useGuideRunSpy).not.toHaveBeenCalled();
  });

  it("mounts the same surface component from both", () => {
    // Not "a similar one": the identical function reference.
    expect(typeof ExperiencePlayerSurface).toBe("function");
    expect(ExperiencePlayer.name).not.toBe(ExperiencePlayerSurface.name);
  });

  it("resolves scenes through the one closed registry", () => {
    // A preview registry would be a second place for the twelve kinds to drift.
    expect(rendererForSceneKind("INTRO")).toBe(rendererForSceneKind("INTRO"));
    expect(rendererForSceneKind("RECALL")).toBeTypeOf("function");
  });
});

describe("preview writes nothing", () => {
  async function walkPreview() {
    render(
      <ExperiencePreview definition={EEC_EXPERIENCE} bundle={EEC_BUNDLE} />,
    );
    // Cover → start the synthetic run.
    await userEvent.click(
      screen.getByRole("button", { name: /Empezar experiencia/ }),
    );
    // Walk as far as the presentational scenes allow.
    for (let i = 0; i < 6; i++) {
      const next = screen.queryByRole("button", { name: "Continuar" });
      if (!next) break;
      await userEvent.click(next);
    }
  }

  it("issues no request while starting and stepping through a draft", async () => {
    await walkPreview();
    expect(writes).toEqual([]);
  });

  it("touches no scene cursor in localStorage", async () => {
    await walkPreview();
    // The reader's place in this experience is not the editor's to move.
    expect(Object.keys(localStorage)).toEqual([]);
  });

  it("says plainly that nothing is being recorded", () => {
    render(
      <ExperiencePreview definition={EEC_EXPERIENCE} bundle={EEC_BUNDLE} />,
    );

    // Outside the player — the renderers' own copy is what a reader sees and is
    // deliberately left alone.
    expect(
      screen.getByText(/no registra avance, respuestas ni resonancias/i),
    ).toBeInTheDocument();
  });

  it("offers no way to save a resonance", () => {
    // `onConfirmResonance` is the only path to that write, and preview omits it.
    render(
      <ExperiencePreview definition={EEC_EXPERIENCE} bundle={EEC_BUNDLE} />,
    );

    expect(screen.queryByRole("button", { name: /me resonó/i })).toBeNull();
  });
});

/**
 * B3 · Prioridad C — la vista previa enseñaba media escena sin decirlo.
 *
 * `PracticeInteractionView` pide la interacción a `/learning/practices/:key`,
 * y la vista previa pasaba `media={null}`, así que no pedía nada: la escena de
 * práctica mostraba título, cuerpo, nota y el botón de confirmar, y las cuatro
 * tarjetas a ordenar no aparecían nunca. Quien revisara MG03 por aquí no
 * llegaba a ver la mitad del trabajo, y la pantalla no daba ninguna señal.
 *
 * Las tarjetas de abajo son las reales del catálogo de MG03.
 */
const TARJETAS_MG03 = [
  { key: "senal", label: "Aparece una señal repentina." },
  {
    key: "respuesta",
    label: "El organismo inicia una respuesta protectora o de sobresalto.",
  },
  { key: "contexto", label: "Compruebas el contexto y descubres qué ocurrió." },
  {
    key: "interpretacion",
    label: "Interpretas la situación y puedes nombrar la experiencia.",
  },
];

const CONTEXTO = {
  bookSlug: "emociones-en-construccion",
  chapterOrder: 1,
  apiBase: "http://api.test/api",
  token: "t",
};

/** La experiencia real, con su escena de práctica declarando su ejercicio. */
const CON_PRACTICA = {
  ...EEC_EXPERIENCE,
  scenes: EEC_EXPERIENCE.scenes.map((escena) =>
    escena.kind === "PRACTICE"
      ? {
          ...escena,
          // En la vista pública el ejercicio viaja dentro del `payload`, que
          // es lo único que lee un renderizador.
          payload: {
            ...escena.payload,
            exerciseKey: "eec-c1-practice-ordenar-alarma-y-relato",
          },
        }
      : escena,
  ),
} as typeof EEC_EXPERIENCE;

/** Avanza por el recorrido hasta que la escena de práctica está en pantalla. */
async function hastaLaPractica() {
  await userEvent.click(
    screen.getByRole("button", { name: /empezar experiencia/i }),
  );
  for (let i = 0; i < 10; i++) {
    if (screen.queryByTestId("scene-practice")) return;
    const avanzar = screen
      .getAllByRole("button")
      .find((b) =>
        /^(continuar|lo leí|he explorado|siguiente)/i.test(
          b.textContent?.trim() ?? "",
        ),
      );
    if (!avanzar) break;
    await userEvent.click(avanzar);
  }
}

function respondePractica() {
  vi.spyOn(globalThis, "fetch").mockImplementation(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const method = (init?.method ?? "GET").toUpperCase();
      if (method !== "GET") writes.push(`${method} ${String(input)}`);
      if (String(input).includes("/learning/practices/")) {
        return new Response(
          JSON.stringify({
            exerciseKey: "eec-c1-practice-ordenar-alarma-y-relato",
            interaction: {
              kind: "sequence_ordering",
              scenario: "Lees tranquilamente en casa y una puerta se cierra.",
              cards: TARJETAS_MG03,
              solved: TARJETAS_MG03.map((c) => c.key),
              solvedLabel: "Prefiero ver el ejemplo resuelto",
              feedback: "La señal y la respuesta rápida pueden preceder.",
            },
          }),
          { status: 200 },
        );
      }
      return new Response("{}", { status: 200 });
    },
  );
}

describe("la vista previa muestra la práctica completa", () => {
  beforeEach(() => {
    respondePractica();
  });

  it("carga las cuatro tarjetas reales cuando tiene con qué pedirlas", async () => {
    render(
      <ExperiencePreview
        definition={CON_PRACTICA}
        bundle={EEC_BUNDLE}
        media={CONTEXTO}
      />,
    );
    await hastaLaPractica();

    for (const tarjeta of TARJETAS_MG03) {
      expect(await screen.findByText(tarjeta.label)).toBeInTheDocument();
    }
  });

  it("y con ellas la interacción accesible, que es la primaria", async () => {
    // Arrastrar está encima y nada depende de ello: Subir y Bajar SON la
    // interacción, y cada movimiento se anuncia. Una vista previa que no los
    // muestre no permite revisar lo que de verdad va a usar la gente.
    render(
      <ExperiencePreview
        definition={CON_PRACTICA}
        bundle={EEC_BUNDLE}
        media={CONTEXTO}
      />,
    );
    await hastaLaPractica();
    await screen.findByText(TARJETAS_MG03[0]!.label);

    expect(screen.getAllByRole("button", { name: /subir/i }).length).toBe(4);
    expect(screen.getAllByRole("button", { name: /bajar/i }).length).toBe(4);
    expect(
      screen.getByRole("button", { name: /ejemplo resuelto/i }),
    ).toBeInTheDocument();
  });

  it("y sigue sin escribir nada", async () => {
    // El contexto es de LECTURA. Que la práctica cargue no puede convertir la
    // previsualización en una sesión.
    render(
      <ExperiencePreview
        definition={CON_PRACTICA}
        bundle={EEC_BUNDLE}
        media={CONTEXTO}
      />,
    );
    await hastaLaPractica();
    await screen.findByText(TARJETAS_MG03[0]!.label);
    // La confirmación de la escena, cualquiera que sea su rótulo aprobado, y
    // un movimiento de la práctica: ninguno de los dos puede escribir.
    await userEvent.click(
      screen.getAllByRole("button", { name: /bajar/i })[0]!,
    );
    const confirmar = screen
      .getAllByRole("button")
      .find((b) => /ya hice|confirmar|marcar/i.test(b.textContent ?? ""));
    if (confirmar) await userEvent.click(confirmar);

    expect(writes).toEqual([]);
    expect(localStorage.length).toBe(0);
  });

  it("control negativo — sin contexto no hay tarjetas, que es lo que pasaba", async () => {
    render(<ExperiencePreview definition={CON_PRACTICA} bundle={EEC_BUNDLE} />);
    await hastaLaPractica();

    expect(screen.getByTestId("scene-practice")).toBeInTheDocument();
    expect(screen.queryByText(TARJETAS_MG03[0]!.label)).toBeNull();
  });
});
