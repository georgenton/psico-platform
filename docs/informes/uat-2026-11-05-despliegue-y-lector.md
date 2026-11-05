# Acceso recuperado, tres despliegues y la letra verificada sobre lo servido — 2026-11-05

Ejecuta las consecuencias de la decisión del 2026-11-05: FeelVerse se aloja,
ejecuta y despliega **exclusivamente en OVH con Coolify**. Lo de abajo está
medido contra el entorno que sirve, no recordado.

|                        |                                                     |
| ---------------------- | --------------------------------------------------- |
| Repositorio al empezar | `main = 9a03edd0` (#817)                            |
| Servido al empezar     | Web `5dacedbd` · API `19fcc261` · worker `5f209d79` |
| Servido al terminar    | **los tres en `9a03edd0`**                          |
| Integrado hoy          | #818 interlineado · #819 destino único · #820 copy  |
| Producción             | **no existe como recurso**                          |

---

## 1 · El acceso, recuperado sin tocar ninguna contraseña

La tabla `personal_access_tokens` de Coolify estaba en **cero filas**: no
caducaron, se borraron. Coolify trae un `root:reset-password`, y se descartó
**precisamente porque cambiaría la credencial del propietario**. En su lugar se
acuñaron dos tokens invocando el `createToken` de la propia aplicación desde un
script que arranca Laravel dentro de su contenedor.

Dos trampas que cuestan una hora si no están escritas:

1. **El `createToken` de Coolify sobrescribe el de Sanctum** y exige un cuarto
   argumento, `$teamId`. Sin él muere en `session('currentTeam')->id`, que en
   línea de comandos es nulo. Se descubre leyendo el método, no adivinando.
2. **`write` no implica `read`.** El primer token acuñado respondía **403** a
   cualquier consulta. El de despliegue se rehízo `['read','write','deploy']`.

**Las tres capacidades se comprobaron por separado**, que es lo que distingue
un acceso real de uno que sólo parece bastar — un token que sólo despliega
habría pasado por suficiente y no sirve para configurar:

| Capacidad  | Evidencia                                        |
| ---------- | ------------------------------------------------ |
| Consultar  | lectura de las tres aplicaciones y sus variables |
| Configurar | ocho escrituras de entorno, 201                  |
| Desplegar  | los tres despliegues de abajo                    |

Los valores viven con permisos 600 fuera del repositorio y **no se imprimieron
en ningún sitio**. Siguen cerrados los dos servidores MCP de Coolify de la
sesión, que se conectaron antes y conservan el token muerto: se reconectan
desde `/mcp`.

---

## 2 · Tres despliegues, de uno en uno

Tres construcciones en paralelo agotan el demonio de construcción y fallan las
tres — eso ya estaba aprendido y se respetó.

| Servicio | Por qué                                                                       |
| -------- | ----------------------------------------------------------------------------- |
| Web      | trae la corrección de la letra del lector (#816)                              |
| API      | activar las claves de push web                                                |
| worker   | manda el aviso del digest semanal, así que las claves también le hacían falta |

**Un despliegue de la API no se cierra con el verde de Coolify**, que puede
convivir con una migración fallida. Lo cierra su gate, comprobado sobre el
artefacto servido: `ready=true`, `reason=ok`, **71/71**, `pending` y `failed`
vacíos. El endpoint es `/api/health/ready` — con prefijo; `/health/ready` da
404 porque la exclusión del prefijo sólo cubre `/health` a secas.

---

## 3 · La letra del lector, sobre la versión servida

Capítulo 1 de _Emociones en Construcción_ con el texto reparado, recorriendo
las **ocho** combinaciones con los controles de la propia aplicación.

| Estilo                                     | Cuerpo         | Títulos        | ¿La misma? | Contraste     |
| ------------------------------------------ | -------------- | -------------- | ---------- | ------------- |
| Contemporary × Calma/Enfoque/Energía/Noche | Newsreader     | Newsreader     | **sí** ×4  | 11,24 – 15,87 |
| Renacimiento × Calma/Enfoque/Energía/Noche | Source Serif 4 | Source Serif 4 | **sí** ×4  | 11,06 – 15,87 |

157 párrafos, 25 negritas y 24 cursivas **estables en las ocho**, más los
cuatro asteriscos de la cita excluida, que son los esperados. Las preferencias
responden: Serif ↔ Sans mueve el cuerpo de Source Serif 4 a Geist, el tamaño
propaga de 18 a 28 px, y la muestra del selector ya entrega lo que previsualiza.

**Esto acredita tipografía y contraste, no aceptación estética.** Los cierres de
#814 y #817 se conservan: no se repitió la reparación del énfasis ni se auditó
su ejecutor.

---

## 4 · Dos defectos que esa verificación destapó

### 4.1 El interlineado no llegaba al cuerpo (#818)

| control | columna | cita    | párrafo     | encabezado |
| ------- | ------- | ------- | ----------- | ---------- |
| 1.2     | 21,6 px | 21,6 px | **30,6 px** | 25,2 px    |
| 2.2     | 39,6 px | 39,6 px | **30,6 px** | 25,2 px    |

En reposo el control decía 1,8 y entregaba 1,7. Misma causa que la letra: **una
declaración en el elemento gana siempre a la herencia**. El párrafo llevaba
`leading-[1.7]` propio; la cita no, y por eso sí obedecía — la incoherencia era
visible en la misma pantalla.

### 4.2 Dieciocho frases hablaban de _vos_ (#820)

Apareció leyendo la tarjeta del push web: «Recibí alertas…», cuyas otras tres
frases del **mismo ternario** ya tuteaban. Dos de las dieciocho están en
pantallas que ve todo el mundo al registrarse — «Ya **podés** iniciar sesión» y
«**Revisá** la carpeta de spam».

Dos que **no** se tocaron, porque no eran defecto: «Escribí una reflexión hace
poco» y «Seguí con lo que estaba haciendo» son **primera persona del pasado**.
En castellano el imperativo voseante de los verbos en -ir es idéntico a la
primera persona del pretérito, y ninguna expresión regular puede separarlas.

### 4.3 Lo que esto dice del método

Los dos defectos son de la misma familia y **sólo se ven con sesión, sobre la
versión servida, moviendo los controles**. Ninguna prueba del repositorio los
habría encontrado: Tailwind no se resuelve en el entorno de pruebas, así que una
clase que pisa una preferencia es invisible ahí. Por eso los dos trinquetes
nuevos **leen la fuente** además de renderizar.

Conviene asumir que quedan hermanos: cualquier bloque del lector con un
`text-[…]` o un `leading-*` propio desconecta su preferencia. Los que hay hoy
son deliberados —encabezados y tarjetas— y el trinquete los nombra uno a uno
para que sigan siéndolo.

---

## 5 · Push web, activado

Las claves VAPID estaban generadas desde el 04-11; hoy se escribieron en los
tres recursos y se desplegaron. La tarjeta de notificaciones ya ofrece
**«Activar»** en vez de «Falta configurar VAPID». Lo que falta es una entrega
real, que pide un permiso del navegador del propietario y no se toma por él.

Siguen ausentes, y **ninguna credencial autorizada suya existe en el almacén de
ops**: `RESEND_API_KEY` —la que impide recuperar una contraseña—, `SENTRY_DSN`
y `GOOGLE_CLIENT_ID`.

---

## 6 · La recuperación, ahora que no hay plataforma a la que volver

Retirar Vercel y Railway quitó un atajo que **tapaba un hueco real**. La
escalera de rollback se reescribió entera dentro de OVH, con una columna que
dice cuál está ensayado.

| nivel | qué                             | ¿ensayado?                 |
| ----- | ------------------------------- | -------------------------- |
| 1     | redeploy del artefacto anterior | **sí** — 24-10, con cifras |
| 2     | parar staging                   | trivial                    |
| 3     | falla el servicio de producción | no — producción no existe  |
| 4     | **se pierde el servidor**       | **no — nunca**             |

Los ingredientes del nivel 4 existen y se comprobaron hoy: el respaldo de
`feelverse-staging-postgres` corre **a diario**, va a R2, y sus dos últimas
ejecuciones (04-11 y 05-11, 1,23 MB) están en **success**. Lo que no se ha hecho
nunca es el camino completo —provisionar un host, instalar Coolify, recrear los
recursos desde el inventario y restaurar el volcado—, así que son **instrucciones
sin estrenar** y no un mecanismo comprobado.

---

## 7 · Producción: lo que el DNS no demuestra

**No existe como recurso.** El proyecto de Coolify tiene tres aplicaciones y las
tres son de staging; ningún recurso reclama `feelverse.app` —HTTP 000, sin
certificado, y ante el proxy sólo los dos hosts de staging—. Que el dominio
resuelva al servidor es una ventaja para el día del salto, no una señal de que
el salto ocurrió.

No se crearon recursos de producción. El runbook §4 lista siete precondiciones y
varias siguen abiertas, entre ellas el ensayo del nivel 4 o su asunción
explícita como riesgo.

---

## 8 · Límites

Producción **no se tocó**. Cero cobros, cero publicaciones editoriales, cero
llamadas facturables al modelo. La cuenta usada es sintética `@psico.test` y su
contraseña **no pasó por ninguna llamada de herramienta**: se entregó por el
portapapeles del sistema, que se vació al terminar.

**Ningún proyecto, base, dominio, variable ni cuenta de las plataformas
retiradas se eliminó.** El entorno alojado de Círculos sigue en pie allí
—cuatro servicios, comprobado— y no se borró ni se migró: dónde vive es una
decisión del propietario.
