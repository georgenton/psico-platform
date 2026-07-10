# Sprint A.2 — Partes del libro (Parte I clara) + Modo Libro / Modo Guía

**Fecha:** 2026-07-09
**Rama:** `feature/book-parts` → PR #481 (develop) + sync #482 (main)
**Tests:** API 783/784 · Web 277 (+3 ChaptersList) · Mobile 48 · typecheck ×3 + lints + OpenAPI verdes.

---

## Contexto

_Emociones en Construcción_ tiene **tres partes**; los 3 capítulos ingestados en el Sprint A son la **Parte I** ("Deconstruyendo lo que sabíamos"). El usuario pidió, antes de seguir con Eco contextual, dos cosas concretas:

1. Que la **Parte I quede clara** en la UI — que el lector y el detalle del libro muestren a qué parte pertenece cada capítulo.
2. Que los 3 capítulos funcionen en los **dos formatos del libro: Modo Libro y Modo Guía**.

## Lo que se construyó

### Schema — agrupación por parte

`Chapter.partNumber Int?` + `Chapter.partTitle String?` (ambos nullable — un libro sin partes deja los dos en null y la UI cae a lista plana). Migración aditiva `20260710000000_chapter_part_grouping`. El script de ingesta (Sprint A) ya escribía estos campos desde `parts.json`.

### Backend

- `apps/api/src/books/books.service.ts` — `buildChaptersList` mapea `partNumber` / `partTitle`; la query los selecciona.
- `apps/api/src/lector/lector.service.ts` — el shape del capítulo devuelve `partNumber` / `partTitle` para el eyebrow del lector.
- `@psico/types` — `ChapterListItem` y el chapter del `LectorChapterResponse` extendidos con los dos campos opcionales (cache-tolerant).

### Web

- `apps/web/src/components/dashboard/detalle/ChaptersList.tsx` — reescrito con `groupByPart`: cuando hay partes, renderiza headings "PARTE I · Deconstruyendo lo que sabíamos" agrupando sus capítulos; sin partes cae a la lista plana previa. `ChaptersList.test.tsx` +3 tests (agrupado, lista plana, romanización).
- `apps/web/src/components/dashboard/lector/LectorShell.tsx` — el header del lector muestra "· Parte I" (helper `romanize`).

### Mobile

- `apps/mobile/app/(tabs)/books/[slug].tsx` — Fragment con heading de parte antes de las filas, helper `romanize`, estilo `partHeading`.
- `apps/mobile/app/(tabs)/books/[slug]/lector/[chapterOrder].tsx` — el eyebrow del lector muestra "· PARTE I".

### Modo Libro / Modo Guía — verificación

El toggle Modo Libro ↔ Modo Guía ya existía en `LectorShell` (Modo Guía añade el reproductor de audio sobre los mismos `ChapterBlock`s). Se verificó que los 3 capítulos ingestados rinden en ambos modos:

- **Modo Libro:** los `ChapterBlock`s se leen como prosa continua con sus PAUSE/EXERCISE/mocks.
- **Modo Guía:** el `AudioBar` aparece arriba; como los archivos de audio de estos capítulos aún no se han subido a R2, el bar muestra el placeholder honesto **"Audio en producción"** en vez de fingir reproducción. Los bloques se leen igual.

## Decisiones

1. **`partNumber`/`partTitle` denormalizados en `Chapter`** (no una tabla `BookPart`) — v1 no necesita metadata de parte más allá de número + título, y un libro rara vez re-ordena sus partes. Cuando el Editor de Autor B2B necesite editar partes, se promueve a tabla.
2. **Ambos campos nullable + fallback a lista plana** — no todos los libros tienen partes; la UI degrada limpio.
3. **Modo Guía muestra "Audio en producción"** en vez de ocultar el toggle — es honesto y deja claro que el formato existe pero el audio de estos capítulos está pendiente. Cuando ops suba los m4a, el bar los reproduce sin cambios cliente.

## Verificación

```
API tests 783/784 · web 277 (+3) · mobile 48 · crypto 34
typecheck + lint + OpenAPI generate:check verdes
Walk manual: detalle del libro muestra "PARTE I"; lector muestra "· Parte I";
Modo Libro y Modo Guía rinden los 3 capítulos.
```

## Nota de reconciliación de sync

El PR #482 (sync develop → main) se mergeó por **squash** — el repo no permite merge commits (`Merge commits are not allowed on this repository`). El árbol de `main` quedó idéntico a `develop` (verificado con `git diff origin/main origin/develop` vacío).

## Deuda técnica abierta

- **Subir los m4a de los 3 capítulos a R2** para que Modo Guía reproduzca de verdad (deja de mostrar "Audio en producción").
- **Tabla `BookPart`** cuando el Editor de Autor B2B edite partes.
- **Partes II y III** cuando el manuscrito las cierre.
