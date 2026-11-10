# Paquete editorial — corte del 2026-11-07, corregido el 2026-11-09

> **Qué es esto.** Las decisiones editoriales y comerciales abiertas, juntas y
> con su propuesta, para que se puedan resolver de una sentada en vez de una por
> una según aparecen. Cada una trae: qué está en juego, qué se propone, qué
> implica ejecutarla y **qué NO hace**.
>
> Nada de aquí está ejecutado. El inventario de lo que existe hoy vive en
> [inventario-editorial.md](inventario-editorial.md); esto es lo que hay que
> decidir sobre él.

---

## Resumen

| #   | Decisión                         | Propuesta                                                                                                                          | Bloquea                                   |
| --- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| 1   | Sinopsis de _EEC_                | publicar el texto propuesto                                                                                                        | la ficha pública de la obra               |
| 2   | Nota interna de C01              | retirar **sólo la nota** y renombrar el encabezado a «Referencias»; las 21 entradas se conservan                                   | la lectura limpia de C01                  |
| 3   | Publicar las cinco Experiences   | **decisión tuya** — la fuente la registra pendiente                                                                                | **que se puedan reproducir en el lector** |
| 4   | Abrir las cinco a alguien (flag) | mantener **HOLD** hasta 1 y 2                                                                                                      | el piloto de lectura                      |
| 5   | Sucesor del Dúo                  | `eec-c1-emocion-informa-no-manda@1`                                                                                                | la entrada del Dúo                        |
| 6   | Las otras dos obras              | autoría y pertenencia **ya resueltas**; falta material: partes y manuscrito de _Familias_, manuscrito de _Parejas_                 | el catálogo                               |
| 7   | Primer recurso de audio          | capítulo 1 de _EEC_                                                                                                                | la promesa de «Modo Guía»                 |
| 8   | Precios y apertura de cobros     | **propuesta concreta de las 7 filas** + 6 condiciones de lanzamiento; no abrir todavía, resolver ya las 2 que no dependen de nadie | el cobro                                  |

---

## 1 · La sinopsis de _Emociones en Construcción_

**En juego.** La única obra publicada se presenta, en público y sin sesión, con
un marcador: «Sinopsis en revisión editorial.» No es un defecto — es lo que la
reparación de autoría del 24-10 dejó a propósito, porque la anterior nombraba a
una identidad de fixture y reescribirla con una expresión regular habría
producido o español agramatical o una afirmación editorial que nadie revisó.

**Propuesta.** Publicar el texto que propone
[el inventario](inventario-editorial.md), derivado de los títulos de las propias
partes y capítulos de la obra, sin añadir ninguna afirmación que el libro no
haga.

**Ejecutarla es** editar un campo (`Book.summary`). No toca el manuscrito, no
toca capítulos, no reabre ningún canónico.

**NO hace**: no cambia la autoría —ya está corregida—, no publica nada más, y no
toca la descripción corta, que sí es real y se sigue mostrando debajo.

---

## 2 · La nota interna del capítulo 1

**En juego.** `content/books/eec/C01/chapter.md:298` lleva una nota de trabajo
bajo el encabezado «## Referencias **de trabajo** para el capítulo 1». No es un
accidente de ingesta: está en el canónico, cuyo SHA-256 sigue siendo el
declarado (`e10f42ce…`), así que el fichero está intacto y **bloqueado**.

Y la nota dice de sí misma lo que hace falta saber: las entradas «deberán
ajustarse a la edición exacta utilizada en Zotero **antes de `TEXT_LOCKED`**».
Es decir, material interno cuya presencia en un texto bloqueado significa que
ese paso se saltó.

**Lo que se midió, hoy y no heredado de octubre:** la nota tiene **0**
subrayados, **0** anotaciones, **0** posiciones de lectura y **0** vínculos de
concepto, por **las dos** anclas. Y es el **único** bloque con vocabulario
interno de toda la plataforma: un escape aislado, no sistémico.

**Propuesta, dicha con precisión** — son dos cambios, y **sólo** dos:

1. **Retirar la nota interna**, y nada más que la nota: el bloque de cita que
   empieza por «**Nota editorial:** las entradas de libros en español deberán
   ajustarse…». Es material interno en una página pública.
2. **Renombrar el encabezado** de «## Referencias de trabajo para el capítulo 1»
   a «## Referencias». Un capítulo publicado no dice «de trabajo», y el sufijo
   «para el capítulo 1» es redundante dentro del propio capítulo.

**Las 21 entradas bibliográficas se conservan íntegras**, en su orden y con su
formato APA. No se retira la sección: se le quita la nota y se le corrige el
título.

El antes y el después, exactos:

```diff
-## Referencias de trabajo para el capítulo 1
-
-> **Nota editorial:** las entradas de libros en español deberán ajustarse a la edición exacta utilizada en Zotero antes de `TEXT_LOCKED`.
+## Referencias

 Barrett, L. F. (2017). *How emotions are made: The secret life of the brain*. Houghton Mifflin Harcourt.
 … (las 21 entradas, sin tocar)
```

**Y una distinción que importa, porque es fácil darla por hecha:** aprobar esto
**no acredita** la revisión de las ediciones. Lo que se propone es retirar
material interno y corregir un título — dos operaciones de superficie.
Comprobar que cada entrada corresponde a la edición exacta utilizada, que es
justamente lo que la nota dice que faltaba, es un **trabajo editorial distinto**,
que sigue pendiente después de ejecutar esto y que necesita el Zotero delante.
Quien apruebe la retirada no está declarando la bibliografía verificada.

**Ejecutarla es** una reapertura del canónico con su propia versión. El mecanismo
existe y **es reversible**: Content Core es por revisiones, así que «retirado»
significa que una clave de bloque no aparece en la revisión nueva, mientras la
fila `ContentBlock` y sus versiones anteriores sobreviven. **No se pierde
identidad, ni marca, ni posición, ni historia.**

**NO hace**: no toca ningún otro bloque, no reingesta nada —una reingesta
destructiva mataría los `blockId` de los que cuelgan las marcas— y no corrige la
bibliografía.

---

## 3 · Publicar las cinco Experiences de C01

> **Corrección.** Una versión anterior de esta sección decía que «la decisión A
> está APROBADA». **Es falso**, y lo es contra la fuente primaria, que fui a
> leer precisamente porque el roadmap y la revisión decían lo contrario que yo.
> Lo dejo escrito porque el error es el que importa evitar: **atribuir al
> propietario una aprobación que no dio.**

**Lo que la fuente dice, citado.** El inventario de experiencias de EEC-C01
cierra así:

> **Recomendación:** publicar `APPROVE`, encender el flag `HOLD` hasta después
> del smoke posterior a publicar. **Ninguna de las dos ejecutada.**

Y su tabla de gates es explícita:

| Gate                       | Estado      | Observación                       |
| -------------------------- | ----------- | --------------------------------- |
| Aprobación autoral         | **BLOCKED** | Pendiente de decisión de Jorge    |
| Readiness para `PUBLISHED` | **BLOCKED** | No publicar desde este inventario |
| Microguías **aprobadas**   | **0**       | —                                 |

**Qué sí está aprobado**, para no barrerlo con lo anterior: la **arquitectura**
de cinco microguías («APROBADA POR EL AUTOR»), el diseño `v0.1` de MG03
(2026-09-02), y la **implementación** (referencia del 2026-09-03). Implementar
no es publicar, y la propia página lo remata: «La publicación sigue bloqueada».

**Dónde están hoy.** En OVH, `ChapterExperienceVersion` tiene **cero filas**: no
están en `DRAFT`, están **ausentes**. Y aun así las cinco se recorren, porque el
modo guiado resuelve del catálogo **en código**, no de una fila de Experience.
Por eso 31/31 por HTTP convive con una tabla vacía: son dos registros distintos,
y contar uno no dice nada del otro.

**Qué bloquea A, dicho con precisión — corregido el 2026-11-09.** Esta sección
decía que A afectaba «al registro, no al producto». **Es falso**, y lo destapó
mirar la pantalla: las cinco muestran su tarjeta con «Completada» y al pulsar
«Revisar» el panel responde «No pudimos preparar el recorrido de este capítulo».
El panel necesita una **definición de Experience** para pintar el recorrido, y no
existe ninguna. Así que A no es papeleo: **A es lo que hace que una persona pueda
ver y hacer las cinco en el lector.** Hoy se recorren por HTTP y no se pueden
abrir.

**Propuesta: esta es una decisión tuya, no una deuda de ejecución.** Publicar
las cinco Experiences requiere tu aprobación explícita, que la fuente registra
como pendiente. Si la das, se ejecuta; si no, no hay nada que «ponerse al día».

**NO hace**: publicar las Experiences **no** las pone delante de nadie. Eso es el
flag, y el flag es la decisión 4 — que sigue en HOLD por separado. Con A ejecutada
y B en HOLD, las cinco existen, son reproducibles y las ve **sólo QA**.

**Y hay un bloqueo técnico previo, que no es tuyo y no es sobre las cinco.** Al
preparar los borradores con las herramientas del repositorio, `create-drafts`
rechaza en bloque con `EXPERIENCE_CODE_OWNED_UNRESOLVED`: dos definiciones
**embarcadas** —el piloto legado y una de _Parejas_— nombran cuatro filas de
objetivos que nunca se ingirieron en esta base, y por diseño una sola definición
embarcada que no ubica capítulo rechaza las escrituras de **todos** los capítulos.
El detalle medido, las cinco una por una y las dos salidas posibles están en
[microguias-c01-candidato.md](microguias-c01-candidato.md).

---

## 4 · Abrir las cinco a alguien que no sea QA

**En juego.** `EEC_C01_GUIDED_SUITE_V1` es el interruptor que pone las cinco
tarjetas delante de una persona real. Hoy está **encendido en staging con la
audiencia reducida a una cuenta sintética**, y una cuenta ordinaria recibe
**503 `GUIDE_UNAVAILABLE`** — comprobado con control negativo.

**La decisión B está en HOLD, declarado**, con su razón escrita: «encenderlo es
lo que pone las cinco tarjetas delante de una persona real… B no debe seguir a A
automáticamente».

**Propuesta: mantener el HOLD** hasta que 1 y 2 estén resueltas. El argumento no
es técnico —el recorrido funciona, 31/31 con control negativo— sino editorial:
las cinco microguías viven **dentro** del capítulo 1, y ese capítulo todavía
enseña una nota de trabajo y la obra que lo contiene se presenta con un marcador
por sinopsis. Abrir la puerta antes de arreglar la habitación es el orden
equivocado.

**Cuando se abra**, la audiencia propuesta es la del
[piloto mínimo](piloto-minimo.md): una persona a la vez, por invitación, con sus
criterios de entrada, salida y suspensión ya escritos.

---

## 5 · El vínculo sucesor del Dúo

**En juego.** La única entrada productiva del Dúo empareja
`eec-c1-cuerpo-antes-que-mente@1` → `duo-lo-que-me-ayuda@2`, y ese pin está
**retirado para inicios nuevos**. El CTA «Ir a la experiencia» lleva a una página
cuya acción principal está deshabilitada — comprobado en pantalla.

**Propuesta: `eec-c1-emocion-informa-no-manda@1`.** Su descripción es «Sentir,
interpretar, querer hacer y elegir son cosas distintas. Sepáralas en una
situación cotidiana y leve», y los campos del Dúo piden exactamente eso, de a
dos: «¿En qué momento estás pensando?» (la situación), «Cuando estoy así, me
ayuda que…» y «Preferiría que evitáramos…» (la elección, separada del impulso).

La alternativa razonable es `eec-c1-construida-no-significa-falsa@1` —las mismas
señales significan cosas distintas según el contexto, que es justamente por qué a
cada uno le ayuda algo distinto—. Se prefiere la primera porque el Dúo pide
**nombrar una elección**, no explicar una diferencia.

### Cómo se ejecuta, leído en el código

El catálogo del Dúo vive **en código** (`packages/types/src/circles-catalog.ts` y
`apps/web/src/lib/circulos/eligibility.ts`), no en un CMS: la sucesión es un
cambio de código y un despliegue, no una operación de edición.

Tres actos, y **los tres van en el mismo commit**:

1. **Publicar `duo-lo-que-me-ayuda@3`** con el mismo copy, los mismos campos y
   las mismas condiciones, y `source.experiencePin` apuntando a la microguía
   nueva.
2. **Archivar `@2`.** `ARCHIVED` la retira de todo lo que **ofrece**, mientras
   `getExact` la sigue resolviendo por pin para las actividades ya en marcha.
3. **Mover** —no añadir— la entrada de `PRODUCTION_DUO_ELIGIBILITY`.

> **La corrección que hace falta sobre mi propio parte anterior.** Escribí que
> con dos versiones publicadas «la ruta del organizador responde 404». Leído el
> resolutor, es **falso**, y la verdad es mejor: `resolveDuoTemplate` devuelve
> `null` —**silencio, no error**— ante un pin desconocido, una versión que no es
> la mapeada, un `DRAFT`, un `ARCHIVED`, **dos entradas de elegibilidad** para la
> misma superficie, o una plantilla cuya `source.experiencePin` no nombre de
> vuelta a esa experiencia.
>
> Es decir, el acuerdo es **bidireccional** —la entrada y la plantilla tienen que
> nombrarse mutuamente— y **todos** los modos de fallo caen hacia el mismo lado:
> la oferta desaparece. Como dice el propio código, «la dirección segura hacia la
> que caiga un error». Por eso los tres actos van juntos: no porque un orden
> rompa algo, sino porque cualquier estado intermedio **silencia la oferta**, y
> un commit que silencia una superficie es más fácil de detectar y revertir que
> tres despliegues que la dejan a medias.

**Qué se conserva:** `@1` sigue `ARCHIVED` y `@2` pasa a estarlo; las actividades
históricas fijadas a cualquiera de las dos siguen resolviendo por `getExact`, con
sus eventos y sus artefactos intactos. **Nada se borra.**

**Lo que falta es sólo la elección de microguía.** Es la única pieza que no puedo
poner yo.

---

## 6 · Las otras dos obras

> **Corrección del 2026-11-09.** Esta sección decía que a _Familias_ le faltaba
> «decidir con qué autoría» y a _Parejas_ «decidir si entra al catálogo». Las
> dos cosas **ya están decididas** y no se vuelven a preguntar: el alcance
> editorial final incluye **las tres obras**, _EEC_ y _Familias ensambladas_ son
> de **Jorge Quizamanchuro** y _Parejas que perduran_ de **David Jaramillo**. Lo
> que falta es **material y preparación editorial**.

**Estado real, leído en OVH en sólo lectura el 2026-11-09:**

| Obra                        | Fila   | Publicada | Autoría en la fila         | Capítulos | Partes      |
| --------------------------- | ------ | --------- | -------------------------- | --------- | ----------- |
| _Emociones en construcción_ | sí     | **sí**    | Jorge Quizamanchuro        | 10        | 3 asignadas |
| _Familias ensambladas_      | sí     | no        | **Jorge Quizamanchuro** ✅ | 3         | **ninguna** |
| _Parejas que perduran_      | **no** | —         | —                          | —         | —           |

La autoría de _Familias_ **ya está escrita en la fila**: la reparación del 24-10
la dejó atribuida a Jorge Quizamanchuro. Lo que esa reparación dejó pendiente es
**la publicación**, que es otra cosa.

**Lo que falta de cada una, en concreto:**

_Familias ensambladas_ — tres trabajos, en este orden:

1. **Asignar partes a sus tres capítulos.** Hoy los tres tienen `partNumber` y
   `partTitle` en `null`, así que la ficha los lista en plano. _EEC_ sí las
   tiene, y por eso se lee agrupada. Es el único de los tres que puedo ejecutar
   yo en cuanto haya una estructura de partes decidida.
2. **El resto del manuscrito**, si lo hay: tres capítulos ingeridos frente a los
   diez de _EEC_. Hace falta saber cuántos son en total y cuáles están escritos.
3. **Publicarla**, que es el acto editorial — y conviene no confundirlo con la
   autoría, que ya está puesta.

_Parejas que perduran_ — no tiene fila, y **no se inventó una**: crear una obra
sin manuscrito produciría una ficha que no se puede abrir. El siguiente trabajo
editorial es el **manuscrito** (o su primer capítulo), más el registro de la
identidad de **David Jaramillo** como `BookAuthor`, que hoy no existe en la tabla
—sólo están `jorge-quizamanchuro` y la identidad de fixture `marina-quintana`,
ya sin afirmaciones sin fuente—. Con un capítulo en Markdown y el nombre
declarado, la fila, la autoría y la ingesta son ejecutables en una sesión.

---

## 7 · El primer recurso de audio o video

**En juego.** La landing anuncia modos de lectura con audio. Hoy, **medido en OVH
en sólo lectura el 08-11** y no heredado de un inventario anterior: **10 bloques
`VIDEO`, de los que 0 tienen archivo** (`meta.videoUrl` vacío en los diez), **0
filas en `Audio`**, y 0 bloques legados con el marcador `🎬`. Los reproductores están
construidos y muestran un marcador honesto («Audio en producción», «En
producción»), así que no se promete nada falso **dentro** del producto — pero la
promesa pública no tiene todavía con qué cumplirse.

**Propuesta: audio del capítulo 1 de _EEC_.** Es el capítulo gratuito al que
llega cualquiera, y el camino del audio es el que más maquinaria valida de una
vez: subida a R2, fila `Audio`, URL firmada con su vencimiento, barra del lector
y metadatos de pantalla bloqueada.

**Hace falta** un fichero y tres datos: título, duración en segundos y, si
existe, transcripción. La receta de incrustado (`ffmpeg`, tags ID3v2/m4a) ya está
escrita en el README del lector.

---

## 8 · Precios y apertura de cobros

**En juego.** La landing muestra importes con su aviso «Propuesta de precios · No
disponible para compra», sin pasarela y sin pedir ningún dato. Los importes son
los de la maqueta: **USD 14,99** pago único por título, **USD 6,99/mes** o
**USD 59/año** de membresía. Siete filas de la tabla comparativa dicen todavía
«Por definir», y mientras lo digan no hay oferta que se pueda vender.

**Conviene separar dos cosas que se agrupaban bajo la misma etiqueta:** el
arreglo técnico de los webhooks de Stripe **está cerrado** —reclamación antes de
aplicar el efecto y sellado después, con su migración aplicada y reproducida
contra PostgreSQL real—. Eso no desbloquea nada de lo comercial. Lo que sigue
abierto es **operativo y comercial**, y ninguna pieza se resuelve con código.

### La propuesta, fila por fila

Esto es **una propuesta revisable**, no una decisión tomada. Cada valor lleva su
razón, para que discutir el número sea discutir el motivo:

| Fila que hoy dice «Por definir»            | Valor propuesto                                                                                                                 | Por qué ése                                                                                                                                                                     |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Duración del acceso** (pase de un libro) | **Permanente** mientras exista la cuenta                                                                                        | Un pago único con acceso que caduca se lee como alquiler y genera reembolsos. Y el coste marginal de servir un libro ya comprado es el disco.                                   |
| **Cuota de Eco** (pase)                    | **100 mensajes**, sin renovación                                                                                                | El pase es de una obra: 100 mensajes cubren leerla entera conversando y acotan el gasto del modelo a ~USD 0,45 por pase sobre los 14,99.                                        |
| **Cuota de Eco** (membresía)               | **300 mensajes al mes**, no acumulables                                                                                         | Medido: una llamada real costó USD 0,0043, así que 300 son ~USD 1,30 al mes sobre 6,99. No acumulables para que el techo sea el techo.                                          |
| **Dúo y Círculos** (membresía)             | **Dúo incluido; Círculos de hasta 6, incluidos**                                                                                | Las dos superficies ya existen y están probadas con dos partes. Cobrarlas aparte partiría el producto que la landing describe como uno.                                         |
| **Renovación** (membresía)                 | **Automática**, aviso por correo 7 días antes de cada cobro anual                                                               | El aviso previo es lo que convierte una renovación automática en algo defendible; en mensual el importe es pequeño y el aviso sobra.                                            |
| **Cancelación y cambios**                  | Cancelable **en cualquier momento**, efecto al final del período pagado, sin reembolso parcial; cambio mensual↔anual al renovar | Es lo que el código ya hace (`cancel_at_period_end`), así que no hay que construir nada. Un reembolso prorrateado sí habría que construirlo.                                    |
| **Impuestos y otros cargos**               | **Importes con IVA incluido** para Ecuador; sin cargos adicionales                                                              | Un precio que crece en la pasarela es la primera causa de abandono en el carrito. Si se factura desde Ecuador, el IVA aplica y conviene absorberlo en el número que se muestra. |

### Condiciones de lanzamiento — qué tiene que ser verdad antes del primer cobro

En orden, y las cinco primeras son requisitos, no preferencias:

1. **Las siete filas de arriba, decididas** y escritas en `datos.ts` y
   `SeccionPlanes.tsx`. Mientras una diga «Por definir», la página no puede
   dejar de decirlo.
2. **Identificadores de precio reales en Stripe** para los tres importes, y en
   el entorno de la caja. Hoy `STRIPE_*_PRICE_ID` son valores de prueba.
3. **Términos, Privacidad, Contacto, Sobre FeelVerse y Autoría**, publicados —
   el gate de `landing-apertura-publica.md`, que sigue abierto por sí mismo.
4. **Algo que comprar.** Hoy una sola obra es legible; el pase de «un libro»
   sólo tiene un libro que vender y las otras dos dicen «Aún no disponible».
5. **El recorrido de correo**, porque un cobro genera un recibo y una
   recuperación de contraseña. Sin `RESEND_API_KEY` no hay ninguno de los dos.
6. Y recomendable, no requisito: **un piloto con lectura acompañada cerrado**
   antes de pedir dinero por ella.

**Propuesta global: no abrir todavía**, y resolver 1 y 2 ya —son las dos que no
dependen de nadie más— para que cuando 3, 4 y 5 cierren no quede trabajo
comercial pendiente.

---

## Lo que este paquete NO decide

- **No ejecuta nada.** Es la propuesta; la ejecución de cada punto es un acto
  aparte con su propia ventana.
- **No toca producción**, que además no existe como recurso.
- **No reabre la autoría.** La reparación del 24-10 está aplicada y convergente;
  la autoría declarada el 2026-10-13 sigue entre lo que se revisa con aprobación
  explícita.
- **No valida bibliografía** (ver el punto 2).
