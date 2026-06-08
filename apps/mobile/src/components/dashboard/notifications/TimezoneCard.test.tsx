import { fireEvent, render } from "@testing-library/react-native";

// jest-expo doesn't render Modal children inline; replace Modal with a
// plain View. Also flatten FlatList → map() so virtualization doesn't
// hide rows beyond `initialNumToRender`. We use jest.requireActual inside
// the factory (not a top-level require) — that's the only pattern the
// jest mock hoister supports here.
/* eslint-disable @typescript-eslint/no-var-requires, @typescript-eslint/no-explicit-any */
jest.mock("react-native", () => {
  const RN = jest.requireActual("react-native");
  const React = jest.requireActual("react");
  RN.Modal = ({ visible, children }: any) => {
    if (!visible) return null;
    return React.createElement(RN.View, null, children);
  };
  RN.FlatList = ({ data, renderItem, keyExtractor }: any) =>
    React.createElement(
      RN.View,
      null,
      data.map((item: any, index: number) =>
        React.createElement(
          RN.View,
          { key: keyExtractor ? keyExtractor(item, index) : index },
          renderItem({ item, index }),
        ),
      ),
    );
  return RN;
});
/* eslint-enable @typescript-eslint/no-var-requires, @typescript-eslint/no-explicit-any */

import { TimezoneCard } from "./TimezoneCard";

// Mock the API client. usersApi.updateTimezone resolves by default; tests can
// override via vi.mocked(usersApi.updateTimezone).mockRejectedValueOnce(...).
jest.mock("@psico/api-client", () => ({
  usersApi: {
    updateTimezone: jest.fn().mockResolvedValue(undefined),
  },
}));

import { usersApi } from "@psico/api-client";

describe("TimezoneCard (mobile)", () => {
  beforeEach(() => {
    (usersApi.updateTimezone as jest.Mock).mockClear();
    (usersApi.updateTimezone as jest.Mock).mockResolvedValue(undefined);
  });

  it("renders 'No configurada (UTC)' when stored timezone is null", () => {
    const { getByTestId } = render(<TimezoneCard currentTimezone={null} />);
    expect(getByTestId("stored-tz")).toHaveTextContent("No configurada (UTC)");
  });

  it("shows the stored timezone when one exists", () => {
    const { getByTestId } = render(
      <TimezoneCard currentTimezone="America/Guayaquil" />,
    );
    expect(getByTestId("stored-tz")).toHaveTextContent("America/Guayaquil");
  });

  it("opens the picker modal when the change row is pressed", () => {
    const { getByTestId, queryByText } = render(
      <TimezoneCard currentTimezone="America/Guayaquil" />,
    );
    expect(queryByText("Elegir zona horaria")).toBeNull();
    fireEvent.press(getByTestId("change-tz"));
    expect(queryByText("Elegir zona horaria")).not.toBeNull();
  });

  it("renders the device timezone hint", () => {
    const { getByTestId } = render(<TimezoneCard currentTimezone={null} />);
    // jest-expo's Intl.DateTimeFormat returns UTC in CI; ensure the
    // device row is wired up regardless of the resolved value.
    expect(getByTestId("device-tz")).toBeTruthy();
  });
});
