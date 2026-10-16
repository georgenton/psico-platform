/**
 * Arma el paquete de revisión visual de la landing: referencia frente a
 * implementación, a los mismos tamaños y temas, con los números y las
 * comprobaciones al lado.
 *
 * Una sola página para revisar de una vez, que es lo que el encargo pide: ni
 * una aprobación por icono ni por espaciado.
 *
 *   node scripts/landing/paquete-revision.mjs <dirPaquete>
 *
 * El directorio debe contener ya `referencia/`, `implementacion/`,
 * `medidas-*.json` y `comprobaciones.txt`, que produce `capturar`/`verificar`.
 */
import { readFile, readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const DIR = resolve(process.argv[2] ?? ".");

const TAMANOS = [
  ["escritorio-1440", "Escritorio · 1440 px"],
  ["escritorio-1280", "Escritorio · 1280 px"],
  ["tableta-768", "Tableta · 768 px"],
  ["movil-390", "Móvil · 390 px"],
  ["reflujo-320", "Reflujo · 320 px"],
];

const SECCIONES = [
  ["top", "01 · Entrada"],
  ["libro", "02 · Libro y modo guiado"],
  ["biblioteca", "02b · Biblioteca"],
  ["mapa", "03 · Mapa Emocional"],
  ["historia", "03b · Historia"],
  ["duo", "04 · Dúo y Círculos"],
  ["planes", "05 · Planes"],
  ["faq", "06 · Preguntas frecuentes"],
];

const TEMAS = [
  ["contemporary", "Contemporary"],
  ["renaissance", "Renacimiento"],
];

/**
 * Las diferencias conocidas, con su motivo.
 *
 * Se declaran a mano porque son decisiones, no medidas: quien revisa necesita
 * saber por qué difieren, no sólo cuánto.
 */
const DIFERENCIAS = [
  {
    donde: "Biblioteca · número de obras",
    que: "La maqueta muestra cuatro títulos; la implementación, tres.",
    porque:
      "El catálogo confirmado son tres obras: Emociones en construcción y Familias " +
      "ensambladas, de Jorge Quizamanchuro, y Parejas que perduran, de David Jaramillo. " +
      "«Crianza digital» y «Parejas que perdonan» quedan como historia de septiembre, no " +
      "como catálogo autorizado, y no se les asigna equivalencia con otra obra.",
    efecto: "Biblioteca mide una tarjeta menos: −642 px a 390 y −572 a 320.",
  },
  {
    donde: "Biblioteca · autoría",
    que: "Cada tarjeta y cada ficha muestran el autor; la maqueta no lo mostraba.",
    porque:
      "El encargo pide mostrar la autoría «cuando esté verificado», y ahora lo está para " +
      "las tres obras. En septiembre no lo estaba.",
    efecto: "Biblioteca mide una línea más: +32 px a 1440 y +24 a 768.",
  },
  {
    donde: "Cabecera · «Entrar»",
    que: "Es un enlace al acceso real en vez de un aviso.",
    porque:
      "En la maqueta ese botón abría un texto que decía que el prototipo no incluye " +
      "autenticación. El producto sí la tiene, y publicar ese aviso sería publicar una " +
      "señal de trabajo interno como si fuera copy.",
    efecto: "Ninguno en altura.",
  },
  {
    donde: "Demostración · avisos",
    que:
      "«en esta muestra no hay IA conectada» pasa a «aquí no se consulta a Eco»; " +
      "«en esta muestra no hay archivo de audio» pasa a «esta demostración no reproduce " +
      "audio».",
    porque:
      "Describían el prototipo. Lo que es cierto en la página publicada es que la " +
      "demostración no consulta a Eco ni reproduce audio, no que no exista la capacidad.",
    efecto: "Ninguno en altura: la frase se ajustó para ocupar las mismas dos líneas.",
  },
  {
    donde: "Reflujo a 320 px",
    que: "La referencia desborda 17 px; la implementación, 0.",
    porque:
      "El encargo exige comprobar el reflujo citando el criterio del W3C. A 320 px la " +
      "fila de la cabecera no cabe: el botón de menú tiene 44 px de ancho mínimo —el " +
      "objetivo táctil— y su contenido necesita 81. Se aprieta el espaciado de esa fila " +
      "por debajo de 360 px, sin esconder la etiqueta.",
    efecto: "Corrige un defecto de la referencia; no se replica.",
  },
  {
    donde: "Renderizado",
    que: "Biblioteca, planes y preguntas vienen en el HTML servido.",
    porque:
      "En la maqueta los pinta JavaScript sobre puntos de montaje vacíos. Aquí se " +
      "renderizan en el servidor desde los mismos datos, así que funcionan sin JS y los " +
      "ve un buscador. La separación datos/presentación que el encargo pide se conserva.",
    efecto: "Ninguno visual.",
  },
];

function tabla(medidasRef, medidasImpl) {
  const porClave = (xs) => Object.fromEntries(xs.map((x) => [`${x.tema}|${x.tamano}`, x]));
  const r = porClave(medidasRef);
  const i = porClave(medidasImpl);
  const filas = Object.keys(r).map((k) => {
    const [tema, tamano] = k.split("|");
    const a = r[k];
    const b = i[k];
    const d = b.altoPx - a.altoPx;
    return `<tr>
      <td>${tema}</td><td>${tamano}</td>
      <td class="n">${a.altoPx}</td><td class="n">${b.altoPx}</td>
      <td class="n ${d === 0 ? "ok" : "dif"}">${d === 0 ? "=" : (d > 0 ? "+" : "") + d}</td>
      <td class="${a.desbordeHorizontal ? "dif" : "ok"}">${a.desbordeHorizontal ? "sí" : "no"}</td>
      <td class="${b.desbordeHorizontal ? "dif" : "ok"}">${b.desbordeHorizontal ? "sí" : "no"}</td>
    </tr>`;
  });
  return `<table>
    <thead><tr><th>Tema</th><th>Tamaño</th><th>Alto ref.</th><th>Alto impl.</th><th>Δ</th><th>Desborde ref.</th><th>Desborde impl.</th></tr></thead>
    <tbody>${filas.join("")}</tbody></table>`;
}

const medidas = async (f) => {
  const t = await readFile(join(DIR, f), "utf8");
  return JSON.parse(t.slice(t.indexOf("[")));
};

const existentes = new Set([
  ...(await readdir(join(DIR, "referencia"))),
  ...(await readdir(join(DIR, "implementacion"))),
]);

const par = (tema, tamano, seccion) => {
  const sufijo = `-${tema}`;
  const ref = `ref-${tamano}${sufijo}-${seccion}.png`;
  const impl = `impl-${tamano}${sufijo}-${seccion}.png`;
  if (!existentes.has(ref) || !existentes.has(impl)) return "";
  return `<div class="par">
    <figure><figcaption>Referencia aprobada</figcaption><img loading="lazy" src="referencia/${ref}" alt="Referencia · ${seccion} · ${tamano} · ${tema}"></figure>
    <figure><figcaption>Implementación</figcaption><img loading="lazy" src="implementacion/${impl}" alt="Implementación · ${seccion} · ${tamano} · ${tema}"></figure>
  </div>`;
};

const comprobaciones = await readFile(join(DIR, "comprobaciones.txt"), "utf8");
const correctas = (comprobaciones.match(/✓/g) ?? []).length;
const fallidas = (comprobaciones.match(/✗/g) ?? []).length;

const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Revisión visual · landing aprobada F2.1</title>
<style>
  :root{color-scheme:light dark}
  body{font:16px/1.6 system-ui,sans-serif;margin:0;padding:32px;max-width:1500px;margin-inline:auto}
  h1{font-size:28px;margin:0 0 4px}
  h2{font-size:21px;margin:40px 0 10px;padding-top:18px;border-top:1px solid #8884}
  h3{font-size:16px;margin:26px 0 8px;font-weight:600}
  .meta{color:#777;font-size:14px;margin:0 0 24px}
  table{border-collapse:collapse;font-size:14px;margin:12px 0}
  th,td{border:1px solid #8884;padding:5px 10px;text-align:left}
  td.n{text-align:right;font-variant-numeric:tabular-nums}
  .ok{color:#2a7}
  .dif{color:#c60;font-weight:600}
  .par{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin:10px 0 26px}
  figure{margin:0}
  figcaption{font-size:12px;color:#777;margin-bottom:4px}
  img{width:100%;height:auto;border:1px solid #8884;background:#fff}
  pre{background:#8881;padding:12px;border-radius:6px;font-size:13px;overflow:auto}
  .dif-item{border-left:3px solid #c60;padding:2px 0 2px 14px;margin:16px 0}
  .dif-item b{display:block}
  .aviso{background:#c601;border:1px solid #c604;padding:12px 16px;border-radius:6px;margin:16px 0}
</style></head><body>

<h1>Revisión visual · landing aprobada F2.1</h1>
<p class="meta">
  Referencia: proyecto de diseño <b>Psico Platform Design System</b>
  (<code>019e08a5-fedf-77ed-8bcc-e4bcf7210128</code>),
  <code>web-publica-f2-1/FeelVerse-Home-F2-1.html</code>,
  versión <code>1790549315538494</code> del 27-09-2026 22:48.
  Espejada en el repositorio en <code>docs/design/web-publica-f2-1/</code>.
  <br>Implementación: <code>apps/web</code>, ruta <code>/</code>.
  Capturas a los mismos anchos y zoom, movimiento reducido, en los dos temas.
</p>

<div class="aviso">
  <b>Esto no autoriza cobros.</b> Los importes de la página son los de la maqueta,
  hipótesis sin validar, y se muestran con su aviso y sin ninguna ruta de compra.
  Las condiciones que faltan aparecen como «Por definir».
</div>

<h2>Resultados funcionales</h2>
<p><b>${correctas} comprobaciones correctas · ${fallidas} fallidas.</b></p>
<pre>${comprobaciones.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[c])}</pre>

<h2>Altura total y desborde horizontal</h2>
${tabla(await medidas("medidas-referencia.json"), await medidas("medidas-implementacion.json"))}

<h2>Diferencias, y por qué</h2>
${DIFERENCIAS.map(
  (d) => `<div class="dif-item"><b>${d.donde}</b>
  <div>${d.que}</div>
  <div style="color:#777"><b style="display:inline">Motivo:</b> ${d.porque}</div>
  <div style="color:#777"><b style="display:inline">Efecto medido:</b> ${d.efecto}</div></div>`,
).join("")}

<h2>Comparación por sección</h2>
${TEMAS.map(
  ([tema, nombreTema]) => `<h3>${nombreTema}</h3>
  ${TAMANOS.map(
    ([tamano, nombreTamano]) => `<h3 style="margin-top:18px;color:#777;font-weight:500">${nombreTema} · ${nombreTamano}</h3>
    ${SECCIONES.map(([s, nombre]) => {
      const p = par(tema, tamano, s);
      return p ? `<div><div style="font-size:13px;color:#777;margin-top:14px">${nombre}</div>${p}</div>` : "";
    }).join("")}`,
  ).join("")}`,
).join("")}

<h2>Página completa</h2>
${TEMAS.map(([tema, nombreTema]) =>
  TAMANOS.map(([tamano, nombreTamano]) => {
    const p = par(tema, tamano, "completa");
    return p ? `<h3>${nombreTema} · ${nombreTamano}</h3>${p}` : "";
  }).join(""),
).join("")}

</body></html>
`;

await writeFile(join(DIR, "index.html"), html, "utf8");
// eslint-disable-next-line no-console
console.log(`escrito: ${join(DIR, "index.html")}`);
