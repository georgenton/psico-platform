/**
 * Captura una de las dos caras del paquete de revisión: la referencia aprobada
 * o la implementación, a los mismos tamaños, temas y zoom.
 *
 *   node scripts/landing/capturar.mjs <urlBase> <dirSalida> <etiqueta> <temas>
 *
 *   urlBase    de dónde capturar. El espejo de la referencia servido en local,
 *              o la landing construida. Nunca un origen remoto: lo que se
 *              compara tiene que ser lo que hay en el disco.
 *   dirSalida  a dónde escribir los PNG.
 *   etiqueta   prefijo del archivo: `ref` o `imp`.
 *   temas      lista separada por comas, p. ej. `contemporary,renaissance`.
 *
 * Guarda a disco. Las imágenes no pasan por el contexto del modelo: lo que se
 * razona son los números del informe, y las capturas las mira una persona.
 *
 * Lo que produce aquí es exactamente lo que `paquete-revision.mjs` espera
 * encontrar, junto con `comprobaciones.txt` de `verificar.mjs`.
 *
 * Dos cuidados aprendidos midiendo, los dos capaces de falsear una comparación
 * sin dar ningún síntoma:
 *
 *  · El tema no vive en el mismo sitio en los dos lados. El prototipo lo lleva
 *    en `<html>`; la implementación, en el envoltorio `#fh`. Si se escribe sólo
 *    en uno, la captura de Renacimiento sale en Contemporary y parece idéntica
 *    porque LO ES: es la misma imagen dos veces.
 *
 *  · Las cuatro familias se piden a Google Fonts. Sin esperar a que estén
 *    listas, la captura mide con las de respaldo y toda diferencia de altura
 *    que se observe después es ruido del momento de la foto.
 */
import { mkdir } from "node:fs/promises";

// `playwright` es CommonJS: importado así, lo exportado cae en `.default`.
// El quinto argumento permite apuntar a una instalación concreta cuando se
// ejecuta desde fuera del workspace, donde la resolución por nombre no aplica.
const mod = await import(process.argv[6] ?? "playwright");
const chromium = mod.chromium ?? mod.default?.chromium;

const URL_BASE = process.argv[2];
const SALIDA = process.argv[3];
const ETIQUETA = process.argv[4] ?? "ref";
const TEMAS = (process.argv[5] ?? "contemporary").split(",");

if (!URL_BASE || !SALIDA) {
  // eslint-disable-next-line no-console
  console.error(
    "uso: capturar.mjs <urlBase> <dirSalida> [etiqueta] [temas] [rutaPlaywright]",
  );
  process.exit(2);
}

const TAMANOS = [
  { nombre: "escritorio-1440", width: 1440, height: 900 },
  { nombre: "escritorio-1280", width: 1280, height: 900 },
  { nombre: "tableta-768", width: 768, height: 1024 },
  { nombre: "movil-390", width: 390, height: 844 },
  { nombre: "reflujo-320", width: 320, height: 844 },
];

const SECCIONES = [
  "top",
  "libro",
  "biblioteca",
  "mapa",
  "historia",
  "duo",
  "planes",
  "faq",
];

await mkdir(SALIDA, { recursive: true });
const navegador = await chromium.launch();
const informe = [];

for (const tema of TEMAS) {
  for (const t of TAMANOS) {
    const ctx = await navegador.newContext({
      viewport: { width: t.width, height: t.height },
      deviceScaleFactor: 2,
      reducedMotion: "reduce",
    });
    const page = await ctx.newPage();
    await page.goto(URL_BASE, { waitUntil: "load" });
    if (tema !== "contemporary") {
      await page.evaluate((v) => {
        const destino =
          document.getElementById("fh") ?? document.documentElement;
        destino.setAttribute("data-theme", v);
      }, tema);
    }
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(600);

    const sufijo = TEMAS.length > 1 ? `-${tema}` : "";
    await page.screenshot({
      path: `${SALIDA}/${ETIQUETA}-${t.nombre}${sufijo}-completa.png`,
      fullPage: true,
    });

    const alto = await page.evaluate(
      () => document.documentElement.scrollHeight,
    );
    const desborde = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    );
    informe.push({
      tema,
      tamano: t.nombre,
      altoPx: alto,
      desbordeHorizontal: desborde,
    });

    for (const id of SECCIONES) {
      const el = await page.$(`#${id}`);
      if (!el) continue;
      await el
        .screenshot({
          path: `${SALIDA}/${ETIQUETA}-${t.nombre}${sufijo}-${id}.png`,
        })
        .catch(() => {});
    }
    await ctx.close();
  }
}

await navegador.close();
// eslint-disable-next-line no-console
console.log(JSON.stringify(informe, null, 1));
