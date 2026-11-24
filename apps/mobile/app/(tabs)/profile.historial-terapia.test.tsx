import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { ScrollView } from "react-native";

/**
 * Quien ya tenía algo de terapia puede volver a verlo desde Perfil.
 *
 * Aquí pesa más que en la web: la pestaña de Terapia se retiró y en el teléfono
 * no hay barra de direcciones, así que sin esta fila una sesión ya reservada no
 * se podía ver ni cancelar de ninguna manera.
 *
 * Y lo contrario pesa igual: quien no tiene nada —o cuando no se sabe— no ve la
 * palabra «terapia» en Perfil.
 */

const mockPush = jest.fn();
const mockGetMe = jest.fn();
const mockGetHub = jest.fn();
const mockFoco: { volver: () => void } = { volver: () => undefined };

declare function require(id: "react"): {
  useEffect: (cb: () => unknown, deps: unknown[]) => void;
};

jest.mock("@psico/api-client", () => ({
  usersApi: { getMe: () => mockGetMe() },
  terapiaApi: { getHub: () => mockGetHub() },
  ApiError: class extends Error {},
}));
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush }),
  useFocusEffect: (cb: () => unknown) => {
    mockFoco.volver = () => void cb();
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require("react").useEffect(cb, [cb]);
  },
}));
jest.mock("@/context/auth", () => {
  const user = { id: "u1", name: "Ana", email: "a@example.com", plan: "FREE" };
  return { useAuth: () => ({ user, logout: jest.fn() }) };
});

import ProfileScreen from "./profile";

const ME = {
  user: { id: "u1", firstName: "Ana", email: "a@example.com", initials: "A" },
  stats: {
    daysActive: 0,
    booksCompleted: 0,
    chaptersRead: 0,
    diaryEntries: 0,
    minutesTotal: 0,
    currentStreakDays: 0,
    longestStreakDays: 0,
  },
  achievements: [],
  privacy: { dataExportRequested: null, accountDeleteRequested: null },
};

const SIN_HISTORIAL = {
  sessions: false,
  prescriptions: false,
  notifications: false,
};

const hub = (over: Record<string, unknown> = {}) => ({
  intro: "",
  offer: { open: false },
  history: SIN_HISTORIAL,
  activeTherapist: null,
  nextSession: null,
  recentPrescriptions: [],
  ...over,
});
const CON_SESIONES = hub({ history: { ...SIN_HISTORIAL, sessions: true } });

const TITULO = "Tu historial de terapia";

/** Perfil pintado de verdad —con sus tarjetas— y las dos lecturas resueltas. */
async function montar() {
  const vista = render(<ProfileScreen />);
  await waitFor(() =>
    expect(vista.getByText("Correo de la cuenta")).toBeTruthy(),
  );
  await waitFor(() => expect(mockGetHub).toHaveBeenCalled());
  await act(async () => undefined);
  return vista;
}

beforeEach(() => {
  mockPush.mockReset();
  mockGetMe.mockReset().mockResolvedValue(ME);
  mockGetHub.mockReset();
});

describe("quien tiene historial lo encuentra en Perfil", () => {
  it.each(["sessions", "prescriptions", "notifications"])(
    "basta con %s",
    async (clave) => {
      mockGetHub.mockResolvedValue(
        hub({ history: { ...SIN_HISTORIAL, [clave]: true } }),
      );
      const { getByText } = await montar();
      expect(
        getByText(
          "Lo que ya tenías sigue aquí. Hoy no se ofrecen sesiones nuevas.",
        ),
      ).toBeTruthy();
      fireEvent.press(getByText(TITULO));
      expect(mockPush).toHaveBeenCalledWith("/(tabs)/terapia");
    },
  );

  it("con la oferta abierta sigue ahí, sin decir que no se ofrece", async () => {
    mockGetHub.mockResolvedValue({ ...CON_SESIONES, offer: { open: true } });
    const { getByText, queryByText } = await montar();
    expect(getByText(TITULO)).toBeTruthy();
    expect(getByText("Lo que ya tenías sigue aquí.")).toBeTruthy();
    expect(queryByText(/no se ofrece/)).toBeNull();
  });
});

describe("quien no tiene, o si no se sabe, no ve nada", () => {
  it.each([
    ["sin historial", () => Promise.resolve(hub())],
    [
      "sin historial y con la oferta abierta",
      () => Promise.resolve(hub({ offer: { open: true } })),
    ],
    [
      "una API que no publica el historial",
      () => Promise.resolve(hub({ history: undefined })),
    ],
    ["la lectura falla", () => Promise.reject(new Error("sin red"))],
    ["la lectura no termina", () => new Promise(() => undefined)],
  ])("%s", async (_caso, respuesta) => {
    mockGetHub.mockImplementation(respuesta);
    const { getByText, queryByText } = await montar();
    // Control: Perfil está entero, con sus ajustes.
    expect(getByText("Seguridad")).toBeTruthy();
    expect(queryByText(/terapia|terapeuta/i)).toBeNull();
  });
});

describe("la lectura se repite, y lo que se enseña es lo último que se supo", () => {
  it("al volver a Perfil, tras un fallo, aparece", async () => {
    mockGetHub.mockRejectedValueOnce(new Error("sin red"));
    const { queryByText, findByText } = await montar();
    expect(queryByText(TITULO)).toBeNull();

    mockGetHub.mockResolvedValue(CON_SESIONES);
    act(() => mockFoco.volver());
    expect(await findByText(TITULO)).toBeTruthy();
  });

  it("al deslizar para recargar, también", async () => {
    mockGetHub.mockRejectedValueOnce(new Error("sin red"));
    const { UNSAFE_getByType, findByText } = await montar();

    mockGetHub.mockResolvedValue(CON_SESIONES);
    act(() =>
      UNSAFE_getByType(ScrollView).props.refreshControl.props.onRefresh(),
    );
    expect(await findByText(TITULO)).toBeTruthy();
  });

  it("si deja de saberse, deja de enseñarse", async () => {
    mockGetHub.mockResolvedValueOnce(CON_SESIONES);
    const { getByText, queryByText } = await montar();
    expect(getByText(TITULO)).toBeTruthy();

    mockGetHub.mockRejectedValue(new Error("sin red"));
    act(() => mockFoco.volver());
    await waitFor(() => expect(queryByText(TITULO)).toBeNull());
  });
});

it("las dos lecturas no se estorban: sin perfil, el historial se ve igual", async () => {
  mockGetMe.mockRejectedValue(new Error("sin red"));
  mockGetHub.mockResolvedValue(CON_SESIONES);
  const { findByText } = render(<ProfileScreen />);
  expect(await findByText(TITULO)).toBeTruthy();
});
