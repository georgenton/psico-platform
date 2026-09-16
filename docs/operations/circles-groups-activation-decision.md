# Círculos · el primer círculo grupal (3 a 6 adultos)

> **Alcance aprobado por Jorge:** grupos de **3 a 6 personas adultas**, roster
> fijo, revelación unánime y salida conservadora, con la adaptación editorial
> acotada que se describe en §1. Nada más. Ni menores, ni terapia grupal, ni
> escuelas, ni empresas, ni jerarquías familiares.
>
> El Dúo productivo **no cambia**. Su evidencia de cierre vive en
> [circles-pilot-activation-decision.md](circles-pilot-activation-decision.md)
> y este documento no la reescribe: describe una segunda forma sobre el mismo
> motor, con su propio interruptor, que llega **cerrado**.

### Estado productivo observado — 2026-09-16

| qué                            | estado                                                                                                                           |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| PR #717                        | fusionada por **merge commit** `1d1e9331` (padres `a302c61c` + `c1fd6078`)                                                       |
| API `psico-platform`           | deployment `3e78d3f4` · `1d1e9331` · SUCCESS; tras encender la modalidad, `d614a71f` · SUCCESS                                   |
| Worker `psico-platform-worker` | `6c1306d5` · SUCCESS; tras encender, `a2f5d62e` · SUCCESS                                                                        |
| Web `psico-platform-web`       | `psico-platform-nt3ssw5w7` Ready, con el alias de producción apuntando a él                                                      |
| Migraciones                    | **una** aplicada esta ronda, `20260916100000_circles_adult_groups`, por el `preDeployCommand` normal. **68** en total. Sin seed. |
| Rollout                        | `pilot` sin cambios, con la allowlist existente                                                                                  |
| Modalidad                      | `CIRCLES_GROUPS=on` en API **y** worker, escrita **después** de desplegar el código con los grupos cerrados                      |
| Forma en producción            | `production-ready.mjs` — 18/18, incluido el nonce distinto por petición                                                          |
| Descubrimiento                 | `/actividades/grupo-lo-que-nos-ayuda` sirve la plantilla aprobada por su título                                                  |

**El smoke productivo autenticado no se observó**, por la misma razón que en el
Dúo: la única cuenta organizadora de la allowlist es la personal de Jorge y no
hay cuenta técnica con credenciales en fichero. Autenticarla habría exigido
extraer una sesión de una persona. Lo que no necesita cuenta sí se comprobó
(arriba); el resto es la prueba manual de §7.

**Escrituras en producción:** ninguna fila. Dos variables de configuración
(`CIRCLES_GROUPS` en API y worker) y dos redespliegues.

---

## 0 · Las dos frases que gobiernan el resto

**Un grupo no es un Dúo con más filas.** Casi todas las reglas del Dúo se leen
igual tengan razón o no, porque con dos personas «la otra» y «el resto» son la
misma cosa. A partir de tres dejan de serlo, y ahí es donde estaban los fallos:
un grupo no podía crearse, sólo una persona podía aceptar, y un reintento podía
dejar un enlace huérfano. Los tres aparecieron la primera vez que una prueba
preguntó por el roster (§4).

**La modalidad es un segundo interruptor, no una bifurcación del primero.**
`CIRCLES_GROUPS` sólo puede **quitar**: quien no está en la allowlist no crea un
grupo porque el interruptor esté abierto, y el orden de esas dos comprobaciones
es toda la garantía. Ambos rechazos son el mismo `503 CIRCLES_UNAVAILABLE`
opaco, para que nadie aprenda de un rechazo que los grupos existen.

---

## 1 · La plantilla

`grupo-lo-que-nos-ayuda@1` — **«Lo que nos ayuda cuando estamos así»**,
`GROUP_ADULT`, 3 a 6, `PUBLISHED`.

Sus tres preguntas son las de `duo-lo-que-me-ayuda@2` con la adaptación
gramatical mínima para una sala: mismas claves, mismos límites, misma ayuda.
Las **seis exclusiones** son las del Dúo reescritas para un grupo y **no
suavizadas** — con más gente en la sala una situación coercitiva empeora, no se
vuelve más llevadera. `safety.level` es `REINFORCED` y
`privateGateRequired: true`.

No declara `experiencePin`. Eso es la afirmación editorial de que **ninguna
lectura en particular la propone**, y por eso su superficie es el listado de
Círculos y no un capítulo (§3).

---

## 2 · Las reglas que el motor hace cumplir

| Regla                                                         | Dónde se decide                                            |
| ------------------------------------------------------------- | ---------------------------------------------------------- |
| Un Dúo sigue siendo exactamente dos                           | rango de la plantilla + `CircleActivity_size_matches_kind` |
| Un grupo admite sólo 3 a 6                                    | el mismo rango + `Circle_group_size_is_three_to_six`       |
| La modalidad sale de la plantilla resuelta, nunca del pedido  | `circles-participation.service.ts`                         |
| Un secreto por asiento, de un solo uso                        | `CircleInvitation_one_live_per_seat`                       |
| La revelación exige el roster completo, no un quórum          | `revealIfAllReady`, dos conteos                            |
| El tamaño y la forma son inmutables una vez creados           | trigger `CIRCLE_ACTIVITY_SHAPE_IMMUTABLE`                  |
| Un acuerdo necesita a todas las personas, en la misma versión | `confirmArtifact`                                          |
| Una instancia vieja no recibe grupos durante el despliegue    | `kind` con default `DUO`                                   |

---

## 3 · Dónde se empieza

El listado `/dashboard/circulos` dejó de ser un callejón sin salida. Decide por
**audiencia**, enumerado y sin fallback:

- **Dúo** → sigue ofreciéndose **sólo** desde la lectura a la que pertenece.
  Leer sobre algo y decidir hacerlo con otra persona son actos distintos, y sólo
  la superficie de lectura puede hacer la oferta. Sin mapping, no hay oferta.
- **Grupo** → el listado **es** su superficie, porque no declara experiencia.
- **Un grupo que además declarara una experiencia** se rechaza en vez de
  ofrecerse desde dos sitios: dos superficies para una actividad es una pregunta
  de autoría, y responderla aquí sería adivinar.

---

## 4 · Lo que las pruebas de comportamiento encontraron

Los totales de las suites no prueban ninguna regla nueva. Estos tres fallos
aparecieron la primera vez que una prueba preguntó por el roster, y cada uno
había llegado en un commit que parecía completo:

1. **Ningún grupo podía crearse.** `CircleInvitation_one_live_per_activity`
   admitía una invitación viva por actividad — la misma frase que «una por
   asiento» mientras la actividad tenía un asiento que llenar, y un rechazo del
   segundo invitado cuando tiene cinco. La regla se conserva y se dice **por
   asiento** (`seatIndex`).
2. **Un reintento podía dejar un enlace huérfano.** La comparación de
   idempotencia leía el primer secreto y contaba los demás, así que `(t1,t2,t3)`
   reintentado como `(t1,t2,t9)` se leía como repetición — y la tercera persona
   sostenía un enlace que el servidor nunca vio, reportado como éxito.
3. **Una sala de seis admitía a un invitado.** Aceptar exigía que la actividad
   estuviera `INVITING`; la primera aceptación la mueve a `PREPARING`, y a
   partir de ahí a todos los demás se les decía que su enlace ya no servía.

Y una cuarta, en el contrato publicado: cada secreto de invitación se publicaba
como `"pattern": "BASE64URL_256"` — el **nombre** de la constante, no el patrón.

---

## 5 · Pulso: modalidad, tamaño, y un umbral que los grupos no pueden comprar

El panel gana la pregunta operativa — cuántas salas hay y de qué tamaño — y
pierde un supuesto que dejó de ser cierto cuando aparecieron.

Diez contribuyentes distintos era toda la regla de supresión. Se escribió cuando
toda actividad tenía dos asientos, así que diez contribuyentes implicaban al
menos cinco salas y ninguna podía restarse a sí misma. **Un grupo de seis rompe
esa aritmética**: dos salas dan doce contribuyentes, y cada organizadora conoce
los seis suyos. Ahora una celda necesita **diez contribuyentes y tres
actividades distintas**. Tres y no dos: con dos salas, restar la tuya deja
exactamente una.

`byModality` cuenta **actividades**, no personas, y no se desglosa por semana —
un conteo por modalidad, tamaño y semana empieza a señalar una actividad
concreta.

---

## 6 · Encender, en concreto

Los grupos llegan **cerrados**. Encenderlos es una variable más, en los dos
servicios, dentro del piloto que ya existe:

1. `CIRCLES_GROUPS=on` en **API y worker**. Nada más cambia:
   `CIRCLES_ROLLOUT_MODE` sigue en `pilot` y `CIRCLES_PILOT_USER_IDS` no se
   toca.
2. Esperar los estados terminales de ambos despliegues. El modo se resuelve
   **una sola vez al arrancar**.
3. Apagar es la misma variable en `off` (o quitarla) y otro redeploy. Cerrarla
   detiene grupos **nuevos**; no deja tirada a la gente que ya está en uno.

Sólo se acepta la grafía `on`. `true`, `1`, `yes` y cualquier otra cosa se leen
como cerrado y se reportan como `CIRCLES_GROUPS_FLAG_INVALID` — un interruptor
que abre una función cuando alguien escribe `CIRCLES_GROUPS=false` es peor que
no tener interruptor.

---

## 7 · Guía breve para probarlo a mano

Necesitas **tres pestañas**: la tuya con sesión iniciada y dos ventanas privadas
distintas (las personas invitadas no necesitan cuenta).

### Un Círculo de tres

1. Entra a `/dashboard/circulos`. La tarjeta **«Lo que nos ayuda cuando estamos
   así»** dice «Entre 3 y 6 personas adultas, contándote» y lleva un botón
   **«Empezar este círculo»**.
2. La pantalla explica el protocolo **antes** del botón, incluidas las dos cosas
   que sólo son ciertas de un grupo: el roster queda fijo al crearlo y se espera
   a todas las personas.
3. Elige **3**. Debajo verás «Vas a recibir 2 enlaces distintos».
4. Pulsa **«Crear el círculo»**. Aparecen **dos** enlaces, etiquetados
   «Participante 2» y «Participante 3», cada uno con su botón de copiar.
   **Cópialos antes de salir o recargar**: no se guardan en ningún sitio.
5. Abre cada enlace en una ventana privada distinta. Antes de aceptar, cada una
   dice «Participan 3 personas, contándote a ti». Acepta en ambas — la segunda
   aceptación es la que antes fallaba.
6. Prepárate en las tres pestañas y confirma en **dos**. La tuya debe decir
   **«Listo. Falta el grupo.»** y **no** debe nombrar a nadie ni contar
   «2 de 3».
7. Confirma en la tercera. Las tres pantallas se abren a la vez y cada una
   muestra las **otras dos** respuestas bajo su etiqueta. «Participante 1» es
   siempre quien organizó, para todo el mundo.
8. Opcional: propón un acuerdo. Hasta que las **tres** personas confirmen esa
   versión sigue siendo una propuesta; reescribirlo empieza de cero.

### Un Dúo (que no debe haber cambiado)

Entra a `/dashboard/exploraciones/eec-c1-cuerpo-antes-que-mente` y pulsa
**«Hacer esto con alguien»**. No hay selector de tamaño — un control con una
sola opción no es una elección —, el botón sigue diciendo **«Crear Dúo»** y hay
**un** enlace, sin etiqueta. La sala sigue hablando de «la otra persona».

---

## 8 · Lo que sigue sin estar hecho

- El smoke productivo autenticado, por la misma razón que en el Dúo: la única
  cuenta organizadora de la allowlist es la personal de Jorge, y extraer una
  sesión de una persona es justo lo que no se hace.
- Mobile. Los grupos son Web, como el Dúo.
- Eco dentro de un grupo. `ecoMode` es `NONE` en la plantilla.
