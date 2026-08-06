# ADR 0021 — Experience Player V2: escenas de presentación separadas de los pasos de dominio

```
STATUS=ACCEPTED
APPROVED_BY_PRODUCT_OWNER=true
PRODUCT_OWNER=Jorge
APPROVAL_DATE=2026-08-06

GUIDE_DOMAIN_STEP_CONTRACT_CHANGED=false
EXPERIENCE_PRESENTATION_CONTRACT_ADDED=true
```

Sucede a nada. **No reemplaza [ADR 0019](./0019-guide-session-step-source.md)**: lo
usa.

## Contexto

Al diseñar Experience Player V2 apareció un conflicto real. El vocabulario que
el Player necesita para _mostrar_ un recorrido (una portada, un pasaje, un
ejemplo, un audio, un cierre) tiene doce nombres. El vocabulario que el dominio
usa para _registrar progreso_ tiene cuatro, fijados en ADR 0019 y aprobados en
PR #589.

Forzar los doce dentro del dominio habría significado inventar ocho políticas de
completitud nuevas y ocho formas nuevas de mover el registro de una persona.
Forzar la presentación dentro de los cuatro habría significado un Player que
solo sabe mostrar tres tipos de panel.

## Decisión

Dos vocabularios, deliberadamente separados.

**`GuideStepKind` — dominio, server-owned.** Sigue siendo exactamente el de
ADR 0019: `CONCEPT_EXPLORATION`, `ACTIVE_RECALL`, `CATALOG_PRACTICE`,
`EXPLICIT_CONFIRMATION`. El servidor decide si un paso se acepta, y eso —y solo
eso— es lo que significa «progreso».

**`ExperienceSceneKind` — presentación.** Doce paneles ordenados: `INTRO`,
`PASSAGE`, `CONCEPT`, `EXAMPLE`, `AUDIO`, `VIDEO`, `PRACTICE`, `REFLECTION`,
`QUESTION`, `RECALL`, `SUMMARY`, `RESONANCE`.

Las reglas que unen ambos:

- una escena puede vincularse a **cero o un** `GuideStep`;
- un `GuideStep` obligatorio debe vincularse a **exactamente una** escena;
- las escenas puramente presentacionales **no crean progreso**.

Seis de los doce tipos no pueden vincularse nunca: `INTRO`, `EXAMPLE`, `AUDIO`,
`VIDEO`, `SUMMARY` y `RESONANCE`. Un resumen no debe poder mover el registro de
nadie, y que eso sea _inexpresable_ vale más que una regla escrita.

La matriz vive en `packages/types/src/experience.ts` como dato, no como prosa, y
`validateExperienceAgainstGuide` la aplica en el arranque del proceso: una
vinculación a un paso inexistente, o una `REFLECTION` que dice completar un
`ACTIVE_RECALL`, revienta el boot en vez de aparecer como un botón muerto frente
a un lector.

## Consecuencias

- El lifecycle Guide V1 no cambia. Un `GuideSession` sigue fijado a
  `guideKey@guideVersion` y su ledger sigue siendo la única autoridad de
  progreso.
- El Player deriva qué escena mostrar de la definición + `currentStepKey` +
  pasos aceptados. Las transiciones visuales entre escenas presentacionales son
  estado local; no se persiste cada panel.
- `RESONANCE` sigue siendo opcional y separada: «Ahora no» no escribe nada y la
  experiencia se completa igual.
- El audio y el video reutilizan `chapter_media_completed`. El lifecycle Guide
  no duplica ese evento.

## Alternativas descartadas

**Doce `GuideStepKind`.** Habría requerido ocho políticas de completitud nuevas
—y por tanto ocho maneras nuevas de que algo cuente como progreso— para resolver
un problema de presentación.

**Cuatro escenas.** Un Player que solo sabe dibujar concepto, práctica y
recuerdo no es un recorrido; es un formulario.
