import {
  Controller,
  Get,
  Header,
  NotFoundException,
  Param,
  Redirect,
} from "@nestjs/common";
import { ApiExcludeController } from "@nestjs/swagger";
// Directly, not through the barrel: `storage/index.ts` loads `StorageModule`,
// which declares this controller — importing the barrel here would close that
// loop and leave `StorageService` undefined when the decorator runs.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { StorageService } from "../storage/storage.service";
import {
  CONTENT_ASSET_SIGNED_TTL_SEC,
  isAllowedAssetKey,
} from "./content-asset";

/**
 * Chapter illustrations and book covers, out of a private bucket.
 *
 * Public on purpose, and only this far: covers and illustrations are the
 * pictures printed in a book, and an `<img>` cannot carry a bearer token. What
 * makes that safe is not authentication but the key shape — see
 * `isAllowedAssetKey`. Audiobook and podcast masters live in the same bucket
 * under prefixes this route will not sign, and they keep their own
 * authenticated path.
 *
 * A 302 rather than a proxy: the bytes travel from R2 to the reader directly,
 * so a chapter full of figures does not stream through our API, and the signed
 * URL is never something we persist.
 */
@ApiExcludeController()
@Controller("content-assets")
export class ContentAssetsController {
  constructor(private readonly storage: StorageService) {}

  @Get("*")
  @Redirect()
  // Browsers may cache the redirect briefly, but never longer than the URL it
  // points at — a stale 302 would send a reader to a signature that has expired.
  @Header("Cache-Control", "public, max-age=60")
  async serve(@Param() params: Record<string, string>) {
    // Express puts a wildcard match in the `0` param. Rebuilt rather than read
    // from the raw URL so a query string cannot smuggle anything into the key.
    const key = params["0"] ?? "";

    // One refusal for every reason. A 404 says nothing about whether the object
    // exists, which prefixes we serve, or how close a guess was — the same
    // answer for a typo, a protected master and a traversal attempt.
    if (!isAllowedAssetKey(key)) {
      throw new NotFoundException({ code: "ASSET_NOT_FOUND" });
    }

    const url = await this.storage.getSignedUrl(
      key,
      CONTENT_ASSET_SIGNED_TTL_SEC,
    );
    return { url, statusCode: 302 };
  }
}
