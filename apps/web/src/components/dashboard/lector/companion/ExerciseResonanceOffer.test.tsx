import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ExerciseResonanceOffer } from "./ExerciseResonanceOffer";

const CONCEPT = {
  key: "eec-cuerpo-antes-que-mente",
  label: "El cuerpo sabe antes que la mente",
};

function mockFetchOk() {
  return vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue({ ok: true } as Response);
}

describe("ExerciseResonanceOffer (web)", () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it("shows the offer with the chapter concept label", () => {
    mockFetchOk();
    render(
      <ExerciseResonanceOffer
        concept={CONCEPT}
        bookSlug="emociones-en-construccion"
        chapterOrder={1}
        apiBase="/api"
        token="tok"
      />,
    );
    expect(
      screen.getByText(/El cuerpo sabe antes que la mente/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /añadir a mi mapa/i }),
    ).toBeInTheDocument();
  });

  it("confirms as a resonance with source 'exercise' and shows the done state", async () => {
    const spy = mockFetchOk();
    const user = userEvent.setup();
    render(
      <ExerciseResonanceOffer
        concept={CONCEPT}
        bookSlug="emociones-en-construccion"
        chapterOrder={2}
        apiBase="/api"
        token="tok-9"
      />,
    );
    await user.click(screen.getByRole("button", { name: /añadir a mi mapa/i }));

    expect(spy).toHaveBeenCalledWith(
      "/api/resonances",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer tok-9" }),
      }),
    );
    const body = JSON.parse(
      (spy.mock.calls[0][1] as RequestInit).body as string,
    );
    expect(body).toEqual({
      conceptKey: CONCEPT.key,
      conceptLabel: CONCEPT.label,
      bookSlug: "emociones-en-construccion",
      chapterOrder: 2,
      source: "exercise",
    });

    await waitFor(() =>
      expect(screen.getByText(/Añadido a tu mapa/)).toBeInTheDocument(),
    );
  });

  it("surfaces an inline error when the POST fails", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: false } as Response);
    const user = userEvent.setup();
    render(
      <ExerciseResonanceOffer
        concept={CONCEPT}
        bookSlug="emociones-en-construccion"
        chapterOrder={1}
        apiBase="/api"
        token="tok"
      />,
    );
    await user.click(screen.getByRole("button", { name: /añadir a mi mapa/i }));
    await waitFor(() =>
      expect(screen.getByText(/No pudimos guardarlo/)).toBeInTheDocument(),
    );
  });
});
