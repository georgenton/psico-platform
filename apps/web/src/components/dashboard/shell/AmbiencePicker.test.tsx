import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";

vi.mock("@psico/api-client", () => ({
  usersApi: { updatePreferences: vi.fn() },
}));

import { usersApi } from "@psico/api-client";
import { AmbiencePicker } from "./AmbiencePicker";

const mockedUsersApi = vi.mocked(usersApi);

describe("AmbiencePicker", () => {
  beforeEach(() => {
    mockedUsersApi.updatePreferences.mockReset();
    document.body.className = "";
  });

  it("renders the active ambient label on the chip", () => {
    render(<AmbiencePicker initialAmbient="enfoque" />);
    expect(screen.getByRole("button", { name: /Enfoque/ })).toBeInTheDocument();
  });

  it("opens the popover and lists all four ambients", async () => {
    const user = userEvent.setup();
    render(<AmbiencePicker initialAmbient="calma" />);
    await user.click(screen.getByRole("button", { name: /Calma/ }));
    expect(screen.getByRole("menu")).toBeInTheDocument();
    expect(
      screen.getByRole("menuitemradio", { name: /Calma/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("menuitemradio", { name: /Enfoque/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("menuitemradio", { name: /Energía/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("menuitemradio", { name: /Noche/ }),
    ).toBeInTheDocument();
  });

  it("PATCHes the new ambient + applies body.amb-{id} + fires onChange", async () => {
    const user = userEvent.setup();
    mockedUsersApi.updatePreferences.mockResolvedValueOnce({} as never);
    const onChange = vi.fn();
    render(<AmbiencePicker initialAmbient="calma" onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: /Calma/ }));
    await user.click(screen.getByRole("menuitemradio", { name: /Noche/ }));

    await waitFor(() => {
      expect(mockedUsersApi.updatePreferences).toHaveBeenCalledWith({
        ambient: "noche",
      });
    });
    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith("noche");
    });
    expect(document.body.classList.contains("amb-noche")).toBe(true);
  });

  it("rolls back the ambient + body class when the API call fails", async () => {
    const user = userEvent.setup();
    mockedUsersApi.updatePreferences.mockRejectedValueOnce(new Error("boom"));
    render(<AmbiencePicker initialAmbient="calma" />);

    await user.click(screen.getByRole("button", { name: /Calma/ }));
    await user.click(screen.getByRole("menuitemradio", { name: /Noche/ }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/No se pudo guardar/);
    });
    expect(document.body.classList.contains("amb-noche")).toBe(false);
    expect(document.body.classList.contains("amb-calma")).toBe(true);
  });

  it("does not call the API when picking the active option", async () => {
    const user = userEvent.setup();
    render(<AmbiencePicker initialAmbient="enfoque" />);

    await user.click(screen.getByRole("button", { name: /Enfoque/ }));
    await user.click(screen.getByRole("menuitemradio", { name: /Enfoque/ }));

    expect(mockedUsersApi.updatePreferences).not.toHaveBeenCalled();
  });
});
