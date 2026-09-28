import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { ecoErrorCopy, vozErrorCopy } from "@psico/types";

import { VozRecorder } from "../VozRecorder";

/**
 * Lo que una persona lee cuando algo falla.
 *
 * EL FALLO QUE ESTO IMPIDE (#741). Con el proveedor caído, la pantalla de Voz
 * enseñaba `WHISPER_HTTP_401` en rojo, bajo los botones. No es sólo ilegible:
 * nombra al proveedor y su código de estado a quien sólo quería grabar una
 * nota. Pasaba porque el componente prefería el `message` del servidor sobre su
 * propio texto, que ya estaba escrito y bien redactado.
 *
 * La prueba del código DESCONOCIDO es la que importa de verdad. Arreglar sólo
 * los dos códigos que vimos dejaría pasar el siguiente; lo que se comprueba es
 * que ningún texto del servidor llega a la pantalla, se llame como se llame.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/lib/voice/handoff", () => ({ setVoiceHandoff: vi.fn() }));

// El grabador real toca MediaRecorder; aquí sólo hace falta que exista y que
// entregue un audio para que el componente intente transcribirlo.
const grabadora = {
  state: {
    phase: "stopped" as string,
    blob: new Blob(["x"]),
    mimeType: "audio/webm",
    elapsedMs: 3000,
    error: null as string | null,
  },
  start: vi.fn(),
  stop: vi.fn(),
  reset: vi.fn(),
};
vi.mock("@/lib/voice/use-recorder", () => ({
  useRecorder: () => grabadora,
  formatDuration: (ms: number) => `0:0${Math.round(ms / 1000)}`,
  MAX_RECORDING_MS: 600000,
}));

const fetchSpy = vi.spyOn(globalThis, "fetch");

beforeEach(() => {
  fetchSpy.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

/** Responde al POST de transcripción con el sobre que se le pase. */
function servidorResponde(status: number, cuerpo: Record<string, unknown>) {
  fetchSpy.mockResolvedValue({
    ok: false,
    status,
    json: async () => cuerpo,
  } as unknown as Response);
}

async function transcribir() {
  render(<VozRecorder apiBase="http://api.test/api" token="tok" />);
  const boton = await screen.findByRole("button", { name: /Transcribir/i });
  boton.click();
}

describe("el código interno del servidor no llega a la pantalla", () => {
  it("el fallo del proveedor no enseña WHISPER_HTTP_401 ni nombra a nadie", async () => {
    // El sobre exacto que devolvió QA cuando la clave de Whisper era un stub.
    servidorResponde(502, {
      statusCode: 502,
      code: "ERROR",
      message: "WHISPER_HTTP_401",
    });
    await transcribir();

    await waitFor(() =>
      expect(screen.getByText(vozErrorCopy(502).message)).toBeVisible(),
    );
    expect(document.body.textContent).not.toContain("WHISPER_HTTP_401");
    expect(document.body.textContent).not.toMatch(/whisper/i);
    expect(document.body.textContent).not.toContain("401");
  });

  it("y tampoco un código que todavía no existe", async () => {
    // El caso que impide «arreglarlo» tapando los dos strings conocidos.
    servidorResponde(502, {
      statusCode: 502,
      code: "ERROR",
      message: "VERY_INTERNAL_NEW_ERROR_XYZ",
    });
    await transcribir();

    await waitFor(() =>
      expect(screen.getByText(vozErrorCopy(502).message)).toBeVisible(),
    );
    expect(document.body.textContent).not.toContain(
      "VERY_INTERNAL_NEW_ERROR_XYZ",
    );
  });

  it("el diagnóstico sí queda en la consola, que es donde sirve", async () => {
    const consola = vi.spyOn(console, "error").mockImplementation(() => {});
    servidorResponde(502, { code: "ERROR", message: "WHISPER_HTTP_401" });
    await transcribir();

    await waitFor(() => expect(consola).toHaveBeenCalled());
    const registrado = JSON.stringify(consola.mock.calls);
    expect(registrado).toContain("WHISPER_HTTP_401");
  });

  it("los estados con pantalla propia siguen teniendo la suya", async () => {
    servidorResponde(403, {
      code: "VOICE_REQUIRES_PRO",
      message: "irrelevante",
    });
    await transcribir();

    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: /Voz es Pro/i }),
      ).toBeVisible(),
    );
    expect(screen.getByText(vozErrorCopy(403).message)).toBeVisible();
    expect(document.body.textContent).not.toContain("irrelevante");
  });
});

describe("el catálogo de frases", () => {
  it("nunca devuelve un código de máquina, pase lo que pase", () => {
    const sospechoso =
      /HTTP_|_ERROR|ERR_|[A-Z]{4,}_[A-Z]{3,}|whisper|anthropic|openai/i;
    const estados = [
      null,
      0,
      400,
      401,
      402,
      403,
      404,
      413,
      415,
      429,
      500,
      502,
      503,
      999,
    ];
    for (const s of estados) {
      for (const copy of [
        vozErrorCopy(s as number | null),
        ecoErrorCopy(s as number | null),
      ]) {
        expect(copy.message).not.toMatch(sospechoso);
        // Una frase, no un token: empieza en mayúscula y termina en punto.
        expect(copy.message).toMatch(/^[A-ZÁÉÍÓÚ¿¡].*[.!?]$/);
      }
    }
  });

  it("un estado desconocido cae al genérico, no a un hueco", () => {
    expect(vozErrorCopy(599).message).toBe(vozErrorCopy(null).message);
    expect(ecoErrorCopy(599).message).toBe(ecoErrorCopy(null).message);
  });
});
