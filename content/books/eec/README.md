# EEC — fuentes maestras de _Emociones en construcción_

Una prosa canónica por capítulo, un sistema de citas, y de ahí salen todas las
formas. Este directorio es la fuente; `artifacts/` es salida y se regenera.

```
content/books/eec/C01/
  chapter.md          ← la prosa. NO se edita aquí para "mejorar estilo".
  unit.json           ← identidad, colocación, sistema de citas, gates
  citations.json      ← mapa afirmación → ancla → Zotero Key → localizador
  anchors.json  figures.json  microguides.json  activities.json  assets-manifest.json
bibliography/eec-library.bib   ← Zotero (Better BibTeX), fuente única
```

## Construir

```bash
pnpm eec:c01:build          # → artifacts/eec/C01/v1.0/
```

Produce el payload de FeelVerse, el DOCX imprimible, el EPUB y el manifiesto con
hashes. El PDF sale solo si la máquina tiene un motor real (pandoc/LaTeX,
LibreOffice o WeasyPrint); sin él se registra como bloqueo en vez de generarse
con un conversor improvisado.

El build **verifica el SHA-256** de `chapter.md` contra `unit.json` antes de
hacer nada. Si no coincide, no compila: el texto aprobado es el texto aprobado.

## Ingerir

```bash
# valida contra el entorno destino y no escribe nada
pnpm --filter @psico/api content:unit:ingest -- --payload=artifacts/eec/C01/v1.0/feelverse/unit-payload.json

# escribe (en producción exige además ALLOW_CONTENT_CORE_UNIT_INGEST=on)
pnpm --filter @psico/api content:unit:ingest -- --payload=… --apply
```

El CLI resuelve `editionId` por `editionKey` **en el entorno destino**. No confía
en los identificadores del fichero: `unitKey` es `uuidv5(Chapter.id)` sobre un
cuid aleatorio, así que el mismo libro en dos bases da claves distintas.

## Dos bloqueos abiertos en C01, y por qué no se rodean

**1 · No hay mapa de notas.** `citations.json` llega con `citations: []`. Las 23
Citation Keys existen en el `.bib`, pero nadie ha registrado qué afirmación cita
qué fuente ni con qué localizador. Sin eso no hay notas que numerar. Deducirlo
del texto sería inventar atribuciones académicas, así que el build lo declara y
sigue: DOCX, EPUB y FeelVerse salen con la bibliografía completa y sin llamadas.

**2 · La ingesta no llega al lector.** El lector público sirve `ChapterBlock`
(filas legadas) siempre que un capítulo legado respalde la unidad — que es el
caso de todo lo publicado hoy. `ingestUnitV2` escribe Content Core y ahí termina;
en todo `apps/api/src` solo `bootstrap-book.ts` y `author-review.service.ts`
escriben `ChapterBlock`, ambos únicamente creando. Aplicar sin más dejaría Content
Core con el texto nuevo y al lector con el viejo, sin señal alguna. El CLI lo
detecta (`READER_WOULD_SERVE_STALE_LEGACY_BLOCKS`) y se niega.

Cerrar el segundo bloqueo es una proyección Content Core → bloques del lector que
preserve la identidad de cada bloque, y es un cambio con su propio diseño: los
subrayados anclan a `ChapterBlock.id`, así que reescribir esas filas por posición
movería marcas de sitio en silencio. No es un wrapper.

## Añadir C02 en adelante

Copiar la estructura de `C01/`, ajustar `unit.json` y correr
`pnpm eec:build --chapter=C02`. El parser de bloques
(`scripts/eec/parse-chapter.mjs`) es deliberadamente el mismo que sembró el
contenido actual: cambiarlo cambia qué marcas de lectores sobreviven a la
siguiente ingesta.
