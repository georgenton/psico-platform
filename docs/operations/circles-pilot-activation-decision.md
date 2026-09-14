# Círculos · lo que hay que decidir para encender el piloto

> **Este documento no enciende nada.** Es el paquete que falta aprobar. Todo lo
> que propone está **sin aprobar** y no se publica hasta que alguien con la
> autoridad editorial y la de privacidad diga que sí, por escrito y en su sitio.
>
> El motor está integrado y apagado: `CIRCLES_ROLLOUT_MODE` ausente,
> `PRODUCTION_CIRCLE_TEMPLATES` vacío, `PRODUCTION_DUO_ELIGIBILITY` vacío.
> Encenderlo son tres decisiones —plantilla, política de artefactos y lista de
> admitidos— y ninguna es técnica.

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
`audience: "DUO_ADULT"` · `estimatedMinutes: 15`

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

**Seguridad:** `safety.level: "REINFORCED"`, `privateGateRequired: true`.
`doNotSuggestWhen`: situaciones donde una actividad bilateral puede empeorar las
cosas — **esta lista la escribe quien aprueba, no yo**. El motor exige que una
plantilla `REINFORCED` tenga la compuerta privada, así que esa parte no es
opcional.

### Mapping de elegibilidad propuesto

Una plantilla necesita una superficie de lectura que la ofrezca, y **ese pin es
una aprobación editorial de capítulo que aquí no se inventa**. Lo que se propone
es la forma, no el capítulo:

```ts
// PRODUCTION_DUO_ELIGIBILITY — una entrada, cuando el capítulo esté aprobado
{
  experienceKey: "<clave de la experiencia aprobada>",
  experienceVersion: <versión exacta>,
  templateKey: "duo-lo-que-me-ayuda",
  templateVersion: 1,
}
```

Y la plantilla tiene que nombrar de vuelta esa misma experiencia en
`source.experiencePin`: dos registros independientes que coinciden, o no hay
oferta. Un solo mapping por plantilla y por superficie; duplicar uno no elige el
primero, desactiva la oferta.

**Una plantilla basta para el primer piloto.** Añadir la segunda es otra ronda.

---

## 2 · Artefactos y borrado

### Tres cosas distintas que conviene no mezclar

- **Retirar acceso** — la persona ya no puede abrir la sala. El contenido sigue
  donde estaba.
- **Borrar contenido** — la fila desaparece. Nadie la lee, ni ellos ni nosotros.
- **Desvincular identidad** — la fila se queda y pierde el puntero a la cuenta.
  **Esto no es anonimizar.** Soltar una FK no anonimiza un texto que la persona
  escribió: sigue siendo suyo y sigue siendo reconocible para quien lo leyó.
  Sólo es honesto llamarlo anonimización cuando no queda nada que atribuir, y en
  `CircleEvent` eso se sostiene porque se verificó columna por columna que no
  hay contenido en esa tabla — no porque se haya quitado la clave.

### Qué hace hoy el borrado de cuenta, por estado

| Estado                           | Hoy                                   | Contraparte                                                       |
| -------------------------------- | ------------------------------------- | ----------------------------------------------------------------- |
| Sobre propio                     | **Borrado** siempre                   | No lo vio nunca, o ya lo leyó                                     |
| Sobre ajeno, antes de revelar    | **Borrado**                           | Se descarta lo que confirmó para una conversación que no ocurrió  |
| Sobre ajeno, después de revelar  | **Se conserva**                       | Ya lo leyó; borrarlo no lo des-revela y destruiría contenido suyo |
| Artefacto `AGREED`               | **Se conserva**                       | Lo confirmaron los dos                                            |
| Artefacto `PROPOSED` del borrado | **Se conserva** — sin decidir         | Nadie lo aceptó                                                   |
| Artefacto `SUPERSEDED`           | **Se conserva** — sin decidir         | Histórico de una redacción sustituida                             |
| Círculo creado por el borrado    | Se conserva, `createdByUserId = NULL` | El Dúo es de los dos                                              |
| `CircleEvent`                    | Se conserva, `actorUserId = NULL`     | Sin contenido que atribuir                                        |

Lo que falta decidir son las dos filas «sin decidir».

### Las opciones, con sus consecuencias

**A · Borrar `PROPOSED` y `SUPERSEDED` del que se va.**
Nadie aceptó esas redacciones, así que nadie las incorporó a nada compartido. La
contraparte pierde el historial de cómo se llegó al acuerdo — si es que se llegó
— y podría ver desaparecer una frase que recordaba. Coherente con «lo que no se
acordó no es de los dos».

**B · Conservarlas indefinidamente** (lo de hoy, por omisión).
La contraparte conserva el hilo completo. El coste es que texto escrito por
alguien que pidió irse sigue existiendo, sin que nadie lo haya aceptado y sin un
plazo. Es la opción que menos decide y la que peor envejece.

**C · Conservarlas 90 días y después borrarlas.**
La contraparte tiene tiempo real de ver cómo quedó la conversación; pasado el
plazo no queda texto no acordado de una cuenta que ya no existe. Necesita un
barrido con fecha — el worker ya hace barridos temporales, así que es el mismo
mecanismo, no uno nuevo.

### Recomendación

**A para `SUPERSEDED`, C para `PROPOSED`.**

Una redacción `SUPERSEDED` ya fue sustituida por otra: su valor para la
contraparte es histórico y pequeño, y su coste —texto de alguien que se fue, que
además ya nadie usa— es el mayor de los tres. Se borra con la cuenta.

Una `PROPOSED` puede ser lo último que se dijo antes de que alguien se fuera, y
borrarla en el acto le quita a la otra persona la posibilidad de entender cómo
terminó. Noventa días es tiempo de sobra para eso y un plazo que se puede
cumplir sin inventar un servicio nuevo.

**Consecuencia que hay que aceptar si se elige esto:** una contraparte que entre
al día 91 verá el artefacto acordado (si lo hubo) y no verá las propuestas
previas. No se le dirá por qué, porque decirlo sería contar que alguien borró su
cuenta.

**Si no se aprueba nada, queda B**, que es lo de hoy. Es una decisión también, y
conviene tomarla a propósito.

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
3. Un Dúo completo entre las dos personas, **con contenido real**, hasta el
   cierre.
4. La cookie de invitado llega `HttpOnly`, `Secure`, `SameSite=Lax`.
5. Los logs no llevan token, atestación ni dirección.

Esto son comprobaciones manuales sobre producción; **no** se ejecuta contra
producción el recorrido automatizado, que registra cuentas sintéticas.

### Apagado

```bash
railway variables --project <prod> --environment <prod-env> --service <api> \
  --set CIRCLES_ROLLOUT_MODE=off
railway redeploy --project <prod> --environment <prod-env> --service <api> --yes
```

Y se comprueba: `GET /api/circles/guest/session` → `503 CIRCLES_UNAVAILABLE`
mientras `/health` sigue en `200`. El modo se resuelve **una sola vez al
arrancar**, así que sin reinicio no cambia nada. Apagar no borra datos ni
recupera lo ya visto; si además hay que revocar lo emitido, es un `UPDATE` de
`revokedAt`, no un flag.

### Cuándo parar el piloto

Cualquiera de estas, sin discutirlo:

- Alguien ve contenido de la otra persona antes de que ambos confirmen.
- Un retiro deja a la otra persona esperando, o no descarta lo que debía.
- Un cierre deja la sala en error, como pasó en la prueba manual de esta ronda.
- Aparece una plantilla o un mapping que nadie aprobó.
- Alguien pide que se borre su participación y no hay forma de hacerlo.

Las tres primeras tienen hoy pruebas que las vigilan; la cuarta la vigilan los
ratchets; la quinta es la decisión de §2 y por eso está pendiente.

---

## 4 · Lo que sigue sin estar listo

- **Aprobación editorial de la plantilla** — §1. Requisito previo.
- **Política de artefactos** — §2. Requisito previo.
- **Contenido personal real.** Todo lo probado hasta ahora es texto inventado.
- **Eco, Mobile y notificaciones** no son requisito de este piloto y no se
  implementan aquí.
