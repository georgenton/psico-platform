# Aceptación visual — material para un visto bueno o una lista de cambios

> **Qué es esto.** Las pantallas vigentes, **en el orden en que una persona
> conoce el producto**, para que puedas decir «adelante» o «esto cambia».
> Recorrido el **2026-11-18** sobre lo que sirve staging hoy: Web `a1448207`,
> API y worker `85ab7c86`.
>
> **Cómo se hizo**, para que se pueda repetir: con una **cuenta sintética**
> (`@psico.test`) creada en la sesión, FREE, sin rol promovido y **fuera del
> padrón del guía** — es decir, exactamente lo que verá una persona del piloto
> **antes** de que apruebes B. No se repitieron los cinco recorridos de
> microguías, que ya están aceptados.
>
> **Lo que este documento NO hace:** no propone un rediseño, no cambia la
> identidad visual y no toca nada por iniciativa propia. Las decisiones de
> abajo son tuyas.

> ### Desde el 2026-11-23, la página se rehízo para responder en ella
>
> El mismo enlace de abajo lleva ahora a las pantallas **que sirve staging**
> (`6521dc6f`), en cuatro bloques, escritorio y teléfono, con las de verificación
> y su confirmación, y con el Diario y Eco **por dentro**. Termina en un texto
> para copiar: «acepto el conjunto» o la lista por pantalla. Se recapturaron
> porque de las dieciocho siete medían 400 px y once 800.
>
> Este documento sigue siendo el registro de las **diez decisiones cerradas**, que
> no se reabren. Qué se decide ahora, en
> [la ficha](../operations/tramo-a-produccion.md).

## 📷 Las capturas, para abrirlas mientras lees

**→ [Las 18 pantallas, con sus decisiones](https://claude.ai/artifact/56P67k18svei385pZ2Whn3)**
— página privada, sólo tuya hasta que la compartas. Cada decisión lleva su
captura al lado, en el mismo orden que este documento.

**Por qué no están en el repositorio:** es público, y las capturas del panel
llevan el identificador de la cuenta sintética del recorrido en la barra
lateral. No es de ninguna persona real, pero publicarlo no hace falta para
nada. Si prefieres tenerlas en el repositorio, se dice y se hace.

**Copia de archivo**, fuera del espacio de trabajo temporal, por si la página
hiciera falta reconstruirla: `~/.psico-ops/aceptacion-visual-2026-11-18/`, los
18 ficheros con el mismo nombre que se cita aquí.

Las de acceso y crear cuenta (02 y 03) están a media resolución: con la sesión
abierta esas dos rutas redirigen al panel, así que se conservan las tomadas
antes de entrar.

---

## Parte A — lo funcional, ya aceptado

Esto **no** necesita tu visto bueno; está comprobado y se conserva. Lo incluyo
para que no se confunda con lo que sí hay que decidir.

| Qué                                                           | Cuándo se comprobó                                    |
| ------------------------------------------------------------- | ----------------------------------------------------- |
| Las ocho combinaciones de estilo × ambiente, con su contraste | 24-10, re-recorridas el 05-11 sobre el texto reparado |
| La letra del cuerpo del lector y su interlineado              | 05-11, sobre la versión servida (#816, #818)          |
| Las cinco microguías de C01, escena a escena                  | 12 y 13-11                                            |
| La landing F2.1                                               | aceptada el 16-10                                     |
| El control deshabilitado y la tarjeta de Mi Plan              | 08-11 y 17-11, sobre el elemento real                 |

---

## Parte B — el recorrido, pantalla por pantalla

### 01 · La landing

Lo primero que ve alguien que llega sin cuenta. **Aceptada el 16-10** (F2.1);
se incluye sólo para que el recorrido empiece donde empieza de verdad.

### 02–03 · Acceso y crear cuenta

Dos pantallas sobrias, centradas, con el mismo lenguaje que la landing. La de
registro pide nombre, correo y contraseña dos veces, y avisa de que la
contraseña «**sólo la puedes ver tú**».

> **Decisión tuya:** ninguna que yo vea. Si algo chirría, aquí es barato
> cambiarlo.

### 04–08 · El onboarding, cuatro pasos

Bienvenida → ¿qué te trae aquí? → ¿cómo te sientes ahora? → ¿cómo te llamamos?
→ tu primera lectura.

La recomendación cae en **_Emociones en Construcción_**, que es lo correcto: es
la única obra publicada, y el camino de respaldo funciona.

> ### ✅ DECIDIDA · las dos listas se mantienen
>
> **Capturas:** `05-onboarding-2-motivos.jpg` y `06-onboarding-3-animo.jpg`.
>
> Es la primera vez que le pedimos algo a alguien, y lo que elija aquí decide
> qué libro se le recomienda y con qué ánimo arranca su mapa. La recomendación
> era dejar las dos listas y revisar sólo la redacción si algo sonaba a
> formulario; **el propietario la mantuvo tal cual**, así que no se tocan.
>
> Conviene dejar escrito por qué la lista de ánimos no es una lista cualquiera:
> sus cinco niveles son la escala que alimenta el modelo afectivo, así que
> cambiar su número cambia la matemática, no sólo el copy.

### 09 · El tour, encima del lector

Al terminar el onboarding, la persona **aterriza directamente en el capítulo 1**
y el tour de cinco pasos aparece sobre él.

> ### ✅ RESUELTA · el libro se conserva, el tour espera en Inicio
>
> **Captura:** `09-tour-sobre-el-lector.jpg` — **anterior** al cambio.
>
> Lo que se veía, y era más concreto que «el tour tapa el texto»: el **paso 1
> de 5** decía «**Tu Inicio** · Este es tu punto de partida cada día» mientras
> la persona estaba mirando **el lector**. El tour describía una pantalla que
> no tenía delante, y encima cubría la apertura del capítulo.
>
> **Las dos mitades se separaron en vez de elegir una.** Quien elige un libro
> sigue aterrizando en su capítulo —es lo que pidió, y «Empezar a leer» lleva
> ahí— y el tour **se pospone hasta Inicio**, que es la pantalla de la que
> habla. No se cancela: `tourCompletedAt` sigue en nulo porque nadie lo vio ni
> lo saltó, y aparece la primera vez que esa persona pase por Inicio.
>
> Hay trinquete en los dos clientes, y la mutación que importa es la que
> comprueba que **no se marca como visto** mientras espera: posponer y
> cancelar se parecen mucho en el código y no se parecen en nada para quien
> nunca vuelve a ver el tour.

### 10 · El lector

Capítulo 1, con la tipografía serif ya correcta y el interlineado unificado.
Arriba: «Leer · Escuchar · **Ver — Próximamente**». Una tarjeta de Eco propone
un tema: «**El cuerpo sabe antes que la mente**».

**No aparece la pestaña de recorrido guiado**, y es correcto: esta cuenta no
está en el padrón. Eso es exactamente lo que verá una persona **antes** de B.

> ### ⚠️ CORREGIDA · «Escuchar» tiene material, pero **no para una cuenta FREE**
>
> **Mi nota del 18-11 era incorrecta, y su primera corrección también se quedó
> corta.** Escribí que «Escuchar» y «Ver» estaban ahí sin nada detrás; después
> lo retiré porque el podcast existe. Las dos veces faltaba el dato que
> decide. Medido contra el manifiesto y contra la ruta de reproducción, con una
> cuenta **FREE** sobre el artefacto servido:
>
> | Formato          | Estado                                      | ¿Puede reproducirlo una cuenta FREE? |
> | ---------------- | ------------------------------------------- | ------------------------------------ |
> | **Podcast**      | `AVAILABLE` — edición de demostración, 52 s | **No.** `403 · PRO_REQUIRED`         |
> | Audiolibro       | `COMING_SOON`                               | No — no existe                       |
> | Videoexplicación | `COMING_SOON`                               | No — no existe                       |
>
> Su política en el catálogo es `PRO_ONLY`, y el piloto entra como **FREE**.
> Así que **ese podcast no amplía el piloto** y **no sustituye el audio
> editorial definitivo**, que sigue sin existir: lo que hay es una
> demostración de 52 s detrás de un plan que el piloto no tiene.
>
> **Lo que el producto sí hace bien, comprobado:** el lector no deja caer el
> 403 en la cara de nadie. La pestaña muestra «**El podcast es parte de Pro ·
> Puedes seguir leyendo el capítulo completo**», que es honesto y, además, no
> ofrece contratar. **No hay nada que decidir aquí**; lo que hay es un hecho
> que conviene no volver a contar al revés.

> ### ✅ RETIRADA · el nombre del tema de Eco
>
> Que el tema que propone Eco coincida con el nombre de una experiencia
> archivada es una **coincidencia**, y una coincidencia no basta para justificar
> un cambio editorial sobre contenido aprobado. Se retira.

### 11 · Inicio

Saludo con su nombre, «INSIGHT DEL DÍA · generado por Eco», el **Mapa Emocional
vacío** (el hexágono sin puntas encendidas, que es lo correcto el primer día), y
cinco contadores a cero bajo el rótulo «**Tu progreso de comprensión**».

> ### ✅ RESUELTA · el rótulo ya no promete comprensión
>
> Los cinco contadores son **actividad** —reflexiones, insights, patrones,
> minutos de lectura, días seguidos— y el rótulo los llamaba «progreso de
> **comprensión**», volviendo a juntar aprendizaje y mundo interior en la
> primera pantalla que se ve. Ahora dice «**Tu actividad**».
>
> De paso, el chip de la fila de lectura del recorrido decía «**+ comprensión**»
> y dice «**+ evolución**», que es su destino real: leer alimenta Mi Evolución y,
> bajo V2, no toca ningún eje del mapa.
>
> La captura `11-inicio.jpg` es **anterior** al cambio y muestra el rótulo
> viejo; así se ve qué se corrigió.

### 12 · Biblioteca

Un resultado: _Emociones en Construcción_, **Jorge Quizamanchuro**, «Una guía
práctica desde adentro», 10 capítulos, 328 min. La autoría reparada se ve.

> ### ✅ RESUELTA · la biblioteca explica por qué hay una sola obra
>
> **Captura:** `12-biblioteca.jpg` — **anterior** al cambio.
>
> Un resultado, con buscador, filtros y espacio para una rejilla. Honesto, y
> también desconcertante: se lee como algo que falló al cargar. Ahora, bajo el
> contador, dice «**Por ahora una obra publicada. Estamos preparando las
> siguientes.**» — sin fecha y sin lista, que sería prometer un catálogo que
> todavía no existe.
>
> **La condición no es «este listado trae un resultado».** Una búsqueda que
> filtra hasta uno también trae uno, y el catálogo puede tener diez; decir ahí
> esa frase sería falso. Así que la nota sólo aparece en el catálogo entero,
> sin búsqueda y sin filtros. La regla y el texto viven en `@psico/types` para
> que web y móvil no acaben con dos criterios parecidos.

### 13–14 · Reflexiones y Eco, los dos muros de cifrado

Las dos piden la contraseña de la cuenta para derivar la clave en el
dispositivo, con «¿Por qué?», «**Tu contraseña nunca sale del dispositivo**» y
«Olvidé mi contraseña — usar frase de respaldo».

> ### ✅ RETIRADA · no son dos desbloqueos, es uno
>
> **Otra nota mía que no se sostiene al mirarla.** Parecen dos muros porque yo
> recorrí las dos pantallas **sin desbloquear ninguna**. En el producto el
> proveedor de claves está montado por encima de todo `/dashboard` y el mismo
> desbloqueo deriva las dos subclaves (`setEcoKey` en el mismo paso), así que
> **se desbloquea una vez y las dos pantallas quedan abiertas**. Y la casilla
> «Recordar en este dispositivo» viene marcada, de modo que tampoco se repite
> al volver.
>
> **No hay nada que decidir.**

### 15 · Mapa Emocional

La UI V2 tal como quedó: «**Lo que tú registras y confirmas… Nada entra a este
mapa sin ti**», «Sin porcentaje global, nada inventado», «Dinámica afectiva ·
EXPERIMENTAL» en estado «Reuniendo datos — 0 de ~8 registros», «Mis
resonancias» vacío, y «Tu actividad … son parte de tu recorrido, **no una
medida de tu mundo interior**».

> ### ✅ DECIDIDA · el vacío del primer día se mantiene
>
> La pantalla está casi toda vacía y dice cuatro veces que falta información.
> Es exactamente lo que el programa V2 se propuso: ningún eje al 50 %
> inventado, ningún porcentaje global, «Reuniendo datos» donde no hay señal.
>
> **El propietario la mantiene tal cual.** Cambiarla para que «se vea llena»
> sería deshacer el trabajo entero. Lo que sigue en pie es mirarla en la señal
> 6 del piloto —«qué no entendió, con sus palabras»—: si tres personas dicen lo
> mismo, eso es un dato y entonces se decide con él.

### 16 · Mi Evolución

«Cobertura de tu mapa **0 %**» con su explicación correcta («cuánta información
tienes, **no cómo estás**»), los contadores del trimestre, y una sección de
actividad de aprendizaje con «**0 audiolibros**» y «**0 podcasts** escuchados
hasta el final».

> ### ✅ RETIRADA · el contador no es el sitio donde se decide esto
>
> Escribí que audiolibros y podcasts «no existen todavía». Medido: el
> **podcast** del capítulo 1 está `AVAILABLE` —aunque es `PRO_ONLY`, así que
> una cuenta FREE recibe `403 · PRO_REQUIRED` al intentar reproducirlo—. En
> cualquier caso «0 podcasts escuchados hasta el final» es un dato correcto: la
> persona no ha escuchado ninguno, lo pudiera o no.
>
> Para el audiolibro y el video, que sí están `COMING_SOON`, **no se añade aquí
> ninguna etiqueta de disponibilidad**, y es deliberado: la disponibilidad es
> **por capítulo** y esta tarjeta recibe totales. Una nota global sería falsa
> para el podcast hoy y para los otros dos el día que ops suba un fichero. El
> sitio donde la disponibilidad se conoce es el lector, y allí ya se dice.

### 17 · Patrones IA — primer muro de pago

Pantalla entera ocupada por «**FUNCIÓN PRO** · Tu mapa emocional, sin descifrar
nada», con un botón «**Hazte Pro →**».

### 18 · Mi plan — precios y botones de compra

«Elige tu plan», con **Pro $7/mes** y **Pro Anual $59/año**, y dos botones:
«**Actualizar a Pro**» y «**Actualizar a Pro Anual**».

> ### ✅ RESUELTA · las compras ya no se ofrecen mientras estén cerradas
>
> Era la única que yo recomendaba resolver antes de invitar a una persona real,
> y está resuelta en código. Lo que cambia para quien entra:
>
> - **Mi plan** explica que las compras todavía no están disponibles y que su
>   plan actual sigue igual. Los importes se conservan como información, con el
>   aviso de la landing palabra por palabra: «Propuesta de precios · No
>   disponible para compra». Los botones «Actualizar a…» **no se renderizan** —
>   no se dejó un botón deshabilitado, porque un `disabled` sigue siendo una
>   llamada a contratar.
> - **El muro de Patrones** ya no ofrece «Hazte Pro →». Dice lo que es cierto y
>   enlaza a Mi plan sin que parezca el primer paso de una compra.
> - **El servidor rechaza** la creación de checkout por las dos rutas, con
>   `503 PURCHASES_CLOSED`, **antes** de crear un cliente en el proveedor,
>   guardar su identificador o llamar a su API.
>
> La duda que yo no podía despejar —si pulsar hacía algo— **ya no hace falta
> despejarla**: no hay nada que pulsar, y si alguien llegara por otra vía el
> servidor contesta que no. Tampoco se retiró ninguna credencial para
> conseguirlo: la puerta es una decisión propia (`BILLING_PURCHASES`), que
> **falla cerrada** y se abre con un sí explícito el día que tú lo decidas.
>
> Las capturas `17-patrones-muro-pro.jpg` y `18-mi-plan-precios.jpg` son
> **anteriores** al cambio: así se ve qué se corrigió.

---

## Parte C — las diez, cerradas

**Las diez están cerradas**, y no de la misma forma: cuatro cambiaron el
producto, dos las decidiste manteniéndolas, y cuatro se retiraron porque el
supuesto que las motivaba no se sostuvo al medirlo.

| #      | Pantalla             | Qué pasó                                                                                                                                               |
| ------ | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **1**  | Mi plan / Patrones   | **Resuelta en código.** No se ofrece contratar y el servidor rechaza el checkout por las dos rutas                                                     |
| **2**  | Inicio               | **Resuelta en código.** «Tu actividad», y «+ evolución» en el chip de la fila de lectura                                                               |
| **3**  | Mi Evolución         | **Retirada.** Un cero es un dato correcto; la disponibilidad no se decide en un contador de totales                                                    |
| **4**  | Lector · medios      | **Corregida con el dato.** El podcast existe y es `PRO_ONLY`: una cuenta FREE recibe `403 · PRO_REQUIRED`. El lector ya lo dice, y no ofrece contratar |
| **5**  | Lector · tema de Eco | **Retirada.** Una coincidencia no justifica un cambio editorial sobre contenido aprobado                                                               |
| **6**  | Tour                 | **Resuelta en código.** El libro se conserva; el tour espera en Inicio y **sigue pendiente** mientras                                                  |
| **7**  | Onboarding           | **Decidida: se mantienen** las dos listas                                                                                                              |
| **8**  | Biblioteca           | **Resuelta en código.** Una línea, sólo cuando el catálogo entero —sin filtros— tiene una obra                                                         |
| **9**  | Mapa                 | **Decidida: se mantiene** el vacío del primer día                                                                                                      |
| **10** | Cifrado              | **Retirada.** Es un solo desbloqueo; los vi los dos por no abrir ninguno                                                                               |

**Cuatro de las diez eran correcciones de mis propias notas**, no del producto:
las tres retiradas y la del podcast. Es lo que pasa al escribir una
observación desde una pantalla y comprobarla después contra el dato — y en el
caso del podcast hicieron falta **dos** correcciones, porque la primera se
quedó en «existe» sin preguntar quién puede reproducirlo.

### Lo que esto NO cierra

La **aceptación estética** sigue siendo tuya: lo medido aquí y en octubre es
tipografía, contraste y qué dice cada pantalla, no si el conjunto te gusta.
Y el **audio editorial definitivo sigue sin existir** — la demostración de
52 s detrás de Pro no lo sustituye.
