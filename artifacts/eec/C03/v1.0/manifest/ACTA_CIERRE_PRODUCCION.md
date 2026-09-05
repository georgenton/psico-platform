# Acta de cierre productivo — EEC-C03

**Capítulo:** `EEC-C03 — Tu cerebro inventa emociones`
**Estado editorial:** `TEXT_LOCKED` · **Estado productivo:** `PRODUCTION_LOCKED`
**Fecha de esta acta:** 4 de septiembre de 2026

Esta acta existe para que dentro de un año se pueda saber qué se publicó, desde
qué bytes y con qué evidencia, sin abrir un chat ni reconstruir nada.

## De dónde salieron los bytes

| | |
| --- | --- |
| Canónico | `EEC_C03_v1.0_TEXT_LOCKED_2026-08-25.md` |
| SHA-256 | `79c427f56089ba693e8c836d737ac0b3dd5c5ab54dbfc8746a02799bbe28beb1` |
| Recuperación | **CANONICAL_ORIGINAL_VERIFIED** · método `LOCAL_MD` |
| ¿Coincide con el SHA histórico? | **Sí.** El fichero recuperado hashea exactamente lo que declaran Notion y el manifiesto de cierre |

El texto se recuperó del corpus que el autor reunió en `~/Downloads` el 2026-09-04.
**No es una reconstrucción ni un snapshot de Notion**: son los bytes originales del
cierre editorial. `chapter.md` es copia byte a byte y el build vuelve a hashearlo
en cada ejecución — si alguna vez cambiara, el build se detiene en vez de publicar
un texto distinto del que se cerró.

Ninguna palabra del texto `TEXT_LOCKED` se modificó.

## Qué se publicó

| | |
| --- | --- |
| Edition | `emociones-en-construccion-1e` (`cms54lbmv0001lnrto8llr2hb`) |
| Unidad | orden 3 · `f1fd8e4d-39ac-547f-908a-cb97c7f9170b` · `cms54lf9600hnlnrtdfecefhq` |
| Versión de unidad | `cmtnpg50m0001ecn1kwbkof8t` |
| Revisión | **11 → 12** |
| Bloques | **264** |
| Parte | 1 · Deconstruyendo lo que sabíamos |
| Origen del lector | **Content Core** (bloques nativos) |

## Verificación productiva

- El lector sirve los **264 bloques idénticos uno a uno** al build canónico:
  **0 diferencias**, comprobado bloque a bloque contra producción.
- El capítulo abre con 200 y sirve el recuento esperado.
- C01 y C02 conservan sus 188 y 230 bloques, sin tocar.

## Preservación histórica

Medida contra `production-preimage.json` y `production-postimage.json`:

- Highlights **11**, annotations **2**,
  sesiones **33** y progreso **5**:
  idénticos antes y después. Nada se reasignó por posición.
- `ChapterBlock` legados intactos (**1550** antes y después).
- Las revisiones anteriores siguen ahí: la edición pasó de 11 a 19 revisiones y
  **ninguna se borró**.

## Bibliografía y citas

Bibliografía **original** del paquete de cierre (`eec-c03.bib` convertido campo a campo desde el RIS/BibTeX del autor), con 23 registros.

**Citas: 0 resueltas · 23 sin resolver**, todas con motivo `NO_ANCHOR`. El
manuscrito no lleva marcadores de cita y ningún encabezado nombra a una autoría,
así que dónde va cada llamada es una decisión autoral (EEC-REF-OPS-001 §4). Es una
deuda editorial declarada, no contenido inválido, y es el mismo criterio con el que
se publicó C02.

## Trazabilidad

| | |
| --- | --- |
| PR | #692 → merge `32b4db3d` |
| Rama | `content/c03-c10-production` |
| Manifiesto global | `EEC_PRODUCTION_C01_C10_MANIFEST.json` |

CI verde. Desplegado y confirmado antes de publicar.

## Rollback

La revisión **11** sigue completa, con su manifiesto y sus versiones de unidad:
republicarla por el mecanismo oficial devolvería C03 a su estado anterior sin
destruir nada.

## Regla de cierre

`PRODUCTION_LOCKED`. Cualquier cambio sustantivo del texto exige una versión nueva
del canónico, reapertura editorial y una ingesta propia. No se sobrescribe
v1.0 y no se reingiere este capítulo.
