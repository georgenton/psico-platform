#!/usr/bin/env node
/**
 * e2e-prod-smoke — end-to-end smoke test for the Emotional Map against a running
 * API (prod or staging). Dependency-free (Node 20+ global fetch).
 *
 * Covers two phases of the E2E roadmap:
 *   • Fase 0 — deploy + integrations precheck (GET /api/health, /api/health/integrations)
 *   • Fase 2 — per-persona map verification (GET /api/emotional-map, asserted vs the benchmark)
 *
 * It NEVER writes to the DB. Seeding the backdated mood history is a separate,
 * DB-side step (scripts/seed-mood-history.mjs, run via `railway run`). Order is:
 *   1) register/login the persona account (this script, --register)
 *   2) seed its mood history           (seed-mood-history.mjs, busts the cache)
 *   3) verify the map                  (this script, --persona)
 *
 * Usage:
 *   # Fase 0 — precheck with an ADMIN account
 *   node scripts/e2e-prod-smoke.mjs --api=https://xxx.up.railway.app \
 *     --email=admin@you.com --password=...
 *
 *   # Fase 2 — create + verify a persona (run the seed between register and verify)
 *   node scripts/e2e-prod-smoke.mjs --api=https://xxx.up.railway.app \
 *     --email=test-estable@you.com --password=Str0ngPass! --register --name="Test Estable"
 *   # (now: railway run node scripts/seed-mood-history.mjs --email=test-estable@you.com --days=90 --pattern=stable --reset)
 *   node scripts/e2e-prod-smoke.mjs --api=https://xxx.up.railway.app \
 *     --email=test-estable@you.com --password=Str0ngPass! --persona=stable
 *
 * Flags:
 *   --api       (required) API base, e.g. https://xxx.up.railway.app
 *   --email     account email (needed for login / register / map)
 *   --password  account password
 *   --token     use a raw JWT instead of email/password
 *   --register  create the account first (ignores "already exists")
 *   --name      display name for --register (default "E2E Test")
 *   --persona   expected shape to assert: new | stable | volatile | improving | declining
 *
 * Exit code is non-zero if any assertion fails (CI-friendly).
 */

function parseArgs(argv) {
  const out = {};
  for (const a of argv.slice(2)) {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    if (m) out[m[1]] = m[2] === undefined ? true : m[2];
  }
  return out;
}

const C = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  bold: "\x1b[1m",
};
const ok = (s) => `${C.green}✓${C.reset} ${s}`;
const bad = (s) => `${C.red}✗${C.reset} ${s}`;
const warn = (s) => `${C.yellow}⚠${C.reset} ${s}`;
const head = (s) => `\n${C.bold}${C.cyan}${s}${C.reset}`;

function joinUrl(base, path) {
  return `${base.replace(/\/+$/, "")}${path}`;
}

async function req(method, url, { token, body } = {}) {
  const headers = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  const text = await res.text();
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { status: res.status, json };
}

const pct = (v) => (v == null ? "—" : `${Math.round(v * 100)}%`);

/** Flatten the nested integrations report into "name → configured (stub)". */
function flattenIntegrations(report, prefix = "") {
  const lines = [];
  for (const [k, v] of Object.entries(report ?? {})) {
    const name = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && "configured" in v) {
      const state = v.configured
        ? v.stub
          ? `${C.yellow}configured (STUB)${C.reset}`
          : `${C.green}configured${C.reset}`
        : `${C.red}MISSING${C.reset}`;
      lines.push(`    ${name.padEnd(28)} ${state}`);
    } else if (v && typeof v === "object") {
      lines.push(...flattenIntegrations(v, name));
    }
  }
  return lines;
}

function assertPersona(persona, ad, map) {
  const checks = [];
  const add = (name, pass, detail) => checks.push({ name, pass, detail });

  if (ad == null) {
    add(
      "affect-dynamics present",
      false,
      "affectDynamics is null — EMOTIONAL_MAP_OU kill-switch may be off in prod",
    );
    return checks;
  }

  if (persona === "new") {
    add(
      "affect-dynamics gathering (new account)",
      ad.status === "gathering",
      `status=${ad.status} · nObs=${ad.nObs}/${ad.needed}`,
    );
    return checks;
  }

  add(
    "affect-dynamics active",
    ad.status === "active",
    `status=${ad.status} · nObs=${ad.nObs}`,
  );
  if (ad.status !== "active") return checks;

  add("baseline present", ad.baseline != null, `baseline=${pct(ad.baseline)}`);

  // Per-axis gating is data-driven (Etapa 1).
  const gated = ad.nObs < ad.recoveryNeeded;
  if (gated) {
    add(
      "recovery/inertia gated (null before recoveryNeeded)",
      ad.recovery == null && ad.inertiaDays == null,
      `nObs=${ad.nObs} < recoveryNeeded=${ad.recoveryNeeded}`,
    );
  } else {
    add(
      "recovery/inertia unlocked",
      ad.recovery != null && ad.inertiaDays != null,
      `nObs=${ad.nObs} >= recoveryNeeded=${ad.recoveryNeeded} · recovery=${pct(ad.recovery)} · inertia=${ad.inertiaDays}d`,
    );
  }

  if (persona === "stable") {
    add(
      "stable persona reads MEANINGFULLY stable (>40%)",
      (ad.stability ?? 0) > 0.4,
      `stability=${pct(ad.stability)}`,
    );
  } else if (persona === "volatile") {
    add(
      "volatile persona reads UNSTABLE (<35%)",
      (ad.stability ?? 1) < 0.35,
      `stability=${pct(ad.stability)}`,
    );
  } else if (persona === "improving" || persona === "declining") {
    // Trending personas: OU (v0) reads low stability by design (documented
    // limit → Etapa 4). We only assert the axis is populated and active.
    add(
      "trending persona active with a stability estimate",
      ad.stability != null,
      `stability=${pct(ad.stability)} (low is expected for trends — Etapa 4)`,
    );
  }
  return checks;
}

async function main() {
  const args = parseArgs(process.argv);
  const api = args.api;
  if (!api) {
    console.error(bad("--api is required (e.g. --api=https://xxx.up.railway.app)"));
    process.exit(2);
  }
  let token = args.token || null;
  let failures = 0;

  // ── Fase 0.1 — deploy alive ──────────────────────────────────────────────
  console.log(head("Fase 0 · deploy"));
  const health = await req("GET", joinUrl(api, "/api/health"));
  if (health.status === 200) {
    console.log(ok(`GET /api/health → 200`));
  } else {
    console.log(bad(`GET /api/health → ${health.status} (¿deploy caído o URL mala?)`));
    failures++;
  }

  // ── Auth (register optional, then login) ─────────────────────────────────
  if (!token && args.register && args.email && args.password) {
    const reg = await req("POST", joinUrl(api, "/api/auth/register"), {
      body: {
        email: args.email,
        password: args.password,
        name: args.name || "E2E Test",
      },
    });
    if (reg.status === 201 || reg.status === 200) {
      console.log(ok(`register ${args.email} → creado`));
    } else if (reg.status === 409) {
      console.log(warn(`register ${args.email} → ya existe (ok)`));
    } else {
      console.log(warn(`register ${args.email} → ${reg.status} ${JSON.stringify(reg.json?.message ?? reg.json)}`));
    }
  }
  if (!token && args.email && args.password) {
    const login = await req("POST", joinUrl(api, "/api/auth/login"), {
      body: { email: args.email, password: args.password },
    });
    if (login.status === 200 && login.json?.accessToken) {
      token = login.json.accessToken;
      console.log(ok(`login ${args.email} → token`));
    } else {
      console.log(bad(`login ${args.email} → ${login.status} ${JSON.stringify(login.json?.message ?? login.json)}`));
      failures++;
    }
  }

  // ── Fase 0.2 — integrations (ADMIN only) ─────────────────────────────────
  if (token) {
    console.log(head("Fase 0 · integraciones (necesita cuenta ADMIN)"));
    const integ = await req("GET", joinUrl(api, "/api/health/integrations"), { token });
    if (integ.status === 200) {
      console.log(ok("GET /api/health/integrations → 200"));
      for (const line of flattenIntegrations(integ.json)) console.log(line);
      console.log(
        `    ${C.dim}Para el mapa importan: anthropic (ejes IA) y redis (cache + bust del seed).${C.reset}`,
      );
    } else if (integ.status === 403) {
      console.log(warn("GET /api/health/integrations → 403 · esta cuenta no es ADMIN (corre este check con una cuenta ADMIN)"));
    } else {
      console.log(warn(`GET /api/health/integrations → ${integ.status}`));
    }
  }

  // ── Fase 2 — emotional map ───────────────────────────────────────────────
  if (token) {
    console.log(head("Fase 2 · mapa emocional"));
    const map = await req("GET", joinUrl(api, "/api/emotional-map"), { token });
    if (map.status !== 200) {
      console.log(bad(`GET /api/emotional-map → ${map.status}`));
      failures++;
    } else {
      const m = map.json;
      const ad = m.affectDynamics;
      console.log(
        ok(
          `GET /api/emotional-map → 200 · pct=${m.pct}% · coverage=${pct(m.coverage)} · provider=${m.provider}`,
        ),
      );
      console.log(`    ${C.dim}dimensiones:${C.reset}`);
      for (const d of m.dimensions ?? []) {
        const covered = d.confidence >= 0.15;
        console.log(
          `      ${d.key.padEnd(12)} ${covered ? pct(d.value).padStart(4) : "reuniendo"} ${C.dim}(conf ${pct(d.confidence)})${C.reset}`,
        );
      }
      console.log(`    ${C.dim}dinámica afectiva:${C.reset}`);
      if (ad == null) {
        console.log(`      ${warn("affectDynamics = null (kill-switch EMOTIONAL_MAP_OU off?)")}`);
      } else if (ad.status === "gathering") {
        console.log(`      status=gathering · ${ad.nObs}/${ad.needed} registros`);
      } else {
        console.log(
          `      status=active · nObs=${ad.nObs} · conf=${pct(ad.confidence)}`,
        );
        console.log(
          `      tono=${pct(ad.baseline)} · recup=${ad.recovery == null ? "gate" : pct(ad.recovery)} · estab=${pct(ad.stability)} · inercia=${ad.inertiaDays == null ? "gate" : ad.inertiaDays + "d"}`,
        );
      }

      if (args.persona) {
        console.log(`    ${C.dim}aserciones (persona=${args.persona}):${C.reset}`);
        for (const c of assertPersona(String(args.persona), ad, m)) {
          console.log(`      ${c.pass ? ok(c.name) : bad(c.name)} ${C.dim}${c.detail}${C.reset}`);
          if (!c.pass) failures++;
        }
      }
    }
  }

  console.log(
    failures === 0
      ? head("RESULTADO: ") + ok("todo verde")
      : head("RESULTADO: ") + bad(`${failures} fallo(s)`),
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(bad(e?.message ?? String(e)));
  process.exit(1);
});
