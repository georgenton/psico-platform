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
 * engine. A jsdom test asserting `className` contains `z-35` would assert
 * nothing about whether a person can pick «Renacimiento».
 *
 * Like `responsive.mjs` this is deliberately OUT of the default `pnpm test`
 * graph: Playwright browsers are a heavy install that the repo's CI does not
 * provision. Run it against a stack you already have up:
 *
 *   pnpm --filter @psico/web test:reader-layers
 *
 * with, at minimum:
 *
 *   E2E_BASE_URL        web origin        (default http://localhost:3000)
 *   E2E_EMAIL           account to log in (required unless E2E_STORAGE_STATE)
 *   E2E_PASSWORD        its password      (idem)
 *   E2E_STORAGE_STATE   reuse a saved Playwright session instead of logging in
 *   E2E_BOOK_SLUG       default emociones-en-construccion
 *   E2E_CHAPTER         default 1
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
 * hit test at each option's own centre, and the real click is kept on top of
 * it. No `force`, no `dispatchEvent`, no `element.click()` from `evaluate`.
 *
 * ── The negative control ───────────────────────────────────────────────────
 *
 * `--negative-control` injects the ORIGINAL cause back into the page — the bar
 * at `z-index: 20`, the reader header at `top: 0` — and asserts the checks go
 * red. It only ever restores the defect; it never clears a menu to make a
 * check pass. Isolated to this browser context: nothing is written to any
 * environment.
 */

const NEGATIVE = process.argv.includes("--negative-control");

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const EMAIL = process.env.E2E_EMAIL;
const PASSWORD = process.env.E2E_PASSWORD;
const STATE = process.env.E2E_STORAGE_STATE;
const BOOK = process.env.E2E_BOOK_SLUG ?? "emociones-en-construccion";
const CHAPTER = process.env.E2E_CHAPTER ?? "1";
const READER = `${BASE}/dashboard/biblioteca/${BOOK}/lector/${CHAPTER}`;

/** The reader's sticky header. Matches before and after the fix. */
const READER_BAR = "header.sticky.z-30";

/** Exactly the pre-fix declarations, nothing else. */
const ORIGINAL_CAUSE = `
  .topbar { z-index: 20 !important; }
  ${READER_BAR} { top: 0 !important; }
`;

if (!STATE && (!EMAIL || !PASSWORD)) {
  console.error(
    "E2E_EMAIL and E2E_PASSWORD are required (or E2E_STORAGE_STATE). See the header of this file.",
  );
  process.exit(2);
}

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

// ── the three global controls ───────────────────────────────────────────────
const CONTROLS = [
  {
    id: "ánimo",
    trigger: ".mood-chip",
    menu: ".mood-pop.open",
    option: ".mp-opt",
    // Picking a mood records state, so the effect check reads the chip's label.
    state: () => document.querySelector(".mood-chip .mc-txt")?.textContent?.trim() ?? "",
  },
  {
    id: "ambiente",
    trigger: 'button[aria-label^="Ambiente:"]',
    menu: '[role="menu"][aria-label="Selecciona un ambiente"]',
    option: '[role="menuitemradio"]',
    state: () => [...document.body.classList].filter((c) => c.startsWith("amb-")).join(","),
  },
  {
    id: "estilo",
    trigger: 'button[aria-label^="Estilo:"]',
    menu: '[role="menu"][aria-label="Selecciona un estilo visual"]',
    option: '[role="menuitemradio"]',
    state: () => document.documentElement.dataset.theme ?? "",
  },
];

// ── page-side measurements ──────────────────────────────────────────────────

/** Does `sel` create a stacking context, and is it trapped inside one? */
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
        el: n.tagName.toLowerCase() + "." + (typeof n.className === "string" ? n.className : "").trim().split(/\s+/)[0],
        z: f.z,
        why: f.why.join("+"),
      };
      break;
    }
  }
  return { ...self, why: self.why.join("+") || "-", trappedIn };
}

/** Vertical overlap, in px, between the global bar and the reader's header. */
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

/** Per-option hit test at each option's own centre, plus a grid over the menu. */
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

  const options = [...menu.querySelectorAll(optSel)].map((o, i) => {
    const r = o.getBoundingClientRect();
    const cx = Math.round(r.left + r.width / 2);
    const cy = Math.round(r.top + r.height / 2);
    const inView = cx >= 0 && cy >= 0 && cx <= innerWidth && cy <= innerHeight;
    const hit = inView ? document.elementFromPoint(cx, cy) : null;
    return {
      i,
      label: (o.getAttribute("aria-label") || o.textContent || "").trim().replace(/\s+/g, " ").slice(0, 20),
      w: Math.round(r.width),
      h: Math.round(r.height),
      inView,
      active: o.getAttribute("aria-checked") === "true" || o.classList.contains("on"),
      reachable: inView && belongs(hit, o),
      coveredByBar: onBar(hit),
      topmost: name(hit),
    };
  });

  // A grid over the menu's own rectangle: nothing inside it may belong to the
  // reader bar. This catches a menu that is half-hidden even where its options
  // happen to clear the bar.
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
    options,
    probes,
    coveredByBar,
    // Distinguishes stacking from clipping: a clipped menu is not laid out to
    // its full size, and an ancestor's box cuts it.
    clipped: (() => {
      for (let n = menu.parentElement; n; n = n.parentElement) {
        const cs = getComputedStyle(n);
        if (cs.overflowX === "visible" && cs.overflowY === "visible") continue;
        const nr = n.getBoundingClientRect();
        if (m.left < nr.left - 1 || m.right > nr.right + 1 || m.top < nr.top - 1 || m.bottom > nr.bottom + 1) {
          return `${name(n)}[${cs.overflowX}/${cs.overflowY}]`;
        }
      }
      return null;
    })(),
  };
}

/** Is `sel` the topmost thing at the given viewport point? */
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

// ── reporting ───────────────────────────────────────────────────────────────
const failures = [];
const notes = [];
const known = [];
let checks = 0;

function check(ok, what, detail) {
  checks += 1;
  if (!ok) failures.push(`${what} — ${detail}`);
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${detail ? ` · ${detail}` : ""}`);
  return ok;
}

/**
 * A defect that is real, measured and NOT this file's subject. It is printed
 * and counted, and it does not decide the exit code — otherwise the suite
 * could never be green while a separate, out-of-scope bug is open, and would
 * stop being usable as a gate for the one invariant it does own.
 */
function knownDefect(ok, what, detail, owner) {
  if (!ok) known.push(`${what} — ${detail} · ${owner}`);
  console.log(`  ${ok ? "ok  " : "KNOWN"} ${what}${detail ? ` · ${detail}` : ""}`);
  return ok;
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
  await page.goto(`${BASE}/login`, { waitUntil: "load" });
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => u.pathname.startsWith("/dashboard"), { timeout: 45_000 });
}

/** Land on the reader with `theme` applied, settled and ready to measure. */
async function openReader({ theme } = {}) {
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
  // `.screen` animates a transform for 400 ms, which is itself a stacking
  // context while it runs. Measure the settled page, not the transition.
  await page.waitForTimeout(900);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(150);
}

/** Open a control, measure it, pick an option for real, and close it. */
async function exerciseControl(page, c, { label, effect = true }) {
  await page.click(c.trigger);
  await page.waitForSelector(c.menu, { state: "visible", timeout: 10_000 });
  const r = await page.evaluate(menuReach, [c.menu, c.option, READER_BAR]);
  if (r.error) {
    check(false, `${label} · ${c.id} · menú presente`, r.error);
    return;
  }

  // Two different ways an option can be unpickable, kept apart on purpose.
  // COVERED is the layering defect this file exists for. OFF-VIEWPORT is the
  // ánimo popover being 322 px wide and anchored to the right of a narrow
  // screen, which pushes its first faces past the left edge; measured
  // identically before and after this fix, so it is not this PR's.
  const covered = r.options.filter((o) => o.inView && !o.reachable);
  const offViewport = r.options.filter((o) => !o.inView);
  check(
    covered.length === 0,
    `${label} · ${c.id} · ninguna de las ${r.options.length} opciones está tapada en su centro`,
    covered.length
      ? `tapadas: ${covered.map((o) => `«${o.label}»→${o.topmost}`).join(", ")}`
      : r.box,
  );
  knownDefect(
    offViewport.length === 0,
    `${label} · ${c.id} · ninguna opción cae fuera del viewport`,
    offViewport.length ? `fuera: ${offViewport.map((o) => `«${o.label}»`).join(", ")}` : "todas dentro",
    "defecto aparte: ancho del popover de ánimo en pantallas estrechas",
  );
  check(
    r.coveredByBar === 0,
    `${label} · ${c.id} · ningún punto del menú cae en la barra del lector`,
    `${r.coveredByBar}/${r.probes} puntos`,
  );
  check(
    r.clipped === null,
    `${label} · ${c.id} · el menú no está recortado por un ancestro`,
    r.clipped ?? "sin ancestro que lo corte",
  );

  if (effect) {
    // Prefer the LAST option that is not already selected: it sits deepest
    // into the band the reader bar used to own, and picking the active one
    // would change nothing and prove nothing. A real mouse click, aimed at
    // that option's own centre.
    const inactive = r.options.filter((o) => !o.active);
    const target = (inactive.length ? inactive : r.options)[
      (inactive.length ? inactive : r.options).length - 1
    ];
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
    check(
      clicked,
      `${label} · ${c.id} · clic real al centro de «${target.label}»`,
      why || "aceptado",
    );
    check(
      before !== after,
      `${label} · ${c.id} · la selección surte efecto`,
      `«${before}» → «${after}»`,
    );
  }

  await page.keyboard.press("Escape").catch(() => {});
  await page.waitForTimeout(250);
  const closed = (await page.locator(c.menu).count()) === 0 || !(await page.locator(c.menu).first().isVisible());
  check(closed, `${label} · ${c.id} · Escape lo cierra`, closed ? "cerrado" : "sigue abierto");
}

try {
  // ══ 1 · the layer facts, stated as numbers ══════════════════════════════
  console.log(
    `\n══ 1 · orden de capas (1365×900, Contemporary)${NEGATIVE ? " · CONTROL NEGATIVO" : ""} ══`,
  );
  await signIn();
  await openReader({ theme: "contemporary" });
  const tb = await page.evaluate(stackingFacts, ".topbar");
  const rb = await page.evaluate(stackingFacts, READER_BAR);
  console.log(`  barra global: z=${tb.z} position=${tb.position} (${tb.why}) · encerrada en ${tb.trappedIn ? `${tb.trappedIn.el}[z=${tb.trappedIn.z}]` : "ningún contexto"}`);
  console.log(`  barra lector: z=${rb.z} position=${rb.position} top=${rb.top} (${rb.why}) · encerrada en ${rb.trappedIn ? `${rb.trappedIn.el}[z=${rb.trappedIn.z}]` : "ningún contexto"}`);
  check(
    Number(tb.z) > Number(rb.z),
    "la barra global supera en capa a la del lector",
    `${tb.z} vs ${rb.z}`,
  );
  // The menus live inside the bar's stacking context, so the bar's own z-index
  // is what actually decides their paint order. Stated here so a future change
  // to the bar cannot quietly re-open this defect.
  const menuTrap = await page.evaluate(async (sel) => {
    document.querySelector(sel)?.click();
    await new Promise((r) => setTimeout(r, 200));
    const menu = document.querySelector('[role="menu"][aria-label="Selecciona un estilo visual"]');
    if (!menu) return null;
    for (let n = menu.parentElement; n; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.backdropFilter !== "none" || (cs.position !== "static" && cs.zIndex !== "auto")) {
        return { el: (typeof n.className === "string" ? n.className : "").trim().split(/\s+/)[0], z: cs.zIndex };
      }
    }
    return null;
  }, 'button[aria-label^="Estilo:"]');
  if (menuTrap) {
    notes.push(
      `los menús heredan la capa de .${menuTrap.el} (z=${menuTrap.z}); su z-index local no escapa de ahí`,
    );
  }
  await page.keyboard.press("Escape").catch(() => {});

  // ══ 2 · the two bars must not share a band, at any width ════════════════
  console.log("\n══ 2 · bandas de las dos barras ══");
  for (const y of [0, 600]) {
    await page.evaluate((yy) => window.scrollTo(0, yy), y);
    await page.waitForTimeout(300);
    const b = await page.evaluate(barOverlap, READER_BAR);
    check(
      b.overlap === 0,
      `1365×900 · scrollY=${y} · las barras no se solapan`,
      `global ${b.topbar.top}..${b.topbar.bottom} · lector ${b.reader.top}..${b.reader.bottom} · solape ${b.overlap}px`,
    );
  }

  // ══ 3 · the three controls, both themes, desktop ════════════════════════
  console.log("\n══ 3 · los tres selectores · escritorio · Contemporary ══");
  await page.evaluate(() => window.scrollTo(0, 0));
  for (const c of CONTROLS) await exerciseControl(page, c, { label: "1365·contemporary" });

  // ══ 4 · upper layers must still block the global menus ══════════════════
  console.log("\n══ 4 · capas que SÍ deben bloquear ══");
  // The reader's side panel is a fixed, full-height drawer on the right, which
  // is exactly where the three controls live. It must stay on top, including
  // over its own header and close control.
  await page.click('button[aria-label="Abrir panel del lector"]');
  await page.waitForSelector('aside[aria-label^="Panel del lector"]', { timeout: 10_000 });
  const dockPoint = await page.evaluate(({ w }) => ({ x: w - 60, y: 28 }), { w: 1365 });
  const dockTop = await page.evaluate(topmostAt, [
    'aside[aria-label^="Panel del lector"]',
    dockPoint.x,
    dockPoint.y,
  ]);
  check(
    dockTop.onTop,
    "el panel del lector sigue por encima de la barra global",
    `en (${dockPoint.x},${dockPoint.y}) manda ${dockTop.topmost}`,
  );
  const closeReachable = await page.evaluate(topmostAt, ['button[aria-label="Cerrar panel"]', 0, 0]);
  void closeReachable;
  const closeBtn = page.locator('button[aria-label="Cerrar panel"]');
  let dockClosed = true;
  try {
    await closeBtn.click({ timeout: 4000 });
  } catch {
    dockClosed = false;
  }
  check(dockClosed, "el cierre del panel del lector sigue siendo pulsable", dockClosed ? "aceptado" : "interceptado");
  await page.waitForTimeout(400);

  // A route dialog must cover the global bar: two layers capturing focus at
  // once is the failure mode to avoid.
  await page.click('button[aria-label="Preferencias de lectura"]');
  await page.waitForSelector('[role="dialog"][aria-label="Preferencias de lectura"]', { timeout: 10_000 });
  const dialogOverBar = await page.evaluate(topmostAt, [
    '[role="dialog"][aria-label="Preferencias de lectura"]',
    1100,
    28,
  ]);
  check(
    dialogOverBar.onTop,
    "el modal Aa sigue por encima de la barra global",
    `en (1100,28) manda ${dialogOverBar.topmost}`,
  );
  await page.keyboard.press("Escape").catch(() => {});
  await page.waitForTimeout(300);

  // Renaissance, same three controls.
  console.log("\n══ 5 · los tres selectores · escritorio · Renacimiento ══");
  await openReader({ theme: "renaissance" });
  const themeApplied = await page.evaluate(() => document.documentElement.dataset.theme);
  check(themeApplied === "renaissance", "el tema Renacimiento está aplicado", `data-theme=${themeApplied}`);
  for (const c of CONTROLS) await exerciseControl(page, c, { label: "1365·renacimiento" });

  // ══ 6 · Noche, picked through the real menu ═════════════════════════════
  console.log("\n══ 6 · ambiente Noche ══");
  await openReader({ theme: "contemporary" });
  await page.click('button[aria-label^="Ambiente:"]');
  await page.waitForSelector('[role="menu"][aria-label="Selecciona un ambiente"]', { timeout: 10_000 });
  await page.locator('[role="menu"][aria-label="Selecciona un ambiente"] [role="menuitemradio"]').last().click();
  await page.waitForTimeout(1000);
  const noche = await page.evaluate(() => document.body.classList.contains("amb-noche"));
  check(noche, "el ambiente Noche está aplicado", `body.amb-noche=${noche}`);
  for (const c of CONTROLS) await exerciseControl(page, c, { label: "noche", effect: false });

  // ══ 7 · narrow widths, including the two-row bar ════════════════════════
  for (const v of [
    { width: 390, height: 844 },
    { width: 320, height: 720 },
  ]) {
    console.log(`\n══ 7 · ${v.width}×${v.height} ══`);
    await page.setViewportSize(v);
    await openReader();
    const rows = await page.evaluate(() => {
      const tb = document.querySelector(".topbar");
      const tops = new Set(
        [...tb.children]
          .filter((k) => k.getBoundingClientRect().height > 0)
          .map((k) => Math.round(k.getBoundingClientRect().top)),
      );
      return { rows: tops.size, h: Math.round(tb.getBoundingClientRect().height) };
    });
    console.log(`  barra global: ${rows.h}px en ${rows.rows} fila(s)`);
    for (const y of [0, 600]) {
      await page.evaluate((yy) => window.scrollTo(0, yy), y);
      await page.waitForTimeout(300);
      const b = await page.evaluate(barOverlap, READER_BAR);
      check(
        b.overlap === 0,
        `${v.width}px · scrollY=${y} · las barras no se solapan`,
        `lector top=${b.reader.top} · solape ${b.overlap}px`,
      );
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    for (const c of CONTROLS) await exerciseControl(page, c, { label: `${v.width}px`, effect: false });
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
    check(
      b.overlap === 0,
      `tras redimensionar a ${size.width}px · las barras no se solapan`,
      `global h=${b.topbar.h} · lector top=${b.reader.top} · solape ${b.overlap}px`,
    );
  }

  // ══ 9 · open, close outside, Escape, focus ══════════════════════════════
  console.log("\n══ 9 · apertura, cierre exterior, Escape y foco ══");
  await page.setViewportSize({ width: 1365, height: 900 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(400);
  for (const c of CONTROLS) {
    await page.click(c.trigger);
    await page.waitForSelector(c.menu, { state: "visible", timeout: 10_000 });
    // Clicking the reader's body — the area the bar used to sit above — must
    // dismiss the menu rather than be eaten by it.
    await page.mouse.click(300, 600);
    await page.waitForTimeout(300);
    const goneOutside =
      (await page.locator(c.menu).count()) === 0 || !(await page.locator(c.menu).first().isVisible());
    check(goneOutside, `${c.id} · un clic fuera lo cierra`, goneOutside ? "cerrado" : "sigue abierto");

    await page.click(c.trigger);
    await page.waitForSelector(c.menu, { state: "visible", timeout: 10_000 });
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
    const goneEsc =
      (await page.locator(c.menu).count()) === 0 || !(await page.locator(c.menu).first().isVisible());
    const focus = await page.evaluate(() => {
      const a = document.activeElement;
      if (!a || a === document.body) return "(body — foco perdido)";
      return (
        a.getAttribute("aria-label") ||
        a.textContent?.trim().slice(0, 28) ||
        a.tagName.toLowerCase()
      );
    });
    check(goneEsc, `${c.id} · Escape lo cierra`, goneEsc ? "cerrado" : "sigue abierto");
    // Not a new requirement: only that Escape does not strand the keyboard on
    // <body>, which is what "foco coherente" rules out.
    check(!focus.startsWith("(body"), `${c.id} · el foco no se pierde tras Escape`, `foco en ${focus}`);
  }
} catch (err) {
  failures.push(`la ejecución abortó: ${String(err.message || err).replace(/\s+/g, " ").slice(0, 300)}`);
} finally {
  await context.close().catch(() => {});
  await browser.close();
}

console.log("\n══ resumen ══");
for (const n of notes) console.log(`  nota · ${n}`);
console.log(
  `  comprobaciones: ${checks} · fallos: ${failures.length} · defectos conocidos ajenos: ${known.length}`,
);
for (const f of failures) console.log(`  FAIL  · ${f}`);
for (const k of known) console.log(`  KNOWN · ${k}`);

if (NEGATIVE) {
  // With the original cause restored the suite MUST go red; a green run here
  // would mean these checks cannot see the defect they exist for.
  if (failures.length === 0) {
    console.error(
      "\nCONTROL NEGATIVO INVÁLIDO: con la causa original restaurada no falló nada.\n" +
        "Estas comprobaciones no detectan el defecto.",
    );
    process.exit(1);
  }
  console.log(`\nCONTROL NEGATIVO OK: la causa original produce ${failures.length} fallo(s).`);
  process.exit(0);
}

process.exit(failures.length === 0 ? 0 : 1);
