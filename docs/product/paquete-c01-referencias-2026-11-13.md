# Las dos ediciones del capítulo 1 — paquete exacto, efecto medido y firma mínima

> **Qué es esto.** La decisión 2 del
> [paquete editorial](paquete-editorial-2026-11-07.md) está **aprobada**: retirar
> la nota interna del capítulo 1 y renombrar su encabezado a «Referencias»,
> conservando las 21 entradas. Al ir a ejecutarla aparecieron **dos requisitos
> que la aprobación no podía prever**, porque ninguno se ve desde el texto: la
> tubería del manuscrito y la **firma del 12-11**.
>
> Este documento es el paquete listo. Todo lo de abajo está **medido el
> 2026-11-13** contra lo que sirve staging, no deducido — incluido un ensayo
> completo que se hizo y se deshizo.
>
> **Nada se aplicó.** El canónico está intacto: su SHA-256 sigue siendo
> `e10f42cedf881838…`, el build lo comprueba y pasa.

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

### 3.2 · El canónico está bloqueado, y la firma del 12-11 lo bloquea dos veces

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
  saltando a su pasaje.
- **Pero las cinco actas dejarían de corresponder al manuscrito.** Quedarían
  atestiguando un SHA que ya no es el del capítulo. Cualquier acto futuro sobre
  ellas —re-sellar, republicar, una `@2`— sería rechazado hasta volver a firmar.

---

## 4 · El procedimiento mínimo

Tres decisiones tuyas y seis pasos. Los pasos son mecánicos y están
verificados; las decisiones no son mías.

### Lo que hay que decidir

1. **¿Qué versión editorial queda?** El paquete aprobado dice «una reapertura
   del canónico **con su propia versión**», lo que apunta a
   `EEC_C01_v1.1_TEXT_LOCKED_2026-11-13`. La alternativa —re-fechar v1.0— diría
   que v1.0 nombra dos textos distintos, y conviene no hacerlo.
   Consecuencia de v1.1: el build escribe en `artifacts/.../v1.1`, y el
   trinquete `eec-chapter-build.spec.ts` fija hoy `v1.0` a mano, así que hay que
   enseñarle a derivarla.
2. **¿Se vuelven a firmar las cinco actas?** Con v1.1 los cinco manifiestos
   declaran otra `canonicalVersion` y otro `canonicalSha256` → otro
   `manifestSha256` → **cinco actas nuevas**. El procedimiento es el del 12-11 y
   ya está escrito: `firmar-aprobacion-editorial.mjs` comprueba las cinco antes
   de escribir ninguna, y el `reseal` no aprueba ni publica nada.
   La alternativa es dejarlas como están y aceptar, por escrito, que atestiguan
   un manuscrito anterior.
3. **¿Se acepta que C01 pase del espejo legado a Content Core?** Hoy los 188
   bloques publicados conservan `legacyBlockId`, y por eso el lector sirve el
   capítulo desde las filas legadas. El encabezado renombrado no puede
   emparejarse (la identidad se lleva por clave o por hash, y «Referencias» no
   se parece a «Referencias de trabajo para el capítulo 1» ni al 95 %), así que
   acuña un bloque sin origen legado y **la regla del espejo se rompe**: el
   lector pasa a Content Core para C01. El propio CLI lo anuncia como resultado
   esperado, y la exposición medida es la del §2: 0 subrayados, 1 anotación que
   conserva su ancla, 7 posiciones de lectura.

### Los pasos, una vez decidido

1. Las dos ediciones en `content/books/eec/C01/chapter.md`.
2. Re-sellar: `canonical_sha256` (1) y `source_sha256_expected` (12) al nuevo
   SHA; `canonical_version` en los tres ficheros de contenido y en
   `build-guide-manifests.mjs`; los dos trinquetes del sello.
3. `node scripts/eec/build-chapter.mjs --chapter=C01 --out=artifacts` → debe dar
   **187 bloques** y el nuevo SHA.
4. `node dist/content-core/unit-payload-normalize-cli.js --in=… --out=… --unit-key=<el de la edición destino>`
   → debe dar **49 normalizados, 0 negativas**. En staging el `unitKey` es
   `453be5af-9c77-5957-bc83-f5da67c4b5ba`; el del build es otro, y eso es
   normal: vale `uuidv5(Chapter.id)` sobre un cuid aleatorio (#639).
5. `node dist/content-core/unit-ingest-cli.js --payload=…` (dry-run) y, con
   `ALLOW_CONTENT_CORE_UNIT_INGEST=on`, `--apply`. Mina la revisión 2 y la
   publica en la misma transacción; no borra ningún `ContentBlock`.
6. Si se vuelven a firmar: `reseal` y, sólo si hiciera falta, `publish-guides`.
   Las cinco ya están `PUBLISHED`, así que normalmente basta el primero.

**Reversible**: Content Core es por revisiones, así que volver atrás es volver a
apuntar `Edition.publishedRevisionId` a la revisión 1. Nada se pierde.

---

## 5 · Qué cuesta no hacerlo

Que la obra publicada siga mostrando, en el capítulo gratuito al que llega
cualquiera, un encabezado que dice «de trabajo» y una nota interna que habla de
Zotero y de `TEXT_LOCKED`. Es el último resto de vocabulario interno en una
superficie pública, y los cuatro asteriscos visibles del capítulo son los suyos.

Y una cosa que **no** cuesta: aprobar esto nunca acreditó la bibliografía. El
gate de citas sigue en `PARTIAL_9_RESOLVED_19_UNRESOLVED` — 19 entradas sin
resolver contra Zotero — y eso es exactamente lo que la nota decía que faltaba.
Retirarla quita el recordatorio, no la deuda. El paquete aprobado ya lo dice; se
repite aquí porque la nota es el único sitio donde esa deuda se ve.
