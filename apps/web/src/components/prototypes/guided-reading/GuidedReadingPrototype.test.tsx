import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type Mock,
} from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { GuidedReadingPrototype } from "./GuidedReadingPrototype";
import {
  GUIDE_SCENE_COUNT,
  PRACTICE_EXPLICIT_ROUTE_REQUIRED,
  PROTOTYPE_ANCHOR_BLOCK_KEY,
  PROTOTYPE_CHECKIN_WRITE,
  PROTOTYPE_CLIENT_GRADING,
  PROTOTYPE_EVOLUTION_WRITE,
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

const ORIGINAL_SET_ITEM = Storage.prototype.setItem;
const ORIGINAL_SCROLL_INTO_VIEW = Element.prototype.scrollIntoView;

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

afterEach(() => {
  Storage.prototype.setItem = ORIGINAL_SET_ITEM;
  Element.prototype.scrollIntoView = ORIGINAL_SCROLL_INTO_VIEW;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function renderPrototype(initial: Partial<PrototypeInitialState> = {}) {
  return render(
    <GuidedReadingPrototype initial={{ ...DEFAULT_INITIAL, ...initial }} />,
  );
}

/** Recorre el flujo desde el selector hasta la escena pedida. */
async function walkTo(
  user: ReturnType<typeof userEvent.setup>,
  target: number,
) {
  await user.click(screen.getByRole("button", { name: /^Lectura guiada/ }));
  if (target <= 1) return;
  await user.click(screen.getByRole("button", { name: "Empezar" }));
  if (target <= 2) return;
  await user.click(screen.getByRole("button", { name: "Continuar" }));
  if (target <= 3) return;
  await user.click(screen.getByRole("button", { name: "Ir al pasaje" }));
  await user.click(screen.getByRole("button", { name: "Continuar" }));
  if (target <= 4) return;
  await user.click(
    screen.getByRole("button", { name: "Continuar sin temporizador" }),
  );
  await user.click(screen.getByRole("button", { name: "Terminé la práctica" }));
  if (target <= 5) return;
  await user.click(screen.getAllByRole("radio")[0]);
  await user.click(screen.getByRole("button", { name: "Responder" }));
  if (target <= 6) return;
  await user.click(screen.getByRole("button", { name: "Continuar" }));
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

    await user.click(screen.getByRole("button", { name: "Ver" }));
    expect(screen.getByLabelText("Ver el capítulo")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Guía" }));
    expect(screen.getByTestId("guide-panel")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Leer" }));
    expect(screen.getByLabelText("Texto del capítulo")).toBeInTheDocument();
  });

  it("nace grande y se compacta tras la primera elección", async () => {
    const user = userEvent.setup();
    renderPrototype();

    expect(screen.getByTestId("mode-selector")).toHaveAttribute(
      "data-variant",
      "full",
    );

    await user.click(screen.getByRole("button", { name: /^Escuchar/ }));
    expect(screen.getByTestId("mode-selector")).toHaveAttribute(
      "data-variant",
      "compact",
    );
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
    await user.click(screen.getByRole("button", { name: "Ir al pasaje" }));
    await user.click(screen.getByRole("button", { name: "Continuar" }));
    expect(screen.getByTestId("guide-panel")).toHaveAttribute(
      "data-scene",
      "4",
    );
    expect(screen.getByText("Escucharte por dentro")).toBeInTheDocument();

    // Escena 5 — recall.
    await user.click(
      screen.getByRole("button", { name: "Continuar sin temporizador" }),
    );
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

  it("no ofrece completar el concepto antes de localizar el pasaje", async () => {
    const user = userEvent.setup();
    renderPrototype({ mode: "guide", scene: 3 });

    expect(
      screen.queryByRole("button", { name: "Continuar" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId("passage-located")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Ir al pasaje" }));

    expect(screen.getByTestId("passage-located")).toHaveTextContent(
      "Pasaje localizado",
    );
    expect(
      screen.getByRole("button", { name: "Continuar" }),
    ).toBeInTheDocument();
  });
});

describe("GuidedReadingPrototype — práctica", () => {
  it("no deja confirmar la práctica sin una ruta explícita", async () => {
    const user = userEvent.setup();
    renderPrototype({ mode: "guide", scene: 4 });

    expect(PRACTICE_EXPLICIT_ROUTE_REQUIRED).toBe(true);
    const cta = screen.getByRole("button", { name: "Terminé la práctica" });
    expect(cta).toBeDisabled();

    // Un click sobre el botón deshabilitado no cambia de escena.
    await user.click(cta);
    expect(screen.getByTestId("guide-panel")).toHaveAttribute(
      "data-scene",
      "4",
    );

    await user.click(
      screen.getByRole("button", { name: "Continuar sin temporizador" }),
    );
    expect(cta).toBeEnabled();
  });

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
    expect(
      screen.getByRole("button", { name: "Terminé la práctica" }),
    ).toBeEnabled();
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

  it("durante el feedback el checkpoint Recordar sigue abierto", async () => {
    const user = userEvent.setup();
    renderPrototype();
    await walkTo(user, 6);

    expect(screen.getByText("Recordar · feedback")).toBeInTheDocument();
    // El checkpoint aún no lleva la marca de completado.
    expect(screen.queryByText("✓ Recordar")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Continuar" }));
    expect(screen.getByText("✓ Recordar")).toBeInTheDocument();
  });
});

describe("GuidedReadingPrototype — cierre", () => {
  it("la resonancia y el check-in solo cambian estado local", async () => {
    const user = userEvent.setup();
    renderPrototype({ mode: "guide", scene: 7 });

    expect(screen.getByTestId("evolution-note")).toHaveTextContent(
      "Esta experiencia se registrará en Mi Evolución.",
    );

    await user.click(screen.getByRole("button", { name: "Esto me resonó" }));
    expect(
      screen.getByText(/No se guarda ninguna resonancia/i),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Registrar cómo me siento" }),
    );
    expect(
      screen.getByText(/No se registra ningún check-in/i),
    ).toBeInTheDocument();

    expect(
      screen.getByRole("button", { name: "Ahora no" }),
    ).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(PROTOTYPE_RESONANCE_WRITE).toBe(false);
    expect(PROTOTYPE_CHECKIN_WRITE).toBe(false);
    expect(PROTOTYPE_EVOLUTION_WRITE).toBe(false);
    expect(EMOTIONAL_MAP_WRITE).toBe(false);
  });

  it("«Repetir la guía» reinicia el recorrido completo", async () => {
    const user = userEvent.setup();
    renderPrototype();
    await walkTo(user, 7);

    // Estado sucio antes de repetir.
    await user.click(screen.getByRole("button", { name: "Esto me resonó" }));
    expect(screen.getByText("✓ Concepto")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Repetir la guía" }));

    // Vuelve a la portada, sin checkpoints cerrados.
    expect(screen.getByTestId("guide-panel")).toHaveAttribute(
      "data-scene",
      "1",
    );
    expect(screen.queryByText("✓ Concepto")).not.toBeInTheDocument();
    expect(screen.queryByText("✓ Recordar")).not.toBeInTheDocument();

    // El estado local de las escenas también se reinicia: la práctica vuelve a
    // exigir una ruta explícita y el recall vuelve sin opción elegida.
    await user.click(screen.getByRole("button", { name: "Empezar" }));
    await user.click(screen.getByRole("button", { name: "Continuar" }));
    expect(screen.queryByTestId("passage-located")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Ir al pasaje" }));
    await user.click(screen.getByRole("button", { name: "Continuar" }));
    expect(
      screen.getByRole("button", { name: "Terminé la práctica" }),
    ).toBeDisabled();
  });
});

describe("GuidedReadingPrototype — clip", () => {
  it("«Escuchar solo audio» cambia la representación y permite volver", async () => {
    const user = userEvent.setup();
    renderPrototype({ mode: "guide", scene: 2 });

    const canvas = screen.getByTestId("clip-canvas");
    expect(canvas).toHaveAttribute("data-representation", "video");

    const toggle = screen.getByRole("button", { name: "Escuchar solo audio" });
    expect(toggle).toHaveAttribute("aria-pressed", "false");

    await user.click(toggle);
    expect(screen.getByTestId("clip-canvas")).toHaveAttribute(
      "data-representation",
      "audio",
    );

    const back = screen.getByRole("button", { name: "Volver al video" });
    expect(back).toHaveAttribute("aria-pressed", "true");

    await user.click(back);
    expect(screen.getByTestId("clip-canvas")).toHaveAttribute(
      "data-representation",
      "video",
    );
  });
});

describe("GuidedReadingPrototype — multimedia", () => {
  it("la velocidad modifica el reloj simulado", () => {
    // `fireEvent` en lugar de `userEvent`: con temporizadores falsos el
    // pointer-events asíncrono de user-event se queda esperando.
    vi.useFakeTimers();
    renderPrototype({ mode: "listen" });

    const clock = screen.getByTestId("player-clock");
    expect(clock).toHaveTextContent("04:24");

    fireEvent.click(screen.getByRole("button", { name: /^Reproducir/ }));
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    // A 1× el reloj avanza un segundo por segundo.
    expect(clock).toHaveTextContent("04:26");

    fireEvent.click(screen.getByRole("button", { name: "1.5×" }));
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    // A 1.5× avanza tres segundos en dos.
    expect(clock).toHaveTextContent("04:29");
    expect(screen.getByTestId("simulated-player")).toHaveAttribute(
      "data-speed",
      "1.5",
    );
  });

  it("los subtítulos se ven y «Solo audio» cambia el poster", async () => {
    const user = userEvent.setup();
    renderPrototype({ mode: "watch" });

    // Los subtítulos vienen activos: hay una línea visible sobre el poster.
    expect(screen.getByTestId("video-subtitle")).toBeInTheDocument();
    expect(screen.getByTestId("video-poster")).toHaveAttribute(
      "data-representation",
      "video",
    );

    await user.click(screen.getByRole("button", { name: "Subtítulos" }));
    expect(screen.queryByTestId("video-subtitle")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Solo audio" }));
    expect(screen.getByTestId("video-poster")).toHaveAttribute(
      "data-representation",
      "audio",
    );

    // La transcripción sigue funcionando en cualquier representación.
    await user.click(screen.getByRole("button", { name: "Transcripción" }));
    expect(
      screen.getByText(/Imagina que escuchas un ruido inesperado/),
    ).toBeInTheDocument();
  });

  it("cada modalidad de medios anuncia el destino en Mi Evolución", async () => {
    const user = userEvent.setup();
    renderPrototype({ mode: "listen" });

    expect(screen.getByTestId("evolution-note")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Podcast" }));
    expect(screen.getByTestId("evolution-note")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Ver" }));
    expect(screen.getByTestId("evolution-note")).toBeInTheDocument();
  });
});

describe("GuidedReadingPrototype — aislamiento", () => {
  it("ninguna interacción llama a la red ni escribe en storage", async () => {
    const user = userEvent.setup();
    renderPrototype();

    await user.click(screen.getByRole("button", { name: /^Escuchar/ }));
    await user.click(screen.getByRole("tab", { name: "Podcast" }));
    await user.click(screen.getByRole("button", { name: "Ver" }));
    await user.click(screen.getByRole("button", { name: "Transcripción" }));
    await user.click(screen.getByRole("button", { name: "Solo audio" }));
    await user.click(screen.getByRole("button", { name: "Guía" }));
    await user.click(screen.getByRole("button", { name: "Empezar" }));
    await user.click(screen.getByRole("button", { name: "Reproducir" }));
    await user.click(
      screen.getByRole("button", { name: "Leer transcripción" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Escuchar solo audio" }),
    );
    await user.click(screen.getByRole("button", { name: "Continuar" }));
    await user.click(screen.getByRole("button", { name: "Ir al pasaje" }));

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(setItemSpy).not.toHaveBeenCalled();
  });
});
