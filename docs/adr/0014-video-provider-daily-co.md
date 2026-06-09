# ADR 0014 — Video provider for Terapia v1: Daily.co with provider strategy

**Status:** Accepted · 2026-06-09
**Sprint:** S62 (Terapia foundations)
**Supersedes:** none

## Contexto

El diseño en `docs/design/handoff/11-terapia.md` Pantalla 8 dice:

> Decisión técnica recomendada: integrar Daily.co o Whereby embebido, NO construir esto en casa.

Necesitamos sala de videollamada para sesiones de terapia con:
- audio + video bidireccional
- token corto (≤2h TTL)
- sin grabación (privacidad)
- sin chat ni screenshare en v1
- compatible con web (React) y mobile (React Native)
- low-jitter en LATAM (TURN servers regionales)

## Opciones evaluadas

| Criterio | Daily.co | Whereby | Twilio Video | LiveKit Cloud |
|---|---|---|---|---|
| SDK React + RN | ✅ official | ✅ official | ✅ official | ✅ official |
| Pricing $/min | ~$0.004 | ~$0.005 | ~$0.0035 | ~$0.005 |
| TURN regional LATAM | ✅ Sao Paulo | ⚠️ via global | ✅ | ✅ |
| Token rotation per session | ✅ meeting tokens | ✅ room URLs | ✅ access tokens | ✅ JWT |
| Recording opt-out | ✅ default off | ✅ default off | ✅ | ✅ |
| Embeddable iframe | ✅ prebuilt | ✅ prebuilt | ❌ SDK only | ❌ SDK only |
| Mobile native quality | A | B+ | A | A |
| Docs + DevEx | A | A | B | A |
| Free tier para dev | 10000 min/mes | 100h/mes | $50 credit | $5k credit |

## Decisión

**Daily.co como provider default + interface `IVideoProvider` para swap futuro.**

Razones:
1. **TURN regional Sao Paulo** — crítico para LATAM (boundary Ecuador → LATAM).
2. **Iframe prebuilt** ahorra UI work del lector de video — se renderiza con `<DailyIframe>` web y `<Daily.Room>` mobile.
3. **Free tier 10k min/mes** cubre validación inicial (1 sesión/usuario/mes × 50 min × ~200 users = 10k min).
4. **Documentación A** — onboarding rápido al equipo.
5. **Token model conocido** — paridad con cómo manejamos Stripe (`IPaymentProvider`) y Voice (`IVoiceProvider`).

Implementamos el patrón provider strategy igual que los demás:

```ts
export interface IVideoProvider {
  createRoom(opts: { sessionId: string; expiresInSec: number }): Promise<{ roomUrl: string }>;
  createJoinToken(opts: { roomUrl: string; userName: string; isOwner: boolean; expiresInSec: number }): Promise<{ joinToken: string; expiresAt: Date }>;
  destroyRoom(roomUrl: string): Promise<void>;
  isConfigured(): boolean;
}

@Injectable() class DailyVideoProvider implements IVideoProvider { ... }
@Injectable() class ConsoleVideoProvider implements IVideoProvider { ... } // stub para dev sin key
```

DI token `VIDEO_PROVIDER` análogo a `STRIPE_PROVIDER`, `VOICE_PROVIDER`, `APNS_PROVIDER`.

### Sala policy

- `room.config: { audio: true, video: true, chat: false, screenshare: false, recording: false }`.
- Token con `expiresInSec: 7200` (2h, buffer sobre sesión de 50 min).
- Solo se entrega el `joinToken` cuando estamos dentro de la ventana `[scheduledAt - 5min, scheduledAt + duration + 15min]`.

## Env vars requeridas

```bash
VIDEO_PROVIDER=daily             # default. "console" para stub local
DAILY_API_KEY=...                # https://dashboard.daily.co/developers
DAILY_API_URL=https://api.daily.co/v1  # default
DAILY_DOMAIN=psico-ec.daily.co   # subdomain del workspace
```

`envSchema.superRefine` exige `DAILY_API_KEY` solo cuando `VIDEO_PROVIDER === "daily"`.

## Consecuencias

**Positivas:**
- TURN regional reduce jitter para users en Ecuador / LATAM.
- Provider swap a Whereby/LiveKit en 1 archivo nuevo cuando el volumen lo justifique.
- Patrón conocido por el equipo (mismo que Stripe/Voice/APNs).
- Free tier cubre primeros ~100 usuarios pagos sin costo.

**Negativas:**
- Vendor lock-in al SDK de Daily (prebuilt iframe). Mitigación: el SDK queda solo en `apps/web` y `apps/mobile`; el backend solo consume su API HTTP.
- Daily Free tier no incluye SLA. Para producción pagada, plan Scale ($0.004/min).
- Recording desactivado por default; si después abrimos opcional, requiere consent flow + storage S3.

**Privacidad:**
- Tokens son short-lived; nunca persisten en DB del lado server (solo `joinUrl` derivado en `TherapySession`).
- No grabación → no archivos a almacenar / borrar.
- Notes del terapeuta van por separado en `TherapistNote` (E2E encrypted, ADR 0007).

## Referencias

- [Daily.co Docs — Meeting Tokens](https://docs.daily.co/reference/rest-api/meeting-tokens)
- [Daily.co Pricing](https://www.daily.co/pricing/)
- `docs/design/handoff/11-terapia.md` § Pantalla 8
- ADRs análogos: 0008 (Stripe/PayPhone strategy), 0010 (BullMQ), 0012 (APNs strategy)
