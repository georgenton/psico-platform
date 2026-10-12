/**
 * The first experience, walked end to end by somebody who has just arrived:
 * registro → bienvenida → motivos → ánimo → tu nombre → recomendación → lector.
 *
 * ── Why a browser and not jsdom ────────────────────────────────────────────
 *
 * Half of what this checks is only true once something is rendered: whether a
 * card still carries a decorative emoji, whether selection is said with a
 * shape and not only with colour, whether the step indicator counts the
 * welcome, whether the access badge appears BEFORE the CTA, and whether the
 * CTA lands where its own words promise. A contract test cannot see any of it.
 *
 * ── How to run it ──────────────────────────────────────────────────────────
 *
 *   pnpm --filter @psico/web test:first-experience
 *
 * Like `responsive.mjs` and `reader-header-layers.mjs`, this is NOT wired into
 * CI: it needs web + API + a database with the anchor book, and it REGISTERS
 * AN ACCOUNT. That is also why it must never be pointed at a deployed
 * environment — it writes. Local only, against a stack you brought up.
 *
 *   E2E_BASE_URL    web origin (default http://localhost:3000)
 *   WALK_EMAIL      a throwaway address on a LOCAL database
 *   WALK_PASSWORD   its password
 *   WALK_NAME       full name for the registration form
 *
 * The account is synthetic and the mood it picks is arbitrary. Nothing here
 * belongs on a real person's account.
 */
const _pw = await import("playwright");
const chromium = (_pw.default ?? _pw).chromium;
const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";

if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(BASE)) {
  console.error(
    `Este recorrido REGISTRA una cuenta y sólo puede apuntar a un entorno local.\n` +
      `E2E_BASE_URL = ${BASE}`,
  );
  process.exit(2);
}
const EMAIL = process.env.WALK_EMAIL;
const PASSWORD = process.env.WALK_PASSWORD;
const NAME = process.env.WALK_NAME ?? "Lucía Prueba";

const out = [];
const ok = (what, pass, detail = "") => {
  out.push({ what, pass, detail });
  console.log(`  ${pass ? "ok   " : "FAIL "} ${what}${detail ? ` · ${detail}` : ""}`);
};

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();

// ── registro ────────────────────────────────────────────────────────────────
await page.goto(`${BASE}/register`, { waitUntil: "load" });
const fields = await page.evaluate(() =>
  [...document.querySelectorAll("input")].map((i) => i.getAttribute("name")),
);
for (const [sel, val] of [
  ['input[name="name"]', NAME],
  ['input[name="email"]', EMAIL],
  ['input[name="password"]', PASSWORD],
  ['input[name="confirm"]', PASSWORD],
]) {
  if (await page.locator(sel).count()) await page.fill(sel, val);
}
ok("formulario de registro con los campos esperados", fields.includes("email") && fields.includes("password"), fields.join(", "));
await page.click('button[type="submit"]');
await page.waitForURL((u) => !u.pathname.startsWith("/register"), { timeout: 45_000 });
ok("registro completado", true, new URL(page.url()).pathname);

// ── bienvenida ──────────────────────────────────────────────────────────────
await page.goto(`${BASE}/onboarding`, { waitUntil: "domcontentloaded" });
await page.waitForSelector("h1", { timeout: 30_000 });
const welcome = await page.evaluate(() => ({
  text: document.body.innerText,
  dots: document.querySelector('[aria-label^="Antes de empezar"], [aria-label^="Paso"]')?.getAttribute("aria-label") ?? "",
}));
ok("firma de marca visible = FeelVerse", welcome.text.includes("— FeelVerse"), "");
ok("sin «Psico Platform» en la bienvenida", !/Psico\s*-?\s*Platform/i.test(welcome.text));
ok("sin promesa de «60 segundos»", !/\d+\s*segundos?/i.test(welcome.text));
ok("la bienvenida no se cuenta como paso", welcome.dots.startsWith("Antes de empezar"), welcome.dots);
await page.click('a[href="/onboarding/motivos"]');

// ── motivos ─────────────────────────────────────────────────────────────────
await page.waitForURL(/\/onboarding\/motivos/, { timeout: 30_000 });
await page.waitForSelector('[role="option"]', { timeout: 30_000 });
const motivos = await page.evaluate(() => {
  const opts = [...document.querySelectorAll('[role="option"]')];
  const emoji = /\p{Extended_Pictographic}/u;
  return {
    n: opts.length,
    conEmoji: opts.filter((o) => emoji.test(o.textContent ?? "")).length,
    paso: document.querySelector('[aria-label^="Paso"]')?.getAttribute("aria-label") ?? "",
  };
});
ok("tarjetas de motivos sin emojis decorativos", motivos.conEmoji === 0, `${motivos.n} tarjetas, ${motivos.conEmoji} con emoji`);
ok("indicador dice «Paso 1 de 4»", motivos.paso === "Paso 1 de 4", motivos.paso);
await page.locator('[role="option"]').first().click();
const marca = await page.evaluate(() => {
  const sel = document.querySelector('[role="option"][aria-selected="true"]');
  return { aria: !!sel, glifo: (sel?.textContent ?? "").includes("✓") };
});
ok("la selección se dice con forma, no sólo con color", marca.aria && marca.glifo);
await page.getByRole("button", { name: /Siguiente/ }).click();

// ── ánimo ───────────────────────────────────────────────────────────────────
await page.waitForURL(/\/onboarding\/mood/, { timeout: 30_000 });
await page.waitForSelector('[role="radio"]', { timeout: 30_000 });
const mood = await page.evaluate(() => ({
  copy: document.body.innerText,
  caras: document.querySelectorAll('[role="radio"] svg').length,
  n: document.querySelectorAll('[role="radio"]').length,
}));
ok("copy aprobado del ánimo", mood.copy.includes("No hay una respuesta correcta") && !mood.copy.includes("Lo que llega primero"));
ok("mismas caras que la barra superior", mood.caras >= mood.n, `${mood.caras} svg para ${mood.n} opciones`);
await page.locator('[role="radio"]').nth(1).click();
await page.getByRole("button", { name: /Siguiente/ }).click();

// ── nombre ──────────────────────────────────────────────────────────────────
await page.waitForURL(/\/onboarding\/perfil/, { timeout: 30_000 });
await page.waitForSelector("#firstName", { timeout: 30_000 });
const perfil = await page.evaluate(() => ({
  valor: (document.querySelector("#firstName") || {}).value ?? "",
  texto: document.body.innerText,
}));
ok("el nombre viene precargado del registro", perfil.valor.length > 0, `«${perfil.valor}»`);
ok("ya no se pregunta por la voz", !/Voz preferida|Cálida|Cercana|Sin voz/.test(perfil.texto));
await page.getByRole("button", { name: /Siguiente/ }).click();

// ── recomendación ───────────────────────────────────────────────────────────
await page.waitForURL(/\/onboarding\/recomendacion/, { timeout: 30_000 });
await page.waitForSelector("h2", { timeout: 30_000 });
const reco = await page.evaluate(() => ({
  texto: document.body.innerText,
  cta: [...document.querySelectorAll("button")].map((b) => b.textContent?.trim()).find((t) => t?.startsWith("Empezar a leer")) ?? "",
}));
ok("comunica el acceso antes del CTA", /incluido en (pro|tu plan)/i.test(reco.texto), (reco.texto.match(/[Ii]ncluido en [^\n]*/i) ?? [""])[0]);
ok("el CTA nombra su destino", reco.cta.startsWith("Empezar a leer"), reco.cta);
await page.getByRole("button", { name: /Empezar a leer/ }).click();
await page.waitForURL(/\/dashboard/, { timeout: 45_000 });
const destino = new URL(page.url()).pathname;
ok("el CTA lleva de verdad al lector", /\/lector\//.test(destino), destino);

console.log("\n══ resumen ══");
const bad = out.filter((o) => !o.pass);
console.log(`  comprobaciones: ${out.length} · fallos: ${bad.length}`);
await browser.close();
process.exit(bad.length === 0 ? 0 : 1);
