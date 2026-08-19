import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { SelectableGuideOption } from "@psico/types";

/**
 * C.4 (#639) — changing a draft's guide, from the surface that does it.
 *
 * `rebindDraftAction` existed before this component did, which meant the one
 * operation C.4 adds to the CMS had no way to be performed. What is asserted
 * here is the whole contract of the control: it appears only while the lineage
 * may still move, a reserved guide can never be picked, confirming needs an
 * actual change, a double click sends one request, and a failure keeps the
 * editor's choice rather than making them start again.
 */

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const rebindDraftAction = vi.fn();
const listSelectableGuidesAction = vi.fn();

vi.mock("@/app/dashboard/admin/experiencias/actions", () => ({
  createDraftAction: vi.fn(),
  createNextDraftAction: vi.fn(),
  saveDraftAction: vi.fn(),
  publishDraftAction: vi.fn(),
  previewDraftAction: vi.fn(),
  archiveDraftAction: vi.fn(),
  rebindDraftAction: (...a: unknown[]) => rebindDraftAction(...a),
  listSelectableGuidesAction: (...a: unknown[]) =>
    listSelectableGuidesAction(...a),
}));

import { GuideBindingCard } from "./[bookSlug]/[chapterOrder]/borrador/[id]/GuideBindingCard";

const CURRENT = { guideKey: "eec-c1", guideVersion: 1 };

const option = (
  guideKey: string,
  availability: SelectableGuideOption["availability"],
): SelectableGuideOption => ({
  guideKey,
  guideVersion: 1,
  stepCount: 3,
  availability,
});

function renderCard(rebindable = true) {
  return render(
    <GuideBindingCard
      id="row_1"
      bookSlug="emociones-en-construccion"
      chapterOrder={1}
      experienceKey="eec-c1-cuerpo-antes-que-mente"
      currentPin={CURRENT}
      rebindable={rebindable}
      contentUnitId="unit_eec_c1"
    />,
  );
}

async function openSelector() {
  await userEvent.click(screen.getByTestId("guide-binding-change"));
  await waitFor(() =>
    expect(screen.queryByTestId("guide-selector-loading")).toBeNull(),
  );
}

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  listSelectableGuidesAction.mockResolvedValue([
    option("eec-c1", "OWNED_BY_THIS_EXPERIENCE"),
    option("eec-c1-alterna", "AVAILABLE"),
  ]);
  rebindDraftAction.mockResolvedValue({ id: "row_1" });
});

describe("GuideBindingCard", () => {
  it("names the guide the draft currently holds", () => {
    renderCard();
    expect(screen.getByTestId("guide-binding-current")).toHaveTextContent(
      "eec-c1 · v1",
    );
  });

  it("offers no control at all once the lineage has published", () => {
    // Absent, not disabled. A disabled button still reads as "this might work",
    // and the rule is that it never will again for this lineage.
    renderCard(false);
    expect(screen.getByTestId("guide-binding-locked")).toBeInTheDocument();
    expect(screen.queryByTestId("guide-binding-change")).toBeNull();
  });

  it("asks the server which guides are free, from this lineage's point of view", async () => {
    renderCard();
    await openSelector();
    expect(listSelectableGuidesAction).toHaveBeenCalledWith(
      "emociones-en-construccion",
      1,
      "eec-c1-cuerpo-antes-que-mente",
    );
    // Its own guide reads as its own rather than as "taken by somebody".
    expect(screen.getByTestId("guide-eec-c1-1-state")).toHaveTextContent(
      /Ya es de esta experiencia/i,
    );
  });

  it("cannot confirm without an actual change", async () => {
    renderCard();
    await openSelector();
    // The current pin is preselected, so "confirm" would be a no-op write.
    expect(screen.getByTestId("guide-binding-confirm")).toBeDisabled();
    await userEvent.click(screen.getByRole("radio", { name: /alterna/ }));
    expect(screen.getByTestId("guide-binding-confirm")).toBeEnabled();
  });

  it("never lets a guide reserved by another lineage be picked", async () => {
    listSelectableGuidesAction.mockResolvedValue([
      option("eec-c1", "OWNED_BY_THIS_EXPERIENCE"),
      option("eec-c1-alterna", "RESERVED_BY_ANOTHER_EXPERIENCE"),
    ]);
    renderCard();
    await openSelector();
    expect(screen.getByRole("radio", { name: /alterna/ })).toBeDisabled();
    expect(
      screen.getByTestId("guide-eec-c1-alterna-1-state"),
    ).toHaveTextContent(/Reservada por otra experiencia/i);
    expect(screen.getByTestId("guide-binding-confirm")).toBeDisabled();
  });

  it("sends the new pin and the chapter the page was rendered against", async () => {
    renderCard();
    await openSelector();
    await userEvent.click(screen.getByRole("radio", { name: /alterna/ }));
    await userEvent.click(screen.getByTestId("guide-binding-confirm"));

    expect(rebindDraftAction).toHaveBeenCalledWith(
      "emociones-en-construccion",
      1,
      "row_1",
      { guideKey: "eec-c1-alterna", guideVersion: 1 },
      "unit_eec_c1",
    );
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("a conflict keeps the choice and says what may have happened", async () => {
    rebindDraftAction.mockRejectedValue(new Error("409"));
    renderCard();
    await openSelector();
    await userEvent.click(screen.getByRole("radio", { name: /alterna/ }));
    await userEvent.click(screen.getByTestId("guide-binding-confirm"));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /otra persona la haya tomado/i,
    );
    expect(screen.getByRole("radio", { name: /alterna/ })).toBeChecked();
    expect(screen.getByTestId("guide-binding-confirm")).toBeEnabled();
  });

  it("a double click sends ONE rebind", async () => {
    // Guarded in the handler, not only by `disabled`: the second request would
    // race the first one's own result.
    let release!: (v: { id: string }) => void;
    rebindDraftAction.mockReturnValue(
      new Promise<{ id: string }>((resolve) => {
        release = resolve;
      }),
    );
    renderCard();
    await openSelector();
    await userEvent.click(screen.getByRole("radio", { name: /alterna/ }));

    const confirm = screen.getByTestId("guide-binding-confirm");
    await userEvent.click(confirm);
    await userEvent.click(confirm);

    expect(rebindDraftAction).toHaveBeenCalledTimes(1);
    // Let the in-flight request settle inside the test: leaving it pending
    // means React state lands after teardown, which is a warning about this
    // file rather than about the component.
    release({ id: "row_1" });
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("cancelling leaves the binding exactly as it was", async () => {
    renderCard();
    await openSelector();
    await userEvent.click(screen.getByRole("radio", { name: /alterna/ }));
    await userEvent.click(screen.getByRole("button", { name: /Cancelar/ }));

    expect(rebindDraftAction).not.toHaveBeenCalled();
    expect(screen.getByTestId("guide-binding-current")).toHaveTextContent(
      "eec-c1 · v1",
    );
    expect(screen.getByTestId("guide-binding-change")).toBeInTheDocument();
  });
});
