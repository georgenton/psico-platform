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

Ver `KNOWN_VIOLATIONS` en el spec — 8 archivos pineados (MapStage, MapDims, MapAffectDynamics, MapFeed, MapInfoButton, affect-copy web+mobile, mapa.tsx mobile). Se corrigen en Fase B' (decisión L1) y Fase F, encogiendo el snapshot con cada fix.

**Fuera del alcance del ratchet pero registrado:** la landing ([\_landing-html.ts:204](../../apps/web/src/app/_landing-html.ts)) dice "Releyendo lo que escribiste esta semana, noto algo" — imposible con E2E (Eco no puede releer mensajes pasados del usuario). Corregir junto con B'.
