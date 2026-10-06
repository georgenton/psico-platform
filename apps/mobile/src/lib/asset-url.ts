import { apiOrigin } from "@/config/environment";

/**
 * Make a stored image reference loadable.
 *
 * Same contract as the web helper: the API returns a path on itself for images
 * held in a private bucket, and the client — which knows where the API lives —
 * turns it into something `<Image source={{uri}}>` can fetch.
 *
 * The origin comes from `config/environment`, which is the ONLY place the API
 * URL is parsed. It used to read `process.env.EXPO_PUBLIC_API_URL ?? ""` itself,
 * which meant a second, independent idea of where the API lives — and with the
 * variable unset it returned the input path unchanged, so `<Image>` was handed a
 * relative URI that React Native cannot resolve.
 */
export function assetUrl(value: string): string {
  if (!value.startsWith("/")) return value;
  // `apiOrigin()` is already normalized to scheme + host with no trailing
  // slash, so there is nothing to strip here.
  return `${apiOrigin()}${value}`;
}
