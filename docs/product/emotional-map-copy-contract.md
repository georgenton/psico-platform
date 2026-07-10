# Copy contract del Mapa Emocional — v1 (Fase B)

**Enforcement:** [`copy-contract.spec.ts`](../../apps/api/src/emotional-map/copy-contract.spec.ts) — ratchet sobre los componentes públicos del mapa (web + mobile). Introducir un término prohibido nuevo **rompe el build**; corregir uno existente exige encoger el snapshot en el mismo PR.

## Permitido

- "Tus registros recientes…" · "Basado en N registros entre A y B"
- "Estimación experimental" · "Base limitada / moderada / más sólida"
- "Aún no hay suficientes registros" · "Reuniendo datos"
- "Autoinformado" · "Basado en tus respuestas" · "Confirmado por ti"
- "Patrón de lenguaje local" · "Práctica completada" (con conteo, sin "dominas")
- "Nivel central estimado" · "Nivel reciente estimado" · "Tendencia reciente" · "Variación alrededor de tu tendencia"
- "Ritmo estimado de retorno" / "Persistencia estimada" — **solo** con n≥100 e intervalo
- "No constituye diagnóstico" · "Puedes corregir o eliminar este insight"

## Prohibido (con motivo)

| Término                                                                                    | Por qué                                                        |
| ------------------------------------------------------------------------------------------ | -------------------------------------------------------------- |
| "Comprensión emocional N%"                                                                 | promedio de ejes heterogéneos sin interpretación defendible    |
| "Confianza N%"                                                                             | `n/40` no es confianza; cobertura real del CI ≈78 % (paper E3) |
| "Te recuperas rápido" / "a tu ritmo"                                                       | θ no identificado bajo n≈100 (paper E1)                        |
| "Vas en buena dirección"                                                                   | normativo; usar copy descriptivo de tendencia                  |
| "Tu ánimo de base es bueno"                                                                | convierte escala ordinal en valoración                         |
| "Tu ánimo es muy parejo" / "estás en calma"                                                | baja dispersión ≠ calma; un plano bajo no es calma             |
| "Señal temprana…"                                                                          | EWS-R1 research-only (sensibilidad 40 %)                       |
| "Medido"                                                                                   | sugiere validez psicométrica; usar "Autoinformado"             |
| "Minutos de lectura" / "Racha actual" / "Conversaciones con Eco" **como fuentes del mapa** | engagement → LearningDashboard                                 |
| "La IA notó que…" / "la IA sabe cómo te sientes"                                           | falso (texto E2E) y manipulador                                |
| "Riesgo detectado" / "Crisis detectada" / diagnósticos / perfiles de terceros              | no diagnóstico; crisis flow separado                           |
| "Dominas esta habilidad"                                                                   | práctica ≠ dominio                                             |

## Violaciones conocidas hoy (snapshot del ratchet)

Ver `KNOWN_VIOLATIONS` en el spec. Fase B' (L1) limpió el bloque afectivo completo: `MapAffectDynamics` y los dos `affect-copy` (web + mobile) ya no contienen términos prohibidos — el snapshot se encogió de 8 a 5 archivos. Lo que queda pineado pertenece a fases posteriores: el % global + badge "Medido" (Fase F) y los chips de engagement (Fase C → LearningDashboard).

**Landing corregida en Fase B':** el chat de demostración de [\_landing-html.ts](../../apps/web/src/app/_landing-html.ts) ya no dice "Releyendo lo que escribiste esta semana, noto algo" (imposible con E2E — Eco no puede releer mensajes pasados del usuario). El diálogo nuevo solo muestra a Eco reflexionando sobre lo que la persona dice en esa misma conversación.
