# Psico Platform — Dashboard · Engineering Handoff

Producto reposicionado: panel de **evolución personal**, no biblioteca. 8 secciones navegables + control de ánimo global + 4 ambientes (temas) + contraste verificado AA.

## Estructura

```
dashboard/
├─ index.html      # markup completo (8 screens conmutables vía data-screen)
├─ tokens.css      # variables CSS :root
├─ styles.css      # estilos sin minificar, comentados
├─ scripts.js      # vanilla JS: switching de screens, mood global, ambientes, radar
├─ assets/         # ver assets/README.md (SVG inline / gradientes, sin rasters)
├─ components/     # partials de referencia + inventario (README.md)
├─ states/         # mapa de estados (README.md)
└─ README.md
```

Abrir `index.html` directamente (no requiere build). Fuentes extra (Spline Sans, Bricolage Grotesque) cargan por CDN para los ambientes.

## 1. Componentes nuevos

Ver `components/README.md` para la tabla completa. Clave: **Sidebar, Topbar, MoodChip + MoodPopover, AmbiencePicker, MetricCard, InsightCard, MiniRadar, PatternCard, ReflectionEntry, TimelineItem, ExploreCard, BookCard, EcoChat**. Todos reutilizan tokens; varios se reusan entre screens (MoodChip/AmbiencePicker en topbar global).

## 2. Tokens (qué cambió / se mantiene)

- **Se mantiene** la base: lavanda/sage/warm, Geist, spacing, radii, shadows, motion. En `tokens.css`.
- **Nuevo — Ambientes:** 4 temas que **redefinen** los tokens sobre `body.amb-{calma|enfoque|energia|noche}` (paleta + `--font-sans`). Calma = default. Enfoque = índigo + Spline Sans. Energía = terracota + Bricolage. Noche = modo oscuro. Persistido en `localStorage["psico-amb"]`. Para Tailwind: mapear como theme variants / `data-theme`.
- **Categorías del Mapa** (en flagship): cognitivo/emocional/conductual/relacional/fortaleza con color propio (lavanda/violeta/sage/ámbar/sage-profundo).
- **Ajuste de contraste:** CTA primario usa `sage-600` (no 400) para AA; texto secundario `warm-600` (no 500). Documentado.

## 3. Assets

Sin rasters. Iconos SVG inline (set original Lucide-inspired, 1.75 stroke). Portadas/avatares = gradientes CSS. Fuentes por CDN (Geist, Spline Sans, Bricolage Grotesque — todas OFL).

## 4. Estados de componentes

- **nav-item / chip / btn / mood / amb-opt:** default · hover · on/active.
- **MoodChip:** sin-registrar ("¿Cómo estás?") · registrado ("Hoy: X") · popover open. Persistido.
- **Big check-in (Inicio):** expandido (primera vez) · colapsado (tras registrar).
- **Ambientes:** 4 variantes de tema a nivel `body`.
- **Empty / loading / error / updating:** completamente diseñados en el **flagship Mapa Emocional** (`Mapa Emocional.html` + su spec) — `data-state` en `.map-root`. Ver `states/README.md`.

## 5. Breakpoints

- **Desktop 1280–1440:** sidebar 248px + main; grids 3–5 col.
- **Tablet ~980:** paneles a 1–2 col; metrics 3-col.
- **Mobile 375–414:** superficie móvil dedicada (3 iPhone frames con tab bar); en web los grids colapsan a 1-col. `@media` en styles.css.

## 6. Microinteracciones y motion

- **Switch de screen:** fade/translate de entrada (0.4s).
- **Radar:** generado en SVG por `scripts.js`; pulso central infinito.
- **Mood select:** highlight + confirmación "Eco lo registró".
- **Ambience switch:** recolorea toda la página (transición de color).
- **Barras de progreso/metros:** animan al revelarse. Hover lifts (.16s). Easing `--easing-default`. Respeta `prefers-reduced-motion`.

## 7. Naming (definitivo)

- **Sidebar:** Inicio · Mi Evolución · Mapa Emocional · Patrones IA · Reflexiones · Exploraciones · (Recursos:) Biblioteca · Eco.
- **URLs:** `/dashboard` (Inicio), `/dashboard/evolucion`, `/dashboard/mapa`, `/dashboard/patrones`, `/dashboard/reflexiones`, `/dashboard/exploraciones`, `/dashboard/biblioteca`, `/dashboard/eco`.
- **Componentes:** nombres en `components/README.md`.

## 8. Notas para ingeniería

- **Decorativo:** radares, gradientes, drift, pulsos, blobs.
- **Data-driven (requiere endpoints):**
  - Inicio: Insight del día → `GET /api/insights/today`; métricas → `/api/progress/summary`; continuar → `/api/reading/current`; recomendación Eco → `/api/eco/suggestion`; actividad → `/api/activity`.
  - Mapa preview & flagship → `/api/emotional-map` (ver spec del flagship).
  - Patrones → `/api/emotional-map/patterns`.
  - Reflexiones → `GET/POST /api/journal` (cuerpo E2E cifrado; solo metadata al server).
  - Mi Evolución → `/api/progress/history`, `/api/milestones`.
  - Exploraciones → `/api/journeys`; Biblioteca → `/api/books`; Eco → `/api/eco/messages` (WS/stream).
- **Mood** → `POST /api/mood` (daily). **Ambiente** → preferencia de usuario, cliente + `/api/me/preferences`.
- **Reutiliza** el sistema de diseño existente (`apps` globals.css / mobile theme.ts) — los ambientes son overrides de tokens.

## 9. Copy strings (i18n)

Todo en español en `index.html`. Extraer por `data-i18n`. Bloques: saludo + check-in, labels de nav, títulos de screen, copy de Insight/Patrones/Reflexiones/Timeline/Exploraciones/Biblioteca/Eco, labels de ánimo (Muy bien/Bien/Neutral/Bajo/Difícil), ambientes (Calma/Enfoque/Energía/Noche).

## 10. Dependencias visuales nuevas

**Ninguna obligatoria.** Sin React/Tailwind/Chart.js/D3. Radares y line-chart son SVG a mano. Única dependencia externa: **Google Fonts CDN** para Spline Sans + Bricolage Grotesque (ambientes) — autohospedables como woff2 si se prefiere (`/assets/fonts`).
