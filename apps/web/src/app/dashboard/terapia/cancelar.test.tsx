import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { SessionPrepResponse } from "@psico/types";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * De la lista a la cancelación, sin callejones.
 *
 * Cancelar se conserva con la oferta cerrada, pero conservarlo en el servidor
 * no basta: hay que poder llegar a la sesión y ver que se canceló.
 */

const { serverFetch, cancelSessionAction, refresh } = vi.hoisted(() => ({
  serverFetch: vi.fn(),
  cancelSessionAction: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/api.server", () => ({ serverFetch, isNextThrow: () => false }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/lib/crypto/diary-key-context", () => ({
  useDiaryKey: () => ({ key: null }),
}));
vi.mock("@/actions/terapia", () => ({
  cancelSessionAction,
  retryCheckoutAction: vi.fn(),
  updateSessionPrepAction: vi.fn(),
}));
vi.mock("@/components/dashboard/terapia/RescheduleModal", () => ({
  RescheduleModal: () => null,
}));
vi.mock("@/components/dashboard/terapia/FeedbackModal", () => ({
  FeedbackModal: () => null,
}));

import { SessionDetailShell } from "@/components/dashboard/terapia/SessionDetailShell";
import SesionesPage from "./sesiones/page";

const enHoras = (h: number) =>
  new Date(Date.now() + h * 3600_000).toISOString();

const fila = (id: string, horas: number, status: string) => ({
  id,
  therapist: { name: `Nombre ${id}`, isDemo: false },
  scheduledAt: enHoras(horas),
  durationMin: 50,
  status,
  paymentStatus: "PAID",
  feedbackRating: null,
});

const detalle = (status: string) =>
  ({
    session: {
      id: "s1",
      therapist: { id: "t", name: "Nombre", isDemo: false },
      scheduledAt: enHoras(24),
      durationMin: 50,
      modality: "INDIVIDUAL",
      joinUrl: null,
      paymentStatus: "PAID",
      status,
    },
    prep: {
      intentionCiphertext: null,
      intentionNonce: null,
      checkInMood: null,
      sharedEntryIds: [],
    },
    offer: { open: false },
  }) as unknown as SessionPrepResponse;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("toda sesión que se puede cancelar se puede abrir", () => {
  it("la que viene y la que ya empezó; una cerrada, no", async () => {
    serverFetch.mockResolvedValue({
      upcoming: [fila("viene", 24, "SCHEDULED")],
      past: [
        fila("empezo", -0.1, "SCHEDULED"),
        fila("cancelada", -48, "CANCELLED"),
      ],
      offer: { open: false },
    });
    const { container } = render(await SesionesPage());
    expect(
      [...container.querySelectorAll("a")].map((a) => a.getAttribute("href")),
    ).toEqual([
      "/dashboard/terapia/sesiones/viene",
      "/dashboard/terapia/sesiones/empezo",
    ]);
  });
});

describe("cancelar se ve", () => {
  it("al volver del servidor, la sesión está cancelada y no se ofrece otra vez", async () => {
    vi.spyOn(window, "prompt").mockReturnValue("No puedo ir");
    cancelSessionAction.mockResolvedValue({ ok: true });
    const { rerender } = render(
      <SessionDetailShell initial={detalle("SCHEDULED")} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(cancelSessionAction).toHaveBeenCalledWith(
      "s1",
      "No puedo ir",
      false,
    );

    // Lo que hace `router.refresh()`: la misma pantalla, con datos nuevos.
    rerender(<SessionDetailShell initial={detalle("CANCELLED")} />);
    expect(screen.getByText("Cancelada")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancelar" })).toBeNull();
  });
});
