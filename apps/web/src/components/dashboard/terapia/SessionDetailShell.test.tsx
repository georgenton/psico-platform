import { render, screen } from "@testing-library/react";
import type { SessionPrepResponse } from "@psico/types";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Qué se puede hacer todavía con una sesión que ya existe.
 *
 * Dos preguntas cruzadas: si hoy hay oferta —pagar y mover a otro hueco lo
 * son— y si detrás hay un profesional. Cancelar y ver se conservan siempre.
 */

let clave: Uint8Array | null = null;
vi.mock("@/lib/crypto/diary-key-context", () => ({
  useDiaryKey: () => ({ key: clave }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock("@/actions/terapia", () => ({
  cancelSessionAction: vi.fn(),
  retryCheckoutAction: vi.fn(),
  updateSessionPrepAction: vi.fn(),
  submitFeedbackAction: vi.fn(),
}));
vi.mock("@psico/crypto", () => ({
  decryptString: () => "lo que escribí",
  encryptString: vi.fn(),
}));
vi.mock("./RescheduleModal", () => ({ RescheduleModal: () => null }));
vi.mock("./FeedbackModal", () => ({ FeedbackModal: () => null }));

const { SessionDetailShell } = await import("./SessionDetailShell");

const AHORA = new Date().toISOString();
const MANANA = new Date(Date.now() + 24 * 3600_000).toISOString();

function datos({
  isDemo = false,
  offer = { open: false },
  paymentStatus = "PENDING",
  status = "SCHEDULED",
  scheduledAt = MANANA,
  intentionCiphertext = null as string | null,
} = {}): SessionPrepResponse {
  return {
    session: {
      id: "s1",
      therapist: {
        id: "t",
        name: "Nombre",
        initials: "N",
        title: "T",
        avatarUrl: null,
        coverToken: "warm",
        modalities: ["INDIVIDUAL"],
        specialties: [],
        priceUsd: 40,
        currency: "USD",
        avgRating: null,
        reviewsCount: null,
        isDemo,
      },
      scheduledAt,
      durationMin: 50,
      modality: "INDIVIDUAL",
      joinUrl: null,
      paymentStatus: paymentStatus as never,
      status: status as never,
    },
    prep: {
      intentionCiphertext,
      intentionNonce: intentionCiphertext ? "n" : null,
      checkInMood: null,
      sharedEntryIds: [],
    },
    offer,
  };
}

const boton = (n: string) => screen.queryByRole("button", { name: n });

beforeEach(() => {
  clave = null;
});

describe("sesión real con la oferta cerrada", () => {
  // `offer: undefined` se pone DESPUÉS de construir: como argumento, el valor
  // por omisión lo sustituiría por «cerrada» y la prueba mediría otra cosa.
  it.each([
    ["cerrada", datos()],
    ["sin publicar (API anterior)", { ...datos(), offer: undefined }],
  ])("%s: ni pagar ni re-agendar, y se puede cancelar", (_caso, initial) => {
    render(<SessionDetailShell initial={initial} />);
    expect(boton("Pagar ahora")).toBeNull();
    expect(boton("Re-agendar")).toBeNull();
    expect(boton("Cancelar")).not.toBeNull();
    expect(
      screen.getByText(/Todavía no ofrecemos sesiones de terapia\./),
    ).toBeInTheDocument();
  });

  it("pagada y en hora: la sala se abre igual", () => {
    render(
      <SessionDetailShell
        initial={datos({ paymentStatus: "PAID", scheduledAt: AHORA })}
      />,
    );
    expect(
      screen.getByRole("link", { name: /Unirse a la sala/ }),
    ).toBeInTheDocument();
  });

  it("ya cancelada: no invita a cancelarla otra vez", () => {
    render(<SessionDetailShell initial={datos({ status: "CANCELLED" })} />);
    expect(screen.queryByText(/puedes cancelarla/)).toBeNull();
    expect(boton("Pagar ahora")).toBeNull();
  });
});

describe("sesión real con la oferta abierta (control contrario)", () => {
  it("se paga y se re-agenda", () => {
    render(<SessionDetailShell initial={datos({ offer: { open: true } })} />);
    expect(boton("Pagar ahora")).not.toBeNull();
    expect(boton("Re-agendar")).not.toBeNull();
  });
});

describe("sesión de demostración", () => {
  it.each([true, false])(
    "con la oferta abierta=%s no se paga, no se mueve y no se entra",
    (open) => {
      for (const paymentStatus of ["PENDING", "PAID"]) {
        const { unmount } = render(
          <SessionDetailShell
            initial={datos({
              isDemo: true,
              offer: { open },
              paymentStatus,
              scheduledAt: AHORA,
            })}
          />,
        );
        expect(boton("Pagar ahora")).toBeNull();
        expect(boton("Re-agendar")).toBeNull();
        expect(screen.queryByRole("link", { name: /sala/ })).toBeNull();
        expect(screen.queryByText(/La sala se abre/)).toBeNull();
        expect(screen.queryByText("Pre-sesión")).toBeNull();
        expect(screen.getByText(/perfil de demostración/)).toBeInTheDocument();
        expect(boton("Cancelar")).not.toBeNull();
        unmount();
      }
    },
  );

  it("lo que ya escribió se lee, y no se edita", () => {
    clave = new Uint8Array(32);
    const { container } = render(
      <SessionDetailShell
        initial={datos({ isDemo: true, intentionCiphertext: "c" })}
      />,
    );
    expect(screen.getByText("lo que escribí")).toBeInTheDocument();
    expect(container.querySelector("textarea")).toBeNull();
  });

  it("sin la clave no se lee, y se dice cómo", () => {
    render(
      <SessionDetailShell
        initial={datos({ isDemo: true, intentionCiphertext: "c" })}
      />,
    );
    expect(screen.queryByText("lo que escribí")).toBeNull();
    expect(screen.getByText(/Desbloquea tu Diario/)).toBeInTheDocument();
  });
});
