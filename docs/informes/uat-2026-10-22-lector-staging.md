# UAT del lector en staging — 2026-10-22

Validación de la **biblioteca autenticada y el lector** contra las promesas de la
landing aprobada. No es un sprint: no se cambió código de producto, no se desplegó
nada y no se escribió ni una fila. Lo que sigue es lo que se midió y lo que se
concluye de ello.

> ## ⚠ Corrección fechada — 2026-10-24
>
> **El diagnóstico del modo guiado de esta UAT es incorrecto, y lo es por lo que
> midió, no por cómo lo midió.** Se conserva el texto original tal cual; esta nota
> dice qué sustituye.
>
> Lo que se contó aquí fue `ChapterExperienceVersion`, y esa tabla es **una sola
> de las dos fuentes**. El repositorio de experiencias es **híbrido**: resuelve
> primero en base y, si no hay fila, **en código**
> (`productionExperienceRepository`). Por eso la tabla está vacía y
> `GET /api/experiences/discovery/emociones-en-construccion/1` devuelve **un**
> recorrido, medido el 2026-10-24: `eec-c1-cuerpo-antes-que-mente@1`, 8 escenas.
>
> Y hay un segundo error, más consecuente: **el recuento de Experience no dice
> nada sobre las cinco microguías de la landing.** Son superficies distintas. El
> catálogo de **Guide** (`guide-discovery-catalog.ts`) declara cinco entradas
> vigentes para C01, que son exactamente las cinco que la página nombra:
>
> `eec-c1-teorias-como-lentes@1` · `eec-c1-rostro-como-pista@1` ·
> `eec-c1-alarma-antes-del-relato@1` · `eec-c1-emocion-informa-no-manda@1` ·
> `eec-c1-construida-no-significa-falsa@1`
>
> **Existen.** La fila 48 de la tabla de abajo —«cinco en la landing, cero en la
> app»— es falsa: concluye desde la tabla equivocada.
>
> La experiencia legado `eec-c1-cuerpo-antes-que-mente@1` **sí** existe y **no**
> es una de esas cinco. Está en `RETIRED_FOR_NEW_STARTS`: su paso
> `CATALOG_PRACTICE` ancla a un encabezado que el manuscrito canónico de EEC C01
> v1.0 ya no contiene. Sigue resolviendo para una sesión ya fijada —el historial
> no caduca— y **no puede iniciar una nueva**. De aquí se sigue algo que conviene
> no deducir al revés: **abrir el rollout no la haría ejecutable**; recuperarla
> exigiría una versión nueva con sus propios objetivos y su propia aprobación
> editorial, que es otro frente de trabajo.
>
> **Por qué el modo guiado no está disponible hoy**, medido el 2026-10-24 en el
> contenedor: `GUIDE_ROLLOUT_MODE = off`, sin allowlist de piloto. `available`
> describe la situación del actor que pregunta, así que el `{"available":false}`
> que devuelven `/api/guide/availability`, `/guide/discovery/...` y
> `/guide/route/...` vale para la cuenta consultada; el modo efectivo, además,
> es `off` para todo el entorno. No es falta de contenido: es una puerta.
>
> **Estado que queda:** la ejecución guiada permanece `NOT_AVAILABLE` para la
> cuenta comprobada, y su UAT completa **no está verificada**. El rollout no se
> abrió y MG03 no se publicó para conseguir un PASS.

- **Sujeto:** `staging.feelverse.app` (Web) y `api-staging.feelverse.app` (API).
- **Contrato:** `apps/web/src/components/landing/datos.ts`, la landing F2.1
  aprobada, fusionada en `fe1fa866` el 2026-10-17 y servida por este mismo
  despliegue.
- **Código vivo durante la UAT:** API y Web en `6cb272812ffb` (el `main` anterior
  a la corrección de catálogo `f22aa84c`, que **no** estaba desplegada). El worker
  iba en `c0234ba5`, de dos semanas antes.

## 1 · Cómo se midió, y por qué importa

La sesión de Chrome resultó ser la **cuenta personal del propietario**
(`georgenton@msn.com`), no la cuenta QA sintética que el encargo nombra. El encargo
prohíbe escribir progreso, notas o conversaciones sin un procedimiento sintético
autorizado, así que la UAT se hizo entera en lectura:

- Las **44 peticiones** del recorrido autenticado se revisaron una por una: todas
  `GET`. Ninguna escritura.
- Lo que no se podía resolver leyendo la interfaz se consultó con una transacción
  `BEGIN READ ONLY` **dentro del contenedor de la API**, que ya tiene
  `DATABASE_URL` en su entorno: la credencial nunca salió de ahí (la vía de
  `docs/` para SQL de sólo lectura sobre una caja desplegada).
- `useHeartbeat` no dispara al montar —el primer latido espera un tick de 5 s— y
  se pausa dentro del panel guiado. Aun así, montar el lector podía escribir
  progreso pasados esos 5 s, así que **no se montó**.

El contenido del capítulo se leyó del _payload_ de servidor de la ruta del lector
(`RSC`, un `GET`) en lugar de montando la página, que es lo que permitió verificar
la Lectura sin que el latido existiera.

## 2 · Veredicto por promesa

| Promesa de la landing                                          | Veredicto                                  | Evidencia                                                                                                                                        |
| -------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| _Familias_ es de Jorge Quizamanchuro                           | ❌ **no se cumple**                        | `authorName: "Marina Quintana"` en `/api/books`; «MQ · Marina Quintana» en la biblioteca y en la ficha                                           |
| _Familias_ «Aún no disponible»                                 | ❌ **no se cumple**                        | servida en el catálogo, `tierRequired: pro`, 3 capítulos, `publishedOn: 2026-02-01`                                                              |
| _Familias_ sin vía de entrada                                  | ❌ **no se cumple**                        | «🔒 Hazte Pro para leer» + «Hazte Pro → $7/mes» a `/dashboard/plan`; capítulo 1 con enlace que resuelve, por estar marcado `isFreePreview`       |
| _Parejas_ «Aún no disponible»                                  | ✅                                         | ausente del catálogo                                                                                                                             |
| _EEC_ es de Jorge Quizamanchuro                                | ⚠️ **a medias**                            | cabecera y `authorName` correctos; `Book.summary` abre con «Marina Quintana acompaña al lector…»                                                 |
| _EEC_ tiene Lectura                                            | ✅ **de sobra**                            | capítulo 1 con 376 bloques (302 párrafos, 48 encabezados, 20 citas, 2 ejercicios, 2 pausas, 2 videos); 10 capítulos agrupados en sus tres partes |
| _EEC_ tiene Modo guiado                                        | ❌ **no se cumple**                        | `ChapterExperienceVersion`: **cero filas**; la ficha del libro no menciona el modo                                                               |
| «El capítulo 1 tiene cinco microguías»                         | ❌ **cinco en la landing, cero en la app** | misma tabla vacía; `GuideSession`: cero, nadie ha corrido una                                                                                    |
| «Cada libro indica los modos y recursos que tiene disponibles» | ❌ **no se cumple**                        | la tira de datos de _EEC_ dice «LECTURA» y «EJERCICIOS», nunca el modo guiado                                                                    |
| Los precios son propuesta y no venden                          | ⚠️ **sólo en la landing**                  | la landing marca «· propuesta»; la biblioteca ofrece Pro a $7/mes por _Familias_                                                                 |
| La muestra guiada corre en la página                           | ✅                                         | 5 pasos con contenido real: Contexto, Pasaje, La idea, Práctica, Lo que te llevas                                                                |
| Eco en la muestra no es Eco                                    | ✅                                         | «Respuestas de ejemplo: aquí no se consulta a Eco. Eco puede equivocarse y no diagnostica»                                                       |

**La landing, por su parte, es impecable.** La ficha de _Familias_ declara «Aún no
disponible» tanto en Leer como en Modo guiado, acredita a Jorge Quizamanchuro y no
ofrece ninguna puerta. Todas las divergencias de autoría y disponibilidad están del
lado del catálogo.

## 3 · Los dos hallazgos que no se esperaban

### 3.1 · La landing anuncia un modo que el despliegue no puede dar

`ChapterExperienceVersion` —la tabla que guarda las experiencias de capítulo— tiene
**cero filas**, ni publicadas ni en borrador, para ningún libro.
`ExperienceGuideReservation`, `GuideSession`, `GuideSessionStep` y
`GuideCommandReceipt`: cero también.

El código del lector guiado **sí** está: es lo que integró el PR #794, que es
exactamente el commit que staging sirve. Lo que no hay es contenido publicado
dentro de él, y los [ADR 0027](../adr/0027-control-de-publicacion-de-una-experiencia.md)
y [ADR 0028](../adr/0028-transicion-de-aprobacion-editorial.md) describen la puerta
de aprobación editorial que lo retiene. Así que esto **no es un defecto de código**:
es una promesa escrita en presente —«Hoy sólo hay lectura y modo guiado publicados»—
que este despliegue todavía no puede sostener en su mitad guiada.

Lo que sí existe y funciona: las dos Exploraciones (`Journey`), ambas publicadas, y
las 13 unidades de contenido de lectura.

### 3.2 · El nombre de fixture sobrevive en la sinopsis del libro ancla

`Book.summary` de `emociones-en-construccion` empieza con «Marina Quintana acompaña
al lector…», y se sirve en público. El repositorio **ya lo prohíbe**:
`apps/api/src/catalog/seed-authorship.spec.ts:144` afirma que la sinopsis del libro
ancla no arrastra ese nombre.

Es la misma forma que el defecto de publicación que corrigió el PR #797: el arreglo
vive en el seed y la fila alojada conserva el texto viejo, porque el `update` del
upsert no reescribe `summary`. De ahí la conclusión operativa: **la reparación de
autoría tiene que alcanzar los campos de copy, no sólo la clave ajena.**

Media buena noticia en el mismo sitio: las credenciales profesionales **sí** están
retiradas (`title` y `licenseNumber` nulos, `isVerified: false`), así que la
reparación anterior hizo su trabajo. Lo que sobrevive es la bio «Especialista en
psicoeducación y familias ensambladas», todavía adherida a una identidad de fixture
a la que el catálogo acredita una obra real.

## 4 · Dos cosas que parecían defectos y no lo son

Se dejan escritas porque volverán a aparecer y conviene no volver a investigarlas.

- **Dos capítulos devolvieron 503** en el primer _prefetch_ de Next al abrir la
  biblioteca. Un barrido secuencial de los diez dio 200, y dos rondas de diez
  peticiones **en paralelo** dieron 200 las veinte. Fue arranque en frío del
  contenedor, no un defecto por capítulo.
- **«Siguiente» parecía habilitado en el paso 5/5** de la muestra guiada. El botón
  está **oculto** (`[hidden]`); la medición leía `disabled` de un botón que la
  página ya había retirado. El cierre («Terminaste una microguía») vive en otra
  sección de la landing y no es un estado que la muestra deba alcanzar.

## 5 · Lo que queda sin verificar, y por qué

**Si las cinco microguías se ejecutan de verdad en el lector.** No hay nada que
ejecutar —cero filas—, pero confirmar la superficie exigiría montar el lector, y
pasados 5 s el latido escribiría progreso en una cuenta personal. Necesita permiso
explícito o la cuenta sintética que el encargo nombra. El encargo también advierte
que no se declare MG03 publicada ni ejecutable por existir su borrador o su
previsualización ADMIN, así que esa vía tampoco sustituye a la comprobación.

## 6 · Observaciones menores

- El capítulo 1 de _EEC_ y el de _Familias_ muestran **ambos «50 % leído»**. Dos
  libros distintos con el mismo valor exacto invita a confirmar si es progreso real
  o un valor derivado.
- La ficha de _Familias_ ofrece «✎ Escribir reseña» de una obra que declara no
  disponible.
- El perfil público de la autora de fixture dice `bookCount: 0` mientras la ficha
  del libro la acredita. No se persiguió: esa página no debería acreditarla.
- El **worker** de staging corre un commit distinto (`c0234ba5`) del de API y Web
  (`6cb272812ffb`), así que los crons y las notificaciones de staging no son el
  mismo código que la API.

## 7 · Qué hacer con esto

Por orden de lo que ya está resuelto a lo que no:

1. **Autoría y disponibilidad de _Familias_ en el seed** → corregido en el
   [PR #797](https://github.com/georgenton/psico-platform/pull/797), fusionado en
   `f22aa84c`. No toca la fila alojada: despublicarla y corregir su autoría siguen
   siendo actos editoriales con su propia ventana.
2. **`Book.summary` de _EEC_** → la reparación de autoría debería cubrir campos de
   copy. Sin decidir.
3. **La promesa del modo guiado** → o se publica contenido por la puerta editorial,
   o la landing deja de afirmar en presente lo que todavía no hay. Decisión de
   producto, no de código.
4. **La bio de la identidad de fixture** → pendiente de la misma reparación.
