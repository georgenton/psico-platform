# Sprint — Mapa Emocional · el radar hexagonal honesto (web)

**Rama:** `feature/emotional-map-hexagon-radar`
**Fecha:** 2026-07-14
**Tests:** Web 316/316 (MapRadar 5 nuevos, InicioV2 1 actualizado) · API copy-contract + v2-contract verdes · typecheck + lint web limpios.

## Contexto

El usuario probó el Mapa V2 y preguntó por qué no se usa el mismo estilo gráfico
del mapa anterior (el radar tipo "red") y si se podía adaptar. La respuesta: el
radar nunca fue un problema gráfico — el componente `Radar` seguía vivo, pero la
migración V2 (decisión **L2**, Fase F) lo restringió a un triángulo de 3 ejes
autoinformados porque el hexágono viejo **rellenaba las 6 puntas con datos que no
medía** (Conexión/Propósito derivados de la actividad de lectura, y varias
puntuadas por el LLM). El `Radar` viejo incluso tenía `values[i] ?? 0.5` — el
literal "todo al 50 %" fabricado.

Se le mostró un mockup de un hexágono **honesto** (SVG) y lo aprobó
("me encanta el mockup, implementémoslo").

## Por qué ahora SÍ se puede

Bajo V2 las 6 puntas ya tienen fuente real, solo que cada una se enciende por su
lado:

| Eje                                | Fuente (Model Registry)                        |
| ---------------------------------- | ---------------------------------------------- |
| Claridad · Compasión · Consciencia | check-ins (CHK-S1)                             |
| Calma                              | dinámica del ánimo, modelo OU (OU-GT/OU-G0)    |
| Conexión                           | resonancias confirmadas (ARC-C1)               |
| Propósito                          | resonancias marcadas como importantes (ARC-P1) |

## Lo que se construyó (solo web)

- **`MapRadar.tsx`** (nuevo) — hexágono SVG de 6 ejes + filas por eje. Regla
  central: cada punta llega a su valor **solo si** `confidence >= CONFIDENCE_FLOOR`
  (0.15); las que aún no tienen señal se dibujan con **spoke punteado + nodo hueco**
  y estado "Reuniendo datos" — nunca un valor por defecto. El polígono lavanda
  conecta únicamente las puntas con señal, así que la forma crece conforme el
  usuario alimenta el mapa.
  - **Sin porcentaje global.** Cada fila muestra su procedencia (badge "Tu
    check-in" / "Tu ánimo" / "Tus resonancias" mapeado desde `evidence.modelId`)
    - valor + "Basado en N registros tuyos".
  - `compact` → solo el hexágono pequeño (para el mini-mapa de Inicio).
- **`mapa/page.tsx`** — `MapSelfReport` → `MapRadar` (visual principal, con el
  `MapInfoButton` ⓘ intacto).
- **`InicioV2.tsx`** — mini-mapa usa `MapRadar compact`.
- **`MapSelfReport.tsx` + test eliminados** (el hexágono es superconjunto del
  triángulo de 3 ejes).
- **copy-contract** — `MapSelfReport` → `MapRadar` en la lista de archivos bajo
  contrato. Cero términos prohibidos (cuidado con **"medido"** y **"confianza"**,
  ambos en la lista; el badge usa "Autoinformado"/procedencia, no "medido").

## Verificación

- Tests web 316/316; copy-contract (2/2) + v2-contract (20/20) verdes.
- **Verificado en el navegador** con la cuenta demo (`demo-estable@psico.test`)
  apuntando el dev web a la API de producción: el hexágono renderiza con datos
  reales — Calma 72 % (TU ÁNIMO, 71 registros), Claridad 88 % / Compasión 78 % /
  Consciencia 83 % (TU CHECK-IN), Conexión + Propósito en "Reuniendo datos". Sin
  porcentaje global en el mapa.

## Privacidad (ADR 0007)

Cambio solo de UI. No toca el scoring, el wire, ni el cifrado. El mapa sigue
consumiendo `EmotionalMapDimension[]` (números + procedencia), nunca texto.

## Decisiones

1. El hexágono **reemplaza** al triángulo (superconjunto honesto), no se añade
   como vista extra — evita duplicar los 3 ejes de check-in.
2. Gate por eje `confidence >= 0.15` (mismo umbral que usaba `MapSelfReport`).
3. Badge de procedencia por `evidence.modelId` en vez de "Medido" (término
   prohibido por el copy-contract).
4. SVG propio dentro de `MapRadar` (el `Radar` genérico no maneja el estado
   "gathering"); el `shell/Radar` queda sin uso pero se conserva.

## Deuda / follow-ups

- **Paridad mobile** — requiere instalar `react-native-svg` (dep nativa +
  rebuild EAS); el `jest.config` ya la contempla en `transformIgnorePatterns`.
  Sprint aparte.
- El sidebar del nav shell (`_DashboardShell`) todavía muestra un badge
  "Comprensión emocional 74 %" (heredado, fuera del mapa). Inconsistente con el
  principio V2 de "sin % global" — candidato a limpiar en su propio PR.
- `shell/Radar.tsx` + `home/MapaPreviewCard.tsx` quedan como código sin uso
  (limpieza opcional).
