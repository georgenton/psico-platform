/**
 * ESLint for the mobile app.
 *
 * ── Why this file exists ──────────────────────────────────────────────────
 *
 * The shared config (`config/eslint-config`) extends `eslint:recommended` and
 * `@typescript-eslint/recommended`, and `@typescript-eslint` is its only
 * plugin. It has no React plugin at all — so `react-hooks/rules-of-hooks` was
 * never disabled here, it simply did not exist. The linter had no idea what a
 * hook was.
 *
 * That is how a Rules of Hooks violation lived in `main`:
 * `app/(tabs)/books/[slug].tsx` called `useState` AFTER three early returns, so
 * the first render (loading) never reached it and the second one did. React
 * threw "Rendered more hooks than during the previous render" and the book
 * detail screen crashed on every open — the main route out of the library.
 *
 * Nothing else would have caught it either: CI excludes mobile from `build`, so
 * Metro never bundles the app, and that route has no screen test.
 *
 * ── Scope of what is enabled ──────────────────────────────────────────────
 *
 * `rules-of-hooks` as an ERROR. It is a correctness rule about an invariant
 * React itself enforces at runtime; a violation is always a bug, so there is no
 * judgement call and no false-positive tax.
 *
 * `exhaustive-deps` is deliberately NOT enabled here. It is a lint-quality rule
 * with real false positives, and turning it on across 117 files would bury this
 * change in unrelated findings — the "deuda ajena" this file is meant to avoid.
 * It deserves its own pass, with someone reading each warning.
 *
 * Local to `apps/mobile` rather than added to the shared config, for the same
 * reason: `apps/web` is also React and has never been linted for hooks either
 * (Sprint front-eco worked around a missing `exhaustive-deps` by refactoring to
 * `useRef`). Enabling it there is a separate decision with its own cleanup.
 */
module.exports = {
  root: true,
  extends: ["@psico/eslint-config"],
  plugins: ["react-hooks"],
  rules: {
    "react-hooks/rules-of-hooks": "error",
  },
};
