import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CompartirInvitacion } from "./CompartirInvitacion";

/**
 * The four buttons, and the promises the copy makes about them.
 *
 * What is asserted here is narrow on purpose. Whether WhatsApp actually opens
 * is the operating system's business and is verified by hand; what a test CAN
 * hold is that each button carries THIS card's link, correctly encoded, that
 * nothing is claimed to have been sent, and that no request leaves before the
 * person clicks.
 */

const URL_A =
  "https://circulos.example.test/i#abc-123_XYZ~with&special=chars?and+plus";
const URL_B = "https://circulos.example.test/i#segundo-enlace";

describe("CompartirInvitacion", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    // No `share` by default: the button only appears where the browser has it.
    Object.defineProperty(navigator, "share", {
      value: undefined,
      configurable: true,
      writable: true,
    });
  });

  it("makes no request to anybody before the click", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    render(<CompartirInvitacion url={URL_A} label="Participante 2" />);
    // Rendering the card must not reach WhatsApp, an SDK or a shortener. The
    // link is a plain href until somebody chooses to use it.
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(document.querySelectorAll("script[src]")).toHaveLength(0);
  });

  it("puts THIS card's link in the WhatsApp message, encoded", () => {
    render(<CompartirInvitacion url={URL_A} label="Participante 2" />);
    const link = screen.getByTestId("compartir-whatsapp") as HTMLAnchorElement;
    expect(link.href).toMatch(/^https:\/\/wa\.me\/\?text=/);
    // Round-tripping rather than matching a literal: the fragment, the `&`
    // and the `+` all have to survive, and a hand-written expectation would
    // be asserting the encoder rather than the link.
    const text = decodeURIComponent(link.href.split("text=")[1]!);
    expect(text).toContain(URL_A);
    expect(text).toContain("La invitación es personal");
    // No number: FeelVerse never holds one.
    expect(link.href).not.toMatch(/wa\.me\/[0-9]/);
  });

  it("puts THIS card's link in the mail body, with a subject", () => {
    render(<CompartirInvitacion url={URL_A} label="Participante 2" />);
    const link = screen.getByTestId("compartir-correo") as HTMLAnchorElement;
    expect(link.href.startsWith("mailto:?")).toBe(true);
    expect(link.href).toContain("subject=");
    const body = decodeURIComponent(link.href.split("body=")[1]!);
    expect(body).toContain(URL_A);
  });

  it("shares its OWN link, never the neighbour's", () => {
    const { rerender } = render(
      <CompartirInvitacion url={URL_A} label="Participante 2" />,
    );
    const first = (
      screen.getByTestId("compartir-whatsapp") as HTMLAnchorElement
    ).href;
    rerender(<CompartirInvitacion url={URL_B} label="Participante 3" />);
    const second = (
      screen.getByTestId("compartir-whatsapp") as HTMLAnchorElement
    ).href;
    expect(first).not.toEqual(second);
    expect(decodeURIComponent(second)).toContain(URL_B);
    expect(decodeURIComponent(second)).not.toContain(URL_A);
  });

  it("says «Enlace copiado» only after the clipboard accepted it", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    render(<CompartirInvitacion url={URL_A} label="Participante 2" />);
    fireEvent.click(screen.getByTestId("compartir-copiar"));
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("Enlace copiado"),
    );
    expect(writeText).toHaveBeenCalledWith(URL_A);
  });

  it("offers a way out when the clipboard refuses", async () => {
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
      configurable: true,
    });
    render(<CompartirInvitacion url={URL_A} label="Participante 2" />);
    fireEvent.click(screen.getByTestId("compartir-copiar"));
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(/cópialo a mano/i),
    );
  });

  it("hides the system share button where the browser has none", () => {
    render(<CompartirInvitacion url={URL_A} label="Participante 2" />);
    expect(screen.queryByTestId("compartir-dispositivo")).toBeNull();
  });

  it("uses navigator.share when there is one, and never claims delivery", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", {
      value: share,
      configurable: true,
    });
    render(<CompartirInvitacion url={URL_A} label="Participante 2" />);
    fireEvent.click(screen.getByTestId("compartir-dispositivo"));
    await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    expect(share.mock.calls[0]![0].text).toContain(URL_A);
    // "Se abrió el menú" — not "se envió". The browser cannot tell us the
    // second thing, so the screen must not say it.
    const status = await screen.findByRole("status");
    expect(status.textContent).toMatch(/se abrió/i);
    expect(status.textContent).not.toMatch(/envi/i);
  });

  it("treats a cancelled share as nothing at all", async () => {
    const share = vi.fn().mockRejectedValue(new Error("AbortError"));
    Object.defineProperty(navigator, "share", {
      value: share,
      configurable: true,
    });
    render(<CompartirInvitacion url={URL_A} label="Participante 2" />);
    fireEvent.click(screen.getByTestId("compartir-dispositivo"));
    await waitFor(() => expect(share).toHaveBeenCalled());
    // Cancelling is a normal thing to do, not an error to apologise for.
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("labels every action for somebody who cannot see the icon", () => {
    render(<CompartirInvitacion url={URL_A} label="Participante 2" />);
    for (const name of [/WhatsApp/i, /correo/i, /Copiar el enlace/i]) {
      expect(screen.getByLabelText(name)).toBeTruthy();
    }
  });
});
