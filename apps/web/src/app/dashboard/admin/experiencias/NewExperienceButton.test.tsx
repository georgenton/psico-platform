import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { SelectableGuideOption } from "@psico/types";

/**
 * CMS V1 (#637) · C.4 (#639) — starting an experience, now that the editor
 * picks the guide.
 *
 * The three states this file used to assert were about a chapter that resolved
 * ONE guide pin: no guide, guide free, guide taken. Two of them were really
 * statements about availability, and availability is now the server's answer
 * per guide — so the button stops deciding it and the selector shows it.
 *
 * What must still hold, and is asserted here: a reserved guide is visible and
 * unselectable rather than hidden; nothing can be created without a choice; a
 * failed create keeps the choice; and a double click creates one draft, not two.
 */

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const createDraftAction = vi.fn();
const listSelectableGuidesAction = vi.fn();

vi.mock("@/app/dashboard/admin/experiencias/actions", () => ({
  createDraftAction: (...a: unknown[]) => createDraftAction(...a),
  createNextDraftAction: vi.fn(),
  saveDraftAction: vi.fn(),
  publishDraftAction: vi.fn(),
  previewDraftAction: vi.fn(),
  archiveDraftAction: vi.fn(),
  rebindDraftAction: vi.fn(),
  listSelectableGuidesAction: (...a: unknown[]) =>
    listSelectableGuidesAction(...a),
}));

import { NewExperienceButton } from "./[bookSlug]/[chapterOrder]/NewExperienceButton";

const option = (
  guideKey: string,
  availability: SelectableGuideOption["availability"],
): SelectableGuideOption => ({
  guideKey,
  guideVersion: 1,
  stepCount: 3,
  availability,
});

function renderButton() {
  return render(
    <NewExperienceButton
      bookSlug="emociones-en-construccion"
      chapterOrder={1}
      contentUnitId="unit_eec_c1"
      bindableGuides={1}
    />,
  );
}

/** Open the form and wait for the server's answer to land. */
async function openForm() {
  await userEvent.click(screen.getByTestId("new-experience"));
  await waitFor(() =>
    expect(screen.queryByTestId("guide-selector-loading")).toBeNull(),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  cleanup();
  listSelectableGuidesAction.mockResolvedValue([option("eec-c1", "AVAILABLE")]);
  createDraftAction.mockResolvedValue({ id: "row_1" });
});

describe("NewExperienceButton", () => {
  it("asks the server which guides are free before offering anything", async () => {
    renderButton();
    await openForm();

    expect(listSelectableGuidesAction).toHaveBeenCalledWith(
      "emociones-en-construccion",
      1,
      null,
    );
    expect(screen.getByTestId("guide-selector")).toBeInTheDocument();
  });

  it("cannot create until a guide is chosen", async () => {
    renderButton();
    await openForm();

    expect(screen.getByTestId("new-experience-create")).toBeDisabled();
    await userEvent.click(screen.getByRole("radio"));
    expect(screen.getByTestId("new-experience-create")).toBeEnabled();
  });

  it("sends the chosen pin explicitly", async () => {
    renderButton();
    await openForm();
    await userEvent.click(screen.getByRole("radio"));
    await userEvent.click(screen.getByTestId("new-experience-create"));

    const definition = createDraftAction.mock.calls[0]![0];
    expect(definition.guidePin).toEqual({
      guideKey: "eec-c1",
      guideVersion: 1,
    });
  });

  it("shows a reserved guide as reserved, and refuses to select it", async () => {
    // Never hidden. "That guide does not exist" would be false, and an editor
    // who cannot see the collision cannot resolve it.
    listSelectableGuidesAction.mockResolvedValue([
      option("eec-c1", "RESERVED_BY_ANOTHER_EXPERIENCE"),
    ]);
    renderButton();
    await openForm();

    expect(screen.getByTestId("guide-eec-c1-1-state")).toHaveTextContent(
      /Reservada por otra experiencia/i,
    );
    expect(screen.getByRole("radio")).toBeDisabled();
    expect(screen.getByTestId("new-experience-create")).toBeDisabled();
  });

  it("says so when no guide's passage lives in this chapter", async () => {
    listSelectableGuidesAction.mockResolvedValue([]);
    renderButton();
    await openForm();

    expect(screen.getByTestId("guide-selector-empty")).toBeInTheDocument();
    expect(screen.getByTestId("new-experience-create")).toBeDisabled();
  });

  it("a failed create keeps the choice and says what may have happened", async () => {
    createDraftAction.mockRejectedValue(new Error("409"));
    renderButton();
    await openForm();
    await userEvent.click(screen.getByRole("radio"));
    await userEvent.click(screen.getByTestId("new-experience-create"));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /otra persona haya tomado esa guía/i,
    );
    // The selection survived: making the editor pick again would punish them
    // for our failure.
    expect(screen.getByRole("radio")).toBeChecked();
    expect(screen.getByTestId("new-experience-create")).toBeEnabled();
  });

  it("a double click creates ONE draft", async () => {
    // Guarded in the handler, not only by `disabled`: a version number spent
    // twice cannot be given back.
    let release!: (v: { id: string }) => void;
    createDraftAction.mockReturnValue(
      new Promise<{ id: string }>((resolve) => {
        release = resolve;
      }),
    );
    renderButton();
    await openForm();
    await userEvent.click(screen.getByRole("radio"));

    const create = screen.getByTestId("new-experience-create");
    await userEvent.click(create);
    await userEvent.click(create);

    expect(createDraftAction).toHaveBeenCalledTimes(1);
    release({ id: "row_1" });
  });

  it("the selector is keyboard-reachable and labelled", async () => {
    renderButton();
    await openForm();

    const radio = screen.getByRole("radio", { name: /eec-c1/ });
    expect(radio).toHaveAttribute("aria-describedby", "guide-eec-c1-1-state");
    await userEvent.tab();
    // Focus reaches the choice without a pointer.
    expect(document.activeElement).not.toBe(document.body);
  });

  it("does not offer to create when no guide could be chosen", async () => {
    // A real state with the current catalog, not a hypothetical: a chapter can
    // have exactly one guide and a definition the build ships already holding
    // it. Opening a form where nothing is selectable would be a promise the
    // page cannot keep.
    cleanup();
    render(
      <NewExperienceButton
        bookSlug="emociones-en-construccion"
        chapterOrder={1}
        contentUnitId="unit_eec_c1"
        bindableGuides={0}
      />,
    );
    expect(screen.getByTestId("new-experience-no-guide")).toBeInTheDocument();
    expect(screen.queryByTestId("new-experience")).toBeNull();
    expect(listSelectableGuidesAction).not.toHaveBeenCalled();
  });

  it("echoes the chapter the page was rendered against", async () => {
    // C.3A — a hint, never an authority. The server re-derives the identity and
    // refuses on a mismatch, which is what turns "created from a page opened
    // before a reorder" into something the editor sees.
    renderButton();
    await openForm();
    await userEvent.click(screen.getByRole("radio"));
    await userEvent.click(screen.getByTestId("new-experience-create"));
    expect(createDraftAction).toHaveBeenCalledWith(
      expect.anything(),
      "unit_eec_c1",
    );
  });
});
