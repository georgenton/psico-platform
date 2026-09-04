# Lote EEC-C03 → C10 · compuerta de entrada

Estado: **`BATCH_NOT_READY`** — la publicación no comenzó. Nada se escribió en
producción durante esta auditoría.

Esta carpeta guarda la evidencia de por qué, para que el lote pueda arrancar en
cuanto se resuelva, sin repetir el trabajo.

## Qué se comprobó

`canonical-inputs-gate.json` — capítulo por capítulo: el estado editorial que
declara Notion, el nombre y el SHA-256 del canónico, si los **bytes** de ese
canónico existen en este entorno, y si la unidad de producción existe.

`production-preimage.json` — instantánea READ ONLY del libro antes de tocar
nada: Work, Edition, revisión publicada 11, las tres unidades, los capítulos
legados y los agregados de preservación (highlights, annotations, sesiones).

## Los dos bloqueos

### 1 · Faltan los bytes de 7 de los 8 canónicos

Los diez capítulos están `TEXT_LOCKED` en Notion, y Notion declara para cada uno
su fichero canónico y su SHA-256. Lo que Notion **no** guarda son los ficheros:
las actas dicen que los paquetes «se entregan para importación mecánica», es
decir, se descargaron localmente.

En este entorno solo aparece uno de los ocho:

| Capítulo | Canónico declarado | Bytes aquí |
| --- | --- | --- |
| C03 | `EEC_C03_v1.0_TEXT_LOCKED_2026-08-25.md` · `79c427f5…beb1` | ❌ |
| C04 | `EEC_C04_v1.0_TEXT_LOCKED_2026-08-25.md` · `7f22cfb9…e1ce` | ❌ |
| C05 | `EEC_C05_v1.0_TEXT_LOCKED_2026-08-26.md` · `0f35f0d0…c956` | ❌ |
| C06 | `EEC_C06_v1.1_TEXT_LOCKED_2026-09-01.md` · `ac963f73…4d7a` | ✅ verificado |
| C07 | `EEC_C07_v1.0_TEXT_LOCKED_2026-08-26.md` · `26a9b187…8bd9` | ❌ |
| C08 | `EEC_C08_v1.0_TEXT_LOCKED_2026-08-26.md` · `6b71342e…36c2` | ❌ |
| C09 | `EEC_C09_v1.0_TEXT_LOCKED_2026-08-27.md` · `02b42dbd…a956` | ❌ |
| C10 | `EEC_C10_v1.0_TEXT_LOCKED_2026-08-27.md` · `a732ccb4…23c9b` | ❌ |

Cuidado con C03: sí existe un paquete local suyo,
`EEC_C03_INTEGRACION_FINAL_PRO_REVIEWED_2026-08-25.zip`, cuyo texto completo
hashea `98e14a9e…fc51`. **No es el canónico**: es la versión previa al bloqueo, y
su propio control de congelamiento dice «`TEXT_LOCKED`: todavía no». Publicarla
sería publicar un texto distinto del que se cerró.

Reconstruir cualquiera de los siete desde Notion, RTF, PDF o fragmentos está
prohibido por el contrato y además no reproduciría el SHA.

### 2 · C04–C10 no tienen unidad en producción

La edición publicada (revisión 11) contiene **tres** unidades: órdenes 1, 2 y 3.
La ingesta resuelve el `unitKey` en el entorno destino y falla cerrada si no
pertenece a la edición (`UNIT_KEY_NOT_IN_THIS_EDITION`), que es justo lo que
impide crear una unidad paralela por accidente.

Es decir: aunque mañana aparezcan los siete Markdown, C03 podría ingerirse de
inmediato —su unidad existe, orden 3, hoy servida desde el capítulo legado— pero
C04–C10 necesitan además que sus capítulos/unidades se creen en la edición. Eso
no lo hace `content:unit:ingest`; es una operación estructural aparte.

## Cómo se desbloquea

1. Dejar los siete Markdown canónicos donde este entorno pueda leerlos (por
   ejemplo en `~/Downloads`, como llegaron los de C01, C02 y C06). Se verifican
   por SHA contra la tabla de arriba antes de tocar nada.
2. Decidir cómo entran C04–C10 a la edición como unidades nuevas: es una
   decisión de estructura del libro, no un detalle de la ingesta.

Con eso, el lote sigue exactamente el plan previsto: preparar los ocho, validar
los ocho, ocho dry-runs, CI, y publicar en orden C03 → C10 verificando cada uno.
