# Sprint S5-front-mobile — React Native companion

**Fecha:** 2026-05-27
**Rama:** `feature/sprint-s5-front-mobile`
**Tests:** 252/252 backend pasando (sin cambios — sprint orientado a UI mobile)
**ADRs producidos:** ninguno
**Bitácora previa:** [sprint-s5-front.md](sprint-s5-front.md)

---

## §1 · Decisiones del usuario

1. Continuar con la **Opción A** post S5-front (web): replicar Home/Biblioteca/Detalle/Diario en React Native (Expo + StyleSheet).
2. Mantener el design system (`docs/design/colors_and_type.css` ya mapeado en `apps/mobile/src/theme.ts`) — no inventar tokens nuevos.
3. **Sin `expo-linear-gradient`** — usar fallback de color sólido para los covers, mantener el bundle delgado.

---

## §2 · Lo que se construyó

### Pantallas (4 nuevas / rewrites)

| Ruta                             | Estado  | Notas                                                                                                         |
| -------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------- |
| `/(tabs)` (Inicio)               | rewrite | Greeting + Continue + Eco moment + Recos + Stats + Shortcuts + Upgrade. Pull-to-refresh.                      |
| `/(tabs)/books` (Biblioteca)     | rewrite | Search debounced + view tabs + category chips horizontales + grid 2-col.                                      |
| `/(tabs)/books/[slug]` (Detalle) | rewrite | Hero + author + stats row + progress + CTA primary + about + chapters + rating breakdown + reviews + paywall. |
| `/(tabs)/diario`                 | nuevo   | Composer disabled + prompt-of-the-day + entries metadata + crypto notice.                                     |

### Componentes / helpers

- `apps/mobile/src/components/dashboard/cover-colors.ts` — `coverColor(token)` solid-color fallback para CoverToken → mobile color. Documenta cómo migrar a `expo-linear-gradient` si lo agregamos.
- `apps/mobile/app/(tabs)/_layout.tsx` — tabbar rebrand: 4 tabs visibles (Inicio · Libros · Diario · Mi plan); Perfil queda como `href: null` (deep-link only) hasta que se construya la UI.

### Cliente API extendido

- `packages/api-client/src/home.ts` — nuevo `homeApi` (`get`, `updateMood`, `dismissPrompt`). El web no lo usa porque corre en Server Components con cookies; el mobile lo usa vía el `apiClient` singleton con `TokenStore`.
- `packages/api-client/src/index.ts` re-export añadido.

### Sin tocar

- Backend: cero cambios. Las 4 pantallas consumen `homeApi`, `booksApi`, `diarioApi` ya existentes.
- Web: cero cambios. La paridad visual entre web/mobile se logra a través de los mismos tokens del design system.

---

## §3 · Decisiones del sprint

1. **Fallback de color sólido en lugar de gradiente** — RN no ships con gradients sin lib externa. Para v1 el cover muestra `lavender[500]` / `sage[500]` / `lavender[400]` según token. Si la UX lo pide, agregar `expo-linear-gradient` es un 1-line install + 3 reemplazos.
2. **Pull-to-refresh en Home, no en otras pantallas** — el Home es la "tarjeta de presentación" que el usuario abre primero; refresh manual hace sentido. Biblioteca y Detalle re-cargan implícitamente al cambiar filtros / volver a la pantalla.
3. **Composer del Diario disabled, no fake-crypto** — misma decisión ética que la web (ADR 0007 §G). Mismos textos.
4. **Sin avatar real en author card** — el componente usa initials sobre fondo `lavender[500]` siempre, aunque el backend devuelva `avatarUrl`. Cargar imágenes vía `<Image>` es un add separado que dispara networking sin payoff inmediato.
5. **`profile` tab hidden** (`href: null`) — el screen existe pero la UI completa de Users/Perfil no. Mantenerlo deep-link-only hasta que se construya evita confundir al usuario con un tab vacío.
6. **Search debounce 250ms** — coincide con el web. Mantener UX consistente entre stacks.
7. **Stats grid 2x1 en mobile** (3 cards) — Racha + Esta semana en la primera fila, Diario abajo. La pantalla mobile no tiene espacio horizontal para 3 cards lado-a-lado sin sacrificar legibilidad.

---

## §4 · Disciplina aplicada del diseño

Per `CLAUDE.md` mentor mode:

1. **Referencia visual:** abrir `docs/design/inicio/mobile.jsx`, `biblioteca/mobile.jsx`, `detalle/mobile.jsx`, `diario/mobile.jsx`.
2. **Contrato técnico:** mismos handoffs que el web (`02-inicio.md`, `03-biblioteca.md`, `04-detalle.md`, `06-diario.md`) — no se duplica.
3. **No copy-paste del JSX prototype** — adaptado a React Native StyleSheet, no a CSS.
4. **Re-uso del theme.ts** existente (mirror del `globals.css` web) — un solo design system, dos stacks.

---

## §5 · Diagramas

### 5.1 — Arquitectura mobile (paridad con web)

```mermaid
flowchart TB
  classDef screen fill:#dbeafe,stroke:#3b82f6,color:#1e40af
  classDef api fill:#fce7f3,stroke:#ec4899,color:#831843
  classDef shared fill:#fef3c7,stroke:#f59e0b,color:#78350f

  tabs[TabsLayout<br/>Tabs.Screen × 5]:::screen
  home[Inicio<br/>(tabs)/index.tsx]:::screen
  bib[Biblioteca<br/>(tabs)/books/index.tsx]:::screen
  det[Detalle<br/>(tabs)/books/[slug].tsx]:::screen
  diario[Diario<br/>(tabs)/diario/index.tsx]:::screen

  tabs --> home
  tabs --> bib
  tabs --> det
  tabs --> diario

  homeApi[homeApi.get]:::api
  booksApi[booksApi.list / getDetail / start]:::api
  diarioApi[diarioApi.list / getPromptOfTheDay]:::api

  home --> homeApi
  bib --> booksApi
  det --> booksApi
  diario --> diarioApi

  cover[coverColor helper]:::shared
  theme[theme.ts tokens]:::shared

  home -.-> cover
  bib -.-> cover
  det -.-> cover

  home -.-> theme
  bib -.-> theme
  det -.-> theme
  diario -.-> theme
```

### 5.2 — Paridad de design system web ↔ mobile

```mermaid
flowchart LR
  source[docs/design/colors_and_type.css<br/>source of truth]
  web[apps/web globals.css<br/>@theme tokens]
  mobile[apps/mobile theme.ts<br/>Colors · Spacing · Radius]

  source --> web
  source --> mobile

  components_web[Web components<br/>var(--color-lavender-500)]
  components_mobile[Mobile components<br/>Colors.lavender[500]]

  web --> components_web
  mobile --> components_mobile
```

---

## §6 · Verificación

```bash
pnpm --filter @psico/mobile typecheck    # ok
pnpm --filter @psico/mobile lint         # ok
pnpm --filter @psico/web typecheck       # ok (sin cambios)
pnpm --filter @psico/web lint            # ok
pnpm --filter @psico/api test            # 252/252
pnpm --filter @psico/api-client build    # ok (homeApi añadido, 62 KB d.ts)
pnpm --filter @psico/api-client generate:check  # in sync
```

---

## §7 · Deuda técnica abierta

- **Avatares de autor reales** — usar `<Image source={{ uri: author.avatarUrl }} />` cuando el backend tenga URLs poblados.
- **Gradientes en covers** — agregar `expo-linear-gradient` cuando se necesite paridad visual exacta. Hoy: solid colors.
- **Cliente cripto S6-crypto** — pre-requisito para que el Composer del Diario funcione.
- **Mood selector funcional** — actualmente el mood pill del composer está hardcoded a "Calma" hasta S6-crypto.
- **Toggles favorito/bookmark en cards de Biblioteca** — no implementados; el web sí los tiene optimistas. Mobile espera S5-front-mobile-toggles (sprint mini).
- **Modal "Escribir reseña"** — botón visible pero deshabilitado hasta que `userProgress.completedAt != null`.
- **Pull-to-refresh en Biblioteca y Diario** — solo Home lo tiene. Trivial add posterior.
- **Reader screen** — los CTAs "Empezar/Continuar" en Detalle todavía dependen del POST `/start` y luego no abren un reader real. Sprint S?-reader.
- **Eco screen** — los shortcuts del Home apuntan a `/(tabs)` (placeholder) hasta S10-front.
- **Profile tab** — existe el screen mobile pero el UI completo (UsersModule) no está construido aún.

---

## §8 · Aprendizajes / patrones

### Theme as a contract, not a copy

`apps/mobile/src/theme.ts` y `apps/web/src/app/globals.css` son **espejos** del mismo source (`docs/design/colors_and_type.css`). Cuando uno cambia, el otro tiene que cambiar también. Idealmente: extraer a `packages/design-tokens/` con build step que genere ambos. Para v1: vivir con la duplicación + comment al tope.

### Solid-color fallback es honesto

Antes que falsificar un gradiente con un blur o un layered View, un color sólido del design system se ve "intencional", no "roto". Cuando llegue el momento de hacer pulido visual, agregar `expo-linear-gradient` es un cambio aislado.

### Pull-to-refresh donde toca

No todos los screens necesitan pull-to-refresh. Home sí (estado vivo del usuario); Biblioteca no (los filtros ya re-fetching). Más interacciones ≠ mejor UX — solo donde el usuario tiene el modelo mental "esto cambia, dame lo último".

### `href: null` en Tabs es la fuga elegante

Cuando un tab no está listo, `<Tabs.Screen href={null}>` lo oculta del tabbar pero mantiene el screen disponible vía deep-link / programmatic navigation. Útil mientras se construye un módulo.

---

## §9 · Próximo paso

Tres opciones, alineadas con el Plan v2:

| Opción | Sprint                             | Qué entrega                                                                                                                         |
| ------ | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| **A**  | **S6-crypto**                      | Argon2id + XChaCha20-Poly1305 + ECDH X25519 client-side → desbloquea el Composer del Diario funcional (web + mobile en simultáneo). |
| **B**  | **S7 SubscriptionModule completo** | `/api/subscriptions/usage`, `/portal`, `/invoices`, `/cancel` + BullMQ jobs sync diaria.                                            |
| **C**  | **Polish sprint (mobile)**         | Toggles favorito/bookmark en cards, modal "Escribir reseña", reader screen básico, pull-to-refresh en más pantallas.                |
