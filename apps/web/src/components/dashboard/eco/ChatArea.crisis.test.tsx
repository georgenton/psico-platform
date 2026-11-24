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

vi.mock("@psico/api-client", () => ({
  ecoApi: {
    sendMessage: vi.fn(
      async (_cuerpo: unknown, opts: { onEvent: (e: EcoSseEvent) => void }) => {
        for (const ev of guion) opts.onEvent(ev);
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
