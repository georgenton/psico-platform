import { beforeEach, describe, expect, it, vi } from "vitest";
import { guideApi } from "./guide";
import { apiClient } from "./client";

/**
 * CC-7.4D — the Guide client is a thin, honest transport.
 *
 * These tests pin the three things a caller depends on and that a refactor
 * could silently break: the exact METHOD, the exact PATH (with the ids URL
 * encoded) and the exact BODY. They also pin what must NEVER travel: a
 * `userId`, editorial context, a duplicated target in the body, or the
 * catalog's correct option.
 */

describe("guideApi", () => {
  let post: ReturnType<typeof vi.spyOn>;

  const KEY = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

  beforeEach(() => {
    post = vi
      .spyOn(apiClient, "post")
      .mockResolvedValue(undefined as never) as ReturnType<typeof vi.spyOn>;
  });

  it("createGuideSession posts the exact start body", async () => {
    await guideApi.createGuideSession({
      idempotencyKey: KEY,
      guideKey: "eec-c1-cuerpo-antes-que-mente",
      guideVersion: 1,
    });
    expect(post).toHaveBeenCalledWith("/guide/sessions", {
      idempotencyKey: KEY,
      guideKey: "eec-c1-cuerpo-antes-que-mente",
      guideVersion: 1,
    });
  });

  it("completeGuideSessionStep puts the ids in the PATH, not the body", async () => {
    await guideApi.completeGuideSessionStep("ses-1", "paso-1", {
      idempotencyKey: KEY,
    });
    expect(post).toHaveBeenCalledWith(
      "/guide/sessions/ses-1/steps/paso-1/complete",
      { idempotencyKey: KEY },
    );
  });

  it("submitGuideStepRecall sends only the chosen option", async () => {
    await guideApi.submitGuideStepRecall("ses-1", "paso-3", {
      idempotencyKey: KEY,
      selectedOptionKey: "opcion-cuerpo-primero",
    });
    expect(post).toHaveBeenCalledWith(
      "/guide/sessions/ses-1/steps/paso-3/recall",
      { idempotencyKey: KEY, selectedOptionKey: "opcion-cuerpo-primero" },
    );
    // No result, no evaluationSource, no itemKey, no correct answer.
    const body = post.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual([
      "idempotencyKey",
      "selectedOptionKey",
    ]);
  });

  it("cancel and complete post the idempotent body to their own paths", async () => {
    await guideApi.cancelGuideSession("ses-1", { idempotencyKey: KEY });
    expect(post).toHaveBeenCalledWith("/guide/sessions/ses-1/cancel", {
      idempotencyKey: KEY,
    });

    await guideApi.completeGuideSession("ses-1", { idempotencyKey: KEY });
    expect(post).toHaveBeenCalledWith("/guide/sessions/ses-1/complete", {
      idempotencyKey: KEY,
    });
  });

  it("URL-encodes session ids and step keys", async () => {
    await guideApi.completeGuideSessionStep("a/b", "c d", {
      idempotencyKey: KEY,
    });
    expect(post).toHaveBeenCalledWith(
      "/guide/sessions/a%2Fb/steps/c%20d/complete",
      { idempotencyKey: KEY },
    );
  });

  it("never sends a userId or editorial context", async () => {
    await guideApi.createGuideSession({
      idempotencyKey: KEY,
      guideKey: "eec-c1-cuerpo-antes-que-mente",
      guideVersion: 1,
    });
    const body = post.mock.calls[0]?.[1] as Record<string, unknown>;
    for (const forbidden of [
      "userId",
      "editionKey",
      "unitKey",
      "context",
      "correctOptionKey",
      "result",
      "evaluationSource",
    ]) {
      expect(body).not.toHaveProperty(forbidden);
    }
  });
});
