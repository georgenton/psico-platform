# Sprint V2 · Fase B' — Hotfix L1 (EWS off del wire · gate 100 · copy neutro)

**Fecha:** 2026-07-10
**Rama:** `feature/emotional-map-hotfix-b-prime`
**Decisión aplicada:** **L1** (aprobada por el usuario: "vamos con L1") — el ítem de mayor riesgo ético del audit de Fase A, con el fix más barato gracias a las palancas pre-cableadas en Fase B.

---

## 1. Qué corrige

La auditoría de Fase A encontró tres claims públicos que la evidencia del paper (`docs/research/paper-1-results.md`) no sostiene:

1. **"Señal temprana" (EWS) visible en producto.** El detector EWS-R1 tiene sensibilidad del 40 % (E5) — pierde 6 de cada 10 transiciones reales. Un aviso de autocuidado basado en eso genera falsa seguridad cuando calla y ansiedad cuando habla.
2. **Recuperación/persistencia mostradas desde n=20.** θ (el parámetro del que derivan) no es identificable bajo n≈100 (E1: RMSE 1.16 en n=30). "Te recuperas rápido" con 20 registros era una afirmación sin sustento.
3. **Copy evaluativo + "Confianza N %".** "Sueles estar en un buen lugar", "te recuperas rápido", "tu ánimo de base es bueno" evalúan a la persona desde una escala ordinal de 5 caritas; "Confianza" era `n/40` disfrazado (cobertura real del CI ≈78 %, E3).
4. **(Bonus) Landing con claim imposible.** El chat demo decía "Releyendo lo que escribiste esta semana, noto algo" — Eco no puede releer mensajes pasados del usuario (son ciphertext, ADR 0007).

## 2. Qué se cambió

### Backend (`apps/api`)

- **`shared/flags.ts`** — `EMOTIONAL_MAP_EWS_PUBLIC` pasa a `defaultOn: false`. El servicio ya pasaba el flag al scoring (palanca de Fase B), así que el wire público deja de emitir `ews` sin tocar el servicio. El detector **sigue corriendo internamente**: la función pura mantiene `ewsPublic = true` por default, así el banco de personas y el path de research quedan intactos (persona `senal-temprana` sigue leyendo `rising`).
- **`emotional-map.scoring.ts`** — `RECOVERY_MIN_OBS: 20 → 100`, alineado con E1. Recuperación e inercia se retienen (null + `recoveryNeeded: 100`) hasta ~100 registros.
- **`model-registry.ts`** — EWS-R1 documenta el retiro del wire; el spec ancla `RECOVERY_MIN_OBS === 100`.

### Copy (web + mobile, twins sincronizados)

- **`affect-copy.ts` (ambos)** — reescritura completa a copy **descriptivo**: "Nivel central en categorías agradables/intermedias/menos agradables" (no "tu ánimo de base es bueno"), "Ritmo de retorno estimado: rápido/gradual/pausado" (no "te recuperas rápido"), "Variación baja/moderada/alta alrededor de tu tendencia" (no "muy parejo"). Headlines de tendencia neutrales (no "vas en buena dirección"). `EWS_NOTE` y `AffectStory.ewsNote` eliminados. Nueva `evidenceBaseLabel(nObs)`: base limitada (<20) · moderada (<100) · más sólida (≥100) — reemplaza "Confianza N %".
- **`MapAffectDynamics.tsx` (web) + `mapa.tsx` (mobile)** — sin nota de señal temprana (aunque un blob cacheado la traiga); fila de recuperación con nota honesta "Reuniendo más información · ~N registros más"; footer con la etiqueta de base de evidencia + disclaimer "no constituyen un diagnóstico" / "no es un diagnóstico".
- **`_landing-html.ts`** — chat demo reescrito: Eco reflexiona sobre lo que la persona dice **en esa conversación** (patrón "debería"), y la resonancia se propone como confirmable ("Si te resuena, puedes añadir este tema a tu Mapa").

### Ratchets (encogen, nunca crecen)

- **`copy-contract.spec.ts`** — snapshot de 8 → 5 archivos: `MapAffectDynamics` + ambos `affect-copy` quedan limpios. Lo pineado restante pertenece a Fase F (% global, "Medido") y Fase C (chips de engagement).
- **`emotional-map.v2-contract.spec.ts`** — la "KNOWN VIOLATION 7.4" se reemplaza por dos asserts: el flag default es OFF, y la vista research (función pura sin override) sigue computando EWS.

### Tests ajustados por el gate 100

- `emotional-map.service.spec.ts` — n=40 ahora espera recovery/inercia null + `recoveryNeeded: 100`.
- `benchmark.spec.ts` — trimestre-disciplinado (n=77) queda gated (honesto); prueba de desbloqueo con serie sintética de 110 obs; margen de recovery de la persona madura pasa a null.
- `MapAffectDynamics.test.tsx` (web, reescrito), `affect-copy.test.ts` web + mobile (reescritos con el copy nuevo, `evidenceBaseLabel`, missing=88, sin `ewsNote`).

## 3. Verificación

| Suite                    | Resultado                                                                                 |
| ------------------------ | ----------------------------------------------------------------------------------------- |
| API (Vitest)             | 797/798 (1 skipped sentinel) ✅                                                           |
| Web (Vitest + RTL)       | 299/299 ✅                                                                                |
| Mobile (Jest + RNTL)     | 65/65 ✅                                                                                  |
| Typecheck ×3             | ✅ (0 errores; 7 warnings preexistentes en API)                                           |
| Lint ×3                  | ✅                                                                                        |
| OpenAPI `generate:check` | in sync ✅ (sin cambios de shape — `ews` y `recoveryNeeded` ya eran opcionales/numéricos) |

## 4. Qué NO cambió

- **Sin migración Prisma, sin endpoint nuevo, sin cambio de shape en el wire** — `ews` era opcional (cache-tolerant) desde Etapa 5; ahora simplemente viene `null`/ausente.
- **ADR 0007 intacto** — nada de esto toca cipher/nonce ni texto.
- **El detector EWS y el gate ≥60 siguen vivos** para research/banco; solo salieron del producto público.
- **Blobs cacheados** con `ews` o `recovery` pre-B' se toleran: la UI los ignora defensivamente (test explícito).

## 5. Deuda / siguientes decisiones (documentadas en `docs/architecture/emotional-map-v2.md` §6)

- **L2** — radar restringido a autoinforme ("Resumen de tus respuestas").
- **L3** — provider LLM → Narrator (solo copy, nunca scores).
- **L4** — opt-in del análisis local de texto.
- **L6** — alcance del LearningDashboard (Fase C).
- Gate de **tendencia** (hoy se muestra desde n≈8; la política V2 dice n=60) se alinea en Fase F junto con la UI V2.
