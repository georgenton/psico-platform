# Piloto mínimo — propuesta para revisión

**Fecha:** 2026-11-16, con el frente de correo actualizado el **2026-11-19** ·
**Estado:** propuesta, **no** una autorización. Nada de aquí abre rollout,
publica contenido ni activa cobros.

> **✅ Qué cambió el 19-11: el correo dejó de ser lo que bloqueaba.**
>
> **El frente de correo se cerró esa noche con recepción real, y el propietario
> lo aceptó.** Lo que este documento llamaba «la única decisión que bloquea el
> piloto» **ya está resuelto**:
>
> | Lo que decía la quinta versión                          | Hoy                                                                                                                                  |
> | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
> | `RESEND_API_KEY` **ausente** en los tres recursos       | ✅ **instalada** por Jorge y **efectiva**: los dos procesos arrancan con el cliente inicializado y la lista de destinatarios acotada |
> | «Sin ella **no se recupera el acceso** a una cuenta»    | ✅ **recuperación comprobada de punta a punta** contra `qa@syntavera.dev`                                                            |
> | «Sin `RESEND_API_KEY` no llega el aviso de exportación» | ✅ **llega**, comprobado por la cola del worker                                                                                      |
> | «Ningún correo automático podría salir» (§8.6)          | ✅ **puede**, y sólo a las direcciones autorizadas                                                                                   |
>
> **Lo que NO cambió, y conviene no leerlo de más.** La prueba cerrada con la
> bandeja de QA **no autoriza el correo de otra persona**: la guarda restringe
> por dirección exacta, así que cada participante necesita **su propia entrada**
> en `EMAIL_ALLOWLIST`, en **API y worker**, conservando las anteriores. Y
> cerrar el correo **no toca** el estado global de F3, la aceptación estética ni
> ninguna de las demás condiciones de producción: lo que se cerró es un
> recorrido, no una puerta de producción.
>
> **Lo que sigue pendiente de ti:** la **decisión B** (§8). Es ahora la **única
> decisión que condiciona este piloto** — las otras dos de la lista del §5,
> Sentry y Google, no lo bloquean, y así están marcadas.
>
> Detalle operativo, con los siete estados y las dos trampas, en el
> **[runbook §2.5.1](../deploy/coolify-runbook.md)**.

> **Qué cambió el 16-11** _(antecedente)_. Un defecto del lector que la cuarta
> versión no podía conocer, y un insumo vuelto a medir — cuya fila de correo
> quedó superada tres días después, como dice el bloque de arriba:
>
> |                              |                                                                                                                                                                                                                                                                                                                                                                                                                           |
> | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
> | **Progreso: salir y volver** | ✅ **reforzado** (#857). El recorrido de la cuarta versión era secuencial y pasaba; la **inicialización concurrente** no. Dos aperturas simultáneas podían dejar a una persona sin capítulo, y una escritura durante la inicialización quedaba sustituida por las cifras anteriores. Cerrado con 6 regresiones contra PostgreSQL y 4 mutaciones. Importa aquí porque un piloto se camina con pestañas abiertas y recargas |
> | **`RESEND_API_KEY`**         | ⬜ **sigue ausente**, re-medido ese día en los **tres** recursos (ausente de la lista, no vacía), y **no hay** ninguna credencial de correo autorizada en el almacén de ops. Los dos insumos siguen siendo los mismos. **→ Superado el 19-11: instalada, efectiva y con el recorrido cerrado**                                                                                                                            |
> | **Cuota FREE de Eco**        | ✅ **comprobada contra el artefacto servido** (§3bis): 10 pasan, el 11 recibe `ECO_QUOTA_EXCEEDED` sin llamar al modelo                                                                                                                                                                                                                                                                                                   |
> | **Lo que Eco comunica**      | ✅ **conciliado el 16-11.** Mi Plan y la puerta preguntan ahora a la misma función: consumo de la ventana que limita, su límite, lo que queda, qué periodo abarca y cuándo vuelve. El mensaje de agotamiento distingue el plan y dice la hora **en el reloj de la persona** —en Quito, las 19:00— sin prometer una contratación que el piloto no ofrece. Los límites **no cambiaron**                                     |
> | **Decisión B**               | ⬜ **sin cambios.** Esta versión no la amplía ni la condiciona a nada nuevo                                                                                                                                                                                                                                                                                                                                               |

Construida sobre lo que el entorno **hace**, comprobado una función a una:
[UAT de C01 del 13-11](../informes/uat-2026-11-13-microguias-c01.md) ·
[validación del 24-10](../informes/validacion-2026-10-24-experiencia-y-ensayo.md)
· [preparación del piloto](../informes/preparacion-piloto-2026-10-24.md) ·
[UAT del 23-10](../informes/uat-2026-10-23-cierre-staging.md).

**La regla que ordena la lista:** una función entra si una persona puede
recorrerla, si ese recorrido está comprobado, si sus dependencias existen y si
sus límites están dichos. **Que exista en la API no basta.**

> **Qué cambió desde la tercera versión (25-10).** Cuatro de los cinco bloqueos
> que esa versión listaba están **cerrados**, y conviene no seguir arrastrándolos
> como pendientes:
>
> | Lo que decía la tercera versión                             | Hoy                                                                                                        |
> | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
> | «50 de 188 bloques muestran asteriscos literales»           | ✅ **reparado el 26-10**: 732 bloques convergidos, 2 excluidos por decisión editorial                      |
> | «Modo guiado: decisión editorial de publicar»               | ✅ **ejecutada el 12-11**: las cinco de C01 firmadas y `PUBLISHED`                                         |
> | «¿Se publica alguna microguía de C01?» (decisión 4)         | ✅ cerrada                                                                                                 |
> | «Versiones y readiness identificados» (criterio de entrada) | ✅ medido el 13-11: repositorio y los **tres** artefactos por separado, `ready=true` con las listas vacías |
> | «¿Se abre `GUIDE_ROLLOUT_MODE`?» (decisión 5)               | ⬜ **sigue abierta** — es la decisión **B**, y ahora se sabe qué habilita de verdad (§5)                   |

---

## 1. Qué incluye, y con qué respaldo

| Recorrido                                  | Evidencia                                                                                                                                                                                                                                                                                                                      | Dependencias           | Sus límites                                                                                                                                                                                                                                                                        |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Registro y acceso**                      | Cuenta creada por el flujo normal y acceso por el formulario, comprobados el 24-10. Y el **19-11**, el alta completa con su correo real: verificación recibida y abierta, con `emailVerified: true` en la base                                                                                                                 | ninguna extra          | Ningún guard exige el correo verificado, así que el alta funcionaba ya antes de que el correo saliera. Desde #870 se puede **pedir otro enlace** (login → «¿No te llegó el correo…?»), pero ese reenvío pasa por la **misma guarda**: sin la dirección autorizada se retiene igual |
| **Lectura de _EEC_**                       | Capítulo 1 con **188 bloques** reales; diez capítulos en sus tres partes. Énfasis reparado: negrita y cursiva de verdad                                                                                                                                                                                                        | ninguna extra          | Queda **1 bloque** con asterisco (un ejercicio). La cita del acento invertido era la nota editorial retirada el 13-11, así que C01 pasa a 187 bloques y 0 asteriscos                                                                                                               |
| **Progreso: salir y volver**               | Comprobado por API _y_ por pantalla. El 13-11, además, un recorrido guiado a medias **sobrevivió una recarga completa** y volvió a su paso pendiente                                                                                                                                                                           | ninguna extra          | —                                                                                                                                                                                                                                                                                  |
| **Marcas y notas**                         | Una anotación sube `marcasLectura` de 0 a 1, persiste y no se filtra a otra cuenta                                                                                                                                                                                                                                             | ninguna extra          | El resaltado por carácter no existe en móvil (v1 por bloque)                                                                                                                                                                                                                       |
| **Las cinco microguías de C01**            | **Las cinco recorridas escena a escena en pantalla** (MG01 y MG04 el 12-11; MG02, MG03 y MG05 el 13-11), con sus tres prácticas distintas, su salto al pasaje y su recuerdo activo                                                                                                                                             | **decisión B**         | La **pantalla** sólo las ofrece donde hay algo publicado (#848), hoy C01. La **API** admite iniciar cualquier pin del catálogo en código — medido, y son cosas distintas (ver §4)                                                                                                  |
| **Diario cifrado**                         | Entrada escrita, releída tras reabrir sesión, y **recuperada con la frase de respaldo** tras restablecer la contraseña                                                                                                                                                                                                         | ninguna extra          | Sin la frase, una contraseña nueva **no** reabre el diario. La pantalla ya lo dice                                                                                                                                                                                                 |
| **Mapa Emocional**                         | Tras leer un capítulo sigue en **0/6** ejes: leer no fabrica emoción                                                                                                                                                                                                                                                           | ninguna extra          | Necesita check-ins para encenderse; con poca historia dice «Reuniendo datos»                                                                                                                                                                                                       |
| **Mi Evolución**                           | Contadores reales, con aislamiento entre cuentas                                                                                                                                                                                                                                                                               | ninguna extra          | —                                                                                                                                                                                                                                                                                  |
| **Descargar mis datos**                    | Recorrido completo **por pantalla** en staging el 25-10: pedir → «preparando» → consultar → «Lista», con enlace a R2. Y por API: 202 → listo en ~3 s. El **19-11**, además, **el aviso por correo**: `Building data export… → [email sent] → READY · 2306 bytes`                                                               | R2                     | El archivo trae ocho secciones y **nombra** lo que no trae. El aviso **ya llega** y enlaza al perfil **pidiendo iniciar sesión** — el fichero no viaja en un enlace público. Enfriamiento de **30 días por cuenta**                                                                |
| **Los dos estilos y los cuatro ambientes** | Las **ocho** combinaciones recorridas con los controles reales el 24-10, y re-recorridas el 05-11 sobre el texto reparado midiendo fuente y contraste                                                                                                                                                                          | ninguna extra          | Lo medido es tipografía y contraste, no una aceptación estética                                                                                                                                                                                                                    |
| **Eco (conversar)**                        | Camino normal comprobado con cuenta sintética: SSE 200, respuesta en español, turno del usuario persistido **cifrado** y el de Eco en claro (ADR 0007 §C). Coste observado **$0,0043**. Y el **16-11**, su cuota FREE **sobre el artefacto servido**: 10 pasan, el 11 recibe `ECO_QUOTA_EXCEEDED` sin llamar al modelo (§3bis) | `ANTHROPIC_API_KEY` ✅ | Cuota FREE de **10 mensajes/día**, y desde el 16-11 Mi Plan muestra **esa misma ventana** con su consumo, lo que queda y cuándo vuelve (§3bis). El modelo no puede releer el diario: conversa sobre lo presente. Sin reintento si se corta el SSE a mitad                          |

---

## 2. Qué queda fuera, y por qué

| Recorrido              | Motivo                                                                                                                                  | Qué faltaría para entrar                                                                    |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| **Microguías de C02+** | No hay ninguna Experience publicada fuera de C01                                                                                        | Su propia decisión editorial, obra a obra                                                   |
| **Dúo / Círculos**     | Abierto en `pilot` para QA desde el 06-11, pero su entrada cuelga de un pin retirado                                                    | La decisión 5 del paquete editorial                                                         |
| **Cobros**             | Cerrados por decisión; D-ORD operativo y comercial sigue abierto                                                                        | Los seis criterios del ADR                                                                  |
| **Voz**                | Depende de cuota Pro, y Pro no se vende aquí                                                                                            | Alcance, no avería: técnicamente vivo                                                       |
| **Terapia**            | Fuera del piloto, **y desde el 25-11 cerrada**: el servidor no la ofrece ni la cobra y las fichas de demostración no se muestran (#891) | Profesionales reales y su propia puerta ([ficha §2.9](../operations/tramo-a-produccion.md)) |
| **Móvil**              | El piloto se camina en web                                                                                                              | Su propia validación                                                                        |
| **Producción**         | No existe como recurso en Coolify                                                                                                       | Su propio gate                                                                              |

---

## 3. Integraciones, recorrido por recorrido

| Integración               | Estado                | Qué recorrido necesita                                                                                                                                                                                                                                            |
| ------------------------- | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Base, Redis, R2           | ✅                    | **Todo.** Imprescindibles                                                                                                                                                                                                                                         |
| `ANTHROPIC_API_KEY`       | ✅                    | Eco y la narrativa del Mapa                                                                                                                                                                                                                                       |
| `EDITORIAL_APPROVAL_KEYS` | ✅ (desde el 12-11)   | La publicación editorial. Ya cumplió su función; no hace falta tocarla                                                                                                                                                                                            |
| `OPENAI_API_KEY`          | ✅                    | Voz. Fuera de alcance                                                                                                                                                                                                                                             |
| `VAPID_*`                 | ✅ (desde el 05-11)   | Sólo push web. Fuera de alcance                                                                                                                                                                                                                                   |
| `STRIPE_*` (5)            | ✅, **modo test**     | Nada aquí, y desde el 18-11 **con mecanismo**: `BILLING_PURCHASES` falla cerrada, la interfaz no ofrece contratar y el servidor contesta `503 PURCHASES_CLOSED`. Que las claves estén puestas **no abre compras**                                                 |
| **`RESEND_API_KEY`**      | ✅ (desde el 19-11)   | **Restablecer la contraseña por correo**, la verificación del alta, el digest semanal y el aviso de exportación lista. Instalada, efectiva y **con el recorrido cerrado**; fuera de producción lo que abre el envío es `EMAIL_ALLOWLIST`, dirección por dirección |
| `GOOGLE_CLIENT_ID`        | ❌, **bien resuelto** | Sólo «Acceder con Google». Sin la clave, ni `/login` ni `/register` muestran el botón ni la palabra: el producto no ofrece lo que no puede cumplir. **No es una decisión del piloto**                                                                             |
| `SENTRY_DSN`              | ❌ **ausente**        | Ningún recorrido de la persona. Lo que se pierde es **nuestra** traza                                                                                                                                                                                             |

Comprobado el 13-11 leyendo las 43 claves del recurso de la API: las dos que
siguen marcadas ❌ están **ausentes de la lista**, no vacías.

**El corte vigente del correo es el del 19-11:** `RESEND_API_KEY` y `EMAIL_FROM`
**puestas en API y worker**, con `EMAIL_FROM=no-reply@feelverse.app` —dirección
pelada, que es lo único que admite el esquema—, `feelverse.app` verificado por el
proveedor y `EMAIL_ALLOWLIST` con la bandeja autorizada. Los dos procesos
arrancan diciendo que el cliente está inicializado y que el envío está
restringido a un destinatario. Siguen **ausentes** `SENTRY_DSN` y
`GOOGLE_CLIENT_ID`, en los tres recursos.

> **Antecedente del 16-11**, conservado porque es el corte sobre el que se
> escribió la quinta versión: ese día `RESEND_API_KEY`, `EMAIL_FROM`,
> `SENTRY_DSN` y `GOOGLE_CLIENT_ID` estaban **ausentes de la lista** en los
> tres recursos, y en el almacén de ops no había **ninguna** credencial de
> correo — la única cuenta de QA pensada para eso era una dirección
> `@psico.test`, que por la RFC 2606 no puede recibir nada. `VAPID_*` presentes
> en API y worker, `NEXT_PUBLIC_VAPID_PUBLIC_KEY` en Web, y `ANTHROPIC_API_KEY`
> en API y worker — es decir, Eco ya funcionaba.

### La precondición de encender el correo, y cómo se resolvió

Staging tiene cuentas sintéticas `@psico.test` —que por la RFC 2606 **no pueden
recibir correo**— y cuentas con dirección real del propietario **suscritas al
digest semanal**.

El cron del digest corre **cada hora** y envía a quien cumpla su lunes 07:00
local. Así que poner `RESEND_API_KEY` sin más **mandaría correo real a esas
bandejas** el lunes siguiente, sin que nadie lo hubiera pedido. Es el riesgo que
la lista de destinatarios acota, y el 19-11 la clave entró **con la lista ya
escrita** en los dos recursos, que es el orden que lo evita.

> ✅ **Lo que esa precondición pedía de nosotros, hecho el 17-11.** El riesgo
> era que una variable bastara para abrir las cinco superficies de correo, una de
> ellas un **cron** que escribe a cada cuenta con el digest activo. Ya no basta: **fuera de producción el correo lo abre
> `EMAIL_ALLOWLIST`, no la clave**. Con clave y la lista vacía no sale **nada**
> —el arranque y `/api/health/integrations` lo dicen con la palabra
> `RETENIDO`/`withheld`—, así que incorporar una credencial no puede mandar el
> digest del lunes a ninguna cuenta de staging. La guarda vive en el único punto
> por el que sale correo real, con trinquete para que siga siendo único. Receta
> de operación en el **runbook §2.5.1**.
>
> Y acopla las dos cosas que de verdad van juntas: **la credencial y la bandeja
> autorizada se incorporan en el mismo paso**, y sólo esa bandeja recibe. Dar de
> baja del digest a las cuentas de dirección real deja de ser un requisito
> previo —la lista ya las excluye— y pasa a ser una cortesía si algún día el
> correo se abre de verdad en staging.

La preparación exacta, en este orden — **ejecutada entera el 19-11**, y
conservada porque el paso 3 vuelve con cada persona que entre al piloto:

1. ✅ Conseguir una **bandeja de QA controlada y autorizada** — una dirección
   real que alguien acepta expresamente usar para esto. Es `qa@syntavera.dev`,
   un buzón compartido creado para esto.
2. ✅ Verificar `feelverse.app` en Resend y fijar
   `EMAIL_FROM=no-reply@feelverse.app`. Preparado desde el 06-11 —el remitente
   por defecto reclamaba un dominio ajeno al producto y Resend lo habría
   rechazado, así que la primera prueba habría fallado por eso y habría parecido
   una clave mala— y verificado el 19-11. **Dirección pelada**: con nombre y
   ángulos, la validación de entorno es fatal y ninguno de los dos procesos
   arranca.
3. ✅ **`EMAIL_ALLOWLIST=<esa bandeja>` PRIMERO**, en API y worker. Antes que la
   clave: así no hay ni un minuto en el que la clave esté puesta y la lista no.
   **Este paso se repite con cada participante**, añadiendo su dirección y
   conservando las anteriores.
4. ✅ Sólo entonces, `RESEND_API_KEY` en **API y worker**, y desplegar los dos.
   La instaló Jorge; es lo único de este frente que no pasó por aquí, porque una
   clave de API no se transcribe.
5. ✅ Validar contra esa bandeja: recepción → enlace → cambio de contraseña →
   **acceso con la nueva**, más las protecciones de reutilización del enlace.
   Cerrado el 19-11: enlace ya usado **410**, contraseña anterior **401** —y que
   sea 401 y no 429 es la mitad del valor, porque un 429 probaría el limitador y
   no que la contraseña dejó de servir.

> **Una trampa de ejecución que costó rehacer una cuenta.** Hay que confirmar
> **qué contenedor sirve** antes de registrar nada: el 19-11 se dio de alta una
> cuenta mientras la actualización progresiva aún servía el contenedor anterior,
> sin credencial. Como la verificación **sólo se dispara desde el registro** y no
> hay reemisión, esa cuenta se quedó sin verificar y hubo que rehacerla.
>
> _Nota del 2026-11-22._ La reemisión que faltaba ese día existe desde #870
> —«Pide otro enlace» desde el login—. La trampa sigue valiendo igual: el
> reenvío también lo atiende el contenedor que esté sirviendo, y sale por la
> misma guarda de destinatarios.

### 3bis. La cuota FREE de Eco — comprobada sobre el servicio desplegado

Eco está dentro del alcance, y su límite es lo primero que una persona del
piloto va a encontrar: **10 mensajes por día UTC**. Hasta hoy eso sólo estaba
probado **en aislamiento** (`eco.service.spec.ts`, «sendMessage — quota gate»),
que demuestra la aritmética con Prisma simulado. Son dos cosas distintas, y
conviene no presentar una como la otra.

**Ejecutado el 2026-11-16 contra el artefacto servido**, con una cuenta
sintética FREE creada para esto: once mensajes cortos. Los diez primeros pasan;
el **undécimo** recibe `ECO_QUOTA_EXCEEDED` **sin llamar al modelo** —la puerta
está antes—, así que el coste se acota a diez llamadas. Observado: **10
mensajes registrados** y la negativa en el undécimo. La puerta **dispara**.

Y el recorrido destapó dos cosas que la prueba aislada no podía ver:

1. **El mensaje que lee la persona era falso dos veces.** El código llegaba bien
   (`ECO_QUOTA_EXCEEDED`), pero el texto que viajaba en el flujo era «Algo salió
   mal. Reintenta en unos segundos.» — y la burbuja del chat pinta ese texto tal
   cual. Nada había salido mal, y reintentar en unos segundos no funciona hasta
   medianoche UTC. El servicio ya tenía escrita la frase honesta («Has usado tus
   mensajes de Eco para hoy. Vuelve mañana o hazte Pro.») y un genérico la
   sustituía. **Arreglado**: una negativa deliberada viaja con su propio mensaje
   cuando llega en nuestro sobre `{code, message}`; cualquier otra cosa —un
   fallo de proveedor, o una negativa cuyo «mensaje» es un código máquina como
   `ECO_THREAD_NOT_FOUND`— conserva el genérico, porque poner un código en una
   burbuja de chat ya pasó una vez (#741).

   **Y el 16-11 se arregló lo que ese mensaje seguía diciendo mal.** Era uno solo
   para todos: «Has usado tus mensajes de Eco para hoy. Vuelve mañana o hazte
   Pro.» Tres cosas falsas según quién lo leyera — a una cuenta **PRO** le
   recomendaba el plan que ya tiene, y le prometía un reinicio «mañana» cuando su
   cuota depende del periodo de su suscripción; y a cualquiera, **«hazte Pro» le
   prometía una contratación que el piloto no ofrece**, porque los cobros están
   cerrados. Ahora se compone de la ventana real y de la zona de la persona: en
   Quito, las 00:00 UTC son las **19:00 del mismo día**, así que dice «vuelves a
   tener mensajes hoy a las 19:00» en vez de «vuelve mañana».

2. **La pantalla de Mi Plan y la puerta no dicen lo mismo.** `/api/billing/usage`
   informó `{"messagesThisPeriod":10,"quota":20}` **en el mismo instante** en que
   Eco rechazaba el mensaje. No es un error de lectura: la puerta usa
   `FREE_DAILY_LIMIT = 10` por día UTC y `/usage` publica
   `PLAN_QUOTAS.FREE.eco = 20` por **periodo de facturación** — dos números y
   dos periodos distintos, cada uno correcto en su sitio. El efecto para una
   persona es que su plan dice «10 de 20» justo cuando se le niega el 11.

   **✅ Cerrado el 16-11, y NO era una decisión comercial.** El 20 nunca fue un
   límite aplicado: en FREE la puerta devuelve antes de llegar a `PLAN_QUOTAS`,
   así que ese número no gobernaba nada — era **una representación equivocada de
   la política vigente**, no una política alternativa.

   El arreglo conserva los límites tal cual —10/día en FREE, 200 por periodo
   efectivo en PRO/ANNUAL, sin límite en B2B— y hace que **las dos superficies
   pregunten a la misma función** (`ecoQuotaWindow`). Mi Plan muestra ahora el
   consumo **de la ventana que limita**, su límite, lo que queda, qué periodo
   abarca y cuándo vuelve; el consumo del periodo de facturación se conserva como
   **estadística diferenciada**, dicha como tal. Las ventanas de voz, Diario y
   libros **no se tocaron**: siguen siendo las del periodo, que es lo correcto
   para ellas.

> **Por qué una bandeja real, y no una `@psico.test`.** Mandar a una dirección
> de un dominio reservado por la RFC 2606 prueba, como mucho, que el código
> llamó al proveedor sin lanzar excepción. Deja **sin** comprobar todo lo que de
> verdad falla en el correo: que el proveedor acepte el envío, que el dominio
> remitente esté autenticado, que el mensaje no caiga en spam, que el enlace
> llegue entero y que su token funcione al abrirlo. Y esa bandeja tiene que
> estar autorizada **antes** de existir el envío: un correo de prueba a una
> dirección que nadie ofreció es correo no solicitado, aunque sea nuestro.

---

## 4. Lo que no hay que confundir

| Frente             | Comprobado                                                                                                                                       | Pendiente                                                                                                                  |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| **Microguías C01** | **Las cinco, en pantalla, escena a escena**, con sus tres interacciones distintas y su veredicto                                                 | La **disponibilidad** para alguien que no sea QA: es **B**                                                                 |
| **Eco**            | El **camino normal** y el **error controlado**                                                                                                   | La **cuota** por ejercer: nadie ha chocado con el tope de 10/día                                                           |
| **Retención**      | El **planificador**: los crons corren y evalúan el filtro por huso. Y desde el 19-11, la **ruta de correo del worker**, por exportación de datos | La **entrega del digest**: sus corridas fueron con `candidates=0`, así que su planificador está acreditado y su entrega no |
| **Exportación**    | El **recorrido completo**, worker incluido, y con pantalla                                                                                       | Su **alcance**: ocho secciones, lo ausente nombrado, y material bajo **D-EXP** que ni viaja ni se nombra                   |
| **Lectura**        | 188 bloques reales, con énfasis real, legibles en los ocho estilos × ambientes                                                                   | Dos bloques con asterisco, excluidos por decisión editorial                                                                |

### La pestaña guiada ya sólo aparece donde hay algo publicado

> ✅ **RESUELTO el 13-11 por la noche (PR #848).** La pestaña dejó de ofrecerse
> donde el capítulo no publica nada. **Verificado sobre la Web servida:** el
> capítulo 1 la conserva y el panel abre con su carril «5 de 5»; los capítulos
> **3 y 10 ya no la muestran**, con 20 s y 15 s de muestreo condicionado —que es
> lo que hace falta para acreditar una ausencia, porque la interfaz se hidrata
> por partes—. Y un fallo de consulta **no** la esconde: quitarle la puerta por
> una red caída a quien tiene un recorrido empezado sería peor que ofrecerla de
> más.
>
> Así que la decisión 4 de abajo **se encogió**: ya no hay que elegir entre
> siete salas vacías y ocultarlas. Lo que queda por decidir es si esto basta.
>
> **Y una cosa que esto NO hace**, dicha aquí para que no se lea de más:
> esconder una pestaña no es un límite en la API. Medido el mismo día,
> `POST /api/guide/sessions` deja empezar un recorrido de C02 sin Experience
> publicada, con sesión real y paso completado. Es deliberado — el libro mayor
> educativo no cuelga del CMS.
>
> El resto de esta sección queda como el antecedente que lo motivó.

Medido el 13-11 con la cuenta del padrón, capítulo a capítulo, esperando a que
la interfaz se estabilizara:

| capítulo                   | pestaña «🌱 Experiencia guiada» | se puede recorrer       |
| -------------------------- | ------------------------------- | ----------------------- |
| **1**                      | sí                              | **sí** — las cinco      |
| 3 · 4 · 5 · 6 · 7 · 8 · 10 | sí                              | **no** — nada publicado |
| 2 · 9                      | no                              | —                       |

La pestaña depende del descubrimiento por capítulo —que nombra un pin para los
diez—, del paquete de copy del cliente —que existe para los diez— y de que el
pasaje se localice. **No** depende de que haya una Experience publicada. Así que
en siete capítulos se ofrece una pestaña que no lleva a ninguna parte.

Lo que decía al abrirla era «No pudimos preparar el recorrido de este
capítulo», que se lee como una avería que alguien podría reintentar. **Eso ya
está arreglado** (PR #846): ahora dice «Este capítulo todavía no tiene recorrido
guiado publicado», que es lo que pasa.

**Decisión para el piloto (nueva, §5.4):** o se acepta que la persona encuentre
siete pestañas que dicen honestamente que no hay nada, o la pestaña deja de
ofrecerse donde no hay nada que recorrer.

---

## 5. Decisiones que hacen falta

1. ✅ **¿Se configura `RESEND_API_KEY`?** **RESUELTA el 19-11**, y era la única
   que bloqueaba el piloto. Los tres insumos que pedía —la clave, el dominio
   verificado y una dirección real donde recibir— están los tres: credencial
   instalada por Jorge, `feelverse.app` verificado por el proveedor y
   `qa@syntavera.dev` como bandeja autorizada. El recorrido que de verdad
   importaba **está cerrado**: una persona que olvida su contraseña la recupera,
   comprobado de punta a punta.

   El argumento por el que bloqueaba sigue siendo cierto y conviene conservarlo,
   porque es el que impide reabrirla a la ligera: sin restablecimiento por correo
   **no se recupera el acceso** a una cuenta cuya contraseña se olvidó, y crear
   otra cuenta **no es recuperarla** —el diario de la primera sigue cifrado donde
   estaba y la nueva empieza vacía.

   **Lo que de esto vuelve con cada persona:** su dirección en
   `EMAIL_ALLOWLIST`, en API y worker, conservando las anteriores. La prueba con
   QA acredita el transporte y el recorrido **para esa dirección**, no para la
   siguiente.

   → Ficha del frente, con los siete resultados y las dos trampas:
   [docs/operations/correo-insumos-pendientes.md](../operations/correo-insumos-pendientes.md)
   · receta de operación en el
   [runbook §2.5.1](../deploy/coolify-runbook.md)

2. **¿Se configura `SENTRY_DSN`?** Traza frente a reproducción. No bloquea.

3. **B — ¿se amplía el padrón del guía?** Ahora con su alcance medido (§4 y la
   tabla de abajo). Es la decisión que convierte este piloto en un piloto de
   **lectura acompañada** en vez de lectura a secas, y desde que la 1 se cerró
   el 19-11 es **la única de esta lista que condiciona el piloto** — la 2 y la 4
   no lo bloquean.

   → **Redactada para resolverse de una vez en el §8**: audiencia y tamaño,
   entrada por el flujo normal, alcance en lenguaje de producto, duración,
   señales de evaluación, cómo pide ayuda, cómo se retira el acceso, y una
   recomendación. El estado desde el que se decide está comprobado en 8.8.

4. ✅ **¿Se oculta la pestaña guiada donde no hay nada publicado?**
   **Ejecutada el 13-11** por la opción recomendada: la pestaña exige ahora que
   haya algo que ofrecer — una experiencia publicada **o** un recorrido propio,
   incluido uno cuyo pin esté archivado, porque esa puerta se conserva. Cuesta
   una petición de metadatos más por capítulo abierto, y las cuatro pestañas
   siguen apareciendo en la misma muestra (4 849 ms desde el inicio del
   documento), así que la guiada no llega más tarde que las demás.

   Lo que queda, si acaso: decidir si para el piloto basta con que esos
   capítulos no ofrezcan nada, o si se prefiere alguna señal de que el recorrido
   llegará.

> **Una decisión que se retira, porque no lo era.** Una versión anterior de esta
> lista preguntaba «¿cuál es la promesa de Eco en FREE: 10 al día o 20 al
> periodo?», como si fueran dos políticas compitiendo. No lo eran: el 20 **nunca
> fue un límite aplicado** —en FREE la puerta devuelve antes de leer
> `PLAN_QUOTAS`—, así que lo que había era **una política y una representación
> equivocada de ella**. Arreglada el 16-11 sin tocar ningún límite ni ningún
> precio (§3bis). Presentar una diferencia entre el comportamiento vigente y su
> representación como una decisión comercial pendiente es el error que esto
> corrige.

### Qué habilita B, exactamente

El control es **global por usuario**: `isAvailable(userId)` es una función pura
de (modo, padrón, usuario) — sin libro, sin capítulo, sin plan. Así que **no se
puede presentar como «sólo C01»**. Lo que sí acota el alcance es el catálogo
publicado, y eso está medido:

**Y hay cuatro cosas distintas que conviene no decir con una frase.** Mezclarlas
es lo que hizo falsas las dos versiones anteriores de esta tabla: una afirmaba
que la pestaña aparece en ocho capítulos (dejó de ser cierto con #848) y la otra
que las 45 microguías de C02–C10 **no son ejecutables** (nunca lo fue: lo que no
se podía era abrirlas desde la pantalla).

| Dimensión                             | Qué es                                                                     | Fuera del padrón                                                | En el padrón                                                                                                                        |
| ------------------------------------- | -------------------------------------------------------------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| **1 · La oferta de la interfaz**      | si el lector muestra la pestaña guiada                                     | ausente                                                         | presente **sólo donde hay una Experience publicada o un recorrido propio** — hoy eso es C01; medido: los capítulos 3 y 10 no la dan |
| **2 · Iniciar una sesión por la API** | `POST /guide/sessions` sobre un pin del catálogo **en código**             | **503 `GUIDE_UNAVAILABLE`**                                     | **permitido para cualquiera de los 50**, con o sin Experience publicada detrás                                                      |
| **3 · Continuar una sesión anterior** | retomar o repasar un recorrido que ya existe, incluso con el pin archivado | `GET /guide/sessions/state` **contesta** (no pasa por el guard) | igual; y la pestaña se conserva por ese recorrido propio aunque el capítulo no publique nada                                        |
| **4 · Derechos de lectura por plan**  | si esta persona puede leer esta obra                                       | lo que diga su plan                                             | **lo mismo**: el guard «never substitutes for entitlement»                                                                          |

La evidencia de la dimensión 2, con su alcance exacto: `POST /api/guide/sessions`
para `eec-c2-universal-no-significa-uniforme@1` devolvió **201**, con sesión
`ACTIVE` real, contexto editorial derivado por el servidor y **un paso
completado**, aunque el capítulo 2 publique **cero** Experiences. La sesión del
ensayo se cerró por la vía normal (`CANCELLED`, su paso conservado). **Eso refuta
que nada fuera de C01 pueda iniciarse.** Lo que **no** demuestra es que las 50
funcionen ni que puedan terminarse: es un pin, un inicio y un paso.

**Y lo demás, medido:**

| Superficie                                 | Fuera del padrón                           | En el padrón                                         | Evidencia                               |
| ------------------------------------------ | ------------------------------------------ | ---------------------------------------------------- | --------------------------------------- |
| Leer _EEC_ (10 capítulos)                  | ✅ ya puede                                | igual                                                | libro `FREE` y publicado                |
| `GET /guide/availability`                  | `available: false`                         | `available: true`                                    | medido con las dos identidades          |
| Las cinco microguías de C01                | invisibles en el lector                    | **recorribles**, las cinco en pantalla               | UAT del 12 y 13-11                      |
| _Familias ensambladas_ (obra PRO retirada) | nada                                       | **nada**: `/guide/route` responde `available: false` | medido con la cuenta del padrón         |
| Definiciones por la API autenticada        | **ya las obtiene** (alcance aceptado de A) | igual                                                | `GET /experiences/discovery` con sesión |

**Tres cosas que esto deja claras:**

- **B no toca el derecho de contenido.** La obra PRO retirada sigue dando nada,
  y el guard lo dice en su propio comentario: «never substitutes for
  entitlement».
- **B abre la pantalla de lo que C01 publica.** La API ya admitía iniciar
  cualquier pin del catálogo en código; eso no lo cambia B y no lo cambió #848.
- **El plan no limita nada aquí.** La cuenta con la que se recorrió todo es
  `tier: free`, y el libro ancla es `FREE`.

**Si algún día se quisiera limitar también los INICIOS a lo publicado**, eso es
una decisión aparte y no está propuesta. Lo que conviene no dar por hecho es que
rompería las sesiones existentes: iniciar y continuar son caminos distintos y
pueden tener reglas distintas — `GET /guide/sessions/state` ya no pasa por el
guard de rollout precisamente porque consultar el propio avance y ejecutar
operaciones nuevas son permisos separados. Acoplar `start` al CMS sí tendría un
coste real, y es otro: archivar una Experience dejaría de poder empezarse, que
es una decisión editorial con efecto sobre el producto.

**Perfil más acotado adecuado para el piloto:** cuenta **FREE**, creada por el
flujo normal, sin promoción de rol. No hace falta Pro para nada de lo que entra.

---

## 6. La primera persona

**Una a la vez, por invitación, en staging.** Esto no es un lanzamiento: es una
persona leyendo un libro real en un entorno de pruebas, para ver qué le pasa.

| Qué                          | Propuesta                                                                                                                                                                                       |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Perfil**                   | Alguien que lee por gusto, sin relación con el desarrollo, dispuesto a decir qué no entendió. **Sin identidad inventada aquí**: la elige Jorge                                                  |
| **Cómo entra**               | Se registra ella misma en `staging.feelverse.app/register` con su correo y una contraseña que elige. **Nunca** una cuenta sembrada ni una nuestra                                               |
| **Qué entra**                | Lectura de _EEC_, progreso, marcas y notas, diario cifrado, Mapa, Mi Evolución, exportación, Eco — y, si B se abre, **las cinco microguías de C01**                                             |
| **Qué queda fuera**          | Microguías de otros capítulos, Dúo/Círculos, voz, terapia, cobros, móvil                                                                                                                        |
| **Qué debe poder completar** | Los criterios de salida del §6.2: un capítulo completo, volver y encontrar su sitio, una marca, una entrada de diario que vuelve a abrir, su exportación descargada, y una conversación con Eco |
| **Cómo reporta**             | Un canal directo con Jorge (el que usen habitualmente) y ninguna herramienta nueva. Sin `SENTRY_DSN` no hay traza automática: lo que cuente es lo que hay                                       |
| **Cuándo se suspende**       | §6.3                                                                                                                                                                                            |

### 6.1 Criterios de entrada

- [x] **QA autenticada completada** — 24-10, panel y lector en los dos estilos ×
      cuatro ambientes; re-recorrida el 05-11 sobre el texto reparado.
- [x] **Recuperación de cuenta comprobada** — por el flujo previsto; la
      contraseña vieja deja de valer. Y **repetida por su transporte real el
      19-11**, que es lo que esta línea pedía: correo recibido en la bandeja
      autorizada, contraseña nueva **204**, acceso con ella en sesión limpia
      **200**, enlace ya usado **410** y contraseña anterior **401**.
- [x] **Recuperación del diario comprobada** — la frase de respaldo devuelve el
      contenido original. El diario entra en el piloto.
- [x] **Exportación web validada** — recorrida en staging el 25-10.
- [x] **Eco validado** — 24-10, con coste acotado antes y observado después.
- [x] **Microguías de C01 validadas** — las **cinco**, en pantalla, escena a
      escena, con sus tres prácticas distintas (12-11 y 13-11).
- [x] **Versiones y readiness identificados** — 13-11: `main` y los **tres**
      artefactos servidos por separado; `ready=true`, `reason=ok`, 71
      migraciones, `pending` y `failed` vacíos.
- [x] **La credencial de correo no puede activar envíos a nadie más** — 17-11:
      fuera de producción el correo lo abre `EMAIL_ALLOWLIST`, no la clave, así
      que incorporarla con la lista vacía **retiene todo** en vez de mandar el
      digest del lunes a cada cuenta de staging. Receta en el runbook §2.5.1. Y
      **ejercido el 19-11**: con la clave puesta, el registro del proveedor de
      esa ejecución tiene tres mensajes y los tres van a la dirección
      autorizada.
- [x] **Decisión 1 del §5 tomada** (`RESEND_API_KEY` con su precondición) —
      **19-11**, con el recorrido de recuperación cerrado y aceptado. Era la
      única que bloqueaba.
- [ ] **Decisión 3 tomada (B)** si se quiere que el piloto incluya las
      microguías — redactada en el §8, con recomendación. **Es la única decisión
      pendiente que condiciona este piloto.**
- [ ] **La dirección de esa persona en `EMAIL_ALLOWLIST`**, en API y worker,
      conservando las anteriores, y **antes** de que se registre: sin ella,
      la verificación de su cuenta se retiene, y pedir otro enlace (#870)
      también se retendría, porque pasa por la misma guarda.
- [ ] Una **persona a la vez**, avisada de que es staging, de que recuperar la
      cuenta y recuperar el diario son cosas distintas, y de que conviene
      guardar la frase de respaldo al crearla.
- [ ] Cuenta creada por **registro normal**, nunca sembrada.

### 6.2 Criterios de salida

La persona **lee un capítulo completo**, sale y vuelve y el progreso está donde
lo dejó; **marca o anota** algo y lo encuentra después; **escribe en el diario**,
cierra sesión, vuelve y lo descifra; **pide y descarga su exportación** desde la
pantalla; ve su **Mapa** y su **Evolución** sin que ninguna cifra la sorprenda;
**conversa con Eco** y la respuesta llega, y si choca con la cuota el aviso lo
explica en vez de fallar en silencio. Ningún P0 ni P1 abierto de su recorrido.

**Si B se abre**, se añade: **recorre al menos una microguía de C01 de principio
a fin** —concepto, práctica y recuerdo— y el recorrido queda registrado donde
dice que queda.

### 6.3 Criterios de suspensión

Pérdida o corrupción de lo que escribió · texto del diario fuera del cliente
(registro, respuesta o correo) · texto de una práctica o reflexión que salga del
dispositivo · un cobro de cualquier importe · una crisis mal atendida (el modal
que no aparece o el número que no se marca) · una obra retirada que vuelva a
servirse · dos personas que vean datos de la otra · `GET /api/health/ready` no
conforme a mitad del piloto.

---

## 7. Invitación y entrada, redactadas

**No enviadas.** Quedan aquí para que se puedan usar tal cual, corregir o
descartar. No se ha contactado a nadie.

### La invitación

> Hola [nombre]:
>
> Estoy construyendo FeelVerse, una aplicación para leer sobre emociones de una
> forma más acompañada que un libro suelto. Está en pruebas, y me vendría muy
> bien que alguien que lee por gusto la recorriera y me dijera qué le pasó.
>
> Sería **un rato, cuando te venga bien**: leer un capítulo del libro, probar un
> par de cosas y contarme lo que no entendiste o lo que te chirrió. No hay nada
> que pagar y no hay nada que instalar.
>
> **«No hay nada que pagar» dejó de ser sólo una promesa nuestra.** Hasta el
> 18-11 la interfaz ofrecía contratar en dos sitios —el muro de Patrones y Mi
> plan, con importes y botones— mientras esta propuesta decía que pagar quedaba
> fuera. Ya no: la pantalla explica que las compras no están disponibles y el
> servidor las rechaza. Así que la frase de la invitación la sostiene el producto.

> Dos avisos honestos: es un **entorno de pruebas**, así que puede fallar y
> puedo tener que borrar datos; y hay una parte —el diario— que se **cifra con
> tu contraseña**, de modo que si la pierdes no la puedo recuperar yo. Al crearla
> te va a dar unas palabras de respaldo: guárdalas.
>
> Si te apetece, te paso el enlace y seguimos por aquí.

### Las instrucciones de entrada

> 1. Abre **staging.feelverse.app/register** y crea tu cuenta con tu correo y
>    una contraseña que elijas tú.
> 2. Cuando el diario te muestre las **palabras de respaldo**, cópialas donde
>    las vuelvas a encontrar. Son la única forma de recuperar lo que escribas
>    ahí si olvidas la contraseña.
> 3. Entra a **Biblioteca → Emociones en Construcción** y lee el **capítulo 1**
>    a tu ritmo. Puedes salir y volver: debería devolverte a tu sitio.
> 4. Prueba lo que te apetezca: subrayar, anotar, escribir en el diario,
>    conversar con **Eco**, mirar tu **Mapa Emocional**.
> 5. Cuéntame lo que quieras, y en particular: qué no entendiste, qué esperabas
>    que pasara y no pasó, y si algo te hizo dudar de si era seguro escribirlo.
>
> Si algo se rompe, no pasa nada — es justo lo que busco saber.

---

## 8. Decisión B, lista para resolver

Lo de arriba describe el piloto. Esto es **la decisión**, en una página, con
una recomendación. Lo que falta para que exista es una frase tuya.

### 8.1 La decisión, exacta

> **¿Se abre el modo guiado a personas que no son de QA, para el piloto, con la
> audiencia y las condiciones de 8.2–8.7?**

Sí o no. No hace falta elegir entre variantes: la propuesta es una.

**Recomendación: sí**, con el grupo de 8.2. Tres razones, y la tercera es la que
de verdad pesa:

1. **El riesgo está acotado y medido.** Entrar en el padrón no da acceso a
   contenido que no fuera suyo —la obra PRO retirada sigue sin servirse a un
   miembro del padrón— y la pantalla sólo ofrece lo que C01 publica. No hay
   cobros, no hay móvil, no hay terapia.
2. **Lo que se abre está recorrido.** Las cinco microguías se recorrieron escena
   a escena en pantalla, con sus tres prácticas distintas (12 y 13-11). No se
   está abriendo algo que nadie haya mirado.
3. **Sin B, el piloto mide la mitad.** Leer un capítulo ya se puede hoy. Lo que
   FeelVerse promete que no promete un PDF es el **acompañamiento**: la
   microguía, la nota de cuidado, el salto al pasaje, el recuerdo. Si el piloto
   sale sin eso, lo que aprendemos es si sabemos servir un libro — que no es la
   pregunta.

**Lo que no es.** B no es «lanzar». Sigue siendo staging, sigue siendo por
invitación y sigue siendo reversible en una variable.

### 8.2 La audiencia, y cómo se identifica

**No hay lista autorizada de participantes, así que no se inventa ninguna.** Lo
que se propone es el perfil y el tamaño:

| Qué                     | Propuesta                                                                                                                                |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **Tamaño**              | **Tres personas**, y **de una en una**: la segunda entra cuando la primera haya cerrado su recorrido o se haya detenido                  |
| **Perfil**              | Lee por gusto, sin relación con el desarrollo, dispuesta a decir qué no entendió. Adulta. Ninguna en situación de crisis                 |
| **Quién las elige**     | Jorge. Aquí no se nombra, no se insinúa y no se contacta a nadie                                                                         |
| **Cómo se identifican** | Por su **id de usuario del servidor**, que sólo existe **después** de que se registren ella misma. El padrón no acepta correos: sólo ids |

Ese último punto tiene una consecuencia operativa que conviene saber de
antemano: **hay un hueco deliberado**. Se registra, lee, y su id entra en el
padrón en un segundo paso. Entre lo uno y lo otro ve la biblioteca y el lector
sin pestaña guiada. No es un fallo: es el orden que impone identificar a alguien
por quien es y no por lo que escribe en un formulario.

### 8.3 Cómo entra, por el flujo normal

**Son dos incorporaciones, no una**, y van en este orden por una razón medible:
al registrarse se dispara el correo de verificación de su cuenta, así que si su
dirección no está autorizada todavía, ese mensaje se retiene y ella se queda con
una cuenta sin verificar y sin saber por qué.

1. Jorge aporta su **autorización y su dirección exacta** para el correo de su
   cuenta.
2. Esa dirección entra en `EMAIL_ALLOWLIST` —**conservando** las que ya
   estuvieran— en **API y worker**, se despliegan los dos y se comprueba que la
   configuración está efectiva.
3. Se registra ella en `staging.feelverse.app/register`, con su correo y una
   contraseña que elige. **Nunca** una cuenta sembrada, nunca una nuestra,
   ningún rol promovido: entra como **FREE**, que es todo lo que el piloto
   necesita.
4. Guarda las **palabras de respaldo** del diario cuando se le muestren.
5. Se obtiene su **id de servidor**.
6. Ese id entra en `GUIDE_PILOT_USER_IDS`, en la **API únicamente**, y se
   redespliega. A partir de ahí el lector de C01 le ofrece la pestaña guiada.
7. Se comprueba el alcance obtenido, con sus controles contrarios.

**«Sólo la API» describe el paso 6**, no la incorporación entera: el paso 2
cambia la configuración del correo, y ahí el worker también la necesita —es
quien manda el digest semanal—.

El procedimiento completo, con los comandos y qué comprobar después de cada
paso, está en
[docs/operations/piloto-b-ejecucion.md](../operations/piloto-b-ejecucion.md). El
texto de la invitación y las instrucciones están en §7, **redactados y sin
enviar**.

### 8.4 Qué podrá hacer, y qué no — en lenguaje de producto

La tabla de cuatro dimensiones del §5 es precisa y está escrita para quien toca
el código. Dicho como se le diría a ella:

**Podrá:** leer _Emociones en Construcción_ completo; subrayar y anotar; abrir
**las cinco microguías del capítulo 1** y recorrerlas enteras; escribir en su
diario cifrado; conversar con Eco hasta diez mensajes al día; ver su Mapa
Emocional y su Evolución; y descargarse todo lo suyo.

**No encontrará en el lector:** microguías de los demás capítulos. Existen en el
catálogo y **no hay ninguna publicada detrás**, así que la pestaña no se ofrece
ahí — no es que algo se lo prohíba, es que no hay nada que abrir. Lo mismo para
la segunda obra, retirada a propósito.

**Y queda fuera del piloto:** Dúo y Círculos, dictado por voz, terapia, nada de
pagar, y la aplicación de móvil.

> Este párrafo decía «No podrá», y eso describía un permiso que no existe. Lo
> que hay es **ausencia de oferta en la interfaz**, que no es lo mismo: la
> diferencia importa porque las cuatro dimensiones de disponibilidad son
> distintas, y confundirlas hace creer que el producto bloquea algo cuando lo
> que pasa es que no publica nada.

**Y tres cosas que conviene no prometerle de más**, porque son verdad y
distinguen a este piloto de un lanzamiento:

- **Estar en el padrón no le da contenido que no fuera suyo.** Es un permiso de
  _acompañamiento_, no de catálogo: su plan sigue decidiendo qué libros lee.
- **Lo que el lector no ofrece no está roto.** Está sin publicar, y así se dice
  en pantalla («En preparación»), no como una avería.
- **Si olvida su contraseña, la recupera por correo** — desde el 19-11 ese
  recorrido está cerrado, **siempre que su dirección esté en la lista
  autorizada**. Y recuperar la cuenta y recuperar el diario siguen siendo cosas
  distintas: lo segundo son sus palabras de respaldo, y nadie más las tiene. Una
  contraseña nueva la deja entrar; lo que escribió con la anterior sólo vuelve
  por esas palabras.

### 8.5 Duración, y qué señales dicen si salió bien

**Dos semanas por persona**, contadas desde su primer acceso, con un tope de
**seis semanas** para las tres. No es una cuota de tiempo que haya que gastar:
si cierra su recorrido en una tarde, se cierra en una tarde. El tope existe para
que el piloto no se convierta en un estado permanente sin que nadie lo decida.

Los criterios de **salida** (§6.2) dicen si el producto aguantó. Las señales de
abajo dicen si el piloto **enseñó algo**, que no es lo mismo:

| Señal                         | Qué se mira                                         | Por qué importa                                                                |
| ----------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------ |
| **Vuelve sola**               | si hay una segunda sesión que nadie le pidió        | la única medida honesta de que le sirvió                                       |
| **Dónde se para**             | en qué bloque o escena deja de avanzar              | distingue «no le interesó» de «no entendió qué hacer»                          |
| **Qué hace con la microguía** | si la termina, si la abandona a mitad, si la repite | es lo que B abre; si no la toca, B no hizo falta                               |
| **Si escribe**                | diario o reflexión, aunque sea una línea            | escribir es confiar, y la confianza es la promesa del cifrado                  |
| **Qué dice del Mapa**         | si alguna cifra le sorprende o le molesta           | el programa V2 existe por esto; una sorpresa ahí es un hallazgo, no un defecto |
| **Qué no entendió**           | sus palabras, literales                             | el copy es lo más barato de arreglar y lo que más cuesta detectar desde dentro |

Lo que **no** se va a medir: nada automático. Sin `SENTRY_DSN` no hay traza, y
el Mapa Emocional **no sirve como telemetría del piloto** — mide lo que ella
reporta de sí misma, no si el producto funciona. Confundirlos sería exactamente
lo que el programa V2 pasó ocho fases desenredando.

### 8.6 Cómo recibe ayuda

Un canal directo con Jorge, el que ya usen. **Ninguna herramienta nueva, ningún
formulario, ningún correo automático de soporte.** Se le dice de antemano que es
staging, que puede fallar y que avisar de un fallo es justo lo que se le pide.

> Esta línea decía «ningún correo automático —que además hoy no podría salir—».
> La segunda mitad **dejó de ser cierta el 19-11**: el correo sale, y a su
> dirección si está autorizada. Lo que se conserva es la decisión, no la
> imposibilidad: el acompañamiento va por el canal directo **porque así se
> decidió**, no porque el transporte faltara. Los correos que sí le llegan son
> los de su cuenta —verificación, restablecimiento, su exportación— y el digest
> semanal, que es opcional y se apaga desde su perfil.

Si lo que encuentra es algo del §6.3, se detiene antes de arreglarlo.

### 8.7 Cómo se detiene, y cómo se retira el acceso

Tres niveles, de menos a más, y los tres son de una variable:

| Nivel                        | Qué se hace                                                                            | A quién afecta       |
| ---------------------------- | -------------------------------------------------------------------------------------- | -------------------- |
| **Retirar a una persona**    | sale su id de `GUIDE_PILOT_USER_IDS` y se redespliega                                  | sólo a ella          |
| **Cerrar el acompañamiento** | `GUIDE_ROLLOUT_MODE=off`                                                               | a todos, QA incluida |
| **Cerrar el piloto entero**  | lo anterior, y se le dice a ella; su cuenta se conserva o se da de baja según prefiera | a todos              |

**«Retirar el acompañamiento» y «cerrar su cuenta» son cosas distintas, y sólo
la primera está en los dos primeros niveles.** Conviene no decirlas con la misma
frase: dar de baja una cuenta es un acto que le toca a ella pedir, y aparece sólo
en el tercer nivel, y aun ahí «se conserva o se da de baja **según prefiera**».

**Lo que retirar el acompañamiento NO hace:** no borra lo que escribió, no
interrumpe un recorrido ya guardado —consultar el propio avance no pasa por este
control— y no afecta a su lectura, que no depende del padrón. La deja exactamente
donde está hoy cualquiera: leyendo, con su diario y su historial intactos.

Las condiciones que **obligan** a detener están en §6.3 y no se renegocian aquí:
pérdida de lo que escribió, texto del diario fuera del cliente, un cobro de
cualquier importe, una crisis mal atendida, una obra retirada que vuelva a
servirse, dos personas que vean datos de la otra, o `GET /api/health/ready` no
conforme.

### 8.8 El estado desde el que se decide, comprobado hoy

Leído del artefacto servido, el guía y Círculos el **17-11** y el correo el
**19-11**, para que la decisión no se tome sobre un recuerdo:

| Variable                  | Valor hoy                                  |
| ------------------------- | ------------------------------------------ |
| `GUIDE_ROLLOUT_MODE`      | `pilot`                                    |
| `GUIDE_PILOT_USER_IDS`    | **1 id** (la cuenta de QA)                 |
| `EEC_C01_GUIDED_SUITE_V1` | `on`                                       |
| `CIRCLES_ROLLOUT_MODE`    | `pilot`                                    |
| `RESEND_API_KEY`          | **presente** (19-11)                       |
| `EMAIL_FROM`              | `no-reply@feelverse.app`                   |
| `EMAIL_ALLOWLIST`         | **1 entrada**: la bandeja autorizada de QA |
| `SENTRY_DSN`              | **ausente**                                |

Así que ejecutar B es **añadir ids a una lista que ya existe**, en un modo que ya
está puesto. No hay que cambiar de modo, ni tocar el interruptor de C01, ni
desplegar código.

**Y la condición de entrada que acompañaba a B ya se cumplió.** Decía que la
primera invitación esperaba el recorrido de recuperación por correo completado
—recepción → enlace → contraseña nueva → acceso, en la bandeja autorizada—, y
eso se cerró el **19-11**. El argumento que la sostenía sigue en pie, y por eso
se conserva: sin ese recorrido, una persona que olvide su contraseña **no
recupera la cuenta**, y eso no se arregla avisándole.

Lo que queda de esa regla, en dos mitades:

- **B es una decisión independiente del correo.** Podía aprobarse antes y puede
  aprobarse ahora; aprobarla no pone a nadie dentro.
- **Entrar una persona real exige su dirección en la lista autorizada**, en API
  y worker, **antes** de que se registre. El recorrido cerrado con la bandeja de
  QA acredita el transporte **para esa dirección**; la guarda restringe por
  dirección exacta, así que sin su entrada ella no recibe ni la verificación de
  su cuenta ni el enlace para recuperarla.

> Una versión anterior de este párrafo permitía invertir el orden «si se le
> advierte a ella por el canal directo y se le pide que guarde la contraseña».
> **Esa excepción no estaba autorizada**, y además contradecía el criterio de
> entrada del §6.1 de este mismo documento. Advertir que no hay recuperación no
> es lo mismo que haberla: el diario se cifra con su contraseña, nadie más tiene
> la clave, y el coste de equivocarse lo paga ella, no nosotros. Hoy la
> excepción ya no hace falta, pero el razonamiento se conserva por si alguna vez
> se piensa en entrar a alguien sin su dirección en la lista: sería la misma
> apuesta con otro nombre.

---

## Lo que esta propuesta NO hace

No abre el padrón · no configura ninguna clave · no envía ninguna invitación ·
no contacta a nadie · no publica contenido · no toca producción, que **no existe
como recurso** · no decide precios.
