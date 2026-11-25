# Piloto B — la primera incorporación, preparada

> Ficha de ejecución para **una** persona. Escrita el **2026-11-19**, después
> de cerrar el frente de correo.
>
> El procedimiento general está en
> [piloto-b-ejecucion.md](piloto-b-ejecucion.md); la propuesta y sus criterios,
> en [piloto-minimo.md](../product/piloto-minimo.md) §8.

## 0 · Qué falta para poder ejecutarla

**Nada técnico de la incorporación.** Lo que falta son **dos decisiones
registradas**, y conviene no confundirlas porque son distintas:

| #   | Decisión                                               | Qué autoriza                                                             |
| --- | ------------------------------------------------------ | ------------------------------------------------------------------------ |
| 1   | **Aprobar B**                                          | abrir el piloto del modo guiado más allá de QA                           |
| 2   | **Autorizar a esta persona y el envío a su dirección** | que su dirección entre en `EMAIL_ALLOWLIST` y reciba correo del producto |

**La segunda no se deduce de la primera.** Aprobar el piloto no autoriza
escribirle a nadie en concreto: la guarda de destinatarios es por **dirección
exacta**, y esa es justamente su utilidad.

> **Y la prueba cerrada con QA no autoriza el correo de otro destinatario.** El
> 19-11 se comprobó que el producto entrega a `qa@syntavera.dev`. Eso acredita
> el **mecanismo**, no un permiso para escribir a otra persona. Cada
> participante necesita su propia entrada.

## 1 · La propuesta, sin cambios

Tres personas, **de una en una**. Registro normal en plan FREE. **Dos semanas
por persona**, **seis** como tope del conjunto. Entrada por el flujo normal del
producto, sin accesos privilegiados.

## 2 · Los siete pasos, en orden

El orden no es decorativo: **el correo va antes del registro**, porque al
registrarse se dispara la verificación de su cuenta y, sin su dirección
autorizada, ese mensaje se retiene y la persona queda con una cuenta sin
verificar sin saber por qué.

| #   | Paso                                                                                                             | Dónde                    | Quién      |
| --- | ---------------------------------------------------------------------------------------------------------------- | ------------------------ | ---------- |
| 1   | **Autorización y dirección exacta** de la persona                                                                | registrada por escrito   | Jorge      |
| 2   | Su dirección **añadida a `EMAIL_ALLOWLIST`**, conservando las anteriores                                         | **API y worker**         | mío        |
| 3   | **Configuración aplicada y comprobada** — desplegar los dos y verificar la guarda **dentro de los contenedores** | Coolify                  | mío        |
| 4   | **Registro normal**, por ella misma                                                                              | `staging.feelverse.app`  | la persona |
| 5   | **Obtención de su id**                                                                                           | consulta de sólo lectura | mío        |
| 6   | Su id **añadido a `GUIDE_PILOT_USER_IDS`**                                                                       | **sólo la API**          | mío        |
| 7   | **Comprobación del acceso y del alcance previsto**                                                               | staging                  | mío        |

### Lo que cada paso significa en concreto

**Paso 2 — la lista se amplía, no se sustituye.** Hoy vale
`qa@syntavera.dev,qa-verificacion@syntavera.dev,qa-verificacion-2@syntavera.dev`
—las tres de QA, desde el 23-11—. Queda esa misma lista más `,<su dirección>`.
Perder cualquiera de ellas dejaría fuera una bandeja de pruebas.

**Paso 3 — se despliegan los dos.** El worker manda el digest semanal y el
aviso de exportación; dejarlo con una lista anterior sería dejar fuera
justamente los correos que él envía. Después, el comprobador dentro de **cada**
contenedor: su dirección sale, una variación de una letra no sale.

**Paso 5 — su id se obtiene sin sacar su correo de donde está.** Consulta de
sólo lectura que devuelve el id y nada más, con la dirección pasada por
entorno, no escrita en el comando.

**Paso 6 — el padrón vive sólo en la API**, así que ese paso redespliega **un**
servicio, no dos.

**Paso 7 — qué se comprueba.** Que entra, que ve la pestaña guiada donde hay
algo publicado (hoy, el capítulo 1 de _Emociones en Construcción_), y que el
alcance es el previsto: plan FREE, sin cobros, sin acceso a lo que el padrón no
abre.

## 3 · La invitación, redactada

Para enviar **sólo** cuando las dos decisiones de §0 estén registradas. Se
manda desde una bandeja atendida —`soporte@syntavera.dev`— y no desde el
producto.

> **Asunto:** Te invito a probar FeelVerse, en pequeño
>
> Hola:
>
> Estoy preparando FeelVerse, una aplicación de psicoeducación, y me gustaría
> que la probaras durante un par de semanas. No busco que la uses mucho: busco
> saber qué se entiende y qué no.
>
> Es una versión de pruebas. Eso significa dos cosas concretas: puede fallar, y
> **no es un servicio de salud ni sustituye atención profesional**. Si en algún
> momento te sientes mal, no esperes a la aplicación: en Ecuador llama al 911, o
> abre `https://staging.feelverse.app/ayuda`, que dice dónde pedir ayuda y no pide
> cuenta.
>
> Lo que tendrías que hacer: crear tu cuenta en
> `https://staging.feelverse.app` con esta misma dirección, leer un capítulo y
> contarme qué te pareció. Nada más. **No hay que pagar nada** y no se te va a
> pedir ninguna forma de pago.
>
> Tus textos del diario se guardan cifrados con una clave que sale de tu
> contraseña: **ni yo puedo leerlos**. Eso tiene una consecuencia que conviene
> que sepas antes de empezar — si pierdes la contraseña y no guardaste tu frase
> de respaldo, ese contenido no se recupera. La aplicación te la muestra y te
> pide guardarla.
>
> Puedes dejarlo cuando quieras, sin explicar por qué, y pedirme que borre tu
> cuenta. Si prefieres no participar, dímelo y no pasa nada.
>
> Un abrazo,
> Jorge

> **Corregido el 2026-11-24.** El 23-11 se le quitó la frase «sin tener cuenta»
> porque la Web pedía iniciar sesión. Desde #879 la ayuda es pública y la frase
> vuelve, ya siendo cierta.

> **Resuelto el 2026-11-25.** Antes de enviarla había que decidir qué pasaba con
> Terapia: está cerrada en el servidor y fuera de los menús
> ([ficha §2.9](tramo-a-produccion.md)). Y `/ayuda` sólo enseña lo que una fuente
> acredita: en Ecuador, el 911.

**Lo que esa invitación evita a propósito:** promete poco, nombra el riesgo
real del cifrado antes de que la persona escriba nada, dice que no se paga, y
deja la salida abierta sin coste social.

## 4 · Los tres niveles de retirada

Siguen siendo los del procedimiento general, y **ninguno toca
`EMAIL_ALLOWLIST`**:

| Nivel | Qué se hace                                             | Qué conserva                        |
| ----- | ------------------------------------------------------- | ----------------------------------- |
| 1     | Sacar su id de `GUIDE_PILOT_USER_IDS`                   | su cuenta, su contenido y su correo |
| 2     | Lo anterior, y pedirle que deje de usarlo               | lo mismo                            |
| 3     | Borrado de cuenta **que ella pide** por el flujo normal | nada suyo, por decisión suya        |

> **Su dirección se queda en la lista mientras su cuenta exista.** Retirarla
> dejaría a esa persona sin poder recuperar su contraseña — y su diario está
> cifrado con una clave derivada de ella, así que nadie puede devolvérselo.

## 5 · Lo que esta ficha NO autoriza

No abre cobros, no publica contenido editorial, no amplía el alcance de lectura
y no declara producción lista. Y **no envía nada**: la invitación está
redactada, no mandada.
