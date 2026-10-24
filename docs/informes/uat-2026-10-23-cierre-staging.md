# UAT acotada del cierre en staging — 2026-10-23/24

Qué se comprobó de la aplicación desplegada en staging después de integrar el
corte, y —con el mismo cuidado— qué **no** se comprobó y por qué. Es la
contraparte de la bitácora del 22-10, que cubría sólo el lector.

**Entorno:** `https://staging.feelverse.app` (Web) ·
`https://api-staging.feelverse.app` (API) · Coolify sobre el VPS de SyntaVera.
Las tres cajas servían la misma imagen, `725df576`, durante toda la UAT.

**Producción no se tocó.** Ni una petición de escritura, ni una lectura con
sesión, ni un despliegue.

---

## 1. Cuentas, y por qué estas

Las cuatro `demo-*@psico.test` que crea `seed-demo-users.mjs`. El dominio
`.test` está reservado por la RFC 2606: ningún correo puede salir de ahí
aunque algo intentara enviarlo. **No** se usó la cuenta personal de Jorge para
nada, ni de lectura ni de escritura.

| cuenta | plan | para qué sirvió |
|---|---|---|
| `demo-nuevo@psico.test` | PRO | lectura, Eco, mapa, modo guiado |
| `demo-estable@psico.test` | FREE | persistencia del lector, aislamiento |
| `demo-volatil@psico.test` | FREE | estados del mapa |
| `demo-recuperando@psico.test` | FREE | exportación de extremo a extremo |

**El límite de ingreso es de 5 por 15 minutos por IP**, así que cada cuenta
entró **una sola vez** y su token se reutilizó para todas sus comprobaciones.
Un lote mal planificado se queda sin la última afirmación, que es justo la que
suele importar.

---

## 2. Superficie pública, en el navegador

| Caso | Veredicto | Medido |
|---|---|---|
| Copy del modo guiado en la ficha | **PASS** | «El modo guiado está en preparación: sus microguías del capítulo 1 aún no están disponibles en la aplicación. La muestra de esta página sí funciona.» |
| «cinco microguías» · «probar una en esta página» | **PASS** | **ausentes** las dos |
| Tres obras con su disponibilidad | **PASS** | las tres aparecen; **dos** llevan «Aún no disponible» |
| Precios como propuesta, sin compra | **PASS** | etiquetados «propuesta»; **sin** CTA de lectura |
| Los dos temas | **PASS** | contemporary `#fafaf8` radio **24 px** · renaissance `#faf8f2` radio **6 px** — el radio cambia con el tema **por diseño** |
| Reflujo a 390 px y a 320 px | **PASS** | sin desbordamiento horizontal en ninguno |
| Objetivos táctiles | **OBSERVACIÓN** | 8 de 44 controles visibles miden 40–42 px de alto. Son enlaces del pie (350 px de ancho) y la marca: estilo previo de F2.1, no algo que este mandato tocara |

Los cuatro **ambientes** no se alcanzan sin sesión: la landing lleva tema y
ambiente en el mismo elemento y, sin sesión, sólo llega a Calma.

---

## 3. Por API, con cuentas sintéticas

Donde dice PASS hay un **recorrido funcional** comprobado, no sólo un código
HTTP correcto. La diferencia se marca cuando existe.

| Familia | Caso | Veredicto | Lo que se midió |
|---|---|---|---|
| acceso | ingreso con cuentas sintéticas | **PASS** | tres cuentas distintas a lo largo de la UAT, PRO y FREE |
| lector | abrir el cap. 1 de EEC | **PASS** | 188 bloques reales |
| lector | latido con el **id** del libro | **PASS** | `{"ok":true,"progressPct":85}` |
| lector | **salir y recuperar** | **PASS** | el progreso persiste entre sesiones: `progressPct` 85, `timeSpentSec` 1500 → 1560, `lastBlockId` escrito |
| lector | latido con el **slug** en vez del id | **OBSERVACIÓN** | responde `{"ok":true}` y **no escribe**. Es *soft-ack* por diseño ante una identidad que no resuelve; fallo de mi arnés, no del producto — pero un cliente que mande la forma equivocada recibe un «guardado» que no guardó |
| eco | error controlado | **PASS** | el fallo llega por el flujo SSE (`ECO_THREAD_NOT_FOUND`) con HTTP 200 y **sin** `delta`: no hubo llamada al modelo, luego **cero coste facturable** |
| eco | los hilos tras el error | **PASS** | intactos; nada a medias |
| exportación | admisión repetida | **PASS** | `429` con fecha de reintento — el enfriamiento de 30 días funciona |
| exportación | **de extremo a extremo** | **PASS** | ver §4 |
| exportación | exportación **ajena** | **PASS** | `404 DATA_EXPORT_NOT_FOUND` |
| mapa | leer no fabrica emoción | **PASS** | tras abrir el capítulo, **0/6** ejes con señal: siguen «reuniendo datos» |
| evolución | responde y trae sus contadores | **sólo respuesta correcta** | 200 con los contadores. **No** se comprobó que alguno subiera por esta lectura: eso es una respuesta correcta, no un recorrido verificado, y así queda anotado |
| disponibilidad | obra retirada, por **siete** puertas | **PASS** | las siete 404, incluida la nativa |
| aislamiento | una segunda cuenta | **PASS** | también 404; su mapa es el suyo |
| círculos | puerta del piloto | **NOT_AVAILABLE** | `503 CIRCLES_UNAVAILABLE` — rollout, no defecto |
| modo guiado | ejecución | **NOT_AVAILABLE** | ver §5 |

---

## 4. La exportación, de extremo a extremo

Es la única familia que atraviesa el **worker**, así que merece su propio
apartado: aquí no basta con que la API conteste.

La primera cuenta devolvió `429` porque ya había pedido una exportación el
2026-10-02. Eso **no** es un fallo: el enfriamiento de 30 días es la regla, y
el mensaje trae la fecha exacta de reintento. En lugar de forzarlo —borrar la
fila o mover el reloj habría sido falsificar un PASS— se usó la cuarta cuenta
sintética, que no tenía ninguna.

1. `POST /api/user/data-export` → **202** con `expectedAt`.
2. El **worker**, que es otro proceso, tomó el trabajo y lo terminó en
   **1,17 s**: la fila pasó a `READY` con su objeto en R2.
3. `GET /api/user/data-export/:id/download` → **200** con una URL **firmada**
   de R2, no una redirección: el endpoint entrega la URL para que el token
   bearer no viaje a un host que no tiene por qué verlo.
4. El archivo baja: **2 837 bytes** con las diez secciones declaradas —
   `_meta`, `user`, `profile`, `preferences`, `readerPreferences`,
   `notificationSettings`, `privacySettings`, `progress`, `subscription`,
   `guideSessions`.
5. **No contiene** `textCiphertext`, `textNonce`, `passwordHash` ni ningún
   token, y **sí** trae la nota de alcance que nombra lo que falta.
6. La exportación **de otra cuenta** responde `404`.

`RESEND_API_KEY` **no está configurada** en staging: el worker lo avisa al
arrancar y los correos se registran en consola. Para esta prueba es
conveniente —nadie recibe nada— y queda anotado como pendiente de entorno, no
como defecto. Tampoco están `GOOGLE_CLIENT_ID`, `VAPID_*` ni `SENTRY_DSN`; el
inventario completo, con lo presente y lo ausente, está en el §3 del
[roadmap](../ROADMAP.md).

---

## 5. El modo guiado, y la corrección de la UAT del 22-10

La bitácora del 22-10 concluyó «no hay ninguna microguía publicada ni en
borrador» contando filas de `ChapterExperienceVersion`. **Esa conclusión es
falsa**, y conviene decir exactamente por qué, porque el error es fácil de
repetir:

- El recuento mide **una sola** de las dos fuentes. El repositorio de
  experiencias es **híbrido**: con la tabla vacía,
  `GET /api/experiences/discovery/emociones-en-construccion/1` devuelve **un**
  recorrido, resuelto **en código**.
- Ese recuento **no habla de las cinco microguías** de la landing, que viven
  en el catálogo de **Guide** y **sí existen** para el capítulo 1
  (`eec-c1-teorias-como-lentes@1`, `…rostro-como-pista@1`,
  `…alarma-antes-del-relato@1`, `…emocion-informa-no-manda@1`,
  `…construida-no-significa-falsa@1`).
- La experiencia legado `eec-c1-cuerpo-antes-que-mente@1` no es ninguna de
  esas cinco y está **retirada para nuevos inicios**: su paso
  `CATALOG_PRACTICE` ancla a un encabezado que el manuscrito canónico ya no
  tiene. **Abrir el rollout no la haría ejecutable.**
- Lo que cierra el modo guiado hoy es el **rollout**: `GUIDE_ROLLOUT_MODE` en
  `off`, sin allowlist de piloto. `/api/guide/availability` responde
  `{"available":false}`, y ese campo describe **al actor que pregunta** — el
  modo efectivo es del entorno, no de la cuenta.

**Veredicto:** la ejecución guiada queda **`NOT_AVAILABLE`** para la cuenta
comprobada, y su UAT completa **no está verificada**. El rollout no se abrió y
no se publicó ninguna microguía: hacerlo para obtener un PASS habría sido
exactamente lo contrario de medir.

El copy nuevo de la landing —«el modo guiado está en preparación»— **es exacto
para lo medido** y no afirma ningún número. Se conserva.

---

## 6. El catálogo que hay, obra por obra

La landing nombra tres obras. La **base** del entorno comprobado tiene dos, y
conviene no confundir una página con un catálogo:

| Obra | Fila en `Book` | Publicada | Capítulos | Autoría en la fila |
|---|---|---|---|---|
| _Emociones en construcción_ | **sí** | **sí** | 10 | Jorge Quizamanchuro |
| _Familias ensambladas_ | **sí** | **no** | 3 | Jorge Quizamanchuro |
| _Parejas que perduran_ | **no existe** | — | — | — |

_Parejas_ queda **ausente** en el entorno comprobado. No se ingestó, no se
publicó y no se reparó nada suyo: no había fila que reparar, y crearla sería
inventar catálogo. La landing la muestra como «Aún no disponible», que es
exactamente lo que es.

Las tres capas de _Familias_ coinciden entre sí —fila no publicada, dos
ediciones con su revisión, siete puertas en 404— y sus tres capítulos y tres
unidades siguen **intactos**: retirada de la oferta, no borrada.

---

## 7. Lo que NO se verificó, y por qué

- **Revisión visual con sesión** — el lector y el panel en los dos temas × los
  cuatro ambientes. El control de credenciales de esta sesión deniega escribir
  una contraseña en el navegador, y las vías sin secreto están cerradas. **No
  se eludió.** `NOT_VERIFIED`; queda para una preparación de QA alojada que lo
  autorice expresamente.
- **Entrega semanal completa** (digest y nudge). Los dos crons **se ejecutaron
  sin trabajo**: `candidates=0`, `sent=0`, porque a la hora UTC de la
  comprobación ninguna cuenta cumplía su condición local. Eso acredita que el
  planificador corre y que el filtro por huso se evalúa; **no** acredita una
  entrega completa. No se tocó el reloj del servidor ni se generaron
  comunicaciones reales.
- **Dúo/Círculos** — `503 CIRCLES_UNAVAILABLE`. Es su puerta de rollout, no un
  defecto, y abrirla queda fuera de este mandato.

---

## 8. Los 188 bloques, y por qué la otra bitácora dice 376

La UAT del 22-10 anotó «capítulo 1 con 376 bloques». Aquí dice 188, y la
diferencia no es una discrepancia que haya que dejar en el aire:

| Fuente | Filas del cap. 1 de EEC |
|---|---|
| `ChapterBlock` (legado) | **188** |
| `ContentBlock` de la unidad nativa equivalente | **188** |

376 es **exactamente la suma**, y que las dos fuentes sean la misma lectura no
se deduce de que los números coincidan: los **188** `ContentBlock` de esa
unidad llevan su `legacyBlockId` apuntando a los 188 `ChapterBlock` del
capítulo 1. Es la misma lectura, anclada fila a fila.

Así que el recuento original contó dos veces lo mismo, una vez por fuente — el
mismo error de fuente única/doble que el diagnóstico del modo guiado, sólo que
en espejo: allí se midió media verdad, aquí el doble. **El lector sirve 188
bloques**, y la conclusión de aquella fila («de sobra») se sostiene igual. La
corrección quedó también en la bitácora del 22-10, fechada.

---

## 9. Dos falsos positivos, escritos para no volver a investigarlos

- El latido con el **slug** en lugar del id responde `{"ok":true}` sin
  escribir. Es el *soft-ack* de diseño; mi arnés mandaba la forma equivocada.
- Los errores de Eco llegan por el **flujo SSE con HTTP 200**, no como código
  de estado. Esperar un 4xx en la respuesta HTTP da un falso fallo.
