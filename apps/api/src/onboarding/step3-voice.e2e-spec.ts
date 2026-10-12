import request from "supertest";
import { JwtService } from "@nestjs/jwt";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { createE2EApp, closeE2EApp, type E2EHarness } from "../test/e2e-app";

/**
 * `POST /api/onboarding/step3` · the voice field's contract, over the wire.
 *
 * ── Why this is an HTTP spec and not a unit test ───────────────────────────
 *
 * The question is what the DTO accepts and rejects, and a service-level test
 * cannot answer it: it hands the service an object that never passed through
 * `ValidationPipe`, so it tests TypeScript's opinion of the body rather than
 * the server's. Calling the service with `{ voicePreference: 123 }` proves
 * nothing about whether a client can send that. This boots the real app with
 * the real global pipe, exactly as `main.ts` wires it, and asks over HTTP.
 *
 * `null` is the case that justifies the whole file. `@IsOptional()` in
 * class-validator skips validation for `undefined` AND for `null`, so a body
 * carrying an explicit `null` is accepted even though `null` is not in
 * `@IsIn([...])`. That is intentional — null means "not answered", same as
 * absent — but it is a property of a library's semantics, not of anything
 * written in this repository, so it is asserted rather than assumed. The
 * companion spec (`onboarding.service.spec.ts`) then shows the service treats
 * that accepted null as absence and writes nothing.
 *
 * The persistence half lives here too, read from the `$transaction` array the
 * service actually submits: which operations were enqueued is the only
 * evidence that "absent ⇒ no write" rather than "absent ⇒ write a default".
 */

const USER_ID = "user-step3-voice";
const EMAIL = "step3@example.com";

describe("POST /api/onboarding/step3 · contrato del campo de voz", () => {
  let h: E2EHarness;
  let token: string;

  beforeAll(async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    h = await createE2EApp();
    const jwt = h.app.get(JwtService);
    token = jwt.sign({ sub: USER_ID, email: EMAIL, ar: 0 });
  }, 30_000);

  afterAll(async () => {
    await closeE2EApp(h);
  });

  /** Captures the operations the service enqueues in its transaction. */
  let enqueued: unknown[] = [];

  beforeEach(async () => {
    await h.resetMocks();
    enqueued = [];

    // JwtStrategy.validate re-reads the user on every request (ADR 0015).
    h.prisma.user.findUnique.mockResolvedValue({
      id: USER_ID,
      email: EMAIL,
      name: "Step3 User",
      role: "USER",
      plan: "FREE",
      isActive: true,
      authRevision: 0,
    });

    // The step is only writable before the flow closes.
    h.prisma.onboardingState.findUnique.mockResolvedValue({
      userId: USER_ID,
      completedAt: null,
      skippedAt: null,
    });

    // Each Prisma call returns a tagged description instead of a row, so the
    // transaction array says WHICH operations were enqueued. The service
    // builds that array before awaiting, which is what makes this readable.
    const tag = (op: string) => (args: unknown) => ({ op, args });
    h.prisma.onboardingState.upsert.mockImplementation(
      tag("onboardingState.upsert"),
    );
    h.prisma.user.update.mockImplementation(tag("user.update"));
    h.prisma.userPreferences.upsert.mockImplementation(
      tag("userPreferences.upsert"),
    );
    // The array form: the service builds its operation list, then awaits it.
    h.prisma.$transaction.mockImplementation(async (arg: unknown) => {
      enqueued = Array.isArray(arg) ? arg : [arg];
      return enqueued;
    });
  });

  const post = (body: unknown) =>
    request(h.app.getHttpServer())
      .post("/api/onboarding/step3")
      .set("Authorization", `Bearer ${token}`)
      .send(body as object);

  /** Which models the submitted transaction touched. */
  const opsTouched = () =>
    enqueued.map((o) => (o as { op?: string })?.op ?? "(untagged)");

  /** The voice value the enqueued preference write carried, if any. */
  const preferenceWrite = () =>
    enqueued.find(
      (o) => (o as { op?: string })?.op === "userPreferences.upsert",
    );

  // ── accepted by the effective validation ─────────────────────────────────

  for (const value of ["marina", "tomas", "none"] as const) {
    it(`acepta «${value}» y lo persiste en las preferencias`, async () => {
      const res = await post({ firstName: "Lucía", voicePreference: value });

      expect(res.status).toBeLessThan(300);
      expect(opsTouched()).toContain("userPreferences.upsert");
      expect(preferenceWrite()).toMatchObject({
        args: {
          create: { userId: USER_ID, voicePreference: value },
          update: { voicePreference: value },
        },
      });
      // The audit row keeps the original pick.
      expect(h.prisma.onboardingState.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({ initialVoicePreference: value }),
        }),
      );
    });
  }

  it("omitido: acepta, guarda el nombre y NO toca las preferencias", async () => {
    const res = await post({ firstName: "Lucía" });

    expect(res.status).toBeLessThan(300);
    // The name still lands — the step is not a no-op.
    expect(opsTouched()).toContain("user.update");
    expect(opsTouched()).toContain("onboardingState.upsert");
    // …and the preference row is not touched at all. Not "written with a
    // default": not enqueued.
    expect(opsTouched()).not.toContain("userPreferences.upsert");
    expect(h.prisma.userPreferences.upsert).not.toHaveBeenCalled();
    expect(h.prisma.userPreferences.update).not.toHaveBeenCalled();
    expect(h.prisma.userPreferences.create).not.toHaveBeenCalled();
    // Nor is an audit value invented for it.
    expect(h.prisma.onboardingState.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.not.objectContaining({
          initialVoicePreference: expect.anything(),
        }),
        update: expect.not.objectContaining({
          initialVoicePreference: expect.anything(),
        }),
      }),
    );
  });

  it("omitido con una preferencia previa: la deja intacta", async () => {
    // The person chose «tomas» in their profile at some earlier point. Step 3
    // no longer asks, so re-running it must not overwrite that answer. The
    // evidence is the same as above — no write is enqueued — read against a
    // starting state where a value exists to destroy.
    h.prisma.userPreferences.findUnique.mockResolvedValue({
      userId: USER_ID,
      voicePreference: "tomas",
    });

    const res = await post({ firstName: "Lucía" });

    expect(res.status).toBeLessThan(300);
    expect(opsTouched()).not.toContain("userPreferences.upsert");
    expect(h.prisma.userPreferences.upsert).not.toHaveBeenCalled();
  });

  it("null: la validación efectiva lo acepta, y cuenta como ausencia", async () => {
    // Asserted, not assumed: `@IsOptional()` skips null as well as undefined.
    // If a future class-validator changed that, this fails and the comment in
    // the DTO stops being true — which is the point of pinning it.
    const res = await post({ firstName: "Lucía", voicePreference: null });

    expect(res.status).toBeLessThan(300);
    expect(opsTouched()).not.toContain("userPreferences.upsert");
    expect(h.prisma.userPreferences.upsert).not.toHaveBeenCalled();
  });

  // ── rejected by the effective validation ─────────────────────────────────

  const rejected: Array<[string, unknown]> = [
    ["una cadena que no está en la lista", "lucia"],
    ["cadena vacía", ""],
    ["sólo espacios", "   "],
    ["mayúsculas", "Marina"],
    ["un número", 7],
    ["un booleano", true],
    ["un objeto", { id: "marina" }],
    ["un array", ["marina"]],
  ];

  for (const [name, value] of rejected) {
    it(`rechaza ${name} con 400 y sin escribir nada`, async () => {
      const res = await post({ firstName: "Lucía", voicePreference: value });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe("VALIDATION_ERROR");
      // Rejected for THIS field. Without this the test would also pass if the
      // body were refused over `firstName`, which would make it vacuous: a
      // 400 is only evidence about the voice contract if the voice is why.
      expect(JSON.stringify(res.body.details ?? res.body.message)).toMatch(
        /voicePreference/,
      );
      // A rejected body leaves no trace: the pipe runs before the handler.
      expect(h.prisma.$transaction).not.toHaveBeenCalled();
      expect(h.prisma.userPreferences.upsert).not.toHaveBeenCalled();
      expect(h.prisma.user.update).not.toHaveBeenCalled();
    });
  }

  it("el nombre sigue siendo obligatorio: un cuerpo sólo con voz es 400", async () => {
    // Making one field optional must not have loosened the other.
    const res = await post({ voicePreference: "marina" });
    expect(res.status).toBe(400);
    expect(h.prisma.$transaction).not.toHaveBeenCalled();
  });
});
