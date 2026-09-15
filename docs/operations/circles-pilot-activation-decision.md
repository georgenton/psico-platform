# Círculos · lo que hay que decidir para encender el piloto

> **Este documento no enciende nada.** Es el paquete que falta aprobar. Todo lo
> que propone está **sin aprobar** y no se publica hasta que alguien con la
> autoridad editorial y la de privacidad diga que sí, por escrito y en su sitio.
>
> El motor está integrado y apagado: `CIRCLES_ROLLOUT_MODE` ausente,
> `PRODUCTION_CIRCLE_TEMPLATES` vacío, `PRODUCTION_DUO_ELIGIBILITY` vacío.
> Encenderlo eran tres decisiones —plantilla, política de artefactos y lista de
> admitidos— y ninguna es técnica. **La política de artefactos ya está
> aprobada e implementada** (§2). Quedan dos.

Alcance de lo que se aprobaría: **Dúo de dos personas adultas**. Nada más.

---

## 1 · La primera plantilla

### Por qué es una propuesta y no una candidata del repositorio

No hay copy aprobado verificable aquí. Lo que existe son nueve `DUO_CANDIDATES`
en los módulos de capítulo de Parejas que se declaran a sí mismos «PRODUCT DRAFT
ONLY», y PQP C07 publica su lista **vacía a propósito**: una actividad bilateral
es el instrumento equivocado donde puede haber coerción. El copy aprobado vive
en Notion, que esta línea de trabajo no lee.

Así que abajo hay una propuesta **original y neutra**, escrita para ser fácil de
rechazar: si el equipo editorial prefiere otra, se descarta sin coste.

### Propuesta — **NO APROBADA**

`templateKey: "duo-lo-que-me-ayuda"` · `templateVersion: 1` ·
`status: "DRAFT"` · `audience: "DUO_ADULT"` · `estimatedMinutes: 15` ·
`participants: { min: 2, max: 2, required: 2 }` · `ecoMode: "NONE"`

`status` se queda en `"DRAFT"` hasta la aprobación: publicarla es cambiar ese
valor **y** añadirla al catálogo, a mano y a la vista, en el mismo cambio que
actualiza los ratchets. `ecoMode: "NONE"` porque el piloto es Dúo sin IA.

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

### Condiciones de uso y de exclusión — propuestas, sin huecos

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

**Estas seis son una propuesta.** El motor no las evalúa: `doNotSuggestWhen` es
texto para quien decide ofrecer, no una condición que el código compruebe. Quien
apruebe puede añadir, quitar o reescribir cualquiera.

### Origen: qué experiencia la ofrece, y por qué esa

**Propuesta concreta, sobre la única experiencia publicada que existe hoy:**

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

### Mapping de elegibilidad propuesto

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

**Una plantilla basta para el primer piloto.** Añadir la segunda es otra ronda.

### Lo único que falta, con nombre

El **copy aprobado** de la plantilla. Vive en Notion y esta línea de trabajo no
lo lee, así que todo lo de arriba es original y está escrito para ser fácil de
rechazar. Quien aprueba tiene que decir que sí a dos cosas distintas:

1. **El texto** — título, resumen, introducción, etiquetas de los dos campos,
   turnos de conversación, cierre, seguimiento y salida. Está completo y exacto
   arriba; no hay ningún hueco que rellenar.
2. **Las seis exclusiones** — que son una propuesta de seguridad, no editorial,
   y pueden necesitar otra firma.

Mientras no haya un sí explícito, la plantilla queda **NO APROBADA** y fuera de
`PRODUCTION_CIRCLE_TEMPLATES`, que sigue vacío y con ratchets que lo afirman. Que
el bloque técnico esté completo no adelanta esa decisión ni la presupone.

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

### Participantes permitidos

Los ids de las cuentas reales que vayan a participar, uno por persona,
recogidos **por su id**, nunca por patrón de correo. Empezar con dos.

### Plantilla y mapping

Los de §1, una vez aprobados: publicar la plantilla en
`PRODUCTION_CIRCLE_TEMPLATES` y su única entrada en
`PRODUCTION_DUO_ELIGIBILITY`. Los ratchets que hoy afirman que ambos están
vacíos tendrán que actualizarse en ese mismo cambio, a mano y a la vista.

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

## 4 · Lo que sigue sin estar listo

- **Aprobación editorial de la plantilla** — §1. Requisito previo, y el único
  que queda del paquete original. Una plantilla sin aprobar **no se publica por
  omisión**: que nadie haya dicho que no no es un sí.
- **Pin de experiencia y capítulo aprobados** — §1. Sin ese pin no hay mapping
  posible, y el mapping de la fixture de pruebas no sirve: es sintético.
- **Lista de admitidos** — §3. Ids reales, recogidos uno por uno.
- **Contenido personal real.** Todo lo probado hasta ahora es texto inventado, y
  eso está bien: un smoke en producción **puede y debe** hacerse con respuestas
  ficticias. Comprobar que la mecánica funciona no exige contarle nada íntimo a
  nadie.
- **Eco, Mobile y notificaciones** no son requisito de este piloto y no se
  implementan aquí.
