# Paquete editorial — corte del 2026-11-07

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

| #   | Decisión                         | Propuesta                                           | Bloquea                     |
| --- | -------------------------------- | --------------------------------------------------- | --------------------------- |
| 1   | Sinopsis de _EEC_                | publicar el texto propuesto                         | la ficha pública de la obra |
| 2   | Nota interna de C01              | retirarla, **con** su encabezado                    | la lectura limpia de C01    |
| 3   | Publicar las cinco Experiences   | **decisión tuya** — la fuente la registra pendiente | el registro, no el producto |
| 4   | Abrir las cinco a alguien (flag) | mantener **HOLD** hasta 1 y 2                       | el piloto de lectura        |
| 5   | Sucesor del Dúo                  | `eec-c1-emocion-informa-no-manda@1`                 | la entrada del Dúo          |
| 6   | Las otras dos obras              | _Familias_ sigue sin publicar; _Parejas_ no existe  | el catálogo                 |
| 7   | Primer recurso de audio          | capítulo 1 de _EEC_                                 | la promesa de «Modo Guía»   |
| 8   | Precios y apertura de cobros     | no abrir; seis condiciones sin cerrar               | el cobro                    |

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

**Propuesta: retirarla, y retirar con ella el encabezado.** Son dos cosas y
conviene verlas juntas antes de decidir una:

- la **nota** es material interno en una página pública;
- el **encabezado** dice «Referencias _de trabajo_», y un capítulo publicado
  diría «Referencias» o «Bibliografía». Puede que lo que haya que corregir sea
  la sección entera, no sólo su primera línea.

**Y una distinción que importa:** esto **no es** validar la bibliografía. Lo que
se propone es retirar material interno y renombrar una sección. Comprobar que
cada entrada corresponde a la edición exacta —lo que la propia nota dice que
faltaba— es un trabajo editorial distinto, que puede hacerse después y con otra
cabeza.

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

**Propuesta: esta es una decisión tuya, no una deuda de ejecución.** Publicar
las cinco Experiences requiere tu aprobación explícita, que la fuente registra
como pendiente. Si la das, se ejecuta; si no, no hay nada que «ponerse al día».

**NO hace**: publicar las Experiences **no** las pone delante de nadie. Eso es el
flag, y el flag es la decisión 4 — que sigue en HOLD por separado.

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

| Obra                   | Estado real                                                   | Qué falta                                                |
| ---------------------- | ------------------------------------------------------------- | -------------------------------------------------------- |
| _Familias ensambladas_ | existe, **sin publicar**, 3 capítulos, ninguna parte asignada | decidir si se publica, y con qué autoría; asignar partes |
| _Parejas que perduran_ | **no tiene fila**                                             | decidir si entra al catálogo; si entra, su manuscrito    |

_Familias_ quedó sin publicar y sin autor a propósito, por la reparación del
24-10. **Que esté sin publicar no es un defecto pendiente: es el estado que esa
reparación decidió dejar**, y sacarla de ahí es un acto editorial, no una
corrección.

_Parejas_ se dejó **ausente** a propósito: no se inventó una fila para una obra
que no existe.

---

## 7 · El primer recurso de audio o video

**En juego.** La landing anuncia modos de lectura con audio. Hoy: **10 bloques de
video con 0 archivos** y **0 filas de audio**. Los reproductores están
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
disponible para compra», sin pasarela. Las seis condiciones que bloquean abrir
cobros siguen **«Por definir»**.

**Propuesta: no abrir.** El arreglo técnico de los webhooks de Stripe está hecho
—reclamación antes de aplicar el efecto y sellado después, con su migración
aplicada— pero eso no desbloquea nada de lo comercial: lo que falta es decidir
las seis condiciones, y ninguna se resuelve con código.

**Conviene no confundirlas**, porque se agrupaban bajo la misma etiqueta: el
arreglo de los webhooks es técnico y está cerrado; lo que sigue abierto bajo
D-ORD es operativo y comercial.

---

## Lo que este paquete NO decide

- **No ejecuta nada.** Es la propuesta; la ejecución de cada punto es un acto
  aparte con su propia ventana.
- **No toca producción**, que además no existe como recurso.
- **No reabre la autoría.** La reparación del 24-10 está aplicada y convergente;
  la autoría declarada el 2026-10-13 sigue entre lo que se revisa con aprobación
  explícita.
- **No valida bibliografía** (ver el punto 2).
