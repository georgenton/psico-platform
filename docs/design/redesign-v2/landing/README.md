# Psico Platform — Landing Page · Engineering Handoff

Reposicionamiento: de "biblioteca premium de psicología" → **plataforma de transformación personal impulsada por IA emocional**. Concepto central: el **Mapa Emocional** vivo.

## Estructura

```
landing/
├─ index.html      # markup completo, self-contained (links a tokens + styles + scripts)
├─ tokens.css      # variables CSS :root (color, type, spacing, radii, shadow, motion)
├─ styles.css      # estilos sin minificar, comentados por sección
├─ scripts.js      # vanilla JS (reveal-on-scroll + radar SVG). Sin frameworks.
├─ assets/         # ver assets/README.md (todo SVG inline / gradientes CSS, sin rasters)
└─ README.md
```

Abrir `index.html` directamente en el navegador (no requiere build).

## 1. Componentes / secciones

Navbar sticky · **Hero** (con radar "Mapa Emocional" generado en JS) · Proof strip · **Cambio de paradigma** (flujo Exploras→Reflexionas→Descubres→Reconoces→Te transformas) · **Mapa Emocional** (sección cosmos, panel profundo lavender-950) · **Eco** (núcleo IA: Observa/Aprende/Detecta/Acompaña + chat) · **Patrones IA** (tarjetas de hallazgo) · **Insight del día** · **Timeline de transformación** · **Métricas reformuladas** · **Lector con IA** · Testimonios · Planes · FAQ · CTA · Footer.

## 2. Tokens (qué se mantiene / cambió)

- **Se mantiene** todo el sistema existente: paleta lavanda (primary), sage (CTA/acción), warm (neutrales), Geist/Geist Mono, spacing, radii, shadows, easing `cubic-bezier(0.2,0.8,0.2,1)`. Ver `tokens.css`.
- **Cambió:** ningún token nuevo. La landing solo **re-compone** con los tokens existentes. Único ajuste de accesibilidad recomendado: los CTA usan `sage-400` por marca; para texto blanco AA conviene `sage-600` (ver Dashboard handoff).

## 3. Assets

Sin imágenes raster. Iconos = SVG inline (viewBox, sin width/height fijo). Portadas/avatares = gradientes CSS (`--gradient-cover-*`). Fuentes = Google Fonts CDN (Geist + Geist Mono, OFL). Sin licencias propietarias.

## 4. Estados de componentes

- Botones: default / hover (translateY + shadow) / (sin disabled en landing).
- Nav links: default / hover (color).
- FAQ `<details>`: closed / open (chevron rota 180°).
- Cards (feat/pattern): default / hover (lift + shadow).
- Radar: estado animado `.in` (draw-in) gestionado por `scripts.js`.

## 5. Breakpoints

- **Desktop 1280–1440:** grids 3-col, hero 2-col.
- **Tablet 768:** grids colapsan a 2-col; hero 1-col.
- **Mobile 375–414:** todo 1-col; nav-links se ocultan (≤860px); badges wrap.
  Implementado con `@media (max-width: …)` en styles.css.

## 6. Microinteracciones y motion

- **Reveal-on-scroll:** `IntersectionObserver` añade `.in`; contenido above-the-fold se muestra instantáneo (robusto a clocks congelados). Durations 0.6–0.7s, easing `--easing-default`.
- **Radar vivo:** polígono escala-in (1s) + nodos fade + pulso central infinito.
- **Ping del badge** (2.4s), hover lifts (.15–.18s).
- Respeta `prefers-reduced-motion`.

## 7. Naming

- Producto: **Psico**. Tagline: "No estás leyendo. Te estás descubriendo."
- Secciones ancladas: `#mapa`, `#eco`, `#patrones`, `#evolucion`, `#planes`.
- URL sugerida: `/` (landing pública). CTAs → `/signup`, `/login`.

## 8. Notas para ingeniería

- **Decorativo:** blobs/gradientes/radar de la landing, ping, drift. El radar usa datos hardcodeados de ejemplo — en producto real lo alimenta `/api/emotional-map`.
- **Data-driven en producto:** testimonios, planes/precios, libros. Aquí son estáticos de muestra.
- **Sin endpoints nuevos** para la landing (es marketing). Los CTA enrutan a auth.

## 9. Copy strings (i18n)

Todo el texto visible está en `index.html` en español. Para i18n: extraer por `data-i18n` key. Strings principales: hero h1/lead, los 5 pasos del flujo, títulos de sección (Mapa Emocional, Eco, Patrones IA, Insight del día, Tu evolución, Métricas, Lector con IA), planes (Explora/Transformación/Acompañado), 5 FAQ, CTA final, footer.

## 10. Dependencias visuales nuevas

**Ninguna.** Sin librerías de animación, iconos o charts. Todo es CSS + SVG inline + ~40 líneas de vanilla JS. El radar es SVG generado a mano (no Chart.js/D3).
