#!/usr/bin/env node
/**
 * Is the PRODUCTION pilot open, closed in the right way, and shaped correctly?
 *
 * ── What this is not ───────────────────────────────────────────────────────
 *
 * It is not the walk. The walk registers a pool of synthetic accounts, moves
 * dates, enqueues real deletion jobs and deletes what it made; none of that
 * belongs anywhere near production, and this file creates nothing, writes
 * nothing and enqueues nothing.
 *
 * It is also not a substitute for two people doing the activity. The one thing
 * it cannot check is the thing only an authorised organiser can do — sign in
 * and create — because that needs their password, which nobody here has and
 * nobody here should. That check is a person's, and this script says so at the
 * end rather than quietly passing without it.
 *
 * ── What it does check ─────────────────────────────────────────────────────
 *
 *   · `/health` is 200, so "closed" can be told apart from "down".
 *   · The guest surface answers `401 CIRCLE_GUEST_SESSION_INVALID` and not
 *     `503 CIRCLES_UNAVAILABLE` — i.e. Círculos is OPEN and judging sessions on
 *     their merits. Under `off` this is exactly the check that fails.
 *   · Unauthenticated access to the member surface is refused, and refused as
 *     an auth problem rather than by leaking that the feature exists.
 *   · A DIRECT call to a route reserved for the BFF is rejected, which is the
 *     attestation doing its job. If the secret diverged between the API and the
 *     Web, this passes and the NEXT check fails — so both are here.
 *   · The reading surface is served, carries a per-request CSP nonce, and the
 *     public preview of the approved template renders with its approved title.
 *
 * Usage:
 *   node apps/web/e2e/circulos/production-ready.mjs \
 *     --api https://…  --web https://…  [--template duo-lo-que-me-ayuda]
 */

import { randomBytes, randomUUID } from "node:crypto";

const arg = (flag, fallback = null) => {
  const at = process.argv.indexOf(flag);
  return at < 0 ? fallback : (process.argv[at + 1] ?? fallback);
};

const API = arg("--api");
const WEB = arg("--web");
const TEMPLATE = arg("--template", "duo-lo-que-me-ayuda");
const EXPERIENCE = arg("--experience", "eec-c1-cuerpo-antes-que-mente");

if (!API || !WEB) {
  console.error(
    "usage: production-ready.mjs --api <url> --web <url> [--template <key>]",
  );
  process.exit(2);
}

let failures = 0;
const check = (ok, what, detail) => {
  console.log(`   ${ok ? "✓" : "✗"} ${what}${detail ? ` (${detail})` : ""}`);
  if (!ok) failures++;
};

const json = async (res) => res.json().catch(() => ({}));

console.log(`▸ API ${API}`);
console.log(`▸ Web ${WEB}`);

// ── the service is up, not merely quiet ─────────────────────────────────────

console.log("\n▸ health");
const health = await fetch(`${API}/health`);
check(health.status === 200, "/health answers 200", `${health.status}`);

// ── Círculos is OPEN, and says so by judging a session ──────────────────────

console.log("\n▸ the rollout");
const guest = await fetch(`${API}/api/circles/guest/session`, {
  headers: { "x-circle-guest-session": "probe-not-a-real-session" },
});
const guestBody = await json(guest);
check(
  guest.status !== 503,
  "Círculos is not closed — the surface is answering",
  `${guest.status} ${guestBody?.code ?? ""}`,
);
check(
  guest.status === 401 && guestBody?.code === "CIRCLE_GUEST_SESSION_INVALID",
  "and it judges the session on its merits, rather than its existence",
  `${guest.status} ${guestBody?.code ?? ""}`,
);

// ── an unauthenticated caller gets nowhere ──────────────────────────────────

console.log("\n▸ who may organise");
const anon = await fetch(`${API}/api/circles/access`);
check(
  anon.status === 401 || anon.status === 403,
  "an unauthenticated caller cannot read access",
  `${anon.status}`,
);

const anonCreate = await fetch(`${API}/api/circles/duo`, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "Idempotency-Key": randomUUID(),
  },
  body: JSON.stringify({
    templateKey: TEMPLATE,
    templateVersion: 1,
    invitationToken: randomBytes(32).toString("base64url"),
  }),
});
check(
  anonCreate.status === 401 || anonCreate.status === 403,
  "and cannot create a Dúo",
  `${anonCreate.status}`,
);

// ── the BFF boundary ────────────────────────────────────────────────────────

console.log("\n▸ the routes reserved for the BFF");
const direct = await fetch(`${API}/api/circles/invitations/inspect`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ token: randomBytes(32).toString("base64url") }),
});
const directBody = await json(direct);
check(
  direct.status === 401 || direct.status === 403,
  "a direct browser-shaped call is refused without an attestation",
  `${direct.status} ${directBody?.code ?? ""}`,
);

const forged = await fetch(`${API}/api/circles/invitations/inspect`, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "x-client-attestation": randomBytes(32).toString("hex"),
  },
  body: JSON.stringify({ token: randomBytes(32).toString("base64url") }),
});
check(
  forged.status === 401 || forged.status === 403,
  "and a forged attestation is refused too",
  `${forged.status}`,
);

// ── the same call THROUGH the Web is not refused for that reason ────────────
//
// The other half. If the two secrets diverged, the BFF would mint an
// attestation the API rejects and every guest would be locked out — while the
// checks above would still pass, because a direct call is supposed to fail.
//
// Two things have to be right for this to mean anything:
//
//   · An `Origin` header. The BFF has its own same-origin guard and answers
//     `403 CIRCLE_FORBIDDEN` without one, which looks exactly like the failure
//     being probed for.
//   · The body key is `secret`, not `token`. A wrong shape is answered 404,
//     like any unusable invitation.
//
// With both right, a bogus secret must come back 404. A 403 here means the API
// refused the BFF's attestation: the two secrets disagree.

const viaBff = await fetch(`${WEB}/api/circulos/inspeccion`, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    origin: new URL(WEB).origin,
  },
  body: JSON.stringify({ secret: randomBytes(32).toString("base64url") }),
});
const bffBody = await json(viaBff);
check(
  viaBff.status !== 403,
  "the Web's own attestation is accepted by the API — the secrets agree",
  `${viaBff.status} ${bffBody?.code ?? ""}`,
);
check(
  viaBff.status === 404 && bffBody?.code === "CIRCLE_INVITATION_UNUSABLE",
  "and an invented invitation is simply unusable",
  `${viaBff.status} ${bffBody?.code ?? ""}`,
);

// ── the surfaces a person actually opens ────────────────────────────────────

console.log("\n▸ the screens");
const preview = await fetch(`${WEB}/actividades/${TEMPLATE}`);
const previewHtml = await preview.text();
check(preview.status === 200, "the public preview is served", `${preview.status}`);
check(
  /Lo que me ayuda cuando estoy as/i.test(previewHtml),
  "and it is the approved activity, by its approved title",
);
check(
  !/no est[áa] disponible/i.test(previewHtml),
  "rather than an unavailable state",
);

const surface = await fetch(`${WEB}/dashboard/exploraciones/${EXPERIENCE}`, {
  redirect: "manual",
});
check(
  surface.status === 200 || (surface.status >= 300 && surface.status < 400),
  "the reading surface answers (a signed-out visitor is sent to log in)",
  `${surface.status}`,
);

// The CSP is attached to the Círculos paths — `/i`, `/compartir`,
// `/api/circulos` — and not to the public preview, which is an ordinary page.
// Probing the preview for it would report a missing policy that was never
// supposed to be there.
const room = await fetch(`${WEB}/compartir/${randomBytes(12).toString("hex")}`, {
  redirect: "manual",
});
const csp = room.headers.get("content-security-policy") ?? "";
check(csp.length > 0, "a CSP header arrives on a Círculos path", `${room.status}`);
check(/script-src/.test(csp), "it constrains script-src");
check(/'nonce-/.test(csp), "the policy carries a nonce");
check(
  !/'unsafe-inline'/.test(csp.split("script-src")[1]?.split(";")[0] ?? ""),
  "and script-src does not fall back to 'unsafe-inline'",
);
const second = await fetch(
  `${WEB}/compartir/${randomBytes(12).toString("hex")}`,
  { redirect: "manual" },
);
const nonceOf = (v) => /'nonce-([^']+)'/.exec(v ?? "")?.[1] ?? "";
check(
  nonceOf(csp) !== "" &&
    nonceOf(csp) !== nonceOf(second.headers.get("content-security-policy")),
  "and the next request gets a different one — it is per-request",
);

// ── what this could not check ───────────────────────────────────────────────

console.log(
  failures === 0
    ? "\n✔ production is open, shaped correctly, and refusing what it should"
    : `\n✖ ${failures} check(s) failed`,
);
console.log(
  "\n▸ NOT checked here, and it needs a person:\n" +
    "   an authorised organiser signing in and creating the Dúo. That needs\n" +
    "   their password. The walk is not run against production.",
);
process.exit(failures === 0 ? 0 : 1);
