import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type Mock,
} from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { GuidedReadingPrototype } from "./GuidedReadingPrototype";
import {
  GUIDE_SCENE_COUNT,
  PROTOTYPE_ANCHOR_BLOCK_KEY,
  PROTOTYPE_CLIENT_GRADING,
  PROTOTYPE_RESONANCE_WRITE,
  EMOTIONAL_MAP_WRITE,
  type PrototypeInitialState,
} from "./guided-reading-prototype.fixture";

/**
 * GR-1 — pruebas del prototipo visual de Guided Reading.
 *
 * Además de comprobar la navegación de las ocho escenas, estas pruebas
 * funcionan como ratchets: el prototipo no puede llamar a la red, no puede
 * escribir en storage y no puede calificar el recall en el cliente.
 */

const DEFAULT_INITIAL: PrototypeInitialState = {
  mode: "read",
  scene: 0,
  outcome: "correct",
};

let fetchSpy: Mock;
let setItemSpy: Mock;
let scrollSpy: Mock;

beforeEach(() => {
  fetchSpy = vi.fn(() =>
    Promise.reject(new Error("network is forbidden in GR-1")),
  );
  vi.stubGlobal("fetch", fetchSpy);
  setItemSpy = vi.fn();
  Storage.prototype.setItem = setItemSpy;
  // jsdom no implementa scrollIntoView.
  scrollSpy = vi.fn();
  Element.prototype.scrollIntoView = scrollSpy;
});

const ORIGINAL_SET_ITEM = Storage.prototype.setItem;
const ORIGINAL_SCROLL_INTO_VIEW = Element.prototype.scrollIntoView;

afterEach(() => {
  Storage.prototype.setItem = ORIGINAL_SET_ITEM;
  Element.prototype.scrollIntoView = ORIGINAL_SCROLL_INTO_VIEW;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function renderPrototype(initial: Partial<PrototypeInitialState> = {}) {
  return render(
    <GuidedReadingPrototype initial={{ ...DEFAULT_INITIAL, ...initial }} />,
  );
}

describe("GuidedReadingPrototype — selector de modalidad", () => {
  it("cambia entre las cuatro modalidades", async () => {
    const user = userEvent.setup();
    renderPrototype();

    // Leer es el estado inicial.
    expect(screen.getByLabelText("Texto del capítulo")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^Escuchar/ }));
    expect(screen.getByLabelText("Escuchar el capítulo")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Audiolibro" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Podcast" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^Ver/ }));
    expect(screen.getByLabelText("Ver el capítulo")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^Lectura guiada/ }));
    expect(screen.getByTestId("guide-panel")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^Leer/ }));
    expect(screen.getByLabelText("Texto del capítulo")).toBeInTheDocument();
  });

  it("no arranca la lectura guiada automáticamente", () => {
    renderPrototype();
    expect(screen.queryByTestId("guide-panel")).not.toBeInTheDocument();
    expect(
      screen.queryByText("El cuerpo sabe antes que la mente"),
    ).not.toBeInTheDocument();
  });

  it("«Lectura guiada» abre la portada y «Empezar» avanza el flujo local", async () => {
    const user = userEvent.setup();
    renderPrototype();

    await user.click(screen.getByRole("button", { name: /^Lectura guiada/ }));
    const panel = screen.getByTestId("guide-panel");
    expect(panel).toHaveAttribute("data-scene", "1");
    expect(within(panel).getByText("LECTURA GUIADA")).toBeInTheDocument();
    expect(
      within(panel).getByText("El cuerpo sabe antes que la mente"),
    ).toBeInTheDocument();

    await user.click(within(panel).getByRole("button", { name: "Empezar" }));
    expect(screen.getByTestId("guide-panel")).toHaveAttribute(
      "data-scene",
      "2",
    );
  });
});

describe("GuidedReadingPrototype — ocho escenas", () => {
  it("expone ocho escenas y todas son navegables", async () => {
    expect(GUIDE_SCENE_COUNT).toBe(8);

    const user = userEvent.setup();
    renderPrototype();

    // Escena 0 — selector, sin panel.
    expect(screen.queryByTestId("guide-panel")).not.toBeInTheDocument();

    // Escena 1 — portada.
    await user.click(screen.getByRole("button", { name: /^Lectura guiada/ }));
    expect(screen.getByTestId("guide-panel")).toHaveAttribute(
      "data-scene",
      "1",
    );

    // Escena 2 — clip.
    await user.click(screen.getByRole("button", { name: "Empezar" }));
    expect(screen.getByTestId("guide-panel")).toHaveAttribute(
      "data-scene",
      "2",
    );
    expect(screen.getByText("Antes de ponerle un nombre")).toBeInTheDocument();

    // Escena 3 — pasaje anclado.
    await user.click(screen.getByRole("button", { name: "Continuar" }));
    expect(screen.getByTestId("guide-panel")).toHaveAttribute(
      "data-scene",
      "3",
    );
    expect(screen.getByText("Ahora míralo en el libro")).toBeInTheDocument();

    // Escena 4 — práctica (cierra el checkpoint Concepto).
    await user.click(
      screen.getByRole("button", { name: "He explorado esta idea" }),
    );
    expect(screen.getByTestId("guide-panel")).toHaveAttribute(
      "data-scene",
      "4",
    );
    expect(screen.getByText("Escucharte por dentro")).toBeInTheDocument();

    // Escena 5 — recall.
    await user.click(
      screen.getByRole("button", { name: "Terminé la práctica" }),
    );
    expect(screen.getByTestId("guide-panel")).toHaveAttribute(
      "data-scene",
      "5",
    );
    expect(
      screen.getByRole("radiogroup", { name: "Opciones" }),
    ).toBeInTheDocument();

    // Escena 6 — feedback.
    await user.click(screen.getAllByRole("radio")[0]);
    await user.click(screen.getByRole("button", { name: "Responder" }));
    expect(screen.getByTestId("guide-panel")).toHaveAttribute(
      "data-scene",
      "6",
    );

    // Escena 7 — cierre.
    await user.click(screen.getByRole("button", { name: "Continuar" }));
    expect(screen.getByTestId("guide-panel")).toHaveAttribute(
      "data-scene",
      "7",
    );
    expect(
      screen.getByText("COMPLETASTE ESTA LECTURA GUIADA"),
    ).toBeInTheDocument();
  });

  it("muestra el progreso por checkpoint y la parte dentro del checkpoint", async () => {
    const user = userEvent.setup();
    renderPrototype({ mode: "guide", scene: 2 });

    expect(screen.getByText("Concepto · parte 2 de 3")).toBeInTheDocument();
    expect(screen.queryByText(/Paso 3 de 8/)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Continuar" }));
    expect(screen.getByText("Concepto · parte 3 de 3")).toBeInTheDocument();
  });
});

describe("GuidedReadingPrototype — pasaje anclado", () => {
  it("«Ir al pasaje» hace scroll, mueve el foco y conserva el panel", async () => {
    const user = userEvent.setup();
    renderPrototype({ mode: "guide", scene: 3 });

    const anchor = screen.getByTestId("prototype-anchor");
    await user.click(screen.getByRole("button", { name: "Ir al pasaje" }));

    expect(scrollSpy).toHaveBeenCalled();
    expect(document.activeElement).toBe(anchor);
    // El panel sigue abierto en la misma escena.
    expect(screen.getByTestId("guide-panel")).toHaveAttribute(
      "data-scene",
      "3",
    );
    // El anchor del prototipo es visual: no hay `blockKey` real.
    expect(PROTOTYPE_ANCHOR_BLOCK_KEY).toBeNull();
  });
});

describe("GuidedReadingPrototype — práctica", () => {
  it("permite la pausa con temporizador o continuar sin él", async () => {
    const user = userEvent.setup();
    renderPrototype({ mode: "guide", scene: 4 });

    expect(
      screen.getByText("La aplicación no guarda lo que observaste."),
    ).toBeInTheDocument();
    // No hay campo de texto libre.
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Comenzar pausa de 45 segundos" }),
    );
    expect(screen.getByText("45")).toBeInTheDocument();

    // Para revisión se puede completar la pausa sin esperar 45 segundos.
    await user.click(
      screen.getByRole("button", { name: "Terminar la pausa ahora" }),
    );
    expect(screen.queryByText("45")).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Continuar sin temporizador" }),
    );
    expect(screen.getByTestId("guide-panel")).toHaveAttribute(
      "data-scene",
      "4",
    );
  });
});

describe("GuidedReadingPrototype — recall y feedback", () => {
  it("no califica la selección en el cliente", async () => {
    const user = userEvent.setup();
    // El fixture dice `correct`; elegimos deliberadamente otra opción.
    renderPrototype({ mode: "guide", scene: 5, outcome: "correct" });

    const options = screen.getAllByRole("radio");
    expect(options).toHaveLength(3);
    await user.click(options[1]);
    await user.click(screen.getByRole("button", { name: "Responder" }));

    const feedback = screen.getByTestId("guide-feedback");
    expect(feedback).toHaveAttribute("data-outcome", "correct");
    expect(PROTOTYPE_CLIENT_GRADING).toBe(false);
  });

  it("toma el resultado del fixture y no muestra score ni porcentaje", () => {
    renderPrototype({ mode: "guide", scene: 6, outcome: "review" });

    const feedback = screen.getByTestId("guide-feedback");
    expect(feedback).toHaveAttribute("data-outcome", "review");
    expect(within(feedback).getByText("REVISEMOS")).toBeInTheDocument();
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
    expect(screen.queryByText(/correctOptionKey/)).not.toBeInTheDocument();
  });
});

describe("GuidedReadingPrototype — cierre", () => {
  it("la resonancia solo cambia estado local", async () => {
    const user = userEvent.setup();
    renderPrototype({ mode: "guide", scene: 7 });

    await user.click(screen.getByRole("button", { name: "Esto me resonó" }));

    expect(
      screen.getByText(/solo cambia el estado local/i),
    ).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(PROTOTYPE_RESONANCE_WRITE).toBe(false);
    expect(EMOTIONAL_MAP_WRITE).toBe(false);
  });
});

describe("GuidedReadingPrototype — aislamiento", () => {
  it("ninguna interacción llama a la red ni escribe en storage", async () => {
    const user = userEvent.setup();
    renderPrototype();

    await user.click(screen.getByRole("button", { name: /^Escuchar/ }));
    await user.click(screen.getByRole("tab", { name: "Podcast" }));
    await user.click(screen.getByRole("button", { name: /^Ver/ }));
    await user.click(screen.getByRole("button", { name: "Transcripción" }));
    await user.click(screen.getByRole("button", { name: /^Lectura guiada/ }));
    await user.click(screen.getByRole("button", { name: "Empezar" }));
    await user.click(screen.getByRole("button", { name: "Reproducir" }));
    await user.click(
      screen.getByRole("button", { name: "Leer transcripción" }),
    );
    await user.click(screen.getByRole("button", { name: "Continuar" }));
    await user.click(screen.getByRole("button", { name: "Ir al pasaje" }));

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(setItemSpy).not.toHaveBeenCalled();
  });
});
