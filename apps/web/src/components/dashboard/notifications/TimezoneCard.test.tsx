import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

// Mock the server action — components calling server actions through
// the @/actions import must use a mocked module so the React tree can
// invoke the function as a plain Promise.
vi.mock("@/actions/timezone", () => ({
  setTimezoneActionStrict: vi.fn().mockResolvedValue(undefined),
  setTimezoneAction: vi.fn().mockResolvedValue(undefined),
}));

import { setTimezoneActionStrict } from "@/actions/timezone";
import { TimezoneCard } from "./TimezoneCard";

/**
 * Pin the browser-detected timezone to a known value so the
 * mismatch-detection branches are deterministic across CI envs.
 */
function pinBrowserTimezone(tz: string) {
  const RealDateTimeFormat = Intl.DateTimeFormat;
  vi.spyOn(Intl, "DateTimeFormat").mockImplementation(((
    ...args: ConstructorParameters<typeof Intl.DateTimeFormat>
  ) => {
    const instance = new RealDateTimeFormat(...args);
    const orig = instance.resolvedOptions.bind(instance);
    instance.resolvedOptions = () => ({ ...orig(), timeZone: tz });
    return instance;
  }) as unknown as typeof Intl.DateTimeFormat);
}

describe("TimezoneCard", () => {
  beforeEach(() => {
    vi.mocked(setTimezoneActionStrict).mockClear();
    vi.mocked(setTimezoneActionStrict).mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders 'No configurada (UTC)' when stored timezone is null", () => {
    render(<TimezoneCard currentTimezone={null} />);
    expect(screen.getByTestId("stored-tz")).toHaveTextContent(
      "No configurada (UTC)",
    );
    // browser tz comes from Intl.DateTimeFormat; jsdom returns "UTC".
    expect(screen.getByTestId("browser-tz")).toBeInTheDocument();
  });

  it("shows the stored timezone when one exists", () => {
    render(<TimezoneCard currentTimezone="America/Guayaquil" />);
    expect(screen.getByTestId("stored-tz")).toHaveTextContent(
      "America/Guayaquil",
    );
  });

  it("submits a new timezone via the server action when select changes", async () => {
    render(<TimezoneCard currentTimezone="America/Guayaquil" />);
    const select = screen.getByTestId("tz-select") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "Europe/Madrid" } });
    await waitFor(() => {
      expect(setTimezoneActionStrict).toHaveBeenCalledWith("Europe/Madrid");
    });
    await waitFor(
      () =>
        expect(screen.getByText("Zona horaria guardada")).toBeInTheDocument(),
      { timeout: 2000 },
    );
  });

  it("surfaces an inline error when the server action throws", async () => {
    vi.mocked(setTimezoneActionStrict).mockRejectedValueOnce(new Error("boom"));
    render(<TimezoneCard currentTimezone="America/Guayaquil" />);
    fireEvent.change(screen.getByTestId("tz-select"), {
      target: { value: "Europe/Madrid" },
    });
    expect(
      await screen.findByText(/No pudimos guardar el cambio/),
    ).toBeInTheDocument();
  });

  it("hides the 'use device tz' button when stored and browser tz match", () => {
    pinBrowserTimezone("America/Guayaquil");
    render(<TimezoneCard currentTimezone="America/Guayaquil" />);
    expect(screen.queryByTestId("use-device-tz")).not.toBeInTheDocument();
  });

  it("shows the 'use device tz' button when they mismatch", () => {
    pinBrowserTimezone("Europe/Madrid");
    render(<TimezoneCard currentTimezone="America/Guayaquil" />);
    expect(screen.getByTestId("use-device-tz")).toBeInTheDocument();
  });
});
