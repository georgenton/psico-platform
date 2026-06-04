// Sprint S40: Jest setup for the mobile app.
//
// Registers the React Native Testing Library matchers. Importing
// `@testing-library/react-native/extend-expect` (or directly from the
// matchers entry, depending on the version) wires `toBeOnTheScreen`,
// `toHaveTextContent`, `toHaveProp` and friends into Jest's `expect`.

import "@testing-library/react-native/extend-expect";

// Mock `@expo/vector-icons`. The real implementation initialises native
// fonts via Expo's font-loading bridge, which is not available in the
// jsdom-like Jest env — it throws `loadedNativeFonts.forEach is not a
// function`. The stub renders the icon's name as plain text so tests can
// still verify presence without booting Expo's runtime.
jest.mock("@expo/vector-icons", () => {
  // jest.mock factories can't reference outer-scope variables (Jest hoists
  // them above imports). We use `require()` inside the factory — that's
  // the canonical pattern. ESLint's no-var-requires rule is disabled here
  // for that reason.
  /* eslint-disable @typescript-eslint/no-var-requires */
  const React = require("react");
  const { Text } = require("react-native");
  /* eslint-enable @typescript-eslint/no-var-requires */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Icon = ({ name }: any) => React.createElement(Text, null, name);
  return {
    Ionicons: Icon,
    MaterialIcons: Icon,
    MaterialCommunityIcons: Icon,
    FontAwesome: Icon,
    FontAwesome5: Icon,
    AntDesign: Icon,
    Feather: Icon,
    Entypo: Icon,
    EvilIcons: Icon,
    Octicons: Icon,
    SimpleLineIcons: Icon,
    Zocial: Icon,
  };
});
