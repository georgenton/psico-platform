# Deploy incident — 2026-06-01 (Railway API resurrection)

**Rama:** `fix/deploy-prisma-corruption`
**Bitácora previa:** [sprint-front-eco.md](sprint-front-eco.md)
**Contexto:** primer deploy a Railway desde Sesión 8. Tres sprints de backend (S5-S10) y siete sprints de UI acumulados desde el último deploy productivo.

---

## §1 · Síntoma

El proyecto Railway existía con Postgres + Redis sanos, pero el servicio del API (`psico-platform`) servía código pre-Sprint 0.A: `/health` 200, `/api/health` 404 porque el global prefix `/api` (Sesión 11) aún no estaba en producción. Diario, Eco, Voice, Onboarding, Home — ningún módulo nuevo accesible.

Dos `railway up` consecutivos fallaron con "Deploy failed (6m)" y "Deploy failed (8m)". El monitor del healthcheck nunca vio `/api/health=200`.

---

## §2 · Causa raíz — **archivos `migration.sql` corrompidos**

Las migraciones `20260526180000_s5_books_authors_categories_reviews_home` y `20260526210000_s6_diary_e2e_encryption` tenían como **primera línea literal**:

```
Loaded Prisma config from prisma.config.ts.
```

Eso es output del CLI de Prisma 7 (que imprime esa línea informativa en stdout cuando carga `prisma.config.ts`). En algún momento al generar las migraciones — probablemente con un pipe o redirección incorrecta — esa línea de texto se filtró DENTRO del archivo `migration.sql` y se commiteó así.

En Railway, `prisma migrate deploy` ejecutó el SQL del archivo como un solo statement, Postgres recibió `Loaded Prisma config from prisma.config.ts.` como si fuera SQL, y devolvió:

```
ERROR: syntax error at or near "Loaded"
Position: 0
```

La migración s5 quedó en la tabla `_prisma_migrations` con `started_at` pero sin `finished_at` — el estado "FAILED" que Prisma usa para bloquear futuros deploys (error P3009).

**Por qué `pnpm test` local no lo detectó:** los tests del API usan un mock de Prisma, no ejecutan el SQL real. Y nadie había corrido `prisma migrate deploy` contra una DB real desde Sesión 8.

---

## §3 · Otros bloqueantes encontrados (y resueltos en este PR)

### Build de Railway intentando buildear todo el monorepo

El `railway.json` original no tenía `buildCommand`. Nixpacks corría `pnpm build` raíz por default, que es `turbo build` y buildea **todo** (api + web + mobile + packages). El segundo intento de deploy llegó a 7m solo en build, y el primero (que ya tenía la migración corrompida) llegó a 6m sin terminar build.

**Fix:** `apps/api/railway.json` ahora declara:

```json
"buildCommand": "pnpm install --frozen-lockfile && pnpm --filter @psico/api... build"
```

El selector `@psico/api...` (tres puntos finales) buildea el API + todas sus dependencies upstream del workspace (types, crypto, api-client) — y NADA más.

### Migraciones no se aplicaban automáticamente al deploy

El `startCommand` original (`node dist/main`) no tocaba la DB. Cualquier migración acumulada quedaba pendiente.

**Fix:** agregué `preDeployCommand: "pnpm --filter @psico/api migrate:deploy"` en `railway.json`. Railway lo corre como step independiente antes del start; si falla, el deploy se aborta sin rotar la versión anterior (zero-downtime preservado).

---

## §4 · Cómo se desbloqueó

Desde local, apuntando al **public proxy** de Railway Postgres (`switchyard.proxy.rlwy.net`):

```bash
# 1. Diagnóstico — leer _prisma_migrations directo
node -e '<pg.Client query>'   # → confirmó error "syntax error at or near \"Loaded\""

# 2. Confirmar que la migración no se aplicó ni parcialmente
node -e '<pg.Client check Book columns>'   # → solo columnas viejas, ninguna nueva de S5

# 3. Limpiar los 2 archivos SQL contaminados
sed -i '/^Loaded Prisma config from prisma.config.ts.$/d' migration.sql

# 4. Marcar la entrada FAILED como rolled-back
prisma migrate resolve --rolled-back 20260526180000_s5_books_authors_categories_reviews_home

# 5. Aplicar las 7 migraciones pendientes desde local
prisma migrate deploy
# → "All migrations have been successfully applied."

# 6. Redeploy del API (esta vez el código sí inicia, las migraciones ya están aplicadas)
railway up --detach
```

Resultado: **28 → 43 tablas** en la DB. API arrancando con el global prefix `/api`. Endpoints S5-S10 todos respondiendo.

---

## §5 · Por qué este PR existe

Si NO commiteamos estos archivos:

1. Cualquier futuro `railway up` desde `develop` reintroduce el bug del `Loaded Prisma config` (las migraciones siguen contaminadas en el git).
2. El `buildCommand` con filter desaparece — vuelve a tardar 7m por buildear todo el monorepo.
3. `preDeployCommand` desaparece — las migraciones futuras no se aplican automáticamente.

Este PR blinda los tres puntos.

---

## §6 · Verificación

```bash
# Local — confirma que las migraciones están limpias
grep -l "^Loaded Prisma config" apps/api/prisma/migrations/*/migration.sql
# (sin output)

# Local — el build filtrado pasa
pnpm --filter @psico/api... build   # ✓

# Producción — la API responde con el código nuevo
curl https://psico-platform-production.up.railway.app/api/books/categories
# → {"categories": [...]}
curl https://psico-platform-production.up.railway.app/api/subscriptions/plans
# → [{"plan": "FREE", ...}, {"plan": "PRO", ...}, ...]
```

---

## §7 · Deuda técnica abierta (post-deploy)

- **Stripe price IDs** en Railway son `prod_*` (product IDs) en vez de `price_*`. El listing de planes funciona, el `/api/subscriptions/checkout` va a fallar. Reemplazar cuando se quiera probar el checkout real.
- **`STRIPE_WEBHOOK_SECRET="test"`** — placeholder. Reemplazar con el valor real de `stripe webhooks` cuando se vaya a probar el flujo de pago.
- **Worker BullMQ no provisionado.** Daily-usage rollup, account-deletion delayed jobs, email queue → todos inactivos. Crear segundo servicio Railway con `startCommand: "node dist/worker"` cuando se enchufe Resend o data-export.
- **Resend (RESEND_API_KEY) y Google OAuth (GOOGLE_CLIENT_ID)** sin configurar. Verify-email + password-reset + Sign in with Google no funcionan hasta que se setean.
- **OPENAI_API_KEY rotada** post-deploy porque quedó expuesta en el chat history del proceso. Si en producción se observan calls a OpenAI desde IPs no esperadas, asumir compromiso y rotar de nuevo.

---

## §8 · Lecciones

1. **Nunca dejes pasar tres meses entre deploys.** Las migraciones acumuladas amplifican el blast radius de cualquier bug: en este caso, una migración corrompida bloqueó otras seis.
2. **`migration.sql` debe ser SQL puro.** Cuando generes una migración con Prisma, revisa los primeros y últimos bytes del archivo. Idealmente: hook de pre-commit que valide que la primera línea no-vacía empiece con `--` o un statement SQL.
3. **Railway necesita `buildCommand` explícito para monorepos.** El default (`pnpm build` raíz con turbo) buildea todo lo del workspace; en un monorepo grande eso explota el tiempo de build. Filtrar al package + sus deps es obligatorio.
4. **`preDeployCommand` para migraciones**, no `startCommand` con `&&`. Si lo metes en el start, Railway no distingue entre "migrate falló" y "app falló" — y los logs salen interleaved. Como step separado, el log es limpio.
