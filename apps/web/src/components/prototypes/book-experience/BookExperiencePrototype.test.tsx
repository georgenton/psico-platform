import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { BookExperiencePrototype } from "./BookExperiencePrototype";

/**
 * The prototype has to be recognisably a prototype.
 *
 * Two failure modes matter here. One is a maquette that quietly calls the real
 * API — a design surface must never touch a person's data. The other is a
 * maquette that looks shippable: a play button that does nothing, or media
 * captioned as if the master already existed. Both are covered below.
 */

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("the five modes", () => {
  it.each([
    ["book", "Un encabezado de ejemplo"],
    ["audiobook", "Prototipo de reproductor"],
    ["podcast", "Episodio de demostración 1"],
    ["video", "Prototipo de playlist"],
    ["guided", "Recorrido del capítulo"],
  ])("renders the %s view", (key, marker) => {
    render(<BookExperiencePrototype />);
    fireEvent.click(screen.getByTestId(`prototype-mode-${key}`));
    expect(screen.getByText(marker)).toBeInTheDocument();
  });

  it("offers exactly the five modes of the standard, one selected", () => {
    render(<BookExperiencePrototype />);
    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(5);
    expect(
      tabs.filter((t) => t.getAttribute("aria-selected") === "true"),
    ).toHaveLength(1);
  });
});

describe("it says what it is", () => {
  it("carries a prototype disclaimer", () => {
    render(<BookExperiencePrototype />);
    expect(screen.getByTestId("prototype-disclaimer")).toHaveTextContent(
      /Prototipo visual interno/,
    );
  });

  it.each([
    ["audiobook", "Prototipo de reproductor"],
    ["video", "Prototipo de playlist"],
  ])("labels the %s media area as a prototype", (key, label) => {
    render(<BookExperiencePrototype />);
    fireEvent.click(screen.getByTestId(`prototype-mode-${key}`));
    expect(screen.getByText(label)).toBeInTheDocument();
  });
});

describe("the guided roadmap", () => {
  it("shows three micro-guides and a synthesis", () => {
    render(<BookExperiencePrototype />);
    fireEvent.click(screen.getByTestId("prototype-mode-guided"));
    // The unit title is rendered with its ordinal («1. Idea clave 1»), so the
    // matcher looks at the whole strong element rather than a bare string.
    for (const t of ["Idea clave 1", "Idea clave 2", "Idea clave 3"]) {
      expect(
        screen.getByText(
          (_c, el) => el?.tagName === "STRONG" && el.textContent!.includes(t),
        ),
      ).toBeInTheDocument();
    }
    expect(screen.getByText("Síntesis")).toBeInTheDocument();
  });

  it("classifies the current guide, and says the roadmap is not real yet", () => {
    render(<BookExperiencePrototype />);
    fireEvent.click(screen.getByTestId("prototype-mode-guided"));
    expect(screen.getByText("Guía breve")).toBeInTheDocument();
    expect(screen.getByText("1 idea del capítulo")).toBeInTheDocument();
    expect(
      screen.getByText(/Las ideas reales se seleccionan con el autor/),
    ).toBeInTheDocument();
  });
});

describe("it is inert", () => {
  it("FAKE_MEDIA_PLAYER=false — no audio, video or play control anywhere", () => {
    const { container } = render(<BookExperiencePrototype />);
    for (const key of ["audiobook", "podcast", "video"]) {
      fireEvent.click(screen.getByTestId(`prototype-mode-${key}`));
      expect(container.querySelector("audio")).toBeNull();
      expect(container.querySelector("video")).toBeNull();
      expect(container.querySelector("iframe")).toBeNull();
      expect(
        screen.queryByRole("button", { name: /reproducir|play/i }),
      ).toBeNull();
    }
  });

  it("makes no network request at all", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    render(<BookExperiencePrototype />);
    for (const key of ["audiobook", "podcast", "video", "guided", "book"]) {
      fireEvent.click(screen.getByTestId(`prototype-mode-${key}`));
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("it stays out of production", () => {
  const root = join(__dirname, "..", "..", "..");

  it("the route 404s when VERCEL_ENV is production", () => {
    const page = readFileSync(
      join(root, "app", "prototipos", "book-experience", "page.tsx"),
      "utf8",
    );
    expect(page).toContain('process.env.VERCEL_ENV === "production"');
    expect(page).toContain("notFound()");
    expect(page).toContain("index: false");
  });

  it("is not linked from the product navigation", () => {
    const shell = readFileSync(
      join(root, "app", "dashboard", "_DashboardShell.tsx"),
      "utf8",
    );
    expect(shell).not.toContain("book-experience");
    expect(shell).not.toContain("/prototipos");
  });
});
