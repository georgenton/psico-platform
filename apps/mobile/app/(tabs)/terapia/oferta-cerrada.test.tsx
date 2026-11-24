import { fireEvent, render, waitFor } from "@testing-library/react-native";

/**
 * Las pantallas móviles de terapia con la oferta cerrada.
 *
 * Igual que en la web, se observan dos cosas: lo que ve la persona y lo que la
 * pantalla LLEGA A PEDIR. Una que dijera «no se ofrece» después de traer el
 * directorio seguiría teniendo las fichas en memoria.
 */

const mockPush = jest.fn();
const mockApi = {
  getHub: jest.fn(),
  listTherapists: jest.fn(),
  getTherapist: jest.fn(),
  getAvailability: jest.fn(),
  createBooking: jest.fn(),
  listSessions: jest.fn(),
  getSessionPrep: jest.fn(),
  joinSession: jest.fn(),
};
let mockClave: Uint8Array | null = null;

jest.mock("@psico/api-client", () => ({
  terapiaApi: new Proxy(
    {},
    {
      get:
        (_t, k: string) =>
        (...a: unknown[]) =>
          (mockApi as Record<string, jest.Mock>)[k]!(...a),
    },
  ),
}));
jest.mock("expo-router", () => ({
  Stack: { Screen: () => null },
  useRouter: () => ({ push: mockPush, back: jest.fn() }),
  useLocalSearchParams: () => ({ id: "t_marina" }),
  useFocusEffect: () => undefined,
}));
jest.mock("@/crypto/diary-key-context", () => ({
  useDiaryKey: () => ({ key: mockClave }),
}));
jest.mock("@psico/crypto", () => ({
  decryptString: () => "lo que escribí",
  encryptString: jest.fn(),
}));
jest.mock("@/components/dashboard/terapia/RescheduleModal", () => ({
  RescheduleModal: () => null,
}));
jest.mock("@/components/dashboard/terapia/FeedbackModal", () => ({
  FeedbackModal: () => null,
}));
jest.mock("@/config/environment", () => ({
  webOrigin: () => "https://web.invalid",
}));

import HubScreen from "./index";
import SesionesScreen from "./sesiones/index";
import SesionScreen from "./sesiones/[id]";
import PerfilScreen from "./terapeutas/[id]/index";
import ReservarScreen from "./terapeutas/[id]/reservar";
import DirectorioScreen from "./terapeutas/index";

const CERRADA = "Todavía no ofrecemos sesiones de terapia.";
const SIN_HISTORIAL = {
  sessions: false,
  prescriptions: false,
  notifications: false,
};

const hub = (over: Record<string, unknown> = {}) => ({
  intro: CERRADA,
  offer: { open: false },
  history: SIN_HISTORIAL,
  activeTherapist: null,
  nextSession: null,
  recentPrescriptions: [],
  ...over,
});

/** Los métodos que se llamaron, sin repetir. */
const pedidos = () =>
  Object.entries(mockApi)
    .filter(([, f]) => f.mock.calls.length > 0)
    .map(([n]) => n);

beforeEach(() => {
  mockPush.mockReset();
  for (const f of Object.values(mockApi)) f.mockReset();
  mockClave = null;
});

const OFERTA = [
  ["hub", HubScreen],
  ["directorio", DirectorioScreen],
  ["perfil", PerfilScreen],
  ["reservar", ReservarScreen],
] as const;

describe.each(OFERTA)("%s con la oferta cerrada", (_nombre, Pantalla) => {
  it("dice que no se ofrece, lleva a la ayuda y no pide nada más", async () => {
    mockApi.getHub.mockResolvedValue(hub());
    const { getByText, queryByText } = render(<Pantalla />);
    await waitFor(() => expect(getByText(CERRADA)).toBeTruthy());

    expect(pedidos()).toEqual(["getHub"]);
    expect(queryByText(/Encontrar terapeuta|Reservar|Pagar/)).toBeNull();

    fireEvent.press(getByText("Ayuda inmediata"));
    expect(mockPush).toHaveBeenCalledWith("/(tabs)/ayuda");
  });

  it.each([
    ["una API anterior que no publica `offer`", hub({ offer: undefined })],
    ["un `offer` que no es un sí", hub({ offer: {} })],
  ])("y también con %s", async (_caso, respuesta) => {
    mockApi.getHub.mockResolvedValue(respuesta);
    const { getByText } = render(<Pantalla />);
    await waitFor(() => expect(getByText(CERRADA)).toBeTruthy());
    expect(pedidos()).toEqual(["getHub"]);
  });

  it("y también si la API no contesta, diciendo que el historial no se sabe", async () => {
    mockApi.getHub.mockRejectedValue(new Error("sin red"));
    const { getByText, queryByText } = render(<Pantalla />);
    await waitFor(() => expect(getByText(CERRADA)).toBeTruthy());
    expect(getByText(/No pudimos comprobar/)).toBeTruthy();
    // Y no se enlaza lo que no se sabe si existe.
    expect(queryByText("Tu historial")).toBeNull();
    expect(pedidos()).toEqual(["getHub"]);
  });
});

describe("el historial se enlaza sólo si existe", () => {
  it.each([
    ["sessions", "Tus sesiones", "/(tabs)/terapia/sesiones"],
    ["prescriptions", "Lo que te sugirieron", "/(tabs)/terapia/recetas"],
    ["notifications", "Tus avisos", "/(tabs)/terapia/notificaciones"],
  ])("%s", async (clave, texto, ruta) => {
    mockApi.getHub.mockResolvedValue(
      hub({ history: { ...SIN_HISTORIAL, [clave]: true } }),
    );
    const { getByText, queryByText } = render(<HubScreen />);
    await waitFor(() => expect(getByText(texto)).toBeTruthy());
    for (const otro of ["Tus sesiones", "Lo que te sugirieron", "Tus avisos"]) {
      if (otro !== texto) expect(queryByText(otro)).toBeNull();
    }
    fireEvent.press(getByText(texto));
    expect(mockPush).toHaveBeenCalledWith(ruta);
  });

  it("sin historial no hay sección", async () => {
    mockApi.getHub.mockResolvedValue(hub());
    const { getByText, queryByText } = render(<HubScreen />);
    await waitFor(() => expect(getByText(CERRADA)).toBeTruthy());
    expect(queryByText("Tu historial")).toBeNull();
    expect(queryByText(/No pudimos comprobar/)).toBeNull();
  });
});

describe("con la oferta abierta (control contrario)", () => {
  const abierta = hub({ intro: "Intro", offer: { open: true } });

  it("el hub ofrece buscar terapeuta", async () => {
    mockApi.getHub.mockResolvedValue(abierta);
    const { getByText, queryByText } = render(<HubScreen />);
    await waitFor(() => expect(getByText("Encontrar terapeuta")).toBeTruthy());
    expect(queryByText(CERRADA)).toBeNull();
  });

  it("una próxima sesión de demostración no se anuncia", async () => {
    const siguiente = (isDemo: boolean) => ({
      id: "s1",
      therapist: { name: "Nombre", isDemo },
      scheduledAt: "2026-11-30T15:00:00.000Z",
      durationMin: 50,
      modality: "INDIVIDUAL",
    });
    mockApi.getHub.mockResolvedValue({
      ...abierta,
      nextSession: siguiente(true),
    });
    const demo = render(<HubScreen />);
    await waitFor(() =>
      expect(demo.getByText("Encontrar terapeuta")).toBeTruthy(),
    );
    expect(demo.queryByText("Tu próxima sesión")).toBeNull();
    demo.unmount();

    mockApi.getHub.mockResolvedValue({
      ...abierta,
      nextSession: siguiente(false),
    });
    const real = render(<HubScreen />);
    await waitFor(() =>
      expect(real.getByText("Tu próxima sesión")).toBeTruthy(),
    );
  });

  it("el perfil se monta y pide la ficha", async () => {
    mockApi.getHub.mockResolvedValue(abierta);
    mockApi.getTherapist.mockResolvedValue({
      id: "pro",
      name: "Nombre Apellido",
      title: "T",
      priceUsd: 40,
      currency: "USD",
      bioShort: "Bio",
      bioLong: null,
      specialties: [],
      modalities: ["INDIVIDUAL"],
      languages: [],
      isFavorite: false,
    });
    const { getByText } = render(<PerfilScreen />);
    await waitFor(() => expect(getByText("Reservar sesión →")).toBeTruthy());
  });
});

describe("la lista de sesiones", () => {
  const fila = {
    id: "s1",
    therapist: { name: "Nombre", isDemo: false },
    scheduledAt: "2026-11-30T15:00:00.000Z",
    durationMin: 50,
    status: "COMPLETED",
  };

  it("vacía y cerrada: no se ofrece, y no invita a buscar", async () => {
    mockApi.listSessions.mockResolvedValue({
      upcoming: [],
      past: [],
      offer: { open: false },
    });
    const { getByText, queryByText } = render(<SesionesScreen />);
    await waitFor(() => expect(getByText(CERRADA)).toBeTruthy());
    expect(queryByText(/Buscar terapeuta/)).toBeNull();
    // Ya se está dentro del historial: no hay nada que no se haya podido saber.
    expect(queryByText(/No pudimos comprobar/)).toBeNull();
  });

  it("una API que no publica `offer` cuenta como cerrada", async () => {
    mockApi.listSessions.mockResolvedValue({ upcoming: [], past: [] });
    const { getByText } = render(<SesionesScreen />);
    await waitFor(() => expect(getByText(CERRADA)).toBeTruthy());
  });

  it("con historial, se enseña", async () => {
    mockApi.listSessions.mockResolvedValue({
      upcoming: [],
      past: [fila],
      offer: { open: false },
    });
    const { getByText } = render(<SesionesScreen />);
    await waitFor(() => expect(getByText("Nombre")).toBeTruthy());
  });

  it("vacía y abierta, sí invita (control contrario)", async () => {
    mockApi.listSessions.mockResolvedValue({
      upcoming: [],
      past: [],
      offer: { open: true },
    });
    const { getByText } = render(<SesionesScreen />);
    await waitFor(() => expect(getByText(/Buscar terapeuta/)).toBeTruthy());
  });
});

describe("el detalle de una sesión", () => {
  const prep = ({
    isDemo = false,
    open = false,
    paymentStatus = "PAID",
    scheduledAt = new Date().toISOString(),
    intentionCiphertext = null as string | null,
  } = {}) => ({
    session: {
      id: "s1",
      therapist: { id: "t", name: "Nombre", isDemo },
      scheduledAt,
      durationMin: 50,
      modality: "INDIVIDUAL",
      joinUrl: null,
      paymentStatus,
      status: "SCHEDULED",
    },
    prep: {
      intentionCiphertext,
      intentionNonce: intentionCiphertext ? "n" : null,
      checkInMood: null,
      sharedEntryIds: [],
    },
    offer: { open },
  });

  it("real, con la oferta cerrada: se entra y se cancela, no se mueve", async () => {
    mockApi.getSessionPrep.mockResolvedValue(prep());
    const { getByText, queryByText } = render(<SesionScreen />);
    await waitFor(() => expect(getByText("Unirse a la sala")).toBeTruthy());
    expect(queryByText("Re-agendar")).toBeNull();
    expect(getByText("Cancelar")).toBeTruthy();
  });

  it("real, con una API que no publica `offer`: no se mueve", async () => {
    mockApi.getSessionPrep.mockResolvedValue({ ...prep(), offer: undefined });
    const { getByText, queryByText } = render(<SesionScreen />);
    await waitFor(() => expect(getByText("Cancelar")).toBeTruthy());
    expect(queryByText("Re-agendar")).toBeNull();
  });

  it("real y sin pagar, con la oferta cerrada: se dice", async () => {
    mockApi.getSessionPrep.mockResolvedValue(
      prep({ paymentStatus: "PENDING" }),
    );
    const { getByText } = render(<SesionScreen />);
    await waitFor(() =>
      expect(getByText(/Esta sesión no se puede pagar ahora/)).toBeTruthy(),
    );
  });

  it("real, con la oferta abierta: se mueve (control contrario)", async () => {
    mockApi.getSessionPrep.mockResolvedValue(prep({ open: true }));
    const { getByText } = render(<SesionScreen />);
    await waitFor(() => expect(getByText("Re-agendar")).toBeTruthy());
  });

  it.each([true, false])(
    "de demostración, con la oferta abierta=%s: no se entra ni se mueve",
    async (open) => {
      mockApi.getSessionPrep.mockResolvedValue(prep({ isDemo: true, open }));
      const { getByText, queryByText } = render(<SesionScreen />);
      await waitFor(() =>
        expect(getByText(/perfil de demostración/)).toBeTruthy(),
      );
      expect(queryByText("Unirse a la sala")).toBeNull();
      expect(queryByText("Re-agendar")).toBeNull();
      expect(queryByText("Pre-sesión")).toBeNull();
      expect(queryByText(/La sala se abre/)).toBeNull();
      expect(getByText("Cancelar")).toBeTruthy();
    },
  );

  it("de demostración: lo que ya escribió se lee", async () => {
    mockClave = new Uint8Array(32);
    mockApi.getSessionPrep.mockResolvedValue(
      prep({ isDemo: true, intentionCiphertext: "c" }),
    );
    const { getByText } = render(<SesionScreen />);
    await waitFor(() => expect(getByText("lo que escribí")).toBeTruthy());
  });
});
