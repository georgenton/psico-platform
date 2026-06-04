/**
 * Jest config for the Expo + React Native mobile app (Sprint S40).
 *
 * `jest-expo` ships the babel transforms RN needs (Reanimated, Flow
 * stripping, Expo modules) plus the right testEnvironment defaults. Vitest
 * is NOT usable here — RN's runtime needs the Metro babel preset and
 * Vitest doesn't have it.
 *
 * `transformIgnorePatterns` whitelists ES modules that ship untranspiled:
 * RN itself, all `expo-*` packages, and our internal `@psico/*` workspace
 * packages which are TS source. Without this, Jest tries to `require()`
 * ESM and blows up with `Unexpected token 'export'`.
 *
 * `setupFilesAfterEnv` registers RNTL's `extend-expect` matchers
 * (`toBeOnTheScreen`, `toHaveTextContent`, etc.) once.
 */
module.exports = {
  preset: "jest-expo",
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
  testMatch: [
    "<rootDir>/src/**/*.test.{ts,tsx}",
    "<rootDir>/app/**/*.test.{ts,tsx}",
  ],
  // pnpm flattens dependencies into `node_modules/.pnpm/...` instead of
  // shallow `node_modules/<pkg>`. Jest's default `transformIgnorePatterns`
  // assumes the shallow layout, so RN's Flow-typed files (under
  // `@react-native/js-polyfills`) get parsed without transform and blow up
  // on `type X = ...`. We use a more permissive pattern that matches the
  // package name anywhere in the resolved path — pnpm-safe.
  transformIgnorePatterns: [
    "node_modules/(?!(.*/)?(jest-)?react-native|(.*/)?@react-native|(.*/)?@react-navigation|(.*/)?expo|(.*/)?@expo|(.*/)?@expo-google-fonts|(.*/)?react-native-svg|(.*/)?@psico)",
  ],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },
  // CI runs jest in cold cache + a slower CPU than dev. `waitFor` queues
  // a useEffect → setState → react test renderer flush that can take
  // a few seconds on the first run. Bumping the global timeout from 5s
  // to 15s gives the slowest path enough room without masking real bugs.
  testTimeout: 15000,
};
