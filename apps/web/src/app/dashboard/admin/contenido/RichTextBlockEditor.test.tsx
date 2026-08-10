import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { RichTextBlockEditor } from "./[bookSlug]/[chapterOrder]/RichTextBlockEditor";

/**
 * The formatting toolbar.
 *
 * The property worth guarding above all others: pressing B, I or U never
 * changes `content`. Formatting is metadata, and an editor who bolds a word
 * must not silently alter the text a reader's highlights are anchored to.
 */

const CONTENT = "La mente también aprende";

function setup(meta: Record<string, unknown> | null = null) {
  const onContentChange = vi.fn();
  const onMetaChange = vi.fn();
  render(
    <RichTextBlockEditor
      content={CONTENT}
      meta={meta}
      label="Párrafo 1"
      rows={6}
      onContentChange={onContentChange}
      onMetaChange={onMetaChange}
    />,
  );
  return { onContentChange, onMetaChange };
}

/** Select a range in the textarea the way a person would leave it. */
function select(start: number, end: number) {
  const el = screen.getByLabelText("Párrafo 1") as HTMLTextAreaElement;
  el.focus();
  el.setSelectionRange(start, end);
  el.dispatchEvent(new Event("select", { bubbles: true }));
  return el;
}

describe("the toolbar", () => {
  it("offers exactly bold, italic and underline, with accessible names", () => {
    // Three, and no ambition to become Word.
    setup();
    for (const name of ["Negrita", "Cursiva", "Subrayado"]) {
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    }
    expect(screen.getAllByRole("button")).toHaveLength(3);
  });

  it("is disabled until something is selected, and says why", () => {
    setup();
    for (const name of ["Negrita", "Cursiva", "Subrayado"]) {
      expect(screen.getByRole("button", { name })).toBeDisabled();
    }
    expect(
      screen.getByText(/Selecciona texto para darle formato/i),
    ).toBeInTheDocument();
  });

  it("enables once there is a selection", async () => {
    setup();
    select(9, 16);
    await screen.findByRole("button", { name: "Subrayado" });
    expect(screen.getByRole("button", { name: "Subrayado" })).toBeEnabled();
  });

  it("reports pressed state for a selection already fully marked", async () => {
    setup({ inlineMarks: [{ type: "BOLD", startOffset: 0, endOffset: 8 }] });
    select(0, 8);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Negrita" })).toHaveAttribute(
        "aria-pressed",
        "true",
      ),
    );
    expect(screen.getByRole("button", { name: "Cursiva" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });
});

describe("applying formatting", () => {
  it("stores an underline over the selection and leaves the text alone", async () => {
    const { onMetaChange, onContentChange } = setup();
    select(9, 16);
    await userEvent.click(screen.getByRole("button", { name: "Subrayado" }));

    expect(onMetaChange).toHaveBeenCalledWith({
      inlineMarks: [{ type: "UNDERLINE", startOffset: 9, endOffset: 16 }],
    });
    // The whole invariant, in one assertion.
    expect(onContentChange).not.toHaveBeenCalled();
  });

  it.each([
    ["Negrita", "BOLD"],
    ["Cursiva", "ITALIC"],
    ["Subrayado", "UNDERLINE"],
  ])("stores %s as a structured mark", async (label, type) => {
    const { onMetaChange } = setup();
    select(0, 8);
    await userEvent.click(screen.getByRole("button", { name: label }));

    expect(onMetaChange).toHaveBeenCalledWith({
      inlineMarks: [{ type, startOffset: 0, endOffset: 8 }],
    });
  });

  it("removes formatting when the selection already has it", async () => {
    const { onMetaChange } = setup({
      inlineMarks: [{ type: "BOLD", startOffset: 0, endOffset: 8 }],
    });
    select(0, 8);
    await userEvent.click(screen.getByRole("button", { name: "Negrita" }));

    // The KEY disappears; the metadata object itself does not. A block that had
    // meta keeps having meta — dropping the object would be a bigger claim than
    // "this text is no longer bold", and other verticals store things here.
    expect(onMetaChange).toHaveBeenCalledWith({});
  });

  it("splits a mark when removing from the middle", async () => {
    const { onMetaChange } = setup({
      inlineMarks: [{ type: "BOLD", startOffset: 0, endOffset: 20 }],
    });
    select(5, 10);
    await userEvent.click(screen.getByRole("button", { name: "Negrita" }));

    expect(onMetaChange).toHaveBeenCalledWith({
      inlineMarks: [
        { type: "BOLD", startOffset: 0, endOffset: 5 },
        { type: "BOLD", startOffset: 10, endOffset: 20 },
      ],
    });
  });

  it("preserves unrelated metadata", async () => {
    // A block can carry metadata this vertical does not administer; formatting
    // must not be the thing that quietly drops it.
    const { onMetaChange } = setup({ guideAnchor: "a1", somethingElse: 7 });
    select(0, 8);
    await userEvent.click(screen.getByRole("button", { name: "Negrita" }));

    expect(onMetaChange).toHaveBeenCalledWith(
      expect.objectContaining({ guideAnchor: "a1", somethingElse: 7 }),
    );
  });
});

describe("the format preview", () => {
  it("stays hidden while there is no formatting", () => {
    setup();
    expect(screen.queryByTestId("format-preview")).not.toBeInTheDocument();
    expect(screen.queryByText("Vista del formato")).not.toBeInTheDocument();
  });

  it("shows the formatting without needing a publish", () => {
    // The gap the production canary found: an editor underlined a phrase and
    // had no way to see it until it was live.
    setup({
      inlineMarks: [{ type: "UNDERLINE", startOffset: 9, endOffset: 16 }],
    });
    const preview = screen.getByTestId("format-preview");
    expect(preview.textContent).toBe(CONTENT);
    const underlined = preview.querySelector('[style*="underline"]');
    expect(underlined?.textContent).toBe("también");
  });
});

describe("editing text after formatting", () => {
  it("moves the marks with the text and never edits the text to save them", async () => {
    const { onContentChange } = setup({
      inlineMarks: [{ type: "BOLD", startOffset: 9, endOffset: 16 }],
    });
    const el = screen.getByLabelText("Párrafo 1") as HTMLTextAreaElement;
    // Typing at the very start pushes everything right.
    await userEvent.type(el, "X", {
      initialSelectionStart: 0,
      initialSelectionEnd: 0,
    });

    const [content, meta] = onContentChange.mock.calls[0]!;
    expect(content).toBe(`X${CONTENT}`);
    expect(meta).toEqual({
      inlineMarks: [{ type: "BOLD", startOffset: 10, endOffset: 17 }],
    });
  });
});
