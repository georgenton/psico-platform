# Sprint arco — Panel compañero del lector (dock/sheet) + actividades interactivas

**Ramas:** `feature/reader-companion-dock` (#487/#488) · `feature/reader-companion-sheet` (#489/#490) · `feature/interactive-exercises` (#491/#492)
**Fechas:** 2026-07-10
**Tests:** Web 281 (+ dock/exercises) · Mobile 58 (+ sheet/exercises) · API 783/784 (sin cambios) · Crypto 34 · typecheck ×3 + lints + privacy + OpenAPI verdes.

---

## 1. Contexto y problema

Tras el arco de libros (Sprints A → A.2 → B) un usuario ya podía leer los capítulos reales de _Emociones en Construcción_ (Parte I), subrayar y saltar a Eco con el pasaje pre-cargado. Pero el salto **navegaba** a `/dashboard/eco`, así que el lector **perdía su lugar** en el capítulo — exactamente lo que el usuario reportó:

> «al subrayar sale un ícono de eco al lado, sin embargo te redirecciona la página de eco, y pierdes el hilo de donde estabas escribiendo».

La propuesta del usuario, textual:

1. Un texto claro tipo «Pregúntale a Eco» (no solo un ícono).
2. Una **ventana lateral** que se abre sin salir del lector — «similar al famoso Copilot de GitHub».
3. Un espacio para escribir **no solo notas, sino reflexiones** — porque «notas no es lo mismo que reflexiones».

Decisión del usuario (AskUserQuestion): **Dock completo con 3 pestañas (Eco / Notas / Reflexión)** y **dejar el Modo Guía como está por ahora**.

---

## 2. Distinción Notas vs Reflexiones (decisión de producto)

|            | **Notas**                              | **Reflexión**                                 |
| ---------- | -------------------------------------- | --------------------------------------------- |
| Qué es     | Apunte marginal sobre **el texto**     | Escritura sobre **ti** disparada por el texto |
| Privacidad | **Plaintext** (annotation, por diseño) | **Cifrada E2E** (DiaryEntry, ADR 0007)        |
| Ancla      | A un `blockId` del capítulo            | Independiente — vive en tu Diario             |
| Alimenta   | Nada más (contexto del lector)         | El **Mapa Emocional** (números on-device)     |
| Backend    | `Annotation` (ya existía)              | `DiaryEntry` (ya existía)                     |

Esta separación es el corazón conceptual del dock: son dos superficies de escritura con contratos de privacidad opuestos, y ahora conviven en un solo panel.

---

## 3. Arquitectura del panel

**Web = drawer derecho** (`ReaderCompanionDock`, `position: fixed inset-y-0 right-0`).
**Mobile = bottom sheet** (`ReaderCompanionSheet`, Modal).

Ambos:

- Mantienen el lector **montado detrás** — nunca se pierde el lugar.
- Tres pestañas: 🌿 Eco · ✎ Notas · 🪷 Reflexión.
- **Solo la pestaña activa se monta** — así el SSE de Eco y el cripto del Diario no corren en background, y cada tab consume su semilla fresca al cambiar.

### Seed override pattern

El panel acepta tres formas de sembrarse, en precedencia:

- `passage` — pasaje subrayado crudo. Cada tab lo envuelve a su modo: `passageToPrompt(passage)` para Eco, `reflexionSeed(passage)` para Reflexión.
- `ecoSeed` — un prompt de Eco ya listo (p. ej. el tema del capítulo desde `EcoTopicCard`) que **sobreescribe** al passage.
- `reflexionSeedOverride` — una consigna de Reflexión ya lista (p. ej. un ejercicio del capítulo) que sobreescribe al passage.

```
ecoSeedText      = ecoSeed              ?? (passage ? passageToPrompt(passage) : null)
reflexionSeedText = reflexionSeedOverride ?? (passage ? reflexionSeed(passage)  : null)
```

### EcoChat reutilizable (mobile)

Para el sheet se extrajo un `EcoChat` reutilizable de la pantalla Eco mobile: consumo SSE, crisis, reveal tipo máquina de escribir (`useSmoothReveal`), paginación y modal de reporte. La pantalla `(tabs)/eco` quedó como wrapper delgado (persona + rail + `<EcoChat>`), y el sheet monta el mismo `EcoChat` con `threadId`/`ecoKey`/`seed`. Cero divergencia entre las dos superficies de chat.

---

## 4. EcoTopicCard → abre el panel (no navega)

La tarjeta de tema del capítulo (`EcoTopicCard`, del Sprint B) navegaba a Eco. Ahora acepta un `onOpen?(prompt)` opcional: si el lector se lo pasa, la tarjeta **abre el dock/sheet en la pestaña Eco sembrada** en vez de navegar. Fallback a navegación cuando se usa fuera del lector.

Igual el botón de subrayado: web `HighlightPopover` gana «🌿 Eco» + «🪷 Reflexión»; mobile `BlockActionsSheet` gana la fila «🌿 Conversar con Eco» + «🪷 Reflexión». Todos abren el panel en vez de navegar.

---

## 5. Actividades interactivas (`feature/interactive-exercises`)

Cierra el primer ítem del backlog aprobado: convertir la card mock «✍️ próximamente» en **interacciones reales**.

**Decisión clave: catálogo curado cliente, no re-ingesta.** Re-ingestar los capítulos borraría highlights/annotations por cascade. En vez de eso, un catálogo `CHAPTER_EXERCISES` en `@psico/types` (como `ECO_CHAPTER_PROMPTS`), por `(bookSlug, chapterOrder)`. Dos tipos, 100 % cliente, cero backend nuevo:

- **🪷 `reflect`** — abre la pestaña Reflexión del dock/sheet sembrada con la consigna → entrada **cifrada** del Diario → alimenta el Mapa.
- **🌬️ `breathe`** — ejercicio guiado (inhala/sostén/exhala) con círculo animado (overlay web / Modal mobile).

Curadas: Cap. 1 = 1 respiración (4-4-6, 4 ciclos) + 1 reflexión; Caps. 2-3 = 1 reflexión cada uno.

`ChapterExercises` se renderiza debajo de los bloques del capítulo; devuelve `null` si el capítulo no tiene actividades curadas.

---

## 6. Privacidad (ADR 0007 intacto)

- **Notas** son plaintext por diseño (annotations).
- **Reflexión** se cifra en la app con `encryptString(text, diaryKey)`; solo suben ciphertext + números on-device (`analyzeReflectionText` → `logTextFeatures`). El servidor nunca ve el texto.
- El **texto de los libros es contenido público licenciado** — llevar un pasaje entre pantallas no toca ningún ciphertext ni el Mapa.
- La respiración es UX pura, sin datos.

---

## 7. Bugs corregidos

1. **Sync-merge con árbol sucio (#488):** `git merge -X theirs` dejó código viejo de `LectorShell.tsx` (`setEcoReaderHandoff` + atributos JSX duplicados) en el commit de merge → CI falló con `TS17001`. Causa raíz: corrí `git checkout origin/develop -- . && git add -A` pero **nunca committeé la corrección** antes del push. Fix: `git commit --amend --no-edit` + `git push --force-with-lease`. **Lección incorporada al workflow:** verificar blob MATCH contra `origin/develop` ANTES de cada push de sync (aplicado en #490 y #492).
2. **Jest hoist rule (`EcoTopicCard.test.tsx`):** la variable del factory `jest.mock` debe tener prefijo `mock` al inicio — `pushMock` → `mockPush`.
3. **BlockActionsSheet props requeridas:** agregar `onReflect`/`onAskEco` rompió renders existentes; fix con helper `renderSheet` que hace spread de defaults.

---

## 8. Verificación

- Web: typecheck + lint + **281 tests** + build.
- Mobile: typecheck + lint + **58 tests**.
- API + crypto sin cambios; OpenAPI `generate:check` in sync (sin cambios de wire en todo el arco).
- Los 3 PRs a develop mergeados por squash + sync a main con árbol idéntico (diff vacío + blobs MATCH).

---

## 9. Deuda técnica / backlog restante (aprobado por el usuario)

- **Nudges post-ejercicio** — al completar una actividad, invitar a reflexionar/conversar con Eco. _(siguiente)_
- **Sugerencias adaptativas de Eco** según interacción con libro/video/actividades + Mapa Emocional.
- **Reproductor de video real** — hoy card mock 🎬.
- Character-level highlights en mobile (hoy block-level).
- Subir los m4a de los 3 capítulos a R2 (Modo Guía hoy «Audio en producción»).
