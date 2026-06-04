# Sprint S40 — UI tests mobile (Jest + RNTL + jest-expo)

**Rama sugerida:** `feature/sprint-40-mobile-ui-tests`
**Tests mobile nuevos:** 16/16 (3 archivos) — primer batch de tests UI mobile del proyecto.
**Web + API + crypto:** sin cambios (24/24, 358/359, 34/34).

---

## 1. Scope

Cierra la simetría que faltaba después de S39 (web): setup completo de Jest + jest-expo + React Native Testing Library en `apps/mobile`, más cobertura de 3 componentes presentacionales críticos paralelos a los tests web:

1. **UsageCards mobile** (6 tests) — null state, 4 cards, ilimitado, no incluido, "de N", date range.
2. **InvoicesList mobile** (5 tests) — null return, empty state, render con invoices, abre PDF via `Linking.openURL`, omite botón cuando `pdfUrl` es null.
3. **TourOverlay mobile** (5 tests) — fetch catalog + first step, advance, Terminar con `stepsCompleted=N`, Saltar con index actual, empty catalog dismiss.

Componentes con `expo-router` (screens completas como `(tabs)/patrones.tsx`) quedan diferidos — necesitan `expo-router/testing-library` o un harness adicional para `useRouter`.

---

## 2. Decisiones

1. **Jest + jest-expo, no Vitest.** Vitest no tiene la babel preset que RN necesita (Reanimated, Flow stripping en `@react-native/js-polyfills`). jest-expo es la pieza oficial de Expo SDK 52.
2. **`transformIgnorePatterns` pnpm-safe.** El default jest-expo asume layout shallow `node_modules/<pkg>`. pnpm flatten a `node_modules/.pnpm/<pkg>@.../node_modules/<pkg>` — usé regex con `(.*/)?<pkg>` para que matchee a cualquier profundidad. Sin esto, `react-native/jest/setup.js` falla en parser de Flow types.
3. **`babel.config.js` explícito** con `babel-preset-expo`. Expo's Metro auto-aplica, pero Jest no comparte el resolver de Metro — necesita config propia.
4. **Mock de `@expo/vector-icons` en setup.** El render real intenta inicializar nativeFonts vía Expo's font-loading bridge que no existe en el jest env (`loadedNativeFonts.forEach is not a function`). El stub renderiza el `name` como `<Text>`.
5. **`jest.config.js` keys correctos:** `setupFilesAfterEnv` (no "setupFilesAfterEach" — esa no existe).
6. **`testMatch` para `src/**/_.test.tsx`y`app/\*\*/_.test.tsx`.\*\* Convención análoga a vitest en web.
7. **`@testing-library/react-native/extend-expect`** para matchers como `toBeOnTheScreen`, `toHaveTextContent`, `toHaveProp`.
8. **Sin tests de screens completos con `expo-router`.** Sprint S41 cuando se justifique — necesita `expo-router/testing-library` o el harness con Stack/Tabs mocked.

---

## 3. Cambios

### Setup

- `apps/mobile/package.json`:
  - dev deps: `jest@^29.7.0`, `jest-expo@~52.0.6`, `@testing-library/react-native@^12.9.0`, `react-test-renderer@18.3.1`, `@types/jest`, `@types/react-test-renderer`.
  - scripts: `test` (`jest --passWithNoTests`) + `test:watch`.
- `apps/mobile/babel.config.js` — `babel-preset-expo` para Jest.
- `apps/mobile/jest.config.js` — preset `jest-expo`, `setupFilesAfterEnv`, testMatch, transformIgnorePatterns pnpm-safe, moduleNameMapper `@/*` → `src/*`.
- `apps/mobile/jest.setup.ts` — `extend-expect` + mock de `@expo/vector-icons`.

### Tests creados

| File                                                  | Tests  |
| ----------------------------------------------------- | ------ |
| `src/components/dashboard/plan/UsageCards.test.tsx`   | 6      |
| `src/components/dashboard/plan/InvoicesList.test.tsx` | 5      |
| `src/components/TourOverlay.test.tsx`                 | 5      |
| **Total**                                             | **16** |

### Patrones repetibles documentados

- `jest.mock("@psico/api-client", () => ({ /* methods */ }))` para mockear el cliente.
- `jest.spyOn(Linking, "openURL").mockResolvedValue(undefined)` para verificar deep-links.
- `fireEvent.press(...)` para simular taps sobre `Pressable`.
- `await waitFor(() => screen.getByText(...))` para esperar fetch + setState.
- Cast `as jest.Mocked<typeof apiClient>` para tipos correctos en mocks.

### Sin cambios

- API, web, types, api-client — sin cambios.
- Componentes de producción no se tocaron.

---

## 4. Verificación

- **Mobile tests:** 16/16 en 1.7s.
- **Mobile typecheck + lint:** clean.
- **Web tests:** 24/24 (sin cambios).
- **API tests:** 358/358 + 1 skipped sentinel (sin cambios).
- **@psico/crypto:** 34/34.
- **OpenAPI `generate:check`:** in sync (no shape changes).

---

## 5. Deuda técnica abierta

- **Sin tests para screens completos con expo-router.** `(tabs)/patrones.tsx`, `(tabs)/eco/index.tsx`, `(tabs)/plan.tsx` requieren harness con Stack/Tabs mocked o `expo-router/testing-library`. Sprint S41 candidato.
- **Sin tests para `_layout.tsx`** del tabs y onboarding. Esos hookean a `useAuth` y `useDiaryKey` — necesita harness con providers.
- **Sin coverage thresholds.** Sembramos infraestructura; próximo sprint añade coverage como floor.
- **Sin integración a CI.** Workflow `.github/workflows/ci.yml` no corre `pnpm --filter @psico/mobile test` aún. Se cubre con el wire que sigue.
- **Sin tests del crypto context** (`useDiaryKey` provider) ni del `useAuth`. Esos atan a SecureStore y necesitan mock adicional.
- **Sin snapshot testing.** RN Testing Library lo soporta pero v1 no lo usamos — prefiero queries semánticas explícitas.
- **Reanimated mock** no añadido (no lo necesitamos en estos 3 componentes; cuando un test atraviese una animación, agregar `jest.mock("react-native-reanimated", () => require("react-native-reanimated/mock"))`).

---

## 6. Resumen para Notion

**Qué cerramos en Sprint S40:**

- Setup Jest + jest-expo + RN Testing Library + jest-dom matchers en `apps/mobile`.
- 3 archivos de test cubriendo 16 cases sobre componentes presentacionales críticos.
- Patrones repetibles documentados (`jest.mock` del cliente, `Linking` spy, `fireEvent.press`, `transformIgnorePatterns` pnpm-safe).
- Doc con decisiones técnicas para el resto del equipo.

**Qué viene:**

- Wire `pnpm --filter @psico/web test` + `pnpm --filter @psico/mobile test` al CI workflow turbo `--affected`.
- Tests de screens completas con `expo-router` harness.
- Tests del crypto context + auth context con providers mockeados.
- Coverage thresholds (60% lines como floor) en web + mobile.
- Bugfix #2 Stripe price IDs reales.
- Pulso v2 admin dashboard.
