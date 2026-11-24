import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api";

/**
 * Las pantallas de terapia con la oferta cerrada, montadas de verdad.
 *
 * Son Server Components asíncronos: se llaman, se espera su resultado y se
 * monta. Lo que se observa es doble — lo que ve la persona y lo que la página
 * LLEGA A PEDIR—, porque una pantalla que enseñara «no se ofrece» después de
 * haber pedido el directorio seguiría trayendo las fichas a su HTML.
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
// La sala y la reserva piden cosas al montarse: se sustituyen por una marca.
vi.mock("@/components/dashboard/terapia/VideoRoom", () => ({
  VideoRoom: () => <div data-testid="sala" />,
}));
vi.mock("@/components/dashboard/terapia/BookingFlow", () => ({
  BookingFlow: () => <div data-testid="reserva" />,
}));
vi.mock("@/components/dashboard/terapia/SessionDetailShell", () => ({
  SessionDetailShell: () => <div data-testid="detalle" />,
}));
vi.mock("@/components/dashboard/terapia/FavoriteButton", () => ({
  FavoriteButton: () => null,
}));

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

const prep = (isDemo: boolean) => ({
  session: { id: "s1", therapist: { id: "t", isDemo } },
  prep: { intentionCiphertext: null },
  offer: { open: false },
});

/** Contesta por ruta; lo que no esté declarado es un fallo de la prueba. */
function api(respuestas: Record<string, unknown>) {
  serverFetch.mockImplementation(async (ruta: string) => {
    const clave = Object.keys(respuestas).find((r) => ruta.startsWith(r));
    if (!clave) throw new Error(`ruta no esperada: ${ruta}`);
    const r = respuestas[clave];
    if (r instanceof Error) throw r;
    return r;
  });
}

const pedidas = () => serverFetch.mock.calls.map((c) => c[0] as string);

beforeEach(() => {
  vi.clearAllMocks();
  isNextThrow.mockReturnValue(false);
});

const P = (v: Record<string, string>) => Promise.resolve(v) as never;

async function pagina(
  cual:
    | "hub"
    | "terapeutas"
    | "perfil"
    | "reservar"
    | "sala"
    | "detalle"
    | "sesiones"
    | "recetas"
    | "avisos",
) {
  switch (cual) {
    case "hub":
      return (await import("./page")).default();
    case "terapeutas":
      return (await import("./terapeutas/page")).default({
        searchParams: P({}),
      });
    case "perfil":
      return (await import("./terapeutas/[id]/page")).default({
        params: P({ id: "t_marina" }),
      });
    case "reservar":
      return (await import("./reservar/[therapistId]/page")).default({
        params: P({ therapistId: "t_marina" }),
      });
    case "sala":
      return (await import("./sesiones/[id]/sala/page")).default({
        params: P({ id: "s1" }),
      });
    case "detalle":
      return (await import("./sesiones/[id]/page")).default({
        params: P({ id: "s1" }),
      });
    case "sesiones":
      return (await import("./sesiones/page")).default();
    case "recetas":
      return (await import("./recetas/page")).default();
    case "avisos":
      return (await import("./notificaciones/page")).default();
  }
}

const OFERTA = ["hub", "terapeutas", "perfil", "reservar"] as const;

describe.each(OFERTA)("%s con la oferta cerrada", (cual) => {
  it("dice que no se ofrece, enlaza la ayuda y no pide nada más", async () => {
    api({ "/terapia/hub": hub() });
    const { container } = render(await pagina(cual));

    expect(screen.getByText(CERRADA)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Ayuda inmediata" }),
    ).toHaveAttribute("href", "/ayuda?desde=terapia");
    // Ni una petición al directorio, a una ficha o a su agenda.
    expect(pedidas()).toEqual(["/terapia/hub"]);
    // Ni un enlace a descubrir o reservar.
    expect(
      [...container.querySelectorAll("a")].map((a) => a.getAttribute("href")),
    ).toEqual(["/ayuda?desde=terapia"]);
    expect(screen.queryByTestId("reserva")).toBeNull();
  });

  it.each([
    ["la API no contesta", new Error("sin red")],
    ["una API anterior que no publica `offer`", hub({ offer: undefined })],
    ["un `offer` que no es un sí", hub({ offer: {} })],
  ])("y también si %s", async (_caso, respuesta) => {
    api({ "/terapia/hub": respuesta });
    render(await pagina(cual));
    expect(screen.getByText(CERRADA)).toBeInTheDocument();
    expect(pedidas()).toEqual(["/terapia/hub"]);
  });
});

describe("el historial se enlaza sólo si existe", () => {
  it.each([
    ["sessions", "Tus sesiones", "/dashboard/terapia/sesiones"],
    ["prescriptions", "Lo que te sugirieron", "/dashboard/terapia/recetas"],
    ["notifications", "Tus avisos", "/dashboard/terapia/notificaciones"],
  ])("%s", async (clave, texto, href) => {
    api({
      "/terapia/hub": hub({ history: { ...SIN_HISTORIAL, [clave]: true } }),
    });
    render(await pagina("hub"));
    const enlaces = screen
      .getByRole("navigation", { name: "Tu historial de terapia" })
      .querySelectorAll("a");
    expect([...enlaces].map((a) => a.textContent)).toEqual([texto]);
    expect(enlaces[0]).toHaveAttribute("href", href);
  });

  it("sin historial no hay sección, y no se dice que no se pudo comprobar", async () => {
    api({ "/terapia/hub": hub() });
    render(await pagina("hub"));
    expect(screen.queryByRole("navigation")).toBeNull();
    expect(screen.queryByText(/No pudimos comprobar/)).toBeNull();
  });

  it("si no se pudo saber, se dice; no se da por vacío", async () => {
    api({ "/terapia/hub": new Error("sin red") });
    render(await pagina("hub"));
    expect(screen.getByText(/No pudimos comprobar/)).toBeInTheDocument();
    // Y tampoco se da por lleno: no se enlaza lo que no se sabe si existe.
    expect(screen.queryByRole("navigation")).toBeNull();
  });
});

describe("la sala", () => {
  it("de una sesión real se abre aunque la oferta esté cerrada", async () => {
    api({ "/terapia/sessions/s1/prep": prep(false) });
    render(await pagina("sala"));
    expect(screen.getByTestId("sala")).toBeInTheDocument();
  });

  it("de una sesión de demostración no se monta, y se explica", async () => {
    api({ "/terapia/sessions/s1/prep": prep(true) });
    render(await pagina("sala"));
    expect(screen.queryByTestId("sala")).toBeNull();
    expect(screen.getByText(/perfil de demostración/)).toBeInTheDocument();
  });

  it.each([404, 403])(
    "de una que no es suya (%i): no se ofrece",
    async (status) => {
      api({
        "/terapia/sessions/s1/prep": new ApiError(status, "X"),
        "/terapia/hub": hub(),
      });
      render(await pagina("sala"));
      expect(screen.queryByTestId("sala")).toBeNull();
      expect(screen.getByText(CERRADA)).toBeInTheDocument();
    },
  );

  it("si la API falla, NO se le dice a quien sí tiene sesión que no se ofrece", async () => {
    api({ "/terapia/sessions/s1/prep": new ApiError(500, "X") });
    render(await pagina("sala"));
    expect(screen.queryByText(CERRADA)).toBeNull();
    expect(
      screen.getByText(/No pudimos abrir esta sesión/),
    ).toBeInTheDocument();
  });
});

describe("el detalle de una sesión", () => {
  it("real o de demostración, se puede ver: es su historial", async () => {
    api({ "/terapia/sessions/s1/prep": prep(true) });
    render(await pagina("detalle"));
    expect(screen.getByTestId("detalle")).toBeInTheDocument();
  });

  it("una que no existe, con la oferta cerrada: no se ofrece", async () => {
    api({
      "/terapia/sessions/s1/prep": new ApiError(404, "SESSION_NOT_FOUND"),
      "/terapia/hub": hub(),
    });
    const { container } = render(await pagina("detalle"));
    expect(screen.getByText(CERRADA)).toBeInTheDocument();
    // El código del servidor no llega a la pantalla.
    expect(container.textContent).not.toContain("SESSION_NOT_FOUND");
  });
});

describe("la lista de sesiones", () => {
  const fila = {
    id: "s1",
    therapist: { name: "Nombre", isDemo: false },
    scheduledAt: "2026-11-30T15:00:00.000Z",
    durationMin: 50,
    status: "COMPLETED",
    paymentStatus: "PAID",
    feedbackRating: null,
  };

  it("vacía y cerrada: no se ofrece, y no invita a buscar", async () => {
    api({
      "/terapia/sessions": { upcoming: [], past: [], offer: { open: false } },
      "/terapia/hub": hub(),
    });
    render(await pagina("sesiones"));
    expect(screen.getByText(CERRADA)).toBeInTheDocument();
    expect(screen.queryByText(/Buscar terapeuta/)).toBeNull();
  });

  it("con historial se enseña, sin invitar a buscar", async () => {
    api({
      "/terapia/sessions": {
        upcoming: [],
        past: [fila],
        offer: { open: false },
      },
    });
    render(await pagina("sesiones"));
    expect(screen.getByText("Nombre")).toBeInTheDocument();
    expect(screen.queryByText(/Buscar terapeuta/)).toBeNull();
  });

  it("una API que no publica `offer` cuenta como cerrada", async () => {
    api({ "/terapia/sessions": { upcoming: [], past: [fila] } });
    render(await pagina("sesiones"));
    expect(screen.queryByText(/Buscar terapeuta/)).toBeNull();
  });

  it("abierta, sí invita (control contrario)", async () => {
    api({
      "/terapia/sessions": {
        upcoming: [],
        past: [fila],
        offer: { open: true },
      },
    });
    render(await pagina("sesiones"));
    expect(screen.getByText(/Buscar terapeuta/)).toBeInTheDocument();
  });
});

describe("recetas y avisos vacíos no prometen una sesión", () => {
  it.each([
    [
      "recetas",
      "/terapia/prescriptions",
      [],
      "No tienes sugerencias de un terapeuta.",
    ],
    [
      "avisos",
      "/terapia/notifications",
      { items: [], unreadCount: 0 },
      "No tienes avisos de terapia.",
    ],
  ] as const)("%s", async (cual, ruta, vacio, texto) => {
    api({ [ruta]: vacio });
    const { container } = render(await pagina(cual));
    expect(screen.getByText(texto)).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/primera sesión|próxima sesión/);
  });
});

describe("con la oferta abierta (control contrario)", () => {
  const abierta = hub({ intro: "Intro", offer: { open: true } });

  it("el hub ofrece buscar terapeuta", async () => {
    api({ "/terapia/hub": abierta });
    render(await pagina("hub"));
    expect(screen.queryByText(CERRADA)).toBeNull();
    expect(
      screen.getByRole("link", { name: /Encontrar terapeuta/ }),
    ).toHaveAttribute("href", "/dashboard/terapia/terapeutas");
  });

  it("una próxima sesión de demostración no se anuncia como próxima sesión", async () => {
    const siguiente = (isDemo: boolean) => ({
      id: "s1",
      therapist: { name: "Nombre", isDemo },
      scheduledAt: "2026-11-30T15:00:00.000Z",
      durationMin: 50,
      modality: "INDIVIDUAL",
    });
    api({ "/terapia/hub": { ...abierta, nextSession: siguiente(true) } });
    const { unmount } = render(await pagina("hub"));
    expect(screen.queryByText("Próxima sesión")).toBeNull();
    unmount();

    api({ "/terapia/hub": { ...abierta, nextSession: siguiente(false) } });
    render(await pagina("hub"));
    expect(screen.getByText("Próxima sesión")).toBeInTheDocument();
  });

  it("la reserva se monta", async () => {
    api({
      "/terapia/hub": abierta,
      "/terapia/therapists/": { id: "pro", name: "Nombre" },
    });
    render(await pagina("reservar"));
    expect(screen.getByTestId("reserva")).toBeInTheDocument();
  });

  it("el perfil sin reseñas no pinta estrellas ni licencia", async () => {
    const t = {
      id: "pro",
      name: "Nombre",
      initials: "N",
      title: "T",
      coverToken: "warm",
      isFavorite: false,
      avgRating: null,
      reviewsCount: null,
      licenseVerified: false,
      priceUsd: 40,
      currency: "USD",
      bioLong: null,
      bioShort: "Bio",
      specialties: [],
      approach: null,
      firstSessionPolicy: null,
      cancellationPolicy: null,
      availability: [],
    };
    api({
      "/terapia/hub": abierta,
      "/terapia/therapists/t_marina/reviews": { items: [] },
      "/terapia/therapists/t_marina": t,
    });
    const { container, unmount } = render(await pagina("perfil"));
    expect(container.textContent).not.toContain("⭐");
    expect(container.textContent).not.toContain("Licencia verificada");
    unmount();

    api({
      "/terapia/hub": abierta,
      "/terapia/therapists/t_marina/reviews": { items: [] },
      "/terapia/therapists/t_marina": {
        ...t,
        avgRating: 4.5,
        reviewsCount: 3,
        licenseVerified: true,
      },
    });
    const real = render(await pagina("perfil"));
    expect(real.container.textContent).toContain("⭐ 4.5 (3) reseñas");
    expect(real.container.textContent).toContain("Licencia verificada");
  });
});

/**
 * El trinquete: una pantalla nueva de terapia tiene que decir de qué lado está.
 *
 * Las de OFERTA preguntan por la oferta antes de enseñar nada. Las de
 * CONTINUIDAD enseñan lo que alguien ya tiene y no pueden depender de ella.
 */
describe("toda pantalla de terapia está clasificada", () => {
  const PAGINAS: Record<string, "oferta" | "continuidad"> = {
    "page.tsx": "oferta",
    "terapeutas/page.tsx": "oferta",
    "terapeutas/[id]/page.tsx": "oferta",
    "reservar/[therapistId]/page.tsx": "oferta",
    "sesiones/page.tsx": "continuidad",
    "sesiones/[id]/page.tsx": "continuidad",
    "sesiones/[id]/sala/page.tsx": "continuidad",
    "recetas/page.tsx": "continuidad",
    "notificaciones/page.tsx": "continuidad",
  };

  function paginas(dir: string): string[] {
    return readdirSync(dir).flatMap((e) => {
      const p = join(dir, e);
      if (statSync(p).isDirectory()) return paginas(p);
      return e === "page.tsx" ? [relative(__dirname, p)] : [];
    });
  }

  it("ninguna sin clasificar", () => {
    expect(paginas(__dirname).sort()).toEqual(Object.keys(PAGINAS).sort());
  });

  it.each(Object.entries(PAGINAS).filter(([, c]) => c === "oferta"))(
    "%s sale antes de pedir nada si no está abierta",
    (ruta) => {
      const src = readFileSync(join(__dirname, ruta), "utf8");
      const guarda = src.search(
        /if \(!abierta(?: \|\| !hub)?\) return <TerapiaCerrada/,
      );
      expect(guarda).toBeGreaterThan(0);
      const pide = src.search(/await Promise\.all|serverFetch</);
      if (pide !== -1) expect(guarda).toBeLessThan(pide);
    },
  );
});
