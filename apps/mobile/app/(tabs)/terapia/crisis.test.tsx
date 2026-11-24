import { Linking } from "react-native";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import { getCrisisFor, recursosDeAyuda } from "@psico/types";
import type { CrisisCountry, CrisisResponse } from "@psico/types";

/**
 * La ayuda inmediata en móvil, por lo que alguien puede HACER con ella.
 *
 * Los números esperados están escritos a mano: cambiar uno tiene que verse.
 */

const mockGetCrisis = jest.fn();
jest.mock("@psico/api-client", () => ({
  terapiaApi: { getCrisis: (...a: unknown[]) => mockGetCrisis(...a) },
}));

let mockParams: { pais?: string } = {};
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => mockParams,
}));

import CrisisScreen from "./crisis";

const abrir = jest.spyOn(Linking, "openURL").mockResolvedValue(true);
jest.spyOn(Linking, "canOpenURL").mockResolvedValue(true);

beforeEach(() => {
  mockParams = {};
  abrir.mockClear();
  mockGetCrisis.mockReset();
  mockGetCrisis.mockRejectedValue(new Error("sin red"));
});

/** Monta y deja que se resuelva la respuesta de la API, si la hay. */
async function montar() {
  render(<CrisisScreen />);
  await act(async () => undefined);
}

describe("sin red", () => {
  it.each([
    ["EC", "ECU 911 · Emergencias", "Llamar 911", "tel:911"],
    ["CO", "Línea 106 · Ministerio de Salud", "Llamar 106", "tel:106"],
    ["MX", "SAPTEL", "Llamar +52-55-5259-8121", "tel:+52-55-5259-8121"],
  ])("%s se ve igual, y llama", async (pais, nombre, boton, tel) => {
    mockParams = { pais };
    await montar();
    expect(screen.getByText(nombre)).toBeOnTheScreen();
    fireEvent.press(screen.getByText(boton));
    await waitFor(() => expect(abrir).toHaveBeenCalledWith(tel));
  });

  it("dice la salvedad, la fuente y la fecha, y enlaza a la fuente", async () => {
    mockParams = { pais: "MX" };
    await montar();
    expect(screen.getByText("Horario sin confirmar · es")).toBeOnTheScreen();
    expect(screen.getByText("Servicio gratuito")).toBeOnTheScreen();
    expect(
      screen.getByText(
        "Su sitio publica dos horarios: 24 horas y de 9:00 a 21:00",
      ),
    ).toBeOnTheScreen();
    expect(
      screen.getByText(/Fuente: saptel\.org\.mx · comprobado el 24 nov 2026/),
    ).toBeOnTheScreen();
    fireEvent.press(screen.getByText("saptel.org.mx"));
    expect(abrir).toHaveBeenCalledWith("https://www.saptel.org.mx/");
  });

  it("deja elegir país, y empieza en Ecuador si no consta o no se conoce", async () => {
    mockParams = { pais: "ZZ" };
    await montar();
    expect(screen.getByText("Líneas en Ecuador")).toBeOnTheScreen();
    await act(async () => {
      fireEvent.press(screen.getByText("Colombia"));
    });
    expect(screen.getByText("Líneas en Colombia")).toBeOnTheScreen();
    expect(screen.queryByText("ECU 911 · Emergencias")).toBeNull();
  });

  it("ya montada, si se vuelve con otro país enseña ése", async () => {
    mockParams = { pais: "EC" };
    await montar();
    mockParams = { pais: "MX" };
    await act(async () => {
      screen.rerender(<CrisisScreen />);
    });
    expect(screen.getByText("Líneas en México")).toBeOnTheScreen();
  });

  it("no pinta nada que no esté publicado", async () => {
    for (const pais of ["EC", "CO", "MX"] as CrisisCountry[]) {
      mockParams = { pais };
      await montar();
      const sinPublicar = recursosDeAyuda(pais).filter(
        (r) => r.estado !== "publicado",
      );
      expect(sinPublicar.length).toBeGreaterThan(0);
      for (const { linea } of sinPublicar) {
        expect(screen.queryByText(linea.name)).toBeNull();
      }
      screen.unmount();
    }
  });

  it("no promete que alguien responde, y dice lo que FeelVerse no es", async () => {
    await montar();
    expect(screen.queryByText(/ahora mismo|te pueden escuchar/i)).toBeNull();
    expect(
      screen.getByText(/FeelVerse no es un servicio de emergencias/),
    ).toBeOnTheScreen();
  });

  it("ofrece el directorio como directorio", async () => {
    await montar();
    expect(screen.getByText(/No es un chat ni atiende/)).toBeOnTheScreen();
    fireEvent.press(screen.getByText("findahelpline.com"));
    expect(abrir).toHaveBeenCalledWith("https://findahelpline.com");
  });
});

describe("con lo que sirve la API", () => {
  const responder = (cambio: Partial<CrisisResponse>) =>
    mockGetCrisis.mockResolvedValue({ ...getCrisisFor("EC"), ...cambio });

  it("la sustituye: es lo que se corrige sin publicar otra versión", async () => {
    const [linea] = getCrisisFor("EC").lines;
    responder({ lines: [{ ...linea!, name: "Corregida en el servidor" }] });
    await montar();
    expect(mockGetCrisis).toHaveBeenCalledWith("EC");
    expect(
      await screen.findByText("Corregida en el servidor"),
    ).toBeOnTheScreen();
  });

  it("sin líneas no se rompe, y lo dice", async () => {
    responder({ lines: [] });
    await montar();
    expect(
      await screen.findByText(
        "Ahora no tenemos una línea comprobada en Ecuador.",
      ),
    ).toBeOnTheScreen();
  });

  it("una API anterior, sin fuentes, no trae de vuelta lo retirado", async () => {
    // Lo que mandaba antes de la fuente común: líneas sin `source`. Volver a
    // esa imagen de la API no puede volver a pintar esos números.
    responder({
      lines: [
        {
          id: "vieja",
          name: "Línea vieja",
          phone: "+593-2-000-0000",
          availability: "24/7",
          languages: ["es"],
        },
      ],
    });
    await montar();
    expect(screen.queryByText("Línea vieja")).toBeNull();
    expect(screen.getByText("ECU 911 · Emergencias")).toBeOnTheScreen();
  });

  it("ni la respuesta de otro país", async () => {
    mockGetCrisis.mockResolvedValue(getCrisisFor("MX"));
    await montar();
    expect(screen.queryByText("SAPTEL")).toBeNull();
    expect(screen.getByText("ECU 911 · Emergencias")).toBeOnTheScreen();
  });

  it("una línea que no se puede marcar no finge un botón", async () => {
    const [linea] = getCrisisFor("EC").lines;
    responder({ lines: [{ ...linea!, phone: "Busca tu línea local" }] });
    await montar();
    expect(
      await screen.findByText("Llama al Busca tu línea local"),
    ).toBeOnTheScreen();
    expect(screen.queryByText(/^Llamar /)).toBeNull();
  });

  it("marca con el criterio común, no quitando letras a mano", async () => {
    const [linea] = getCrisisFor("EC").lines;
    responder({ lines: [{ ...linea!, phone: "171 (opción 6)" }] });
    await montar();
    fireEvent.press(await screen.findByText("Llamar 171 (opción 6)"));
    // Saneado a mano era `tel:1716`.
    await waitFor(() => expect(abrir).toHaveBeenCalledWith("tel:171"));
  });
});
