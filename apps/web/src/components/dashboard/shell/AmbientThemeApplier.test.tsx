import { render, cleanup } from "@testing-library/react";
import { AmbientThemeApplier } from "./AmbientThemeApplier";

describe("AmbientThemeApplier", () => {
  afterEach(() => {
    cleanup();
    document.body.className = "";
  });

  it("adds body.amb-{ambient} on mount", () => {
    render(<AmbientThemeApplier ambient="enfoque" />);
    expect(document.body.classList.contains("amb-enfoque")).toBe(true);
  });

  it("removes the previous ambient class when prop changes", () => {
    const { rerender } = render(<AmbientThemeApplier ambient="calma" />);
    expect(document.body.classList.contains("amb-calma")).toBe(true);

    rerender(<AmbientThemeApplier ambient="noche" />);
    expect(document.body.classList.contains("amb-calma")).toBe(false);
    expect(document.body.classList.contains("amb-noche")).toBe(true);
  });

  it("cleans the body class on unmount", () => {
    const { unmount } = render(<AmbientThemeApplier ambient="energia" />);
    expect(document.body.classList.contains("amb-energia")).toBe(true);
    unmount();
    expect(document.body.classList.contains("amb-energia")).toBe(false);
  });
});
