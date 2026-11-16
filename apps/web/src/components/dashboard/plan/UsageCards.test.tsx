import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
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
    render(
      <UsageCards
        usage={buildUsage({
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
});
