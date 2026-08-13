import { describe, expect, it } from "vitest";
import { GUARDS_METADATA } from "@nestjs/common/constants";
import { BooksController } from "./books.controller";
import { OptionalJwtAuthGuard } from "../auth/guards/optional-jwt-auth.guard";

/**
 * A handler that reads `req.user` must have something that puts it there.
 *
 * This is the mistake that shipped: `list` and `getDetail` inspected
 * `req.user`, ran no guard, and were therefore served as anonymous no matter
 * what token the caller sent. Nothing failed loudly — the catalogue just
 * quietly forgot who everyone was.
 *
 * Read from Nest's own route metadata rather than the source text, so it
 * follows the decorator rather than a spelling of it.
 */
describe("BOOKS_OPTIONAL_AUTH_RATCHET", () => {
  const guardsOn = (handler: keyof BooksController) =>
    (Reflect.getMetadata(
      GUARDS_METADATA,
      BooksController.prototype[handler] as object,
    ) ?? []) as unknown[];

  for (const handler of ["list", "getDetail"] as const) {
    it(`${handler} authenticates an offered token`, () => {
      expect(guardsOn(handler)).toContain(OptionalJwtAuthGuard);
    });
  }
});
