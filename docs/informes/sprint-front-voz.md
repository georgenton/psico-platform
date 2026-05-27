# Sprint front-voz — Voice-to-text UI (Web + Mobile)

**Fecha:** 2026-05-27
**Rama:** `feature/sprint-front-voz`
**Tests:** 323/323 API + 34/34 crypto (sin cambios — sprint UI)
**Bitácora previa:** [sprint-front-fase1-mi-plan.md](sprint-front-fase1-mi-plan.md)

---

## §1 · Scope

Sprint UI continuación de fase 1, consumiendo el S8 VoiceModule. Pantalla `/voz` standalone con integración bidireccional al composer del Diario.

**Flow del usuario:**

```
[Diario composer]                            [/voz screen]
       │
       │   tap "🎙️ Dictar"
       │   → navigate(/voz?return=/diario)
       ├──────────────────────────────────────►
                                               1. Tap mic → request perm
                                               2. Record audio
                                               3. Stop → POST /voz/transcribe
                                               4. Edit transcript
                                               5. Tap "Usar este texto"
                                                  → handoff.set(text)
       ◄──────────────────────────────────────┤
       │  (web: router.push(returnPath))
       │  (mobile: router.back())
       │
       │   useEffect / useFocusEffect:
       │   handoff.consume() → setText(prev + transcript)
       │
[Composer pre-filled with transcript]
```

---

## §2 · Lo que se construyó

### Web (`apps/web`)

**Hook + util** (`src/lib/voice/`):

- `use-recorder.ts` — MediaRecorder wrapper con state machine `idle | permission-denied | unsupported | recording | stopped`. Timer ticks cada 250ms. Hard cap a `MAX_RECORDING_MS = 10 min`. Sin pausa/resume en v1.
- `handoff.ts` — `setVoiceHandoff(text)` + `consumeVoiceHandoff()` usando sessionStorage. Read-and-delete pattern.

**Componente** (`src/components/dashboard/voz/VozRecorder.tsx`):

- Client Component que orquesta todo el state: recorder + transcribing + ready + error mappings (402 → cuota, 403 → Pro required, 413 → too large, 415 → format).
- Sub-componentes inline: `Idle`, `Recording`, `Stopped`, `Transcribing`, `PermissionDenied`, `Unsupported`.
- Al "Usar este texto" → `setVoiceHandoff(transcript)` + `router.push(returnPath)`.

**Página** (`src/app/dashboard/voz/page.tsx`):

- Thin Server Component que inyecta `API_BASE` + access token.
- Lee `?return=…` (default `/dashboard/diario`).

**Integración con Diario** (`src/components/dashboard/diario/ActiveComposer.tsx`):

- Botón `🎙️ Dictar` en el footer del composer → `Link href="/dashboard/voz?return=/dashboard/diario"`.
- `useEffect` al mount → `consumeVoiceHandoff()` → append al texto si existe.

### Mobile (`apps/mobile`)

**Dependencia nueva:** `expo-av@~15.0.0` (Audio.Recording API).

**Util** (`src/lib/voice/handoff.ts`):

- Singleton in-memory (`let pending`). No AsyncStorage (transcript no debe sobrevivir cierre de app por privacidad).
- Mismo contrato que web (`setVoiceHandoff` + `consumeVoiceHandoff`).

**Screen** (`app/(tabs)/voz.tsx`):

- Paridad con web: idle → recording → stopped → transcribing → ready.
- `expo-av Audio.Recording.HIGH_QUALITY` preset (m4a iOS / webm Android).
- Error mappings idénticos a web (402 / 403 → CTAs específicos).
- "Usar este texto" → `setVoiceHandoff` + `router.back()` (fallback `router.replace(returnPath)` si no hay back stack).
- Registrado en `(tabs)/_layout.tsx` con `href: null` (hidden de la tabbar; solo accesible por nav).

**Integración con Diario** (`(tabs)/diario/index.tsx`):

- Botón "🎙️ Dictar" en el footer del composer.
- `useFocusEffect` para `consumeVoiceHandoff()` cuando la screen regaina foco (volviendo de /voz).

---

## §3 · Decisiones de diseño

### Handoff por storage vs query params

**Web: sessionStorage.** Razón: transcripciones pueden tener cientos de chars; URL-encoded en query produciría URLs feas que muestran el plaintext en history. sessionStorage es per-tab y se borra al cerrar — privacy default.

**Mobile: in-memory singleton (no AsyncStorage).** Razón: AsyncStorage persiste cross-launches y eso es indeseable — un transcript no debería sobrevivir un app-kill. Singleton en módulo cubre el caso real (navigation hop dentro de la misma sesión JS).

Ambos: read-and-delete (`consume` borra al leer). `useEffect(() => {...}, [])` en web y `useFocusEffect` en mobile.

### Single-take, sin pausa/resume

El design 07-voz.md menciona pausa/resume pero v1 ships una toma única. Si el user no está conforme, "Volver a grabar" descarta el blob y vuelve a idle. Pausa/resume agrega ~200 LOC en la state machine + manejo de MediaRecorder.pause() (no soportado en Safari iOS) — v2.

### Sin waveform visualization

Diseño dice waveform RMS en tiempo real (Web Audio API + canvas). v1 muestra un dot rojo pulsante + timer prominente. El waveform es polish; la funcionalidad core es grabar+transcribir.

### Cap cliente 10 min vs server 25 MB

Server acepta hasta 25 MB (~20 min). Cliente capea a 10 min para:

1. Producir audios chicos (~5-7 MB típicos) → upload rápido.
2. UX honesta: tu mensaje cabe en 10 min o probablemente debas escribir directo.
3. Cost containment: 10 min vs 20 min = 2× costo en Whisper.

### Web web-only, mobile-only paths

El recorder ANTES de transcribir vive 100% en el cliente. No hay state cross-platform. Cada plataforma usa su API nativa:

- Web: MediaRecorder + Blob → multipart form (apiClient bypassed; fetch + bearer manual).
- Mobile: expo-av → `{uri, name, type}` shape de RN FormData → apiClient.postFormData.

Mobile específicamente NO hace `fetch(file://).blob()` + multipart porque algunos Android pre-12 mishandle el boundary; el {uri,name,type} shape es la receta canónica.

---

## §4 · Error states cubiertos

| Status                     | Trigger                             | UX                                           |
| -------------------------- | ----------------------------------- | -------------------------------------------- |
| 403 VOICE_REQUIRES_PRO     | FREE user calls /transcribe         | Banner + "Ver planes" CTA                    |
| 402 VOICE_QUOTA_EXCEEDED   | PRO at 120 min                      | "Sin minutos" + back CTA                     |
| 413 PAYLOAD_TOO_LARGE      | Audio > 25 MB (rare with 10min cap) | "Graba menos de 20 min"                      |
| 415 UNSUPPORTED_MEDIA_TYPE | Weird codec (Firefox edge case)     | "Tu navegador grabó en formato no soportado" |
| 500 / network              | Server down                         | Generic "Reintenta"                          |
| permission-denied          | Mic blocked                         | "Abre los ajustes del navegador"             |
| unsupported                | Old browser sin MediaRecorder       | "Prueba Chrome/Safari recientes"             |

Mobile equivalentes via `Audio.requestPermissionsAsync()` rejection → "Abre Ajustes y permite el micrófono".

---

## §5 · Bugs corregidos durante el sprint

1. **`ApiError.status` no existe** — la propiedad es `statusCode`. Fix en mobile `voz.tsx`.
2. **`blob` variable unused en mobile** — primera versión leía `fetch(file://).blob()` antes de usar `{uri,name,type}`. Removed y dependent code cleanup.

---

## §6 · Deuda técnica abierta

- **Sin tests UI.** Mismo argumento que sprint Mi Plan — esperar a tener masa crítica.
- **No waveform / no pausa-resume.** v2 nice-to-haves.
- **No streaming partial transcript.** Whisper batch; Deepgram streaming sí soporta pero el server lo hace batch para uniformidad. Si UX lo pide → S10.5 backend + client.
- **Web fetch bypassa apiClient** — porque apiClient.post auto-JSON-stringify. Tenemos `postFormData` en el cliente pero no quería duplicar el manejo de 401 → refresh para el flow voice. Si en el futuro el flow voice necesita refresh automático, mover a `postFormData`.
- **Mobile sin retry-on-401-refresh** — `apiClient.postFormData` sí lo tiene, así que mobile está cubierto. Solo web requiere ese trabajo si lo necesitamos.
- **Stripe Portal mobile** sigue con problema de deep-link return (heredado de sprint Mi Plan). Sin impacto directo en voz.
- **VOICE backend keys no configurados en Railway** — sin `OPENAI_API_KEY` (o DEEPGRAM) el endpoint /voz/transcribe falla en boot del Voice module. Bloqueante para deploy del feature.

---

## §7 · Verificación

```bash
# back (sin cambios)
pnpm --filter @psico/api test          # 323/323 ✓
pnpm --filter @psico/api typecheck     # ✓
pnpm --filter @psico/api lint          # ✓

# web
pnpm --filter @psico/web typecheck     # ✓
pnpm --filter @psico/web lint          # ✓
pnpm --filter @psico/web build         # ✓

# mobile
pnpm --filter @psico/mobile typecheck  # ✓
pnpm --filter @psico/mobile lint       # ✓

# shared
pnpm --filter @psico/api-client generate:check   # ✓ in sync
```

---

## §8 · Resumen para Notion

**¿Qué se construyó?** Pantalla `/voz` standalone (web y mobile) con flujo idle → recording → transcribing → ready. Botón "🎙️ Dictar" en el composer del Diario que navega a `/voz?return=…`. Al confirmar "Usar este texto", el transcript se pre-fillea en el composer via sessionStorage (web) o singleton in-memory (mobile). Error handling completo para los 4 status codes del backend (402/403/413/415) + permisos de micrófono.

**¿Qué viene?**

- **Sprint front-eco**: chat con SSE streaming, sidebar de hilos, crisis modal, cifrado cliente.
- **Deploy a Railway**: prerequisito para probar voz/eco con usuarios reales (10 migraciones + 5 envs).

**Bloqueante de deploy del módulo voz:** `OPENAI_API_KEY` (o `DEEPGRAM_API_KEY`) en Railway. Sin eso el módulo crashea en boot.
