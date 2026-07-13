# Deploy 2026-07-13 — Auditoría de env + fix del seed (desbloqueo de Railway)

**Rama:** `fix/seed-idempotent-chapterblocks` · **PR** [#522](https://github.com/georgenton/psico-platform/pull/522) (develop) + [#523](https://github.com/georgenton/psico-platform/pull/523) (sync main)
**Commits:** `d2da8fa` (fix) → `77ccd34` (develop) → `d8ad8a7` (main)
**Tests:** sin cambios (seed no está en la suite); `tsc --noEmit` verde. CI de #522/#523 todo verde.

---

## 1. Contexto

Tras cerrar el arco de libros + Mapa Emocional V2 + features sueltos (sugerencias adaptativas, narrator on, resonancia desde ejercicios), producción **servía un build del 2026-07-10**: `/api/eco/suggestions` daba 404 (ruta agregada el 07-12). El usuario pidió (a) auditar que las variables de entorno en Railway/Vercel estuvieran seteadas, (b) disparar el deploy y corregir lo que persistiera. Adjuntó el log del deploy fallido.

## 2. Auditoría de entorno (sin exponer valores — solo nombres + set/missing)

- **Railway · API (`psico-platform`, 46 vars):** 13/13 requeridas (crashean el boot si faltan) ✅ — `DATABASE_URL`, R2×5, `ANTHROPIC_API_KEY`, `VOYAGE_API_KEY`, Stripe×5. Opcionales presentes: `REDIS_URL`, `RESEND_API_KEY`, `GOOGLE_CLIENT_ID`, `OPENAI_API_KEY`, `VOICE_PROVIDER`, VAPID trio, `JWT_SECRET`, `NODE_ENV`. No seteadas (opcionales, no bloquean): `DEEPGRAM_API_KEY` (irrelevante: Voice usa Whisper vía OpenAI), `SENTRY_DSN`.
- **Railway · Worker (`psico-platform-worker`, 40 vars):** 13 requeridas + `REDIS_URL` ✅.
- **Vercel · Web (`psico-platform-web`):** `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_GOOGLE_CLIENT_ID`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (Production + Preview) ✅.
- **DB:** `prisma migrate status` contra el proxy público → **38/38 migraciones aplicadas, "up to date"** (incluye Fases D–H: `20260711120000`…`20260712000000`). La "deuda de migraciones acumuladas" del CLAUDE.md quedó **resuelta**.

**Conclusión de la auditoría:** el entorno NO era el bloqueante. Las variables ya estaban.

## 3. Causa raíz del deploy fallido

Del log del deploy `2026-07-12T01:01`:

```
migrate deploy → "No pending migrations to apply." ✅
Running seed command `ts-node prisma/seed.ts` ...
  prisma.chapterBlock.upsert() → P2002
  Unique constraint failed on the fields: (`chapterId`, `order`)
ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL: Command failed: prisma db seed
```

`prisma migrate deploy` (Prisma 7) **encadena el seed** configurado en `migrations.seed` de `prisma.config.ts`. El contenido real de _Emociones en Construcción_ (Parte I) se ingiere vía `scripts/ingest-chapter-md.mjs` con IDs **cuid**. El seed hacía `chapterBlock.upsert({ where: { id: "cb-emo-1-1" } })` con sus IDs estables → no encontraba las filas ingeridas → tomaba la rama `create` → **chocaba en `(chapterId, order)`** ya ocupado por el bloque real → P2002 → crash de todo el deploy. Adicionalmente, el `update` de los capítulos de book1 **revertía los títulos reales a placeholders** en cada deploy.

## 4. Fix (`apps/api/prisma/seed.ts`)

Hacer el seed **idempotente y no-destructivo** frente al contenido ingerido:

1. **ChapterBlocks:** el loop ahora **salta cualquier capítulo que ya tiene bloques** (`chapterBlock.count > 0`). El contenido ingerido/real gana; los bloques del seed son fallback de bootstrap solo para capítulos vacíos. No crashea, no clobbera. Fresh DB sigue seedeando.
2. **Títulos:** los caps 1/2 de book1 se alinean al canónico de la ingesta (`titles.json`): "¿Realmente sabemos qué es una emoción?" / "¿Existen realmente las emociones universales?" — el seed los **auto-cura** en vez de revertirlos.

## 5. Verificación en producción

`main` → `d8ad8a7`. Railway auto-desplegó (confirmado: el deploy fallido del 07-12 también fue git-triggered). ~5 min post-merge, el build nuevo quedó online:

| Ruta                                    | Antes            | Ahora          |
| --------------------------------------- | ---------------- | -------------- |
| `/health`                               | 200              | 200            |
| `GET /api/eco/suggestions`              | 404 (no existía) | **401** (viva) |
| `POST /api/emotional-map/text-features` | —                | **401** (viva) |
| `GET/POST /api/resonances`              | —                | **401** (viva) |
| `POST /api/eco/messages` (SSE)          | —                | **401** (viva) |
| `GET /api/patrones`                     | —                | **401** (viva) |

`401` = ruta existe detrás del guard de auth (esperado sin token).

## 6. Deuda / follow-ups

- **Stripe price IDs** (deuda #133): los 3 están seteados; falta confirmar en el dashboard de Stripe que son IDs reales de prod y no placeholders.
- **Sentry** sin trazas hasta setear `SENTRY_DSN` (API+worker) + `NEXT_PUBLIC_SENTRY_DSN` (Vercel).
- **`ANTHROPIC_API_KEY`** requerida para que el Narrator del Mapa produzca narrativa (sin ella → narrative null, mapa intacto). Está seteada en Railway ✅.
- **Ingesta de los 3 capítulos reales** debe correrse contra la DB destino (`ingest-chapter-md.mjs`) para ver el contenido tipado real en vez de los 2 capítulos placeholder — ver el checklist de prueba E2E del lector.
