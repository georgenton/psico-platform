import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { GUIDE_START_LOCK_PROTOCOL } from "./guide-active-capability";

/**
 * C.0A — the boot marker that lets the C.0B2 and C.0B3 gates be evidence
 * instead of an inference.
 *
 * A commit SHA says which source was built. It does not say the running
 * process takes both start locks, and one request through a load balancer
 * says nothing about the other replicas. So every replica states its protocol
 * once at boot, and the platform's log view shows the fleet.
 *
 * What this marker is NOT: proof that the locks are correct. It reports which
 * sequence this binary speaks; whether that sequence is right is what the
 * mixed-fleet pg-spec and the START behaviour spec are for.
 */

const main = () => readFileSync(join(process.cwd(), "src/main.ts"), "utf8");

describe("ratchet · Guide start-lock protocol marker", () => {
  it("uses the shared constant, not a hand-written string", () => {
    expect(main()).toMatch(
      /GUIDE_START_LOCK_PROTOCOL=\$\{GUIDE_START_LOCK_PROTOCOL\}/,
    );
    expect(GUIDE_START_LOCK_PROTOCOL).toBe("lineage-v2");
  });

  it("reports a commit SHA and a replica id — and resolves both across platforms", () => {
    // ADR 0024 changed the spelling, not the requirement. This used to assert
    // Railway's variable names, which made the marker only as portable as one
    // vendor: on a platform that does not set RAILWAY_GIT_COMMIT_SHA every
    // replica would print `BUILD_SHA=unknown`, and the C.0B2 gate would lose the
    // one thing that tells an old binary from a new one. So what is ratcheted is
    // that BOTH values are emitted and that MORE than one platform can answer.
    const src = main();
    expect(src).toMatch(/BUILD_SHA=\$\{buildSha\}/);
    expect(src).toMatch(/REPLICA=\$\{replicaId\}/);

    // The SHA goes through the shared resolver rather than reading one vendor's
    // variable here.
    expect(src).toMatch(/const buildSha = releaseSha\(\)/);

    // The replica id recognises Railway and Coolify, and falls back to the
    // container hostname, which any Docker host sets.
    expect(src).toMatch(/RAILWAY_REPLICA_ID/);
    expect(src).toMatch(/COOLIFY_CONTAINER_NAME/);
    expect(src).toMatch(/process\.env\.HOSTNAME/);
  });

  it("does not stop a local boot when those are absent", () => {
    // None of those variables exists on a laptop. A missing value is reported,
    // never guessed, and never fatal.
    const src = main();
    expect(src).toMatch(/releaseSha\(\) \?\? "unknown"/);
    expect(src).toMatch(/"local";/);
  });

  it("is emitted BEFORE the process accepts traffic", () => {
    // After `listen()` there would be a window where this replica serves
    // requests while having claimed nothing — exactly the window the drain
    // gate needs to rule out.
    const src = main();
    const marker = src.indexOf("GUIDE_START_LOCK_PROTOCOL=${");
    const listen = src.indexOf("await app.listen(port)");
    expect(marker).toBeGreaterThan(-1);
    expect(listen).toBeGreaterThan(-1);
    expect(marker).toBeLessThan(listen);
  });

  it("carries no secret and no user data", () => {
    const line =
      main().match(/`GUIDE_START_LOCK_PROTOCOL=[\s\S]*?`,\n {2}\);/)?.[0] ?? "";
    expect(line).not.toMatch(/SECRET|TOKEN|KEY=|PASSWORD|DATABASE_URL/);
    expect(line).not.toMatch(/userId|guideKey|email/);
  });

  it("uses the framework logger, not console", () => {
    const src = main();
    const idx = src.indexOf("GUIDE_START_LOCK_PROTOCOL=${");
    expect(src.slice(Math.max(0, idx - 400), idx)).toMatch(
      /new Logger\("Bootstrap"\)\.log\(/,
    );
  });
});
