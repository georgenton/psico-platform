# Sprint Fix Salt-Length DTO + Sprint 5 audit

**Fecha:** 2026-06-17
**Rama:** `fix/salt-length-dto`
**Tests:** 674/675 API (+6 nuevos DTO · 1 skipped sentinel) · web/mobile/crypto sin cambios

---

## Contexto

Empezamos Sprint 5 del roadmap (Recovery seed phrase UI wire + Edit entry mobile parity). Antes de tocar código auditamos el estado actual de los dos flows con un agente de exploración. Resultado inesperado:

**Ambos flows ya estaban wireados desde sprints anteriores:**

- **Seed phrase modal web** — montado en `DiarioShell.tsx:69` con gate `!seedAlreadyShown && !ackInThisSession && masterKey`. Post-unlock dispara el modal de 2 pasos (mostrar 24 palabras + confirmar 3 random).
- **Seed phrase modal mobile** — montado en `(tabs)/diario/index.tsx:121-126`. Lazy-fetch de `/user/me` post-unlock para chequear `cryptoSeedShownAt`. Si null → dispara el modal. POST `/api/user/crypto-seed-acknowledged` cierra el loop.
- **Edit entry mobile** — `(tabs)/diario/[id].tsx` tiene state machine completo (`editing`, `draft`, `draftMood`, `draftTags`), `startEdit()`, `handleSave()` que PATCH a `/api/diario/entries/:id` con cifrado + mood + tags. Paridad con web confirmada.

El roadmap del 2026-06-13 listaba estos como pendientes basándose en el audit que NO miró el detalle de DiarioShell + (tabs)/diario/\*.tsx. Lo corregimos en este sprint.

## Lo que sí construimos: fix del salt-length DTO

Cierra la **deuda explícita del Sprint 3** (`sprint-e2e-rekey-lectorshell`). Bug descrito en esa bitácora:

> `password-change-with-rekey.dto.ts` validates `Length(24, 28)` for `newCryptoSalt` but `auth.service.ts` produces 22-char salts (16 bytes b64url). Any rekey real falla con 400 antes de llegar al service.

Fix de una línea: loosen la longitud aceptada a `[22, 28]`.

### Cambios

**`apps/api/src/users/dto/password-change-with-rekey.dto.ts`**

```diff
- const SALT_B64_LEN = 24; // 16 bytes b64url unpadded
+ const SALT_B64_MIN = 22;
+ const SALT_B64_MAX = 28;
```

```diff
- @Length(SALT_B64_LEN, SALT_B64_LEN + 4)
+ @Length(SALT_B64_MIN, SALT_B64_MAX)
```

El comment incorrecto del SALT_B64_LEN ("16 bytes b64url unpadded = 24 chars") se reemplaza con uno que documenta correctamente: 16 bytes b64url unpadded = 22 chars. El rango 22-28 cubre tanto el output actual del auth.service como un potencial cliente que use salts más grandes en el futuro (sigue siendo seguro encima del floor de 128 bits).

**`apps/api/src/users/rekey.e2e-spec.ts`**

El E2E del Sprint 3 usaba `randomBytes(18)` como workaround para pasar la validación. Ahora usa `randomBytes(16)` — exactamente lo que el auth.service produce. Esto convierte el test E2E en una **regression guard real** del bug.

**`apps/api/src/users/dto/password-change-with-rekey.dto.spec.ts`** (nuevo)

6 tests del DTO:

- Acepta 22-char salt (lo que auth produce).
- Acepta 24-char salt (forward compat futuros clients).
- Acepta 28-char salt (upper bound).
- Rechaza 21-char salt (below 128-bit floor).
- Rechaza 29-char salt (likely client bug).
- Rechaza chars no-base64url (`+`, `/`) incluso a la longitud correcta.

### Por qué no se cambió el auth.service

Considerada y descartada: cambiar `auth.service.ts` para producir salts de 18 bytes (24 chars). Tres razones:

1. **Cuentas legacy**: users existentes tienen salts de 22 chars persistidos en `User.cryptoSalt`. El DTO igual tendría que aceptar ambos.
2. **No security benefit**: 16 bytes ya están encima del floor OWASP de 128 bits.
3. **Single-point fix**: cambiar solo el DTO es la menor superficie de cambio + no toca comportamiento de Argon2id que ya está en prod.

---

## Smoke verification

```
@psico/api tests       674/675 (+6 nuevos)
@psico/api typecheck   OK
@psico/api lint        OK (4 warnings preexistentes)
```

E2E rekey ahora corre con salts de 22 chars (idénticos a los que auth produce).

---

## Roadmap update

Marcaremos `sprint-5` como **ya completado** en el roadmap. El item del salt-length DTO fix entra como sprint propio cerrando deuda de Sprint 3.

---

## Próximo paso

Roadmap polish items pendientes:

- **Settings UI: explicit TZ selector** (~½ día) — auto-detect funciona pero no hay forma manual.
- **`expo-av` → `expo-audio` migration** (3-5 días) — metadata dinámica de lock-screen desde JS + dSYM upload pipeline.
- **Testcontainers para E2E API** — el test rekey sigue con Prisma mock; migrar permitiría detectar bugs de queries reales (e.g. el shape del `$transaction`).

O bien moverse a la fase **freeze + validación** del v1 — todos los Sprints 1-4 del roadmap están cerrados (la parte código) y los items 6-7 también. Las únicas piezas faltantes son ops (Stripe price IDs, API keys en Railway).
