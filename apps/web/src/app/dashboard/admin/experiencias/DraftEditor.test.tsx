import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ChapterExperienceDefinition } from "@psico/types";

/**
 * CMS V1 (#637) — the editor's two jobs.
 *
 * It has to let an editor say what the twelve scene kinds can express, and it
 * has to keep `order` honest while they move things around. Everything else —
 * what a definition may contain, when it may be published — belongs to the
 * server, and this file deliberately does not re-assert it.
 */

const { saveDraft, publishDraft, push } = vi.hoisted(() => ({
  saveDraft: vi.fn(async (_id: string, _definition: unknown) => ({
    id: "row_1",
  })),
  publishDraft: vi.fn(
    async (_bookSlug: string, _chapterOrder: number, _id: string) => ({
      id: "row_1",
      publishedAt: "now",
    }),
  ),
  push: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

vi.mock("@/app/dashboard/admin/experiencias/actions", () => ({
  saveDraftAction: saveDraft,
  publishDraftAction: publishDraft,
  createDraftAction: vi.fn(),
  createNextDraftAction: vi.fn(),
}));

import { DraftEditor } from "./[bookSlug]/[chapterOrder]/borrador/[id]/DraftEditor";

function definition(): ChapterExperienceDefinition {
  return {
    experienceKey: "qa-cms",
    experienceVersion: 1,
    bookSlug: "emociones-en-construccion",
    chapterOrder: 1,
    title: "Una experiencia",
    status: "DRAFT",
    guidePin: { guideKey: "g", guideVersion: 1 },
    scenes: [
      {
        sceneKey: "intro",
        order: 1,
        kind: "INTRO",
        copy: { title: "Primera", body: ["Cuerpo uno."] },
      },
      {
        sceneKey: "ejemplo",
        order: 2,
        kind: "EXAMPLE",
        copy: { title: "Segunda", body: ["Cuerpo dos."] },
      },
    ],
  } as ChapterExperienceDefinition;
}

function renderEditor() {
  return render(
    <DraftEditor
      id="row_1"
      initial={definition()}
      bookSlug="emociones-en-construccion"
      chapterOrder={1}
    />,
  );
}

/** The order labels currently on screen, e.g. ["1. INTRO", "2. EXAMPLE"]. */
function sceneLabels(): string[] {
  return screen
    .getAllByTestId(/^scene-row-\d+$/)
    .map((row) => within(row).getByText(/^\d+\. [A-Z]+$/).textContent ?? "");
}

beforeEach(() => {
  cleanup();
  saveDraft.mockClear();
  publishDraft.mockClear();
  push.mockClear();
});

describe("DraftEditor — scene ordering", () => {
  it("renders the scenes in their declared order", () => {
    renderEditor();
    expect(sceneLabels()).toEqual(["1. INTRO", "2. EXAMPLE"]);
  });

  it("renumbers from 1 after a move, so `order` never has a gap", async () => {
    renderEditor();

    await userEvent.click(screen.getByTestId("move-down-0"));

    // The kinds swapped AND the numbers were rewritten — not just reordered.
    expect(sceneLabels()).toEqual(["1. EXAMPLE", "2. INTRO"]);
  });

  it("cannot move the first scene up or the last one down", () => {
    renderEditor();
    expect(screen.getByTestId("move-up-0")).toBeDisabled();
    expect(screen.getByTestId("move-down-1")).toBeDisabled();
  });

  it("renumbers after a removal too", async () => {
    renderEditor();

    await userEvent.click(screen.getByTestId("remove-0"));

    expect(sceneLabels()).toEqual(["1. EXAMPLE"]);
  });

  it("saves the scenes in the order shown, with order rewritten to 1..N", async () => {
    renderEditor();

    await userEvent.click(screen.getByTestId("move-down-0"));
    await userEvent.click(screen.getByTestId("save-draft"));

    const saved = saveDraft.mock.calls[0]![1] as ChapterExperienceDefinition;
    expect(saved.scenes.map((s) => [s.order, s.kind])).toEqual([
      [1, "EXAMPLE"],
      [2, "INTRO"],
    ]);
  });
});

describe("DraftEditor — adding scenes", () => {
  it("offers every scene kind the runtime can render, and no others", () => {
    renderEditor();

    const options = within(screen.getByTestId("add-scene-kind"))
      .getAllByRole("option")
      .map((o) => o.textContent);

    expect(options).toEqual([
      "INTRO",
      "PASSAGE",
      "CONCEPT",
      "EXAMPLE",
      "AUDIO",
      "VIDEO",
      "PRACTICE",
      "REFLECTION",
      "QUESTION",
      "RECALL",
      "SUMMARY",
      "RESONANCE",
    ]);
    expect(options).toHaveLength(12);
  });

  it("appends the chosen kind at the end with the next order", async () => {
    renderEditor();

    await userEvent.selectOptions(
      screen.getByTestId("add-scene-kind"),
      "RECALL",
    );
    await userEvent.click(screen.getByTestId("add-scene"));

    expect(sceneLabels()).toEqual(["1. INTRO", "2. EXAMPLE", "3. RECALL"]);
  });

  it("offers the guide binding only on kinds that can complete a step", async () => {
    renderEditor();
    // INTRO and EXAMPLE are presentational, so neither may claim a step.
    expect(screen.queryByTestId("scene-completesGuideStepKey")).toBeNull();

    await userEvent.selectOptions(
      screen.getByTestId("add-scene-kind"),
      "CONCEPT",
    );
    await userEvent.click(screen.getByTestId("add-scene"));

    expect(
      screen.getByTestId("scene-completesGuideStepKey"),
    ).toBeInTheDocument();
  });
});

describe("DraftEditor — writing", () => {
  it("turns each non-empty line of the body into one paragraph", async () => {
    renderEditor();

    const body = screen
      .getAllByRole("textbox")
      .find((el) => el.tagName === "TEXTAREA")!;
    await userEvent.clear(body);
    await userEvent.type(body, "Primer párrafo.\n\nSegundo párrafo.");
    await userEvent.click(screen.getByTestId("save-draft"));

    const saved = saveDraft.mock.calls[0]![1] as ChapterExperienceDefinition;
    expect(saved.scenes[0]!.copy.body).toEqual([
      "Primer párrafo.",
      "Segundo párrafo.",
    ]);
  });

  it("saves what is on screen before publishing it", async () => {
    // Publishing the last SAVED state rather than the visible one would ship
    // something the editor never saw.
    renderEditor();

    await userEvent.click(screen.getByTestId("publish-draft"));

    expect(saveDraft).toHaveBeenCalledTimes(1);
    expect(publishDraft).toHaveBeenCalledTimes(1);
    expect(saveDraft.mock.invocationCallOrder[0]!).toBeLessThan(
      publishDraft.mock.invocationCallOrder[0]!,
    );
  });

  it("surfaces the server's editorial message instead of a generic failure", async () => {
    saveDraft.mockRejectedValueOnce(
      new Error("Una escena dice completar un paso que la guía no tiene."),
    );
    renderEditor();

    await userEvent.click(screen.getByTestId("save-draft"));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Una escena dice completar un paso que la guía no tiene.",
    );
  });
});
