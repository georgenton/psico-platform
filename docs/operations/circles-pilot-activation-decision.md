# Círculos · el piloto productivo de Dúo

> **Las tres decisiones están tomadas.** Jorge aprobó la política de artefactos
> (§2), la plantilla «Lo que me ayuda cuando estoy así» con sus condiciones y
> sus seis exclusiones (§1), y su vínculo con
> `eec-c1-cuerpo-antes-que-mente@1`. Este documento dejó de ser una propuesta:
> describe lo aprobado, lo implementado y lo desplegado, y distingue las tres
> cosas allí donde difieren.
>
> Lo que queda no es una decisión, es una lista de admitidos: **el piloto
> organiza sólo quien esté en `CIRCLES_PILOT_USER_IDS`**, y la contraparte entra
> como invitada sin necesitar cuenta.

Alcance de lo aprobado: **Dúo de dos personas adultas**. Nada más. Ni grupos, ni
Eco, ni Mobile, ni notificaciones, ni correo.

---

## 1 · La plantilla publicada

### De dónde salió su texto

El copy no vino del repositorio: los nueve `DUO_CANDIDATES` de los módulos de
Parejas se declaran «PRODUCT DRAFT ONLY», y PQP C07 publica su lista **vacía a
propósito** —una actividad bilateral es el instrumento equivocado donde puede
haber coerción—. Así que el texto de abajo se escribió original y neutro, para
ser fácil de rechazar, y **Jorge lo aprobó tal cual está**.

Lo aprobado es exactamente esto: el texto, las condiciones de uso, las seis
exclusiones y el vínculo con la experiencia. Aprobar esta plantilla no aprueba
ninguna otra; las demás siguen sin copy verificable aquí.

### Aprobada — **PUBLICADA**

`templateKey: "duo-lo-que-me-ayuda"` · `templateVersion: 1` ·
`status: "PUBLISHED"` · `audience: "DUO_ADULT"` · `estimatedMinutes: 15` ·
`participants: { min: 2, max: 2, required: 2 }` · `ecoMode: "NONE"`

Vive en `packages/types/src/circles-catalog.ts`, y es la **única** entrada de
`PRODUCTION_CIRCLE_TEMPLATES`. Los ratchets que antes exigían un catálogo vacío
ahora exigen exactamente ésta: una segunda plantilla, una versión distinta o un
pin cambiado rompen el build. `ecoMode: "NONE"` porque el piloto es Dúo sin IA.

**Título:** «Lo que me ayuda cuando estoy así»

**Resumen (lo que se ve antes de aceptar):**

> Cada quien escribe por su lado qué le ayuda —y qué no— cuando algo le pesa.
> Después deciden qué comparten. Nadie ve nada del otro hasta que ambos
> confirman.

**Introducción (pantalla de consentimiento, antes de empezar):**

> Vas a prepararte por tu cuenta y después decidir qué compartir. Nadie ve nada
> tuyo hasta que tú lo confirmes, y puedes elegir no compartir nada o retirarte
> en cualquier momento. Toma unos 15 minutos.
>
> No hace falta que cuentes nada difícil. Con un ejemplo cotidiano basta.

_(Esta pantalla ya existe y es común a todas las plantillas; se incluye para que
la aprobación sea de la experiencia completa y no sólo de los campos.)_

**Actividad — preparación privada (dos campos):**

| campo          | etiqueta exacta                   | tipo         | máximo |
| -------------- | --------------------------------- | ------------ | ------ |
| `que-ayuda`    | «Cuando estoy así, me ayuda que…» | `SHORT_TEXT` | 200    |
| `que-no-ayuda` | «Y no me ayuda que…»              | `LONG_TEXT`  | 800    |

Texto de apoyo bajo los campos:

> Lo que escribes aquí se queda en esta pantalla. No se guarda en ningún sitio y
> no sale de tu dispositivo hasta que confirmes qué compartir.

**Selección compartida — modos permitidos:**
`SELECTED_FIELDS`, `EDITED_SUMMARY`, `KEEP_PRIVATE`.

> Elige qué ve la otra persona: los campos tal cual, un resumen que escribas tú,
> o nada. «Nada» es una respuesta completa.

**Revelado:** `ALL_CONFIRMED` — se abre para los dos a la vez, nunca antes.

**Conversación (dos turnos, texto exacto):**

> 1. «Léelo sin responder todavía. ¿Qué de lo que dijo el otro te resulta fácil
>    de hacer?»
> 2. «¿Y qué te costaría? Decirlo ahora ahorra un malentendido después.»

**Cierre:** `outcome.kind: "AGREEMENT"`.

> Escriban juntos una frase con algo concreto que van a intentar. Corta. Si no
> les sale una, también está bien cerrar sin ella.

**Seguimiento:** `followUp.afterHours: 168` (una semana).

> ¿Cómo siguen? — «Seguimos con esto» · «Lo ajustamos» · «Lo cerramos aquí».

**Salida (siempre en pantalla):**

> Retirarme de la actividad.
>
> Si te retiras antes del intercambio, lo que escribiste se descarta y la otra
> persona deja de esperarte. Después del intercambio, lo que ya leyó se queda.

**Seguridad:** `safety.level: "REINFORCED"`, `privateGateRequired: true`. El
motor exige que una plantilla `REINFORCED` tenga la compuerta privada, así que
esa parte no es opcional.

### Condiciones de uso y de exclusión — aprobadas, y en pantalla

**Se puede ofrecer cuando se cumplen las cuatro:**

1. Las dos personas son adultas y cada una entra con su propio consentimiento en
   la pantalla de inicio. Que una invite no consiente por la otra.
2. La relación entre ambas es voluntaria y simétrica: pueden dejar la
   conversación sin que eso les cueste algo fuera de la app.
3. La segunda persona entra por una invitación que le llegó de la primera, por
   el canal que ellas elijan. Nosotros no enviamos nada.
4. La superficie de lectura desde la que se ofrece está mapeada a esta plantilla
   (abajo), y la plantilla nombra de vuelta esa misma superficie.

**No se ofrece — `doNotSuggestWhen`, texto exacto de las entradas:**

```ts
doNotSuggestWhen: [
  "Hay violencia, amenazas o miedo a la reacción de la otra persona.",
  "Una de las dos depende económica, migratoria o legalmente de la otra.",
  "Hay una relación de autoridad entre ambas: jefatura, docencia, terapia o cuidado.",
  "La invitación la pide un tercero, o una de las dos no eligió participar.",
  "Alguna de las dos está en crisis ahora mismo.",
  "Una de las dos es menor de edad.",
];
```

Seis frases y no una categoría abstracta, porque quien las lee tiene que poder
reconocer su propia situación en ellas. Las tres primeras describen coerción —el
motivo por el que PQP C07 publica su lista de candidatas **vacía a propósito**: en
una relación asimétrica, una actividad bilateral es el instrumento equivocado. La
cuarta es consentimiento. La quinta remite al flujo de crisis, que existe, es
público y sin autenticación, y no es esto. La sexta es el alcance aprobado:
`audience: "DUO_ADULT"`.

**El motor no las evalúa, y la pantalla lo dice.** `doNotSuggestWhen` es texto,
no una condición que el código compruebe: violencia, dependencia o una relación
de autoridad no son cosas que un programa pueda detectar.

Lo que sí hace el producto es **mostrárselas a cada persona por separado, en la
compuerta privada, antes de que escriba nada** — con dos botones, «Entiendo,
empezar» y «No quiero hacerla», y una frase que dice literalmente que no podemos
comprobar nada de esto.

No hay pregunta, no hay respuesta, no hay puntuación y no se guarda nada. La
contraparte nunca sabe que esa pantalla estuvo ahí, cuánto se miró ni qué se
decidió frente a ella; salir no pide motivo y el servicio no acepta ninguno.
Continuar es una decisión de participar, **no un certificado de que la relación
es segura**.

### Origen: qué experiencia la ofrece, y por qué esa

**Aprobado, sobre la única experiencia publicada que existe hoy:**

```ts
source: {
  bookSlug: "emociones-en-construccion",
  chapterOrder: 1,
  experiencePin: {
    experienceKey: "eec-c1-cuerpo-antes-que-mente",
    experienceVersion: 1,
  },
}
```

Fuentes, verificables en el repositorio:

- `apps/web/src/app/dashboard/exploraciones/eec-c1-cuerpo-antes-que-mente/page.tsx`
  — la ruta publicada, que ya declara ese pin y ya monta `DuoEntryPoint`. Es **la
  única** superficie de Guía V1 publicada: la ruta es estática precisamente
  porque V1 publica una guía y no un catálogo.
- `apps/web/src/components/dashboard/guide/guide-presentation.ts` — su copy
  exacto: «El cuerpo sabe antes que la mente», tres pasos (concepto, la práctica
  «escucharte por dentro», y recordar lo leído).
- `artifacts/eec/C01/v1.0/feelverse/guides/chapter-guided-suite.manifest.json` —
  capítulo `EEC-C01`, `chapterOrder: 1`, libro `emociones-en-construccion`, con
  el texto canónico fijado en `EEC_C01_v1.0_TEXT_LOCKED_2026-08-20`.

**Por qué el vínculo es pertinente.** El capítulo 1 sostiene una sola idea: el
cuerpo reacciona antes de que la mente alcance a nombrar lo que está pasando —
es literalmente la respuesta correcta de su pregunta de recuerdo. Su práctica,
«escucharte por dentro», es enteramente hacia adentro: notar la señal antes del
relato. La plantilla propuesta es el paso siguiente y hacia afuera, sobre el
mismo asunto: cuando esa señal aparece, **qué le ayuda a cada quien** y qué no.
No pide contar qué se sintió ni por qué —eso sigue siendo privado— sino qué
funciona, que es justo lo que la otra persona no puede adivinar. Leer sobre la
alarma del cuerpo y decirle a alguien qué hacer cuando suena son actos distintos,
y por eso el punto de entrada vive en la superficie de lectura y no en un
listado.

**Lo que este vínculo NO es:** una aprobación de capítulo. El manifiesto de la
suite guiada de EEC-C01 está en `status: DRAFT` con `publishAllowed: false` y su
flag `EEC_C01_GUIDED_SUITE_V1` apagado por defecto — esa es la ruta V2, y no está
publicada. Lo que sí está publicado es la guía del piloto legado
(`legacyPilot.guideKey`), que es la que aquí se propone. Aprobar esta plantilla
**no** aprueba la suite, ni al revés.

**Y no es el mapping de la fixture.** Las pruebas usan `e2e-duo-sintetica` sobre
una experiencia sintética; reutilizar eso en producción ofrecería una actividad
de prueba a una persona real. No se hereda nada de ahí.

### Mapping de elegibilidad publicado

```ts
// apps/web/src/lib/circulos/eligibility.ts — PRODUCTION_DUO_ELIGIBILITY
{
  experienceKey: "eec-c1-cuerpo-antes-que-mente",
  experienceVersion: 1,
  templateKey: "duo-lo-que-me-ayuda",
  templateVersion: 1,
}
```

Dos registros independientes tienen que coincidir: este mapping y el
`source.experiencePin` de la plantilla. Si uno se edita y el otro no, no hay
oferta — y eso es deliberado, porque una sola línea cambiada no debería poder
apuntar una superficie a una actividad que la fuente editorial nunca le ató. Un
solo mapping por plantilla y por superficie; duplicarlo no elige el primero,
desactiva la oferta.

**Una plantilla basta para el primer piloto.** Añadir la segunda es otra ronda,
con su propia aprobación.

### Lo que la pantalla promete, la pantalla lo muestra

Un catálogo es una promesa sobre lo que alguien va a ver, y una promesa que
nadie renderiza se rompe en silencio. Así que hay una prueba que monta la sala
**con la definición publicada** —no con una fixture— y busca lo que la
definición dijo que estaría: el título, el resumen, las dos etiquetas exactas,
los límites de cada campo, los tres modos de compartir (con «nada» entre ellos),
los dos turnos y los minutos.

Esa prueba encontró una discrepancia y se corrigió el código, no el texto: la
plantilla promete 15 minutos y la sala mostraba 10, porque derivaba su propia
estimación del número de turnos. Dos pantallas citando cifras distintas para la
misma actividad es una mentira pequeña que encarece el resto.

---

## 2 · Artefactos y borrado — **APROBADO**

> Aprobado por Jorge. Implementado en la rama
> `feat/circles-artifact-purge-policy`. Esta sección ya no es una decisión
> pendiente: es la descripción de lo que el código hace.

### Cuatro cosas distintas que conviene no mezclar

- **Retirar acceso** — la persona ya no puede abrir la sala. El contenido sigue
  donde estaba.
- **Borrar contenido** — la fila desaparece. Nadie la lee, ni ellos ni nosotros.
- **Retirar el contenido de una fila que tiene que quedarse** — la fila sigue,
  vaciada. Es lo que hace la política aprobada con los artefactos, y el motivo
  está abajo: el ledger apunta a esas filas y no puede perder el registro de que
  el acto ocurrió. No es lo mismo que borrarlas, y llamarlo «borrado de fila»
  sería falso.
- **Desvincular identidad** — la fila se queda y pierde el puntero a la cuenta.
  **Esto no es anonimizar.** Soltar una FK no anonimiza un texto que la persona
  escribió: sigue siendo suyo y sigue siendo reconocible para quien lo leyó.
  Sólo es honesto llamarlo anonimización cuando no queda nada que atribuir, y en
  `CircleEvent` eso se sostiene porque se verificó columna por columna que no
  hay contenido en esa tabla — no porque se haya quitado la clave.

### Qué hace el borrado de cuenta, por estado

La autoría de cada versión la decide el participante que la creó
(`CircleArtifact.createdByParticipantId`), no quien creó el círculo, ni quien
invitó, ni el dueño de la actividad. Se resuelve **antes** de desvincular la
cuenta, porque después ya no hay con qué resolverla.

| Estado                                | Qué ocurre                            | Contraparte                                                       |
| ------------------------------------- | ------------------------------------- | ----------------------------------------------------------------- |
| Sobre propio                          | **Borrado** siempre                   | No lo vio nunca, o ya lo leyó                                     |
| Sobre ajeno, antes de revelar         | **Borrado**                           | Se descarta lo que confirmó para una conversación que no ocurrió  |
| Sobre ajeno, después de revelar       | **Se conserva**                       | Ya lo leyó; borrarlo no lo des-revela y destruiría contenido suyo |
| Artefacto `AGREED`                    | **Se conserva entero**                | Lo confirmaron los dos                                            |
| Artefacto `PROPOSED` del que se va    | **Contenido eliminado**               | Nadie lo aceptó                                                   |
| Artefacto `SUPERSEDED` del que se va  | **Contenido eliminado**               | Redacción ya sustituida por otra                                  |
| Cualquier artefacto de la contraparte | **Intacto**                           | Es suyo; el borrado ajeno no lo toca                              |
| Círculo creado por el borrado         | Se conserva, `createdByUserId = NULL` | El Dúo es de los dos                                              |
| `CircleEvent`                         | Se conserva, `actorUserId = NULL`     | Sin contenido que atribuir                                        |

Vale para actividades vivas y para actividades ya cerradas: una conversación
terminada no protege el texto que nadie aceptó.

### Qué significa «contenido eliminado», exactamente

La fila del artefacto **no se borra**, y eso no es una preferencia: la restricción

    CircleEvent.artifactId → CircleArtifact   ON DELETE RESTRICT

existe porque el ledger registra que hubo una propuesta y que hubo
confirmaciones, y esos asientos apuntan aquí. Borrar la fila sería o bien un
error de base de datos, o bien —si se soltara la referencia— borrar el registro
de que el acto ocurrió, que no es lo aprobado. Lo aprobado es que **el texto se
va**.

Así que se vacían las cuatro columnas que juntas son el contenido —el
`ciphertext`, el `nonce` que lo descifra, el `keyVersion` que elige la clave y el
`payloadHash` que prueba que no fue alterado— y se sella la fecha en `purgedAt`.
Dejar cualquiera de ellas sería dejar un fragmento de un cuerpo. La base de datos
lo exige: o el cuerpo está entero y no hay purga, o no queda nada y la purga está
fechada; no hay estado intermedio.

**Qué permanece, exactamente:** `id`, `activityId`, `version`, `kind`, `status`,
`createdByParticipantId`, `createdAt`, `updatedAt`, `agreedAt` y `purgedAt`. Es
decir: que la versión N fue propuesta por ese asiento, cuándo, y que su contenido
se retiró después.

**Esto no es anonimización y no debe describirse así.** La fila sigue apuntando
al asiento que la escribió, y el asiento a una membresía. La cuenta ya no está y
el texto ya no está; la forma del acto permanece.

**Tampoco alcanza a las copias de seguridad.** Una instantánea tomada antes de
que esto corra sigue conteniendo la fila antigua, y nada de este mecanismo
reescribe ese volumen. Prometer lo contrario sería mentir sobre lo que el código
hace.

### Por qué así, y qué cuesta

Nadie aceptó una `PROPOSED` ni una `SUPERSEDED`: no entraron en nada compartido,
y sostener texto de alguien que pidió irse, sin plazo y sin que nadie lo hubiera
aceptado, era la opción que peor envejecía. Un `AGREED`, en cambio, lo
confirmaron los dos: borrar una cuenta no destruye la copia que la otra persona
tiene de lo que acordaron. La regla vive también como restricción de base de
datos —un `AGREED` purgado es rechazado por el motor— para que no pueda perderse
en una edición futura del servicio, de un script o de una consulta a mano.

**El coste, que hay que aceptar:** una contraparte que vuelva después verá el
acuerdo, si lo hubo, y no verá las propuestas previas. **No se le dirá por qué**,
porque decirlo sería contarle que alguien borró su cuenta.

No hay retención de 90 días y no hay barrido nuevo: la limpieza ocurre dentro de
la misma transacción de borrado que ya existía, después de comprobar bajo lock
que la solicitud sigue vigente y que el plazo se cumplió. Si el borrado se
cancela a tiempo, no se limpia nada.

---

## 3 · Encender, en concreto

### Variables por servicio (nombres, nunca valores)

| Variable                     | API | Worker | Web | Qué hace                                                                               |
| ---------------------------- | :-: | :----: | :-: | -------------------------------------------------------------------------------------- |
| `CIRCLES_ROLLOUT_MODE`       | ✅  |   ✅   |  —  | `pilot`. `on` es disponibilidad general: no es esto.                                   |
| `CIRCLES_PILOT_USER_IDS`     | ✅  |   ✅   |  —  | Los ids admitidos. Vacía ⇒ nadie, aunque el modo sea `pilot`.                          |
| `CIRCLES_SHARED_DATA_KEY_V1` | ✅  |   ✅   |  —  | Bajo `pilot`/`on`, su ausencia **impide arrancar**.                                    |
| `CLIENT_ATTESTATION_SECRET`  | ✅  |   —    | ✅  | El mismo valor en los dos. Si se separan, la superficie de invitado falla **cerrada**. |

Nada más cambia. No hay plataforma de flags, no hay panel: el rollout y la
allowlist que ya existen.

Los secretos son **exclusivos de producción**. Reutilizar los del proyecto de
pruebas ataría dos entornos por su criptografía: quien tuviera la clave de
pruebas podría leer sobres de producción. Se generan aparte y no se imprimen.

### Quién organiza, y quién no necesita cuenta

`CIRCLES_PILOT_USER_IDS` controla **quién organiza**. Se recoge por id, desde una
fuente autorizada, nunca por patrón de correo y nunca copiando un id del entorno
de pruebas: son otra base de datos y otra persona que no existe.

La **contraparte no necesita estar en la lista ni tener cuenta**: entra por una
invitación válida, como invitada. Para el primer recorrido basta con un id.

### Plantilla y mapping — ya publicados

Están en el código desde esta entrega: `PRODUCTION_CIRCLE_TEMPLATES` con
`duo-lo-que-me-ayuda@1` y `PRODUCTION_DUO_ELIGIBILITY` con su única entrada. No
hay nada que publicar al encender; encender es cambiar variables.

### Qué se comprueba después de encender, en producción

1. `GET /api/circles/access` con una cuenta admitida → `200`; con una que no lo
   está → `503`.
2. El listado ofrece «Ir a la experiencia» y la superficie de lectura ofrece
   «Hacer esto con alguien».
3. Un Dúo completo entre las dos personas, hasta el cierre.
4. La cookie de invitado llega `HttpOnly`, `Secure`, `SameSite=Lax`.
5. Los logs no llevan token, atestación ni dirección.

**Ese Dúo puede hacerse con respuestas ficticias, y conviene que así sea.** El
smoke comprueba la mecánica —que el otro no ve nada antes de tiempo, que el
retiro descarta, que el cierre cierra—, y para eso una respuesta inventada sirve
exactamente igual que una íntima. Nadie tiene que contar algo difícil para que
comprobemos que el producto funciona. La frase que se usa en las pruebas es la
misma que vale aquí: **«Prueba técnica: usa respuestas ficticias; no introduzcas
información íntima o clínica.»**

Esto son comprobaciones manuales sobre producción; **no** se ejecuta contra
producción el recorrido automatizado, que registra cuentas sintéticas.

### Apagado — son **dos** servicios, no uno

Apagar sólo el API cierra la puerta y deja el motor encendido por dentro. Son dos
efectos distintos y hay que pedir los dos:

1. **API — cierra el acceso.** Las superficies de Círculos responden `503
CIRCLES_UNAVAILABLE` y nadie entra, ni siquiera quien está en la allowlist.
2. **Worker — detiene las tareas temporales.** El barrido de Círculos
   (`circles-sweep`) cancela invitaciones encalladas y abre seguimientos vencidos
   por reloj, sin que nadie pulse nada. Bajo `off` no hace nada, pero **sólo tras
   reiniciar**: un worker que siga arrancado con `pilot` seguirá moviendo
   actividades de gente que ya no puede entrar a verlas.

```bash
for svc in <api> <worker>; do
  railway variables --project <prod> --environment <prod-env> --service "$svc" \
    --skip-deploys --set CIRCLES_ROLLOUT_MODE=off
  railway redeploy --project <prod> --environment <prod-env> --service "$svc" --yes
done
```

Y se comprueba: `GET /api/circles/guest/session` → `503 CIRCLES_UNAVAILABLE`
mientras `/health` sigue en `200` — cerrado, no caído. El modo se resuelve **una
sola vez al arrancar**, así que sin reinicio no cambia nada, en ninguno de los
dos servicios.

El borrado de cuenta **no** es una de esas tareas temporales y sigue corriendo
con el rollout apagado: es una obligación con la persona, no una función del
producto. Apagar Círculos no la suspende.

Apagar tampoco borra datos ni recupera lo ya visto; si además hay que revocar lo
emitido, es un `UPDATE` de `revokedAt`, no un flag.

### Cuándo parar el piloto

Cualquiera de estas, sin discutirlo:

- Alguien ve contenido de la otra persona antes de que ambos confirmen.
- Un retiro deja a la otra persona esperando, o no descarta lo que debía.
- Un cierre deja la sala en error, como pasó en la prueba manual de esta ronda.
- Aparece una plantilla o un mapping que nadie aprobó.
- Alguien pide que se borre su participación y no hay forma de hacerlo.

Las tres primeras tienen hoy pruebas que las vigilan; la cuarta la vigilan los
ratchets; la quinta la resuelve la política aprobada de §2, verificada contra
PostgreSQL real y contra el entorno alojado.

---

## 4 · Lo que el piloto NO es

- **No es disponibilidad general.** `pilot` ofrece Círculos a los ids de la
  lista y a nadie más; `on` es otra decisión que aquí no se toma.
- **No es un segundo catálogo.** Una plantilla aprobada no autoriza la
  siguiente. Las otras candidatas siguen sin copy verificable en el repositorio,
  y una plantilla sin aprobar **no se publica por omisión**: que nadie haya
  dicho que no no es un sí.
- **No aprueba la suite guiada V2 de EEC-C01**, que sigue `DRAFT` con
  `publishAllowed: false` y su flag apagado. El vínculo se apoya en la guía v1
  publicada, y hay una prueba que lo afirma.
- **No exige contenido personal real.** El smoke productivo **puede y debe**
  hacerse con respuestas ficticias: comprobar que la mecánica funciona no exige
  contarle nada íntimo a nadie. La frase que se usa es «Prueba técnica: usa
  respuestas ficticias; no introduzcas información íntima o clínica.»
- **Eco, Mobile, notificaciones y correo** no son requisito de este piloto y no
  se implementan aquí. Las invitaciones las envía una persona por el canal que
  elija; nosotros no mandamos nada.

## 5 · El candidato @2 — **NO PUBLICABLE todavía**

> `duo-lo-que-me-ayuda@2` existe en el catálogo con `status: "DRAFT"`. Eso es
> lo que lo mantiene fuera de producción: `listPublished()` lo salta, el
> preview público lo rechaza y ningún mapping apunta a él. El entorno de
> pruebas lo sirve por el mismo parche aislado que ya usaba la fixture
> sintética — no por una bandera productiva ni por un endpoint que tendría que
> existir en producción para ser útil en pruebas.

### Qué cambia respecto de @1

@1 **no se toca**: sigue `PUBLISHED`, sigue siendo lo que se ofrece, y las
actividades e invitaciones que ya existen resuelven su pin exacto y conservan
la redacción que esas personas aceptaron. Una plantilla publicada es inmutable;
una corrección es una versión.

1. **Tres preguntas, una por pantalla.** La primera pide una **situación**, no
   una emoción: «¿En qué momento estás pensando?» se puede responder sin
   nombrar lo que se siente, sin encontrar su causa y sin tener algo difícil
   que contar. Es **opcional**, y opcional aquí significa que la pantalla no
   trata el blanco como algo sin terminar.
2. **La tercera se reformula.** De «Y no me ayuda que…» a «Y preferiría que
   evitáramos…»: una preferencia que alguien enuncia sobre sí mismo, no un
   veredicto sobre lo que la otra persona hace mal.
3. **El contexto no se comparte por haberse escrito.** Compartir pasa a ser una
   decisión por pregunta; las obligatorias empiezan marcadas —es lo que
   significaba cualquier plantilla anterior— y la opcional empieza **sin
   marcar**.
4. **Turnos que se pueden leer en voz alta.** Los de @1 pedían reflexionar;
   estos dan la primera frase.
5. **Ayuda preparada de Echo** en cada pregunta: dos piezas, escritas con la
   plantilla, renderizadas desde ella. Cero llamadas a un modelo, cero acceso a
   lo que alguien escribió, `ecoMode` sigue en `NONE`.

### El texto completo, para auditar

El copy íntegro de @2 vive en `packages/types/src/circles-catalog.ts` — título,
resumen, introducción, el desplegable «¿Por qué hacemos esta actividad?», las
tres etiquetas con sus límites, las seis piezas de ayuda, los tres turnos, el
cierre, el seguimiento y las seis exclusiones (idénticas a las aprobadas).

**Fuente y pertinencia.** El capítulo 1 de _Emociones en Construcción_ sostiene
que el cuerpo reacciona antes de que la mente nombre lo que pasa, y su práctica
es hacia adentro. La actividad es el paso siguiente y hacia afuera sobre el
mismo asunto: qué ayuda cuando esa señal aparece. El desplegable describe la
experiencia emocional como algo en lo que participan sensaciones, situación e
interpretación aprendida, y **dice de sí mismo** que es una manera de mirarlo
entre varias y no una explicación clínica. La perspectiva de la emoción
construida tiene literatura detrás —
[Barrett 2017, _Soc Cogn Affect Neurosci_](https://pubmed.ncbi.nlm.nih.gov/27798257/)
— y eso no la convierte en una explicación universal ni clínica. **No se cita
ninguna página, autoría ni afirmación del libro** que no esté en el propio
capítulo publicado.

### Qué falta para publicarlo

1. **Aprobación del copy final** de @2 — el texto de arriba, tal cual.
2. **El mapping**, que en producción debe apuntar a **un solo** pin. Publicar
   @2 es moverlo, no añadirlo: dos entradas para la misma experiencia no
   desempatan, desactivan la oferta.
3. **Archivar @1 en el mismo cambio.** Publicar una versión es una **sucesión**,
   no una suma. El enlace que sigue una persona lleva una *clave* y ninguna
   versión, así que el servidor tiene que responder «qué versión significa esta
   clave ahora» — y esa pregunta solo tiene respuesta mientras **una sola**
   versión de la clave esté `PUBLISHED`. Con dos, `resolvePublishedTemplateByKey`
   se niega en vez de elegir la más alta (adivinar ahí mandaría a alguien a una
   versión que nadie le ofreció): la pantalla del organizador responde 404 y el
   CTA deja de aparecer en todas partes a la vez. No son «dos ofertas», es
   **ninguna**.

   `ARCHIVED` es el estado correcto: retira a @1 de todo lo que **ofrece** —el
   listado, la pantalla del organizador, la vista previa pública— mientras
   `getExact` la sigue resolviendo por pin, que es lo que mantiene vivas las
   actividades ya fijadas a ella. Esto se comprobó de la peor forma: el harness
   dejaba @1 en `PUBLISHED` junto a @2 y las catorce escenas de navegador
   fallaron por un *timeout* de treinta segundos buscando un botón que nunca se
   iba a dibujar.
4. **Actualizar los ratchets** que hoy afirman «una PUBLISHED, una DRAFT, en
   ese orden», a mano y a la vista, en el mismo cambio. Uno de ellos —
   `circulos-alcance.test.ts` — afirma además la regla del punto 3 («como mucho
   una versión PUBLISHED por clave»), para que quien se olvide de archivar @1 se
   entere por una aserción y no por un 404.
5. **Decidir qué pasa con las actividades en curso** sobre @1: por diseño,
   nada. Siguen en @1 hasta terminar, porque `getExact` resuelve `ARCHIVED`.

---

## 6 · Lo que queda por hacer, y quién

- **La lista de admitidos** — ids reales de producción, recogidos uno por uno
  desde una fuente autorizada, nunca por patrón de correo ni copiados del
  entorno de pruebas. Empieza con uno: quien organice.
- **El recorrido manual** — dos personas, respuestas ficticias, de principio a
  fin. Es lo único que ningún automatismo puede hacer en su lugar, porque la
  segunda persona es una persona.
