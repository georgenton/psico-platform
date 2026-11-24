import { Linking } from "react-native";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import type { EcoSseEvent } from "@psico/types";

import { EcoChat } from "./EcoChat";

/**
 * El aviso que ya llegó no se va.
 *
 * Antes se guardaba en una variable y se pintaba al CERRARSE el flujo: si la
 * conexión caía en medio, el rebobinado lo descartaba con el intento. Los
 * mismos casos que `ChatArea.crisis.test.tsx` en la web.
 */

let mockGuion: EcoSseEvent[] = [];
/** Cómo acaba el flujo después del guion: se cierra, se cae o no acaba. */
let mockFinal: "cierra" | "cae" | "cuelga" = "cierra";

jest.mock("@psico/api-client", () => ({
  ApiError: class ApiError extends Error {},
  apiClient: { getAccessToken: () => "tok" },
  ecoApi: {
    getThread: jest.fn(async () => ({ messages: [], hasMore: false })),
    sendMessage: jest.fn(
      async (_cuerpo: unknown, opts: { onEvent: (e: EcoSseEvent) => void }) => {
        for (const ev of mockGuion) opts.onEvent(ev);
        if (mockFinal === "cae") throw new TypeError("Network request failed");
        if (mockFinal === "cuelga") await new Promise(() => {});
      },
    ),
  },
  resonancesApi: { confirm: jest.fn() },
}));

jest.mock("@psico/crypto", () => ({
  encryptString: () => ({ ciphertext: "c", nonce: "n" }),
  decryptString: () => "lo que escribió",
}));

jest.mock("@/config/environment", () => ({
  apiOrigin: () => "http://api.test",
}));

const AVISO: EcoSseEvent = {
  event: "crisis",
  data: {
    text: "Aviso que llegó.",
    hotline: "911 (Ecuador)",
    crisisPath: "/terapia/crisis",
    country: "EC",
  },
};

const abrir = jest.spyOn(Linking, "openURL").mockResolvedValue(true);

beforeEach(() => {
  mockGuion = [];
  mockFinal = "cierra";
  abrir.mockClear();
  jest.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  jest.mocked(console.error).mockRestore();
});

const caja = () => screen.getByPlaceholderText(/Escribe/i);

async function enviar(texto = "hola") {
  render(<EcoChat threadId="t1" ecoKey={new Uint8Array(32).fill(3)} />);
  await waitFor(() => expect(caja()).toBeOnTheScreen());
  fireEvent.changeText(caja(), texto);
  await act(async () => {
    fireEvent.press(screen.getByText("send"));
  });
}

/** El aviso, por su ventana y por su burbuja. */
async function seVe() {
  await waitFor(() =>
    expect(screen.getByText("Estamos contigo")).toBeOnTheScreen(),
  );
  fireEvent.press(screen.getByText("📞 Llamar · 911 (Ecuador)"));
  expect(abrir).toHaveBeenCalledWith("tel:911");
  fireEvent.press(screen.getByText("Entendido"));
  expect(screen.queryByText("Estamos contigo")).toBeNull();
  expect(screen.getAllByText("Aviso que llegó.")).toHaveLength(1);
}

describe("si llegó, se queda en pantalla", () => {
  it("aunque la conexión caiga después, y lo escrito vuelve como siempre", async () => {
    mockGuion = [AVISO];
    mockFinal = "cae";
    await enviar();
    await seVe();
    expect(caja().props.value).toBe("hola");
    expect(
      screen.getByText("No pudimos enviar tu mensaje. Inténtalo de nuevo."),
    ).toBeOnTheScreen();
  });

  it("aunque después llegue un error por el flujo", async () => {
    mockGuion = [
      AVISO,
      {
        event: "error",
        data: { code: "ECO_UNKNOWN", message: "Algo salió mal." },
      },
    ];
    await enviar();
    await seVe();
  });

  it("y sin esperar a que el flujo se cierre", async () => {
    mockGuion = [AVISO];
    mockFinal = "cuelga";
    await enviar();
    await seVe();
  });

  it("con su cierre normal, se ve una sola vez", async () => {
    mockGuion = [
      AVISO,
      { event: "done", data: { messageId: "m-1", quotaRemaining: 0 } },
    ];
    await enviar();
    await seVe();
    expect(caja().props.value).toBe("");
  });

  it("si no llegó ninguno, una caída no se inventa uno", async () => {
    mockFinal = "cae";
    await enviar();
    await waitFor(() => expect(caja().props.value).toBe("hola"));
    expect(screen.queryByText("Estamos contigo")).toBeNull();
  });
});
