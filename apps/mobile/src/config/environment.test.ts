// `@types/node` is not installed in this workspace — the other tests mount
// components and never touch the filesystem. Following the precedent in
// `app/(tabs)/evolucion-copy-contract.test.ts`, the minimum Jest already
// provides at runtime is declared here instead of adding a dependency for a
// handful of source ratchets.
declare const __dirname: string;
declare function require(id: "fs"): {
  readFileSync(path: string, encoding: "utf8"): string;
};

import {
  MobileEnvironmentError,
  STAGING_API_ORIGIN,
  STAGING_WEB_ORIGIN,
  resolveMobileEnvironment,
} from "./environment";

/**
 * The mobile app's environment is configuration, so it gets tested like code.
 *
 * ── What this is defending ────────────────────────────────────────────────
 *
 * Before this module, `EXPO_PUBLIC_API_URL` was read in three places, each with
 * its own `?? ""`. With the variable unset, `auth.tsx` composed the base URL
 * `"/api"` and `assetUrl()` returned its input unchanged — and because React
 * Native has no document origin, the app booted fine and then failed every
 * request as an opaque network error. "Where is my API" is answerable from one
 * place now, and a wrong answer stops the app while somebody is watching.
 *
 * The accident this specifically prevents: `apps/mobile/.env` points at the
 * Railway API — frozen legacy production — so the DEFAULT way to run the app is
 * also the way to run QA against production. A staging build that silently went
 * there would be indistinguishable from one that worked.
 */

const STAGING = {
  EXPO_PUBLIC_APP_ENV: "staging",
  EXPO_PUBLIC_API_URL: STAGING_API_ORIGIN,
  EXPO_PUBLIC_WEB_ORIGIN: STAGING_WEB_ORIGIN,
} as const;

describe("mobile environment · the staging profile", () => {
  it("resolves the pinned staging origins", () => {
    const env = resolveMobileEnvironment({ ...STAGING });
    expect(env.appEnv).toBe("staging");
    expect(env.apiOrigin).toBe("https://api-staging.feelverse.app");
    expect(env.webOrigin).toBe("https://staging.feelverse.app");
  });

  it("fails when the API URL is missing", () => {
    expect(() =>
      resolveMobileEnvironment({
        EXPO_PUBLIC_APP_ENV: "staging",
        EXPO_PUBLIC_WEB_ORIGIN: STAGING_WEB_ORIGIN,
      }),
    ).toThrow(/EXPO_PUBLIC_API_URL is not set/);
  });

  it("fails when the API URL is present but empty or blank", () => {
    for (const value of ["", "   "]) {
      expect(() =>
        resolveMobileEnvironment({ ...STAGING, EXPO_PUBLIC_API_URL: value }),
      ).toThrow(/EXPO_PUBLIC_API_URL is not set/);
    }
  });

  it.each([
    "https://psico-platform-production.up.railway.app",
    "https://psico-platform-web.vercel.app",
    "https://anything.up.railway.app",
  ])("REFUSES the frozen legacy host %s", (url) => {
    // The exact accident: the developer's .env holds a Railway URL, so without
    // this a staging profile that failed to override it would run against
    // legacy production and look perfectly healthy.
    let caught: unknown;
    try {
      resolveMobileEnvironment({ ...STAGING, EXPO_PUBLIC_API_URL: url });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(MobileEnvironmentError);
    expect(String((caught as Error).message)).toMatch(/frozen legacy/);
  });

  it("refuses plain http outside development", () => {
    expect(() =>
      resolveMobileEnvironment({
        ...STAGING,
        EXPO_PUBLIC_API_URL: "http://api-staging.feelverse.app",
      }),
    ).toThrow(/must use https/);
  });

  it("refuses any other host, even a plausible https one", () => {
    // Staging is PINNED, not merely validated. "Looks like a URL" is not the
    // property we want from a staging build.
    expect(() =>
      resolveMobileEnvironment({
        ...STAGING,
        EXPO_PUBLIC_API_URL: "https://api.feelverse.app",
      }),
    ).toThrow(/must talk to https:\/\/api-staging\.feelverse\.app/);
  });

  it("refuses a web origin that is not staging's", () => {
    expect(() =>
      resolveMobileEnvironment({
        ...STAGING,
        EXPO_PUBLIC_WEB_ORIGIN: "https://psico-platform-web.vercel.app",
      }),
    ).toThrow(/frozen legacy/);
    expect(() =>
      resolveMobileEnvironment({
        EXPO_PUBLIC_APP_ENV: "staging",
        EXPO_PUBLIC_API_URL: STAGING_API_ORIGIN,
      }),
    ).toThrow(/must use https:\/\/staging\.feelverse\.app/);
  });
});

describe("mobile environment · normalization", () => {
  it("strips a trailing slash", () => {
    const env = resolveMobileEnvironment({
      ...STAGING,
      EXPO_PUBLIC_API_URL: `${STAGING_API_ORIGIN}/`,
    });
    expect(env.apiOrigin).toBe(STAGING_API_ORIGIN);
  });

  it("strips several trailing slashes", () => {
    const env = resolveMobileEnvironment({
      ...STAGING,
      EXPO_PUBLIC_API_URL: `${STAGING_API_ORIGIN}///`,
    });
    expect(env.apiOrigin).toBe(STAGING_API_ORIGIN);
  });

  it("tolerates surrounding whitespace", () => {
    const env = resolveMobileEnvironment({
      ...STAGING,
      EXPO_PUBLIC_API_URL: `  ${STAGING_API_ORIGIN}  `,
    });
    expect(env.apiOrigin).toBe(STAGING_API_ORIGIN);
  });

  it("REFUSES a duplicated /api segment", () => {
    // The shared client appends `/api` itself (`apiClient.configure`), so this
    // would produce `/api/api/...` — a 404 that reads like a missing endpoint.
    expect(() =>
      resolveMobileEnvironment({
        ...STAGING,
        EXPO_PUBLIC_API_URL: `${STAGING_API_ORIGIN}/api`,
      }),
    ).toThrow(/no path/);
  });

  it("refuses a relative value", () => {
    expect(() =>
      resolveMobileEnvironment({ ...STAGING, EXPO_PUBLIC_API_URL: "/api" }),
    ).toThrow(/absolute URL/);
  });

  it("refuses a bare hostname with no scheme", () => {
    expect(() =>
      resolveMobileEnvironment({
        ...STAGING,
        EXPO_PUBLIC_API_URL: "api-staging.feelverse.app",
      }),
    ).toThrow(/absolute URL/);
  });

  it("refuses a non-http scheme", () => {
    expect(() =>
      resolveMobileEnvironment({
        ...STAGING,
        EXPO_PUBLIC_API_URL: "ftp://api-staging.feelverse.app",
      }),
    ).toThrow(/http or https/);
  });
});

describe("mobile environment · development", () => {
  it("defaults to development when APP_ENV is unset", () => {
    // Safe as a default because development is the posture with the FEWEST
    // powers: it is the only one allowed http or a LAN address, and it claims
    // nothing about which database it reaches. The staging profile sets the
    // variable explicitly, so "unset" can never mean "staging".
    const env = resolveMobileEnvironment({
      EXPO_PUBLIC_API_URL: "http://localhost:3001",
    });
    expect(env.appEnv).toBe("development");
    expect(env.apiOrigin).toBe("http://localhost:3001");
  });

  it.each([
    "http://localhost:3001",
    "http://127.0.0.1:3001",
    "http://192.168.1.5:3001",
    "https://localhost:3001",
  ])("allows the explicit local address %s", (url) => {
    const env = resolveMobileEnvironment({
      EXPO_PUBLIC_APP_ENV: "development",
      EXPO_PUBLIC_API_URL: url,
    });
    expect(env.apiOrigin).toBe(url);
  });

  it("still requires the API URL in development", () => {
    expect(() =>
      resolveMobileEnvironment({ EXPO_PUBLIC_APP_ENV: "development" }),
    ).toThrow(/EXPO_PUBLIC_API_URL is not set/);
  });

  it("does NOT block a legacy host in development", () => {
    // Deliberate: the developer's own .env points there, and refusing it would
    // break the only workflow they currently have. The staging profile is what
    // makes the safe path available; this check is not the place to take the
    // existing one away.
    const env = resolveMobileEnvironment({
      EXPO_PUBLIC_APP_ENV: "development",
      EXPO_PUBLIC_API_URL: "https://psico-platform-production.up.railway.app",
    });
    expect(env.apiOrigin).toBe(
      "https://psico-platform-production.up.railway.app",
    );
  });

  it("leaves the web origin null when nothing declares one", () => {
    const env = resolveMobileEnvironment({
      EXPO_PUBLIC_API_URL: "http://localhost:3001",
    });
    expect(env.webOrigin).toBeNull();
  });
});

describe("mobile environment · production fails closed", () => {
  it("requires an explicit API URL", () => {
    expect(() =>
      resolveMobileEnvironment({ EXPO_PUBLIC_APP_ENV: "production" }),
    ).toThrow(/A production build must declare it explicitly/);
  });

  it("refuses the frozen Railway host", () => {
    // Railway must not be institutionalized as the mobile production target.
    expect(() =>
      resolveMobileEnvironment({
        EXPO_PUBLIC_APP_ENV: "production",
        EXPO_PUBLIC_API_URL: "https://psico-platform-production.up.railway.app",
      }),
    ).toThrow(/frozen legacy/);
  });

  it("refuses http", () => {
    expect(() =>
      resolveMobileEnvironment({
        EXPO_PUBLIC_APP_ENV: "production",
        EXPO_PUBLIC_API_URL: "http://api.feelverse.app",
      }),
    ).toThrow(/must use https/);
  });

  it("is not pinned to a host yet, so a future domain resolves", () => {
    // Production is NOT pinned the way staging is, because Coolify production
    // has no domain. When it does, pin it here.
    const env = resolveMobileEnvironment({
      EXPO_PUBLIC_APP_ENV: "production",
      EXPO_PUBLIC_API_URL: "https://api.feelverse.app",
    });
    expect(env.apiOrigin).toBe("https://api.feelverse.app");
  });
});

describe("mobile environment · APP_ENV validation", () => {
  it.each(["prod", "stage", "Staging ", "live", "qa", "test"])(
    "refuses %s",
    (value) => {
      // `Staging ` with a trailing space is accepted after normalization; the
      // rest are not. Listed together so the normalization is visible.
      const call = () =>
        resolveMobileEnvironment({
          EXPO_PUBLIC_APP_ENV: value,
          EXPO_PUBLIC_API_URL: STAGING_API_ORIGIN,
          EXPO_PUBLIC_WEB_ORIGIN: STAGING_WEB_ORIGIN,
        });
      if (value.trim().toLowerCase() === "staging") expect(call).not.toThrow();
      else expect(call).toThrow(/EXPO_PUBLIC_APP_ENV must be one of/);
    },
  );

  it.each(["development", "staging", "production"])("accepts %s", (value) => {
    const env: Record<string, string> = {
      EXPO_PUBLIC_APP_ENV: value,
      EXPO_PUBLIC_API_URL:
        value === "staging" ? STAGING_API_ORIGIN : "https://api.feelverse.app",
    };
    if (value === "staging") env.EXPO_PUBLIC_WEB_ORIGIN = STAGING_WEB_ORIGIN;
    expect(resolveMobileEnvironment(env).appEnv).toBe(value);
  });

  it("is case-insensitive", () => {
    // Written with the spread FIRST and the override after it. The other order
    // declared the key twice, so the spread won and this asserted nothing —
    // caught by `tsc` (TS2783), not by the test passing.
    expect(
      resolveMobileEnvironment({
        ...STAGING,
        EXPO_PUBLIC_APP_ENV: "STAGING",
      }).appEnv,
    ).toBe("staging");
    expect(
      resolveMobileEnvironment({
        ...STAGING,
        EXPO_PUBLIC_APP_ENV: "  Staging  ",
      }).appEnv,
    ).toBe("staging");
  });
});

describe("mobile environment · the refusals leak nothing", () => {
  it("carries no token, secret or DSN", () => {
    for (const env of [
      { EXPO_PUBLIC_APP_ENV: "staging" },
      { EXPO_PUBLIC_APP_ENV: "production" },
      { EXPO_PUBLIC_APP_ENV: "nonsense", EXPO_PUBLIC_API_URL: "x" },
    ]) {
      let caught: unknown;
      try {
        resolveMobileEnvironment({
          ...env,
          EXPO_PUBLIC_SENTRY_DSN: "https://abc@o1.ingest.sentry.io/2",
        });
      } catch (err) {
        caught = err;
      }
      const message = String((caught as Error).message);
      expect(message).not.toMatch(/sentry\.io/);
      expect(message).not.toMatch(/TOKEN|PASSWORD|SECRET|DSN/i);
    }
  });
});

describe("mobile config · source ratchets", () => {
  const root = `${__dirname}/../..`;
  const read = (p: string) =>
    require("fs").readFileSync(`${root}/${p}`, "utf8");
  /** Executable text only, so prose naming a legacy host stays allowed. */
  const code = (p: string) =>
    read(p)
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/[^\n]*/g, "");

  it("the wrapper's origins match the app's", () => {
    // The mirror, kept honest. The wrapper is plain `.mjs` and cannot import
    // the TypeScript the app validates against, so if these drifted the wrapper
    // would hand Expo an origin the app then rejects — a confusing failure in
    // the one command meant to be foolproof.
    const wrapper = read("scripts/start-profile.mjs");
    expect(wrapper).toContain(`"${STAGING_API_ORIGIN}"`);
    expect(wrapper).toContain(`"${STAGING_WEB_ORIGIN}"`);
  });

  it("the wrapper has no production urls", () => {
    // §7: production fails closed until Coolify production has a domain.
    const wrapper = code("scripts/start-profile.mjs");
    expect(wrapper).toMatch(/env: null/);
    // No legacy HOST, as a destination. The word "Railway" does appear — in the
    // message explaining why there is no production profile yet, which is the
    // sentence that stops somebody from inventing one. A ratchet on the word
    // would have cost that explanation and bought nothing: what must never
    // appear is a URL.
    expect(wrapper).not.toMatch(/https?:\/\/[^"'`\s]*up\.railway\.app/);
    expect(wrapper).not.toMatch(/https?:\/\/[^"'`\s]*vercel\.app/);
  });

  it("no mobile source hardcodes a Railway or Vercel host", () => {
    for (const p of [
      "src/context/auth.tsx",
      "src/components/dashboard/eco/EcoChat.tsx",
      "src/lib/asset-url.ts",
      "src/observability/sentry.ts",
      "app/(tabs)/plan.tsx",
      "app/(tabs)/terapia/terapeutas/[id]/reservar.tsx",
      "src/components/dashboard/plan/SubscriptionActions.tsx",
    ]) {
      const src = code(p);
      expect(src).not.toMatch(/up\.railway\.app/);
      expect(src).not.toMatch(/\.vercel\.app/);
      // `psico.app` was the other hardcoded identity — and not even the
      // product's domain any more.
      expect(src).not.toMatch(/psico\.app/);
    }
  });

  it("nothing re-parses the API URL outside config/environment", () => {
    for (const p of [
      "src/context/auth.tsx",
      "src/components/dashboard/eco/EcoChat.tsx",
      "src/lib/asset-url.ts",
    ]) {
      const src = code(p);
      expect(src).not.toMatch(/EXPO_PUBLIC_API_URL/);
      // No `?? ""` DEFAULT FOR AN ORIGIN — the silent empty-string default that
      // produced a relative "/api" and an opaque network error. Narrowed to
      // origin-ish identifiers on purpose: `auth.tsx` legitimately has
      // `stored.accessToken ?? ""`, and a blanket ban would have made this
      // ratchet about coding style instead of about the defect.
      expect(src).not.toMatch(
        /(API_URL|API_ROOT|API_BASE|apiUrl|apiRoot|origin)\s*=[^;\n]*\?\?\s*""/i,
      );
      expect(src).toMatch(/apiOrigin\(\)/);
    }
  });

  it("Sentry takes its environment from the app, not from Vercel", () => {
    const src = code("src/observability/sentry.ts");
    expect(src).not.toMatch(/EXPO_PUBLIC_VERCEL_ENV/);
    expect(src).toMatch(/environment: appEnvironment\(\)/);
    // And the privacy hard-offs stay exactly as they were.
    expect(src).toMatch(/attachScreenshot: false/);
    expect(src).toMatch(/attachViewHierarchy: false/);
    expect(src).toMatch(/sendDefaultPii: false/);
    expect(src).not.toMatch(/replaysSessionSampleRate|enableAutoPerformance/);
  });

  it("the staging API origin is declared once, in config", () => {
    const envSrc = read("src/config/environment.ts");
    expect(envSrc).toContain(`export const STAGING_API_ORIGIN = `);
    // Exactly one definition, so there is one answer to "where is staging".
    expect(envSrc.match(/STAGING_API_ORIGIN =/g)).toHaveLength(1);
  });
});
