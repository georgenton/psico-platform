import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { PublishBookPanel } from "./[bookSlug]/PublishBookPanel";

/**
 * Publishing is the one irreversible thing in this vertical, so the tests are
 * about what it promises before it happens and what it refuses to do after.
 */

const actions = vi.hoisted(() => ({
  publishBookAction: vi.fn(),
  saveChapterDraftAction: vi.fn(),
  previewChapterAction: vi.fn(),
}));
vi.mock("./actions", () => actions);
vi.mock("../actions", () => actions);

const refresh = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

function renderPanel() {
  return render(
    <PublishBookPanel
      bookSlug="eec"
      draftRevisionId="rev_6"
      draftRevisionNumber={6}
      changedCount={2}
      changedTitles={["Cap. 1 · Uno", "Cap. 2 · Dos"]}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  actions.publishBookAction.mockResolvedValue({
    ok: true,
    data: {
      revisionId: "rev_6",
      revisionNumber: 6,
      changedUnitCountBeforePublish: 2,
    },
  });
});

describe("PublishBookPanel", () => {
  it("names the revision and the chapters before publishing anything", async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(
      screen.getByRole("button", { name: "Publicar cambios del libro" }),
    );

    expect(
      screen.getByText("Vas a publicar la revisión r6."),
    ).toBeInTheDocument();
    expect(screen.getByText("Capítulos con cambios: 2.")).toBeInTheDocument();
    expect(screen.getByText("Cap. 1 · Uno")).toBeInTheDocument();
    // Nothing has been published by opening a confirmation.
    expect(actions.publishBookAction).not.toHaveBeenCalled();
  });

  it("publishes the draft it showed, by id", async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(
      screen.getByRole("button", { name: "Publicar cambios del libro" }),
    );
    await user.click(screen.getByRole("button", { name: "Publicar" }));

    await waitFor(() =>
      expect(actions.publishBookAction).toHaveBeenCalledWith("eec", "rev_6"),
    );
  });

  it("on a conflict asks for a reload and never retries", async () => {
    const user = userEvent.setup();
    actions.publishBookAction.mockResolvedValue({ ok: false, conflict: true });
    renderPanel();

    await user.click(
      screen.getByRole("button", { name: "Publicar cambios del libro" }),
    );
    await user.click(screen.getByRole("button", { name: "Publicar" }));

    await waitFor(() =>
      expect(
        screen.getByText("El borrador cambió. Recarga antes de publicar."),
      ).toBeInTheDocument(),
    );
    expect(
      screen.getByRole("button", { name: "Recargar" }),
    ).toBeInTheDocument();
    expect(actions.publishBookAction).toHaveBeenCalledTimes(1);
  });

  it("surfaces a plain failure without claiming success", async () => {
    const user = userEvent.setup();
    actions.publishBookAction.mockResolvedValue({
      ok: false,
      error: "No pudimos publicar.",
    });
    renderPanel();

    await user.click(
      screen.getByRole("button", { name: "Publicar cambios del libro" }),
    );
    await user.click(screen.getByRole("button", { name: "Publicar" }));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "No pudimos publicar.",
      ),
    );
    expect(refresh).not.toHaveBeenCalled();
  });
});
