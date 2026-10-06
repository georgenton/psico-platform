// Metro config for the mobile app.
//
// ── Why this file exists ──────────────────────────────────────────────────
//
// expo-router builds its route table by globbing `app/`, and four tests live
// there because they read their sibling screen's source
// (`app/(tabs)/evolucion-copy-contract.test.ts` and friends). Metro therefore
// pulled them into the bundle as if they were routes, and the bundle failed:
//
//   You attempted to import the Node standard library module "fs" from
//   "apps/mobile/app/(tabs)/evolucion-copy-contract.test.ts".
//
// A test file has no business in an application bundle regardless of what it
// imports, so this excludes them rather than changing the tests. Jest resolves
// its own files and is unaffected — it does not use Metro's resolver.
//
// ── How it was found ──────────────────────────────────────────────────────
//
// By running the app, which CI does not do: `ci.yml` excludes mobile from the
// build ("built via EAS"), so Metro is never exercised and a bundle-breaking
// problem can sit in `main` indefinitely. This was the second of two such
// problems — the first was `@babel/runtime` not being declared by any
// package.json, which made the bundle fail even earlier. Both predate the
// staging profile; fixing the first is what revealed this one.

// Metro loads this file with `require`, so it has to be CommonJS — an `import`
// here would break the bundler before any lint rule mattered. The rule is
// disabled for that one line rather than for the file.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// Anything that is a test, anywhere, is not part of the app.
config.resolver.blockList = [
  ...(Array.isArray(config.resolver.blockList)
    ? config.resolver.blockList
    : config.resolver.blockList
      ? [config.resolver.blockList]
      : []),
  /.*\.(test|spec)\.(ts|tsx|js|jsx)$/,
  /.*\/__tests__\/.*/,
];

module.exports = config;
