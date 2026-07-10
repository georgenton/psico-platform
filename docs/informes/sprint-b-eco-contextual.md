# Sprint B — Eco contextual en el lector (subrayar → profundizar + tema por capítulo)

**Fecha:** 2026-07-09
**Rama:** `feature/eco-contextual-reader` → PR #483 (develop) + sync #484 (main)
**Tests:** API 783/784 · Web 277 · Mobile 53 (+5: acción Eco en BlockActionsSheet + EcoTopicCard) · Crypto 34 · typecheck ×3 + lints + OpenAPI verdes.

---

## Contexto

Con los capítulos reales ya legibles (Sprints A + A.2), el usuario pidió cerrar el bucle de **acompañamiento**: cuando alguien entra a un capítulo, que Eco aparezca de forma discreta sugiriendo un tema para conversar; y cuando subraya algo, que pueda saltar a profundizarlo con Eco con el pasaje ya cargado. El resto (sugerencias adaptativas según interacción, nudges post-ejercicio) quedó en backlog.

Para los prompts de capítulo, el usuario eligió **"Yo las genero (recomendado)"** — las preguntas-gancho las redactó el asistente.

## Lo que se construyó

### Tema sugerido por capítulo — `EcoTopicCard`

Una tarjeta descartable al inicio del capítulo con un abre-conversación curado. Los prompts viven en `ECO_CHAPTER_PROMPTS` (`@psico/types/eco-chapter-prompts.ts`) por `(bookSlug, chapterOrder)`, con fallback basado en el título del capítulo para capítulos aún sin curar (`ecoChapterPrompt(...)` siempre devuelve algo).

Los 3 capítulos de la Parte I tienen tema propio (el `title` de la tarjeta es el **tema de conversación**, distinto del título real del capítulo):

- Cap. 1 → "El cuerpo sabe antes que la mente"
- Cap. 2 → "Cómo aprendiste a sentir"
- Cap. 3 → "Cuando tu mente adelanta la emoción"

Web: `apps/web/src/components/dashboard/lector/EcoTopicCard.tsx`. Mobile: `apps/mobile/src/components/dashboard/lector/EcoTopicCard.tsx`.

### Subrayar → profundizar

- **Web** — `HighlightPopover` gana un botón "🌿 Eco". `LectorShell` lee `window.getSelection()`, arma el prompt con `passageToPrompt(passage)` y setea el handoff, luego `router.push("/dashboard/eco")`.
- **Mobile** — `BlockActionsSheet` (el menú de long-press) gana una fila "🌿 Conversar con Eco". La pantalla del lector arma el prompt con `passageToEcoPrompt(block.content)` y navega a la tab de Eco. (Highlight es block-level v1, coherente con el sprint mobile-highlights.)

### Handoff lector → Eco

Efímero, de un solo salto de navegación:

- **Web** — `apps/web/src/lib/eco/reader-handoff.ts`: `sessionStorage` (por pestaña, se limpia al cerrar). `EcoShell` lo consume una vez al montar (`consumeEcoReaderHandoff()` limpia la key), pasa `initialComposerText` a `ChatArea`, que siembra el composer una sola vez vía `seededRef`.
- **Mobile** — `apps/mobile/src/lib/eco/reader-handoff.ts`: singleton en memoria (mismo patrón que el handoff voz→Diario). La pantalla de Eco lo consume en `useFocusEffect`; como `text` vive por encima del unlock gate, el seed sobrevive aunque el usuario todavía tenga que desbloquear su llave.

Ambos handoffs cargan `source: { bookSlug, chapterOrder, kind: "highlight" | "topic" }` para analítica ligera.

## Decisiones

1. **Prompts curados en `@psico/types` con fallback por título** — una sola fuente compartida web + mobile; cada capítulo tiene algo desde el día uno, aunque no esté curado.
2. **Handoff efímero por storage, no por URL** — el pasaje no toca la capa de routing (query params, historial). Web usa `sessionStorage` (per-tab), mobile un singleton en RAM. Mismo criterio de privacidad-por-defecto que el handoff de voz.
3. **Block-level en mobile** — RN no tiene API de selección de texto first-party estable; el long-press marca el bloque entero. Character-level queda para cuando RN lo permita.
4. **EcoTopicCard descartable** — nunca bloquea la lectura; se puede ocultar por sesión.

## Privacidad (ADR 0007 intacto)

El texto de los libros es **contenido PÚBLICO licenciado**, no el Diario cifrado E2E. Llevar un pasaje entre pantallas no toca ningún ciphertext ni el modelo del Mapa Emocional. El composer de Eco cifra el mensaje del usuario como siempre antes de enviarlo — el pasaje pre-cargado entra en ese mismo flujo de cifrado.

## Bug corregido durante el sprint

- **Jest hoist rule en `EcoTopicCard.test.tsx`** — `jest.mock("expo-router")` no puede referenciar variables fuera de scope salvo que tengan prefijo `mock` **al inicio**. `pushMock` fallaba; renombrado a `mockPush`.

## Verificación

```
API tests 783/784 · web 277 · mobile 53 (+5) · crypto 34
typecheck + lint verdes en API + web + mobile
OpenAPI generate:check in sync (sin cambios al wire)
CI de #483 y #484 verde antes de mergear.
```

## Deuda técnica abierta (backlog aprobado por el usuario)

- **Sugerencias adaptativas** según cómo el usuario interactúa con libro/video/actividades + según el Mapa Emocional.
- **Nudges post-ejercicio.**
- **Reproductor de video real** y **actividades interactivas reales** (hoy mocks del Sprint A).
- **Character-level highlights en mobile** cuando RN exponga la selección.
