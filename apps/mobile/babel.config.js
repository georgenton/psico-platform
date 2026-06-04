// Sprint S40: babel config for the mobile app.
//
// Expo's Metro bundler auto-applies `babel-preset-expo`, but Jest doesn't
// share Metro's resolver — it needs an explicit babel config to transform
// TypeScript, JSX, and the Flow syntax that ships in React Native's
// `@react-native/js-polyfills`. Without this, Jest's parser blows up on
// lines like `type ErrorHandler = (error: mixed) => void`.
//
// `api.cache(true)` opts into the long-lived Babel cache so subsequent
// runs reuse the compiled output.

module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
  };
};
