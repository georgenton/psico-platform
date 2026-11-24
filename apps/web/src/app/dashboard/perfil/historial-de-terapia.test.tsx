import {
  cloneElement,
  isValidElement,
  Suspense,
  type ReactElement,
  type ReactNode,
} from "react";
import { render, screen } from "@testing-library/react";
import type { UserMeResponse } from "@psico/types";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Quien ya tenía algo de terapia puede volver a verlo desde Perfil.
 *
 * Con la oferta cerrada ningún menú lleva a Terapia, así que sin esta entrada
 * una sesión ya reservada no se podía ver ni cancelar sin saber la dirección.
 *
 * Y lo contrario pesa igual: quien no tiene nada —o cuando no se sabe— no ve la
 * palabra «terapia» en todo Perfil. Por eso se monta la página ENTERA, con sus
 * tarjetas de verdad, y no sólo la entrada.
 */

const { serverFetch, isNextThrow } = vi.hoisted(() => ({
  serverFetch: vi.fn(),
  isNextThrow: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/api.server", () => ({ serverFetch, isNextThrow }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/actions/auth", () => ({ logoutAction: vi.fn() }));
vi.mock("@/actions/profile", () => ({ updateProfileAction: vi.fn() }));

import PerfilPage from "./page";

const ME = {
  user: {
    id: "u1",
    firstName: "Ana",
    email: "ana@example.com",
    city: "Quito",
    country: "EC",
    timezone: null,
    tier: "free",
    joinedAt: new Date("2026-01-01"),
    initials: "A",
    avatarUrl: null,
    mood: null,
  },
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
  preferences: {
    voicePreference: "none",
    moodPrompts: true,
    bestTime: "any",
    weeklyGoalMinutes: 60,
    theme: "system",
    language: "es-419",
    ambient: "calma",
  },
  privacy: {
    shareDiaryWithTherapist: false,
    anonymizedAnalytics: true,
    marketingEmail: false,
    localTextAnalysis: false,
    dataExportRequested: null,
    accountDeleteRequested: null,
  },
} as unknown as UserMeResponse;

const SIN_HISTORIAL = {
  sessions: false,
  prescriptions: false,
  notifications: false,
};
const CERRADA = { open: false };

const hub = (over: Record<string, unknown> = {}) => ({
  intro: "",
  offer: CERRADA,
  history: SIN_HISTORIAL,
  activeTherapist: null,
  nextSession: null,
  recentPrescriptions: [],
  ...over,
});

/** Contesta por ruta; una promesa se devuelve tal cual, un error se lanza. */
function api(respuestas: Record<string, unknown>) {
  serverFetch.mockImplementation(async (ruta: string) => {
    if (!(ruta in respuestas)) throw new Error(`ruta no esperada: ${ruta}`);
    const r = respuestas[ruta];
    if (r instanceof Error) throw r;
    return r;
  });
}

/**
 * React 18 no monta componentes asíncronos en jsdom: se resuelven antes, que es
 * lo que hace Next en el servidor.
 */
async function resuelto(nodo: ReactNode): Promise<ReactNode> {
  if (Array.isArray(nodo)) return Promise.all(nodo.map(resuelto));
  if (!isValidElement(nodo)) return nodo;
  const el = nodo as ReactElement<{ children?: ReactNode }>;
  if (esAsincrono(el)) {
    return resuelto(await (el.type as (p: unknown) => ReactNode)(el.props));
  }
  if (el.props.children === undefined) return el;
  const hijos = await resuelto(el.props.children);
  return cloneElement(
    el,
    undefined,
    ...(Array.isArray(hijos) ? hijos : [hijos]),
  );
}

const esAsincrono = (el: ReactElement) =>
  typeof el.type === "function" && el.type.constructor.name === "AsyncFunction";

const montar = async () => render(<>{await resuelto(await PerfilPage())}</>);

const TITULO = /Tu historial de terapia/;
const entrada = () => screen.queryByRole("link", { name: TITULO });

/** Ni una mención, ni un enlace. Con el control de que Perfil sí se pintó. */
function nadaDeTerapia(container: HTMLElement) {
  expect(screen.getByTestId("shortcuts-grid")).toBeInTheDocument();
  expect(screen.getByText("Correo de la cuenta")).toBeInTheDocument();
  expect(container.textContent).not.toMatch(/terapia|terapeuta/i);
  for (const a of container.querySelectorAll("a")) {
    expect(a.getAttribute("href")).not.toMatch(/terapia/);
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  isNextThrow.mockReturnValue(false);
});

describe("quien tiene historial lo encuentra en Perfil", () => {
  it.each(["sessions", "prescriptions", "notifications"])(
    "basta con %s",
    async (clave) => {
      api({
        "/user/me": ME,
        "/terapia/hub": hub({ history: { ...SIN_HISTORIAL, [clave]: true } }),
      });
      await montar();
      expect(entrada()).toHaveAttribute("href", "/dashboard/terapia");
      expect(
        screen.getByText(
          "Lo que ya tenías sigue aquí. Hoy no se ofrecen sesiones nuevas.",
        ),
      ).toBeInTheDocument();
    },
  );

  it("una API que no publica `offer` cuenta como cerrada", async () => {
    api({
      "/user/me": ME,
      "/terapia/hub": hub({
        offer: undefined,
        history: { ...SIN_HISTORIAL, sessions: true },
      }),
    });
    await montar();
    expect(screen.getByText(/Hoy no se ofrecen/)).toBeInTheDocument();
  });

  it("con la oferta abierta sigue ahí, sin decir que no se ofrece", async () => {
    api({
      "/user/me": ME,
      "/terapia/hub": hub({
        offer: { open: true },
        history: { ...SIN_HISTORIAL, sessions: true },
      }),
    });
    const { container } = await montar();
    expect(entrada()).toHaveAttribute("href", "/dashboard/terapia");
    expect(container.textContent).toContain("Lo que ya tenías sigue aquí.");
    expect(container.textContent).not.toMatch(/no se ofrece/);
  });
});

describe("quien no tiene, o si no se sabe, no ve nada", () => {
  it.each([
    ["sin historial", hub()],
    ["sin historial y con la oferta abierta", hub({ offer: { open: true } })],
    ["una API que no publica el historial", hub({ history: undefined })],
    ["una respuesta vacía", null],
    ["la lectura falla", new Error("sin red")],
  ])("%s", async (_caso, respuesta) => {
    api({ "/user/me": ME, "/terapia/hub": respuesta });
    const { container } = await montar();
    nadaDeTerapia(container);
  });
});

describe("Perfil no depende de esta lectura", () => {
  it("se pinta sin esperarla, y mientras tanto no hay nada en su sitio", async () => {
    api({ "/user/me": ME, "/terapia/hub": new Promise(() => undefined) });
    const pagina = await Promise.race([
      PerfilPage(),
      new Promise<null>((r) => setTimeout(() => r(null), 500)),
    ]);
    expect(pagina).not.toBeNull();
    // La página no la pide: la pide la entrada, cuando le toca.
    expect(serverFetch.mock.calls.map((c) => c[0])).toEqual(["/user/me"]);

    const hijos = (pagina as ReactElement<{ children: ReactNode[] }>).props
      .children;
    const aparte = hijos.filter(
      (h): h is ReactElement<{ fallback: unknown; children: ReactElement }> =>
        isValidElement(h) && h.type === Suspense,
    );
    expect(aparte).toHaveLength(1);
    expect(aparte[0]!.props.fallback).toBeNull();
    expect(esAsincrono(aparte[0]!.props.children)).toBe(true);
    // Y nada asíncrono fuera de ahí, que sí haría esperar a la página.
    expect(
      hijos.filter((h) => isValidElement(h) && esAsincrono(h)),
    ).toHaveLength(0);
  });

  it("no espera más de segundo y medio: al guardar, retendría la pantalla", async () => {
    vi.useFakeTimers();
    try {
      api({ "/user/me": ME, "/terapia/hub": new Promise(() => undefined) });
      const { HistorialDeTerapia } =
        await import("@/components/dashboard/perfil/HistorialDeTerapia");
      let resultado: unknown = "esperando";
      void HistorialDeTerapia().then((r) => {
        resultado = r;
      });
      await vi.advanceTimersByTimeAsync(1_499);
      expect(resultado).toBe("esperando");
      await vi.advanceTimersByTimeAsync(1);
      expect(resultado).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("si contesta, no deja el reloj en marcha; y si falla tarde, no pasa nada", async () => {
    vi.useFakeTimers();
    try {
      const { HistorialDeTerapia } =
        await import("@/components/dashboard/perfil/HistorialDeTerapia");
      api({ "/user/me": ME, "/terapia/hub": hub() });
      expect(await HistorialDeTerapia()).toBeNull();
      expect(vi.getTimerCount()).toBe(0);

      let fallar!: (e: Error) => void;
      isNextThrow.mockReturnValue(true);
      api({
        "/user/me": ME,
        "/terapia/hub": new Promise((_, no) => {
          fallar = no;
        }),
      });
      const tarde = HistorialDeTerapia();
      await vi.advanceTimersByTimeAsync(1_500);
      expect(await tarde).toBeNull();
      // Un rechazo suelto tumbaría esta prueba.
      fallar(new Error("NEXT_REDIRECT"));
      await vi.advanceTimersByTimeAsync(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("una sesión rechazada no se traga: sigue llevando a salir", async () => {
    const rebote = Object.assign(new Error("NEXT_REDIRECT"), {
      digest: "NEXT_REDIRECT;replace;/logout;307;",
    });
    isNextThrow.mockImplementation((e) => e === rebote);
    api({ "/user/me": ME, "/terapia/hub": rebote });
    await expect(montar()).rejects.toBe(rebote);
  });

  it("si el perfil no carga, no se pregunta por el historial", async () => {
    api({ "/user/me": new Error("sin red") });
    const { container } = await montar();
    expect(screen.getByText("No pudimos cargar tu perfil.")).toBeVisible();
    expect(container.textContent).not.toMatch(/terapia/i);
  });
});
