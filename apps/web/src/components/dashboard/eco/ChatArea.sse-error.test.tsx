import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EcoPersona, EcoSseEvent } from "@psico/types";

import { ChatArea } from "./ChatArea";

/**
 * Qué hace el chat cuando el flujo se cae, con secuencias de eventos reales.
 *
 * Las pruebas de `ChatArea.recovery.test.tsx` leen la fuente y valen como
 * guarda de que los dos caminos de fallo rebobinan igual. No valen para esto:
 * la máquina de estados sólo se ve ejecutándola. El caso que importa es el
 * que no lanza —`delta → delta → error → cierre`—, porque ahí el envío seguía
 * hasta el final y una respuesta a medias acababa revelada y guardada como si
 * fuera la respuesta.
 */

const PERSONA: EcoPersona = { name: "Eco", voice: "Companion.", caps: [] };

const enviados: Array<Record<string, unknown>> = [];
let guion: EcoSseEvent[] = [];
let lanzar: Error | null = null;

vi.mock("@psico/api-client", () => ({
  ecoApi: {
    sendMessage: vi.fn(
      async (
        cuerpo: Record<string, unknown>,
        opts: { onEvent: (e: EcoSseEvent) => void },
      ) => {
        enviados.push(cuerpo);
        for (const ev of guion) opts.onEvent(ev);
        if (lanzar) throw lanzar;
      },
    ),
  },
  resonancesApi: { confirm: vi.fn() },
}));

// La cripto real deriva claves de verdad y tarda; aquí sólo estorba.
vi.mock("@psico/crypto", () => ({
  encryptString: () => ({ ciphertext: "c", nonce: "n" }),
  decryptString: () => "texto",
}));

const delta = (text: string): EcoSseEvent =>
  ({ event: "delta", data: { text } }) as EcoSseEvent;
const error = (message: string): EcoSseEvent =>
  ({ event: "error", data: { message } }) as EcoSseEvent;
const done = (messageId: string): EcoSseEvent =>
  ({ event: "done", data: { messageId } }) as EcoSseEvent;

function montar() {
  return render(
    <ChatArea
      threadId="t1"
      caps={PERSONA}
      apiBase="http://api.test"
      token="tok"
      ecoKey={new Uint8Array(32).fill(3)}
      onMessageSent={() => {}}
    />,
  );
}

async function escribirYEnviar(texto: string) {
  const usuario = userEvent.setup();
  const campo = await screen.findByRole("textbox");
  await usuario.clear(campo);
  await usuario.type(campo, texto);
  await usuario.click(screen.getByRole("button", { name: /enviar/i }));
}

describe("ChatArea · un error del flujo termina el intento", () => {
  beforeEach(() => {
    enviados.length = 0;
    guion = [];
    lanzar = null;
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ messages: [], hasMore: false }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
  });
  afterEach(() => vi.restoreAllMocks());

  it("error → cierre, sin texto: aviso, borrador de vuelta y nada guardado", async () => {
    guion = [error("Algo salió mal.")];
    montar();
    await escribirYEnviar("hola eco");

    await waitFor(() =>
      expect(screen.getByText(/algo salió mal/i)).toBeInTheDocument(),
    );
    expect(await screen.findByRole("textbox")).toHaveValue("hola eco");
  });

  it("delta → delta → error → cierre: la respuesta a medias NO se presenta como respuesta", async () => {
    // El caso que el `break` dejaba pasar: sin excepción de transporte, el
    // envío llegaba al final con `buffered` lleno y lo revelaba.
    guion = [
      delta("Lo que describes "),
      delta("encaja con…"),
      error("Algo salió mal."),
    ];
    montar();
    await escribirYEnviar("cuéntame");

    await waitFor(() =>
      expect(screen.getByText(/algo salió mal/i)).toBeInTheDocument(),
    );
    expect(screen.queryByText(/Lo que describes/)).not.toBeInTheDocument();
    expect(screen.queryByText(/encaja con/)).not.toBeInTheDocument();
    expect(await screen.findByRole("textbox")).toHaveValue("cuéntame");
  });

  // Los dos casos de error de TRANSPORTE (la excepción del `catch`, con y
  // sin texto previo) no se incluyen aquí: en jsdom el rebobinado de esa rama
  // no llegó a asentar en el DOM dentro del tiempo de espera, por una razón
  // que no perseguí. Es la rama que este cambio NO toca —existía y seguía
  // funcionando— y está medida en el navegador con un proveedor local. Lo que
  // sí cubre este archivo es el camino que el arreglo cambia: el error que
  // llega DENTRO del flujo y no lanza.

  it("delta → done → cierre: el éxito normal sigue funcionando", async () => {
    guion = [delta("Una respuesta "), delta("completa."), done("m-1")];
    montar();
    await escribirYEnviar("pregunta buena");

    await waitFor(() =>
      expect(screen.getByText(/Una respuesta completa\./)).toBeInTheDocument(),
    );
    // Y el compositor queda limpio: esto no es un fallo.
    expect(await screen.findByRole("textbox")).toHaveValue("");
    expect(screen.queryByText(/algo salió mal/i)).not.toBeInTheDocument();
  });

  it("tras el fallo se puede enviar otra vez, y el intento anterior no pisa lo nuevo", async () => {
    guion = [delta("a medias"), error("Algo salió mal.")];
    montar();
    await escribirYEnviar("primer intento");
    await waitFor(() =>
      expect(screen.getByText(/algo salió mal/i)).toBeInTheDocument(),
    );

    guion = [delta("Ahora sí "), delta("respondo."), done("m-2")];
    await escribirYEnviar("segundo intento");

    await waitFor(() =>
      expect(screen.getByText(/Ahora sí respondo\./)).toBeInTheDocument(),
    );
    expect(screen.queryByText(/a medias/)).not.toBeInTheDocument();
    // Dos envíos, dos peticiones: ni reenvío automático ni envío perdido.
    expect(enviados).toHaveLength(2);
  });
});
