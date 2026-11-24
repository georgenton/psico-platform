import { beforeEach, describe, expect, it, vi } from "vitest";
import { WeeklyDigestProcessor } from "./weekly-digest.processor";
import { JobName } from "../queue-names";
import type { Job } from "bullmq";

function buildPrisma(
  users: unknown[] = [],
  extraOverrides: Record<string, unknown> = {},
) {
  return {
    user: { findMany: vi.fn().mockResolvedValue(users) },
    diaryEntry: { findMany: vi.fn().mockResolvedValue([]) },
    ecoMessage: { count: vi.fn().mockResolvedValue(0) },
    deviceToken: { deleteMany: vi.fn() },
    // Sprint S45: WeeklySummary lookup. Default null so existing tests
    // exercise the "no narrative" branch; tests opt in by overriding.
    weeklySummary: { findUnique: vi.fn().mockResolvedValue(null) },
    ...extraOverrides,
  } as never;
}

function buildResend() {
  return { send: vi.fn().mockResolvedValue(undefined) } as never;
}

function buildPush(
  receipts: Array<{ status: "ok" | "error"; invalidToken?: string }> = [],
) {
  return {
    sendToTokens: vi.fn().mockResolvedValue(receipts),
  } as never;
}

/**
 * El enlace a Patrones sale de `APP_URL`, como en los demás correos. Por
 * omisión se usa el de staging, que es el entorno en el que el digest se
 * encendería primero.
 */
const STAGING_APP_URL = "https://staging.feelverse.app";

function buildConfig(appUrl: string = STAGING_APP_URL) {
  return {
    get: (key: string) => (key === "APP_URL" ? appUrl : undefined),
  } as never;
}

/**
 * Sprint S53 — Tests pin `nowIso` to Monday 07:00 UTC so the per-user
 * TZ gate fires for users whose `profile.timezone` is null (the gate
 * falls back to UTC for those, and Monday 07:00 UTC matches the digest
 * target). Tests that exercise the gate itself override this.
 */
const LEGACY_MONDAY_07_UTC = "2026-06-08T07:00:00Z";

function jobOf<T extends Record<string, unknown>>(
  data: T,
  opts: { defaultNow?: boolean } = { defaultNow: true },
): Job<T> {
  const merged =
    opts.defaultNow && data.nowIso === undefined
      ? ({ ...data, nowIso: LEGACY_MONDAY_07_UTC } as T)
      : data;
  return { name: JobName.RUN_WEEKLY_DIGEST, data: merged } as Job<T>;
}

describe("WeeklyDigestProcessor", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects unknown job names — defensive against queue misconfiguration", async () => {
    const proc = new WeeklyDigestProcessor(
      buildPrisma(),
      buildResend(),
      buildPush(),
      buildConfig(),
    );
    await expect(
      proc.process({ name: "wrong-name", data: {} } as never),
    ).rejects.toThrow(/unknown job/);
  });

  it("sends email + push to a user opted-in to both, with stats from last week", async () => {
    const userRow = {
      id: "u-1",
      email: "u1@test.com",
      firstName: "Carla",
      name: "Carla Pérez",
      notificationSettings: { dailyReminder: true },
      deviceTokens: [{ token: "ExponentPushToken[abc]" }],
    };
    const entries = [
      {
        moodNormalized: "calma",
        moodEligibleForDynamics: true,
        tags: ["familia", "trabajo"],
      },
      {
        moodNormalized: "ansiedad",
        moodEligibleForDynamics: true,
        tags: ["trabajo"],
      },
      { moodNormalized: "calma", moodEligibleForDynamics: true, tags: [] },
    ];
    const prisma = buildPrisma([userRow], {
      diaryEntry: { findMany: vi.fn().mockResolvedValue(entries) },
      ecoMessage: { count: vi.fn().mockResolvedValue(7) },
      deviceToken: { deleteMany: vi.fn() },
    });
    const resend = buildResend();
    const push = buildPush([{ status: "ok" }]);
    const proc = new WeeklyDigestProcessor(prisma, resend, push, buildConfig());

    await proc.process(jobOf({}));

    expect(resend.send).toHaveBeenCalledTimes(1);
    const emailArg = (resend.send as ReturnType<typeof vi.fn>).mock
      .calls[0]![0] as {
      to: string;
      subject: string;
      html: string;
      text: string;
    };
    expect(emailArg.to).toBe("u1@test.com");
    expect(emailArg.text).toContain("3 entradas");
    expect(emailArg.text).toContain("7 mensajes");
    // Dominant mood is "calma" (2 vs 1).
    expect(emailArg.text).toContain("calma");

    expect(push.sendToTokens).toHaveBeenCalledTimes(1);
    const [tokens] = (push.sendToTokens as ReturnType<typeof vi.fn>).mock
      .calls[0]!;
    expect(tokens).toEqual(["ExponentPushToken[abc]"]);

    // El resumen semanal y Patrones no son el Mapa Emocional: son conteos de la
    // semana. El aviso decía «Revisa tu mapa» y enlazaba a Patrones.
    const [, aviso] = (push.sendToTokens as ReturnType<typeof vi.fn>).mock
      .calls[0]!;
    expect((aviso as { body: string }).body).toContain("Revisa tus patrones");
  });

  it("#3 (PR-2B): an ineligible mood is not counted — a raw 'hard' with eligible=false yields dominantMood=null; tags + entry count still stand", async () => {
    const userRow = {
      id: "u-1",
      email: "u1@test.com",
      firstName: "Carla",
      name: "Carla Pérez",
      notificationSettings: { dailyReminder: true },
      deviceTokens: [],
    };
    const entries = [
      // Raw legacy/ineligible mood — the digest must NOT count it.
      {
        moodNormalized: "hard",
        moodEligibleForDynamics: false,
        tags: ["trabajo"],
      },
      // A pure reflexión with no mood at all — tags still count.
      { moodNormalized: null, moodEligibleForDynamics: false, tags: ["foco"] },
    ];
    const prisma = buildPrisma([userRow], {
      diaryEntry: { findMany: vi.fn().mockResolvedValue(entries) },
      ecoMessage: { count: vi.fn().mockResolvedValue(0) },
      deviceToken: { deleteMany: vi.fn() },
    });
    const resend = buildResend();
    const proc = new WeeklyDigestProcessor(
      prisma,
      resend,
      buildPush(),
      buildConfig(),
    );

    await proc.process(jobOf({}));

    const emailArg = (resend.send as ReturnType<typeof vi.fn>).mock
      .calls[0]![0] as { text: string };
    // Entry count survives (2 entries).
    expect(emailArg.text).toContain("2 entradas");
    // No ineligible mood leaks into the dominant-mood copy.
    expect(emailArg.text).not.toContain("hard");
    // Tags are independent of eligibility.
    expect(emailArg.text).toContain("trabajo");
    expect(emailArg.text).toContain("foco");
  });

  it("skips push when user has no device tokens (email only)", async () => {
    const prisma = buildPrisma([
      {
        id: "u-1",
        email: "u1@test.com",
        firstName: "X",
        name: "X",
        notificationSettings: { dailyReminder: true },
        deviceTokens: [],
      },
    ]);
    const resend = buildResend();
    const push = buildPush();
    const proc = new WeeklyDigestProcessor(prisma, resend, push, buildConfig());

    await proc.process(jobOf({}));

    expect(resend.send).toHaveBeenCalledOnce();
    expect(push.sendToTokens).not.toHaveBeenCalled();
  });

  it("skips push when dailyReminder is false (email only — weeklyReport stays opt-in)", async () => {
    const prisma = buildPrisma([
      {
        id: "u-1",
        email: "u1@test.com",
        firstName: "X",
        name: "X",
        notificationSettings: { dailyReminder: false },
        deviceTokens: [{ token: "ExponentPushToken[x]" }],
      },
    ]);
    const resend = buildResend();
    const push = buildPush();
    const proc = new WeeklyDigestProcessor(prisma, resend, push, buildConfig());

    await proc.process(jobOf({}));

    expect(resend.send).toHaveBeenCalledOnce();
    expect(push.sendToTokens).not.toHaveBeenCalled();
  });

  it("prunes stale Expo tokens flagged DeviceNotRegistered", async () => {
    const deleteMany = vi.fn();
    const prisma = buildPrisma(
      [
        {
          id: "u-1",
          email: "u1@test.com",
          firstName: "X",
          name: "X",
          notificationSettings: { dailyReminder: true },
          deviceTokens: [
            { token: "ExponentPushToken[good]" },
            { token: "ExponentPushToken[stale]" },
          ],
        },
      ],
      {
        deviceToken: { deleteMany },
      },
    );
    const push = buildPush([
      { status: "ok" },
      { status: "error", invalidToken: "ExponentPushToken[stale]" },
    ]);
    const proc = new WeeklyDigestProcessor(
      prisma,
      buildResend(),
      push,
      buildConfig(),
    );

    await proc.process(jobOf({}));

    expect(deleteMany).toHaveBeenCalledWith({
      where: { token: { in: ["ExponentPushToken[stale]"] } },
    });
  });

  it("uses 'no activity' copy when the user wrote nothing last week", async () => {
    const prisma = buildPrisma(
      [
        {
          id: "u-1",
          email: "u1@test.com",
          firstName: "X",
          name: "X",
          notificationSettings: { dailyReminder: true },
          deviceTokens: [],
        },
      ],
      {
        diaryEntry: { findMany: vi.fn().mockResolvedValue([]) },
        ecoMessage: { count: vi.fn().mockResolvedValue(0) },
      },
    );
    const resend = buildResend();
    const proc = new WeeklyDigestProcessor(
      prisma,
      resend,
      buildPush(),
      buildConfig(),
    );

    await proc.process(jobOf({}));

    const emailArg = (resend.send as ReturnType<typeof vi.fn>).mock
      .calls[0]![0] as {
      subject: string;
      text: string;
    };
    expect(emailArg.subject).toContain("Tu espacio");
    expect(emailArg.text).toContain("no escribiste");
  });

  it("includes the WeeklySummary LLM narrative when one exists for the week (S45)", async () => {
    const userRow = {
      id: "u-1",
      email: "u1@test.com",
      firstName: "X",
      name: "X",
      notificationSettings: { dailyReminder: true },
      deviceTokens: [],
    };
    const findUnique = vi.fn().mockResolvedValue({
      headline: "Una semana con foco en familia",
      narrative: "Notamos que la familia volvió varias veces…",
    });
    const prisma = buildPrisma([userRow], {
      diaryEntry: {
        findMany: vi.fn().mockResolvedValue([
          {
            moodNormalized: "calma",
            moodEligibleForDynamics: true,
            tags: ["familia"],
          },
        ]),
      },
      ecoMessage: { count: vi.fn().mockResolvedValue(2) },
      weeklySummary: { findUnique },
    });
    const resend = buildResend();
    const proc = new WeeklyDigestProcessor(
      prisma,
      resend,
      buildPush(),
      buildConfig(),
    );

    await proc.process(jobOf({}));

    // The findUnique was scoped to (userId, weekStart).
    expect(findUnique).toHaveBeenCalledOnce();
    const arg = findUnique.mock.calls[0]![0] as {
      where: { userId_weekStart: { userId: string; weekStart: Date } };
    };
    expect(arg.where.userId_weekStart.userId).toBe("u-1");
    expect(arg.where.userId_weekStart.weekStart).toBeInstanceOf(Date);

    const emailArg = (resend.send as ReturnType<typeof vi.fn>).mock
      .calls[0]![0] as { html: string; text: string };
    expect(emailArg.html).toContain("Una semana con foco en familia");
    expect(emailArg.html).toContain("Notamos que la familia volvió");
    expect(emailArg.text).toContain("Una semana con foco en familia");
  });

  it("does not abort the run if one user's send fails", async () => {
    const users = [
      {
        id: "u-1",
        email: "u1@test.com",
        firstName: "A",
        name: "A",
        notificationSettings: { dailyReminder: true },
        deviceTokens: [],
      },
      {
        id: "u-2",
        email: "u2@test.com",
        firstName: "B",
        name: "B",
        notificationSettings: { dailyReminder: true },
        deviceTokens: [],
      },
    ];
    const prisma = buildPrisma(users);
    const resend = {
      send: vi
        .fn()
        .mockRejectedValueOnce(new Error("u1 failed"))
        .mockResolvedValueOnce(undefined),
    } as never;
    const proc = new WeeklyDigestProcessor(
      prisma,
      resend,
      buildPush(),
      buildConfig(),
    );

    await expect(proc.process(jobOf({}))).resolves.toBeUndefined();
    expect(
      (resend as { send: ReturnType<typeof vi.fn> }).send,
    ).toHaveBeenCalledTimes(2);
  });

  // ─── Sprint S53 — timezone-aware fan-out ──────────────────────────────────

  describe("timezone gate (Sprint S53)", () => {
    it("sends to a Guayaquil user when UTC is Monday 12:00 (local 07:00)", async () => {
      const userRow = {
        id: "u-ecu",
        email: "ecu@test.com",
        firstName: "Inés",
        name: "Inés Q.",
        notificationSettings: { dailyReminder: true },
        deviceTokens: [],
        profile: { timezone: "America/Guayaquil" },
      };
      const prisma = buildPrisma([userRow]);
      const resend = buildResend();
      const proc = new WeeklyDigestProcessor(
        prisma,
        resend,
        buildPush(),
        buildConfig(),
      );

      // Monday 12:00 UTC === Monday 07:00 Guayaquil
      await proc.process(
        jobOf({ nowIso: "2026-06-08T12:00:00Z" }, { defaultNow: false }),
      );
      expect(
        (resend as { send: ReturnType<typeof vi.fn> }).send,
      ).toHaveBeenCalledTimes(1);
    });

    it("SKIPS a Guayaquil user when UTC is Monday 07:00 (local 02:00 Sunday — wrong hour AND day)", async () => {
      const userRow = {
        id: "u-ecu",
        email: "ecu@test.com",
        firstName: "Inés",
        name: "Inés Q.",
        notificationSettings: { dailyReminder: true },
        deviceTokens: [],
        profile: { timezone: "America/Guayaquil" },
      };
      const prisma = buildPrisma([userRow]);
      const resend = buildResend();
      const proc = new WeeklyDigestProcessor(
        prisma,
        resend,
        buildPush(),
        buildConfig(),
      );

      await proc.process(
        jobOf({ nowIso: "2026-06-08T07:00:00Z" }, { defaultNow: false }),
      );
      expect(
        (resend as { send: ReturnType<typeof vi.fn> }).send,
      ).not.toHaveBeenCalled();
    });

    it("sends to a Tokyo user when UTC is Sunday 22:00 (local Monday 07:00) — day rollover", async () => {
      const userRow = {
        id: "u-jpn",
        email: "jpn@test.com",
        firstName: "Yui",
        name: "Yui K.",
        notificationSettings: { dailyReminder: true },
        deviceTokens: [],
        profile: { timezone: "Asia/Tokyo" },
      };
      const prisma = buildPrisma([userRow]);
      const resend = buildResend();
      const proc = new WeeklyDigestProcessor(
        prisma,
        resend,
        buildPush(),
        buildConfig(),
      );

      await proc.process(
        jobOf({ nowIso: "2026-06-07T22:00:00Z" }, { defaultNow: false }),
      );
      expect(
        (resend as { send: ReturnType<typeof vi.fn> }).send,
      ).toHaveBeenCalledTimes(1);
    });

    it("legacy users without `profile.timezone` fall back to UTC — get sent at Monday 07:00 UTC", async () => {
      const userRow = {
        id: "u-legacy",
        email: "legacy@test.com",
        firstName: "Sam",
        name: "Sam Legacy",
        notificationSettings: { dailyReminder: true },
        deviceTokens: [],
        profile: null,
      };
      const prisma = buildPrisma([userRow]);
      const resend = buildResend();
      const proc = new WeeklyDigestProcessor(
        prisma,
        resend,
        buildPush(),
        buildConfig(),
      );

      await proc.process(
        jobOf({ nowIso: "2026-06-08T07:00:00Z" }, { defaultNow: false }),
      );
      expect(
        (resend as { send: ReturnType<typeof vi.fn> }).send,
      ).toHaveBeenCalledTimes(1);
    });
  });

  /**
   * §67 — el digest llevaba un literal a la antigua Web de Vercel.
   *
   * No era una conexión con el proveedor retirado ni un despliegue allí: era un
   * ENLACE DE PRODUCTO que se habría enviado a cada persona suscrita el día que
   * el correo se encienda, apuntando a una Web que ya no es la del producto.
   *
   * Se comprueba sobre el mensaje RENDERIZADO —HTML y texto plano—, porque la
   * plantilla usa el enlace en los dos sitios y arreglar sólo uno dejaría el
   * defecto a medias.
   */
  describe("el enlace a Patrones sale del entorno (§67)", () => {
    const usuario = {
      id: "u-link",
      email: "u1@test.com",
      firstName: "Carla",
      name: "Carla Pérez",
      notificationSettings: { dailyReminder: false },
      deviceTokens: [],
    };

    async function correoCon(appUrl: string) {
      const prisma = buildPrisma([usuario], {
        diaryEntry: {
          findMany: vi.fn().mockResolvedValue([
            {
              moodNormalized: "calma",
              moodEligibleForDynamics: true,
              tags: [],
            },
          ]),
        },
      });
      const resend = buildResend();
      const proc = new WeeklyDigestProcessor(
        prisma,
        resend,
        buildPush(),
        buildConfig(appUrl),
      );
      await proc.process(jobOf({}));
      const send = resend.send as unknown as ReturnType<typeof vi.fn>;
      expect(send).toHaveBeenCalledTimes(1);
      return send.mock.calls[0]![0] as { html: string; text: string };
    }

    it("en staging apunta a la Web de staging, en HTML y en texto", async () => {
      const email = await correoCon("https://staging.feelverse.app");
      const esperado = "https://staging.feelverse.app/dashboard/patrones";
      expect(email.html).toContain(esperado);
      expect(email.text).toContain(esperado);
    });

    it("con la configuración de producción apunta al dominio de producción", async () => {
      const email = await correoCon("https://feelverse.app");
      const esperado = "https://feelverse.app/dashboard/patrones";
      expect(email.html).toContain(esperado);
      expect(email.text).toContain(esperado);
      // Y no se cuela el de staging por el camino.
      expect(email.html).not.toContain("staging.feelverse.app");
    });

    it("la ruta de Patrones se conserva", async () => {
      const email = await correoCon("https://feelverse.app");
      expect(email.html).toContain("/dashboard/patrones");
      expect(email.text).toContain("/dashboard/patrones");
    });

    it("el mensaje NO recupera un dominio de una plataforma retirada", async () => {
      for (const appUrl of [
        "https://staging.feelverse.app",
        "https://feelverse.app",
      ]) {
        const email = await correoCon(appUrl);
        for (const cuerpo of [email.html, email.text]) {
          expect(cuerpo).not.toMatch(/vercel\.app|railway\.app|up\.railway/i);
        }
      }
    });

    it("el enlace se llama como lo que abre, no «tu mapa»", async () => {
      const email = await correoCon("https://feelverse.app");
      expect(email.html).toContain("Ver tus patrones →");
      for (const cuerpo of [email.html, email.text]) {
        expect(cuerpo).not.toMatch(/\bmapa\b/i);
      }
    });

    it("una barra final de más no produce `//dashboard`", async () => {
      const email = await correoCon("https://feelverse.app/");
      expect(email.html).toContain("https://feelverse.app/dashboard/patrones");
      expect(email.html).not.toContain("//dashboard");
    });
  });
});
