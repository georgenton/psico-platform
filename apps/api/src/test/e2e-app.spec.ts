import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { closeE2EApp, createE2EApp, type E2EHarness } from "./e2e-app";

/**
 * The harness has to answer its own requests.
 *
 * Handed a server that is not listening, supertest calls `listen(0)` —which
 * binds "::"— and connects to 127.0.0.1. On macOS another program bound to
 * 127.0.0.1 on that same port wins, so the request lands on Notion, VS Code or
 * Docker and the spec fails with a status this API never sent. Reproduced on
 * 2026-11-24: a 404 where validation always answers 400, and 14 foreign answers
 * in 20 000 connections. The rate is too low to notice on a retry, which is
 * exactly why it went undiagnosed.
 */
describe("el arnés E2E escucha donde se le pregunta", () => {
  let h: E2EHarness;

  beforeAll(async () => {
    h = await createE2EApp();
  }, 30_000);

  afterAll(async () => {
    await closeE2EApp(h);
  });

  it("escucha en 127.0.0.1 antes de la primera petición", () => {
    const address = h.app.getHttpServer().address() as AddressInfo | null;

    expect(address?.address).toBe("127.0.0.1");
    expect(address?.port).toBeGreaterThan(0);
  });

  it("no abre otro puerto por petición", async () => {
    const before = (h.app.getHttpServer().address() as AddressInfo).port;

    await request(h.app.getHttpServer()).get("/health").expect(200);
    await request(h.app.getHttpServer()).get("/health").expect(200);

    const after = h.app.getHttpServer().address() as AddressInfo | null;
    expect(after?.port).toBe(before);
  });

  it("ninguna prueba que use supertest deja el servidor sin escuchar", () => {
    const root = join(__dirname, "..");
    const specs = readdirSync(root, { recursive: true, encoding: "utf8" })
      .filter((f) => /\.(e2e-spec|pg-spec|spec)\.ts$/.test(f))
      .map((f) => ({ f, src: readFileSync(join(root, f), "utf8") }))
      .filter(({ src }) => /from "supertest"/.test(src));

    // A path that stops matching would leave this green and empty.
    expect(specs.length).toBeGreaterThan(10);

    const offenders = specs
      .filter(
        ({ src }) =>
          !/createE2EApp\(/.test(src) &&
          !/\.listen\(0, "127\.0\.0\.1"\)/.test(src),
      )
      .map(({ f }) => f);
    expect(offenders).toEqual([]);
  });
});
