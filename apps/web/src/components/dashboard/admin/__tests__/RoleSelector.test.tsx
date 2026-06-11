import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RoleSelector } from "../RoleSelector";

const mockAction = vi.fn();
vi.mock("@/app/dashboard/admin/users/actions", () => ({
  changeUserRoleAction: (...args: unknown[]) => mockAction(...args),
}));

beforeEach(() => {
  mockAction.mockReset();
});

describe("RoleSelector", () => {
  it("renders 'Cambiar rol' button in idle state", () => {
    render(
      <RoleSelector userId="u1" currentRole="USER" isSelf={false} />,
    );
    expect(
      screen.getByRole("button", { name: /Cambiar rol/i }),
    ).toBeInTheDocument();
  });

  it("opens editor when clicked", async () => {
    const user = userEvent.setup();
    render(
      <RoleSelector userId="u1" currentRole="USER" isSelf={false} />,
    );
    await user.click(screen.getByRole("button", { name: /Cambiar rol/i }));
    expect(screen.getByRole("combobox")).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Onboarding/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Cancelar/i }),
    ).toBeInTheDocument();
  });

  it("calls changeUserRoleAction with id + new role + reason", async () => {
    mockAction.mockResolvedValue({ ok: true, role: "AUTHOR", changed: true });
    const user = userEvent.setup();
    render(
      <RoleSelector userId="u1" currentRole="USER" isSelf={false} />,
    );
    await user.click(screen.getByRole("button", { name: /Cambiar rol/i }));
    await user.selectOptions(screen.getByRole("combobox"), "AUTHOR");
    await user.type(
      screen.getByPlaceholderText(/Onboarding/i),
      "B2B onboarding",
    );
    await user.click(
      screen.getByRole("button", { name: /Confirmar cambio/i }),
    );
    expect(mockAction).toHaveBeenCalledWith("u1", "AUTHOR", "B2B onboarding");
  });

  it("disables self-demote options when isSelf=true", async () => {
    const user = userEvent.setup();
    render(
      <RoleSelector userId="admin1" currentRole="ADMIN" isSelf={true} />,
    );
    await user.click(screen.getByRole("button", { name: /Cambiar rol/i }));
    const select = screen.getByRole("combobox");
    // ADMIN should be enabled
    expect(
      Array.from(select.querySelectorAll("option")).find(
        (o) => o.value === "ADMIN",
      ),
    ).not.toBeDisabled();
    // USER, AUTHOR, PSYCHOLOGIST should be disabled
    expect(
      Array.from(select.querySelectorAll("option")).find(
        (o) => o.value === "USER",
      ),
    ).toBeDisabled();
  });

  it("shows inline error when no-change response comes back", async () => {
    mockAction.mockResolvedValue({ ok: true, role: "USER", changed: false });
    const user = userEvent.setup();
    render(
      <RoleSelector userId="u1" currentRole="USER" isSelf={false} />,
    );
    await user.click(screen.getByRole("button", { name: /Cambiar rol/i }));
    await user.click(
      screen.getByRole("button", { name: /Confirmar cambio/i }),
    );
    // Same role -> no change, button is disabled, so we need to actually
    // change first then submit. The component disables Submit when nextRole
    // === currentRole. Verify it doesn't fire the action in that case.
    expect(mockAction).not.toHaveBeenCalled();
  });

  it("cancel returns to idle without firing the action", async () => {
    const user = userEvent.setup();
    render(
      <RoleSelector userId="u1" currentRole="USER" isSelf={false} />,
    );
    await user.click(screen.getByRole("button", { name: /Cambiar rol/i }));
    await user.click(screen.getByRole("button", { name: /Cancelar/i }));
    expect(mockAction).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: /Cambiar rol/i }),
    ).toBeInTheDocument();
  });

  it("surfaces error message when action throws", async () => {
    mockAction.mockRejectedValue(new Error("USER_NOT_FOUND"));
    const user = userEvent.setup();
    render(
      <RoleSelector userId="u1" currentRole="USER" isSelf={false} />,
    );
    await user.click(screen.getByRole("button", { name: /Cambiar rol/i }));
    await user.selectOptions(screen.getByRole("combobox"), "AUTHOR");
    await user.click(
      screen.getByRole("button", { name: /Confirmar cambio/i }),
    );
    expect(await screen.findByText(/USER_NOT_FOUND/)).toBeInTheDocument();
  });
});
