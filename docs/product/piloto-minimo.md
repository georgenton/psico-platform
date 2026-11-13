# Piloto mínimo — propuesta para revisión

**Fecha:** 2026-11-13 (cuarta versión — con la UAT de las cinco microguías y el
alcance del padrón medido) · **Estado:** propuesta, **no** una autorización.
Nada de aquí abre rollout, publica contenido ni activa cobros.

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

| Recorrido                                  | Evidencia                                                                                                                                                                              | Dependencias           | Sus límites                                                                                                                                                       |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Registro y acceso**                      | Cuenta creada por el flujo normal y acceso por el formulario, comprobados el 24-10                                                                                                     | ninguna extra          | Ningún guard exige el correo verificado, así que el alta funciona aunque el correo no salga                                                                       |
| **Lectura de _EEC_**                       | Capítulo 1 con **188 bloques** reales; diez capítulos en sus tres partes. Énfasis reparado: negrita y cursiva de verdad                                                                | ninguna extra          | Quedan **2 bloques** con asterisco, excluidos a propósito (una cita con acento invertido y un ejercicio)                                                          |
| **Progreso: salir y volver**               | Comprobado por API _y_ por pantalla. El 13-11, además, un recorrido guiado a medias **sobrevivió una recarga completa** y volvió a su paso pendiente                                   | ninguna extra          | —                                                                                                                                                                 |
| **Marcas y notas**                         | Una anotación sube `marcasLectura` de 0 a 1, persiste y no se filtra a otra cuenta                                                                                                     | ninguna extra          | El resaltado por carácter no existe en móvil (v1 por bloque)                                                                                                      |
| **Las cinco microguías de C01**            | **Las cinco recorridas escena a escena en pantalla** (MG01 y MG04 el 12-11; MG02, MG03 y MG05 el 13-11), con sus tres prácticas distintas, su salto al pasaje y su recuerdo activo     | **decisión B**         | Sólo C01 — y desde #848 la pestaña guiada **sólo aparece donde hay algo publicado**, así que ya no se ofrecen siete salas vacías (ver §4)                         |
| **Diario cifrado**                         | Entrada escrita, releída tras reabrir sesión, y **recuperada con la frase de respaldo** tras restablecer la contraseña                                                                 | ninguna extra          | Sin la frase, una contraseña nueva **no** reabre el diario. La pantalla ya lo dice                                                                                |
| **Mapa Emocional**                         | Tras leer un capítulo sigue en **0/6** ejes: leer no fabrica emoción                                                                                                                   | ninguna extra          | Necesita check-ins para encenderse; con poca historia dice «Reuniendo datos»                                                                                      |
| **Mi Evolución**                           | Contadores reales, con aislamiento entre cuentas                                                                                                                                       | ninguna extra          | —                                                                                                                                                                 |
| **Descargar mis datos**                    | Recorrido completo **por pantalla** en staging el 25-10: pedir → «preparando» → consultar → «Lista», con enlace a R2. Y por API: 202 → listo en ~3 s                                   | R2                     | El archivo trae ocho secciones y **nombra** lo que no trae. Sin `RESEND_API_KEY` no llega el aviso de «ya está lista»: hay que consultar el estado en la pantalla |
| **Los dos estilos y los cuatro ambientes** | Las **ocho** combinaciones recorridas con los controles reales el 24-10, y re-recorridas el 05-11 sobre el texto reparado midiendo fuente y contraste                                  | ninguna extra          | Lo medido es tipografía y contraste, no una aceptación estética                                                                                                   |
| **Eco (conversar)**                        | Camino normal comprobado con cuenta sintética: SSE 200, respuesta en español, turno del usuario persistido **cifrado** y el de Eco en claro (ADR 0007 §C). Coste observado **$0,0043** | `ANTHROPIC_API_KEY` ✅ | Cuota FREE de **10 mensajes/día**. El modelo no puede releer el diario: conversa sobre lo presente. Sin reintento si se corta el SSE a mitad                      |

---

## 2. Qué queda fuera, y por qué

| Recorrido              | Motivo                                                                               | Qué faltaría para entrar                  |
| ---------------------- | ------------------------------------------------------------------------------------ | ----------------------------------------- |
| **Microguías de C02+** | No hay ninguna Experience publicada fuera de C01                                     | Su propia decisión editorial, obra a obra |
| **Dúo / Círculos**     | Abierto en `pilot` para QA desde el 06-11, pero su entrada cuelga de un pin retirado | La decisión 5 del paquete editorial       |
| **Cobros**             | Cerrados por decisión; D-ORD operativo y comercial sigue abierto                     | Los seis criterios del ADR                |
| **Voz**                | Depende de cuota Pro, y Pro no se vende aquí                                         | Alcance, no avería: técnicamente vivo     |
| **Terapia**            | Detrás de su flag, v2                                                                | —                                         |
| **Móvil**              | El piloto se camina en web                                                           | Su propia validación                      |
| **Producción**         | No existe como recurso en Coolify                                                    | Su propio gate                            |

---

## 3. Integraciones, recorrido por recorrido

| Integración               | Estado                | Qué recorrido necesita                                                                                                                                                                |
| ------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Base, Redis, R2           | ✅                    | **Todo.** Imprescindibles                                                                                                                                                             |
| `ANTHROPIC_API_KEY`       | ✅                    | Eco y la narrativa del Mapa                                                                                                                                                           |
| `EDITORIAL_APPROVAL_KEYS` | ✅ (desde el 12-11)   | La publicación editorial. Ya cumplió su función; no hace falta tocarla                                                                                                                |
| `OPENAI_API_KEY`          | ✅                    | Voz. Fuera de alcance                                                                                                                                                                 |
| `VAPID_*`                 | ✅ (desde el 05-11)   | Sólo push web. Fuera de alcance                                                                                                                                                       |
| `STRIPE_*` (5)            | ✅, **modo test**     | Nada aquí: los cobros están cerrados                                                                                                                                                  |
| **`RESEND_API_KEY`**      | ❌ **ausente**        | **Restablecer la contraseña por correo**, el digest semanal y el aviso de exportación lista. **No** bloquea registro, lectura, microguías, diario, mapa ni la descarga                |
| `GOOGLE_CLIENT_ID`        | ❌, **bien resuelto** | Sólo «Acceder con Google». Sin la clave, ni `/login` ni `/register` muestran el botón ni la palabra: el producto no ofrece lo que no puede cumplir. **No es una decisión del piloto** |
| `SENTRY_DSN`              | ❌ **ausente**        | Ningún recorrido de la persona. Lo que se pierde es **nuestra** traza                                                                                                                 |

Comprobado el 13-11 leyendo las 43 claves del recurso de la API: las tres
marcadas ❌ están **ausentes de la lista**, no vacías.

### Antes de encender el correo, una precondición que sigue en pie

Staging tiene cuentas sintéticas `@psico.test` —que por la RFC 2606 **no pueden
recibir correo**— y cuentas con dirección real del propietario **suscritas al
digest semanal**.

El cron del digest corre **cada hora** y envía a quien cumpla su lunes 07:00
local. Así que poner `RESEND_API_KEY` sin más **mandaría correo real a esas
bandejas** el lunes siguiente, sin que nadie lo hubiera pedido.

La preparación exacta, en este orden:

1. Dar de baja del digest a las cuentas de dirección real, o dejar escrito que
   se acepta recibirlo. Es la decisión del dueño de esas cuentas, no mía, así
   que queda propuesta y no ejecutada.
2. Conseguir una **bandeja de QA controlada y autorizada** — una dirección real
   que alguien acepta expresamente usar para esto — y acotar los destinatarios
   de staging a ella.
3. Verificar `feelverse.app` en Resend (SPF, DKIM, DMARC) y fijar
   `EMAIL_FROM=no-reply@feelverse.app`. Ya está preparado desde el 06-11: el
   remitente por defecto reclamaba un dominio ajeno al producto y Resend lo
   habría rechazado, así que la primera prueba habría fallado por eso y habría
   parecido una clave mala.
4. Sólo entonces, configurar `RESEND_API_KEY` en **API y worker**.
5. Validar contra esa bandeja: recepción → enlace → cambio de contraseña →
   **acceso con la nueva**.

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

| Frente             | Comprobado                                                                                       | Pendiente                                                                                                |
| ------------------ | ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| **Microguías C01** | **Las cinco, en pantalla, escena a escena**, con sus tres interacciones distintas y su veredicto | La **disponibilidad** para alguien que no sea QA: es **B**                                               |
| **Eco**            | El **camino normal** y el **error controlado**                                                   | La **cuota** por ejercer: nadie ha chocado con el tope de 10/día                                         |
| **Retención**      | El **planificador**: los crons corren y evalúan el filtro por huso                               | La **entrega completa**: corrieron con `candidates=0` y sin correo configurado                           |
| **Exportación**    | El **recorrido completo**, worker incluido, y con pantalla                                       | Su **alcance**: ocho secciones, lo ausente nombrado, y material bajo **D-EXP** que ni viaja ni se nombra |
| **Lectura**        | 188 bloques reales, con énfasis real, legibles en los ocho estilos × ambientes                   | Dos bloques con asterisco, excluidos por decisión editorial                                              |

### La pestaña guiada aparece en 8 de 10 capítulos, y sólo uno se puede recorrer

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

1. **¿Se configura `RESEND_API_KEY`?** Con su precondición del §3. Sin ella no
   hay restablecimiento por correo, así que **no se recupera el acceso** a una
   cuenta cuya contraseña se olvidó. Crear otra cuenta **no es recuperarla**: el
   diario de la primera sigue cifrado donde estaba y la nueva empieza vacía.
   **Es la única que bloquea el piloto.**

   Vuelto a comprobar el 13-11 por la noche: la variable sigue **ausente** de la
   lista de los tres recursos —ausente, no vacía— y no hay ninguna credencial de
   correo autorizada en el almacén de ops. Hacen falta dos insumos: el dominio
   verificado con su clave, y una dirección real donde recibir.

2. **¿Se configura `SENTRY_DSN`?** Traza frente a reproducción. No bloquea.
3. **B — ¿se amplía el padrón del guía?** Ahora con su alcance medido (§4 y la
   tabla de abajo). Es la decisión que convierte este piloto en un piloto de
   **lectura acompañada** en vez de lectura a secas.
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

### Qué habilita B, exactamente

El control es **global por usuario**: `isAvailable(userId)` es una función pura
de (modo, padrón, usuario) — sin libro, sin capítulo, sin plan. Así que **no se
puede presentar como «sólo C01»**. Lo que sí acota el alcance es el catálogo
publicado, y eso está medido:

| Superficie o recorrido                     | Hoy, fuera del padrón                      | Al entrar al padrón                                  | Evidencia                               | Límite relevante                              |
| ------------------------------------------ | ------------------------------------------ | ---------------------------------------------------- | --------------------------------------- | --------------------------------------------- |
| Leer _EEC_ (10 capítulos)                  | ✅ ya puede                                | igual                                                | libro `FREE` y publicado                | ninguno                                       |
| `GET /guide/availability`                  | `available: false`                         | `available: true`                                    | medido con las dos identidades          | —                                             |
| Iniciar una guía (5 órdenes `POST`)        | **503 `GUIDE_UNAVAILABLE`**                | permitido                                            | medido                                  | el guard no sustituye al derecho de contenido |
| Pestaña guiada en el lector                | ausente                                    | **presente en 8 de 10 capítulos**                    | medido capítulo a capítulo              | 7 de esas 8 no tienen nada que recorrer       |
| Las cinco microguías de C01                | invisibles en el lector                    | **recorribles**                                      | las cinco, en pantalla                  | es todo lo que se puede recorrer hoy          |
| Microguías de C02–C10 (45 en el menú)      | invisibles                                 | listadas por `/guide/route`, **no ejecutables**      | `/experiences/discovery` → 0 ítems      | ninguna Experience publicada                  |
| _Familias ensambladas_ (obra PRO retirada) | nada                                       | **nada**: `/guide/route` responde `available: false` | medido con la cuenta del padrón         | el padrón **no** cruza la frontera editorial  |
| Definiciones por la API autenticada        | **ya las obtiene** (alcance aceptado de A) | igual                                                | `GET /experiences/discovery` con sesión | B no las hace privadas ni más públicas        |

**Tres cosas que esto deja claras:**

- **B no toca el derecho de contenido.** La obra PRO retirada sigue dando nada,
  y el guard lo dice en su propio comentario: «never substitutes for
  entitlement».
- **B no es «sólo C01»**, pero lo único ejecutable **sí** es C01. La diferencia
  se nota en la pestaña, no en el contenido.
- **El plan no limita nada aquí.** La cuenta con la que se recorrió todo es
  `tier: free`, y el libro ancla es `FREE`.

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
      contraseña vieja deja de valer. _Con el correo configurado hay que
      repetirla por su transporte real._
- [x] **Recuperación del diario comprobada** — la frase de respaldo devuelve el
      contenido original. El diario entra en el piloto.
- [x] **Exportación web validada** — recorrida en staging el 25-10.
- [x] **Eco validado** — 24-10, con coste acotado antes y observado después.
- [x] **Microguías de C01 validadas** — las **cinco**, en pantalla, escena a
      escena, con sus tres prácticas distintas (12-11 y 13-11).
- [x] **Versiones y readiness identificados** — 13-11: `main` y los **tres**
      artefactos servidos por separado; `ready=true`, `reason=ok`, 71
      migraciones, `pending` y `failed` vacíos.
- [ ] **Decisión 1 del §5 tomada** (`RESEND_API_KEY` con su precondición). Es
      la única que bloquea.
- [ ] **Decisiones 3 y 4 tomadas** si se quiere que el piloto incluya las
      microguías.
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

## Lo que esta propuesta NO hace

No abre el padrón · no configura ninguna clave · no envía ninguna invitación ·
no contacta a nadie · no publica contenido · no toca producción, que **no existe
como recurso** · no decide precios.
