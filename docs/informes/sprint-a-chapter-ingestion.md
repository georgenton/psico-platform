# Sprint A — Ingesta de capítulos reales (Parte I de _Emociones en Construcción_)

**Fecha:** 2026-07-09
**Rama:** `feature/chapter-ingestion` → PR #480 (develop) + sync a main
**Tests:** API 783/784 · Web 274 · Mobile 48 · typecheck ×3 + lints + privacy + OpenAPI verdes (sin tests nuevos — sprint de contenido + tooling).

---

## Contexto

Hasta hoy el Lector servía `ChapterBlock`s de seed (30 bloques sintéticos para los 2 libros ancla, desde S6-lector). Para poder **probar la app con un usuario real** — que entre, lea, subraye, anote, converse con Eco y vea cómo el Mapa Emocional lo mide — hacía falta **texto de verdad**. El usuario aportó los 3 primeros capítulos de _Emociones en Construcción_ (libro ~80-90 % terminado, Parte I) en Markdown/prosa.

Actividades y videos del libro **todavía no están desarrollados** como features; la decisión (acordada con el usuario) fue **colocar mocks** para que esos tipos de bloque rendericen y el flujo de lectura se vea completo antes de construirlos.

## Lo que se construyó

### Script de ingesta — `apps/api/scripts/ingest-chapter-md.mjs`

Convierte un capítulo (Markdown o prosa plana) en `ChapterBlock`s. Parser heurístico que maneja **ambas convenciones**:

- **Markdown real:** `# H1`, `## H2`, `> quote`, y fenced specials (`:::pausa` / `:::ejercicio` / `:::video … :::`).
- **Prosa plana** (como llega el manuscrito): primera línea = título del capítulo; líneas cortas sin puntuación terminal = headings de sección; el resto = párrafos. Los headings que parecen secciones de actividad ("Actividades", "…exploración emocional guiada…") convierten los párrafos siguientes en bloques `EXERCISE` para que las actividades del propio manuscrito se vuelvan cards interactivas.

**Mocks inyectados** (para que el flujo se vea completo antes de construir las features):

- Si el capítulo no tiene `PAUSE`, se inyecta una pausa de respiración curada ~45 % del avance.
- Se añade una card mock `🎬 Video (próximamente)` antes de la sección de referencias.
- Las secciones de actividad reciben una card `✍️` mock.

**Idempotente por capítulo:** re-correr REEMPLAZA los bloques del capítulo. ⚠️ Reemplazar bloques cascade-borra highlights/annotations anclados a ellos (apuntan a block ids) — fino mientras se itera el manuscrito, evitar re-ingestar capítulos que usuarios reales ya marcaron.

**Sidecars:** el script lee `titles.json` y `parts.json` junto a los `.md` para no depender de heurística frágil en el título ni en la agrupación por parte.

### Contenido — `apps/api/content/emociones-en-construccion/`

- `capitulo-01.md` · `capitulo-02.md` · `capitulo-03.md` — Parte I.
- `titles.json` — títulos canónicos por capítulo:
  1. "¿Realmente sabemos qué es una emoción?"
  2. "¿Existen realmente las emociones universales?"
  3. "Tu cerebro inventa emociones"
- `parts.json` — los 3 capítulos son Parte 1 "Deconstruyendo lo que sabíamos".

## Decisiones

1. **Parser heurístico + sidecars JSON** en lugar de exigir Markdown estricto — el manuscrito real llega como prosa, no queremos que el autor aprenda una sintaxis. Los sidecars (`titles.json` / `parts.json`) fijan lo que la heurística no puede adivinar de forma confiable.
2. **Mocks de pausa/video/actividad** en vez de esperar a las features reales — el usuario necesita ver el flujo de lectura COMPLETO hoy para validar. Los mocks son honestos ("próximamente"), no fingen funcionalidad.
3. **Actividades del manuscrito → EXERCISE + una card mock** — el texto de las actividades se conserva como párrafos legibles; encima se pone una card `✍️` que marca "aquí irá la actividad interactiva". No se fuerza cada párrafo de la sección "Actividades" a EXERCISE (era incorrecto: el Cap. 3 tiene 31 párrafos de prosa en esa sección).
4. **Idempotencia por REEMPLAZO** — re-ingestar un capítulo lo reconstruye; simple y correcto para iterar el manuscrito. Documentado el riesgo de cascade sobre highlights/annotations.

## Bugs corregidos durante el sprint

1. **Título del Cap. 3 parseado como párrafo de 600 chars** — la primera línea no era el título. Fix: `titles.json` sidecar + guard `takeTitle` (el título debe ser ≤120 chars, sin punto final).
2. **Sección "Actividades" del Cap. 3 = 31 párrafos** — convertirlos todos a EXERCISE era incorrecto. Fix: el parser mantiene la prosa como PARAGRAPH e inyecta UNA card mock bajo el heading de actividad.

## Verificación

```
node scripts/ingest-chapter-md.mjs --dir content/emociones-en-construccion --dry-run   OK
API tests 783/784 · web 274 · mobile 48 · crypto 34
typecheck + lint + OpenAPI generate:check verdes
```

## Deuda técnica abierta

- **Reproductor de video real** — hoy card mock `🎬`.
- **Actividades interactivas reales** — hoy card mock `✍️` + prosa.
- **Ingestar Partes II y III** cuando el manuscrito las cierre.
- **Re-ingesta destructiva** — cuando existan usuarios con marcas reales, migrar a un diff de bloques en vez de replace-all.
