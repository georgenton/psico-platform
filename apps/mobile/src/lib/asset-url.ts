const API_ROOT = process.env.EXPO_PUBLIC_API_URL ?? "";

/**
 * Make a stored image reference loadable.
 *
 * Same contract as the web helper: the API returns a path on itself for images
 * held in a private bucket, and the client — which knows where the API lives —
 * turns it into something `<Image source={{uri}}>` can fetch.
 */
export function assetUrl(value: string): string {
  if (!value.startsWith("/")) return value;
  return `${API_ROOT.replace(/\/$/, "")}${value}`;
}
