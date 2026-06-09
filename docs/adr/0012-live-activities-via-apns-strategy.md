# ADR 0012 — Live Activities (iOS Dynamic Island) via APNs strategy

**Status:** Accepted · Backend stub shipped 2026-06-09 · Real APNs integration pending Apple Developer account.
**Sprint:** E.5 (S60)
**Supersedes:** none

## Contexto

El diseño en `docs/design/handoff/14-dynamic-island.md` define 3 tipos de Live Activities (iOS 16.1+, Dynamic Island):
- `TERAPIA_SESSION` — countdown + en vivo + post-rating.
- `LECTOR_ACTIVE` — título de capítulo + % progreso + ETA.
- `ECO_ACTIVE` — "pensando" → "respondiendo".

Necesitamos:
1. **Schema + endpoints** que reciban el push token específico por actividad (DISTINTO del device push token de S43).
2. **Provider abstrahido** para APNs HTTP/2 — swap entre stub local y real cuando lleguen las creds.
3. **No bloquear el resto del backend** mientras esperamos el Apple Developer account ($99/año + 24-48h approval).

## Decisión

**Estrategia idéntica a `IPaymentProvider` (Stripe / PayPhone) y `IVoiceProvider` (Whisper / Deepgram):**

```ts
// providers/apns-provider.interface.ts
export interface IApnsProvider {
  sendUpdate(opts: {...}): Promise<{ok: true} | {ok: false; invalidToken: true}>;
  isConfigured(): boolean;
}

// providers/console-apns.provider.ts — default v1
@Injectable() class ConsoleApnsProvider implements IApnsProvider { ... }

// providers/apns2.provider.ts — futuro
@Injectable() class Apns2Provider implements IApnsProvider {
  // lib `apns2` (HTTP/2 a `api.push.apple.com`)
  // construye topic = `${bundleId}.push-type.liveactivity`
  // firma JWT con `.p8` privado + Team ID + Key ID
}
```

Binding en `LiveActivitiesModule`:
```ts
providers: [
  ConsoleApnsProvider,
  { provide: APNS_PROVIDER, useExisting: ConsoleApnsProvider },
]
```

Cuando lleguen las creds, una sola línea cambia a `Apns2Provider`.

### Schema

```prisma
enum LiveActivityKind { TERAPIA_SESSION  LECTOR_ACTIVE  ECO_ACTIVE }

model LiveActivityToken {
  id          String           @id @default(cuid())
  userId      String
  activityId  String           // mobile-side UUID
  kind        LiveActivityKind
  pushToken   String           @unique // 32-64 hex chars
  bundleId    String           // "com.psico.platform"
  createdAt   DateTime         @default(now())
  dismissedAt DateTime?        // soft delete
  user        User             @relation(...)
  @@unique([userId, activityId])
}
```

### Endpoints (3)

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/api/push/live-activity` | Registrar / refresh token per-activity. Upsert idempotente. |
| GET | `/api/push/live-activity/active` | Listar actividades vivas del usuario. |
| DELETE | `/api/push/live-activity/:activityId` | Dismiss + envía APNs `end` event si configurado. |

Pushes server-driven (eco "responding", lector "complete") usan `LiveActivitiesService.pushUpdate(userId, activityId, contentState)` desde un BullMQ job futuro.

## Por qué no AVOID el sprint hasta tener Apple Dev account

1. **Schema + endpoints + provider interface NO requieren creds**. Pueden vivir en producción con el stub sin riesgo.
2. **Probar el flow desde mobile sin APNs** sirve igual — la app registra el token, el backend lo persiste, todo el round-trip excepto el push real funciona.
3. **Cuando lleguen las creds, el swap es 1 línea** + agregar env vars + redeploy. Sin re-arquitectura.

## Privacidad — no negociable

`contentState` NUNCA incluye:
- `textCiphertext` / `textNonce` del Diario.
- `assistantText` o `userText` plaintext de Eco (sí puede incluir conteos: "12 mensajes nuevos").
- Frase semilla BIP39 o material derivado.

`contentState` SÍ incluye:
- IDs opacos (chapterID, threadID, sessionID).
- Counters (% progreso, ETA en min, n mensajes pendientes).
- Strings UI cortos NO derivados de E2E (título de capítulo público, nombre del terapeuta).

El `ConsoleApnsProvider` loggea `contentState` a stdout. El caller debe respetar el invariant — no hay defensa en el provider mismo.

## Configuración pendiente (cuando llegue Apple Dev)

Env vars que el `Apns2Provider` espera:

```bash
APNS_TEAM_ID=ABCDEF1234         # 10-char Team ID de Apple Dev
APNS_KEY_ID=ABCDE12345          # 10-char Key ID del .p8
APNS_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n..."  # .p8 content
APNS_BUNDLE_ID=com.psico.platform                     # reverse-DNS
APNS_ENVIRONMENT=production     # o "sandbox" para test
```

Y el `Apns2Provider` reemplaza al stub:
```ts
{ provide: APNS_PROVIDER, useExisting: Apns2Provider }
```

## Consecuencias

**Positivas:**
- El mobile app puede empezar a integrar `expo-modules-core` + Activity widget en paralelo a Apple Dev approval.
- Cero impacto sobre flows existentes (NotificationsModule sigue intacto).
- Mismo patrón provider que ya conocemos.

**Negativas:**
- Producción tiene 3 endpoints que no hacen "lo que dicen" hasta que llegue Apple Dev. Mitigation: response del `register` incluye `isProviderConfigured: boolean` para que el cliente lo sepa.
- Un row de `LiveActivityToken` registrada antes de Apple Dev sigue sirviendo (solo no se le pushea hasta que el provider real exista).
- Stale tokens pueden acumularse — agregar un cron de pruning weekly cuando el módulo madure.

## Alternativas consideradas

1. **No shipear nada hasta tener Apple Dev** — desperdicia el slot mental que el equipo invirtió ahora en pensar el modelo.
2. **Server-side rendering del Activity en lugar de APNs push** — no existe. iOS exige push tokens per-activity.
3. **WebSocket en lugar de APNs** — no aplica a Live Activities (sistema operativo solo acepta APNs).

## Referencias

- [Apple Developer — Updating and ending your Live Activity with ActivityKit push notifications](https://developer.apple.com/documentation/activitykit/updating-and-ending-your-live-activity-with-activitykit-push-notifications)
- [apns2 npm](https://www.npmjs.com/package/apns2)
- `docs/design/handoff/14-dynamic-island.md`
- ADR 0010 — BullMQ worker (mismo patrón "el codebase está listo, el provisioning ops queda fuera del PR")
