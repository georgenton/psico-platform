/**
 * The reader's sticky header must not swallow the global ánimo / ambiente /
 * estilo controls. Measured in a real browser, on the real shell and the real
 * reader, with the real CSS.
 *
 * ── Why not Vitest/jsdom ───────────────────────────────────────────────────
 *
 * Same reason as `responsive.mjs`: jsdom lays nothing out. This defect only
 * exists as geometry and paint order. `getComputedStyle().zIndex`,
 * `getBoundingClientRect()` and above all `document.elementFromPoint()` — "if
 * a finger landed here, what would it hit?" — are meaningless without a layout
 * engine. A jsdom test asserting that a className contains `z-35` would assert
 * nothing about whether a person can pick «Renacimiento».
 *
 * ── How to run it, and where it does and does not run ──────────────────────
 *
 *   pnpm --filter @psico/web test:reader-layers
 *
 * **This suite is not wired into CI today; it is run locally, by hand, against
 * a stack you bring up yourself.** That is a statement about this file, not
 * about the pipeline's capabilities: `.github/workflows/ci.yml` already
 * provisions a browser for `Círculos · full-stack browser walk`
 * (`playwright install --with-deps chromium`), and that job's own comment
 * argues an end-to-end test which only ever runs on one laptop is a test
 * nobody can trust a merge against. Wiring this one in needs a seeded reader
 * fixture in CI, and is deliberately out of the change that introduced it.
 *
 * So: a green CI run on a PR that touches these layers is NOT evidence about
 * them. Whoever changes `.topbar`, `--app-topbar-h`, the reader header, the
 * companion dock, the tour overlay or any route dialog's z-index runs this
 * suite and pastes its real numbers.
 *
 * Prerequisites:
 *   · web + API up, and a database holding the reader's book and chapter
 *   · `playwright install chromium` for the declared Playwright
 *   · an account that can open the reader
 *
 *   E2E_BASE_URL        web origin        (default http://localhost:3000)
 *   E2E_EMAIL           account to log in (required unless E2E_STORAGE_STATE)
 *   E2E_PASSWORD        its password      (idem)
 *   E2E_STORAGE_STATE   reuse a saved Playwright session instead of logging in
 *   E2E_BOOK_SLUG       default emociones-en-construccion
 *   E2E_CHAPTER         default 1
 *   E2E_EXPECT_TOUR     "1" ⇒ the tour overlay MUST be present and is asserted;
 *                       otherwise its absence is reported as NOT MEASURED
 *
 * Credentials are env-only on purpose: no account is committed here, and
 * `E2E_STORAGE_STATE` exists because `/api/auth/login` allows 5 attempts per
 * 15 minutes per IP — iterating on this file would otherwise rate-limit you.
 *
 * ── What it measures, and why that and not a click ─────────────────────────
 *
 * A real click is necessary but NOT sufficient. Playwright aims at a point it
 * considers actionable and may find a sliver of a mostly-covered control, so a
 * passing click can coexist with options a person cannot see. Measured on the
 * broken build, `page.click()` succeeded on options whose own centre
 * `elementFromPoint` reported as covered by the reader bar. The close criterion
 * is "whole options visible AND clickable", so the primary gate here is the
 * hit test at each option's own centre, and the real click sits on top of it.
 * No `force`, no `dispatchEvent`, no `element.click()` from `evaluate`.
 *
 * The keyboard is measured the same way. `page.keyboard.press("Tab")` enters
 * through the browser's own input pipeline, so Chromium computes the next
 * focus target with its sequential-navigation algorithm over the whole live
 * document. Nothing here calls `focus()` to move the keyboard: a focus trap
 * that only held against a synthetic event would be caught, and the log prints
 * the traversal it actually walked rather than asserting that one exists.
 *
 * ── The matrix ─────────────────────────────────────────────────────────────
 *
 * 320 / 390 / 768 / 1365 px, each in both approved themes. 1365 is covered by
 * §3 (Contemporary) and §5 (Renacimiento); §7 walks the three narrow widths in
 * both. The themes are not interchangeable: they differ in type scale and chip
 * padding, so the global bar wraps at different widths and the band the reader
 * header competes for is not the same one.
 *
 * ── Two self-checks of the harness itself ──────────────────────────────────
 *
 *   --negative-control  re-injects the ORIGINAL cause (bar at z-index 20,
 *                       reader header at top: 0) and requires a LAYERING
 *                       regression to appear. Valid only when the scenario was
 *                       actually reached, the injection is observed in
 *                       computed styles, and a layering check failed. A login
 *                       or navigation error can never stand in for that.
 *   --scope-control     pushes the AMBIENTE menu off the left edge and requires
 *                       that to be reported as a FAILURE — proving the
 *                       off-viewport check can still see an overflow now that
 *                       WS-01B is fixed and nothing is excused any more.
 *
 * Both only ever make things worse; neither clears anything to help a check
 * pass. Both are isolated to this browser context: nothing is written to any
 * deployed environment.
 */

const NEGATIVE = process.argv.includes("--negative-control");
const SCOPE = process.argv.includes("--scope-control");

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const EMAIL = process.env.E2E_EMAIL;
const PASSWORD = process.env.E2E_PASSWORD;
const STATE = process.env.E2E_STORAGE_STATE;
const BOOK = process.env.E2E_BOOK_SLUG ?? "emociones-en-construccion";
const CHAPTER = process.env.E2E_CHAPTER ?? "1";
const EXPECT_TOUR = process.env.E2E_EXPECT_TOUR === "1";
const READER = `${BASE}/dashboard/biblioteca/${BOOK}/lector/${CHAPTER}`;

/** The reader's sticky header. Matches before and after the fix. */
const READER_BAR = "header.sticky.z-30";

/**
 * What counts as reachable by keyboard. Deliberately the same selector the Aa
 * sheet uses for its own trap, so this bench reads the dialog's ends the way
 * the dialog does; if the two ever drift, the wrap checks below name the
 * element they actually landed on and the mismatch is visible in the log.
 */
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Exactly the pre-fix declarations, nothing else. */
const ORIGINAL_CAUSE = `
  .topbar { z-index: 20 !important; }
  ${READER_BAR} { top: 0 !important; }
`;

/**
 * Pushes ONE menu outside the viewport, to prove the off-viewport check still
 * fires. Ambiente, because ánimo is the control WS-01B just fixed and a check
 * should be proven on a case it was not written around.
 */
const SCOPE_PUSH = `
  [role="menu"][aria-label="Selecciona un ambiente"] {
    right: auto !important;
    left: -1100px !important;
  }
`;

/**
 * WS-01B is FIXED, so there is no tolerated overflow left: every option of
 * every menu must sit whole inside the viewport, at every width in the matrix.
 *
 * What used to be excused: the ánimo popover is a fixed 322px anchored to its
 * chip, and in the compact bar the chip's right edge arrives before 322px, so
 * the popover hung off the left — 3 of 5 faces unreachable at 320px. Below
 * 600px it now hangs from the bar instead of the chip and is bounded by the
 * screen. The exception is gone rather than widened; if it ever needs to come
 * back, that is a product decision and not a test edit.
 */

// ── the three global controls ───────────────────────────────────────────────
const CONTROLS = [
  {
    id: "ánimo",
    trigger: ".mood-chip",
    menu: ".mood-pop.open",
    option: ".mp-opt",
    // Measured at every width in this matrix. A different number means the
    // menu did not render what we think it renders, and no later check on this
    // control is trustworthy.
    expectedOptions: 5,
    state: () =>
      document.querySelector(".mood-chip .mc-txt")?.textContent?.trim() ?? "",
  },
  {
    id: "ambiente",
    trigger: 'button[aria-label^="Ambiente:"]',
    menu: '[role="menu"][aria-label="Selecciona un ambiente"]',
    option: '[role="menuitemradio"]',
    expectedOptions: 4,
    state: () =>
      [...document.body.classList].filter((c) => c.startsWith("amb-")).join(","),
  },
  {
    id: "estilo",
    trigger: 'button[aria-label^="Estilo:"]',
    menu: '[role="menu"][aria-label="Selecciona un estilo visual"]',
    option: '[role="menuitemradio"]',
    expectedOptions: 2,
    state: () => document.documentElement.dataset.theme ?? "",
  },
];

/**
 * The checks a restored original cause MUST break. The negative control is
 * valid only if at least one of these fails — never because the bench could not
 * log in. Identifiers, not phrases found in an exception message.
 */
const LAYERING_IDS = new Set([
  "bar-outranks-reader",
  "bars-share-band",
  "covered-options",
  "menu-over-reader-bar",
  "control-opens",
]);

let chromium;
try {
  ({ chromium } = await import("playwright"));
} catch {
  console.error(
    "playwright is not installed in this environment.\n" +
      "  pnpm --filter @psico/web exec playwright install chromium",
  );
  process.exit(2);
}

if (!STATE && (!EMAIL || !PASSWORD)) {
  console.error(
    "E2E_EMAIL and E2E_PASSWORD are required (or E2E_STORAGE_STATE). See the header of this file.",
  );
  process.exit(2);
}

// ── page-side measurements ──────────────────────────────────────────────────

function stackingFacts(sel) {
  const el = document.querySelector(sel);
  if (!el) return null;
  const facts = (n) => {
    const cs = getComputedStyle(n);
    const why = [];
    if (cs.position !== "static" && cs.zIndex !== "auto") why.push("position+z-index");
    if (cs.transform !== "none") why.push("transform");
    if (cs.filter !== "none") why.push("filter");
    if (cs.backdropFilter && cs.backdropFilter !== "none") why.push("backdrop-filter");
    if (cs.isolation === "isolate") why.push("isolation");
    if (cs.mixBlendMode !== "normal") why.push("mix-blend-mode");
    if (parseFloat(cs.opacity) < 1) why.push("opacity<1");
    if (cs.contain && /paint|layout|strict|content/.test(cs.contain)) why.push("contain");
    return { z: cs.zIndex, position: cs.position, top: cs.top, why };
  };
  const self = facts(el);
  let trappedIn = null;
  for (let n = el.parentElement; n; n = n.parentElement) {
    const f = facts(n);
    if (f.why.length) {
      trappedIn = {
        el:
          n.tagName.toLowerCase() +
          "." +
          (typeof n.className === "string" ? n.className : "").trim().split(/\s+/)[0],
        z: f.z,
        why: f.why.join("+"),
      };
      break;
    }
  }
  return { ...self, why: self.why.join("+") || "-", trappedIn };
}

function barOverlap(barSel) {
  const tb = document.querySelector(".topbar");
  const rb = document.querySelector(barSel);
  if (!tb || !rb) return null;
  const a = tb.getBoundingClientRect();
  const b = rb.getBoundingClientRect();
  return {
    topbar: { h: Math.round(a.height), top: Math.round(a.top), bottom: Math.round(a.bottom) },
    reader: { h: Math.round(b.height), top: Math.round(b.top), bottom: Math.round(b.bottom) },
    overlap: Math.max(0, Math.round(Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top))),
  };
}

function menuReach([menuSel, optSel, barSel]) {
  const menu = document.querySelector(menuSel);
  if (!menu) return { error: "menu not rendered" };
  const bar = document.querySelector(barSel);
  const belongs = (hit, el) => !!hit && (hit === el || el.contains(hit) || hit.contains(el));
  const onBar = (hit) => !!hit && !!bar && (hit === bar || bar.contains(hit));
  const name = (n) => {
    if (!n) return "(nothing)";
    const c = (typeof n.className === "string" ? n.className : "").trim();
    return n.tagName.toLowerCase() + (c ? "." + c.split(/\s+/).slice(0, 2).join(".") : "");
  };

  // The CENTRE is not enough: a control can have its middle clear and its
  // edges under something else, and a finger does not always land dead
  // centre. Five points — the centre and four insets — plus the requirement
  // that the whole box is on screen.
  const SAMPLES = [
    [0.5, 0.5],
    [0.15, 0.22],
    [0.85, 0.22],
    [0.15, 0.78],
    [0.85, 0.78],
  ];
  const options = [...menu.querySelectorAll(optSel)].map((o, i) => {
    const r = o.getBoundingClientRect();
    const cx = Math.round(r.left + r.width / 2);
    const cy = Math.round(r.top + r.height / 2);
    // The WHOLE box inside the viewport, not merely its midpoint.
    const inView =
      r.left >= -0.5 &&
      r.top >= -0.5 &&
      r.right <= innerWidth + 0.5 &&
      r.bottom <= innerHeight + 0.5;
    let sampled = 0;
    let reached = 0;
    let blocker = null;
    if (inView) {
      for (const [fx, fy] of SAMPLES) {
        const x = Math.round(r.left + r.width * fx);
        const y = Math.round(r.top + r.height * fy);
        if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) continue;
        sampled += 1;
        const h = document.elementFromPoint(x, y);
        if (belongs(h, o)) reached += 1;
        else if (!blocker) blocker = name(h);
      }
    }
    return {
      i,
      label: (o.getAttribute("aria-label") || o.textContent || "")
        .trim()
        .replace(/\s+/g, " ")
        .replace(/\s*✓$/, "")
        .slice(0, 20),
      w: Math.round(r.width),
      h: Math.round(r.height),
      cx,
      inView,
      active: o.getAttribute("aria-checked") === "true" || o.classList.contains("on"),
      // Every sampled point must land on the option, not just its middle.
      reachable: inView && sampled > 0 && reached === sampled,
      sampled,
      reached,
      topmost: blocker ?? name(document.elementFromPoint(cx, cy)),
    };
  });

  const m = menu.getBoundingClientRect();
  let probes = 0;
  let coveredByBar = 0;
  for (let fy = 0.06; fy <= 0.96; fy += 0.1) {
    for (let fx = 0.2; fx <= 0.85; fx += 0.3) {
      const x = Math.round(m.left + m.width * fx);
      const y = Math.round(m.top + m.height * fy);
      if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) continue;
      probes += 1;
      if (onBar(document.elementFromPoint(x, y))) coveredByBar += 1;
    }
  }
  return {
    box: `${Math.round(m.width)}×${Math.round(m.height)}@(${Math.round(m.left)},${Math.round(m.top)})`,
    hasBox: m.width > 0 && m.height > 0,
    viewport: innerWidth,
    options,
    probes,
    coveredByBar,
    clipped: (() => {
      for (let n = menu.parentElement; n; n = n.parentElement) {
        const cs = getComputedStyle(n);
        if (cs.overflowX === "visible" && cs.overflowY === "visible") continue;
        const nr = n.getBoundingClientRect();
        if (
          m.left < nr.left - 1 ||
          m.right > nr.right + 1 ||
          m.top < nr.top - 1 ||
          m.bottom > nr.bottom + 1
        ) {
          return `${name(n)}[${cs.overflowX}/${cs.overflowY}]`;
        }
      }
      return null;
    })(),
  };
}

function topmostAt([sel, x, y]) {
  const el = document.querySelector(sel);
  const hit = document.elementFromPoint(x, y);
  if (!hit) return { has: !!el, onTop: false, topmost: "(nothing)" };
  const name =
    hit.tagName.toLowerCase() +
    (typeof hit.className === "string" && hit.className.trim()
      ? "." + hit.className.trim().split(/\s+/).slice(0, 2).join(".")
      : "");
  return { has: !!el, onTop: !!el && (hit === el || el.contains(hit)), topmost: name };
}

/** Did the injected original cause actually take hold in computed styles? */
function causeIsInPlace(barSel) {
  const tb = document.querySelector(".topbar");
  const rb = document.querySelector(barSel);
  if (!tb || !rb) return null;
  return { topbarZ: getComputedStyle(tb).zIndex, readerTop: getComputedStyle(rb).top };
}

// ── reporting ───────────────────────────────────────────────────────────────
const failures = [];
const notes = [];
const notMeasured = [];
let checks = 0;
/** Set once a menu has really been measured, with options and samples. */
let reachedScenario = false;
/** Only meaningful under --negative-control. */
let causeObserved = false;
/** A setup/infrastructure problem. Never evidence about layering. */
let benchError = null;

function check(id, category, ok, what, detail, control) {
  checks += 1;
  if (!ok) failures.push({ id, category, control, text: `${what} — ${detail}` });
  console.log(`  ${ok ? "ok   " : "FAIL "} ${what}${detail ? ` · ${detail}` : ""}`);
  return ok;
}

/** Everything that can throw is setup. Assertions never throw. */
class BenchError extends Error {
  constructor(phase, cause) {
    super(`[${phase}] ${String(cause?.message ?? cause).replace(/\s+/g, " ").slice(0, 240)}`);
    this.phase = phase;
  }
}

// ── driving ─────────────────────────────────────────────────────────────────
//
// ONE browser context for the whole run, on purpose. Logging in again per cell
// would hit the 5-per-15-minutes throttle on `/api/auth/login`, and reusing a
// saved `storageState` across several contexts fails for a subtler reason: the
// first context rotates the refresh token, so the saved one is spent and the
// next context lands back on /login. Viewport and theme are changed in place.
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1365, height: 900 },
  ...(STATE ? { storageState: STATE } : {}),
});
const page = await context.newPage();

async function signIn() {
  if (STATE) return;
  try {
    await page.goto(`${BASE}/login`, { waitUntil: "load" });
    await page.fill('input[name="email"]', EMAIL);
    await page.fill('input[name="password"]', PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL((u) => u.pathname.startsWith("/dashboard"), { timeout: 45_000 });
  } catch (e) {
    throw new BenchError("signin", e);
  }
}

async function openReader({ theme } = {}) {
  try {
    if (theme) {
      // The product's own mechanism: a per-device preference in localStorage.
      // It has to be set from a page on this origin, so navigate first.
      if (new URL(page.url()).origin !== new URL(BASE).origin) {
        await page.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded" });
      }
      await page.evaluate((t) => {
        try {
          localStorage.setItem("psico:theme", t);
        } catch {}
      }, theme);
    }
    await page.goto(READER, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".topbar", { timeout: 30_000 });
    await page.waitForSelector(READER_BAR, { timeout: 30_000 });
    if (NEGATIVE) await page.addStyleTag({ content: ORIGINAL_CAUSE });
    if (SCOPE) await page.addStyleTag({ content: SCOPE_PUSH });
    // `.screen` animates a transform for 400 ms, which is itself a stacking
    // context while it runs. Measure the settled page, not the transition.
    await page.waitForTimeout(900);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(150);
  } catch (e) {
    throw new BenchError("open-reader", e);
  }
  if (NEGATIVE) {
    const seen = await page.evaluate(causeIsInPlace, READER_BAR);
    if (seen && seen.topbarZ === "20" && seen.readerTop === "0px") causeObserved = true;
  }
}

/** Open a control, measure it, pick an option for real, and close it. */
async function exerciseControl(c, { label, effect = true }) {
  // A trigger that cannot be clicked IS the defect when the reader bar covers
  // it, so this is a layering check and not a bench error.
  let opened = true;
  try {
    await page.click(c.trigger, { timeout: 6000 });
    await page.waitForSelector(c.menu, { state: "visible", timeout: 8000 });
  } catch {
    opened = false;
  }
  const openedOk = check(
    "control-opens",
    "layering",
    opened,
    `${label} · ${c.id} · el control se abre con un clic real`,
    opened ? "abierto" : "el disparador o el menú no respondieron",
    c.id,
  );
  if (!openedOk) return;

  const r = await page.evaluate(menuReach, [c.menu, c.option, READER_BAR]);
  if (r.error) {
    check("menu-present", "sanity", false, `${label} · ${c.id} · el menú existe y se puede medir`, r.error, c.id);
    return;
  }

  // ── sanity: never a PASS with nothing measured ───────────────────────────
  const countOk = r.options.length === c.expectedOptions;
  check("option-count", "sanity", countOk, `${label} · ${c.id} · ${c.expectedOptions} opciones presentes`, `encontradas ${r.options.length}`, c.id);
  check("menu-box", "sanity", r.hasBox, `${label} · ${c.id} · el menú tiene caja medible`, r.box, c.id);
  const samplesOk = r.probes > 0;
  check("probe-samples", "sanity", samplesOk, `${label} · ${c.id} · hay muestras dentro del viewport`, `${r.probes} puntos`, c.id);
  if (countOk && samplesOk) reachedScenario = true;

  // ── layering ─────────────────────────────────────────────────────────────
  const covered = r.options.filter((o) => o.inView && !o.reachable);
  check(
    "covered-options",
    "layering",
    covered.length === 0,
    `${label} · ${c.id} · ninguna de las ${r.options.length} opciones está tapada en su centro`,
    covered.length ? `tapadas: ${covered.map((o) => `«${o.label}»→${o.topmost}`).join(", ")}` : r.box,
    c.id,
  );
  check(
    "menu-over-reader-bar",
    "layering",
    r.coveredByBar === 0,
    `${label} · ${c.id} · ningún punto del menú cae en la barra del lector`,
    `${r.coveredByBar}/${r.probes} puntos`,
    c.id,
  );
  check(
    "not-clipped",
    "layering",
    r.clipped === null,
    `${label} · ${c.id} · el menú no está recortado por un ancestro`,
    r.clipped ?? "sin ancestro que lo corte",
    c.id,
  );

  // ── every option whole inside the screen · WS-01B ────────────────────────
  const off = r.options.filter((o) => !o.inView);
  check(
    "off-viewport",
    "layering",
    off.length === 0,
    `${label} · ${c.id} · las ${r.options.length} opciones caben enteras en la pantalla`,
    off.length
      ? `fuera: ${off.map((o) => `«${o.label}»(cx=${o.cx})`).join(", ")} · viewport ${r.viewport}px`
      : `viewport ${r.viewport}px`,
    c.id,
  );

  if (effect) {
    // Prefer the LAST option that is not already selected: it sits deepest into
    // the band the reader bar used to own, and picking the active one would
    // change nothing and prove nothing. A real mouse click, aimed at that
    // option's own centre.
    const candidates = r.options.filter((o) => !o.active && o.inView);
    const target = candidates[candidates.length - 1];
    if (!target) {
      check("effect-target", "sanity", false, `${label} · ${c.id} · hay una opción distinta que elegir`, "ninguna opción inactiva dentro del viewport", c.id);
    } else {
      const before = await page.evaluate(c.state);
      const loc = page.locator(`${c.menu} ${c.option}`).nth(target.i);
      let clicked = true;
      let why = "";
      try {
        await loc.click({ position: { x: target.w / 2, y: target.h / 2 }, timeout: 4000 });
      } catch (e) {
        clicked = false;
        why = /intercepts pointer events/.test(String(e.message)) ? "interceptado" : "timeout";
      }
      await page.waitForTimeout(900);
      const after = await page.evaluate(c.state);
      check("real-click", "layering", clicked, `${label} · ${c.id} · clic real al centro de «${target.label}»`, why || "aceptado", c.id);
      check("pick-takes-effect", "layering", before !== after, `${label} · ${c.id} · la selección surte efecto`, `«${before}» → «${after}»`, c.id);
    }
  }

  await page.keyboard.press("Escape").catch(() => {});
  await page.waitForTimeout(250);
  const closed =
    (await page.locator(c.menu).count()) === 0 || !(await page.locator(c.menu).first().isVisible());
  check("escape-closes", "interaction", closed, `${label} · ${c.id} · Escape lo cierra`, closed ? "cerrado" : "sigue abierto", c.id);
}

try {
  // ══ 1 · the layer facts, stated as numbers ══════════════════════════════
  console.log(
    `\n══ 1 · orden de capas (1365×900, Contemporary)` +
      `${NEGATIVE ? " · CONTROL NEGATIVO" : ""}${SCOPE ? " · CONTROL DE ALCANCE" : ""} ══`,
  );
  await signIn();
  await openReader({ theme: "contemporary" });
  const tb = await page.evaluate(stackingFacts, ".topbar");
  const rb = await page.evaluate(stackingFacts, READER_BAR);
  console.log(
    `  barra global: z=${tb.z} position=${tb.position} (${tb.why}) · encerrada en ${tb.trappedIn ? `${tb.trappedIn.el}[z=${tb.trappedIn.z}]` : "ningún contexto"}`,
  );
  console.log(
    `  barra lector: z=${rb.z} position=${rb.position} top=${rb.top} (${rb.why}) · encerrada en ${rb.trappedIn ? `${rb.trappedIn.el}[z=${rb.trappedIn.z}]` : "ningún contexto"}`,
  );
  check("bar-outranks-reader", "layering", Number(tb.z) > Number(rb.z), "la barra global supera en capa a la del lector", `${tb.z} vs ${rb.z}`);
  notes.push(
    "los menús heredan la capa de .topbar; su z-index local (80 en ánimo, 40 en ambiente y estilo) no escapa de ahí",
  );

  // ══ 2 · the two bars must not share a band ══════════════════════════════
  console.log("\n══ 2 · bandas de las dos barras ══");
  for (const y of [0, 600]) {
    await page.evaluate((yy) => window.scrollTo(0, yy), y);
    await page.waitForTimeout(300);
    const b = await page.evaluate(barOverlap, READER_BAR);
    check("bars-share-band", "layering", b.overlap === 0, `1365×900 · scrollY=${y} · las barras no se solapan`, `global ${b.topbar.top}..${b.topbar.bottom} · lector ${b.reader.top}..${b.reader.bottom} · solape ${b.overlap}px`);
  }

  // ══ 2.5 · the tour, measured FIRST because it covers everything ═════════
  //
  // Its backdrop sits at z-index 40, above this bar by design, so while the
  // tour is up none of the global controls can be exercised. That is the
  // correct precedence and it is measured here, before being dismissed with a
  // real click so the rest of the matrix can run.
  //
  // The tour only renders for an account that completed onboarding and has not
  // finished the tour, and dismissing it writes `tourCompletedAt`. A second run
  // on the same account therefore needs `POST /api/onboarding/tour/reset`.
  // Absence is reported as NOT MEASURED — never as a pass.
  console.log("\n══ 2.5 · tour sobre la barra global ══");
  const tourSeen = await page.evaluate(
    () => !!document.querySelector('[role="dialog"][aria-labelledby="tour-step-title"]'),
  );
  if (tourSeen) {
    const coach = await page.evaluate(topmostAt, [
      '[role="dialog"][aria-labelledby="tour-step-title"]',
      400,
      300,
    ]);
    const overBar = await page.evaluate(topmostAt, ["div.fixed.inset-0.z-40", 1100, 28]);
    check("tour-coachmark-on-top", "upper-layer", coach.onTop, "el globo del tour queda encima donde se dibuja", `manda ${coach.topmost}`);
    check("tour-covers-bar", "upper-layer", overBar.onTop, "el tour sigue cubriendo la barra global", `en (1100,28) manda ${overBar.topmost}`);
    // Dismiss with a real click on a point the backdrop owns, as a person would.
    await page.mouse.click(1100, 28);
    await page.waitForTimeout(1200);
    const gone = await page.evaluate(
      () => !document.querySelector('[role="dialog"][aria-labelledby="tour-step-title"]'),
    );
    check("tour-dismissable", "upper-layer", gone, "el tour se cierra con un clic fuera", gone ? "cerrado" : "sigue visible");
  } else if (EXPECT_TOUR) {
    check("tour-present", "upper-layer", false, "el tour debía estar visible (E2E_EXPECT_TOUR=1)", "no se encontró el overlay");
  } else {
    notMeasured.push(
      "precedencia del tour sobre la barra global: la cuenta de esta pasada no lo dispara. Repetir con E2E_EXPECT_TOUR=1 y una cuenta con onboarding completado y tour sin terminar.",
    );
  }

  // ══ 3 · the three controls, desktop, Contemporary ═══════════════════════
  console.log("\n══ 3 · los tres selectores · escritorio · Contemporary ══");
  await page.evaluate(() => window.scrollTo(0, 0));
  for (const c of CONTROLS) await exerciseControl(c, { label: "1365·contemporary" });

  // ══ 4 · layers that MUST keep blocking, measured ════════════════════════
  console.log("\n══ 4 · capas que SÍ deben bloquear ══");
  await page.click('button[aria-label="Abrir panel del lector"]');
  await page.waitForSelector('aside[aria-label^="Panel del lector"]', { timeout: 10_000 });
  const dockTop = await page.evaluate(topmostAt, ['aside[aria-label^="Panel del lector"]', 1305, 28]);
  check("dock-above-bar", "upper-layer", dockTop.onTop, "el panel del lector sigue por encima de la barra global", `en (1305,28) manda ${dockTop.topmost}`);
  let dockClosed = true;
  try {
    await page.locator('button[aria-label="Cerrar panel"]').click({ timeout: 4000 });
  } catch {
    dockClosed = false;
  }
  check("dock-close-reachable", "upper-layer", dockClosed, "el cierre del panel del lector sigue siendo pulsable", dockClosed ? "aceptado" : "interceptado");
  await page.waitForTimeout(400);

  const AA = '[role="dialog"][aria-label="Preferencias de lectura"]';
  const AA_TRIGGER = 'button[aria-label="Preferencias de lectura"]';
  await page.click(AA_TRIGGER);
  await page.waitForSelector(AA, { timeout: 10_000 });
  const dialogOverBar = await page.evaluate(topmostAt, [AA, 1100, 28]);
  check("dialog-above-bar", "upper-layer", dialogOverBar.onTop, "el modal Aa sigue por encima de la barra global", `en (1100,28) manda ${dialogOverBar.topmost}`);

  // ── Aa, from the keyboard ────────────────────────────────────────────────
  // Focus enters the panel on open: a dialog that declares `aria-modal` and
  // then leaves the keyboard outside is worse than no dialog at all.
  const focusInside = await page.evaluate(
    (sel) => !!document.activeElement?.closest(sel),
    AA,
  );
  check("dialog-takes-focus", "upper-layer", focusInside, "el modal Aa recibe el foco al abrirse", focusInside ? "dentro" : "el foco se quedó fuera");

  // Tab and Shift+Tab, pressed for real.
  //
  // `page.keyboard.press("Tab")` goes in through the browser's own input
  // pipeline: Chromium computes the next focus target with its sequential
  // navigation algorithm, over the whole live document, with the real CSS.
  // Nothing here calls `focus()` to move the keyboard, so a trap that only
  // worked against a simulated event would fail here. The reader behind this
  // overlay is a long document full of tabbables — chapter links, the
  // annotations toggle, the global bar — so an unclosed trap escapes within a
  // press or two.
  const aaControls = await page.evaluate(
    ([sel, focusable]) =>
      [
        ...(document.querySelector(sel)?.querySelectorAll(focusable) ?? []),
      ].length,
    [AA, FOCUSABLE],
  );
  check("dialog-has-controls", "sanity", aaControls > 1, "el modal Aa tiene controles que recorrer", `${aaControls} enfocables`);

  /** Where is the keyboard right now, and is it still inside the sheet? */
  const focusNow = () =>
    page.evaluate((sel) => {
      const a = document.activeElement;
      if (!a || a === document.body) return { inside: false, where: "<body>" };
      const label =
        a.getAttribute("aria-label") ||
        a.textContent?.trim().slice(0, 24) ||
        `${a.tagName.toLowerCase()}[${a.getAttribute("type") ?? ""}]`;
      return { inside: !!a.closest(sel), where: label };
    }, AA);

  // Enough presses to cross both ends several times.
  const laps = aaControls * 2 + 4;
  const fwd = [];
  let escaped = null;
  for (let i = 0; i < laps && !escaped; i += 1) {
    await page.keyboard.press("Tab");
    const at = await focusNow();
    fwd.push(at.where);
    if (!at.inside) escaped = `tras ${i + 1} Tab el foco salió a ${at.where}`;
  }
  check("dialog-tab-stays-inside", "upper-layer", escaped === null, `el foco no sale del modal Aa en ${laps} pulsaciones de Tab`, escaped ?? `recorrido: ${fwd.join(" → ")}`);

  const back = [];
  let escapedBack = null;
  for (let i = 0; i < laps && !escapedBack; i += 1) {
    await page.keyboard.press("Shift+Tab");
    const at = await focusNow();
    back.push(at.where);
    if (!at.inside)
      escapedBack = `tras ${i + 1} Shift+Tab el foco salió a ${at.where}`;
  }
  check("dialog-shift-tab-stays-inside", "upper-layer", escapedBack === null, `el foco no sale del modal Aa en ${laps} pulsaciones de Shift+Tab`, escapedBack ?? `recorrido: ${back.join(" → ")}`);

  // The two wraps, named. Walking to an end by pressing Tab — not by calling
  // focus() — and then asking what the next press does.
  const edges = await page.evaluate(
    ([sel, focusable]) => {
      const items = [
        ...(document.querySelector(sel)?.querySelectorAll(focusable) ?? []),
      ];
      const label = (n) =>
        n?.getAttribute("aria-label") ||
        n?.textContent?.trim().slice(0, 24) ||
        `${n?.tagName.toLowerCase()}[${n?.getAttribute("type") ?? ""}]`;
      return { first: label(items[0]), last: label(items[items.length - 1]) };
    },
    [AA, FOCUSABLE],
  );

  /** Press `key` until the keyboard sits on `want`, or report how it went. */
  async function walkTo(key, want) {
    for (let i = 0; i < laps; i += 1) {
      const at = await focusNow();
      if (at.where === want) return true;
      await page.keyboard.press(key);
    }
    return (await focusNow()).where === want;
  }

  const onLast = await walkTo("Tab", edges.last);
  await page.keyboard.press("Tab");
  const afterLast = await focusNow();
  check("dialog-tab-wraps", "upper-layer", onLast && afterLast.inside && afterLast.where === edges.first, `Tab en «${edges.last}» vuelve a «${edges.first}»`, onLast ? `cayó en ${afterLast.where}` : `no se llegó a «${edges.last}» pulsando Tab`);

  const onFirst = await walkTo("Tab", edges.first);
  await page.keyboard.press("Shift+Tab");
  const afterFirst = await focusNow();
  check("dialog-shift-tab-wraps", "upper-layer", onFirst && afterFirst.inside && afterFirst.where === edges.last, `Shift+Tab en «${edges.first}» va a «${edges.last}»`, onFirst ? `cayó en ${afterFirst.where}` : `no se llegó a «${edges.first}» pulsando Tab`);

  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
  const aaClosed = (await page.locator(AA).count()) === 0;
  check("dialog-escape-closes", "upper-layer", aaClosed, "Escape cierra el modal Aa", aaClosed ? "cerrado" : "sigue abierto");
  const backOnTrigger = await page.evaluate(
    (sel) => document.activeElement === document.querySelector(sel),
    AA_TRIGGER,
  );
  check("dialog-returns-focus", "upper-layer", backOnTrigger, "el foco vuelve a Aa al cerrar", backOnTrigger ? "en Aa" : "quedó en otro sitio");

  // One key, ONE layer. The reader's panel and the mobile drawer both listen
  // for Escape on `document`. If the dialog let the event through, a single
  // Escape would close them too and the reader would lose a surface they
  // never asked to dismiss.
  //
  // This probes the mechanism rather than staging two panels at once: with
  // the dock open it covers the Aa trigger — correctly, it is a drawer over
  // that corner — so the two cannot be opened together by clicking. A counter
  // on `document` is the same listener the dock installs, and it answers the
  // real question: does Escape inside the dialog reach `document` at all?
  await page.evaluate(() => {
    const w = window;
    w.__escapesAtDocument = 0;
    w.__countEscape = (e) => {
      if (e.key === "Escape") w.__escapesAtDocument += 1;
    };
    document.addEventListener("keydown", w.__countEscape);
  });
  await page.click(AA_TRIGGER);
  await page.waitForSelector(AA, { timeout: 10_000 });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
  const leak = await page.evaluate(() => {
    const w = window;
    document.removeEventListener("keydown", w.__countEscape);
    return w.__escapesAtDocument;
  });
  const closedAgain = (await page.locator(AA).count()) === 0;
  check(
    "escape-closes-one-layer",
    "upper-layer",
    closedAgain && leak === 0,
    "Escape cierra el modal Aa y no llega a otras capas",
    `Aa ${closedAgain ? "cerrado" : "abierto"} · escapes que alcanzaron document: ${leak}`,
  );

  // ══ 5 · Renacimiento ════════════════════════════════════════════════════
  console.log("\n══ 5 · los tres selectores · escritorio · Renacimiento ══");
  await openReader({ theme: "renaissance" });
  const themeApplied = await page.evaluate(() => document.documentElement.dataset.theme);
  check("theme-applied", "sanity", themeApplied === "renaissance", "el tema Renacimiento está aplicado", `data-theme=${themeApplied}`);
  for (const c of CONTROLS) await exerciseControl(c, { label: "1365·renacimiento" });

  // ══ 6 · Noche, picked through the real menu ═════════════════════════════
  console.log("\n══ 6 · ambiente Noche ══");
  await openReader({ theme: "contemporary" });
  await page.click('button[aria-label^="Ambiente:"]');
  await page.waitForSelector('[role="menu"][aria-label="Selecciona un ambiente"]', { timeout: 10_000 });
  await page.locator('[role="menu"][aria-label="Selecciona un ambiente"] [role="menuitemradio"]').last().click();
  await page.waitForTimeout(1000);
  const noche = await page.evaluate(() => document.body.classList.contains("amb-noche"));
  check("noche-applied", "sanity", noche, "el ambiente Noche está aplicado", `body.amb-noche=${noche}`);
  for (const c of CONTROLS) await exerciseControl(c, { label: "noche", effect: false });

  // ══ 7 · the responsive matrix · 768/390/320 × both themes ═══════════════
  //
  // 1365 is covered in its own right by §3 (Contemporary) and §5
  // (Renacimiento). This loop walks the rest of the declared matrix, and
  // walks it in BOTH approved themes rather than in whichever one the
  // previous section happened to leave in localStorage: the two differ in
  // type scale and chip padding, so the global bar wraps at different widths
  // and the band the reader header competes for is not the same.
  async function runNarrowCell(v, theme) {
    const cell = `${v.width}px·${theme === "renaissance" ? "renacimiento" : "contemporary"}`;
    console.log(`\n══ 7 · ${v.width}×${v.height} · ${theme} ══`);
    await page.setViewportSize(v);
    await openReader({ theme });
    const themeNow = await page.evaluate(
      () => document.documentElement.dataset.theme,
    );
    check("theme-applied", "sanity", themeNow === theme, `${cell} · el tema está aplicado`, `data-theme=${themeNow}`);
    const rows = await page.evaluate(() => {
      const bar = document.querySelector(".topbar");
      const tops = new Set(
        [...bar.children]
          .filter((k) => k.getBoundingClientRect().height > 0)
          .map((k) => Math.round(k.getBoundingClientRect().top)),
      );
      return { rows: tops.size, h: Math.round(bar.getBoundingClientRect().height) };
    });
    console.log(`  barra global: ${rows.h}px en ${rows.rows} fila(s)`);
    for (const y of [0, 600]) {
      await page.evaluate((yy) => window.scrollTo(0, yy), y);
      await page.waitForTimeout(300);
      const b = await page.evaluate(barOverlap, READER_BAR);
      check("bars-share-band", "layering", b.overlap === 0, `${cell} · scrollY=${y} · las barras no se solapan`, `lector top=${b.reader.top} · solape ${b.overlap}px`);
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    for (const c of CONTROLS) await exerciseControl(c, { label: cell, effect: false });

    // Mobile navigation, measured: the drawer and its scrim must still win.
    //
    // The toggle only exists while the sidebar is collapsed. At 768 px it can
    // be laid out permanently, and clicking a control that is not there would
    // raise a bench error — an infrastructure failure standing in for a
    // measurement. So the absence is reported as NOT MEASURED, which is what
    // it is, and the cell goes on.
    const hasToggle =
      (await page.locator(".nav-toggle").count()) > 0 &&
      (await page.locator(".nav-toggle").first().isVisible());
    if (!hasToggle) {
      notMeasured.push(
        `cajón y velo de navegación en ${cell}: no hay disparador «.nav-toggle» visible a este ancho, así que no hay cajón que medir.`,
      );
      await page.keyboard.press("Escape").catch(() => {});
      await page.waitForTimeout(200);
      return;
    }
    await page.click(".nav-toggle");
    await page.waitForTimeout(600);
    const drawer = await page.evaluate(topmostAt, [".side", 100, 30]);
    check("mobile-drawer-above-bar", "upper-layer", drawer.onTop, `${cell} · el cajón de navegación sigue por encima de la barra global`, `en (100,30) manda ${drawer.topmost}`);
    // The scrim is whatever strip the drawer leaves uncovered, and the drawer
    // is wide: at 320 px it takes almost the whole screen. So the probe point
    // comes from the measured geometry instead of a guessed margin.
    const scrim = await page.evaluate(() => {
      const side = document.querySelector(".side");
      const el = document.querySelector(".nav-scrim");
      if (!side || !el) return { exposed: false, has: !!el };
      const right = side.getBoundingClientRect().right;
      const gap = innerWidth - right;
      if (gap < 8) return { exposed: false, has: true, gap: Math.round(gap) };
      const x = Math.round(right + gap / 2);
      const hit = document.elementFromPoint(x, 320);
      return {
        exposed: true,
        has: true,
        x,
        onTop: !!hit && (hit === el || el.contains(hit)),
        topmost: hit
          ? hit.tagName.toLowerCase() +
            (typeof hit.className === "string" && hit.className.trim()
              ? "." + hit.className.trim().split(/\s+/).slice(0, 2).join(".")
              : "")
          : "(nothing)",
      };
    });
    if (scrim.exposed) {
      check("mobile-scrim-above-bar", "upper-layer", scrim.onTop, `${cell} · el velo de navegación sigue por encima`, `en (${scrim.x},320) manda ${scrim.topmost}`);
    } else {
      notMeasured.push(
        `velo de navegación en ${cell}: el cajón no deja franja visible (hueco ${scrim.gap ?? 0}px), así que no hay punto donde medirlo.`,
      );
    }
    await page.keyboard.press("Escape").catch(() => {});
    await page.waitForTimeout(400);
  }

  for (const theme of ["contemporary", "renaissance"]) {
    for (const v of [
      { width: 768, height: 1024 },
      { width: 390, height: 844 },
      { width: 320, height: 720 },
    ]) {
      await runNarrowCell(v, theme);
    }
  }

  // ══ 8 · resize must not re-open it ══════════════════════════════════════
  console.log("\n══ 8 · redimensionado ══");
  await page.setViewportSize({ width: 1365, height: 900 });
  await openReader({ theme: "contemporary" });
  for (const size of [
    { width: 320, height: 720 },
    { width: 1365, height: 900 },
  ]) {
    await page.setViewportSize(size);
    await page.waitForTimeout(500);
    await page.evaluate(() => window.scrollTo(0, 600));
    await page.waitForTimeout(300);
    const b = await page.evaluate(barOverlap, READER_BAR);
    check("bars-share-band", "layering", b.overlap === 0, `tras redimensionar a ${size.width}px · las barras no se solapan`, `global h=${b.topbar.h} · lector top=${b.reader.top} · solape ${b.overlap}px`);
  }

  // ══ 9 · open, close outside, Escape, focus ══════════════════════════════
  console.log("\n══ 9 · apertura, cierre exterior, Escape y foco ══");
  await page.setViewportSize({ width: 1365, height: 900 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(400);
  for (const c of CONTROLS) {
    await page.click(c.trigger);
    await page.waitForSelector(c.menu, { state: "visible", timeout: 10_000 });
    await page.mouse.click(300, 600);
    await page.waitForTimeout(300);
    const goneOutside =
      (await page.locator(c.menu).count()) === 0 || !(await page.locator(c.menu).first().isVisible());
    check("outside-closes", "interaction", goneOutside, `${c.id} · un clic fuera lo cierra`, goneOutside ? "cerrado" : "sigue abierto", c.id);

    await page.click(c.trigger);
    await page.waitForSelector(c.menu, { state: "visible", timeout: 10_000 });
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
    const goneEsc =
      (await page.locator(c.menu).count()) === 0 || !(await page.locator(c.menu).first().isVisible());
    const focus = await page.evaluate(() => {
      const a = document.activeElement;
      if (!a || a === document.body) return "(body — foco perdido)";
      return a.getAttribute("aria-label") || a.textContent?.trim().slice(0, 28) || a.tagName.toLowerCase();
    });
    check("escape-closes", "interaction", goneEsc, `${c.id} · Escape lo cierra`, goneEsc ? "cerrado" : "sigue abierto", c.id);
    check("focus-kept", "interaction", !focus.startsWith("(body"), `${c.id} · el foco no se pierde tras Escape`, `foco en ${focus}`, c.id);
  }
} catch (err) {
  // Assertions never throw, so anything here is the bench, not the product.
  benchError = err instanceof BenchError ? err : new BenchError("run", err);
} finally {
  await context.close().catch(() => {});
  await browser.close();
}

// ── verdict ─────────────────────────────────────────────────────────────────
console.log("\n══ resumen ══");
for (const n of notes) console.log(`  nota · ${n}`);
for (const n of notMeasured) console.log(`  NO MEDIDO · ${n}`);

if (benchError) {
  console.log(`  BANCO · fallo de preparación/ejecución en fase «${benchError.phase}»`);
  console.log(`          ${benchError.message}`);
  console.error(
    "\nERROR DE BANCO: la suite no llegó a medir. Esto no dice nada sobre el apilamiento\n" +
      "y no puede sustituir a la evidencia de un control negativo.",
  );
  process.exit(3);
}

const layeringFailures = failures.filter((f) => LAYERING_IDS.has(f.id));
console.log(
  `  comprobaciones: ${checks} · fallos: ${failures.length} (de apilamiento: ${layeringFailures.length})`,
);
for (const f of failures) console.log(`  FAIL  · [${f.category}/${f.id}] ${f.text}`);

console.log(`\n  LAYERING_REGRESSION = ${failures.length === 0 ? "PASS" : "FAIL"}`);
console.log(
  `  MOOD_VIEWPORT = ${failures.some((f) => f.id === "off-viewport") ? "FAIL" : "PASS"}`,
);

if (SCOPE) {
  // An off-screen menu must be REPORTED, never swallowed. WS-01B used to be
  // excused here; now nothing is, and this control is what proves the check
  // can still see an overflow when one exists.
  const caught = failures.filter((k) => k.control === "ambiente" && k.id === "off-viewport");
  if (caught.length === 0) {
    console.error(
      "\nCONTROL DE ALCANCE FALLIDO: el desbordamiento simulado de ambiente no se reportó como fallo.",
    );
    process.exit(1);
  }
  console.log(
    `\nCONTROL DE ALCANCE OK: el desbordamiento de ambiente se reportó como fallo (${caught.length}).`,
  );
  process.exit(0);
}

if (NEGATIVE) {
  // Valid only when every leg holds. A green run, or a run that only failed
  // because the bench broke, means these checks cannot see the defect.
  const legs = [
    ["A · se alcanzó el escenario de medición", reachedScenario],
    ["B · la causa original quedó aplicada (topbar z=20, lector top=0)", causeObserved],
    ["C · falló al menos una comprobación de apilamiento", layeringFailures.length > 0],
    ["D · no se usó un error de banco como evidencia", benchError === null],
  ];
  for (const [what, ok] of legs) console.log(`  ${ok ? "ok   " : "FAIL "} ${what}`);
  if (legs.every(([, ok]) => ok)) {
    console.log(
      `\nCONTROL NEGATIVO OK: la causa original produce ${layeringFailures.length} fallo(s) de apilamiento.`,
    );
    process.exit(0);
  }
  console.error(
    "\nCONTROL NEGATIVO INVÁLIDO: no se demostró la regresión de apilamiento con la causa original.",
  );
  process.exit(1);
}

process.exit(failures.length === 0 ? 0 : 1);
