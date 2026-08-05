/**
 * Reader + dashboard responsive assertions, measured in a real browser.
 *
 * Why this is not a Vitest/jsdom test: jsdom does not lay anything out. Every
 * number that matters here — `window.innerWidth`, `document.scrollWidth`, a
 * bounding box, whether a control is inside the viewport, whether a click lands
 * on the element you aimed at — is zero or meaningless without a layout engine.
 * A jsdom test that claimed «the sidebar is hidden on a phone» would be
 * asserting nothing. So this runs Chrome.
 *
 * It is deliberately OUT of the default `pnpm test` graph: Playwright browsers
 * are a heavy install and the repo's CI does not provision them. Run it against
 * a stack you already have up:
 *
 *   pnpm --filter @psico/web test:responsive
 *
 * with, at minimum:
 *
 *   E2E_BASE_URL   web origin        (default http://localhost:3010)
 *   E2E_EMAIL      account to log in (required)
 *   E2E_PASSWORD   its password      (required)
 *   E2E_BOOK_SLUG  reader book slug  (default emociones-en-construccion)
 *   E2E_CHAPTER    reader chapter    (default 1)
 *
 * Credentials are env-only on purpose: no account of any kind is committed
 * here, and the run aborts loudly rather than guessing one.
 *
 * The transcript state needs a podcast master, which does not exist yet. That
 * one state is driven by a LOCAL fixture response — an invented key and a
 * localhost URL, never a real Cloudflare Stream UID, R2 object or signed URL.
 */

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3010";
const EMAIL = process.env.E2E_EMAIL;
const PASSWORD = process.env.E2E_PASSWORD;
const BOOK = process.env.E2E_BOOK_SLUG ?? "emociones-en-construccion";
const CHAPTER = process.env.E2E_CHAPTER ?? "1";
const READER = `${BASE}/dashboard/biblioteca/${BOOK}/lector/${CHAPTER}`;

/** Below this width the shell must be a drawer, above it a fixed sidebar. */
const COMPACT_MAX = 1023;

const VIEWPORTS = [
  { w: 390, h: 844, mobile: true },
  { w: 768, h: 1024, mobile: true },
  { w: 1365, h: 900, mobile: false },
];

const PODCAST_FIXTURE = {
  kind: "PODCAST",
  mediaKey: "eec-c1-podcast-v1",
  mediaVersion: 1,
  url: `${BASE}/e2e-fixture-podcast.mp3`,
  expiresAt: new Date(2_000_000_000_000).toISOString(),
  transcriptUrl: `${BASE}/e2e-fixture-transcript.md`,
  posterUrl: null,
};

if (!EMAIL || !PASSWORD) {
  console.error(
    "E2E_EMAIL and E2E_PASSWORD are required. See the header of this file.",
  );
  process.exit(2);
}

let chromium;
try {
  ({ chromium } = await import("playwright"));
} catch {
  console.error(
    "playwright is not installed in this environment.\n" +
      "Install it outside the repo (it is intentionally not a dependency):\n" +
      "  npm i -g playwright && playwright install chrome",
  );
  process.exit(2);
}

// ── the measurement, evaluated in the page ──────────────────────────────────
const MEASURE = `(() => {
  const box = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return {
      x: Math.round(r.x), y: Math.round(r.y),
      w: Math.round(r.width), h: Math.round(r.height),
      left: Math.round(r.left), right: Math.round(r.right),
      display: cs.display, visibility: cs.visibility,
    };
  };
  const overlaps = (a, b) => {
    const ea = document.querySelector(a), eb = document.querySelector(b);
    if (!ea || !eb) return false;
    const ra = ea.getBoundingClientRect(), rb = eb.getBoundingClientRect();
    return !(ra.right <= rb.left || rb.right <= ra.left ||
             ra.bottom <= rb.top || rb.bottom <= ra.top);
  };
  // Anything the person has to be able to reach on this screen.
  const controls = [...document.querySelectorAll(
    '.topbar button, .topbar a, .nav-toggle, [role="tab"], .screen button, .screen a, audio'
  )].filter((el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return r.width > 0 && r.height > 0 &&
      cs.visibility !== "hidden" && cs.display !== "none";
  });
  const outside = controls
    .map((el) => ({ el, r: el.getBoundingClientRect() }))
    .filter(({ r }) => r.left < -1 || r.right > window.innerWidth + 1)
    .map(({ el, r }) => ({
      tag: el.tagName.toLowerCase(),
      label: (el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 32),
      left: Math.round(r.left), right: Math.round(r.right),
    }));
  // A control is "intercepted" when the topmost element at its own centre is
  // neither itself nor one of its children — i.e. a tap would hit something
  // else. This is the measurable form of "the button is there but unusable".
  const intercepted = controls
    .filter((el) => {
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      if (cx < 0 || cy < 0 || cx > window.innerWidth || cy > window.innerHeight) return false;
      const hit = document.elementFromPoint(cx, cy);
      return !(hit && (hit === el || el.contains(hit) || hit.contains(el)));
    })
    .map((el) => (el.getAttribute("aria-label") || el.textContent || el.tagName).trim().slice(0, 32));
  const side = document.querySelector(".side");
  const sidebarDesktopVisible = (() => {
    if (!side) return false;
    const cs = getComputedStyle(side);
    if (cs.display === "none" || cs.visibility === "hidden") return false;
    const r = side.getBoundingClientRect();
    // A drawer parked off-canvas occupies no visible column.
    return r.width > 0 && r.right > 1;
  })();
  // A strip may scroll inside itself; it may not be clipped with content lost
  // and it may not widen the page. Report both numbers.
  const strip = (label) => {
    const el = document.querySelector('[role="tablist"][aria-label="' + label + '"]');
    if (!el) return null;
    const active = el.querySelector('[aria-selected="true"]');
    const er = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return {
      w: Math.round(er.width),
      hidden: Math.max(0, el.scrollWidth - el.clientWidth),
      scrollable: cs.overflowX === "auto" || cs.overflowX === "scroll",
      tabs: el.querySelectorAll('[role="tab"]').length,
      activeInsideViewport: active
        ? (() => {
            const ar = active.getBoundingClientRect();
            return ar.left >= -1 && ar.right <= window.innerWidth + 1;
          })()
        : null,
    };
  };
  const contentWidth = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const cs = getComputedStyle(el);
    return Math.round(
      el.getBoundingClientRect().width -
        parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) -
        parseFloat(cs.borderLeftWidth) - parseFloat(cs.borderRightWidth),
    );
  };
  const mainStyle = (() => {
    const el = document.querySelector(".main");
    if (!el) return null;
    const cs = getComputedStyle(el);
    return { minWidth: cs.minWidth, width: cs.width };
  })();
  // The audiobook transcript. Reported as null when the state under test does
  // not show one, so the assertions below simply skip rather than invent.
  const transcript = (() => {
    const region = document.querySelector('#audio-transcript-region');
    const heading = document.querySelector('#audio-transcript-heading');
    if (!region || !heading) return null;
    const segs = [...region.querySelectorAll('[data-testid^="transcript-segment-"]')];
    const rr = region.getBoundingClientRect();
    const audioEl = document.querySelector('[data-gr2="media-surface"] audio')
      ?? document.querySelector('audio');
    return {
      region: { y: Math.round(rr.y), left: Math.round(rr.left), right: Math.round(rr.right) },
      playerBottom: audioEl
        ? Math.round(audioEl.getBoundingClientRect().bottom)
        : null,
      headingY: Math.round(heading.getBoundingClientRect().y),
      segments: segs.length,
      // A segment wider than the box it sits in means the sentence is cut off
      // sideways — the failure this check exists for.
      clippedSideways: segs.filter((el) => el.scrollWidth > el.clientWidth + 1).length,
      // Every segment must be a real, tappable, on-screen control.
      outsideX: segs.filter((el) => {
        const r = el.getBoundingClientRect();
        return r.left < -1 || r.right > window.innerWidth + 1;
      }).length,
      shortestTapTarget: segs.length
        ? Math.round(Math.min(...segs.map((el) => el.getBoundingClientRect().height)))
        : null,
      // The region may scroll inside itself; that is the design. What it may
      // not do is widen the page.
      selfScrollsY: region.scrollHeight > region.clientHeight,
      overflowsX: region.scrollWidth > region.clientWidth + 1,
    };
  })();
  return {
    innerWidth: window.innerWidth,
    docScrollWidth: document.documentElement.scrollWidth,
    bodyScrollWidth: document.body.scrollWidth,
    sidebarDesktopVisible,
    navToggleVisible: !!document.querySelector(".nav-toggle") &&
      getComputedStyle(document.querySelector(".nav-toggle")).display !== "none",
    main: box(".main"),
    mainStyle,
    headerOverlap: overlaps(".tb-search", '[data-gr2="mood-chip"]'),
    modeStrip: strip("Modo de lectura"),
    mediaStrip: strip("Formato de audio"),
    mediaSurface: box('[data-gr2="media-surface"]'),
    audio: box('[data-gr2="media-surface"] audio'),
    ecoCardContentWidth: contentWidth('[data-gr2="eco-card"]'),
    transcript,
    controlsOutsideViewport: outside,
    clickTargetsIntercepted: intercepted,
  };
})()`;

// ── tiny assertion runner ───────────────────────────────────────────────────
let failures = 0;
let checks = 0;
let skipped = 0;
function check(label, ok, detail) {
  checks += 1;
  if (ok) return;
  failures += 1;
  console.error(`  ✗ ${label}${detail === undefined ? "" : ` — ${detail}`}`);
}

/** Every state, at every viewport, must satisfy these. */
function assertUniversal(where, m) {
  const compact = m.innerWidth <= COMPACT_MAX;
  check(
    `${where}: document does not scroll horizontally`,
    m.docScrollWidth === m.innerWidth,
    `docScrollWidth=${m.docScrollWidth} innerWidth=${m.innerWidth}`,
  );
  check(
    `${where}: body does not exceed the viewport`,
    m.bodyScrollWidth <= m.innerWidth,
    `bodyScrollWidth=${m.bodyScrollWidth}`,
  );
  check(
    `${where}: main starts at or after the left edge`,
    m.main !== null && m.main.left >= 0,
    m.main ? `left=${m.main.left}` : "no .main",
  );
  check(
    `${where}: main ends at or before the right edge`,
    m.main !== null && m.main.right <= m.innerWidth,
    m.main ? `right=${m.main.right}` : "no .main",
  );
  check(
    `${where}: every primary control is inside the viewport`,
    m.controlsOutsideViewport.length === 0,
    JSON.stringify(m.controlsOutsideViewport),
  );
  check(
    `${where}: no control is intercepted by something on top of it`,
    m.clickTargetsIntercepted.length === 0,
    JSON.stringify(m.clickTargetsIntercepted),
  );
  check(
    `${where}: header controls do not overlap`,
    m.headerOverlap === false,
  );
  if (compact) {
    check(
      `${where}: the desktop sidebar is not shown`,
      m.sidebarDesktopVisible === false,
    );
    check(`${where}: a nav button exists instead`, m.navToggleVisible === true);
    check(
      `${where}: main is full width with no min-width floor`,
      m.mainStyle?.minWidth === "0px" &&
        Math.round(parseFloat(m.mainStyle.width)) === m.innerWidth,
      JSON.stringify(m.mainStyle),
    );
  } else {
    check(
      `${where}: the sidebar is shown on a desktop width`,
      m.sidebarDesktopVisible === true,
    );
  }
  for (const [name, strip] of [
    ["mode selector", m.modeStrip],
    ["audio format selector", m.mediaStrip],
  ]) {
    if (!strip) continue;
    check(
      `${where}: ${name} keeps every tab reachable`,
      strip.hidden === 0 || strip.scrollable,
      JSON.stringify(strip),
    );
    check(
      `${where}: ${name} active tab is inside the viewport`,
      strip.activeInsideViewport !== false,
      JSON.stringify(strip),
    );
  }
  if (m.mediaSurface) {
    check(
      `${where}: the media surface fits the viewport`,
      m.mediaSurface.left >= 0 && m.mediaSurface.right <= m.innerWidth,
      JSON.stringify(m.mediaSurface),
    );
  }
  if (m.audio) {
    check(
      `${where}: the player is inside the viewport`,
      m.audio.left >= 0 && m.audio.right <= m.innerWidth,
      JSON.stringify(m.audio),
    );
  }
  if (m.transcript) {
    const t = m.transcript;
    check(
      `${where}: the transcript sits below the player`,
      t.playerBottom === null || t.headingY >= t.playerBottom - 1,
      JSON.stringify({ headingY: t.headingY, playerBottom: t.playerBottom }),
    );
    check(
      `${where}: the transcript fits the viewport sideways`,
      t.region.left >= 0 && t.region.right <= m.innerWidth,
      JSON.stringify(t.region),
    );
    check(
      `${where}: no transcript line is cut off sideways`,
      t.clippedSideways === 0 && t.overflowsX === false,
      JSON.stringify({ clipped: t.clippedSideways, overflowsX: t.overflowsX }),
    );
    check(
      `${where}: every transcript segment is inside the viewport`,
      t.outsideX === 0,
      `outside=${t.outsideX}`,
    );
    check(
      `${where}: transcript segments are tappable`,
      t.shortestTapTarget === null || t.shortestTapTarget >= 44,
      `shortest=${t.shortestTapTarget}`,
    );
  }
  if (m.ecoCardContentWidth !== null) {
    // Enough room for a line of Spanish prose, not a one-word column.
    check(
      `${where}: the Eco card is not collapsed word-by-word`,
      m.ecoCardContentWidth >= 220,
      `contentWidth=${m.ecoCardContentWidth}`,
    );
  }
}

const browser = await chromium.launch({ channel: "chrome" }).catch(() =>
  chromium.launch(),
);

// One login, reused: the API throttles /auth/login per IP (5 per 15 minutes).
// Across RUNS too — iterating on this file used to burn the whole allowance in
// a few minutes and then fail at the login step, which reads like a broken app
// and is not. So a recent session is reused unless E2E_FORCE_LOGIN says
// otherwise. Anything older than the window is treated as stale.
const statePath = `${process.env.TMPDIR ?? "/tmp"}/psico-e2e-responsive-state.json`;
const SESSION_MAX_AGE_MS = 15 * 60 * 1000;
const reusable = await (async () => {
  if (process.env.E2E_FORCE_LOGIN === "1") return false;
  try {
    const { statSync } = await import("node:fs");
    return Date.now() - statSync(statePath).mtimeMs < SESSION_MAX_AGE_MS;
  } catch {
    return false;
  }
})();
if (reusable) {
  console.log("reusing the saved session (E2E_FORCE_LOGIN=1 to log in again)");
} else {
  const ctx = await browser.newContext({ viewport: { width: 1365, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/dashboard/, { timeout: 40_000 });
  await ctx.storageState({ path: statePath });
  await ctx.close();
}

for (const vp of VIEWPORTS) {
  const ctx = await browser.newContext({
    viewport: { width: vp.w, height: vp.h },
    deviceScaleFactor: 2,
    isMobile: vp.mobile,
    hasTouch: vp.mobile,
    storageState: statePath,
  });
  const page = await ctx.newPage();
  console.log(`\n${vp.w}×${vp.h}`);

  // A hydration mismatch throws the server HTML away and, in development, puts
  // an error indicator on screen — which is exactly how a misleading capture
  // got into the evidence set once. Collect them per state and assert on zero.
  const consoleErrors = [];
  const pageErrors = [];
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(m.text().slice(0, 200));
  });
  page.on("pageerror", (e) => pageErrors.push(String(e).slice(0, 200)));

  /**
   * Returns false when the mode simply is not offered to this account — a
   * hidden mode is a legitimate entitlement outcome (PRO_ONLY media, a book
   * with no master), not a layout failure. The caller turns that into a
   * printed skip, so a non-PRO run reports honestly instead of crashing.
   */
  const tab = async (name) => {
    await page.evaluate(() => window.scrollTo(0, 0));
    const loc = page.getByRole("tab", { name });
    if ((await loc.count()) === 0) return false;
    await loc.click({ force: true });
    await page.waitForTimeout(700);
    return true;
  };
  const state = async (label, url, prepare) => {
    // NOT `networkidle`: the reader fires a session heartbeat every 5 seconds,
    // so the network never goes idle and the wait would time out on a
    // correctly configured stack. Wait for the DOM, then settle explicitly.
    // A client-side route push still in flight can abort the next navigation.
    // Retry once; a second abort is a real problem and rethrows.
    try {
      await page.goto(url, { waitUntil: "domcontentloaded" });
    } catch (err) {
      if (!/ERR_ABORTED/.test(String(err))) throw err;
      await page.waitForTimeout(1000);
      await page.goto(url, { waitUntil: "domcontentloaded" });
    }
    await page.waitForTimeout(1200);
    if (prepare) {
      const reached = await prepare();
      if (reached === false) {
        skipped += 1;
        console.log(`  – ${label}: skipped, mode not offered to this account`);
        consoleErrors.length = 0;
        pageErrors.length = 0;
        return;
      }
    }
    await page.waitForTimeout(600);
    // Choosing a mode can push a route, and an evaluate that lands mid
    // navigation dies with «execution context was destroyed». That is a race in
    // the harness, not a defect in the page, so settle and ask once more.
    let measured;
    try {
      measured = await page.evaluate(MEASURE);
    } catch (err) {
      if (!/execution context was destroyed/i.test(String(err))) throw err;
      await page.waitForTimeout(1500);
      measured = await page.evaluate(MEASURE);
    }
    assertUniversal(`${vp.w}px ${label}`, measured);

    const hydration = [...consoleErrors, ...pageErrors].filter((t) =>
      /hydrat|Text content|did not match/i.test(t),
    );
    const unhandled = pageErrors.filter(
      (t) => !/hydrat|Text content|did not match/i.test(t),
    );
    const devOverlay = await page.evaluate(
      () => !!document.querySelector("nextjs-portal"),
    );
    check(
      `${vp.w}px ${label}: no hydration mismatch`,
      hydration.length === 0,
      JSON.stringify(hydration.slice(0, 2)),
    );
    check(
      `${vp.w}px ${label}: no unhandled page error`,
      unhandled.length === 0,
      JSON.stringify(unhandled.slice(0, 2)),
    );
    check(
      `${vp.w}px ${label}: no development error indicator on screen`,
      devOverlay === false,
    );
    consoleErrors.length = 0;
    pageErrors.length = 0;
  };

  await state("Leer", READER);
  await state("Escuchar/Audiolibro", READER, () => tab(/Escuchar/));

  // NOT covered here: the audiobook transcript laid out. Reaching it needs an
  // account entitled to a PRO audiobook AND a chapter with a stored audio row —
  // `audioAvailable` is a server prop, so no client-side fixture can produce it.
  // The transcript assertions in MEASURE/assertUniversal are already in place
  // and fire the moment such an account runs this file.
  //   AUDIOBOOK_TRANSCRIPT_RESPONSIVE=NOT_VERIFIED_NO_ENTITLED_ACCOUNT
  await state("Escuchar/Podcast", READER, async () =>
    (await tab(/Escuchar/)) && (await tab(/^Podcast$/)),
  );
  await state("Ver", READER, () => tab(/Ver/));

  // Transcript: the podcast master does not exist, so this state runs on the
  // local fixture declared at the top of the file.
  await page.route("**/e2e-fixture-transcript.md", (route) =>
    route.fulfill({
      contentType: "text/markdown",
      body: "Tramo de prueba local del transcript.",
    }),
  );
  await page.route("**/lector/media/eec-c1-podcast-v1/access", (route) =>
    route.fulfill({ json: PODCAST_FIXTURE }),
  );
  await page.route(/\/lector\/[^/]+\/\d+\/media$/, async (route) => {
    const res = await route.fetch();
    const body = await res.json();
    body.items = (body.items ?? []).map((item) =>
      item.kind === "PODCAST"
        ? { ...item, availability: "AVAILABLE", hasTranscript: true, durationSec: 640 }
        : item,
    );
    await route.fulfill({ json: body });
  });
  await state("Transcript", READER, async () =>
    (await tab(/Escuchar/)) && (await tab(/^Podcast$/)),
  );
  await page.unrouteAll?.();

  await state("MiEvolucion/Actividad", `${BASE}/dashboard/evolucion`);

  // The drawer is the replacement for the sidebar, so it has to actually work.
  if (vp.w <= COMPACT_MAX) {
    await page.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1200);
    const parked = await page.evaluate(() => ({
      inert: document.querySelector(".side")?.inert ?? null,
      tabbables: [
        ...document.querySelectorAll(".side a, .side button"),
      ].filter((el) => el.tabIndex >= 0 && !el.closest("[inert]")).length,
    }));
    check(
      `${vp.w}px drawer: parked panel is inert`,
      parked.inert === true,
      JSON.stringify(parked),
    );
    check(
      `${vp.w}px drawer: parked panel is out of the tab order`,
      parked.tabbables === 0,
      JSON.stringify(parked),
    );

    await page.click(".nav-toggle");
    await page.waitForTimeout(400);
    const open = await page.evaluate(() => ({
      right: Math.round(document.querySelector(".side").getBoundingClientRect().right),
      expanded: document.querySelector(".nav-toggle").getAttribute("aria-expanded"),
      focusInside: !!document.activeElement?.closest(".side"),
      docScrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    }));
    check(`${vp.w}px drawer: opens into view`, open.right > 0, JSON.stringify(open));
    check(`${vp.w}px drawer: reports aria-expanded`, open.expanded === "true");
    check(`${vp.w}px drawer: moves focus into the panel`, open.focusInside === true);
    check(
      `${vp.w}px drawer: opening does not widen the page`,
      open.docScrollWidth === open.innerWidth,
      JSON.stringify(open),
    );

    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);
    const closed = await page.evaluate(() => ({
      right: Math.round(document.querySelector(".side").getBoundingClientRect().right),
      expanded: document.querySelector(".nav-toggle").getAttribute("aria-expanded"),
      focusOnToggle: document.activeElement === document.querySelector(".nav-toggle"),
    }));
    check(`${vp.w}px drawer: Escape closes it`, closed.right <= 1 && closed.expanded === "false", JSON.stringify(closed));
    check(`${vp.w}px drawer: focus returns to the button`, closed.focusOnToggle === true);
  }

  await ctx.close();
}

await browser.close();
console.log(
  `\n${checks - failures}/${checks} checks passed` +
    `${failures ? ` — ${failures} FAILED` : ""}` +
    `${skipped ? ` · ${skipped} state(s) skipped (mode not offered)` : ""}`,
);
process.exit(failures === 0 ? 0 : 1);
