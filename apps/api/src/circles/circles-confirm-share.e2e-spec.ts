import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import { ValidationPipe } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CircleShareConfirmation } from "@psico/types";
import { CIRCLE_SHARE_LIMITS } from "@psico/types";
import {
  CirclesGuestParticipationController,
  CirclesMemberParticipationController,
} from "./circles-participation.controller";
import { CirclesParticipationFacade } from "./circles-participation.facade";
import { JwtAuthGuard } from "../auth";
import { CirclesGuestGuard } from "./circles-guest.guard";
import { CirclesRolloutGuard } from "./circles-rollout.guard";
import { HttpExceptionFilter } from "../shared";

/**
 * The `confirm-share` HTTP boundary, through a real Nest application.
 *
 * ── Why this cannot be a service test ──────────────────────────────────────
 *
 * The defect this file exists for was invisible below HTTP. The handler
 * declared its body as a TypeScript union, which is erased: Nest saw the
 * metatype `Object`, `ValidationPipe` skipped the body ENTIRELY, and every
 * rule the three DTO classes declared was inert. Calling the service directly
 * with a well-formed object proves nothing about that — the service was never
 * the layer that was broken.
 *
 * So the app is assembled the way `main.ts` assembles it: the same global
 * `ValidationPipe` with the same options, the same exception filter, the real
 * controllers. Only the guards and the domain are replaced, because the
 * question here is "what does the boundary accept", not "what does the domain
 * do with it". The facade records what it received, so a body that is accepted
 * can be inspected — an accepted body that silently became something else is
 * the failure mode that started all this.
 */

/** The last confirmation the boundary let through, for inspection. */
let received: CircleShareConfirmation | null = null;

class RecordingFacade {
  confirmShare(
    _actor: unknown,
    _activityId: string,
    confirmation: CircleShareConfirmation,
  ) {
    received = confirmation;
    return Promise.resolve({ revealed: false, replayed: false });
  }
  read() {
    return Promise.resolve({});
  }
  createDuo() {
    return Promise.resolve({ circleId: "c", activityId: "a" });
  }
  withdraw() {
    return Promise.resolve({ outcome: "CLOSED", replayed: false });
  }
  proposeArtifact() {
    return Promise.resolve({ artifactId: "x", version: 1 });
  }
  confirmArtifact() {
    return Promise.resolve({ agreed: false, replayed: false });
  }
  recordFollowUp() {
    return Promise.resolve({ closed: false, replayed: false });
  }
}

/** A guard that always admits, and attaches the actor the decorator reads. */
const ADMIT_MEMBER = {
  canActivate: (ctx: { switchToHttp: () => { getRequest: () => Request } }) => {
    const req = ctx.switchToHttp().getRequest() as unknown as {
      circleActor?: unknown;
      user?: unknown;
    };
    req.circleActor = { kind: "USER", userId: "user-1" };
    req.user = { id: "user-1" };
    return true;
  },
};

const ADMIT_GUEST = {
  canActivate: (ctx: { switchToHttp: () => { getRequest: () => Request } }) => {
    const req = ctx.switchToHttp().getRequest() as unknown as {
      circleActor?: unknown;
    };
    req.circleActor = {
      kind: "GUEST",
      guestSessionId: "gs-1",
      activityId: "act-1",
      participantId: "seat-1",
    };
    return true;
  },
};

const KEY = "8f14e45f-ceea-4e78-a1a2-7d3e1b6b0f00";
const ROUTE = "/api/circles/activities/act-1/share-confirmations";
const GUEST_ROUTE = "/api/circles/guest/activities/act-1/share-confirmations";

describe("circles · the confirm-share boundary (real Nest pipeline)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [
        CirclesMemberParticipationController,
        CirclesGuestParticipationController,
      ],
      providers: [
        { provide: CirclesParticipationFacade, useClass: RecordingFacade },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(ADMIT_MEMBER)
      .overrideGuard(CirclesRolloutGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(CirclesGuestGuard)
      .useValue(ADMIT_GUEST)
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api");
    // Byte-for-byte the options `main.ts` uses. A boundary test configured
    // more strictly than production would pass while production stayed open.
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
  }, 30_000);

  afterAll(async () => {
    await app?.close();
  }, 30_000);

  const post = (body: unknown, route = ROUTE) =>
    request(app.getHttpServer())
      .post(route)
      .set("idempotency-key", KEY)
      .send(body as object);

  // ── The three valid shapes still work ────────────────────────────────────

  it("accepts each of the three modes, and only their declared fields", async () => {
    received = null;
    await post({
      mode: "SELECTED_FIELDS",
      fields: [{ fieldKey: "campo-a", value: "algo" }],
    }).expect(201);
    expect(received).toEqual({
      mode: "SELECTED_FIELDS",
      fields: [{ fieldKey: "campo-a", value: "algo" }],
    });

    received = null;
    await post({ mode: "EDITED_SUMMARY", summary: "un resumen" }).expect(201);
    expect(received).toEqual({ mode: "EDITED_SUMMARY", summary: "un resumen" });

    received = null;
    await post({ mode: "KEEP_PRIVATE" }).expect(201);
    expect(received).toEqual({ mode: "KEEP_PRIVATE" });
  });

  // ── The mode is closed ───────────────────────────────────────────────────

  it("refuses an unknown mode instead of recording it as KEEP_PRIVATE", async () => {
    // The regression that motivated the whole repair. The narrowing helper
    // ended with `return { mode: "KEEP_PRIVATE" }`, so every one of these was
    // a 201 that stored "I choose not to share" on somebody's behalf.
    for (const mode of [
      "SHARE_EVERYTHING",
      "keep_private",
      "WITHDRAW",
      "",
      null,
      42,
      { nested: true },
      ["SELECTED_FIELDS"],
    ]) {
      received = null;
      const res = await post({ mode });
      expect(res.status, `mode=${JSON.stringify(mode)}`).toBe(400);
      expect(res.body.code).toBe("CIRCLE_INVALID_PAYLOAD");
      expect(received, "nothing reached the domain").toBeNull();
    }
  });

  it("refuses a body with no mode at all", async () => {
    for (const body of [{}, { fields: [] }, { summary: "algo" }, []]) {
      received = null;
      const res = await post(body);
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect(received).toBeNull();
    }
  });

  it("refuses a JSON scalar where an object belongs", async () => {
    // Sent as raw JSON: supertest cannot `.send()` a bare scalar, and these
    // are exactly the payloads a hand-rolled client produces by accident.
    for (const raw of ['"KEEP_PRIVATE"', "7", "null", "true"]) {
      received = null;
      const res = await request(app.getHttpServer())
        .post(ROUTE)
        .set("idempotency-key", KEY)
        .type("json")
        .send(raw);
      expect(res.status, raw).toBe(400);
      expect(received, raw).toBeNull();
    }
  });

  // ── Extra keys, including the ones that would be authority ───────────────

  it("refuses any key the variant does not declare", async () => {
    const extras: Record<string, unknown>[] = [
      { mode: "KEEP_PRIVATE", reason: "no me sentí cómodo" },
      { mode: "KEEP_PRIVATE", privateDraft: "lo que iba a decir" },
      { mode: "KEEP_PRIVATE", fields: [{ fieldKey: "a", value: "b" }] },
      { mode: "KEEP_PRIVATE", summary: "algo" },
      { mode: "EDITED_SUMMARY", summary: "ok", privateDraft: "borrador" },
      { mode: "EDITED_SUMMARY", summary: "ok", fields: [] },
      { mode: "EDITED_SUMMARY", summary: "ok", userId: "otro-usuario" },
      { mode: "EDITED_SUMMARY", summary: "ok", participantId: "otro-asiento" },
      { mode: "EDITED_SUMMARY", summary: "ok", circleId: "otro-circulo" },
      { mode: "EDITED_SUMMARY", summary: "ok", memberId: "otro-miembro" },
      { mode: "EDITED_SUMMARY", summary: "ok", contentUnitId: "cu-1" },
      {
        mode: "SELECTED_FIELDS",
        fields: [{ fieldKey: "a", value: "b" }],
        summary: "no va aquí",
      },
      {
        mode: "SELECTED_FIELDS",
        fields: [{ fieldKey: "a", value: "b", privateDraft: "x" }],
      },
    ];
    for (const body of extras) {
      received = null;
      const res = await post(body);
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect(res.body.code).toBe("CIRCLE_INVALID_PAYLOAD");
      expect(received, JSON.stringify(body)).toBeNull();
    }
  });

  // ── Values: empty, duplicated, out of bounds ─────────────────────────────

  it("refuses empty, oversized and malformed values", async () => {
    const tooLongSummary = "x".repeat(CIRCLE_SHARE_LIMITS.maxSummaryLength + 1);
    const tooManyFields = Array.from(
      { length: CIRCLE_SHARE_LIMITS.maxFields + 1 },
      (_, i) => ({ fieldKey: `k${i}`, value: "v" }),
    );
    const bodies: unknown[] = [
      { mode: "EDITED_SUMMARY" },
      { mode: "EDITED_SUMMARY", summary: "" },
      { mode: "EDITED_SUMMARY", summary: tooLongSummary },
      { mode: "EDITED_SUMMARY", summary: 42 },
      { mode: "SELECTED_FIELDS" },
      { mode: "SELECTED_FIELDS", fields: [] },
      { mode: "SELECTED_FIELDS", fields: tooManyFields },
      { mode: "SELECTED_FIELDS", fields: [{ fieldKey: "", value: "v" }] },
      { mode: "SELECTED_FIELDS", fields: [{ fieldKey: "k", value: "" }] },
      { mode: "SELECTED_FIELDS", fields: [{ fieldKey: "k" }] },
      { mode: "SELECTED_FIELDS", fields: [{ value: "v" }] },
      { mode: "SELECTED_FIELDS", fields: ["k"] },
      {
        mode: "SELECTED_FIELDS",
        fields: [
          {
            fieldKey: "k",
            value: "x".repeat(CIRCLE_SHARE_LIMITS.maxFieldLength + 1),
          },
        ],
      },
    ];
    for (const body of bodies) {
      received = null;
      const res = await post(body);
      expect(res.status, JSON.stringify(body).slice(0, 80)).toBe(400);
      expect(received).toBeNull();
    }
  });

  // ── The guest surface is the same boundary ───────────────────────────────

  it("applies the identical boundary on the guest route", async () => {
    received = null;
    await post({ mode: "GUEST_SPECIAL" }, GUEST_ROUTE).expect(400);
    expect(received).toBeNull();

    await post(
      { mode: "KEEP_PRIVATE", reason: "porque sí" },
      GUEST_ROUTE,
    ).expect(400);
    expect(received).toBeNull();

    await post({ mode: "KEEP_PRIVATE" }, GUEST_ROUTE).expect(201);
    expect(received).toEqual({ mode: "KEEP_PRIVATE" });
  });

  // ── The idempotency header is still required, and still canonical ────────

  it("still requires a canonical idempotency key", async () => {
    const res = await request(app.getHttpServer())
      .post(ROUTE)
      .send({ mode: "KEEP_PRIVATE" });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("CIRCLE_INVALID_PAYLOAD");
  });
});
