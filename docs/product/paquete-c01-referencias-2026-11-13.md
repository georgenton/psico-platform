# Las dos ediciones del capítulo 1 — ✅ EJECUTADAS el 2026-11-13, sin firmas nuevas

> **Estado: aplicado y verificado.** La decisión 2 del
> [paquete editorial](paquete-editorial-2026-11-07.md) se ejecutó el 2026-11-13:
> el capítulo 1 se reabrió como revisión **`EEC_C01_v1.1_TEXT_LOCKED_2026-11-13`**
> con el encabezado «Referencias», la nota interna retirada y las 21 entradas con
> su texto y su orden. Integrado en #853, desplegado a la API de staging y
> comprobado sobre lo servido: **187 bloques**, encabezado «Referencias», nota
> retirada, **cero asteriscos visibles**, 22 líneas bibliográficas y **49 bloques
> con énfasis**.
>
> **Y un aviso de este propio documento que resultó equivocado.** La versión
> anterior decía que ejecutar esto «pide una firma nueva» porque las cinco actas
> del 12-11 llevan el `canonicalSha256` dentro del payload firmado. La premisa es
> cierta y la **conclusión era falsa**: `checkApprovals` construye lo que espera
> **desde el manifiesto que firmó cada acta**, no desde el fichero más reciente
> del capítulo, así que las cinco actas de `v1.0` siguen válidas con el canónico
> en `v1.1`. **No se pidió ninguna firma nueva.** Lo que sí leía el fichero vivo
> era el código de producción, y ése era el defecto real; está corregido.
>
> Todo lo que sigue se midió el 2026-11-13 contra lo que sirve staging. Las
> secciones 1 a 3 se conservan como el expediente de la decisión; la 4 recoge lo
> que de verdad se hizo.

---

## 1 · Las dos ediciones, exactas

En `content/books/eec/C01/chapter.md`, líneas 296–298:

```diff
-## Referencias de trabajo para el capítulo 1
-
-> **Nota editorial:** las entradas de libros en español deberán ajustarse a la edición exacta utilizada en Zotero antes de `TEXT_LOCKED`.
+## Referencias

 Barrett, L. F. (2017). *How emotions are made: The secret life of the brain*. Houghton Mifflin Harcourt.
 … (las 21 entradas, sin tocar)
```

|                                      |                                                                    |
| ------------------------------------ | ------------------------------------------------------------------ |
| SHA-256 del canónico hoy             | `e10f42cedf881838578b7337355887c0e8cb2fe37b75dfa4204db509ac023018` |
| SHA-256 después de las dos ediciones | `6c3be6b390dfc15d9eaba76729de6bd4e2be7dfc1ed8db1934b4c8406f0f86f8` |

---

## 2 · El efecto, medido en un ensayo que se deshizo

Se aplicaron las dos ediciones, se re-selló el canónico **en local**, se
construyó, se normalizó y se contrastó bloque a bloque contra lo que sirve
staging. Después se revirtió todo. Esto es lo que salió:

|                                              | antes | después |
| -------------------------------------------- | ----- | ------- |
| bloques de la unidad                         | 188   | **187** |
| notas al pie                                 | 9     | 9       |
| entradas bibliográficas                      | 23    | 23      |
| bloques con `inlineMarks`                    | 49    | **49**  |
| bloques con un asterisco visible en el texto | 1     | **0**   |

**Diferencias contra lo publicado: exactamente dos**, y son las dos pedidas.

```
CAMBIADO  pub[164] HEADING: "Referencias de trabajo para el capítulo 1"
                 →  "Referencias"
ELIMINADO pub[165] QUOTE:   "**Nota editorial:** las entradas de libros…"
```

Las 21 entradas salen idénticas, en su orden. **Ninguno de los otros 186 bloques
cambia**, ni en texto ni en `meta`.

Y un efecto que conviene conocer porque es una mejora que nadie pidió: ese
`QUOTE` es **el único bloque de C01 con asteriscos todavía visibles** —la cita
que la reparación del 26-10 dejó fuera por llevar un acento invertido—. Retirarla
deja el capítulo limpio del todo.

### Las cinco microguías siguen abriendo

Sus cinco anclas apuntan a cinco secciones, y **ninguna es la que se toca**:

| microguía | sección anclada                                |
| --------- | ---------------------------------------------- |
| MG01      | «Distintas lentes para comprender una emoción» |
| MG02      | «Paul Ekman: el rostro como pista»             |
| MG03      | «Joseph LeDoux: la alarma antes del relato»    |
| MG04      | «Daniel Goleman…» + «Antonio Damasio…»         |
| MG05      | «Un vaso que cambia la experiencia»            |

Los dos bloques editados son los **dos últimos** del capítulo (órdenes 165 y
166), después de todas ellas. El ancla se resuelve por **texto** —encabezado más
última frase del pasaje—, así que mientras el texto de esas secciones no se mueva,
las cinco siguen resolviendo. El encabezado renombrado sigue siendo un encabezado,
así que tampoco se mueve ninguna frontera de sección.

### Marcas y posiciones, medidas

|                                                    |                                                  |
| -------------------------------------------------- | ------------------------------------------------ |
| subrayados sobre los dos bloques editados          | **0**                                            |
| subrayados en toda la base de staging              | **0**                                            |
| anotaciones en C01                                 | **1**, sobre un bloque que conserva su identidad |
| posiciones de lectura apuntando a un bloque de C01 | **7**                                            |

Content Core nunca borra un `ContentBlock`: un bloque retirado simplemente no
recibe `BlockVersion` en la revisión nueva. Así que la fila y su historia
sobreviven, y la anotación conserva su ancla.

---

## 3 · Dos requisitos que la aprobación no podía prever

### 3.1 · La tubería del manuscrito deshacía la reparación del 26-10 — **resuelto**

El build del capítulo entrega el énfasis **dentro** de `content`
(`**negrita**`, sin `inlineMarks`): la forma de antes de la reparación del
2026-10-26. De los 188 bloques, **49 difieren** de lo publicado por esto.
Reingerir un build del canónico habría devuelto los asteriscos a la pantalla sin
que nada se quejara — el build es verde, la ingesta escribe lo que le dan, y el
hueco estaba entre las dos.

Está arreglado en el PR de `unit-payload-normalize`: un paso que mueve el énfasis
a `inlineMarks` reusando el mismo analizador de la reparación, con su comando y
15 pruebas. Verificado: `normalize(build(canónico))` reproduce los 188 bloques
publicados, **content y meta idénticos**. Con él la tubería vuelve a ser
reproducible, que es la condición para ejecutar esto sin romper nada.

### 3.2 · El canónico está bloqueado — y la firma del 12-11 **no** lo bloquea

> ⚠️ **Esta sección contiene el error de análisis de este documento**, y se
> conserva porque la primera mitad es correcta y útil. Lo que sigue siendo cierto:
> `TEXT_LOCKED` es un SHA declarado 13 veces que el build comprueba, y la versión
> editorial está fijada en cinco sitios. Lo que era **falso** es el apartado final
> —que las actas quedarían atestiguando un texto inexistente y que haría falta
> volver a firmar—; la corrección, medida, está justo debajo en §3.3.

**`TEXT_LOCKED` no es una etiqueta: es un SHA-256 que el build comprueba.** Vive
declarado 13 veces —1 en `unit.json` (`canonical_sha256`) y 12 en `anchors.json`
(`source_sha256_expected`)— y el build se niega con
`CANONICAL_SHA_MISMATCH` ante cualquier texto que no case. Comprobado: con las dos
ediciones aplicadas, el build **falla**. El propio fichero lo dice: «estos tres
gates los evalúa el build y la ingesta; **no se editan a mano para
“desbloquear”**».

Y la versión editorial, `EEC_C01_v1.0_TEXT_LOCKED_2026-08-20`, está declarada en
tres ficheros de contenido (`unit.json`, `anchors.json`, `citations.json`), en
`scripts/eec/build-guide-manifests.mjs` y **fijada por dos trinquetes**
(`experience-editorial-seal.spec.ts` ×2 y `experience-editorial-approval.spec.ts`).

**Lo que convierte esto en una firma y no en un commit:** las cinco actas que
firmaste el 2026-11-12 llevan **dentro del payload firmado**

```
canonicalVersion: "EEC_C01_v1.0_TEXT_LOCKED_2026-08-20"
canonicalSha256:  "e10f42cedf881838578b7337355887c0e8cb2fe37b75dfa4204db509ac023018"
```

es decir, **el manuscrito tal como está hoy**. `checkApprovals` compara los dos
campos y responde `APPROVAL_REVISION_MISMATCH` cuando difieren
(`experience-editorial-approval.ts:230`).

Qué significa eso, con precisión:

- **Las cinco publicadas no se rompen.** Su acta ya se consumió al publicar y
  nada vuelve a validar el SHA en lectura. Las cinco seguirían abriendo y
  saltando a su pasaje. ✅ **Cierto, y comprobado.**
- ~~**Pero las cinco actas dejarían de corresponder al manuscrito.** Quedarían
  atestiguando un SHA que ya no es el del capítulo. Cualquier acto futuro sobre
  ellas —re-sellar, republicar, una `@2`— sería rechazado hasta volver a
  firmar.~~ ❌ **Falso.** Ver §3.3.

### 3.3 · Por qué no hacía falta ninguna firma nueva

`checkApprovals` **no compara el acta con el fichero del capítulo**. Construye lo
que espera a partir del **manifiesto que el acta firmó**:

```ts
const expect = {
  canonicalVersion: m.canonicalVersion,
  canonicalSha256: m.canonicalSha256,
  manifestSha256: m.manifestSha256,
};
```

Los cinco manifiestos de `v1.0` viven congelados en `artifacts/eec/C01/v1.0/`, con
sus cinco actas al lado. Reabrir el canónico como `v1.1` escribe en
`artifacts/eec/C01/v1.1/` y **no toca** ni un byte de `v1.0/`, así que las cinco
actas siguen validando contra la revisión que firmaron. Comprobado con las actas
reales: **5 válidas** después de la reapertura, y los dos controles negativos del
12-11 siguen fallando como deben.

**Donde sí había un defecto real era en el código de producción**, y conviene no
confundirlos: `eec-c01-guides-main.ts` resolvía el canónico leyendo **el fichero
vivo** del capítulo, de modo que una reapertura sí habría movido lo que el
validador espera. Corregido con `sealedCanonicalSha256`: el canónico se resuelve en
tres niveles —**sellado** para el capítulo publicado, fichero vivo, declarado— y el
resolutor reporta cuál usó. Cinco especificaciones dejaron de estar clavadas a
`v1.0` y ahora lo derivan del sello, con 9 pruebas de coexistencia que fijan el
invariante: **una revisión nueva no invalida un acta vieja**.

---

## 4 · Lo que se hizo, en orden

Las tres preguntas del paquete se resolvieron así:

1. **¿Qué versión editorial queda?** `EEC_C01_v1.1_TEXT_LOCKED_2026-11-13`, como
   apuntaba el paquete aprobado. `v1.0` **no se re-fechó**: nombra un solo texto y
   sigue nombrándolo. El build escribe en `artifacts/.../v1.1` y el trinquete
   `eec-chapter-build.spec.ts` ya **deriva** la versión del sello en vez de fijar
   `v1.0` a mano.
2. **¿Se vuelven a firmar las cinco actas?** **No, y no por una concesión:** por
   la razón estructural del §3.3. Las cinco siguen válidas y `v1.0/` queda
   congelado con sus cinco manifiestos y sus cinco actas.
3. **¿Se acepta que C01 pase del espejo legado a Content Core?** Sí, y ocurrió: el
   encabezado renombrado no puede emparejarse, así que acuña un bloque sin origen
   legado y la regla del espejo se rompe. El lector sirve C01 desde Content Core —
   comprobado por HTTP: los `id` de los bloques ya son `blockKey`, no identificadores
   legados. La exposición medida fue la del §2: 0 subrayados, 1 anotación que
   conserva su ancla, 7 posiciones de lectura.

### Los pasos, tal como se ejecutaron

1. Las dos ediciones en `content/books/eec/C01/chapter.md`.
2. Re-sellado: `canonical_sha256` (1) y `source_sha256_expected` (12) al nuevo SHA
   `6c3be6b390dfc15d…`; `canonical_version` en los tres ficheros de contenido y en
   `build-guide-manifests.mjs`; los trinquetes del sello, derivando.
3. `node scripts/eec/build-chapter.mjs --chapter=C01 --out=artifacts` → **187
   bloques** y el nuevo SHA.
4. `node dist/content-core/unit-payload-normalize-cli.js …` → **49 normalizados, 0
   negativas**. El `unitKey` de staging es `453be5af-9c77-5957-bc83-f5da67c4b5ba`;
   el del build es otro, y eso es normal: vale `uuidv5(Chapter.id)` sobre un cuid
   aleatorio (#639).
5. **La API se desplegó antes de ingerir**, porque sirve el texto y porque el
   normalizador del artefacto servido tenía que reproducir el payload byte a byte
   — se comprobó que lo hacía.
6. `node dist/content-core/unit-ingest-cli.js --payload=…` en seco y, con
   `ALLOW_CONTENT_CORE_UNIT_INGEST=on`, `--apply`. Minó la revisión 2 y la publicó
   en la misma transacción; **no borró ningún `ContentBlock`**.
7. **Ni `reseal` ni `publish-guides`.** La versión anterior de este documento
   proponía `reseal` sobre las cinco, y eso **no podía funcionar**: `resealApproved`
   rechaza por diseño toda fila que no esté en `DRAFT`, y las cinco están
   `PUBLISHED`. Esa condición es la que impide re-sellar a espaldas de una
   publicación, así que no se debilitó — simplemente el paso no hacía falta.

**El avance del lector era el riesgo de verdad, y se cubrió.** El camino nativo
abría la sesión poniendo el progreso a cero, y C01 tenía **9 sesiones vivas**, 2 de
ellas completadas. `openNativeSession` ahora **siembra en vez de mover**: sólo
escribe sobre una fila en blanco (0 %, 0 s, sin completar, sin último bloque). Esa
es también la precondición del orden de despliegue, y queda **efectiva en el
código**, no sólo escrita. Comprobado tras aplicar: las nueve conservadas, las dos
completadas intactas, y la sesión propia leída por HTTP con su `pct=0.1383`.

**Reversible**: Content Core es por revisiones, así que volver atrás es volver a
apuntar `Edition.publishedRevisionId` a la revisión 1, que se conserva. Y porque la
siembra no mueve nada, una reversión encuentra las filas legadas como estaban.

---

## 5 · Qué costaba no hacerlo, y qué sigue costando

Costaba que la obra publicada siguiera mostrando, en el capítulo gratuito al que
llega cualquiera, un encabezado que dice «de trabajo» y una nota interna que habla
de Zotero y de `TEXT_LOCKED`. Era el último resto de vocabulario interno en una
superficie pública, y los cuatro asteriscos visibles del capítulo eran los suyos.
**Hoy ya no está**: cero asteriscos visibles, encabezado «Referencias».

Y una cosa que **no** costaba: aprobar esto nunca acreditó la bibliografía. El
gate de citas sigue en `PARTIAL_9_RESOLVED_19_UNRESOLVED` — 19 entradas sin
resolver contra Zotero — y eso es exactamente lo que la nota decía que faltaba.
Retirarla quita el recordatorio, no la deuda. El paquete aprobado ya lo dice; se
repite aquí porque la nota es el único sitio donde esa deuda se ve.
