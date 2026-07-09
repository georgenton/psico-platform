# Runbook E2E — Mapa Emocional en producción (Fase 0 + Fase 2)

**Fecha:** 2026-07-09 · **Alcance:** probar el Mapa Emocional (incluida la capa OU de dinámica afectiva) end-to-end contra la API de producción, sin esperar semanas.

Dos herramientas, ya en el repo:

- `apps/api/scripts/e2e-prod-smoke.mjs` — smoke contra la **API** (Fase 0: deploy + integraciones · Fase 2: verifica el mapa por persona con aserciones vs el banco). No escribe en la DB.
- `apps/api/scripts/seed-mood-history.mjs` — inserta ánimo **con fechas repartidas en el pasado** en la **DB** (para que la capa OU pase a "active" sin esperar). Bustea el cache si hay `REDIS_URL`.

> **Privacidad (ADR 0007):** ambos scripts solo tocan ánimo ordinal + timestamps + conteos. Cero texto.

---

## Prerequisitos

1. **Railway CLI** logueado y apuntando al proyecto (`railway link`), para correr el seed contra la DB de prod: `railway run ...`.
2. **URL de la API de prod** (ej. `https://psico-platform-production.up.railway.app`). La guardamos en una var:
   ```bash
   export API=https://psico-platform-production.up.railway.app
   ```
3. **Una cuenta ADMIN** (para el check de integraciones de la Fase 0).
4. Node 20+ local (para `e2e-prod-smoke.mjs`, usa `fetch` global).

**Decisión asumida:** corremos contra la **DB de prod** con **cuentas de prueba dedicadas** (throwaway) y `--reset`, para no ensuciar datos reales. Si prefieres un entorno aparte, apunta `API` y el `DATABASE_URL` del `railway run` a staging.

---

## Fase 0 — precheck de deploy + integraciones (~10 min)

### 0.1 Deploy vivo y en el commit correcto

```bash
node apps/api/scripts/e2e-prod-smoke.mjs --api=$API \
  --email=admin@tucuenta.com --password='TU_PASS_ADMIN'
```

Salida esperada:

- `✓ GET /api/health → 200`
- `✓ login admin@… → token`
- Bloque **integraciones** con una línea por servicio: `configured` / `configured (STUB)` / `MISSING`.

**Qué mirar (bloqueantes del mapa):**

- `anthropic` → si `MISSING`, los ejes interpretativos caen a rule-based (válido, pero verás "Análisis inicial" en vez de "Análisis con IA"). No bloquea la capa OU.
- `redis` → si `MISSING`, no hay cache **ni** bust del seed → los cambios del seed no se reflejan al instante. **Recomendado tenerlo.**

Además, en Railway confirma que el último deploy de `api` (y `worker`) apunta al `main` con Etapa 0 + Etapa 1 (busca el commit `feat(emotional-map): stage 1 …`).

### 0.2 Kill-switch

Confirma en Railway que **`EMOTIONAL_MAP_OU` NO está en `off`** (sin setear = activo). Si el smoke muestra `affectDynamics = null`, es esto.

---

## Fase 2 — persona backdated en prod (~30 min) ⭐

La prueba real: misma matemática, DB real, API real. Por cada persona el ciclo es **registrar → sembrar → verificar**.

### Ejemplo completo — persona "estable"

```bash
# 1) registrar la cuenta (idempotente: si existe, sigue)
node apps/api/scripts/e2e-prod-smoke.mjs --api=$API \
  --email=test-estable@tucuenta.com --password='Str0ngPass!' \
  --register --name='Test Estable'

# 2) sembrar 90 días de ánimo estable en la DB de prod (bustea el cache)
railway run node apps/api/scripts/seed-mood-history.mjs \
  --email=test-estable@tucuenta.com --days=90 --pattern=stable --reset

# 3) verificar el mapa vs el banco
node apps/api/scripts/e2e-prod-smoke.mjs --api=$API \
  --email=test-estable@tucuenta.com --password='Str0ngPass!' --persona=stable
```

### Las 4 personas a correr

Repite el ciclo cambiando `--pattern` (seed), `--persona` (verify) y `--days`:

| Cuenta                | seed `--pattern` `--days` | verify `--persona` | Qué debe salir (afecto)                                           |
| --------------------- | ------------------------- | ------------------ | ----------------------------------------------------------------- |
| test-estable          | `stable` `90`             | `stable`           | active · **estab > 40%** · recup/inercia visibles (nObs ≥ 20)     |
| test-volatil          | `volatile` `30`           | `volatile`         | active · **estab < 35%**                                          |
| test-recuperando      | `improving` `60`          | `improving`        | active · estab baja (esperado en tendencias — límite documentado) |
| test-corto            | `stable` `14`             | `stable`           | active · **recup/inercia en "gate"** (nObs < 20) · estab presente |
| test-nuevo (sin seed) | —                         | `new`              | **gathering** N/8                                                 |

El smoke imprime PASS/PASS por aserción y sale con código ≠ 0 si algo falla — apto para pegar en CI o repetir tras cada cambio del modelo.

### Interpretación

- Si una persona en prod **contradice** el banco offline (ej. "estable" da 0%), ahí hay un bug de integración (cache viejo, código stale, o env). El banco offline (`emotional-map.benchmark.spec.ts`) es la fuente de verdad de qué DEBE salir.
- La cobertura (`coverage`) sube con la actividad, no solo con el ánimo — para llenar los ejes no-OU (Conexión, Propósito) el test-account necesitaría también lectura/Eco. Para validar la capa OU basta el ánimo.

---

## Limpieza

Cada seed con `--reset` borra el `MoodLog` de la ventana antes de insertar, así que re-correr es idempotente. Para dejar una cuenta limpia:

```bash
railway run node apps/api/scripts/seed-mood-history.mjs \
  --email=test-estable@tucuenta.com --days=90 --pattern=stable --reset --skip=1
# --skip=1 salta todos los días → borra la ventana sin insertar nada
```

Las cuentas de prueba pueden borrarse desde Perfil → eliminar cuenta, o dejarse para re-usar.

---

## Siguiente (Fase 3, opcional)

Convertir esto en un harness automatizado: un solo comando que registra → siembra (vía API o DB) → verifica las N personas → reporta. Requiere un token de seed o acceso a un entorno efímero. Es el "banco end-to-end real" del roadmap.
