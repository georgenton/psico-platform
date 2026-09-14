#!/usr/bin/env node
/**
 * Is the hosted environment actually ready for two people to try it?
 *
 * Everything else in this folder proves the product behaves. This proves the
 * HANDOVER works: that the account somebody is about to be given can sign in,
 * that Círculos is open for it, that the listing now leads somewhere, and that
 * the invitation waiting for the second person is still usable.
 *
 * ── It must not spend what it is checking ──────────────────────────────────
 *
 * Inspecting an invitation does not consume it — only accepting does — so the
 * invitation is checked with `inspect`, through the BFF, which is now the only
 * way into that route. Nothing here accepts anything, and nothing prints the
 * link or the password: they live in the ops file and are handed over by a
 * person, not by a log.
 *
 * Usage:
 *   node apps/web/e2e/circulos/hosted-manual-ready.mjs --config <hosted.json>
 */

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { chromium } from "playwright";

const at = process.argv.indexOf("--config");
if (at < 0) {
  console.error("usage: hosted-manual-ready.mjs --config <path>");
  process.exit(2);
}
const cfg = JSON.parse(readFileSync(process.argv[at + 1], "utf8"));

const OPS = join(homedir(), ".psico-ops/circulos-hosted-pilot.env");
if (!existsSync(OPS)) {
  console.error(`no ops file at ${OPS} — nothing to hand over`);
  process.exit(1);
}
const ops = Object.fromEntries(
  readFileSync(OPS, "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);

let failures = 0;
const check = (ok, what, detail) => {
  console.log(`   ${ok ? "✓" : "✗"} ${what}${detail ? ` (${detail})` : ""}`);
  if (!ok) failures++;
};

// ── 1 · the account ─────────────────────────────────────────────────────────

console.log(`▸ the account being handed over: ${ops.CIRCULOS_PILOT_EMAIL}`);

const login = await fetch(`${cfg.apiUrl}/api/auth/login`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    email: ops.CIRCULOS_PILOT_EMAIL,
    password: ops.CIRCULOS_PILOT_PASSWORD,
  }),
});
const token =
  (await login.json().catch(() => ({})))?.accessToken ?? null;
check(login.status < 300 && Boolean(token), "it can sign in", `${login.status}`);

if (token) {
  const access = await fetch(`${cfg.apiUrl}/api/circles/access`, {
    headers: { authorization: `Bearer ${token}` },
  });
  check(
    access.status === 200,
    "and Círculos is open for it — it is on the allowlist the API booted with",
    `${access.status}`,
  );
}

// ── 2 · the invitation the second person will open ──────────────────────────

if (ops.CIRCULOS_PILOT_INVITATION_URL) {
  const secret = ops.CIRCULOS_PILOT_INVITATION_URL.split("#")[1] ?? "";
  const seen = await fetch(`${cfg.webUrl}/api/circulos/inspeccion`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: cfg.webUrl },
    body: JSON.stringify({ secret }),
  });
  const body = await seen.json().catch(() => ({}));
  check(
    seen.status === 200 && body?.usable === true,
    "the waiting invitation is still usable, and looking did not spend it",
    `${seen.status}`,
  );
  check(
    Object.keys(body?.preview ?? {}).length > 0 &&
      !JSON.stringify(body).includes(secret),
    "and its preview says what it is without echoing the secret",
  );
} else {
  console.log("   · no prepared invitation in the ops file");
}

// ── 3 · the screens, in a browser, as the person will see them ──────────────

console.log("▸ the screens");
const browser = await chromium.launch();
try {
  const page = await browser.newPage();

  await page.goto(`${cfg.webUrl}/login`, { waitUntil: "domcontentloaded" });
  await page.fill('input[type="email"]', ops.CIRCULOS_PILOT_EMAIL);
  await page.fill('input[type="password"]', ops.CIRCULOS_PILOT_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.includes("/login"), {
    timeout: 45_000,
  });
  check(true, "signing in lands somewhere real", new URL(page.url()).pathname);

  // The listing that used to be a dead end.
  await page.goto(`${cfg.webUrl}/dashboard/circulos`, {
    waitUntil: "domcontentloaded",
  });
  const goToExperience = page.getByRole("link", {
    name: /Ir a la experiencia/i,
  });
  const leads = (await goToExperience.count()) > 0;
  check(leads, "the Círculos listing offers a way to the experience");
  if (leads) {
    check(
      (await goToExperience.first().getAttribute("href")) ===
        `/dashboard/exploraciones/${cfg.startPath?.split("/").pop() ?? ""}`,
      "and it points at the reading surface the mapping names",
      (await goToExperience.first().getAttribute("href")) ?? "",
    );
  }
  check(
    (await page.getByRole("link", { name: /Ver de qué se trata/i }).count()) === 0,
    "and no longer offers the link that led nowhere",
  );

  // The start URL itself.
  await page.goto(`${cfg.webUrl}${cfg.startPath}`, {
    waitUntil: "domcontentloaded",
  });
  const cta = page.getByRole("link", { name: /Hacer esto con alguien/i });
  check(
    (await cta.count()) > 0,
    "the reading surface still offers the Dúo to this account",
  );
} finally {
  await browser.close();
}

console.log(
  failures === 0
    ? "\n✔ ready to hand over"
    : `\n✖ ${failures} check(s) failed — do NOT hand it over yet`,
);
process.exit(failures === 0 ? 0 : 1);
