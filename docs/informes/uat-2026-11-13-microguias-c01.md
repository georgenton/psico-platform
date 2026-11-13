# UAT · las cinco microguías de C01, y qué habilitaría de verdad ampliar el padrón

**Fecha:** 2026-11-13 · **Entorno:** staging en OVH + Coolify, sólo lectura
salvo los tres recorridos de la cuenta QA · **Identidad:**
`qa-visual-20261026@psico.test` (`cmvpwvqix001l01mjow7492v1`), sintética, en el
padrón del guía, `tier: free`, rol `USER`. **Ninguna cuenta real participó y
ninguna se promovió.**

**Artefactos servidos, leídos del contenedor:** API
`2bee9db5dbd0a9534b3dba5e9977870fa0f9f6f2` · Web `8e6e205352cd…` · worker
`f15c5c967a80…` · PostgreSQL `pgvector/pgvector:pg18`. `main` al empezar:
`7535cab2`. `GET /api/health/ready` → `ready=true`, `reason=ok`, **71**
migraciones, `pending` y `failed` vacíos.

---

## 1 · Lo que se completó

La evidencia previa cubría la apertura de las cinco y el recorrido completo de
**MG01** y **MG04** (12-11). Faltaban **MG02, MG03 y MG05**, y es lo que se
recorrió aquí: escena a escena, en la Web servida, con los controles reales.

Las cinco estaban ya `COMPLETED` por los recorridos HTTP del 07-11, así que cada
una se volvió a abrir con **«Repetir experiencia»** — que inicia una sesión
nueva y **no borra nada**. Al cerrar: 68 → **71** sesiones de guía (+3) y
166 → **175** pasos (+9). Nada eliminado.

### La matriz de las cinco

|                                                | Abre con su título | Pasaje + «Ir al pasaje»                                  | Escenas y texto aprobado   | Su interacción propia                                                                                                                           | Recuerdo: pregunta, opciones y devolución                      | Cierre y progreso                                  | Volver al capítulo y consulta posterior |
| ---------------------------------------------- | ------------------ | -------------------------------------------------------- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | -------------------------------------------------- | --------------------------------------- |
| **MG01** «Lo que una teoría alcanza a mirar»   | ✅ 12-11           | ✅                                                       | ✅                         | ✅                                                                                                                                              | ✅ pregunta y opciones · ⚠️ devolución                         | ✅                                                 | ✅                                      |
| **MG02** «Una sonrisa, varios contextos»       | ✅                 | ✅ y=0 → **2 709** px, cae en la sección de Ekman        | ✅ 7 escenas, texto exacto | ✅ **`context_plausibility`**: 5 lecturas × 3 cajones, dos clasificadas en cajones distintos                                                    | ✅ 3 opciones · **sin `correctOptionKey`** · ⚠️ devolución     | ✅ 3 de 3 · «¿Qué entrega un rostro? **Correcta**» | ✅ reabierto: 5 de 5                    |
| **MG03** «Cuando reaccionas antes de entender» | ✅                 | ✅ y=0 → **4 239** px, cae en la sección de LeDoux       | ✅ 7 escenas, texto exacto | ✅ **`sequence_ordering`**: 4 tarjetas reordenadas al orden resuelto con ↑/↓, `aria-live` anunciando «Posición 1 de 4», extremos deshabilitados | ✅ 3 opciones · respondida **mal a propósito** · ⚠️ devolución | ✅ 3 de 3 · «**Para repasar**», no «Correcta»      | ✅                                      |
| **MG04** «Sentir, interpretar, querer, elegir» | ✅ 12-11           | ✅                                                       | ✅ 8 escenas               | ✅                                                                                                                                              | ✅                                                             | ✅                                                 | ✅                                      |
| **MG05** «Construida no significa falsa»       | ✅                 | ✅ y=4 239 → **10 458** px, cae en la sección de Barrett | ✅ 8 escenas, texto exacto | ✅ **`signal_context_compare`**: 3 señales, 2 contextos, 5 factores multi-seleccionables                                                        | ✅ 3 opciones · **sin `correctOptionKey`** · ⚠️ devolución     | ✅ 3 de 3 · «Correcta»                             | ✅                                      |

Las tres ⚠️ son **un solo defecto**, el 2 de la §2. Todo lo demás pasa.

**Tres anclas distintas, tres destinos distintos** (2 709, 4 239 y 10 458 px):
los saltos no apuntan al mismo sitio, y el botón «Ir al pasaje» sólo se dibuja
cuando el ancla resolvió — así que su presencia **acredita la resolución del
pasaje contra el manuscrito**, que es lo que el informe del 12-11 dejó sin
comprobar.

### La escritura personal, otra vez y con más detalle

MG05 es la única de las cinco con un campo de escritura: la escena **QUESTION**
«Si quieres, respóndete», con el marcador «Solo para ti; no se envía.»

Con un interceptor de `fetch` y `XMLHttpRequest` puesto **antes** de escribir, y
un marcador sintético en el campo:

- escribir: **0 peticiones** (no hay autoguardado por tecla);
- avanzar de escena: **0 peticiones**, y el marcador en **ninguna** clave de
  `localStorage` ni `sessionStorage`;
- enviar el recuerdo: **una** petición, con cuerpo
  `{"idempotencyKey":"…","selectedOptionKey":"opcion-real-y-no-elegida"}` — la
  opción elegida y nada más;
- en el servidor: **0 filas** con el marcador en `GuideSession`,
  `GuideSessionStep`, `GuideCommandReceipt`, `LearningEvent` y `DiaryEntry`.

**Alcance de esa comprobación:** las cinco tablas consultadas y las peticiones
de `fetch`/XHR observadas. No cubre `navigator.sendBeacon` ni es una auditoría
del sistema entero.

### Dos cosas que salieron de paso

- **La sesión caducó a mitad de MG05.** El aviso fue «Tu sesión caducó. Recarga
  la página para continuar.» y el paso **no** se registró. Tras recargar, el
  rail leía **«4 de 5»** con MG05 en «● **En curso**» y su botón decía
  «**Continuar**», no «Revisar»; al pulsarlo volvió **exactamente al paso
  pendiente** (2 de 3). Un recorrido a medias sobrevive una recarga completa y
  una renovación de credencial.
- **«Ver otra experiencia» no hace nada visible** en este diseño, porque el rail
  con las otras cuatro ya está al lado. Observación, no defecto.

---

## 2 · Los tres defectos, y su arreglo

Los tres van en [PR #846](https://github.com/georgenton/psico-platform/pull/846),
con trinquete verificado por mutación (9 mutaciones, 9 muertas).

### 2.1 · La nota de la apertura no llegaba a pantalla

Leído del árbol de React, **en vivo**, para `eec-c01-mg02-intro`: el cliente
recibe `note` y `actionLabel`, y la pantalla no mostraba ninguno de los dos.

En los **83** manifiestos aprobados, la nota de la apertura es la frase de
cuidado de esa microguía. La de MG03, que trata del sobresalto y del miedo:

> «Trabajaremos con situaciones hipotéticas y cotidianas. **No necesitas
> recordar una experiencia difícil.** Puedes salir y volver cuando quieras.»

Aprobada, firmada, servida — y nunca mostrada. Y `actionLabel` hacía que los
«Comenzar» y «Finalizar» aprobados se leyeran «Continuar».

Arreglado en las tres escenas presentacionales. **No** en `PASSAGE`, y la razón
importa: ahí la etiqueta aprobada es «Leí el pasaje», y el componente la usa
sólo cuando hay un punto de control pendiente que registrar. Sin él, «Continuar»
es la palabra honesta — una etiqueta que insinúa un registro inexistente sería
peor que una genérica. El paquete editorial lista «Leí el pasaje» como el botón
de esa escena; el producto es más estricto que el paquete, y está bien así.

### 2.2 · El único panel calificado no devolvía nada

El servidor acepta el paso del recuerdo y limpia `currentStepKey` en la **misma**
respuesta, así que la presentación abre la ventana después del último punto de
control y empuja el cursor: la pregunta queda sustituida por el cierre.

Medido con muestreo de **120 ms**, dos veces, en dos microguías distintas:

| ms  | escena          |
| --- | --------------- |
| 0   | `scene-recall`  |
| 365 | `scene-summary` |

La rama del veredicto de `RecallScene` —«Correcto» / «Vale la pena repasarlo»
más la frase aprobada que el servidor ya mandaba— era **inalcanzable en el flujo
real**. El veredicto sí aparecía en el resumen final, una pulsación después y
sin la explicación.

### 2.3 · «No está publicado» se reportaba como una avería

Ver §3: siete capítulos ofrecían la pestaña guiada y decían «No pudimos preparar
el recorrido», que se lee como un fallo reintentable contra un capítulo que
simplemente no está publicado. Ahora el panel distingue las tres causas.

---

## 3 · Qué habilitaría de verdad ampliar el padrón (decisión B)

**El control es global por usuario.** `GuideRolloutService.isAvailable(userId)`
es una función pura de (modo, padrón, usuario): sin libro, sin capítulo, sin
plan. Su propio comentario lo dice —«no Prisma, no Redis… un rollout gate es una
función pura»— y el guard añade que «never substitutes for entitlement». Así que
**B no se puede presentar como «sólo C01»**.

Lo que acota el alcance es el catálogo publicado. Medido:

| Superficie o recorrido                     | Fuera del padrón                           | Al entrar                                          | Evidencia                               | Límite relevante                              |
| ------------------------------------------ | ------------------------------------------ | -------------------------------------------------- | --------------------------------------- | --------------------------------------------- |
| Leer _EEC_ (10 capítulos)                  | ✅ ya puede                                | igual                                              | libro `FREE` y publicado                | ninguno                                       |
| `GET /guide/availability`                  | `available: false`                         | `available: true`                                  | medido con las dos identidades          | —                                             |
| Iniciar una guía (5 órdenes `POST`)        | **503 `GUIDE_UNAVAILABLE`**                | permitido                                          | medido                                  | el guard no sustituye al derecho de contenido |
| Pestaña guiada en el lector                | ausente                                    | **presente en 8 de 10 capítulos**                  | medido capítulo a capítulo              | 7 de esas 8 no tienen nada que recorrer       |
| Las cinco microguías de C01                | invisibles en el lector                    | **recorribles**                                    | las cinco, en pantalla                  | es todo lo ejecutable hoy                     |
| Microguías de C02–C10                      | invisibles                                 | 45 listadas por `/guide/route`, **no ejecutables** | `/experiences/discovery` → 0 ítems      | ninguna Experience publicada                  |
| _Familias ensambladas_ (obra PRO retirada) | nada                                       | **nada**: `/guide/route` → `available: false`      | medido con la cuenta del padrón         | el padrón **no** cruza la frontera editorial  |
| Definiciones por la API autenticada        | **ya las obtiene** (alcance aceptado de A) | igual                                              | `GET /experiences/discovery` con sesión | B no las hace privadas ni más públicas        |

### La pestaña guiada, capítulo a capítulo

| capítulo                   | pestaña | se puede recorrer       |
| -------------------------- | ------- | ----------------------- |
| **1**                      | sí      | **sí** — las cinco      |
| 3 · 4 · 5 · 6 · 7 · 8 · 10 | sí      | **no** — nada publicado |
| 2 · 9                      | no      | —                       |

La pestaña depende del descubrimiento por capítulo —que nombra un pin para los
diez—, del paquete de copy del cliente —que existe para los diez— y de que el
pasaje se localice. **No** depende de que haya una Experience publicada.

> **Una trampa de medición, por tercera vez en esta sesión.** La primera lectura
> del capítulo 2 informó «sólo una pestaña» tras 4,5 s, y podía ser prematura.
> Se repitió con una espera condicionada de **20 s**: sigue habiendo una sola.
> El capítulo 3, en cambio, la muestra en **1,2 s**. Las ausencias necesitan la
> espera larga; las presencias se confirman solas.

### Lo medido frente a lo deducido

- **Medido en staging:** todo lo de las tablas de arriba, más los dos capítulos
  cuyo panel se abrió (3 y 10): los dos decían «No pudimos preparar».
- **Deducido del código:** que las 45 microguías de C02–C10 **no se pueden
  iniciar**. No se comprobó con un `POST`, porque habría escrito una sesión para
  fabricar un caso — y el encargo pide lecturas. La deducción se apoya en que
  `/experiences/discovery` devuelve 0 ítems para esos capítulos y en que el
  panel se niega sin definición.

**Perfil más acotado para el piloto:** cuenta **FREE** por registro normal, sin
promoción de rol. La cuenta con la que se recorrió todo es `tier: free`.

---

## 4 · Integraciones, releídas hoy

Leídas las **43** claves del recurso de la API: `RESEND_API_KEY`, `EMAIL_FROM`,
`SENTRY_DSN` y `GOOGLE_CLIENT_ID` están **ausentes de la lista** —ausentes, no
vacías—. `VAPID_*`, `ANTHROPIC_API_KEY`, `EDITORIAL_APPROVAL_KEYS`, los cinco
`STRIPE_*` y la infraestructura están puestas.

---

## 5 · Lo que NO se hizo

No se tocó producción, que **no existe como recurso** · no se amplió el padrón
ni se cambió ningún rollout · no se publicó ni archivó nada · no se editó ningún
estado a mano · no se borró ninguna sesión ni progreso · no se promovió ninguna
cuenta a ADMIN · no se usó ninguna cuenta real · no se escribió ninguna
contraseña nueva en el navegador (la sesión del padrón seguía viva; el único
`login` fue por API, leyendo la contraseña del almacén de ops sin imprimirla).

**Lo que queda sin comprobar, dicho como tal:** el recorrido de correo (falta la
clave y una bandeja autorizada) · la cuota de Eco por ejercer · la ejecución de
las 45 microguías de C02–C10, que es una deducción y no una medición · una
aceptación estética de las pantallas, que no es lo que se midió.
