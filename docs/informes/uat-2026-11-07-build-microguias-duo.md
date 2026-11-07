# La construcción recuperada, las cinco microguías recorridas y el Dúo con dos partes — 2026-11-07

Continúa el cierre del 06-11. Todo lo de abajo está medido contra el entorno que
sirve.

|                        |                                                   |
| ---------------------- | ------------------------------------------------- |
| Repositorio al empezar | `main = ca4e07c4` · cero PR abiertos              |
| Integrado hoy          | #826 arreglo de construcción                      |
| Abierto hoy            | #827 tarjeta generada + instrumentos de recorrido |
| Desplegado             | API tres veces, por tres razones distintas        |
| Producción             | **sigue sin existir como recurso**                |

---

## 1 · La construcción de la API, arreglada (#826)

### 1.1 La causa, demostrada — y no es la que di ayer

Ayer dije que era la caché de **capas de Docker** y que una capa envenenada
perpetuaba el fallo. Era la caché de **Turbo**, y el mecanismo es otro.

El script de `apps/api` es `prisma generate && nest build`, y la tarea `build`
declara sus salidas como `dist/**`. Pero `prisma generate` escribe en
`node_modules/.pnpm/@prisma+client@…/node_modules/.prisma` — **fuera del
paquete**, así que Turbo no puede declararlo como salida y no lo rastrea. Ante
un acierto de caché restaura `dist` y no vuelve a ejecutar el script.

**Reproducido en 64 ms**, en local, sin desplegar nada: calentar la caché,
borrar el directorio generado, volver a construir.

```
 Tasks:    3 successful, 3 total
Cached:    3 cached, 3 total
  Time:    64ms >>> FULL TURBO
```

…y el directorio sigue sin estar. Eso es exactamente el fallo de producción.

### 1.2 La trampa de diagnóstico que me engañó ayer

**Turbo reproduce el registro de la tarea cacheada.** Un registro con
`✔ Generated Prisma Client` **no demuestra nada**: en un acierto de caché esas
mismas líneas se vuelven a imprimir. Lo que las distingue es el tiempo —una
generación real reporta segundos, una reproducción ninguno— y, en BuildKit, el
paso diciendo `CACHED`.

Ayer leí «Generated Prisma Client» en un registro y concluí que se había
generado. La conclusión era correcta por casualidad —ese registro sí traía el
tiempo— pero el razonamiento no distinguía ambas cosas.

### 1.3 El arreglo, y por qué es el menor suficiente

`prisma:generate` pasa a ser tarea propia con `cache: false`, y `build` depende
de ella. Coste medido: una construcción caliente pasa de `FULL TURBO` en 64 ms
a **3-de-4 en caché en 1,8 s**.

**No** se tocó `generator client` para darle un `output` dentro del árbol de
fuentes. Probablemente ahí debería acabar esto, pero reescribe cada importación
de Prisma del proyecto y **la reproducción no lo exige**: basta con que la tarea
no sea salteable. El trinquete deja escrito dónde volver a decidirlo.

El script conserva su propio `prisma generate`: la tarea lo garantiza bajo
turbo, el script lo garantiza para quien corra `pnpm build` dentro de `apps/api`
y no pase por turbo. Dos garantías para algo cuya ausencia produce una imagen
que no arranca, y que cuesta menos de dos segundos.

Trinquete de 6 mitades por mutación: quitar `cache: false` mata 1, quitar la
dependencia mata 1, borrar la tarea entera mata 3.

### 1.4 Verificado sobre la imagen terminada, no sobre el fichero

| Despliegue          | Qué era                                                                               | Resultado                                     |
| ------------------- | ------------------------------------------------------------------------------------- | --------------------------------------------- |
| 1 · fuente cambiada | construcción real: `Generated Prisma Client` ×3, `turbo run build` ×2                 | **arranca** · `.prisma` presente · gate 71/71 |
| 2 · mismo commit    | **no construyó**: «No build configuration changed & image found … Build step skipped» | arranca (misma imagen)                        |
| 3 · `force=true`    | construcción forzada con la caché caliente                                            | ver §1.5                                      |

**El despliegue 2 enseñó algo que conviene no volver a aprender:** un redespliegue
del mismo commit **se salta la construcción entera**. No sirve para probar una
construcción. Lo que fuerza el paso es `force=true` — que, como ya se vio ayer,
**no desactiva la caché**: la fuerza a construir, con la caché tal como esté.
Las dos cosas son distintas y las dos frases se parecen demasiado.

La imagen sana quedó además con **identidad estable**,
`feelverse-api-known-good:<fecha>-<sha corto>`, porque la etiqueta por commit ya
demostró que otra construcción la sobrescribe.

---

## 2 · Las cinco microguías de C01, recorridas

**31/31 comprobaciones.** No «el catálogo devuelve cinco títulos»: las cinco se
descubren, empiezan, admiten sus tres pasos, terminan `COMPLETED` y siguen
consultables después.

> **De dónde salía el 28/28 que esta bitácora traía escrito.** La primera
> versión de este parte decía 28/28, y no era un desliz de transcripción: era
> el número que imprimía el instrumento cuando **el control negativo no podía
> ejecutarse**. El cupo de accesos es de cinco por cuarto de hora y por IP, la
> cuenta de fuera necesitaba el sexto, el guion lo declaraba con un
> `· omitido:` en mitad del registro… y la última línea seguía diciendo ✔ con
> las 28 que sí había corrido. Es decir, **la comprobación más importante del
> recorrido era la que más fácil se aprobaba sin medirse**: que la lista cierra
> el paso a quien no está en ella.
>
> Reproducido a propósito antes de arreglarlo: con el archivo de token de esa
> cuenta vacío, el instrumento de hoy imprime `⊘ INCOMPLETO — 28/28` y sale
> con código 1. Veintiocho. El mismo número, ahora con su etiqueta correcta.
> Las tres que faltaban son el control negativo entero, y están en §2.4.

| Microguía                                | Pasos | Resultado |
| ---------------------------------------- | ----- | --------- |
| `eec-c1-teorias-como-lentes@1`           | 3/3   | recorrida |
| `eec-c1-rostro-como-pista@1`             | 3/3   | recorrida |
| `eec-c1-alarma-antes-del-relato@1`       | 3/3   | recorrida |
| `eec-c1-emocion-informa-no-manda@1`      | 3/3   | recorrida |
| `eec-c1-construida-no-significa-falsa@1` | 3/3   | recorrida |

**El control negativo**, que es la mitad del valor: una cuenta que NO está en la
lista de piloto no ve ninguna (`items=0`, `available=false`) y no puede empezar
ninguna (`503 GUIDE_UNAVAILABLE`). Sin eso, el recorrido no distinguiría «la
lista funciona» de «está abierto para todos».

Tres cosas que costó aprender y quedan en el guion:

1. **El campo es `guides`, no `items`.** Mi primera versión contó cero con la
   ruta respondiendo 200 y cinco guías dentro.
2. **La clave de idempotencia va en el CUERPO**, y el cuerpo es cerrado: una
   cabecera no la ve nadie.
3. **El paso de recuerdo no admite `complete`.** Responde
   `422 GUIDE_STEP_COMMAND_MISMATCH` —paso correcto, mandato equivocado— porque
   es objetivo y **lo califica el servidor**: acepta exactamente
   `{idempotencyKey, selectedOptionKey}`, sin `itemKey`, sin `result` y sin la
   fuente de evaluación, para que un cliente no se pueda aprobar solo.

### 2.1 La contradicción documental, resuelta

Tres fuentes parecían decir cosas distintas. No se contradicen; contestan
preguntas distintas, y conviene escribir cuál contesta cuál:

| Fuente                                                       | Qué contesta de verdad                                  |
| ------------------------------------------------------------ | ------------------------------------------------------- |
| `*.manifest.json` (`status: DRAFT`, `publishAllowed: false`) | el estado del **artefacto de entrada**, no del producto |
| El catálogo en código                                        | qué **ofrece** la ruta                                  |
| `AUTHOR_REVIEW_PACKAGE.md`                                   | qué está **aprobado**                                   |

La prueba de que el manifiesto no es un estado vivo: **los manifiestos de C02
dicen exactamente lo mismo** —`DRAFT`, `publishAllowed: false`— y C02 está
servido y ofrecido (su capítulo devuelve su guía con el mismo rollout y el mismo
usuario).

Y la aprobación **existe**, fechada y referenciada desde cada manifiesto:

> `approvalReferences`: «Decisión autoral 2026-09-03: implementar las cinco
> microguías de EEC-C01.»

Más dos decisiones **ya registradas** en el paquete de revisión autoral:

- **DECISIÓN A — publicar las cinco Experiences: APPROVE.**
- **DECISIÓN B — encender `EEC_C01_GUIDED_SUITE_V1`: HOLD**, con su razón
  escrita: «encender el flag es lo que pone las cinco tarjetas delante de una
  persona real… B no debe seguir a A automáticamente.»

### 2.2 La tensión, dicha sin adornos

**Ayer encendí ese interruptor sin haber encontrado este documento.** El
despliegue que lo traía falló, así que durante todo el 06-11 lo que corría no lo
tenía — pero la intención era encenderlo y no había leído el HOLD.

Hoy está encendido, y la audiencia es **una cuenta sintética**: el rollout del
guía sigue en `pilot` con un único id, y el control negativo demuestra que una
cuenta ordinaria no ve nada. La sustancia del HOLD —que nadie real las vea—
se sostiene; el interruptor que nombra, no.

Se conserva encendido porque este bloque pide expresamente recorrerlas con
identidades QA y conservar el modo piloto. **DECISIÓN B sigue pendiente para
cualquier audiencia que no sea QA**, y es una de las decisiones de la lista
final.

### 2.3 La descripción única, que es lo que faltaba

Comprobado en OVH, en sólo lectura y por clave y versión:

|                                    | Las cinco de C01                                                                                                                        |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| **Definición Guide registrada**    | ✅ en el catálogo **de código**, con título, descripción y duración                                                                     |
| **Experience en OVH**              | ❌ **AUSENTE** — `ChapterExperienceVersion` tiene **0 filas** en total, no «cinco en DRAFT»                                             |
| **Disponible para QA**             | ✅ `pilot` + un único id sintético                                                                                                      |
| **Recorrido comprobado**           | ✅ **31/31 por HTTP**; pantalla pendiente                                                                                               |
| **Aprobación editorial aplicable** | ⚠️ **no acreditada**: recomendación de publicar + «no se autoriza todavía», con tres condiciones nombradas. Implementar sí (2026-09-03) |
| **Abierta a personas reales**      | ❌ no, y `publishAllowed: false` lo respalda con un 409                                                                                 |

**El dato que más aclara el resto:** el recorrido funciona **sin que exista
ninguna Experience**, porque el modo guiado resuelve del catálogo en código. Las
dos cosas viven en sitios distintos, y eso explica que las cinco se puedan
recorrer mientras su publicación sigue sin aprobarse.

---

### 2.4 El control negativo, y el instrumento que lo aprobaba solo

Que las cinco se recorran dice que el camino funciona. Lo que acredita el
**HOLD** es la otra mitad: que una cuenta ordinaria no llega a ellas. Con el
rollout en `pilot` y un solo id sintético en la lista:

| Comprobación                                 | Resultado                          |
| -------------------------------------------- | ---------------------------------- |
| La cuenta de fuera **existe y entra**        | sesión válida                      |
| Pide la ruta guiada del mismo capítulo       | `guides=0` **y** `available=false` |
| Intenta empezar una de las cinco, por su pin | **503 `GUIDE_UNAVAILABLE`**        |

Las tres importan juntas. La primera descarta que el «no ve nada» sea una
credencial mala. La segunda, que el catálogo esté vacío para todos. La tercera,
que el rechazo sea el previsto y no un 500 con suerte.

**Y aquí estaba el defecto del instrumento**, que es peor que cualquiera de los
que buscaba. Tres cosas a la vez:

1. Si la cuenta de fuera no podía entrar —cupo de accesos—, el guion imprimía
   `· omitido:` y **la última línea seguía diciendo ✔**. Una ejecución sin su
   control negativo se leía igual que una con él.
2. La segunda comprobación aceptaba `guides === 0` **o** `available === false`.
   Un sobre de error trae cero guías, así que la mitad barata la aprobaba.
3. La tercera aceptaba 503 **o** 403 **o** 404 sin mirar el código. Tres causas
   distintas contadas como la misma.

Las tres corregidas, y las tres con su mutación ejecutada:

| Mutación                                         | Antes                | Ahora                                |
| ------------------------------------------------ | -------------------- | ------------------------------------ |
| Archivo de token de la cuenta de fuera vacío     | ✔ 28/28              | **⊘ INCOMPLETO 28/28**, código 1     |
| Cupo de órdenes agotado a mitad de una microguía | ✗ contra el producto | **⊘ impedida**, declarada como arnés |

La segunda merece su frase. Tres pasadas seguidas agotan el cupo de órdenes del
guía, y la versión anterior lo contaba como `✗ se interactúa con todos sus
pasos` — es decir, **atribuía al producto un límite del arnés**, que es
exactamente el error que yo estaba corrigiendo en el control negativo, cometido
dos columnas más allá. Ahora hay tres desenlaces por microguía, no dos:
recorrida, **impedida** (el arnés) e incompleta (el producto).

El instrumento también acepta `--token-fuera-archivo`, para que el cupo deje de
intervenir en la comprobación que más depende de él.

---

## 3 · El Dúo, con dos partes

**33/33 en la pasada completa**, y la segunda mitad del seguimiento aparte.
(Eran 27/27 cuando se escribió este parte; la ventana intermedia pasó a medirse
en serio y eso añadió comprobaciones — ver §3.4.)

| Paso                                      | Resultado                                                                |
| ----------------------------------------- | ------------------------------------------------------------------------ |
| El organizador crea                       | 201 · `INVITING` · contraparte `INVITED`                                 |
| La contraparte **inspecciona** por la Web | 200 · ve el título aprobado                                              |
| **Acepta ella misma**                     | 201 · su propia cookie, distinta de la credencial del organizador        |
| El organizador lo ve                      | contraparte `ACCEPTED`                                                   |
| **La ventana intermedia**                 | ninguno ve lo del otro · `revealed` nulo                                 |
| Los dos confirman                         | `readyCount = 2` · cada uno ve lo del otro                               |
| El acuerdo                                | propuesto, visible para ella, **confirmado por los dos**                 |
| El seguimiento                            | abierto por el barrido → decidido por los dos → **cierra**               |
| La retirada                               | `CLOSED`/`CANCELLED` según dónde estuviera, con el desenlace que anunció |

**Lo que de verdad mide este recorrido** está en la ventana intermedia: con uno
confirmado y el otro no, se lee por los dos lados y se exige que el contenido
ajeno no esté. Un recorrido que sólo mirara el final no distinguiría «se revela
al confirmar los dos» de «se revela siempre».

**Cada parte entra por su propia puerta.** El organizador por la API con su
credencial; la contraparte por las rutas de la Web, que son las que firman la
atestación. No se reimplementa esa firma ni se lee su secreto: si los dos
secretos discreparan, el recorrido fallaría en la inspección.

### 3.1 El seguimiento se abre por reloj, y eso se respetó

`recordFollowUp` exige `status === "FOLLOW_UP"`, y a ese estado se llega cuando
el barrido del worker alcanza la fecha programada. Pedir la decisión antes
responde `404` — y hace bien.

Se ejerció **sin tocar ningún reloj**, con la válvula que el propio payload del
barrido declara (`nowIso`). Primero en seco: `followUpOpened=1`,
`invitingCancelled=0`, y la actividad **sin cambiar**. Después de verdad: a
`FOLLOW_UP`. Las dos partes decidieron, y **la segunda decisión cerró la
actividad** — el servicio lo hace explícito: cuando todos han decidido, cierra y
añade un evento `ACTIVITY_CLOSED`.

Un seguimiento **programado** no es un seguimiento **ejecutado**, y aquí se
ejecutó uno a propósito para poder decirlo.

### 3.2 Tres afirmaciones mías que el producto corrigió

Las tres eran expectativas equivocadas, no defectos:

1. «La retirada deja `CANCELLED`» — el tipo de retorno dice
   `"CANCELLED" | "CLOSED"`: retirarse de un intercambio que ya ocurrió lo
   **cierra**; de uno que nadie abrió lo **cancela**.
2. «Tras la retirada la invitada pierde el acceso» — lo conserva, y es lo
   correcto: el contenido ya le había sido revelado con su propia confirmación.
3. «Se puede retirar de una actividad cerrada» — responde 404, porque no queda
   nada de lo que salir.

### 3.3 Datos de prueba

Cinco actividades sintéticas, todas de la cuenta QA, todas terminadas en
`CLOSED` o `CANCELLED` por el propio producto. **No se borró ninguna fila a
mano**: terminar una actividad por su propio camino es la limpieza, y un
`DELETE` manual perdería los eventos que la cuentan.

---

### 3.4 La ventana de privacidad, medida de verdad

El invariante de esta pantalla es uno: **con uno confirmado y el otro no,
ninguno ve lo del otro**. Es lo que más cuesta de un Dúo y lo único que no se
puede comprobar mirando.

Y era, de lejos, la comprobación peor hecha del recorrido. Decía
`!contiene(respuesta_de_ella, lo_del_organizador)` — una **ausencia**. Un 401
por cookie caducada, un 404 por id mal armado y un 500 traen cuerpos que
tampoco contienen lo del organizador. Es decir: la afirmación más fuerte de
todo el parte se aprobaba sola en los tres casos en que no se había medido
nada.

Ahora una ausencia sólo se afirma cuando se cumplen tres cosas:

1. **Hubo lectura**: la respuesta fue 200, no un error.
2. **El estado es el de esta etapa**: `you.status = ACCEPTED` (ella no ha
   confirmado), `revealed = null`, y `readyCount = 1`.
3. **Lo del otro ya existe** en ese instante: el organizador se lee a sí mismo
   confirmado, con su propio texto de vuelta.

La tercera es la que convierte la prueba en prueba. Sin ella, «no lo veo»
podría ser «todavía nadie lo había escrito» — una carrera, no una barrera.

Las tres, con su mutación:

| Mutación inyectada                                     | Resultado                                  |
| ------------------------------------------------------ | ------------------------------------------ |
| La lectura de ella devuelve **401** vacío              | ✗ la lectura · **⊘** la privacidad         |
| Lectura **200** y estado correcto, pero `readyCount=0` | ✗ `readyCount es 0, se esperaba 1` · **⊘** |
| Sin mutación, contra staging                           | ✓ las cuatro · **33/33**, código 0         |

En las dos primeras, la versión anterior habría impreso ✓ en la privacidad.

**Y una simétrica que NO se puede medir, dicha en vez de contada.** «El
organizador tampoco ve lo de ella» era un ✓ en el parte anterior, y no vale:
en un Dúo la segunda confirmación revela en el mismo acto, así que **no existe
ninguna ventana** en la que ella haya confirmado y él no. Lo de ella todavía no
se ha escrito, y no ver lo que no existe no es privacidad. El instrumento lo
afirma ahora como lo que es —`you.confirmed` nulo— y dice en su propio texto
que la simétrica no es medible aquí.

---

## 4 · El vínculo sucesor del Dúo — propuesta

**El problema:** la única entrada productiva del Dúo mapea
`eec-c1-cuerpo-antes-que-mente@1` → `duo-lo-que-me-ayuda@2`, y ese pin está
retirado para inicios nuevos. El CTA aparece sobre una página cuya acción
principal no está disponible.

**La microguía que se propone: `eec-c1-emocion-informa-no-manda@1`.**

Su propia descripción es «Sentir, interpretar, querer hacer y elegir son cosas
distintas. Sepáralas en una situación cotidiana y leve». Los campos del Dúo
piden exactamente eso, y de a dos: «¿En qué momento estás pensando?» (la
situación cotidiana), «Cuando estoy así, me ayuda que…» y «Y no me ayuda que…»
(la elección, separada del impulso). La alternativa razonable es
`eec-c1-construida-no-significa-falsa@1` —las mismas señales significan cosas
distintas según el contexto, que es la razón por la que a cada uno le ayuda algo
distinto—; se prefiere la primera porque el Dúo pide nombrar una elección, no
explicar una diferencia.

**La sucesión, que no es editar el mapping.** Una plantilla publicada no se
reescribe: su origen es parte de lo publicado. Hacen falta tres actos, en orden:

1. **Publicar `duo-lo-que-me-ayuda@3`** con el mismo copy, los mismos campos y
   las mismas condiciones, y `source.experiencePin` apuntando a la microguía
   nueva.
2. **Archivar `@2`.** `ARCHIVED` la retira de todo lo que **ofrece**, mientras
   `getExact` la sigue resolviendo por pin para las actividades ya en marcha.

   > **Corrección (misma sesión).** Esta línea decía que con dos versiones
   > publicadas «la ruta del organizador responde 404». Leído `resolveDuoTemplate`,
   > es **falso**, y la verdad es mejor: devuelve `null` —**silencio, no error**—
   > ante un pin desconocido, una versión que no es la mapeada, un `DRAFT`, un
   > `ARCHIVED`, dos entradas de elegibilidad para la misma superficie, o una
   > plantilla cuya `source.experiencePin` no nombre de vuelta a esa experiencia.
   > El acuerdo es **bidireccional**, y todos los modos de fallo caen hacia el
   > mismo lado: la oferta desaparece. Detalle en
   > [el paquete editorial §5](../product/paquete-editorial-2026-11-07.md).

3. **Mover** —no añadir— la entrada de `PRODUCTION_DUO_ELIGIBILITY`. Dos
   entradas para una superficie no desempatan: deshabilitan la oferta.

**Qué se conserva:** `@1` sigue `ARCHIVED` y `@2` pasa a estarlo; las
actividades históricas fijadas a cualquiera de las dos siguen resolviendo por
`getExact`, con sus eventos y sus artefactos intactos. Nada se borra.

**Qué falta:** la decisión editorial de cuál microguía. Es la única pieza que no
puedo poner yo.

---

## 5 · Contenido

### 5.1 La tarjeta de C05 — corregida y comprobada

**La causa no era la que di ayer.** Dije «un borde de formato del bloque». Es el
guion de ingesta: dos de sus plantillas interpolan un encabezado del manuscrito
dentro de una frase que **lee una persona**, y un encabezado es Markdown de
origen. Afecta a **las dos** plantillas, no sólo a la del ejercicio.

Arreglado en el origen (`plainHeading`, en su propio módulo porque el guion
ejecuta su CLI al importarse) y en la fila ya servida:

|                                   |                                                                       |
| --------------------------------- | --------------------------------------------------------------------- |
| Representaciones                  | `ChapterBlock` **y** `BlockVersion`, con su `contentHash` recalculado |
| Escrituras                        | comparar-y-fijar · las dos dijeron **exactamente una fila**           |
| Referencias antes                 | 0 subrayados · 0 anotaciones · 0 posiciones de lectura                |
| En el lector, después             | «El ejercicio no se aprueba sintiéndote mejor.» sin asteriscos        |
| Bloques con `**` en el capítulo 5 | **0**                                                                 |

Preimagen fuera del repositorio, con el motivo y el antes/después.

### 5.2 La nota interna de C01 — contrastada, no corregida

**Está en el canónico**, no es un accidente de ingesta:
`content/books/eec/C01/chapter.md:298`, bajo el encabezado «## Referencias **de
trabajo** para el capítulo 1». Su SHA-256 sigue siendo el declarado
(`e10f42ce…`), así que el fichero está intacto y bloqueado.

Y la nota dice de sí misma lo que hace falta saber: las entradas «deberán
ajustarse a la edición exacta utilizada en Zotero **antes de `TEXT_LOCKED`**».
Es decir: material interno, y su presencia en un texto bloqueado significa que
ese paso se saltó.

**Referencias hoy, medidas y no heredadas de octubre:** 0 subrayados, 0
anotaciones, 0 posiciones de lectura y 0 vínculos de concepto, por **las dos**
anclas (la legada `cmuxk5idl004lfglewttpsj6d` y su gemela nativa
`cmuxk8wij009aq5le97o4koa0`). Es además el **único** bloque con vocabulario
interno de toda la plataforma: un escape aislado, no sistémico.

**Por qué no la toqué.** Retirarla es un acto editorial sobre un canónico
`TEXT_LOCKED`, y la regla de cierre reserva eso para una reapertura con su
propia versión. El mecanismo correcto existe y es reversible —Content Core es
por revisiones: «retirado» significa que una clave de bloque no está en la
revisión nueva, mientras la fila `ContentBlock` y sus versiones anteriores
sobreviven, así que no se pierde identidad, marca, posición ni historia—. Pero
su entrada es un canónico corregido, y eso lo decides tú.

**Hay una segunda pregunta en la misma línea**, y conviene verla antes de
decidir: el encabezado dice «Referencias **de trabajo**». Un capítulo publicado
diría «Referencias» o «Bibliografía». Puede que lo que haya que corregir sea la
sección, no sólo su primera línea.

---

## 6 · Límites

Producción **no se tocó** y sigue sin existir como recurso. Cero cobros, cero
publicaciones editoriales.

La cuenta usada es sintética `@psico.test`; su contraseña se leyó por entorno,
sin imprimirla. La cookie de la invitada se guardó en un fichero con permisos
600 **y no se imprimió**: es un token de sesión.

El control negativo de las microguías se midió en la **primera** pasada del
recorrido; la pasada final lo omitió porque `/api/auth/login` admite cinco
intentos por cuarto de hora y un recorrido de dos cuentas los agota. Es una
limitación del arnés, no un resultado distinto — y por eso los tres guiones
admiten ya `--token-archivo`.

**Esto no es una aceptación estética.** Lo de hoy es construcción, recorridos
funcionales y contenido.
