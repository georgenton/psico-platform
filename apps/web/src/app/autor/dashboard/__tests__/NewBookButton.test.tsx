import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NewBookButton } from "../NewBookButton";

const mockAction = vi.fn();
const mockPush = vi.fn();
vi.mock("@/app/dashboard/admin/users/actions", () => ({
  changeUserRoleAction: vi.fn(),
}));
vi.mock("../actions", () => ({
  createBookAction: (...args: unknown[]) => mockAction(...args),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

beforeEach(() => {
  mockAction.mockReset();
  mockPush.mockReset();
});

describe("NewBookButton", () => {
  it("renders idle CTA", () => {
    render(<NewBookButton />);
    expect(
      screen.getByRole("button", { name: /Nuevo libro/i }),
    ).toBeInTheDocument();
  });

  it("opens inline form when clicked", async () => {
    const user = userEvent.setup();
    render(<NewBookButton />);
    await user.click(screen.getByRole("button", { name: /Nuevo libro/i }));
    expect(
      screen.getByPlaceholderText(/Título del libro/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Crear/i }),
    ).toBeInTheDocument();
  });

  it("rejects titles shorter than 2 chars", async () => {
    const user = userEvent.setup();
    render(<NewBookButton />);
    await user.click(screen.getByRole("button", { name: /Nuevo libro/i }));
    await user.type(screen.getByPlaceholderText(/Título del libro/i), "x");
    await user.click(screen.getByRole("button", { name: /Crear/i }));
    expect(
      await screen.findByText(/al menos 2 caracteres/i),
    ).toBeInTheDocument();
    expect(mockAction).not.toHaveBeenCalled();
  });

  it("calls createBookAction with trimmed title", async () => {
    mockAction.mockResolvedValue({ ok: true, bookId: "b1" });
    const user = userEvent.setup();
    render(<NewBookButton />);
    await user.click(screen.getByRole("button", { name: /Nuevo libro/i }));
    await user.type(
      screen.getByPlaceholderText(/Título del libro/i),
      "  Mi libro nuevo  ",
    );
    await user.click(screen.getByRole("button", { name: /Crear/i }));
    expect(mockAction).toHaveBeenCalledWith("Mi libro nuevo");
  });

  it("navigates to the new book after success", async () => {
    mockAction.mockResolvedValue({ ok: true, bookId: "book-xyz" });
    const user = userEvent.setup();
    render(<NewBookButton />);
    await user.click(screen.getByRole("button", { name: /Nuevo libro/i }));
    await user.type(
      screen.getByPlaceholderText(/Título del libro/i),
      "Otro libro",
    );
    await user.click(screen.getByRole("button", { name: /Crear/i }));
    // Wait for promise resolution + redirect
    await screen.findByRole("button", { name: /Nuevo libro/i }).catch(() => {});
    expect(mockPush).toHaveBeenCalledWith("/autor/libros/book-xyz");
  });

  it("surfaces error when the action rejects", async () => {
    mockAction.mockRejectedValue(new Error("boom"));
    const user = userEvent.setup();
    render(<NewBookButton />);
    await user.click(screen.getByRole("button", { name: /Nuevo libro/i }));
    await user.type(
      screen.getByPlaceholderText(/Título del libro/i),
      "Otro libro",
    );
    await user.click(screen.getByRole("button", { name: /Crear/i }));
    expect(await screen.findByText(/boom/i)).toBeInTheDocument();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("cancel returns to idle without firing", async () => {
    const user = userEvent.setup();
    render(<NewBookButton />);
    await user.click(screen.getByRole("button", { name: /Nuevo libro/i }));
    await user.click(screen.getByRole("button", { name: /Cancelar/i }));
    expect(mockAction).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: /Nuevo libro/i }),
    ).toBeInTheDocument();
  });
});
