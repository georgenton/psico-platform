import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EcoPersona, EcoSseEvent } from "@psico/types";

import { ChatArea } from "./ChatArea";

/**
 * Del evento de crisis al aviso en pantalla, y los avisos que ya estaban.
 *
 * Lo que emite el servidor lo fija `apps/api/src/eco/crisis-notice.spec.ts`;
 * cómo se pinta, `CrisisModal.test.tsx`. Aquí, que llega entero.
 */

const PERSONA: EcoPersona = { name: "Eco", voice: "Companion.", caps: [] };

let guion: EcoSseEvent[] = [];
let historial: Array<Record<string, unknown>> = [];
/** Cómo acaba el flujo después del guion: se cierra, se cae o no acaba. */
let final: "cierra" | "cae" | "cuelga" = "cierra";

vi.mock("@psico/api-client", () => ({
  // Sin esta clase, el `catch` del chat lanza al preguntar `instanceof` y el
  // rebobinado no llega a ejecutarse.
  ApiError: class ApiError extends Error {
    constructor(
      public statusCode: number,
      message: string,
    ) {
      super(message);
    }
  },
  ecoApi: {
    sendMessage: vi.fn(
      async (_cuerpo: unknown, opts: { onEvent: (e: EcoSseEvent) => void }) => {
        for (const ev of guion) opts.onEvent(ev);
        if (final === "cae") throw new TypeError("network error");
        if (final === "cuelga") await new Promise(() => {});
      },
    ),
  },
  resonancesApi: { confirm: vi.fn() },
}));

vi.mock("@psico/crypto", () => ({
  encryptString: () => ({ ciphertext: "c", nonce: "n" }),
  decryptString: () => "texto",
}));

const crisis = (data: {
  text: string;
  hotline: string;
  country?: string;
}): EcoSseEvent => ({
  event: "crisis",
  data: { crisisPath: "/terapia/crisis", ...data },
});

async function enviar() {
  render(
    <ChatArea
      threadId="t1"
      caps={PERSONA}
      apiBase="http://api.test"
      token="tok"
      ecoKey={new Uint8Array(32).fill(3)}
      onMessageSent={() => {}}
    />,
  );
  const usuario = userEvent.setup();
  await usuario.type(await screen.findByRole("textbox"), "hola");
  await usuario.click(screen.getByRole("button", { name: /enviar/i }));
}

beforeEach(() => {
  guion = [];
  historial = [];
  final = "cierra";
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(globalThis, "fetch").mockImplementation(
    async () =>
      new Response(JSON.stringify({ messages: historial, hasMore: false }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
  );
});
afterEach(() => vi.restoreAllMocks());

describe("el aviso de crisis llega entero", () => {
  it("con número: se puede llamar, y la ayuda se abre en su país", async () => {
    guion = [
      crisis({ text: "Aviso.", hotline: "911 (Ecuador)", country: "EC" }),
    ];
    await enviar();
    await screen.findByRole("alertdialog");
    expect(
      screen.getByRole("link", { name: /llamar ahora · 911 \(ecuador\)/i }),
    ).toHaveAttribute("href", "tel:911");
    expect(
      screen.getByRole("link", { name: /más recursos de ayuda/i }),
    ).toHaveAttribute("href", "/ayuda?pais=EC&desde=eco");
  });

  it("sin número: no se ofrece llamar, y la ayuda se abre en su país", async () => {
    guion = [
      crisis({
        text: "Aviso.",
        hotline: "número de emergencias de tu país",
        country: "CO",
      }),
    ];
    await enviar();
    const dialogo = await screen.findByRole("alertdialog");
    expect(dialogo.querySelector('a[href^="tel:"]')).toBeNull();
    expect(
      screen.getByRole("link", { name: /más recursos de ayuda/i }),
    ).toHaveAttribute("href", "/ayuda?pais=CO&desde=eco");
  });

  it("de una API que todavía no manda el país, tampoco se rompe", async () => {
    guion = [crisis({ text: "Aviso.", hotline: "911" })];
    await enviar();
    await screen.findByRole("alertdialog");
    expect(
      screen.getByRole("link", { name: /más recursos de ayuda/i }),
    ).toHaveAttribute("href", "/ayuda?desde=eco");
  });
});

/**
 * El aviso que ya llegó no se va.
 *
 * Antes se guardaba en una variable y se pintaba al CERRARSE el flujo: si la
 * conexión caía en medio, el rebobinado lo descartaba con el intento.
 */
describe("si llegó, se queda en pantalla", () => {
  const AVISO = crisis({
    text: "Aviso que llegó.",
    hotline: "911 (Ecuador)",
    country: "EC",
  });
  const caja = () => screen.findByRole("textbox");
  /** El aviso, por su diálogo y por su burbuja. */
  async function seVe() {
    const dialogo = await screen.findByRole("alertdialog");
    expect(dialogo).toHaveTextContent("Aviso que llegó.");
    expect(screen.getByRole("link", { name: /llamar ahora/i })).toHaveAttribute(
      "href",
      "tel:911",
    );
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: /entendido/i }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(screen.getAllByText("Aviso que llegó.")).toHaveLength(1);
  }

  it("aunque la conexión caiga después, y lo escrito vuelve como siempre", async () => {
    guion = [AVISO];
    final = "cae";
    await enviar();
    await seVe();
    expect(await caja()).toHaveValue("hola");
    expect(
      screen.getByText("No pudimos enviar tu mensaje. Inténtalo de nuevo."),
    ).toBeInTheDocument();
  });

  it("aunque después llegue un error por el flujo", async () => {
    guion = [
      AVISO,
      {
        event: "error",
        data: { code: "ECO_UNKNOWN", message: "Algo salió mal." },
      },
    ];
    await enviar();
    await seVe();
    expect(screen.queryByText("Algo salió mal.")).not.toBeInTheDocument();
  });

  it("y sin esperar a que el flujo se cierre", async () => {
    guion = [AVISO];
    final = "cuelga";
    await enviar();
    await seVe();
  });

  it("con su cierre normal, se ve una sola vez", async () => {
    guion = [
      AVISO,
      { event: "done", data: { messageId: "m-1", quotaRemaining: 0 } },
    ];
    await enviar();
    await seVe();
    expect(await caja()).toHaveValue("");
  });

  it("sin cierre, también: un hilo que no se pudo guardar no lo manda", async () => {
    guion = [AVISO];
    await enviar();
    await seVe();
    expect(await caja()).toHaveValue("");
  });

  it("si no llegó ninguno, una caída no se inventa uno", async () => {
    final = "cae";
    await enviar();
    expect(await caja()).toHaveValue("hola");
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("tras la caída se puede volver a escribir", async () => {
    guion = [AVISO];
    final = "cae";
    await enviar();
    await seVe();
    final = "cierra";
    guion = [];
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: /enviar/i }));
    expect(await caja()).toHaveValue("");
    // Y el aviso anterior sigue en la conversación.
    expect(screen.getByText("Aviso que llegó.")).toBeInTheDocument();
  });
});

it("un aviso antiguo se relee como se guardó, sin abrir nada", async () => {
  const ANTIGUO = "Aviso antiguo, con la **línea** que se daba entonces.";
  historial = [
    {
      id: "m1",
      kind: "crisis",
      textCiphertext: null,
      textNonce: null,
      assistantText: ANTIGUO,
      suggestedBookId: null,
      createdAt: "2026-06-01T00:00:00.000Z",
    },
  ];
  render(
    <ChatArea
      threadId="t1"
      caps={PERSONA}
      apiBase="http://api.test"
      token="tok"
      ecoKey={new Uint8Array(32).fill(3)}
      onMessageSent={() => {}}
    />,
  );
  expect(await screen.findByText(ANTIGUO)).toBeInTheDocument();
  expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
});
