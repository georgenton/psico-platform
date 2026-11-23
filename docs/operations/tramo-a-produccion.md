# Ficha de decisiones de lanzamiento

> **Corte del 2026-11-23.** Es la **única** lista vigente de lo que espera una
> decisión tuya; sustituye a la del 19-11. Las puertas completas viven en
> [runbook §4](../deploy/coolify-runbook.md), y qué se mueve de esa lista
> anterior está en §7.

## 0 · Cuatro cosas distintas que conviene no mezclar

| Qué                                                             | Estado                                                                                                                                                                   |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Desarrollo de correo, recuperación y reenvío**                | ✅ terminado, comprobado en staging y aceptado (#868, #870, #874)                                                                                                        |
| **Decisiones pendientes**                                       | las de §1                                                                                                                                                                |
| **Trabajo técnico que no depende de ninguna decisión**          | Sentry (§2.3): hoy la Web no lo carga y la API enviaría datos sensibles en las trazas. Ayuda en crisis (§2.1): la pantalla pide iniciar sesión, en contra de lo decidido |
| **Ejecución operativa posterior** a las decisiones, incluida §4 | no empezada: producción no existe como recurso                                                                                                                           |

La versión anterior decía «ninguna es trabajo técnico pendiente». Era cierto
del frente de correo y falso en general.

## 1 · Las decisiones

| #   | Decisión                                            | Recomendación                                                   | Si dices que sí                                    | Lo que se ejecuta después                                                  | Condiciona         |
| --- | --------------------------------------------------- | --------------------------------------------------------------- | -------------------------------------------------- | -------------------------------------------------------------------------- | ------------------ |
| 1   | **Aceptación estética**                             | aceptar con los 13 ajustes recomendados de la página            | se cierra la puerta 1                              | una tanda de ajustes, CI, despliegue en staging y recaptura de lo cambiado | producción         |
| 2   | **Ensayo de recuperación (nivel 4)**                | autorizar **hasta US$ 15 sin impuestos**, con §2.2 delante      | se puede contratar una instancia temporal por 24 h | el ensayo completo, su evidencia y el cierre de los recursos               | producción         |
| 3   | **Sentry**: quién es dueño y en qué región          | organización de Syntavera, dos proyectos, región por decidir    | se puede conectar cuando el código esté listo      | los arreglos de §2.3, el DSN y tres eventos controlados                    | producción         |
| 4   | **Aviso de respaldo**: destino y alcance            | `soporte@syntavera.dev`, seis avisos, sabiendo que es de equipo | alguien se entera de un respaldo fallido           | canal en Coolify y dos pruebas de recepción                                | producción         |
| 5   | **Piloto B**, aprobarlo                             | sí: tres personas, de una en una, dos semanas cada una          | se abre en pantalla lo que C01 publica             | nada hasta la 6                                                            | piloto             |
| 6   | **Primera persona** y el envío a su dirección       | después de la 5 y de la ayuda en crisis pública                 | puede registrarse y recibir su correo              | los siete pasos de [la incorporación](piloto-b-primera-incorporacion.md)   | piloto             |
| 7   | **Vínculo del Dúo**                                 | `eec-c1-emocion-informa-no-manda@1`                             | el CTA deja de colgar de un pin retirado           | publicar `@3`, archivar `@2` y mover la elegibilidad                       | vínculo del Dúo    |
| 8   | **Las otras dos obras** (material)                  | aportar cuando lo haya; no retrasa el lanzamiento               | amplía el catálogo                                 | partes e ingesta; publicar es un acto aparte                               | catálogo final     |
| 9   | **Primer audio** (material)                         | capítulo 1 de _EEC_                                             | «Escuchar» tiene algo para todos                   | subir a R2, fila `Audio` y prueba en el lector                             | medios             |
| 10  | **Precios y apertura de cobros**                    | no abrir; decidir las filas                                     | se fija la oferta, **sin abrir cobros**            | copy de la landing y de Mi plan; los cobros siguen en `BILLING_PURCHASES`  | apertura de cobros |
| 11  | **Textos públicos**: privacidad, términos, contacto | aportarlos antes de abrir al público                            | el pie deja de decir «En preparación»              | enlazar los cinco destinos                                                 | apertura pública   |
| 12  | **Google** como acceso                              | dejarlo fuera de v1                                             | nada                                               | retirar el separador «o» del acceso                                        | ninguno            |

Las autorías, la sinopsis de _EEC_, la nota de C01, la publicación de las cinco
microguías y la cuota de Eco **ya están decididas** y no se preguntan otra vez.
**B cuenta una sola vez**, en las filas 5 y 6, y no condiciona producción.

## 2 · Cada una, con lo que hace falta para decidir

### 2.1 · Aceptación estética

**→ [Las pantallas, para mirarlas](https://claude.ai/artifact/56P67k18svei385pZ2Whn3)**
— página privada. Veintinueve pantallas en cuatro bloques, capturadas el 23-11
sobre lo que sirve staging (`6521dc6f`), en escritorio y teléfono, con las de
verificación y su confirmación. Abajo se arma la respuesta: «acepto el conjunto»
o la lista por pantalla.

Se recapturaron porque de las dieciocho guardadas siete medían 400 px y once 800. Las
anteriores, con su antes y después, siguen en el archivo privado. **Las diez
decisiones cerradas no se reabren.**

Al mirarlas salieron **16 observaciones, 13 recomendadas**. Dos familias:

- **Aspecto.** La primera: la cabecera de la portada se parte en dos líneas en
  todos los anchos de escritorio desde **#783**, un día después de tu aceptación
  de F2.1. Y el título del muro de Patrones tiene un contraste de 1,3 a 1.
- **No son estética: dicen algo distinto de lo que hace el producto.** Registro,
  acceso y Seguridad prometen que sólo tú ves tus conversaciones con Eco, y sus
  respuestas se guardan sin cifrar (ADR 0007 §C). Biblioteca y Reflexiones dicen
  que leer y escribir alimentan el Mapa, y el Mapa dice que no. La recomendación
  habla de «un capítulo entero sobre la ansiedad» que no está entre los diez. Y
  **las líneas de ayuda piden iniciar sesión** en la Web, aunque la API es
  pública por decisión ética.

### 2.2 · Ensayo completo de recuperación — nivel 4

**Qué se contrataría**

| Componente                  | Elección                                                                                   | Precio, sin impuestos                        | Procedencia                                                                         |
| --------------------------- | ------------------------------------------------------------------------------------------ | -------------------------------------------- | ----------------------------------------------------------------------------------- |
| Proveedor                   | OVHcloud Public Cloud, filial World (WS/WE) — contrato con OVH Hosting Inc., Montreal      | —                                            | condiciones generales WS/WE, 17-01-2025                                             |
| Región                      | **BHS5** (Beauharnois), la familia del VPS actual                                          | —                                            | la página de precios la lista para `d2-8`                                           |
| Instancia                   | **`d2-8`**: 4 vCore, 8 GB, por horas (plan _Hourly_)                                       | **US$ 0,0439 /h**                            | [precios](https://www.ovhcloud.com/es/public-cloud/prices/) y API pública, el 23-11 |
| Disco                       | 50 GB locales, incluidos                                                                   | 0                                            | catálogo de la API                                                                  |
| IPv4                        | _Basic Public IP_, ligada a la vida de la instancia                                        | US$ 0,00319 /h                               | la misma página y la API                                                            |
| Tráfico                     | entrante y saliente                                                                        | incluido fuera de Singapur, Sídney y Mumbai  | la misma página                                                                     |
| Volúmenes, copias, IP extra | **ninguno**; las instantáneas automáticas vienen activadas por defecto y **se desactivan** | 0                                            | guía de OVH                                                                         |
| Alta del proyecto           | —                                                                                          | US$ 0; posible **crédito inicial de US$ 10** | el crédito figura en el catálogo; **cuándo se exige, no acreditado**                |
| Tarjeta                     | cargo pequeño de comprobación que se devuelve                                              | cuantía **no acreditada**                    | guía de OVH                                                                         |
| Impuestos                   | se suman a todo                                                                            | **tipo para Ecuador, no acreditado**         | art. 11.1 de WS/WE                                                                  |

**Cuánto**

| Escenario                                               | Coste                     |
| ------------------------------------------------------- | ------------------------- |
| 12 h                                                    | US$ 0,57                  |
| **24 h, lo previsto**                                   | **US$ 1,13**              |
| dos ensayos completos                                   | US$ 2,26                  |
| siete días encendida por error                          | US$ 7,91                  |
| crédito inicial de US$ 10, si lo piden, más dos ensayos | US$ 12,26                 |
| **Máximo que se pide autorizar**                        | **US$ 15, sin impuestos** |

Los **US$ 15 son una propuesta**, no una autorización recibida. Antes de
contratar se te enseña el pedido con su total real: si la moneda no es dólar, si
aparece un cargo no previsto o si el total con impuestos pasa del máximo, se
para y se pregunta.

> **Dos correcciones sobre la ficha anterior.** Decía que «el precio se movió»
> de US$ 0,0439 a US$ 0,0461: no. Son **dos filiales** —World y Estados Unidos— y
> las dos tarifas están vigentes. El VPS actual resuelve a `vps.ovh.ca`, así que
> la de Estados Unidos, que es otra entidad, no es la que se contrataría. La
> filial exacta de la cuenta se confirma con la moneda de la factura del VPS o
> al entrar.

**Duración.** 8 horas de trabajo, 24 de tope. Si a las 24 no terminó, se saca la
evidencia, se destruye y se informa hasta dónde llegó.

**Qué se ensaya.** Host nuevo con Ubuntu 24.04 → Coolify → PostgreSQL
`pgvector/pgvector:pg18` por digest, Redis, API, worker y Web → restaurar la
copia de R2 → la puerta de aislamiento
(`scripts/rehearsal-isolation-check.mjs`), que impide alcanzar a proveedores
reales → arrancar → entrar, abrir un capítulo, comprobar que el Diario cifrado
sigue y que `ready` es verdadero. Se miden el tiempo total y la antigüedad del
dato recuperado. **No toca** el DNS, el servidor vivo ni sus datos: la copia se
lee con la credencial de sólo lectura que ya existe.

**Vigilancia del gasto.** OVH **no ofrece un tope duro**; lo que hay es una alerta
de previsión. Se pone en **US$ 5** al crear el proyecto, y el consumo se lee a
las 4, 12, 20 y 24 h. El límite real es el procedimiento: apagar no detiene el
cobro, sólo **borrar**.

**Cierre**

1. Evidencia al Mac **antes** de destruir: registros, tiempos y sumas.
2. Borrar la instancia; comprobar que la IP se fue con ella.
3. Comprobar que no queda ningún volumen, instantánea, copia o IP flotante:
   borrar la instancia **no** los borra.
4. Retirar la clave SSH temporal.
5. Leer el consumo final y borrar el proyecto, que emite su factura.
6. Revisar la factura del mes siguiente.

### 2.3 · Sentry

**Acceso, comprobado el 23-11: no hay ninguno.** Sin sesión en `sentry.io` en el
navegador, sin conector, sin fichero ni variable local, y `SENTRY_DSN` ausente en
los tres contenedores.

**Antes del DSN hay trabajo técnico, y no es opcional.** Medido con el
`initSentry` real de la API contra un sumidero local, con señuelos aleatorios:

| Dónde        | Qué pasa hoy si se pone el DSN                                                                                                                                                                                                                         | Qué hace falta                                                                                                  |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| API y worker | los **errores** salen limpios, salvo la IP. Pero **1 de cada 10 peticiones** se envía como traza con `authorization`, cookies, la sesión de invitada, la atestación, el token de la URL, el **cuerpo** —lo que escribes a Eco, una contraseña— y la IP | apagar las trazas (`tracesSampleRate: 0`), redactar también transacciones y migas, y quitar las cabeceras de IP |
| API y worker | staging aparece como **`production`**: usa `NODE_ENV`                                                                                                                                                                                                  | usar `PSICO_ENV`                                                                                                |
| API y worker | los eventos no dicen qué versión falló                                                                                                                                                                                                                 | `release` con el commit, que ya está en `SOURCE_COMMIT`                                                         |
| Web          | **no envía nada**: en la imagen servida no hay instrumentación compilada, `instrumentationHook` es falso y el cliente no se inyecta                                                                                                                    | mover `instrumentation.ts` a `src/`, activarla y cargar el cliente                                              |

No hubo fuga: nunca hubo DSN. Lo que la ficha anterior daba por hecho —«el
cableado está completo en los cuatro frentes»— era falso en la Web.

**Configuración propuesta, separada**

| Proyecto        | Procesos                    | Variables                                                                                                                   | Distinción                        |
| --------------- | --------------------------- | --------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| `feelverse-api` | API y worker                | `SENTRY_DSN` en los dos                                                                                                     | etiqueta `service`, entorno y SHA |
| `feelverse-web` | servidor y navegador de Web | `SENTRY_DSN` en ejecución y `NEXT_PUBLIC_SENTRY_DSN` **en la construcción**, porque se incrusta en el paquete del navegador | entorno y SHA                     |

Grabación de sesión y capturas siguen **apagadas**: grabarían el Diario abierto.
El móvil queda fuera por ahora.

**La validación, preparada.** Tres eventos controlados —uno por proceso— con los
nueve señuelos del experimento en cabeceras, URL y cuerpo. Se da por buena cuando
los tres aparecen con `environment: staging` y el SHA servido, y buscar los nueve
en el JSON de cada evento da **cero**. El experimento local se conserva como
prueba de regresión.

**Lo mínimo que hace falta de ti:** entrar en `sentry.io` con la cuenta que quieras
como dueña, y decir **en qué región** se guardan los datos —Estados Unidos o
Unión Europea—, que después no se cambia. Los proyectos los creo yo con esa
sesión. No hace falta que me pases ningún DSN.

### 2.4 · Aviso de respaldo

**Qué hay.** El detector corre solo cada día a las 06:10 UTC y lleva registro
(`OK` los cuatro últimos días), pero **no avisa**: los canales de Coolify están
desactivados. Y un aviso perdido no es teórico: el disco está al **89 %**, por
encima del umbral de 80 % que Coolify ya tiene configurado, y nadie lo recibe.

**Propuesta.** Correo de Coolify a **`soporte@syntavera.dev`**, con seis avisos
—respaldo fallido, disco, servidor inalcanzable, límite de reinicios, limpieza
fallida y tarea programada fallida— y los demás apagados. Transporte: una
**clave de Resend propia de Coolify**, sólo de envío y limitada a
`feelverse.app`, para poder revocarla sin tocar el producto.

| Conviene saberlo antes de autorizar                                                                                                                     |
| ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| El canal es **del equipo de Coolify**: avisará de los siete proyectos del servidor, no sólo de FeelVerse                                                |
| **No pasa por `EMAIL_ALLOWLIST`**: lo manda Coolify, no FeelVerse. Autorizar una dirección en la lista del producto no autoriza este canal, ni al revés |
| Cubre respaldos **fallidos**. Uno que no llegó a ejecutarse lo ve el detector; que avise por correo es una línea más, en el mismo canal                 |
| Si la caja se apaga, no avisa nadie: los dos viven dentro. Para producción hará falta un vigía externo, que se propondrá con los recursos               |

**Prueba de recepción:** el envío de prueba de Coolify y, esa misma noche, el
aviso real de disco, que hoy se cumpliría solo.

**Lo mínimo que hace falta de ti:** el sí al destino y al alcance de equipo, y
**pegar una vez** la clave en Coolify.

### 2.5 · Piloto B — dos autorizaciones

1. **Aprobar B**: sí o no a la propuesta de [piloto §8](../product/piloto-minimo.md).
   Recomendación: **sí**.
2. **Autorizar a la primera persona y el envío a su dirección.** No se deduce de
   la primera.

La incorporación está preparada: invitación, siete pasos, comprobador de
destinatario y consulta de id de sólo lectura, en
[piloto-b-primera-incorporacion.md](piloto-b-primera-incorporacion.md). **El dato
que falta es uno: su dirección exacta, con su consentimiento**, por canal directo,
nunca en el repositorio ni en Notion. No se ha invitado a nadie.

**Una corrección en la invitación:** decía que las líneas de ayuda se usan «sin
tener cuenta», y hoy la Web pide iniciar sesión para verlas. Se retiró la frase.
Recomiendo publicar esa pantalla sin sesión **antes** de invitar a nadie.

### 2.6 · Editorial

Quedan **cuatro** decisiones del
[paquete](../product/paquete-editorial-2026-11-07.md), con su propuesta vigente:
el vínculo del Dúo (7), el material de las otras dos obras (8), el primer audio
(9) y los precios (10). Ninguna condiciona el piloto. La 10 **no abre cobros**:
éstos tienen sus seis condiciones y una variable que falla cerrada.

## 3 · Las imágenes archivadas — resultado

| Comprobación                             | Resultado (2026-11-23, 20:25–20:30 UTC)                                                                                                              |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Archivo íntegro**                      | ✅ suma `5ba17422…` igual a la declarada, y los 25 objetos internos coinciden uno a uno con su huella                                                |
| Margen                                   | ✅ 14,4 GB libres y 6 GB de memoria antes de cargar; se usaron 2,8 GB                                                                                |
| **Imagen cargada e identificada**        | ✅ las dos etiquetas previstas: `c19358a4` (id `90f5aa31…`, que ya **no existía** en Docker) y `6fe5ff3f` (id `6e06f9b4…`, idéntico al que ya había) |
| Visible para Coolify                     | ✅ `list_rollback_images` vuelve a ofrecer `c19358a4`; lleva la guarda de compras y no hay migraciones de diferencia                                 |
| Servicios vivos                          | ✅ los 43 contenedores con el mismo arranque y reinicios; portada, API y ayuda en crisis responden 200                                               |
| El archivo y su suma                     | conservados fuera de Docker. **Están en el mismo servidor**: no cubren perderlo                                                                      |
| **Reversión del servicio**               | ❌ **no ensayada**                                                                                                                                   |
| **Reconstrucción completa del servidor** | ❌ pendiente de su propio ensayo (§2.2)                                                                                                              |

La limpieza diaria de Coolify puede volver a llevarse la imagen cargada; el
archivo no. Y el disco pasó de **56 %** el 09-11 a **86 %** hoy, 89 % tras
cargarla: es la condición 6 de §4.

## 4 · El orden hacia producción

| Orden | Qué                                                                                                                                                                                                 | Depende de       | Estado                                             |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | -------------------------------------------------- |
| 1     | Ajustes de pantallas aceptados y página pública de ayuda                                                                                                                                            | decisión 1       | sin empezar                                        |
| 2     | Observabilidad: arreglos, DSN y tres eventos                                                                                                                                                        | decisión 3       | los arreglos no dependen de nadie                  |
| 3     | Canal de avisos y su recepción                                                                                                                                                                      | decisión 4       | sin empezar                                        |
| 4     | Ensayo de recuperación, evidencia y cierre                                                                                                                                                          | decisión 2       | todo lo demás preparado                            |
| 5     | Piloto B, en paralelo: no bloquea ni es bloqueado por producción                                                                                                                                    | decisiones 5 y 6 | preparado                                          |
| 6     | Margen del servidor: recuperar disco o ampliarlo, y una ventana para los 42 parches y el reinicio pendiente                                                                                         | 1–4              | **nuevo**; hoy no caben cinco recursos con holgura |
| 7     | Recursos **separados**: PostgreSQL por digest, Redis, API, worker y Web; bucket propio; respaldo y retención por decidir                                                                            | 1–4 y 6          | no existen                                         |
| 8     | Entorno de producción: 28 valores de arranque, 7 de recorrido y los de construcción de Web, con secretos nuevos y `PSICO_ENV=production`. `EMAIL_ALLOWLIST` ausente y compras cerradas, a propósito | 7                | falta escribir su inventario                       |
| 9     | Despliegue de uno en uno —API, worker, Web—, migraciones y contenido                                                                                                                                | 8                | procedimiento escrito, nunca ejecutado             |
| 10    | Validación: `ready` con listas vacías, el recorrido de §2.6 del runbook, y respaldo con restauración                                                                                                | 9                | —                                                  |
| 11    | Corte: `feelverse.app`, `www` y `api.feelverse.app`, certificado, prototipos en 404 y webhooks                                                                                                      | 10               | el DNS de `api.feelverse.app` no consta            |
| 12    | Siete días de vigilancia                                                                                                                                                                            | 11               | —                                                  |
| 13    | Apertura pública                                                                                                                                                                                    | 12 y decisión 11 | —                                                  |

**Producción no está preparada** por tener staging sano ni por recibir la
aceptación estética. Las condiciones del roadmap no cambian.

## 5 · Lo que hace falta de ti, en concreto

| Para            | Intervención mínima                                                                         |
| --------------- | ------------------------------------------------------------------------------------------- |
| Estética        | pegar en la conversación la respuesta que arma la página                                    |
| Nivel 4         | «autorizo hasta US$ …» y dejar iniciada tu sesión de OVH: no hay ninguna, y el pago es tuyo |
| Sentry          | entrar en `sentry.io` y decir la región                                                     |
| Avisos          | el sí al destino y al alcance, y pegar una clave                                            |
| Piloto          | el sí a B y, por separado, la dirección de la primera persona                               |
| Editorial       | sí o no al vínculo del Dúo; el material cuando exista                                       |
| Textos públicos | privacidad, términos y contacto                                                             |

## 6 · Lo que esta ficha NO hace

No contrata nada, no abre cobros, no invita a nadie, no publica contenido y no
declara ninguna condición cerrada que no lo esté.

## 7 · Antecedente: qué cambia respecto al 19-11

- «Ninguna es trabajo técnico pendiente» se sustituye por §0.
- Sentry no era «falta un DSN»: faltan cuatro arreglos antes.
- El precio de `d2-8` no subió; eran dos filiales. La IPv4 queda acreditada.
- La aceptación estética pasa a una página para responder, con pantallas nuevas.
- El aviso de respaldo dice ahora su alcance de equipo.
- Se añaden los textos públicos y el margen del servidor, que no estaban.
- «Cinco decisiones editoriales» son cuatro: B no es editorial.
