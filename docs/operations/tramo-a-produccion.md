# Ficha de decisiones de lanzamiento

> **Corte del 2026-11-24.** Es la **única** lista vigente de lo que espera una
> decisión tuya; sustituye a la del 23-11. Las puertas completas viven en
> [runbook §4](../deploy/coolify-runbook.md), y qué cambia respecto a la lista
> anterior está en §8.

## 0 · Qué está hecho, qué espera y qué no ha empezado

| Qué                                             | Estado                                                                                                                                                      |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Correo, recuperación y reenvío**              | ✅ terminado, comprobado en staging y aceptado (#868, #870, #874). No se repite                                                                             |
| **Los catorce ajustes previos a la aceptación** | ✅ integrados y **servidos en staging** (§2.1). La **aceptación estética sigue pendiente**: autorizar los ajustes no la cerró; la cierra mirar el resultado |
| **Ayuda en crisis sin cuenta**                  | ✅ servida en [`/ayuda`](https://staging.feelverse.app/ayuda). No esperaba tu decisión estética                                                             |
| **Sentry**                                      | ✅ preparado y ensayado en local (§2.3) · ❌ **sin activar**: no hay DSN en ningún proceso                                                                  |
| **Decisiones pendientes**                       | las de §1                                                                                                                                                   |
| **Producción**                                  | no empezada: no existe como recurso                                                                                                                         |

## 1 · Las decisiones

| #   | Decisión                                            | Recomendación                                                                    | Lo que se ejecuta después                                                | Condiciona         |
| --- | --------------------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ------------------ |
| 1   | **Aceptación estética** del resultado               | mirar la página y, si te convence, «acepto el conjunto»                          | se cierra la puerta 1                                                    | producción         |
| 2   | **Ensayo de recuperación (nivel 4)**                | autorizar **hasta US$ 15 en total**, con todo incluido (§2.2)                    | una instancia de 24 h, su evidencia y el cierre de los recursos          | producción         |
| 3   | **Sentry**: dueño y región                          | organización de Syntavera; la región la eliges tú y después no se cambia         | dos proyectos, los DSN y cuatro eventos controlados                      | producción         |
| 4   | **Aviso de respaldo**: destino y alcance            | `soporte@syntavera.dev`, seis avisos, sabiendo que es de todo el servidor        | canal en Coolify y prueba de recepción                                   | producción         |
| 5   | **Piloto B**                                        | sí: tres personas, de una en una, dos semanas cada una                           | nada hasta la 6                                                          | piloto             |
| 6   | **Primera persona** y el envío a su dirección       | después de la 5 y de la 7                                                        | los siete pasos de [la incorporación](piloto-b-primera-incorporacion.md) | piloto             |
| 7   | **Terapia**: dejarla visible u ocultarla            | **ocultarla** hasta que haya profesionales reales (§2.8)                         | quitarla del menú y de las rutas; un cambio pequeño                      | piloto             |
| 8   | **Líneas de ayuda**: quién las valida y cada cuánto | nombrar a alguien; hoy dos pantallas dan líneas distintas (§2.8)                 | unificar el aviso de Eco con el catálogo validado                        | apertura pública   |
| 9   | **Textos públicos**: privacidad, términos, contacto | revisar los tres borradores y aportar los datos que faltan (§2.7)                | revisión profesional, páginas y enlaces del pie                          | exposición pública |
| 10  | **Alcance de salida**                               | mantener las tres obras; una salida por etapas es una propuesta aparte (§2.6)    | según lo que decidas                                                     | producción         |
| 11  | **Vínculo del Dúo**                                 | `eec-c1-emocion-informa-no-manda@1`                                              | publicar `@3`, archivar `@2` y mover la elegibilidad                     | Dúo                |
| 12  | **Materiales**: las otras dos obras y primer audio  | aportarlos cuando existan; el audio **no** cambia los derechos de Gratuito o Pro | ingesta, o R2 y fila de audio                                            | catálogo y medios  |
| 13  | **Precios**                                         | fijar la oferta sin abrir cobros (§2.6)                                          | copy de la landing y de Mi plan                                          | cobros             |

Las autorías, la sinopsis de _EEC_, la nota de C01, la publicación de las cinco
microguías y las diez decisiones visuales **están decididas** y no se preguntan
otra vez. **B cuenta una sola vez**, en las filas 5 y 6. El acceso con Google
queda fuera de la primera versión sin que haya que decidir nada.

## 2 · Cada una, con lo que hace falta para decidir

### 2.1 · Aceptación estética

**→ [Las pantallas, para mirarlas y responder](https://claude.ai/artifact/56P67k18svei385pZ2Whn3)**
— página privada, recapturada sobre lo que sirve staging: Web `46878ca5`, API y worker `31c843f4`. Abajo está «acepto el conjunto».

Los trece ajustes recomendados y la revisión de Mi plan, uno por uno:

| #   | Asunto                      | Resultado                                                                                                                   |
| --- | --------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| 1   | Privacidad del Diario y Eco | corregido en registro, acceso, Seguridad, las rejas y el componente común; la frase de Eco es la del tour, compartida       |
| 2   | Mapa y Evolución            | corregido; «Esto alimenta tu Mapa» tras el check-in se acreditó y se queda                                                  |
| 3   | Sugerencias de Inicio       | corregido en los dos estados: son reglas, y ahora lo dicen                                                                  |
| 4   | Primer libro                | corregido contra los diez capítulos canónicos; explorar se acreditó                                                         |
| 5   | Mi plan                     | corregido: cada línea tiene una regla del servidor detrás; lo demás, retirado                                               |
| 6   | Cabecera de la portada      | corregido: una línea de 320 a 1920 px                                                                                       |
| 7   | Título de Patrones          | corregido: de 1,05–3,02 a 7,03–7,10 de contraste                                                                            |
| 8   | Caja de Eco                 | corregido: siempre dentro de la pantalla                                                                                    |
| 9   | Nombre e iniciales          | corregido; el correo ya no aparece en el armazón                                                                            |
| 10  | Separador «o»               | corregido: sólo si hay otra forma de entrar                                                                                 |
| 11  | Portada del mismo libro     | corregido: una sola fuente                                                                                                  |
| 12  | Hitos pendientes            | corregido. **Pendiente y dicho en pantalla:** los tres de días seguidos no se pueden conseguir porque nadie cuenta la racha |
| 13  | Lenguaje de la ayuda        | corregido                                                                                                                   |
| 14  | Ayuda sin cuenta            | corregido: pública, enlazada desde portada, acceso, bienvenida, panel y el aviso de crisis de Eco                           |

Se conservan las dos preferencias opcionales —el hueco de Inicio y los botones
verdes y morados— y las diez decisiones cerradas.

**Además, un defecto encontrado al redactar la privacidad y corregido (#878):**
cerrar sesión desde Perfil dejaba en el navegador la llave del diario y la
sesión viva en el servidor; y la llave guardada no decía de qué cuenta era.

**Y tres remates que salieron al recapturar (#884):** en el teléfono, los títulos de
once pantallas iban pegados a la derecha; el aviso de la caja de Eco se cortaba; y
«Es lo último que leíste» aparecía bajo el capítulo que aún no se ha leído.

### 2.2 · Ensayo completo de recuperación — nivel 4

**Qué se contrataría**

| Componente                  | Elección                                                                                        | Precio sin impuestos                                                                           |
| --------------------------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Proveedor                   | OVHcloud Public Cloud. **La filial y sus condiciones se confirman en la cuenta o en el pedido** | —                                                                                              |
| Región                      | BHS5 (Beauharnois)                                                                              | —                                                                                              |
| Instancia                   | `d2-8`, 4 vCore y 8 GB, por horas, con 50 GB locales incluidos                                  | US$ 0,0439/h en la lista mundial ([precios](https://www.ovhcloud.com/es/public-cloud/prices/)) |
| IPv4                        | _Basic Public IP_, ligada a la instancia                                                        | US$ 0,00319/h                                                                                  |
| Tráfico                     | entrante y saliente                                                                             | incluido                                                                                       |
| Volúmenes, copias, IP extra | ninguno; las instantáneas automáticas vienen activadas y se desactivan                          | 0                                                                                              |

**Un único máximo: US$ 15 en total, todo incluido.** Es una **propuesta**, no una
autorización recibida.

| Qué cuenta dentro del máximo | Cuánto                                                                                                                                                                                                                                                                                |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Consumo**                  | US$ 1,13 por 24 h, que es lo previsto; US$ 2,26 si hay que repetirlo; US$ 7,91 si quedara una semana encendida por error                                                                                                                                                              |
| **Crédito comprado**         | si el alta exigiera US$ 10 por adelantado, cuentan **enteros**: OVH no los reembolsa y caducan a los 13 meses ([guía](https://docs.ovhcloud.com/en/guides/account-and-service-management/managing-billing-payments-and-services/add-cloud-credit-to-project)). El consumo sale de ahí |
| **Impuestos**                | el que muestre el pedido. Se reserva un 20 % porque el tipo para Ecuador no está acreditado                                                                                                                                                                                           |
| **Peor caso previsto**       | US$ 10 de crédito + 20 % = **US$ 12**; el resto es margen                                                                                                                                                                                                                             |
| **Retenciones**              | **no son gasto**: un cargo de comprobación de la tarjeta que se devuelve o se abona. Su cuantía no está acreditada; si no vuelve, cuenta dentro del máximo                                                                                                                            |

**A favor, por confirmar en la cuenta:** la primera vez que se activa un proyecto
de Public Cloud, OVH ofrece en su lista mundial
[US$ 200 de crédito de prueba](https://www.ovhcloud.com/en/public-cloud/free-trial/),
válido un mes, si la cuenta nunca tuvo uno. Exige un método de pago y va sin
impuestos. Si aplica, el ensayo no consumiría dinero.

Antes de contratar se te enseña el pedido con su total real. Si pasa del máximo,
si la moneda no es dólar, si la filial no es la esperada o si aparece un cargo no
previsto, **se para y se pregunta**.

**Duración, qué se ensaya, vigilancia y cierre**, sin cambios: 8 horas de trabajo
y 24 de tope; Ubuntu 24.04 → Coolify → PostgreSQL `pgvector/pgvector:pg18` por
digest, Redis, API, worker y Web → restaurar la copia de R2 → la puerta de
aislamiento (`scripts/rehearsal-isolation-check.mjs`) → arrancar, entrar, abrir
un capítulo, comprobar el Diario cifrado y `ready`. No toca el DNS ni el
servidor vivo. OVH no ofrece tope duro: alerta en US$ 5 y lecturas a las 4, 12,
20 y 24 h; apagar no detiene el cobro, sólo **borrar**.

1. Evidencia al Mac **antes** de destruir.
2. Borrar la instancia; comprobar que la IP se fue con ella.
3. Comprobar que no queda volumen, instantánea, copia ni IP flotante.
4. Retirar la clave SSH temporal.
5. Leer el consumo final y borrar el proyecto.
6. Revisar la factura del mes siguiente.

### 2.3 · Sentry: preparado, sin activar

**Qué sale y qué no.** El evento se **reconstruye** desde una lista cerrada, y hay
una segunda puerta en el transporte que sólo deja pasar errores. Sin trazas, sin
sesiones, sin grabaciones, sin capturas, sin adjuntos. Detalle en
[el README](../../apps/api/src/observability/README.md).

Ensayo con un receptor local, señuelos aleatorios y los artefactos construidos y
ejecutándose, repetido sobre el candidato que se integró:

| Superficie        | El error útil llega | Señuelos que salen | Transacciones, sin y con traza entrante | Sin DSN                |
| ----------------- | ------------------- | ------------------ | --------------------------------------- | ---------------------- |
| API               | sí                  | 0 de 32            | 0 de 60 · 0 de 60                       | 0 conexiones ajenas    |
| Worker            | sí                  | 0 de 32            | 0 en 60 trabajos                        | 0                      |
| Servidor de Web   | sí                  | 0 de 18            | 0 de 60 · 0 de 60                       | 0                      |
| Edge (middleware) | sí                  | 0 de 18            | las mismas peticiones                   | 0                      |
| Navegador         | sí                  | 0 de 18            | 0 de 60 · 0 de 60                       | el SDK ni se construye |

Con el código anterior, el mismo ensayo dejaba salir 29 de 32 señuelos en la API
y 18 de 32 en el worker, y **60 de 60 transacciones** con traza entrante. El
muestreo es probabilístico y los ensayos son finitos: se afirma lo que dice la
tabla, no más. **Hoy no hay DSN en ningún proceso; eso no dice nada de épocas
anteriores.**

> **Dos frases de la ficha anterior eran inexactas.** «Los errores salen limpios,
> salvo la IP» no se sostiene: mensaje, causa, migas y contextos también salían.
> Y `tracesSampleRate: 0` **no** era el arreglo: en la versión instalada puede
> prevalecer la decisión que trae la petición.

**Para activarlo:** `SENTRY_DSN` en API, worker y Web, y `NEXT_PUBLIC_SENTRY_DSN`
**en la construcción** de Web, porque se incrusta; después, cuatro eventos
controlados —API, worker, servidor y navegador— y buscar los señuelos en cada
uno. En el proyecto hay que activar «Prevent Storing of IP Addresses»: la
conexión revela la IP aunque el evento no la lleve. No se ensayó contra un Sentry
real.

**Lo mínimo que hace falta de ti:** entrar en `sentry.io` con la cuenta dueña y
decir **Estados Unidos o Unión Europea**. No hace falta que me pases ningún DSN.

### 2.4 · Aviso de respaldo

El detector corre solo cada día a las 06:10 UTC y lleva registro, pero **no
avisa**: los canales de Coolify están desactivados.

**Propuesta.** Correo de Coolify a **`soporte@syntavera.dev`**, con seis avisos
—respaldo fallido, disco, servidor inalcanzable, límite de reinicios, limpieza
fallida y tarea programada fallida—. Transporte: una **clave de Resend propia de
Coolify**, sólo de envío.

| Conviene saberlo antes de autorizar                                                                                                       |
| ----------------------------------------------------------------------------------------------------------------------------------------- |
| El canal es **del equipo de Coolify**: avisará de los siete proyectos del servidor, no sólo de FeelVerse                                  |
| **No pasa por `EMAIL_ALLOWLIST`**: lo manda Coolify. Autorizar una dirección en la lista del producto no autoriza este canal, ni al revés |
| Cubre respaldos **fallidos**; uno que no llegó a ejecutarse lo ve el detector, y que avise por correo es una línea más en el mismo canal  |
| Si la caja se apaga no avisa nadie: los dos viven dentro. Para producción hará falta un vigía externo                                     |

**Lo mínimo que hace falta de ti:** el sí al destino y al alcance, y **pegar una
vez** la clave en Coolify. **No se activa en esta tanda.**

### 2.5 · Piloto B — dos autorizaciones

1. **Aprobar B**: sí o no a la propuesta de [piloto §8](../product/piloto-minimo.md).
   Recomendación: **sí**.
2. **Autorizar a la primera persona y el envío a su dirección.** No se deduce de
   la primera, y el dato que falta es uno: su dirección exacta, con su
   consentimiento, por canal directo.

La invitación y los siete pasos están en
[piloto-b-primera-incorporacion.md](piloto-b-primera-incorporacion.md). Ya puede
decir que las líneas de ayuda se abren sin cuenta, porque ahora es cierto.
Recomiendo ocultar Terapia (fila 7) **antes** de invitar a nadie.

### 2.6 · Alcance, editorial y precios

- **Alcance (10).** El vigente son las **tres obras**; hoy se lee una. Salir con
  una sola **no está aprobado**. Si quieres esa opción, la propuesta sería salir
  por etapas: _EEC_ primero, diciéndolo en la portada, y las otras dos con su
  propio acto editorial. Es una alternativa a decidir, no la que se ejecuta.
- **Dúo (11).** Sucesor propuesto: `eec-c1-emocion-informa-no-manda@1`.
- **Materiales (12).** Cuando existan. Aportar un audio **no** modifica por sí
  solo lo que se lee o se escucha en Gratuito y en Pro: eso son derechos, y se
  deciden aparte.
- **Precios (13).** No abre cobros: tienen sus seis condiciones y una variable que
  falla cerrada. Hay una rareza que conviene resolver al fijarlos: Eco gratuito
  permite 10 mensajes **al día** y Pro, 200 **por periodo**.

### 2.7 · Textos públicos

Tres borradores —privacidad, términos y contacto— escritos **desde el código**,
con cada afirmación atada a su fichero, en Notion (privado, hijos de FV-47). **No
se publican**: son para tu revisión y, después, la de un profesional. No llevan
identidad, correos, plazos ni garantías inventados: los huecos van numerados.

**Tienen que estar resueltos antes de exponer públicamente el producto**, o debe
existir una restricción real de acceso mientras se prepara.

| Lo que falta de ti                                                                                                   |
| -------------------------------------------------------------------------------------------------------------------- |
| Responsable: nombre o razón social, identificación, domicilio y contacto; y si hay delegado de datos                 |
| Un canal público de contacto y de privacidad, quién lo atiende y en cuánto tiempo. Hoy no hay ninguno                |
| Edad mínima, país y ley aplicable                                                                                    |
| Condiciones contratadas con Anthropic, Voyage, OpenAI, Resend, Cloudflare y OVH: retención, entrenamiento y regiones |
| Plazos de conservación de los registros de acceso, los respaldos y las cuentas inactivas                             |

**Al escribirlos salieron defectos que los textos no pueden disimular**, y ninguno
se toca en esta tanda: la baja de cuenta no se puede cancelar desde la app y
muestra mal la fecha; el cambio de correo envía un enlace que no termina; tres
interruptores de privacidad no tienen efecto; la descarga se anuncia como ZIP y
es un JSON parcial; no hay pantalla para borrar una conversación con Eco; cambiar
la contraseña deja ilegibles los mensajes anteriores a Eco; y la baja conserva
correo, IP y navegador en el registro de accesos. Están listados con fichero y
línea junto a los borradores.

### 2.8 · Terapia y las líneas de ayuda

- **Terapia está a la vista** en el menú de cuenta, y el documento del piloto
  decía que iba detrás de su interruptor: **no es así**. En staging hay **seis
  fichas de profesionales, las seis de demostración y con «licencia verificada»**,
  y reservar no pasa por la puerta que cierra las compras. Recomiendo ocultarla.
- **Dos pantallas dan líneas distintas**: el aviso de crisis de Eco enseña
  «1800-4-SALUD», y el catálogo —el de `/ayuda`— da 911 Salud Mental, CETAD y
  Teléfono de la Amistad. Ningún código puede decir cuáles responden: hace falta
  alguien que las valide y las revise cada cierto tiempo.

## 3 · Tres resultados distintos, y sólo uno está hecho

| Resultado                                         | Estado                                                                                                                                                                                                                                                       |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Imágenes archivadas, íntegras y cargadas**      | ✅ 2026-11-23, 20:25–20:30 UTC: suma `5ba17422…`, 25 objetos internos, `c19358a4` (id `90f5aa31…`) y `6fe5ff3f` (id `6e06f9b4…`). El archivo y su suma siguen fuera de Docker, **en el mismo servidor**. La limpieza diaria puede llevarse la imagen cargada |
| **Reversión del servicio** a una imagen anterior  | ❌ **no ensayada**                                                                                                                                                                                                                                           |
| **Recuperación completa** tras perder el servidor | ❌ pendiente de su propio ensayo (§2.2)                                                                                                                                                                                                                      |

## 4 · El margen del servidor

Se revisa **antes** de cada tanda de construcciones, no después.

**El 89 % del 23-11 no era crecimiento.** La limpieza diaria de Coolify (05:00 UTC,
00:00 de Quito) vuelve cada noche a 54–59 %; sólo los días con varios despliegues
suben a 84–89 %. Lo que sí sube es el suelo: de 54 % el 10-11 a 58 % el 24-11.

| Momento (UTC)                                | Ocupado | Libre | Qué pasó                                                                         |
| -------------------------------------------- | ------- | ----- | -------------------------------------------------------------------------------- |
| 24-11, antes de las 05:00                    | 89 %    | 11 GB | **no** había margen para tres servicios: se esperó, sin podar nada               |
| 24-11, 05:00:07, tras la limpieza automática | 58 %    | 41 GB | se conservó la imagen en servicio y dos anteriores por aplicación, y el archivo  |
| 24-11, 05:11, API desplegada                 | 71 %    | 29 GB | 12 GB: la primera construcción repuebla la caché                                 |
| 24-11, 05:18, worker desplegado              | 82 %    | 19 GB | 10 GB                                                                            |
| 24-11, 05:26, Web desplegada                 | 86 %    | 14 GB | 5 GB. Mínimo durante la construcción: 14 GB                                      |
| 24-11, 05:58, Web con #884                   | 84 %    | 16 GB | al empezar, la caché se recortó sola (14 → 22 GB libres) sin limpieza de Coolify |

**Quién ocupa:** cuatro imágenes nuevas, unos 11 GB; y la **caché de construcción**,
que pasó de unos 4 GB a **21 GB** en una mañana. Al empezar la cuarta construcción
se liberaron 8 GB sin que Coolify limpiara nada y con todas las imágenes en su
sitio, así que lo razonable es que la caché se recorta sola al crecer; no encontré
un registro que lo diga, y no cuento con ello para planificar. El archivo de recuperación, su suma y
los otros seis proyectos, intactos: 43 contenedores antes y después.

| Intervención                                                  | Qué consigue                  | Impacto                                                      | ¿Hace falta tu sí?                                        |
| ------------------------------------------------------------- | ----------------------------- | ------------------------------------------------------------ | --------------------------------------------------------- |
| **Ninguna:** desplegar después de las 05:00 UTC, tres por día | margen de sobra en staging    | ninguno                                                      | no; es lo que se hace                                     |
| Limitar el tamaño de la caché de construcción de Coolify      | evita el pico de 17 GB        | es del servidor entero: construcciones más lentas para todos | **sí**, y no es urgente                                   |
| Ampliar el disco o separar el servidor antes de producción    | que quepan cinco recursos más | gasto recurrente                                             | **sí**, antes de los recursos de producción (§5, orden 8) |

## 5 · El orden hacia producción

| Orden | Qué                                                                                                                                                                                                 | Depende de            | Estado                                  |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- | --------------------------------------- |
| 1     | Los catorce ajustes y la ayuda pública                                                                                                                                                              | —                     | ✅ servidos                             |
| 2     | Preparación segura de Sentry                                                                                                                                                                        | —                     | ✅ servida, sin DSN                     |
| 3     | Aceptación estética del resultado                                                                                                                                                                   | decisión 1            | pendiente                               |
| 4     | Activar Sentry y sus cuatro eventos                                                                                                                                                                 | decisión 3            | preparado                               |
| 5     | Canal de avisos y su recepción                                                                                                                                                                      | decisión 4            | sin empezar                             |
| 6     | Ensayo de recuperación, evidencia y cierre                                                                                                                                                          | decisión 2            | preparado                               |
| 7     | Piloto B, en paralelo: no bloquea ni es bloqueado por producción                                                                                                                                    | decisiones 5, 6 y 7   | preparado                               |
| 8     | Margen del servidor (§4) y una ventana para los parches y el reinicio pendiente                                                                                                                     | 3–6                   | hoy no caben cinco recursos con holgura |
| 9     | Recursos **separados**: PostgreSQL por digest, Redis, API, worker y Web; bucket propio; respaldo y retención por decidir                                                                            | 3–6 y 8               | no existen                              |
| 10    | Entorno de producción: 28 valores de arranque, 7 de recorrido y los de construcción de Web, con secretos nuevos y `PSICO_ENV=production`. `EMAIL_ALLOWLIST` ausente y compras cerradas, a propósito | 9                     | falta escribir su inventario            |
| 11    | Despliegue de uno en uno, migraciones y contenido                                                                                                                                                   | 10                    | procedimiento escrito, nunca ejecutado  |
| 12    | Validación: `ready` con listas vacías, el recorrido de §2.6 del runbook y respaldo con restauración                                                                                                 | 11                    | —                                       |
| 13    | **Textos públicos resueltos, o una restricción real de acceso**                                                                                                                                     | decisión 9            | borradores listos                       |
| 14    | Corte: `feelverse.app`, `www` y `api.feelverse.app`, certificado, prototipos en 404 y webhooks                                                                                                      | 12 y 13               | el DNS de `api.feelverse.app` no consta |
| 15    | Siete días de vigilancia                                                                                                                                                                            | 14                    | —                                       |
| 16    | Apertura pública                                                                                                                                                                                    | 15, decisiones 8 y 10 | —                                       |

**Producción no está preparada** por tener staging sano ni por recibir la
aceptación estética.

## 6 · Lo que hace falta de ti, en concreto

| Para            | Intervención mínima                                                       |
| --------------- | ------------------------------------------------------------------------- |
| Estética        | pegar en la conversación la respuesta que arma la página                  |
| Nivel 4         | «autorizo hasta US$ …» y dejar iniciada tu sesión de OVH: el pago es tuyo |
| Sentry          | entrar en `sentry.io` y decir la región                                   |
| Avisos          | el sí al destino y al alcance, y pegar una clave                          |
| Piloto          | el sí a B y, por separado, la dirección de la primera persona             |
| Terapia         | el sí a ocultarla                                                         |
| Líneas de ayuda | quién las valida                                                          |
| Textos públicos | los datos de §2.7                                                         |
| Editorial       | sí o no al Dúo; el alcance de salida; el material cuando exista           |

## 7 · Lo que esta ficha NO hace

No contrata nada, no activa el canal de avisos ni Sentry, no abre B ni cobros, no
invita a nadie, no publica contenido y no declara ninguna condición cerrada que
no lo esté.

## 8 · Antecedente: qué cambia respecto al 23-11

- Los trece ajustes y Mi plan pasan de «recomendados» a servidos; la aceptación
  sigue pendiente.
- La ayuda pública y la preparación de Sentry eran trabajo ejecutable y están
  hechas.
- El máximo del ensayo es **uno y total**: antes decía «sin impuestos».
- La filial de OVH se confirma en la cuenta o en el pedido; no se deduce del
  nombre del servidor.
- El disco al 89 % no era crecimiento: era el acumulado del día (§4).
- Se añaden Terapia, las líneas de ayuda, el alcance de salida y los borradores.
- Los textos públicos pasan **antes** del corte, no antes de la apertura.
