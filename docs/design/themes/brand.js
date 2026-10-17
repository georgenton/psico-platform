/* FeelVerse · marca — recurso compartido único.
   El nombre canónico es FeelVerse (F y V mayúsculas). Nunca «Feel Verse», «Psico» ni «PsicoContent».
   Logo DEFINITIVO: ruta A · Open Verse. Símbolo, proporciones y construcción quedan fijados aquí.
   Toda superficie (cabecera, navegación, invitado, pie, favicon, app icon, metadatos) consume
   FV.mark() / FV.lockup() / FV.appIcon(). No hay selector de logos ni variantes por theme:
   el theme solo cambia la tinta mediante --fv-brand-ground.
   Los candidatos descartados quedan como antecedente documental en
   «FeelVerse Logo - Ronda 1.html» y «FeelVerse Logo - Ronda 2.html», fuera de la interfaz. */

window.FV = (function () {
  /* Geometría del logo aprobado — viewBox 0 0 48 48.
     Dos planos de página que se abren hacia fuera; la apertura es la V del nombre.
     Regla de uso: plano, una tinta, sin perspectiva, sin inclinación, sin sombra ni degradado. */
  const MARK =
    '<path fill="currentColor" d="M22 34 L5 24 L5 14 L22 26 Z"/>' +
    '<path fill="currentColor" d="M26 34 L43 24 L43 14 L26 26 Z"/>';

  /* Variante óptica ≤20 px: misma construcción, canal central y planos engrosados
     para que la apertura no se cierre a 16 px. No es otro logo. */
  const MARK_SM =
    '<path fill="currentColor" d="M21.5 35 L4 24.5 L4 12.5 L21.5 25 Z"/>' +
    '<path fill="currentColor" d="M26.5 35 L44 24.5 L44 12.5 L26.5 25 Z"/>';

  function sprite() {
    if (document.getElementById("fv-brand-sprite")) return;
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.id = "fv-brand-sprite";
    svg.setAttribute("width", "0"); svg.setAttribute("height", "0");
    svg.setAttribute("aria-hidden", "true");
    svg.style.position = "absolute";
    svg.innerHTML =
      '<defs><symbol id="fv-mark" viewBox="0 0 48 48">' + MARK + '</symbol>' +
      '<symbol id="fv-mark-sm" viewBox="0 0 48 48">' + MARK_SM + '</symbol></defs>';
    (document.body || document.documentElement).prepend(svg);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", sprite, { once: true });
  else sprite();

  /* mark(px, {small, color}) → solo el símbolo. Decorativo: el nombre accesible lo aporta el lockup
     o un aria-label explícito en el contenedor cuando el símbolo va suelto (favicon, app icon). */
  function mark(size, o) {
    o = o || {};
    const px = size || 20;
    const href = (o.small || px <= 20) ? "#fv-mark-sm" : "#fv-mark";
    return '<span class="fv-mark" style="width:' + px + 'px;height:' + px + 'px' +
      (o.color ? ';color:' + o.color : '') + '" aria-hidden="true"><svg viewBox="0 0 48 48"><use href="' + href + '"/></svg></span>';
  }

  /* lockup(px, {color, inv}) → símbolo + wordmark. Es la firma accesible de la marca:
     el texto «FeelVerse» es real, seleccionable y legible por lector de pantalla. */
  function lockup(size, o) {
    o = o || {};
    const px = size || 18;
    return '<span class="fv-lockup' + (o.inv ? ' fv-lockup-inv' : '') + '" style="font-size:' + px + 'px' +
      (o.color ? ';color:' + o.color : '') + '">' +
      mark(Math.round(px * 1.25), { small: px <= 15 }) +
      '<span class="fv-wm">Feel<span>V</span>erse</span></span>';
  }

  /* appIcon(px) → marca sobre tinta llena: splash, icono de aplicación, avatar social. */
  function appIcon(size) {
    const px = size || 64;
    return '<span class="fv-appicon" style="width:' + px + 'px;height:' + px + 'px" role="img" aria-label="FeelVerse">' +
      mark(Math.round(px * 0.52), { small: false }) + '</span>';
  }

  /* favicon() → data-URI de una tinta, para <link rel="icon">. Usa la variante óptica. */
  function faviconHref(color) {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" fill="' + (color || "#2A2420") + '">' +
      MARK_SM.replace(/currentColor/g, color || "#2A2420") + '</svg>';
    return "data:image/svg+xml," + encodeURIComponent(svg);
  }

  /* install() → favicon + <title>/meta con el nombre canónico. Una llamada por página. */
  function install(title) {
    const l = document.querySelector('link[rel="icon"]') || document.createElement("link");
    l.rel = "icon"; l.type = "image/svg+xml"; l.href = faviconHref();
    document.head.appendChild(l);
    if (title) document.title = title;
  }

  return { mark, lockup, appIcon, faviconHref, install, name: "FeelVerse", logo: "A · Open Verse" };
})();
