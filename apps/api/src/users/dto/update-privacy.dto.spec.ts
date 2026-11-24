import "reflect-metadata";
import { BadRequestException, ValidationPipe } from "@nestjs/common";
import { describe, expect, it } from "vitest";

import { UpdatePrivacyDto } from "./update-privacy.dto";

/**
 * Three of these fields left the screens because nothing acts on them. They did
 * NOT leave the contract: installed clients still send them, and the global
 * pipe answers 400 to any property a DTO does not declare — so dropping one
 * here would break saving the privacy settings on every phone not yet updated.
 *
 * The pipe is configured as `main.ts` configures it.
 */
const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: { enableImplicitConversion: true },
});

const pasa = (body: unknown) =>
  pipe.transform(body, { type: "body", metatype: UpdatePrivacyDto });

describe("UpdatePrivacyDto", () => {
  it.each([
    "shareDiaryWithTherapist",
    "anonymizedAnalytics",
    "marketingEmail",
    "localTextAnalysis",
  ])(
    "accepts %s on its own, and passes it through untouched",
    async (campo) => {
      expect(await pasa({ [campo]: true })).toEqual({ [campo]: true });
      expect(await pasa({ [campo]: false })).toEqual({ [campo]: false });
    },
  );

  it("control: a property it does not declare is a 400", async () => {
    await expect(pasa({ unCampoQueNoExiste: true })).rejects.toThrow(
      BadRequestException,
    );
  });
});
