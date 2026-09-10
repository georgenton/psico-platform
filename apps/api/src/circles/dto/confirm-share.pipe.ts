import { Injectable } from "@nestjs/common";
import type { PipeTransform } from "@nestjs/common";
import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";
import type { CircleShareConfirmation } from "@psico/types";
import { circlesException } from "../circles-http-errors";
import {
  ConfirmEditedSummaryDto,
  ConfirmKeepPrivateDto,
  ConfirmSelectedFieldsDto,
} from "./participation.dto";

/**
 * The runtime boundary for a confirmed share.
 *
 * ── The hole this closes ───────────────────────────────────────────────────
 *
 * The handler used to declare the body as a TypeScript union:
 *
 *     @Body() dto: ConfirmSelectedFieldsDto | ConfirmEditedSummaryDto | ...
 *
 * A union has no runtime representation. `design:paramtypes` emits `Object`
 * for it, Nest's `ValidationPipe` sees a metatype it cannot validate and skips
 * validation ENTIRELY — so every rule those three classes declare was inert.
 * Nothing was checked: not the mode, not the lengths, not `forbidNonWhitelisted`.
 * The visible symptom was that OpenAPI carried no `requestBody` for either
 * `share-confirmations` route, which is the same fact seen from outside.
 *
 * It was worse than "unvalidated". The narrowing helper ended with
 * `return { mode: "KEEP_PRIVATE" }`, so ANY body whose `mode` was not one of
 * the two recognised strings — a typo, `null`, an object, an absent field —
 * was silently recorded as a deliberate decision not to share. The one answer
 * a person gives that the product must never invent for them.
 *
 * ── What replaces it ───────────────────────────────────────────────────────
 *
 * This pipe takes `unknown` and rebuilds the closed union itself:
 *
 *   1. the body must be a plain object — not an array, not `null`;
 *   2. `mode` must be exactly one of the three known strings, matched against
 *      a lookup table, so an unknown mode has nowhere to fall through TO;
 *   3. the matching class is instantiated and validated with `whitelist` and
 *      `forbidNonWhitelisted`, which is what rejects `privateDraft`, `reason`,
 *      `userId`, `participantId`, `circleId`, a `summary` sent under
 *      `SELECTED_FIELDS`, `fields` sent under `EDITED_SUMMARY`, and anything
 *      at all sent under `KEEP_PRIVATE`;
 *   4. the returned value is rebuilt field by field from the validated
 *      instance, so even a property that survived transformation cannot ride
 *      along into the domain.
 *
 * Step 4 is not belt-and-braces. `plainToInstance` with
 * `excludeExtraneousValues: false` keeps unknown keys on the object; validation
 * rejects them, but if a future edit relaxed that flag, an explicit
 * reconstruction still hands the domain exactly the fields it declares.
 *
 * Every refusal is `CIRCLE_INVALID_PAYLOAD`. Which rule was broken is a
 * property of the request the caller composed; a caller composing a valid one
 * never sees any of them.
 */

/** A JSON object, and specifically not an array and not `null`. */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Instantiate and validate, or refuse.
 *
 * `whitelist` strips undecorated properties and `forbidNonWhitelisted` turns
 * their presence into an error — which is what rejects `privateDraft`,
 * `reason`, `userId`, `participantId`, `circleId`, and a `summary` or `fields`
 * sent under the wrong mode.
 */
function validated<T extends object>(
  cls: new () => T,
  body: Record<string, unknown>,
): T {
  const instance = plainToInstance(cls, body, {
    enableImplicitConversion: false,
  });
  const errors = validateSync(instance, {
    whitelist: true,
    forbidNonWhitelisted: true,
    forbidUnknownValues: true,
    validationError: { target: false, value: false },
  });
  if (errors.length > 0) throw circlesException("CIRCLE_INVALID_PAYLOAD");
  return instance;
}

@Injectable()
export class ParseShareConfirmationPipe implements PipeTransform<
  unknown,
  CircleShareConfirmation
> {
  transform(value: unknown): CircleShareConfirmation {
    if (!isPlainObject(value)) throw circlesException("CIRCLE_INVALID_PAYLOAD");

    // A `switch` over the three literals, with no `default` that produces a
    // value. An unknown mode falls off the end into the refusal below — it
    // has nowhere to fall through TO, which is the whole repair.
    switch (value.mode) {
      case "SELECTED_FIELDS": {
        const dto = validated(ConfirmSelectedFieldsDto, value);
        return {
          mode: "SELECTED_FIELDS",
          fields: dto.fields.map((f) => ({
            fieldKey: f.fieldKey,
            value: f.value,
          })),
        };
      }
      case "EDITED_SUMMARY": {
        const dto = validated(ConfirmEditedSummaryDto, value);
        return { mode: "EDITED_SUMMARY", summary: dto.summary };
      }
      case "KEEP_PRIVATE": {
        validated(ConfirmKeepPrivateDto, value);
        return { mode: "KEEP_PRIVATE" };
      }
      default:
        throw circlesException("CIRCLE_INVALID_PAYLOAD");
    }
  }
}
