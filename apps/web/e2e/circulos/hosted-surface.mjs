#!/usr/bin/env node
/**
 * What the HOSTED surface actually sends over the wire.
 *
 * The unit tests know what `guestCookieOptions` returns and what the middleware
 * intends to set. None of them can say what a browser receives from the
 * deployment: `secure` is decided by `NODE_ENV`, the CSP is assembled per
 * request by middleware that only runs on the platform, and both travel through
 * an edge that is free to add, drop or rewrite headers. This asks the running
 * Web, over HTTPS.
 *
 * What it checks:
 *
 *   · The guest session cookie is `HttpOnly`, `Secure`, `SameSite=Lax` — as
 *     issued by the deployment, on a REAL acceptance, not a rendering of the
 *     options object.
 *   · The room's HTML does not contain the guest token anywhere. The token is
 *     issued once and must live only in a cookie no script can read; an
 *     inlined prop or a data attribute would undo that silently.
 *   · A Content-Security-Policy arrives ON A CÍRCULOS PATH, carries a
 *     per-request nonce, and that nonce CHANGES between requests — a fixed
 *     nonce is a nonce in name only. The policy is deliberately scoped to the
 *     three Círculos prefixes, so it is asked for where it is meant to be:
 *     asking `/` proves nothing about this surface either way.
 *   · Refusals from the API stay opaque: a stable code, and no stack, no SQL,
 *     no environment variable names, no file paths.
 *   · And the deployment's own diagnostics keep the same discipline: the live
 *     logs carry no session token, no attestation, no connection string and no
 *     address — a refusal logged with its code is useful, a refusal logged with
 *     the credential that failed is a second copy of the credential.
 *
 * It needs one allowlisted account to create the invitation it then accepts —
 * the pool a hosted run already wrote. Everything it creates is synthetic and
 * belongs to the test project.
 *
 * Usage:
 *   node apps/web/e2e/circulos/hosted-surface.mjs \
 *     --config <hosted.json> --accounts <pool.json>
 */

import { spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

const arg = (flag) => {
  const at = process.argv.indexOf(flag);
  return at < 0 ? null : process.argv[at + 1];
};
const cfgPath = arg("--config");
const accountsPath = arg("--accounts");
if (!cfgPath || !accountsPath) {
  console.error(
    "usage: hosted-surface.mjs --config <path> --accounts <pool.json>",
  );
  process.exit(2);
}
const cfg = JSON.parse(readFileSync(cfgPath, "utf8"));
const pool = JSON.parse(readFileSync(accountsPath, "utf8"));

let failures = 0;
const check = (ok, what, detail) => {
  console.log(`   ${ok ? "✓" : "✗"} ${what}${detail ? ` (${detail})` : ""}`);
  if (!ok) failures++;
};

// ── a real invitation, from a real allowlisted account ──────────────────────

const account = pool.organiser ?? Object.values(pool)[0];

const login = await fetch(`${cfg.apiUrl}/api/auth/login`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ email: account.email, password: account.password }),
});
const loginBody = await login.json().catch(() => ({}));
const token = loginBody?.accessToken ?? loginBody?.tokens?.accessToken ?? null;
if (!token) {
  console.error("could not sign in as the organiser of the pool");
  process.exit(1);
}

const invitationToken = randomBytes(32).toString("base64url");
const created = await fetch(`${cfg.apiUrl}/api/circles/duo`, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    authorization: `Bearer ${token}`,
    "Idempotency-Key": randomUUID(),
  },
  body: JSON.stringify({
    templateKey: cfg.templateKey,
    templateVersion: cfg.templateVersion,
    invitationToken,
  }),
});
if (created.status !== 201) {
  console.error(`could not create a Dúo to inspect: ${created.status}`);
  process.exit(1);
}

// ── 1 · the cookie the deployment actually issues ───────────────────────────

console.log("▸ the guest session cookie, as the hosted Web issues it");

const accepted = await fetch(`${cfg.webUrl}/api/circulos/sesion`, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    // The route refuses anything that is not same-origin; a browser sends this.
    origin: cfg.webUrl,
  },
  body: JSON.stringify({ secret: invitationToken }),
});
const setCookie = accepted.headers.getSetCookie?.() ?? [];
const guestCookie = setCookie.find((c) => c.startsWith("fv_circulo_guest="));

check(accepted.status < 300, "the acceptance succeeded", `${accepted.status}`);
check(Boolean(guestCookie), "a guest session cookie is set");
if (guestCookie) {
  const attrs = guestCookie.toLowerCase();
  check(attrs.includes("httponly"), "HttpOnly — no script can read it");
  check(attrs.includes("secure"), "Secure — it never travels over plain HTTP");
  check(attrs.includes("samesite=lax"), "SameSite=Lax — withheld on cross-site POSTs");
  check(attrs.includes("path=/"), "Path=/ — the one prefix all three surfaces share");
}

const body = await accepted.text();
const rawToken = guestCookie?.split("=")[1]?.split(";")[0] ?? "";
check(
  rawToken.length > 0 && !body.includes(rawToken),
  "the token is in the cookie and NOT in the response body",
);

// ── 2 · the room's HTML keeps the token out of the page ─────────────────────

const activityId = (await (async () => {
  const res = await fetch(`${cfg.apiUrl}/api/circles/guest/session`, {
    headers: { "x-circle-guest-session": decodeURIComponent(rawToken) },
  });
  const b = await res.json().catch(() => ({}));
  return b?.activityId ?? null;
})()) ?? null;

if (activityId) {
  console.log("▸ the room's HTML");
  const room = await fetch(`${cfg.webUrl}/compartir/${activityId}`, {
    headers: { cookie: `fv_circulo_guest=${rawToken}` },
  });
  const html = await room.text();
  check(room.status === 200, "the room renders for the guest", `${room.status}`);
  check(
    !html.includes(decodeURIComponent(rawToken)),
    "the guest token appears nowhere in the served HTML",
  );
  check(
    !/password|authorization|bearer /i.test(html),
    "no credential vocabulary is inlined in the page",
  );
} else {
  check(false, "could not resolve the activity behind the guest session");
}

// ── 3 · the Content-Security-Policy, and its nonce ──────────────────────────

console.log("▸ the Content-Security-Policy");

const cspPath = activityId ? `/compartir/${activityId}` : "/i/nonexistent";

const nonceOf = async () => {
  const res = await fetch(`${cfg.webUrl}${cspPath}`, {
    redirect: "manual",
    headers: { cookie: `fv_circulo_guest=${rawToken}` },
  });
  const csp =
    res.headers.get("content-security-policy") ??
    res.headers.get("content-security-policy-report-only");
  return { csp, nonce: /'nonce-([^']+)'/.exec(csp ?? "")?.[1] ?? null };
};

const first = await nonceOf();
const second = await nonceOf();

check(Boolean(first.csp), `a CSP header arrives on ${cspPath}`);
check(
  (first.csp ?? "").includes("script-src"),
  "it constrains script-src",
);
check(Boolean(first.nonce), "the policy carries a nonce");
check(
  first.nonce !== null && second.nonce !== null && first.nonce !== second.nonce,
  "and the nonce is different on the next request — it is per-request",
);
check(
  !/script-src[^;]*'unsafe-inline'/.test(first.csp ?? ""),
  "script-src does not fall back to 'unsafe-inline'",
);

// ── 4 · refusals stay opaque ────────────────────────────────────────────────

console.log("▸ what a refusal says");

const refused = await fetch(`${cfg.apiUrl}/api/circles/invitations/inspect`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ secret: `no-such-invitation-${randomUUID()}` }),
});
const refusedText = await refused.text();
check(
  refused.status === 404 && refusedText.includes("CIRCLE_INVITATION_UNUSABLE"),
  "an unusable invitation gets one stable code",
  `${refused.status}`,
);
check(
  !/ at |\.ts:\d|node_modules|select .* from |DATABASE_URL|JWT_SECRET|prisma/i.test(
    refusedText,
  ),
  "with no stack, no SQL, no environment names",
);

// ── 5 · the deployment's own diagnostics ────────────────────────────────────

console.log("▸ what the live logs carry");

/** `railway logs` streams until killed, so it is read for a few seconds. */
const logs = await new Promise((resolve) => {
  const child = spawn(
    "railway",
    [
      "logs",
      "--project", cfg.projectId,
      "--environment", cfg.environmentId,
      "--service", cfg.apiServiceId,
      "--json",
    ],
    { stdio: ["ignore", "pipe", "ignore"] },
  );
  let out = "";
  child.stdout.on("data", (c) => (out += c));
  setTimeout(() => {
    child.kill();
    resolve(out);
  }, 20_000);
});

check(logs.length > 0, "the logs could be read at all", `${logs.length} bytes`);

const guestToken = decodeURIComponent(rawToken);
check(
  guestToken.length > 0 && !logs.includes(guestToken),
  "this run's guest session token appears in no log line",
);
check(
  !/[A-Za-z0-9_-]{16,64}\.\d{13}\.[A-Za-z0-9_-]{20,}/.test(logs),
  "no attestation is echoed back into the logs",
);
check(
  !/postgres(ql)?:\/\/[^\s"]+:[^\s"]+@/.test(logs) && !/redis:\/\/[^\s"]+:[^\s"]+@/.test(logs),
  "no connection string with credentials is printed",
);
// The domain must contain a letter and end in an alphabetic TLD. Without
// that, `> @psico/api@0.0.0 migrate:deploy` reads as an address and the check
// fails on the build's own npm banner.
check(
  !/[\w.+-]+@(?!example\.test\b)[\w-]*[a-z][\w-]*\.[a-z]{2,}\b/i.test(logs),
  "no real address is printed",
);

console.log(
  failures === 0
    ? "\n✔ cookie, page, policy, refusal and logs all hold on the hosted surface"
    : `\n✖ ${failures} check(s) failed`,
);
process.exit(failures === 0 ? 0 : 1);
