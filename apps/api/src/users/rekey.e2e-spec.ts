import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  vi,
} from "vitest";
import request from "supertest";
import * as bcrypt from "bcryptjs";
import {
  deriveMasterKey,
  deriveSubKey,
  DIARY_KEY_INFO,
  encryptString,
  decryptString,
  randomBytes,
  bytesToBase64Url,
} from "@psico/crypto";
import { createE2EApp, closeE2EApp, type E2EHarness } from "../test/e2e-app";

/**
 * Full-circle E2E test of the Diario re-encrypt flow (Sprint 3 del roadmap).
 *
 * What this exercises end-to-end:
 *   1. Real @psico/crypto: derive masterKey₁ from password₁+salt₁, derive
 *      the per-feature diaryKey₁, encrypt a plaintext with XChaCha20.
 *   2. Real HTTP through Nest: POST /api/reflexiones/entries lands the cipher₁
 *      in the validated DTO (base64url, length).
 *   3. Real HTTP for the rekey: POST /api/user/password-change-with-rekey
 *      with password₂+salt₂ and a NEW cipher₂ produced with diaryKey₂.
 *   4. Real @psico/crypto: decrypt cipher₂ with diaryKey₂ → original
 *      plaintext recovered. THIS is the full-circle assertion.
 *
 * What's mocked: the Prisma layer (so we can run hermetically without
 * Postgres). The mock receives cipher₂ exactly as the service would write
 * it to DB, and the test reads that captured arg to decrypt.
 *
 * Test runtime budget: ~10s. Two Argon2id derivations dominate
 * (m=64MB t=3 p=4) — that's the price of "real crypto, no shortcuts".
 */

const PASSWORD_1 = "Password123!";
const PASSWORD_2 = "AnotherPassword456!";
const PLAINTEXT =
  "Hoy fue un día complicado pero terminé un capítulo importante del libro.";

describe("Diario rekey · E2E (real crypto)", () => {
  let h: E2EHarness;

  beforeAll(async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    h = await createE2EApp();
  }, 20_000);

  afterAll(async () => {
    await closeE2EApp(h);
  });

  beforeEach(async () => {
    await h.resetMocks();
  });

  it("round-trip: cipher with key₁ → POST entry → rekey to key₂ → decrypt with key₂", async () => {
    // ── Step 1 · derive key₁ and encrypt the plaintext ─────────────────
    // deriveMasterKey expects the salt already encoded as base64url —
    // that mirrors the wire format the backend stores in User.cryptoSalt.
    // 16 raw bytes → 22 chars b64url unpadded, exactly what
    // auth.service.ts produces via Node `randomBytes(16).toString("base64url")`.
    // The rekey DTO accepts 22–28 chars (loosened by `fix-salt-length-dto`).
    const salt1B64 = bytesToBase64Url(randomBytes(16));
    const masterKey1 = await deriveMasterKey(PASSWORD_1, salt1B64);
    const diaryKey1 = deriveSubKey(masterKey1, DIARY_KEY_INFO);
    const envelope1 = encryptString(PLAINTEXT, diaryKey1);

    // ── Step 2 · login through real HTTP → obtain JWT ──────────────────
    const realHash = await bcrypt.hash(PASSWORD_1, 12);
    const USER_ID = "user-rekey-1";
    h.prisma.user.findUnique.mockResolvedValue({
      id: USER_ID,
      email: "rekey@example.com",
      name: "Rekey User",
      role: "USER",
      plan: "FREE",
      passwordHash: realHash,
      authProvider: "LOCAL",
      isActive: true,
      authRevision: 0,
    });
    h.prisma.refreshToken.create.mockResolvedValue({});

    const loginRes = await request(h.app.getHttpServer())
      .post("/api/auth/login")
      .send({ email: "rekey@example.com", password: PASSWORD_1 });

    expect(loginRes.status).toBe(200);
    const { accessToken } = loginRes.body;
    expect(typeof accessToken).toBe("string");

    // ── Step 3 · POST entry with cipher₁ ───────────────────────────────
    const ENTRY_ID = "entry-1";
    h.prisma.diaryEntry.create.mockResolvedValue({
      id: ENTRY_ID,
      userId: USER_ID,
      textCiphertext: envelope1.ciphertext,
      textNonce: envelope1.nonce,
      createdAt: new Date(),
      mood: null,
      kind: "FREEFORM",
      tags: [],
    });

    const postRes = await request(h.app.getHttpServer())
      .post("/api/reflexiones/entries")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        mood: "good",
        kind: "free",
        tags: ["dev"],
        textCiphertext: envelope1.ciphertext,
        textNonce: envelope1.nonce,
      });

    expect(postRes.status).toBe(201);
    // The cipher arrives at the prisma layer unmodified — server never
    // touches plaintext.
    const createCall = h.prisma.diaryEntry.create.mock.calls[0]?.[0] as {
      data: { textCiphertext: string; textNonce: string };
    };
    expect(createCall.data.textCiphertext).toBe(envelope1.ciphertext);
    expect(createCall.data.textNonce).toBe(envelope1.nonce);

    // ── Step 4 · derive key₂ and re-encrypt cipher₁ → cipher₂ ──────────
    // In real life the client decrypts cipher₁ in-memory with key₁ and
    // re-encrypts the plaintext with key₂. The plaintext never touches
    // the wire. We mirror that here.
    const salt2B64 = bytesToBase64Url(randomBytes(16));
    const masterKey2 = await deriveMasterKey(PASSWORD_2, salt2B64);
    const diaryKey2 = deriveSubKey(masterKey2, DIARY_KEY_INFO);
    const recovered = decryptString(envelope1, diaryKey1);
    expect(recovered).toBe(PLAINTEXT); // sanity — key₁ decrypts cipher₁
    const envelope2 = encryptString(recovered, diaryKey2);

    // ── Step 5 · POST password-change-with-rekey ──────────────────────
    // Re-prime mocks the rekey endpoint depends on. The service calls:
    //   user.findUnique({ passwordHash + authProvider })
    //   diaryEntry.count (validate ownership)
    //   $transaction([user.update, ...diaryEntry.update, refreshToken.updateMany])
    h.prisma.user.findUnique.mockResolvedValue({
      // `id` is required now that JwtStrategy resolves req.user.userId from the
      // DB lookup (ADR 0015), not from the token payload.
      id: USER_ID,
      passwordHash: realHash,
      authProvider: "LOCAL",
      isActive: true,
      authRevision: 0,
    });
    h.prisma.diaryEntry.count.mockResolvedValue(1);
    h.prisma.user.update.mockResolvedValue({});
    h.prisma.diaryEntry.update.mockResolvedValue({});
    h.prisma.refreshToken.deleteMany.mockResolvedValue({ count: 1 });
    // The rekey now runs the transaction in callback form (ADR 0015: bump
    // authRevision + delete refresh tokens). Pass the prisma mock itself as
    // the tx client so writes land on the spies asserted below.
    h.prisma.$transaction.mockImplementation(async (arg: unknown) => {
      if (typeof arg === "function") {
        return (arg as (tx: unknown) => unknown)(h.prisma);
      }
      throw new Error("Unexpected $transaction shape");
    });

    const rekeyRes = await request(h.app.getHttpServer())
      .post("/api/user/password-change-with-rekey")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        currentPassword: PASSWORD_1,
        newPassword: PASSWORD_2,
        newCryptoSalt: salt2B64,
        reencryptedEntries: [
          {
            id: ENTRY_ID,
            textCiphertext: envelope2.ciphertext,
            textNonce: envelope2.nonce,
          },
        ],
      });

    expect(rekeyRes.status).toBe(200);
    expect(rekeyRes.body.ok).toBe(true);
    expect(rekeyRes.body.cryptoSalt).toBe(salt2B64);
    expect(rekeyRes.body.rekeyed).toBe(1);

    // ── Step 6 · Verify the cipher passed into prisma.diaryEntry.update
    //   round-trips via key₂. This is the full-circle assertion. If the
    //   service silently re-shaped the payload (e.g. base64 vs base64url
    //   confusion) decryptString would throw.
    const updateCall = h.prisma.diaryEntry.update.mock.calls[0]?.[0] as {
      where: { id: string };
      data: { textCiphertext: string; textNonce: string };
    };
    expect(updateCall.where.id).toBe(ENTRY_ID);
    expect(updateCall.data.textCiphertext).toBe(envelope2.ciphertext);
    expect(updateCall.data.textNonce).toBe(envelope2.nonce);

    const decryptedAfterRekey = decryptString(
      {
        ciphertext: updateCall.data.textCiphertext,
        nonce: updateCall.data.textNonce,
      },
      diaryKey2,
    );
    expect(decryptedAfterRekey).toBe(PLAINTEXT);

    // ── Step 7 · Negative control: key₁ no longer decrypts cipher₂.
    // Without this we couldn't tell whether the rekey actually changed
    // the key or was a no-op pretending to.
    expect(() =>
      decryptString(
        {
          ciphertext: updateCall.data.textCiphertext,
          nonce: updateCall.data.textNonce,
        },
        diaryKey1,
      ),
    ).toThrow();

    // ── Step 8 · Every session revoked atomically with the rekey (ADR 0015):
    // authRevision bumped + all refresh tokens deleted.
    expect(h.prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ authRevision: { increment: 1 } }),
      }),
    );
    expect(h.prisma.refreshToken.deleteMany).toHaveBeenCalledWith({
      where: { userId: USER_ID },
    });
  }, 20_000);
});
