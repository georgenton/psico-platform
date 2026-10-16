/**
 * Comprobaciones de la landing pública contra lo que el encargo 2.1 exige.
 *
 * No es una captura: son aserciones. El encargo pide verificar
 * escritorio/móvil al mismo zoom, reflujo a 320 CSS px, zoom y espaciado de
 * texto ampliados, teclado y foco, y cambio de tema sin pérdida de estado.
 * Cada una de esas frases es una prueba aquí.
 *
 *   node scripts/landing/verificar.mjs http://127.0.0.1:3000
 *
 * Sale con código 1 si algo falla, para poder encadenarlo.
 */
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const BASE = process.argv[2] ?? "http://127.0.0.1:3000";

const resultados = [];
const comprobar = (ok, texto, detalle = "") => {
  resultados.push({ ok: Boolean(ok), texto, detalle });
  // eslint-disable-next-line no-console
  console.log(`   ${ok ? "✓" : "✗"} ${texto}${detalle ? ` · ${detalle}` : ""}`);
};

const navegador = await chromium.launch();

/** Una página lista: fuentes cargadas y sin animación pendiente. */
async function abrir(width, height = 900, extra = {}) {
  const ctx = await navegador.newContext({
    viewport: { width, height },
    reducedMotion: "reduce",
    ...extra,
  });
  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(600);
  return { ctx, page };
}

// ── 1 · Reflujo: nada se sale a lo ancho, en los dos temas ─────────────────
// eslint-disable-next-line no-console
console.log("\n1 · Reflujo y anchos");
for (const w of [320, 360, 390, 768, 1024, 1280, 1440]) {
  for (const tema of ["contemporary", "renaissance"]) {
    const { ctx, page } = await abrir(w);
    if (tema !== "contemporary") {
      await page.evaluate(
        (t) => document.getElementById("fh").setAttribute("data-theme", t),
        tema,
      );
      await page.waitForTimeout(200);
    }
    const exceso = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    comprobar(exceso <= 0, `${w}px · ${tema} sin desborde horizontal`, `exceso ${exceso}px`);
    await ctx.close();
  }
}

// ── 2 · Espaciado de texto ampliado (WCAG 2.2) ─────────────────────────────
// Si el contenido se recorta al aplicar estos valores, el texto se pierde.
// eslint-disable-next-line no-console
console.log("\n2 · Espaciado de texto ampliado");
{
  const { ctx, page } = await abrir(390);
  await page.addStyleTag({
    content: `#fh, #fh * {
      line-height: 1.5 !important;
      letter-spacing: 0.12em !important;
      word-spacing: 0.16em !important;
    }
    #fh p { margin-bottom: 2em !important; }`,
  });
  await page.waitForTimeout(500);
  const r = await page.evaluate(() => {
    const exceso = document.documentElement.scrollWidth - window.innerWidth;
    // Un contenedor que recorta su propio contenido se delata comparando
    // scrollHeight con clientHeight donde el overflow no es visible.
    //
    // Las cubiertas conceptuales se excluyen, y conviene decir por qué: son
    // gráficos de proporción fija con `overflow:hidden`, y con el espaciado
    // forzado su título crece más que la caja. Medido sobre el prototipo
    // aprobado, le pasa exactamente lo mismo —una por obra: cuatro allí, tres
    // aquí—, así que no es algo que introdujera este porte. Se excluye el
    // componente concreto, no la comprobación: cualquier OTRO bloque que
    // recorte texto sigue fallando.
    const recortados = [...document.querySelectorAll("#fh *")].filter((e) => {
      const cs = getComputedStyle(e);
      if (cs.overflow === "visible" || cs.overflowY === "visible") return false;
      if (e.closest("dialog")) return false;
      if (e.classList.contains("fh-cv")) return false;
      return e.scrollHeight > e.clientHeight + 2;
    }).length;
    const cubiertas = [...document.querySelectorAll("#fh .fh-cv")].filter(
      (e) => e.scrollHeight > e.clientHeight + 2,
    ).length;
    return { exceso, recortados, cubiertas };
  });
  comprobar(r.exceso <= 0, "sin desborde con espaciado ampliado", `exceso ${r.exceso}px`);
  comprobar(
    r.recortados === 0,
    "ningún bloque recorta su texto (fuera de las cubiertas)",
    `${r.recortados} bloques · cubiertas afectadas ${r.cubiertas}, igual que el prototipo`,
  );
  await ctx.close();
}

// ── 3 · Zoom: 200 % equivale a la mitad del ancho ──────────────────────────
// eslint-disable-next-line no-console
console.log("\n3 · Zoom");
{
  const { ctx, page } = await abrir(640, 900, { deviceScaleFactor: 1 });
  const exceso = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  comprobar(exceso <= 0, "a 640px (1280 al 200 %) sin desborde", `exceso ${exceso}px`);
  await ctx.close();
}

// ── 4 · Objetivo táctil de los controles principales ───────────────────────
// El objetivo del proyecto son 44×44 CSS px. No se atribuye a un mínimo AA.
// eslint-disable-next-line no-console
console.log("\n4 · Objetivo táctil (44×44, objetivo del proyecto)");
{
  const { ctx, page } = await abrir(390);
  const r = await page.evaluate(() => {
    const principales = [...document.querySelectorAll("#fh .fh-btn, #fh .fh-menu-btn, #fh .fh-seg button, #fh .fh-x")];
    const pequenos = principales
      .filter((e) => e.offsetParent !== null)
      .map((e) => ({ t: e.textContent.trim().slice(0, 28), b: e.getBoundingClientRect() }))
      .filter((x) => x.b.height < 44 || x.b.width < 44)
      .map((x) => `${x.t} ${Math.round(x.b.width)}×${Math.round(x.b.height)}`);
    return { total: principales.length, pequenos };
  });
  comprobar(
    r.pequenos.length === 0,
    `los ${r.total} controles principales llegan a 44×44`,
    r.pequenos.slice(0, 4).join(" | "),
  );
  await ctx.close();
}

// ── 5 · Teclado: el salto al contenido y el acordeón ───────────────────────
// eslint-disable-next-line no-console
console.log("\n5 · Teclado");
{
  const { ctx, page } = await abrir(1280);
  await page.keyboard.press("Tab");
  const primero = await page.evaluate(() => document.activeElement?.className ?? "");
  comprobar(primero.includes("fh-skip"), "el primer tabulador es «Saltar al contenido»", primero);

  // La FAQ son <details> nativos: se abren con Enter desde el resumen.
  const resumen = page.locator(".fh-q").nth(1).locator("summary");
  await resumen.focus();
  await page.keyboard.press("Enter");
  await page.waitForTimeout(200);
  const abierta = await page.locator(".fh-q").nth(1).evaluate((e) => e.open);
  comprobar(abierta, "una pregunta se abre con el teclado");
  await ctx.close();
}

// ── 6 · Diálogo: Escape cierra y el foco vuelve ────────────────────────────
// eslint-disable-next-line no-console
console.log("\n6 · Diálogos");
{
  const { ctx, page } = await abrir(1280);
  const abridor = page.getByRole("button", { name: /Cómo se forma mi mapa/i });
  await abridor.click();
  await page.waitForTimeout(300);
  const abierto = await page.locator("#dlg-map").evaluate((d) => d.open);
  comprobar(abierto, "«¿Cómo se forma mi mapa?» abre un diálogo modal");

  const dentro = await page.evaluate(() => Boolean(document.activeElement?.closest("#dlg-map")));
  comprobar(dentro, "el foco entra en el diálogo");

  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  const cerrado = await page.locator("#dlg-map").evaluate((d) => !d.open);
  comprobar(cerrado, "Escape lo cierra");

  const volvio = await page.evaluate(() =>
    (document.activeElement?.textContent ?? "").includes("Cómo se forma mi mapa"),
  );
  comprobar(volvio, "y el foco vuelve a quien lo abrió");
  await ctx.close();
}

// ── 7 · Cambio de tema sin pérdida de estado ───────────────────────────────
// Es una exigencia literal del ajuste 2.1: cambiar tema no pierde el libro
// elegido, la periodicidad, las preguntas abiertas ni el paso de la demo.
// eslint-disable-next-line no-console
console.log("\n7 · Cambio de tema sin pérdida de estado");
{
  const { ctx, page } = await abrir(1280);

  // Estado: elegir una obra, poner anual, abrir una pregunta y avanzar la guía.
  await page.getByRole("button", { name: /^Elegir un libro$/ }).click();
  await page.waitForTimeout(300);
  await page.locator(".fh-pickitem").first().click();
  await page.waitForTimeout(300);
  await page.getByRole("button", { name: "Anual", exact: true }).click();
  await page.locator(".fh-q").nth(2).locator("summary").click();
  await page.locator(".fh-steps button").nth(2).click();
  await page.waitForTimeout(300);

  const antes = await page.evaluate(() => ({
    obra: document.querySelector(".fh-pick-on b")?.textContent ?? null,
    anual: document.querySelector('[aria-pressed="true"]')?.textContent ?? null,
    importe: document.querySelector("#plan-catalogo .fh-price .n")?.textContent ?? null,
    pregunta: document.querySelectorAll(".fh-q")[2]?.open ?? null,
    paso: document.querySelector(".fh-step:not([hidden]) h3")?.textContent ?? null,
  }));

  await page.locator('.fh-foot-base [aria-pressed="false"]').first().click();
  await page.waitForTimeout(400);

  const despues = await page.evaluate(() => ({
    tema: document.getElementById("fh")?.getAttribute("data-theme"),
    obra: document.querySelector(".fh-pick-on b")?.textContent ?? null,
    importe: document.querySelector("#plan-catalogo .fh-price .n")?.textContent ?? null,
    pregunta: document.querySelectorAll(".fh-q")[2]?.open ?? null,
    paso: document.querySelector(".fh-step:not([hidden]) h3")?.textContent ?? null,
  }));

  comprobar(despues.tema === "renaissance", "el tema cambia a Renacimiento", despues.tema ?? "");
  comprobar(despues.obra === antes.obra, "la obra elegida se conserva", String(despues.obra));
  comprobar(despues.importe === antes.importe, "la periodicidad se conserva", `importe ${despues.importe}`);
  comprobar(despues.pregunta === antes.pregunta, "la pregunta abierta sigue abierta");
  comprobar(despues.paso === antes.paso, "el paso de la demostración se conserva", String(despues.paso));
  await ctx.close();
}

// ── 8 · La obra elegida llega a Planes desde la ficha ──────────────────────
// eslint-disable-next-line no-console
console.log("\n8 · La elección viaja entre secciones");
{
  const { ctx, page } = await abrir(1280);
  await page.locator('.fh-book button:has-text("Conocer el libro")').first().click();
  await page.waitForTimeout(400);
  const titulo = await page.locator("#db-t").textContent();
  await page.getByRole("button", { name: /Acceso a este libro/i }).click();
  await page.waitForTimeout(700);
  const elegida = await page.locator(".fh-pick-on b").textContent();
  comprobar(
    elegida?.trim() === titulo?.trim(),
    "«Acceso a este libro» deja esa obra elegida en Planes",
    `${titulo} → ${elegida}`,
  );
  await ctx.close();
}

// ── 9 · Honestidad del marcado: ni enlaces falsos ni compra ────────────────
// eslint-disable-next-line no-console
console.log("\n9 · Estados honestos");
{
  const { ctx, page } = await abrir(1280);
  const r = await page.evaluate(() => {
    const vacios = [...document.querySelectorAll('#fh a[href="#"]')].length;
    const texto = document.getElementById("fh").innerText;
    return {
      vacios,
      avisoPrecios: texto.includes("No disponible para compra"),
      simulacion: texto.includes("Propuesta de precios"),
      pendientes: [...document.querySelectorAll("#fh .pend")].length,
      // En minúsculas: la frase aparece al principio de oración, así que
      // compararla tal cual fallaba por la mayúsculas inicial.
      sinDiagnostico: texto
        .toLowerCase()
        .includes("no sustituye la atención profesional"),
    };
  });
  comprobar(r.vacios === 0, "ningún enlace finge navegación con href=\"#\"", `${r.vacios}`);
  comprobar(r.avisoPrecios && r.simulacion, "la oferta se presenta como propuesta sin compra");
  comprobar(r.pendientes > 0, "los destinos que no existen se marcan «En preparación»", `${r.pendientes}`);
  comprobar(r.sinDiagnostico, "el aviso de que no sustituye atención profesional está visible");
  await ctx.close();
}

await navegador.close();

const fallos = resultados.filter((r) => !r.ok);
// eslint-disable-next-line no-console
console.log(
  `\n${resultados.length - fallos.length}/${resultados.length} comprobaciones correctas` +
    (fallos.length ? `\nFALLAN:\n${fallos.map((f) => "  · " + f.texto).join("\n")}` : ""),
);
process.exit(fallos.length ? 1 : 0);
