import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  GUIDE_CARD_STATES_ANSWER_INVALID,
  GUIDE_CARD_STATES_MAX_PINS,
  GUIDE_CARD_STATES_MAX_VERSION,
  GUIDE_CARD_STATES_PARAMS_INVALID,
  GUIDE_RECOVERY_PARAMS_INVALID,
  guideApi,
} from "./guide";
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
  let get: ReturnType<typeof vi.spyOn>;

  const KEY = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

  beforeEach(() => {
    post = vi
      .spyOn(apiClient, "post")
      .mockResolvedValue(undefined as never) as ReturnType<typeof vi.spyOn>;
    get = vi
      .spyOn(apiClient, "get")
      .mockResolvedValue({ available: true } as never) as ReturnType<
      typeof vi.spyOn
    >;
  });

  it("getGuideAvailability GETs the opaque boolean and sends no body", async () => {
    const result = await guideApi.getGuideAvailability();
    expect(get).toHaveBeenCalledWith("/guide/availability");
    // A GET with a single path arg — nothing about the mode or allowlist leaks
    // outward, and no body is posted.
    expect(get.mock.calls[0]).toEqual(["/guide/availability"]);
    expect(result).toEqual({ available: true });
    expect(post).not.toHaveBeenCalled();
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

  // ── GR-4 · contextual discovery ──────────────────────────────────────────
  describe("getGuideDiscovery", () => {
    it("normalizes a canonical slug before it reaches the wire", async () => {
      await guideApi.getGuideDiscovery(" Parejas-Que-Perduran ", 2);
      expect(get).toHaveBeenCalledWith(
        "/guide/discovery/parejas-que-perduran/2",
      );
      expect(post).not.toHaveBeenCalled();
    });

    it("sends the Emociones context untouched when already canonical", async () => {
      await guideApi.getGuideDiscovery("emociones-en-construccion", 1);
      expect(get).toHaveBeenCalledWith(
        "/guide/discovery/emociones-en-construccion/1",
      );
    });

    it.each([
      ["a slug with spaces", "con espacios", 1],
      ["a trailing hyphen", "trailing-", 1],
      ["a leading hyphen", "-leading", 1],
      ["a double hyphen", "doble--guion", 1],
      ["underscores", "libro_raro", 1],
      ["an empty slug", "   ", 1],
      ["a non-string slug", 42 as unknown as string, 1],
      ["order zero", "un-libro", 0],
      ["a negative order", "un-libro", -1],
      ["a fractional order", "un-libro", 1.5],
      ["a NaN order", "un-libro", Number.NaN],
    ])(
      "rejects %s locally and issues NO request",
      async (_why, slug, order) => {
        await expect(guideApi.getGuideDiscovery(slug, order)).rejects.toThrow(
          "GUIDE_DISCOVERY_PARAMS_INVALID",
        );
        // INVALID_DISCOVERY_INPUT_NETWORK_REQUESTS=0 — the point of validating
        // locally is that the network never sees it.
        expect(get).not.toHaveBeenCalled();
        expect(post).not.toHaveBeenCalled();
      },
    );

    it("does not echo the rejected value in the error", async () => {
      await expect(
        guideApi.getGuideDiscovery("con espacios", 1),
      ).rejects.toThrow(/^GUIDE_DISCOVERY_PARAMS_INVALID$/);
    });
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

  describe("getRecoverableSession", () => {
    it("GETs the pin as query parameters and posts nothing", async () => {
      await guideApi.getRecoverableSession({
        guideKey: "eec-c1-cuerpo-antes-que-mente",
        guideVersion: 1,
      });
      expect(get).toHaveBeenCalledWith(
        "/guide/sessions/recoverable?guideKey=eec-c1-cuerpo-antes-que-mente&guideVersion=1",
      );
      // A read. Resuming must never be able to create the thing it resumes.
      expect(post).not.toHaveBeenCalled();
    });

    it.each([
      ["", 1],
      ["UPPER", 1],
      ["has spaces", 1],
      ["ok-key", 0],
      ["ok-key", -1],
      ["ok-key", 1.5],
      ["ok-key", Number.NaN],
    ])("rejects (%s, %s) locally, without a request", async (key, version) => {
      await expect(
        guideApi.getRecoverableSession({
          guideKey: key as string,
          guideVersion: version as number,
        }),
      ).rejects.toThrow(GUIDE_RECOVERY_PARAMS_INVALID);
      // A malformed pin would come back as `recoverable: false`, which reads
      // exactly like "nothing to resume". Those are different facts, so the
      // request is never made.
      expect(get).not.toHaveBeenCalled();
    });

    it("the local rejection never echoes the pin it rejected", async () => {
      const secretish = "Not A Key";
      await guideApi
        .getRecoverableSession({ guideKey: secretish, guideVersion: 1 })
        .catch((err: Error) => {
          expect(err.message).toBe(GUIDE_RECOVERY_PARAMS_INVALID);
          expect(err.message).not.toContain(secretish);
        });
    });
  });

  /**
   * C.1 — the card-state batch, which is the only client method that may split
   * one call into several requests. Everything here is about the seam that
   * creates: order, repetition, and what happens when one request fails.
   */
  describe("getExperienceCardStates", () => {
    const pin = (n: number) => ({ guideKey: `guia-${n}`, guideVersion: 1 });
    /**
     * C.3R — where the reader is. Sent with EVERY chunk: a verdict is only
     * meaningful about a stated context, and a chunk that omitted it would be
     * answered about nothing in particular.
     */
    const READER = {
      bookSlug: "emociones-en-construccion",
      chapterOrder: 1,
      unitKey: "unidad-de-prueba-1",
    };
    /** The same context, spread into the malformed variants below. */
    const READERBASE = { ...READER };

    /**
     * A complete, valid verdict — the base every negative below mutates.
     *
     * Written as a builder on purpose: when the closed shape gained
     * `applicability` and `evaluatedPin`, hand-written items would have
     * started failing for "a field is missing" and every one of these tests
     * would have gone green for the wrong reason.
     */
    const state = (over: Record<string, unknown> = {}) => {
      const base = {
        guidePin: pin(1),
        status: "START",
        resumePin: pin(1),
        applicability: "APPLIES",
        evaluatedPin: pin(1),
      };
      const merged: Record<string, unknown> = { ...base, ...over };
      // `resumePin` and `evaluatedPin` describe the same pin; a test that
      // moves one moves both unless it says otherwise.
      if ("resumePin" in over && !("evaluatedPin" in over)) {
        merged.evaluatedPin = over.resumePin;
      }
      return merged;
    };

    /** Answer each chunk with a verdict per pin, echoing what it was asked. */
    const echoServer = () =>
      post.mockImplementation((_path: unknown, body: unknown) => {
        const pins = (
          body as { pins: { guideKey: string; guideVersion: number }[] }
        ).pins;
        return Promise.resolve({
          items: pins.map((p) => ({
            guidePin: p,
            status: "START",
            resumePin: p,
            applicability: "APPLIES",
            evaluatedPin: p,
          })),
        }) as never;
      });

    it("sends ONE request for a chapter that fits in one batch", async () => {
      echoServer();
      const pins = [pin(1), pin(2), pin(3)];

      const answer = await guideApi.getExperienceCardStates(pins, READER);

      expect(post).toHaveBeenCalledTimes(1);
      // The context travels WITH the pins: a verdict is about a stated place.
      expect(post).toHaveBeenCalledWith("/guide/experiences/state", {
        pins,
        reader: READER,
      });
      expect(answer.items.map((i) => i.guidePin)).toEqual(pins);
    });

    it("splits a longer chapter into ceil(n / 25) requests", async () => {
      echoServer();
      const pins = Array.from({ length: 63 }, (_, i) => pin(i));

      const answer = await guideApi.getExperienceCardStates(pins, READER);

      expect(post).toHaveBeenCalledTimes(
        Math.ceil(63 / GUIDE_CARD_STATES_MAX_PINS),
      );
      // No chunk exceeds what the server accepts...
      for (const [, body] of post.mock.calls) {
        expect((body as { pins: unknown[] }).pins.length).toBeLessThanOrEqual(
          GUIDE_CARD_STATES_MAX_PINS,
        );
      }
      // ...and the GLOBAL order survives the split, position for position.
      expect(answer.items.map((i) => i.guidePin)).toEqual(pins);
    });

    it("keeps a repeated pin repeated, even across a chunk boundary", async () => {
      echoServer();
      const shared = { guideKey: "compartida", guideVersion: 1 };
      const pins = [
        ...Array.from({ length: GUIDE_CARD_STATES_MAX_PINS - 1 }, (_, i) =>
          pin(i),
        ),
        shared, // last of chunk 1
        shared, // first of chunk 2
      ];

      const answer = await guideApi.getExperienceCardStates(pins, READER);

      expect(post).toHaveBeenCalledTimes(2);
      expect(answer.items).toHaveLength(pins.length);
      expect(answer.items.at(-1)!.guidePin).toEqual(shared);
      expect(answer.items.at(-2)!.guidePin).toEqual(shared);
    });

    it("one failed chunk fails the whole call — never a half answer", async () => {
      let call = 0;
      post.mockImplementation((_path: unknown, body: unknown) => {
        call += 1;
        if (call === 2) return Promise.reject(new Error("boom")) as never;
        const pins = (body as { pins: unknown[] }).pins;
        return Promise.resolve({
          items: pins.map((p) => state({ guidePin: p, resumePin: p })),
        }) as never;
      });

      await expect(
        guideApi.getExperienceCardStates(
          Array.from({ length: 30 }, (_, i) => pin(i)),
          READER,
        ),
      ).rejects.toThrow("boom");
    });

    it("refuses an answer that cannot be aligned to the questions", async () => {
      // A server returning fewer verdicts than pins would shift every card by
      // one. Truncating or padding would be a guess; this is not.
      post.mockResolvedValue({ items: [] } as never);

      await expect(
        guideApi.getExperienceCardStates([pin(1), pin(2)], READER),
      ).rejects.toThrow(GUIDE_CARD_STATES_ANSWER_INVALID);
    });

    it("refuses an answer of the RIGHT length whose pins are wrong", async () => {
      // The dangerous one: it lines up perfectly and describes the wrong
      // journeys. A card would show a verdict earned somewhere else.
      post.mockResolvedValue({
        items: [
          state({ guidePin: pin(1), resumePin: pin(1) }),
          state({ guidePin: pin(9), status: "COMPLETED", resumePin: pin(9) }),
        ],
      } as never);

      await expect(
        guideApi.getExperienceCardStates([pin(1), pin(2)], READER),
      ).rejects.toThrow(GUIDE_CARD_STATES_ANSWER_INVALID);
    });

    it("refuses an answer whose pins are RIGHT but in the wrong order", async () => {
      post.mockResolvedValue({
        items: [
          state({ guidePin: pin(2), resumePin: pin(2) }),
          state({ guidePin: pin(1), status: "COMPLETED", resumePin: pin(1) }),
        ],
      } as never);

      await expect(
        guideApi.getExperienceCardStates([pin(1), pin(2)], READER),
      ).rejects.toThrow(GUIDE_CARD_STATES_ANSWER_INVALID);
    });

    it("a rolling deploy answering 404 fails the batch, not one card", async () => {
      // An older API that has never heard of this route. The reader must not
      // be offered a fresh start over a journey it cannot ask about.
      post.mockRejectedValue(
        Object.assign(new Error("Not Found"), { statusCode: 404 }),
      );

      await expect(
        guideApi.getExperienceCardStates([pin(1), pin(2)], READER),
      ).rejects.toThrow(/Not Found/);
    });

    /**
     * The generic on `apiClient.post` is a promise about a server this process
     * does not run. These are the shapes that satisfy TypeScript and would
     * still put a wrong verdict — or a foreign lineage — on a card.
     */
    describe("the answer is checked, not assumed", () => {
      const answered = (items: unknown) =>
        post.mockResolvedValue({ items } as never);

      const refuses = async (pins = [pin(1)]) =>
        expect(guideApi.getExperienceCardStates(pins, READER)).rejects.toThrow(
          GUIDE_CARD_STATES_ANSWER_INVALID,
        );

      it("refuses an envelope that is not an object with exactly `items`", async () => {
        post.mockResolvedValue(null as never);
        await refuses();
        post.mockResolvedValue([{ guidePin: pin(1) }] as never);
        await refuses();
        post.mockResolvedValue({
          items: [state()],
          total: 1,
        } as never);
        await refuses();
        post.mockResolvedValue({ data: [] } as never);
        await refuses();
      });

      it("refuses an item with an extra property", async () => {
        // OpenAPI declares the response closed; a client that shrugged at an
        // extra field would let the two contracts drift apart in silence.
        answered([state({ session: { sessionId: "ses_1" } })]);
        await refuses();
      });

      it("refuses an unknown status", async () => {
        answered([state({ status: "PAUSED" })]);
        await refuses();
        answered([state({ status: "start" })]);
        await refuses();
        answered([state({ status: null })]);
        await refuses();
      });

      it("refuses a missing or malformed resumePin", async () => {
        const { resumePin: _dropped, ...withoutResume } = state();
        answered([withoutResume]);
        await refuses();
        answered([state({ resumePin: null })]);
        await refuses();
        answered([state({ resumePin: { guideKey: "g-1" } })]);
        await refuses();
        answered([
          state({ resumePin: { guideKey: "guia-1", guideVersion: 0 } }),
        ]);
        await refuses();
        answered([
          state({ resumePin: { guideKey: "GUIA-1", guideVersion: 1 } }),
        ]);
        await refuses();
      });

      it("refuses CONTINUE that resumes ANOTHER lineage", async () => {
        // Another version of the same journey is the point of rule 1; another
        // journey entirely is somebody else's session.
        answered([
          state({
            status: "CONTINUE",
            resumePin: { guideKey: "guia-9", guideVersion: 1 },
          }),
        ]);
        await refuses();
      });

      it("refuses START or COMPLETED that resumes another VERSION", async () => {
        // Both are statements about the published pin. Resuming a different
        // version would be a fresh run wearing a finished journey's clothes.
        for (const status of ["START", "COMPLETED"]) {
          answered([
            state({
              guidePin: { guideKey: "guia-1", guideVersion: 2 },
              status,
              resumePin: { guideKey: "guia-1", guideVersion: 1 },
            }),
          ]);
          await expect(
            guideApi.getExperienceCardStates(
              [{ guideKey: "guia-1", guideVersion: 2 }],
              READER,
            ),
          ).rejects.toThrow(GUIDE_CARD_STATES_ANSWER_INVALID);
        }
      });

      it("ACCEPTS CONTINUE on an older version of the same lineage", async () => {
        const published = { guideKey: "guia-1", guideVersion: 2 };
        const resume = { guideKey: "guia-1", guideVersion: 1 };
        answered([
          state({ guidePin: published, status: "CONTINUE", resumePin: resume }),
        ]);

        const answer = await guideApi.getExperienceCardStates(
          [published],
          READER,
        );
        expect(answer.items).toEqual([
          {
            guidePin: published,
            status: "CONTINUE",
            resumePin: resume,
            applicability: "APPLIES",
            // The verdict is about what would RUN, which is the resume pin.
            evaluatedPin: resume,
          },
        ]);
      });

      it("a semantically invalid SECOND chunk publishes nothing from the first", async () => {
        let call = 0;
        post.mockImplementation((_path: unknown, body: unknown) => {
          call += 1;
          const pins = (body as { pins: { guideKey: string }[] }).pins;
          if (call === 2) {
            // Right length, right pins, impossible status.
            return Promise.resolve({
              items: pins.map((p) =>
                state({ guidePin: p, status: "PAUSED", resumePin: p }),
              ),
            }) as never;
          }
          return Promise.resolve({
            items: pins.map((p) => state({ guidePin: p, resumePin: p })),
          }) as never;
        });

        await expect(
          guideApi.getExperienceCardStates(
            Array.from({ length: 30 }, (_, i) => pin(i)),
            READER,
          ),
        ).rejects.toThrow(GUIDE_CARD_STATES_ANSWER_INVALID);
      });

      it("never echoes anything it received", async () => {
        answered([state({ status: "SOSPECHOSO" })]);
        await guideApi
          .getExperienceCardStates([pin(1)], READER)
          .catch((err: Error) => {
            expect(err.message).toBe(GUIDE_CARD_STATES_ANSWER_INVALID);
            expect(`${err.name} ${err.message}`).not.toContain("SOSPECHOSO");
          });
      });
    });

    it.each([25, 26, 51])("asks ceil(n / 25) times for %s cards", async (n) => {
      echoServer();
      const pins = Array.from({ length: n }, (_, i) => pin(i));

      const answer = await guideApi.getExperienceCardStates(pins, READER);

      expect(post).toHaveBeenCalledTimes(Math.ceil(n / 25));
      expect(post.mock.calls.length).toBeLessThan(n);
      expect(answer.items.map((i) => i.guidePin)).toEqual(pins);
    });

    it("a failing SECOND chunk publishes nothing from the first", async () => {
      const seen: unknown[] = [];
      let call = 0;
      post.mockImplementation((_path: unknown, body: unknown) => {
        call += 1;
        seen.push(body);
        if (call === 2) {
          return Promise.reject(new Error("chunk 2 down")) as never;
        }
        const pins = (body as { pins: unknown[] }).pins;
        return Promise.resolve({
          items: pins.map((p) =>
            state({ guidePin: p, status: "COMPLETED", resumePin: p }),
          ),
        }) as never;
      });

      await expect(
        guideApi.getExperienceCardStates(
          Array.from({ length: 51 }, (_, i) => pin(i)),
          READER,
        ),
      ).rejects.toThrow("chunk 2 down");
      // The first chunk's verdicts existed and were thrown away: a partial
      // answer is not a smaller answer, it is a wrong one.
      expect(seen.length).toBeGreaterThanOrEqual(2);
    });

    it.each([
      ["", 1],
      ["UPPER", 1],
      ["has spaces", 1],
      ["ok-key", 0],
      ["ok-key", -1],
      ["ok-key", 1.5],
      ["ok-key", Number.NaN],
      ["ok-key", GUIDE_CARD_STATES_MAX_VERSION + 1],
    ])("rejects (%s, %s) locally, without a request", async (key, version) => {
      await expect(
        guideApi.getExperienceCardStates(
          [
            { guideKey: "valida", guideVersion: 1 },
            { guideKey: key as string, guideVersion: version as number },
          ],
          READER,
        ),
      ).rejects.toThrow(GUIDE_CARD_STATES_PARAMS_INVALID);
      // The whole batch is refused: a request carrying only the valid half
      // would answer some cards and leave the rest guessing.
      expect(post).not.toHaveBeenCalled();
    });

    /**
     * C.3R — the reader context is validated with the same severity as the
     * pins. A malformed context comes back as a stale-context refusal for the
     * WHOLE chapter, so spending a round trip to learn that is strictly worse
     * than saying so here.
     */
    it.each([
      ["a missing context", undefined],
      ["a context that is not an object", "emociones-en-construccion"],
      ["a context that is an array", []],
      ["an extra property", { ...READERBASE, contentUnitId: "cu_1" }],
      ["a missing unitKey", { bookSlug: "libro", chapterOrder: 1 }],
      ["an uppercase slug", { ...READERBASE, bookSlug: "Libro" }],
      ["a slug with spaces", { ...READERBASE, bookSlug: "con espacios" }],
      ["an empty unitKey", { ...READERBASE, unitKey: "" }],
      ["a unitKey with spaces", { ...READERBASE, unitKey: "no válido" }],
      ["order zero", { ...READERBASE, chapterOrder: 0 }],
      ["a negative order", { ...READERBASE, chapterOrder: -1 }],
      ["a fractional order", { ...READERBASE, chapterOrder: 1.5 }],
      ["a NaN order", { ...READERBASE, chapterOrder: Number.NaN }],
      ["an order beyond the cap", { ...READERBASE, chapterOrder: 10_001 }],
      ["a stringly order", { ...READERBASE, chapterOrder: "1" }],
    ])("rejects %s locally, without a request", async (_why, reader) => {
      await expect(
        guideApi.getExperienceCardStates(
          [pin(1)],
          reader as unknown as typeof READER,
        ),
      ).rejects.toThrow(GUIDE_CARD_STATES_PARAMS_INVALID);
      expect(post).not.toHaveBeenCalled();
    });

    it("the rejected context is never echoed", async () => {
      const secretish = "Unidad Secreta";
      await guideApi
        .getExperienceCardStates([pin(1)], {
          ...READER,
          unitKey: secretish,
        })
        .catch((err: Error) => {
          expect(err.message).toBe(GUIDE_CARD_STATES_PARAMS_INVALID);
          expect(`${err.name} ${err.message}`).not.toContain(secretish);
        });
      expect.hasAssertions();
    });

    it("rejects an empty list rather than asking about nothing", async () => {
      await expect(
        guideApi.getExperienceCardStates([], READER),
      ).rejects.toThrow(GUIDE_CARD_STATES_PARAMS_INVALID);
      expect(post).not.toHaveBeenCalled();
    });

    it("the local rejection never echoes the pin it rejected", async () => {
      const secretish = "Not A Key";
      await guideApi
        .getExperienceCardStates(
          [{ guideKey: secretish, guideVersion: 1 }],
          READER,
        )
        .catch((err: Error) => {
          expect(err.message).toBe(GUIDE_CARD_STATES_PARAMS_INVALID);
          expect(err.message).not.toContain(secretish);
        });
    });

    it("a caller mutating its array mid-flight cannot change the request", async () => {
      echoServer();
      const pins = [pin(1), pin(2)];
      const promise = guideApi.getExperienceCardStates(pins, READER);
      pins[0] = { guideKey: "otra", guideVersion: 9 };

      const answer = await promise;
      expect(post.mock.calls[0]![1]).toEqual({
        pins: [
          { guideKey: "guia-1", guideVersion: 1 },
          { guideKey: "guia-2", guideVersion: 1 },
        ],
        reader: READER,
      });
      expect(answer.items[0]!.guidePin).toEqual({
        guideKey: "guia-1",
        guideVersion: 1,
      });
    });

    it("a caller mutating the READER mid-flight cannot change the request", async () => {
      echoServer();
      const reader = { ...READER };
      const promise = guideApi.getExperienceCardStates(
        [pin(1), pin(2)],
        reader,
      );
      reader.chapterOrder = 99;
      reader.unitKey = "otra-unidad";

      await promise;
      // Every chunk states the context it was answered under, and that context
      // is the one that was sent — not whatever the object holds now.
      for (const [, body] of post.mock.calls) {
        expect((body as { reader: unknown }).reader).toEqual(READER);
      }
    });
  });
});
