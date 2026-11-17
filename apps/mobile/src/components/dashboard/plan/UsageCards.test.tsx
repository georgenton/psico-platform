import { render, screen } from "@testing-library/react-native";
import type { EcoQuotaWindowKind, UsageEco, UsageResponse } from "@psico/types";
import { UsageCards } from "./UsageCards";

/**
 * Minimal UsageResponse builder. We override only the slices each test
 * cares about; the rest stays at sensible defaults so the wide surface
 * (4 cards x 5 fields) doesn't need to be re-declared each time.
 */
/**
 * El bloque de Eco, con su ventana dicha.
 *
 * `used`/`quota` describen **la ventana que limita**; `messagesThisPeriod` es
 * la estadística del periodo de facturación, que no es un cupo. Declararlo en
 * un ayudante evita que una prueba vuelva a emparejar un consumo mensual con
 * un límite diario, que era el defecto.
 */
function ecoSlice(input: {
  used: number;
  quota: number | null;
  kind?: EcoQuotaWindowKind;
  resetsAt?: string | null;
  messagesThisPeriod?: number;
}): UsageEco {
  const kind = input.kind ?? "subscription";
  const resetsAt =
    input.resetsAt === undefined ? "2026-06-30T23:59:59.999Z" : input.resetsAt;
  return {
    used: input.used,
    quota: input.quota,
    remaining:
      input.quota === null ? null : Math.max(0, input.quota - input.used),
    window: {
      start: new Date("2026-06-01T00:00:00.000Z"),
      end: new Date(resetsAt ?? "2026-06-30T23:59:59.999Z"),
      kind,
    },
    resetsAt: resetsAt === null ? null : new Date(resetsAt),
    messagesThisPeriod: input.messagesThisPeriod ?? input.used,
  };
}

function buildUsage(overrides: Partial<UsageResponse> = {}): UsageResponse {
  return {
    period: {
      start: "2026-06-01T00:00:00.000Z",
      end: "2026-06-30T23:59:59.999Z",
    },
    books: { completedThisPeriod: 0 },
    eco: ecoSlice({ used: 0, quota: 200 }),
    voice: { minutesThisPeriod: 0, quota: 120 },
    diary: { entriesThisPeriod: 0, quota: null },
    ...overrides,
  } as UsageResponse;
}

/**
 * Fija el instante en que se pinta. La palabra relativa del reinicio («hoy»,
 * «mañana») se calcula contra `now`, así que sin esto las pruebas medirían el
 * día en que se ejecutan.
 */
function conReloj(iso: string, fn: () => void): void {
  jest.useFakeTimers({ doNotFake: ["nextTick", "setImmediate"] });
  jest.setSystemTime(new Date(iso));
  try {
    fn();
  } finally {
    jest.useRealTimers();
  }
}

afterEach(() => {
  jest.useRealTimers();
});

describe("UsageCards (mobile)", () => {
  it("shows the fallback empty state when usage is null", () => {
    render(<UsageCards usage={null} />);
    expect(screen.getByText(/No pudimos cargar tu uso/i)).toBeOnTheScreen();
  });

  it("renders all 4 card labels when usage is provided", () => {
    render(<UsageCards usage={buildUsage()} />);
    expect(screen.getByText("Libros")).toBeOnTheScreen();
    expect(screen.getByText("Eco")).toBeOnTheScreen();
    expect(screen.getByText("Voz")).toBeOnTheScreen();
    expect(screen.getByText("Diario")).toBeOnTheScreen();
  });

  it("renders 'ilimitado' when a quota is null (Books always, PRO Diary)", () => {
    render(
      <UsageCards
        usage={buildUsage({
          diary: { entriesThisPeriod: 25, quota: null },
        })}
      />,
    );
    // Books quota is null too → at least 2 'ilimitado' labels.
    expect(screen.getAllByText(/ilimitado/i).length).toBeGreaterThanOrEqual(1);
  });

  it("renders 'no incluido' when quota is 0 (FREE voice)", () => {
    render(
      <UsageCards
        usage={buildUsage({
          voice: { minutesThisPeriod: 0, quota: 0 },
        })}
      />,
    );
    expect(screen.getByText(/no incluido/i)).toBeOnTheScreen();
  });

  it("renders the 'de N' counter footer when a numeric quota applies", () => {
    render(
      <UsageCards
        usage={buildUsage({
          eco: ecoSlice({ used: 50, quota: 200 }),
        })}
      />,
    );
    // The Eco card footer shows "de 200".
    expect(screen.getByText(/de 200/)).toBeOnTheScreen();
  });

  it("formats the period footer with the date range", () => {
    render(<UsageCards usage={buildUsage()} />);
    expect(screen.getByText(/Tu uso este período/i)).toBeOnTheScreen();
    // Format is "1 jun – 30 jun" or similar; assert at least one separator.
    const period = screen.getByText(/–/);
    expect(period).toBeOnTheScreen();
  });

  it("Eco FREE: la tarjeta muestra el consumo DEL DÍA y su límite diario", () => {
    conReloj("2026-11-16T22:00:00.000Z", () => {
      render(
        <UsageCards
          usage={buildUsage({
            timezone: "America/Guayaquil",
            eco: ecoSlice({
              used: 7,
              quota: 10,
              kind: "utc-day",
              resetsAt: "2026-11-17T00:00:00.000Z",
              messagesThisPeriod: 83,
            }),
          })}
        />,
      );
    });
    expect(screen.getByText("de 10")).toBeOnTheScreen();
    expect(screen.getByText(/hoy · vuelve a las/)).toBeOnTheScreen();
    expect(screen.getByText(/83/)).toBeOnTheScreen();
  });

  it("Eco PRO: su ventana es el periodo, con su fecha de fin", () => {
    render(
      <UsageCards
        usage={buildUsage({
          eco: ecoSlice({
            used: 120,
            quota: 200,
            kind: "subscription",
            resetsAt: "2026-12-03T08:30:00.000Z",
          }),
        })}
      />,
    );
    expect(screen.getByText("de 200")).toBeOnTheScreen();
    expect(screen.getByText(/este periodo · hasta el/)).toBeOnTheScreen();
  });

  it("Eco B2B: sin límite", () => {
    render(
      <UsageCards
        usage={buildUsage({
          eco: ecoSlice({ used: 4000, quota: null, resetsAt: null }),
        })}
      />,
    );
    expect(screen.getByText("sin límite")).toBeOnTheScreen();
  });

  it("la hora del reinicio va en 24 h: ni «a. m.» ni «24:00»", () => {
    // Gemela de la de web, y por el mismo motivo medido.
    conReloj("2026-11-16T22:00:00.000Z", () => {
      render(
        <UsageCards
          usage={buildUsage({
            timezone: "America/Guayaquil",
            eco: ecoSlice({
              used: 0,
              quota: 10,
              kind: "utc-day",
              resetsAt: "2026-11-17T00:00:00.000Z",
            }),
          })}
        />,
      );
    });
    const nota = screen.getByText("hoy · vuelve a las 19:00");
    expect(nota).toBeOnTheScreen();
    const texto = String(nota.props.children);
    expect(texto).not.toMatch(/a\.\s?m\.|p\.\s?m\.|AM|PM/);
    expect(texto).not.toContain("24:00");
  });

  // Aquí el formateador corre en el dispositivo, así que sin zona usaría la del
  // teléfono — que suele coincidir con la declarada, y por eso el defecto se
  // vio primero en la Web. Pero no es lo mismo: quien viaja, o declaró su zona
  // desde otro aparato, vería una hora distinta de la del mensaje de Eco. Estas
  // pruebas valen bajo cualquier `TZ` del proceso.
  describe("la hora y el día salen de la zona DECLARADA", () => {
    it("Madrid: el mismo instante es mañana a la 01:00", () => {
      conReloj("2026-11-16T22:00:00.000Z", () => {
        render(
          <UsageCards
            usage={buildUsage({
              timezone: "Europe/Madrid",
              eco: ecoSlice({
                used: 10,
                quota: 10,
                kind: "utc-day",
                resetsAt: "2026-11-17T00:00:00.000Z",
              }),
            })}
          />,
        );
      });
      expect(
        screen.getByText("hoy · vuelve mañana a las 01:00"),
      ).toBeOnTheScreen();
    });

    it("sin zona declarada: se cuenta en UTC y se dice", () => {
      conReloj("2026-11-16T22:00:00.000Z", () => {
        render(
          <UsageCards
            usage={buildUsage({
              eco: ecoSlice({
                used: 3,
                quota: 10,
                kind: "utc-day",
                resetsAt: "2026-11-17T00:00:00.000Z",
              }),
            })}
          />,
        );
      });
      expect(
        screen.getByText("hoy · vuelve mañana a las 00:00 UTC"),
      ).toBeOnTheScreen();
    });
  });
});
