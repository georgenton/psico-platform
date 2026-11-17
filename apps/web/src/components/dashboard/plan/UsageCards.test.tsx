import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { EcoQuotaWindowKind, UsageEco, UsageResponse } from "@psico/types";
import { UsageCards } from "./UsageCards";

// ─── Helpers ──────────────────────────────────────────────────────────────

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
  vi.useFakeTimers({ now: new Date(iso), toFake: ["Date"] });
  try {
    fn();
  } finally {
    vi.useRealTimers();
  }
}

afterEach(() => {
  vi.useRealTimers();
});

// ─── Tests ────────────────────────────────────────────────────────────────

describe("UsageCards", () => {
  it("shows the fallback empty state when usage is null", () => {
    render(<UsageCards usage={null} />);
    expect(screen.getByText(/No pudimos cargar tu uso/i)).toBeInTheDocument();
  });

  it("renders all 4 cards with the period range when usage is provided", () => {
    render(<UsageCards usage={buildUsage()} />);
    // Each card's label.
    expect(screen.getByText(/Libros completados/i)).toBeInTheDocument();
    expect(screen.getByText(/Mensajes con Eco/i)).toBeInTheDocument();
    expect(screen.getByText(/Minutos de voz/i)).toBeInTheDocument();
    expect(screen.getByText(/Entradas del diario/i)).toBeInTheDocument();
  });

  it("renders the progress bar aria label at the right percentage when a quota exists", () => {
    render(
      <UsageCards
        usage={buildUsage({
          eco: ecoSlice({ used: 50, quota: 200 }),
        })}
      />,
    );
    // 50 / 200 = 25%. The progress bar exposes its rounded percent in aria-label.
    expect(screen.getByLabelText("25% usado")).toBeInTheDocument();
  });

  it("flags the over-quota state when current >= quota", () => {
    const { container } = render(
      <UsageCards
        usage={buildUsage({
          eco: ecoSlice({ used: 200, quota: 200 }),
        })}
      />,
    );
    // 100% bar.
    expect(screen.getByLabelText("100% usado")).toBeInTheDocument();
    // The number "200" appears with the error red color when capped. We
    // can't easily read style colors with jest-dom, but we can verify the
    // amount text rendered as expected.
    expect(container.textContent).toContain("200");
    expect(container.textContent).toContain("de 200");
  });

  it("renders 'ilimitado' when quota is null (e.g. PRO diary)", () => {
    render(
      <UsageCards
        usage={buildUsage({
          diary: { entriesThisPeriod: 25, quota: null },
        })}
      />,
    );
    // "ilimitado" appears at least once (diary card + books are also null).
    expect(screen.getAllByText(/ilimitado/i).length).toBeGreaterThan(0);
  });

  it("renders 'no incluido' when quota is 0 (FREE voice)", () => {
    render(
      <UsageCards
        usage={buildUsage({
          voice: { minutesThisPeriod: 0, quota: 0 },
        })}
      />,
    );
    expect(screen.getByText(/no incluido en tu plan/i)).toBeInTheDocument();
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
    // El cupo que Eco aplica, no el de `PLAN_QUOTAS`.
    expect(screen.getByText("de 10")).toBeInTheDocument();
    // Y la ventana, dicha, para que el 7 se pueda interpretar.
    expect(screen.getByText(/hoy · vuelve a las/)).toBeInTheDocument();
    // El consumo del mes sigue estando — y NO emparejado con un cupo.
    expect(
      screen.getByText(/en todo el período: 83 mensajes/),
    ).toBeInTheDocument();
    expect(screen.getByText(/estadística, no\s+un cupo/)).toBeInTheDocument();
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
    expect(screen.getByText("de 200")).toBeInTheDocument();
    expect(screen.getByText(/este periodo · hasta el/)).toBeInTheDocument();
    expect(screen.queryByText(/hoy · vuelve/)).not.toBeInTheDocument();
  });

  it("Eco B2B: sin límite, y entonces sin reinicio que anunciar", () => {
    render(
      <UsageCards
        usage={buildUsage({
          eco: ecoSlice({ used: 4000, quota: null, resetsAt: null }),
        })}
      />,
    );
    expect(screen.getByText("sin límite")).toBeInTheDocument();
  });

  it("la hora del reinicio va en 24 h: ni «a. m.» ni «24:00»", () => {
    // Medido sobre el artefacto servido el 2026-11-16: la tarjeta decía «vuelve
    // a las 12:00 a. m.» para las 00:00, porque `es-EC` es de 12 horas por
    // omisión — y eso se lee como mediodía. Con `hour12: false` la misma hora
    // sale «24:00» en este ICU, así que la hora se arma desde `formatToParts` y
    // el «24» se normaliza.
    conReloj("2026-11-16T22:00:00.000Z", () => {
      render(
        <UsageCards
          usage={buildUsage({
            timezone: "UTC",
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
    // Con la zona en UTC y `now` a las 22:00Z del 16, el reinicio (00:00Z del
    // 17) cae MAÑANA — y eso también se calcula, no se da por supuesto.
    const nota = screen.getByText(/vuelve .*0?0:00$/);
    expect(nota.textContent).toBe("hoy · vuelve mañana a las 00:00");
    expect(nota.textContent).not.toMatch(/a\.\s?m\.|p\.\s?m\.|AM|PM/);
    expect(nota.textContent).not.toContain("24:00");
  });

  // ─── La zona de la persona, no la del servidor ──────────────────────────
  //
  // Reproducido el 2026-11-17: `/dashboard/plan` es una página de SERVIDOR que
  // importa esta tarjeta directamente, y la tarjeta formateaba sin `timeZone`.
  // Con el contenedor en UTC, una cuenta declarada en Quito veía «00:00» aquí y
  // «19:00» en el mensaje de Eco — el mismo instante, dos horas distintas.
  //
  // Estas pruebas valen bajo CUALQUIER `TZ` del proceso, que es la propiedad
  // fuerte: la zona ya no la pone la máquina que pinta.
  describe("la hora y el día salen de la zona de la persona", () => {
    it("Quito: el reinicio de las 00:00 UTC es HOY a las 19:00", () => {
      // 2026-11-16T22:00Z = 17:00 del 16 en Quito. El reinicio (00:00Z del 17)
      // es las 19:00 del MISMO día local, así que «hoy» es lo correcto.
      conReloj("2026-11-16T22:00:00.000Z", () => {
        render(
          <UsageCards
            usage={buildUsage({
              timezone: "America/Guayaquil",
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
      expect(screen.getByText("hoy · vuelve a las 19:00")).toBeInTheDocument();
    });

    it("Madrid: el mismo instante es MAÑANA a la 01:00", () => {
      // El mismo `resetsAt`, otra zona: a las 22:00Z del 16 en Madrid son las
      // 23:00 del 16, y el reinicio cae a la 01:00 del 17 — mañana. La palabra
      // relativa se calcula; no es una etiqueta fija.
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
      ).toBeInTheDocument();
    });

    it("sin zona declarada: se cuenta en UTC y se dice", () => {
      // El caso de una Web nueva contra una API anterior, y de una cuenta que
      // nunca declaró zona. Resultado definido: la hora UTC, etiquetada.
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
      ).toBeInTheDocument();
    });

    it("una zona inválida no se cuela como si fuera válida", () => {
      conReloj("2026-11-16T22:00:00.000Z", () => {
        render(
          <UsageCards
            usage={buildUsage({
              timezone: "No/Existe",
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
      expect(screen.getByText(/ 00:00 UTC$/)).toBeInTheDocument();
    });

    it("el periodo también se lee en el calendario de la persona", () => {
      // Un periodo que acaba el 1 de diciembre a las 00:00 UTC acaba el 30 de
      // noviembre para quien vive en Quito. La ventana no cambia; cambia en qué
      // calendario se lee.
      conReloj("2026-11-16T22:00:00.000Z", () => {
        render(
          <UsageCards
            usage={buildUsage({
              timezone: "America/Guayaquil",
              period: {
                start: "2026-11-01T00:00:00.000Z",
                end: "2026-12-01T00:00:00.000Z",
              },
            } as unknown as Partial<UsageResponse>)}
          />,
        );
      });
      expect(screen.getByText("31 oct – 30 nov")).toBeInTheDocument();
    });

    it("PRO: el fin del periodo también se nombra en su zona", () => {
      conReloj("2026-11-16T22:00:00.000Z", () => {
        render(
          <UsageCards
            usage={buildUsage({
              timezone: "America/Guayaquil",
              eco: ecoSlice({
                used: 120,
                quota: 200,
                kind: "subscription",
                resetsAt: "2026-12-03T02:30:00.000Z",
              }),
            })}
          />,
        );
      });
      // 02:30 UTC del 3 son las 21:30 del 2 en Quito.
      expect(
        screen.getByText("este periodo · hasta el 2 de diciembre"),
      ).toBeInTheDocument();
    });
  });
});
