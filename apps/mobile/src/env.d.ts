// Expo replaces EXPO_PUBLIC_* at build time via Babel.
// This declaration satisfies TypeScript without pulling in @types/node.
declare const process: {
  readonly env: {
    readonly EXPO_PUBLIC_API_URL?: string;
    readonly [key: string]: string | undefined;
  };
};
