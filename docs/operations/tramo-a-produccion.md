# Ficha de decisiones de lanzamiento

> **Corte del 2026-11-25.** Es la **única** lista vigente de lo que espera una
> decisión tuya; sustituye a la del 24-11. Las puertas completas viven en
> [runbook §4](../deploy/coolify-runbook.md), y qué cambia respecto a la lista
> anterior está en §8.

## 0 · Los cinco cajones

Nada está en dos a la vez.

| Cajón                                       | Qué hay dentro                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1 · Corregido y servido en staging**      | los catorce ajustes y la ayuda pública (24-11) · la llave del Diario cuando cambia la cuenta, Terapia sin oferta de demostración, la baja con fecha y cancelación, el cambio de correo retirado, los interruptores sin efecto retirados, la exportación dicha como es, los recursos de ayuda con su fuente, el aviso de crisis que sale primero, la entrada al historial de terapia y la identidad de la pestaña pendiente hasta confirmarse (25-11, §2.9) |
| **2 · Verificaciones pendientes**           | reversión a una imagen anterior y recuperación completa (§3) · un evento real en Sentry (§2.3) · el **transporte de Eco en el móvil**, antes de distribuir la app (§2.10) · la aceptación estética, que cierra mirar el resultado                                                                                                                                                                                                                          |
| **3 · Decisiones tuyas**                    | las siete de §1                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| **4 · Contenido o documentación que falta** | los datos para los textos públicos (§2.7) · quién responde por las líneas de ayuda (§2.8) · las otras dos obras y el primer audio                                                                                                                                                                                                                                                                                                                          |
| **5 · Ejecución operativa para producción** | §5. Producción no existe como recurso                                                                                                                                                                                                                                                                                                                                                                                                                      |

**Sentry sigue sin activar** y **las compras siguen cerradas**.

## 1 · Las decisiones

**Siete necesitan tu intervención.** Las cinco primeras condicionan producción o
exponer el producto; las dos últimas, el piloto.

| #   | Decisión                                         | Recomendación                                                             | Lo que se ejecuta después                                                 | Condiciona         |
| --- | ------------------------------------------------ | ------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ------------------ |
| 1   | **Aceptación estética** del resultado            | mirar la página y, si te convence, «acepto el conjunto»                   | se cierra la puerta 1                                                     | producción         |
| 2   | **Ensayo de recuperación (nivel 4)**             | autorizar **hasta US$ 15 en total**, con todo incluido (§2.2)             | una instancia de 24 h, su evidencia y el cierre de los recursos           | producción         |
| 3   | **Sentry**: dueño y región                       | organización de Syntavera; la región la eliges tú y después no se cambia  | dos proyectos, los DSN y cinco eventos controlados                        | producción         |
| 4   | **Aviso de respaldo**: destino y alcance         | `soporte@syntavera.dev`, seis avisos, sabiendo que es de todo el servidor | canal en Coolify y prueba de recepción                                    | producción         |
| 5   | **Quién responde** por los textos y por la ayuda | los datos de §2.7 y una persona que valide los recursos de §2.8           | revisión profesional, páginas públicas y revisión periódica de las líneas | exposición pública |
| 6   | **Piloto B**                                     | sí: tres personas, de una en una, dos semanas cada una                    | nada hasta la 7                                                           | piloto             |
| 7   | **Primera persona** y el envío a su dirección    | después de la 6                                                           | los siete pasos de [la incorporación](piloto-b-primera-incorporacion.md)  | piloto             |

**No esperan por ti para avanzar**, y por eso no se numeran: el alcance de salida
(las **tres obras** siguen siendo el vigente; salir por etapas es una propuesta,
§2.6), el vínculo del Dúo, los precios y el material de las otras dos obras y del
audio. Se deciden cuando quieras moverlos.

Las autorías, la sinopsis de _EEC_, la nota de C01, la publicación de las cinco
microguías, las diez decisiones visuales y **la retirada de Terapia** están
decididas y no se preguntan otra vez. **B cuenta una sola vez**, en las filas 6 y 7. El acceso con Google queda fuera de la primera versión sin que haya que decidir
nada.

## 2 · Cada una, con lo que hace falta para decidir

### 2.1 · Aceptación estética

**→ [Las pantallas, para mirarlas y responder](https://claude.ai/artifact/56P67k18svei385pZ2Whn3)**
— página privada. Conserva el conjunto del 24-11, capturado sobre Web `46878ca5`, y
enseña **aparte** lo que cambió después, capturado sobre lo que staging sirve hoy:
Web y API en `eabe123a`, worker en `31c843f4`. Abajo está «acepto el conjunto».

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
ejecutándose. **Las cinco superficies son API, worker, servidor de Web, Edge y
navegador**:

| Superficie        | El error útil llega | Señuelos que salen | Transacciones, sin y con traza entrante | Sin DSN                |
| ----------------- | ------------------- | ------------------ | --------------------------------------- | ---------------------- |
| API               | sí                  | 0 de 32            | 0 de 60 · 0 de 60                       | 0 conexiones ajenas    |
| Worker            | sí                  | 0 de 32            | 0 en 60 trabajos                        | 0                      |
| Servidor de Web   | sí                  | 0 de 18 (ver nota) | 0 de 60 · 0 de 60                       | 0                      |
| Edge (middleware) | sí                  | 0 de 18            | las mismas peticiones                   | 0                      |
| Navegador         | sí                  | 0 de 18            | 0 de 60 · 0 de 60                       | el SDK ni se construye |

Con el código anterior, el mismo ensayo dejaba salir 29 de 32 señuelos en la API
y 18 de 32 en el worker, y **60 de 60 transacciones** con traza entrante. El
muestreo es probabilístico y los ensayos son finitos: se afirma lo que dice la
tabla, no más. **Hoy no hay DSN en ningún proceso; eso no dice nada de épocas
anteriores.**

> **La cifra del servidor de Web no tenía respaldo hasta el 24-11 por la tarde.**
> El ensayo vaciaba su lote de sobres sin mirarlo, así que el «0 de 18» que publiqué
> esa mañana no salía de ninguna comprobación. Corregido en #890: **todo lote se
> mira antes de vaciarse** y el ensayo falla si queda un sobre sin revisar. Repetido
> entonces, con su control negativo: servidor **0 de 18** (12 señuelos introducidos en
> 3 eventos), Edge 0 de 18 (11 en 2), navegador 0 de 18 (5 en 6) y una acción de
> servidor 0 de 18 (3 en 1); **72 sobres revisados, 0 sin revisar**. Si se le abre a
> propósito una fuga en el servidor, falla **sólo** esa fila. No es evidencia de un
> Sentry real: es local.

> **Dos frases de la ficha anterior eran inexactas.** «Los errores salen limpios,
> salvo la IP» no se sostiene: mensaje, causa, migas y contextos también salían.
> Y `tracesSampleRate: 0` **no** era el arreglo: en la versión instalada puede
> prevalecer la decisión que trae la petición.

**Para activarlo:** `SENTRY_DSN` en API, worker y Web, y `NEXT_PUBLIC_SENTRY_DSN`
**en la construcción** de Web, porque se incrusta; después, **cinco** eventos
controlados —API, worker, servidor de Web, Edge y navegador— y buscar los señuelos
en cada uno. En el proyecto hay que activar «Prevent Storing of IP Addresses»: la
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
Terapia ya no está a la vista (§2.9), que era lo que había que resolver **antes** de
invitar a nadie.

### 2.6 · Alcance, editorial y precios

- **Alcance.** El vigente son las **tres obras**; hoy se lee una. Salir con
  una sola **no está aprobado**. Si quieres esa opción, la propuesta sería salir
  por etapas: _EEC_ primero, diciéndolo en la portada, y las otras dos con su
  propio acto editorial. Es una alternativa a decidir, no la que se ejecuta.
- **Dúo.** Sucesor propuesto: `eec-c1-emocion-informa-no-manda@1`.
- **Materiales.** Cuando existan. Aportar un audio **no** modifica por sí
  solo lo que se lee o se escucha en Gratuito y en Pro: eso son derechos, y se
  deciden aparte.
- **Precios.** No abre cobros: tienen sus seis condiciones y una variable que
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

**Al escribirlos salieron defectos que los textos no podían disimular.** Cuatro se
corrigieron (§2.9); los demás siguen abiertos, con su impacto y su siguiente acción,
en §2.10.

### 2.8 · Los recursos de ayuda

**Una sola fuente** (`packages/types/src/crisis-catalog.ts`): la leen el aviso nuevo de
Eco, el chat anterior, la API y `/ayuda`. Cada entrada lleva al lado quién la opera,
la página que lo dice, el día en que se comprobó, qué acredita **y qué no**. Sólo se
muestra lo que está `publicado`. La tabla entera, con sus enlaces, en
[ayuda-evidencia.md](../product/ayuda-evidencia.md). No se llamó a ninguna línea.

| País          | Se muestra                                                                                           | Se retiró                                                                                                                     | Por validar                                                                          |
| ------------- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Ecuador       | **911 · ECU 911**: 24 horas, gratuito, todo el país                                                  | «CETAD» —el número es la **central del Ministerio de Agricultura**—, «Teléfono de la Amistad», 1800-4-SALUD y el rótulo «SAS» | **171 opción 6** (Ministerio de Salud): vigente y gratuita; el horario se contradice |
| Colombia      | **106 · Ministerio de Salud**: 24 horas, gratuita y confidencial; algunos territorios tienen la suya | «anónima»: el Ministerio no lo dice                                                                                           | 123 como emergencia nacional                                                         |
| México        | **SAPTEL**: gratuito. Su horario no se afirma: su propio sitio publica dos                           | «24/7»                                                                                                                        | **Línea de la Vida 800 911 2000** y 911                                              |
| Internacional | Un **directorio** (findahelpline), dicho como directorio                                             | El teléfono atribuido a IASP: es la línea 988 de Estados Unidos                                                               | —                                                                                    |

Los mensajes que Eco guardó antes **no se reescriben**: son historia de esa
conversación.

**Lo que hace falta de ti:** nombrar a una persona que responda por el catálogo,
que conteste por escrito las quince preguntas de la evidencia y que lo revise cada
cierto tiempo. **Recomiendo** que lo primero que valide sean 171 opción 6 y Línea de
la Vida: son las dos que ampliarían la ayuda con fuente oficial.

### 2.9 · Lo corregido el 24 y el 25 de noviembre

| Qué                                                      | Qué pasaba                                                                                                                                                                                                                                                      | Qué pasa ahora                                                                                                                                                                                  | PR   |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| **Llave del Diario**                                     | con el Diario abierto, si en otra pestaña se entraba con otra cuenta, la primera conservaba la llave de la anterior y «Recordar» la guardaba a nombre de la nueva                                                                                               | las claves llevan su cuenta y sólo se entregan a ella; lo que estaba en marcha se descarta                                                                                                      | #892 |
| **Terapia**                                              | seis fichas inventadas «con licencia verificada», y se podía reservar y pedir el cobro                                                                                                                                                                          | no se ofrece en ninguna parte: el servidor la cierra antes de leer, escribir o cobrar, y una ficha de demostración no puede pasar por real ni con la oferta abierta. Filas e historial intactos | #891 |
| **Baja de cuenta**                                       | Perfil decía el día de la solicitud como si fuera el de la eliminación, y no se podía cancelar                                                                                                                                                                  | dice el día en que ocurre y se cancela desde ahí hasta ese momento. Mismo plazo de 30 días                                                                                                      | #893 |
| **Cambio de correo**                                     | enviaba un enlace que no terminaba                                                                                                                                                                                                                              | retirado, dicho así; [la tarea](../product/tarea-cambio-de-correo.md) queda escrita                                                                                                             | #887 |
| **Interruptores de privacidad**                          | tres no movían nada                                                                                                                                                                                                                                             | retirados de la pantalla; los valores guardados no se tocan y el del análisis local sigue, con su revocación                                                                                    | #888 |
| **Exportación**                                          | se anunciaba como ZIP completo                                                                                                                                                                                                                                  | se dice lo que es: un JSON, y qué trae y qué no                                                                                                                                                 | #889 |
| **Ensayo de Sentry**                                     | el servidor de Web no se miraba                                                                                                                                                                                                                                 | §2.3                                                                                                                                                                                            | #890 |
| **Recursos de ayuda**                                    | dos pantallas daban líneas distintas y varias no tenían fuente                                                                                                                                                                                                  | §2.8                                                                                                                                                                                            | #895 |
| **Móvil: la clave maestra**                              | recuperar con las doce palabras no abría nunca el Diario, y tras cambiar la contraseña la app seguía con la clave anterior hasta la siguiente petición                                                                                                          | pregunta la longitud al esquema; reproducido antes con la criptografía de verdad. La app no está distribuida                                                                                    | #896 |
| **Aviso de crisis de Eco**                               | no siempre se emitía: sin mensajes por hoy salía «vuelves mañana», y un fallo al guardar lo convertía en error                                                                                                                                                  | sale lo primero, antes de la cuota y de guardar; nada posterior lo quita. En el móvil está corregido el componente, no el transporte (§2.10)                                                    | #897 |
| **Historial de terapia**                                 | al cerrar la oferta se quedó sin entrada                                                                                                                                                                                                                        | Perfil la enseña sólo a quien tiene algo                                                                                                                                                        | #898 |
| **La cuenta de la pestaña, pendiente hasta confirmarla** | sin marca, o navegando a la vez, el panel de A se daba por bueno con la sesión de B: se abría solo, lo escrito quedaba en B bajo la llave de A y borraba el sobre de B                                                                                          | nace pendiente: ni claves, ni reja, ni lo guardado, ni anuncio hasta que el servidor confirme; sin respuesta, cerrada                                                                           | #899 |
| **Un acceso que vuelve tarde**                           | con dos formularios abiertos sin sesión, la respuesta de B podía llegar con el panel de A ya abierto: la marca seguía siendo la de A mientras se preguntaba —o ni se preguntaba, si lo que tardaba era el destino— y lo escrito quedaba en B bajo la llave de A | la identidad queda pendiente en cuanto vuelve el acceso, sin preguntar nada; y la pantalla que junta llave y token comprueba que son de la misma cuenta                                         | #900 |

Las cuatro últimas filas las encontraron **dos revisiones independientes y tú**, antes
de desplegar; las dos últimas las había introducido esta misma tanda.

**Comprobado sobre lo servido** (Web y API `eabe123a`, 25-11, con cuentas sintéticas):
tres pestañas y dos cuentas 16 de 16 · acceso que vuelve tarde 13 de 13 · identidad
pendiente 12 de 12 · aviso de crisis 14 de 14, por detección sin modelo y cortando la
conexión después · Perfil, Terapia, ayuda y baja en pantalla 23 de 23 · por HTTP, baja,
correo, terapia y compras 23 de 23. **Sólo en aislamiento:** el historial de terapia
con filas —nadie lo tiene en staging y no se fabricó— y la respuesta de un acceso parada
tras las cabeceras. Con esa respuesta parada, en una pantalla que A **ya tenía** puede
abrir su Diario y guardar: va a la cuenta de A, con su token y su llave.

No hay indicio de que nada de lo anterior haya afectado a una persona real. Leído de
la base de staging sin escribir: cero sesiones de terapia, cero bajas pendientes,
cero entradas compartidas, cero avisos de crisis guardados (el único de hoy es el de la
comprobación, en una cuenta sintética) y **una** petición de
cambio de correo, del 25 de octubre, vencida y de una cuenta de prueba.

### 2.10 · Lo que sigue abierto, con su impacto y su siguiente acción

Ninguno está cerrado ni se amplió en silencio.

| Asunto                                                                                                                                                                                                                                              | A quién afecta y cómo                                                                                                                                    | Siguiente acción                                                                           |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Cambiar la contraseña deja **ilegibles los mensajes que escribiste a Eco**                                                                                                                                                                          | a quien cambie la contraseña. Las respuestas de Eco se siguen leyendo                                                                                    | recifrarlos en el mismo cambio o avisar antes; toca el cifrado, así que pide su propio ADR |
| No hay pantalla para **borrar una conversación con Eco**                                                                                                                                                                                            | la ruta existe y ninguna pantalla la llama                                                                                                               | añadir la acción en web y móvil                                                            |
| El **registro de accesos** conserva correo, IP y navegador después de la baja                                                                                                                                                                       | a quien se dé de baja                                                                                                                                    | fijar el plazo de conservación (§2.7) y aplicarlo en el borrado                            |
| **Baja**: si falla el encolado queda sin trabajo; vencido el plazo no se cancela ni se repite                                                                                                                                                       | caso raro; quien lo viva no puede resolverlo solo                                                                                                        | un barrido que recupere solicitudes sin trabajo                                            |
| **Baja con Google**: pide una contraseña que esa cuenta no tiene                                                                                                                                                                                    | a nadie hoy: no hay acceso con Google                                                                                                                    | resolverlo antes de abrir ese acceso                                                       |
| El cambio de correo **no existe**                                                                                                                                                                                                                   | quien pierda su buzón no puede mover la cuenta                                                                                                           | [la tarea](../product/tarea-cambio-de-correo.md)                                           |
| La exportación no trae el Diario ni Eco                                                                                                                                                                                                             | está dicho en la pantalla                                                                                                                                | decidir si una exportación hecha en el dispositivo los añade                               |
| **Compartir** una reflexión con un terapeuta acepta cualquier identificador y no comprueba un consentimiento; compartir patrones responde «hecho» sin hacer nada                                                                                    | ninguna pantalla lo ofrece; no consta que se haya usado (cero filas)                                                                                     | cerrarlas con la misma puerta de Terapia                                                   |
| **Siete preferencias** se guardan y no mueven nada (recordatorios de racha y de Eco, hora, voz, tema, mejor momento y avisos de ánimo)                                                                                                              | quien las cambie no notará nada                                                                                                                          | conectarlas o retirarlas, como se hizo con las de privacidad                               |
| La **racha** no la cuenta nadie                                                                                                                                                                                                                     | tres hitos inalcanzables, dicho en pantalla                                                                                                              | contarla o retirar los hitos                                                               |
| **Móvil**: la clave guardada en el dispositivo no dice de qué cuenta es                                                                                                                                                                             | salir la borra, así que no se conoce un camino que la cruce                                                                                              | atarla a la cuenta, como en la web                                                         |
| **Móvil ya instalado** seguirá enseñando el formulario de correo                                                                                                                                                                                    | recibirá «No pudimos enviar la verificación»                                                                                                             | se corrige con la siguiente versión                                                        |
| **Eco en el móvil, antes de distribuir.** El código del componente está corregido (#897); el **transporte real sigue defectuoso**: la red de React Native no da la respuesta por trozos, que es lo que Eco espera; y la **app no está distribuida** | no llegan respuestas ni el aviso de crisis. Reproducido con la misma librería de red que usa la app, sin dispositivo; no hay un recorrido móvil completo | usar un transporte que sí las dé y comprobarlo en un dispositivo, **antes** de distribuir  |
| En la web, el **acceso del chat de Eco dura quince minutos** y nada lo renueva mientras se mira la pantalla                                                                                                                                         | deducido: pasado ese rato el envío falla, también el de quien pide ayuda                                                                                 | renovarlo en el chat, y enseñar la ayuda en su error                                       |
| **Antes del aviso de crisis** todavía pueden impedirlo una sesión vencida, el límite de frecuencia y un mensaje de más de 2000 caracteres                                                                                                           | quien escriba en ese caso                                                                                                                                | detectar antes de esos tres, o enseñar la ayuda en su error                                |
| **Avisos que Eco guardó antes** con un número retirado se releen como se enviaron                                                                                                                                                                   | nadie hoy: cero guardados en staging                                                                                                                     | por decisión no se reescriben; una nota junto a ellos, si llegara a haberlos               |
| **Cambio de cuenta**: con el acceso vencido, una falsa alarma y un clic casi inmediato cierran la sesión; y un navegador que no deja guardar nada no puede comparar                                                                                 | raro; falla hacia cerrado en el primer caso                                                                                                              | renovar el acceso por turno también al navegar                                             |
| Cada frase de crisis **guarda dos filas aunque no queden mensajes**, y borrar un hilo devuelve cuota                                                                                                                                                | deducido: abuso de almacenamiento, no del modelo; lo frena el límite de 30 por minuto                                                                    | contar el uso aparte de los mensajes guardados                                             |
| Un **cobro de terapia** empezado antes del cierre seguiría pagable hasta que caduque                                                                                                                                                                | nadie: no hubo ninguno                                                                                                                                   | comprobar la oferta también al recibir el pago                                             |
| **Eco, aviso dado por el modelo**: si la marca interna llega partida en dos trozos, se ve un fragmento antes del aviso                                                                                                                              | leído en el código, no observado. El aviso sale igual; el fragmento es ruido                                                                             | retener los primeros caracteres hasta saber si es la marca                                 |
| En el **panel del lector del móvil**, el aviso de Eco no ofrece «Ver más recursos»                                                                                                                                                                  | la ayuda sigue en su pestaña                                                                                                                             | abrirla por encima del panel                                                               |
| El acceso ya emitido vive hasta 15 minutos después de salir                                                                                                                                                                                         | quien tenga ese token en la mano                                                                                                                         | decidir si salir revoca también el de acceso                                               |
| Eco gratuito (10 al día) da más que Pro (200 por periodo)                                                                                                                                                                                           | la oferta                                                                                                                                                | resolverlo al fijar precios                                                                |

## 3 · Tres resultados distintos, y sólo uno está hecho

| Resultado                                         | Estado                                                                                                                                                                                                                                                       |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Imágenes archivadas, íntegras y cargadas**      | ✅ 2026-11-23, 20:25–20:30 UTC: suma `5ba17422…`, 25 objetos internos, `c19358a4` (id `90f5aa31…`) y `6fe5ff3f` (id `6e06f9b4…`). El archivo y su suma siguen fuera de Docker, **en el mismo servidor**. La limpieza diaria puede llevarse la imagen cargada |
| **Reversión del servicio** a una imagen anterior  | ❌ **no ensayada**                                                                                                                                                                                                                                           |
| **Recuperación completa** tras perder el servidor | ❌ pendiente de su propio ensayo (§2.2)                                                                                                                                                                                                                      |

## 4 · El margen del servidor

Se revisa **antes** de cada tanda de construcciones, no después.

**El 89 % del 23-11 no era crecimiento.** La limpieza diaria de Coolify (05:00 UTC,
00:00 de Quito) vuelve cada noche a 54–61 %; sólo los días con varios despliegues
suben a 84–89 %. Lo que sí sube es el suelo: de 54 % el 10-11 a 58 % el 24-11 y 61 %
el 25-11.

| Momento (UTC)                                                    | Ocupado | Libre | Qué pasó                                                                                                        |
| ---------------------------------------------------------------- | ------- | ----- | --------------------------------------------------------------------------------------------------------------- |
| 24-11, antes de las 05:00                                        | 89 %    | 11 GB | **no** había margen para tres servicios: se esperó, sin podar nada                                              |
| 24-11, 05:00:07, tras la limpieza automática                     | 58 %    | 41 GB | se conservó la imagen en servicio y dos anteriores por aplicación, y el archivo                                 |
| 24-11, 05:11, API desplegada                                     | 71 %    | 29 GB | 12 GB: la primera construcción repuebla la caché                                                                |
| 24-11, 05:18, worker desplegado                                  | 82 %    | 19 GB | 10 GB                                                                                                           |
| 24-11, 05:26, Web desplegada                                     | 86 %    | 14 GB | 5 GB. Mínimo durante la construcción: 14 GB                                                                     |
| 24-11, 05:58, Web con #884                                       | 84 %    | 16 GB | al empezar, la caché se recortó sola (14 → 22 GB libres) sin limpieza de Coolify                                |
| 24-11, 22:45, antes de la limpieza                               | 88 %    | 13 GB | **no** había margen para dos servicios: se esperó, sin podar nada                                               |
| 25-11, 05:01:15, tras la limpieza automática (núm. 61, 05:00:05) | 61 %    | 38 GB | ejecución nueva y terminada; la anterior ya vista era la núm. 60                                                |
| 25-11, 15:41, antes de construir                                 | 62 %    | 38 GB | diez horas después; ninguna construcción propia ni ajena en curso                                               |
| 25-11, 15:49, API desplegada                                     | 74 %    | 26 GB | 12 GB, como el 24. Mínimo durante la construcción: 26 GB                                                        |
| 25-11, 15:58, Web desplegada                                     | 85 %    | 15 GB | **11 GB**, y yo contaba con 5: la primera construcción de Web tras la limpieza repuebla su caché. Mínimo: 15 GB |

**Quién ocupa:** cuatro imágenes nuevas, unos 11 GB; y la **caché de construcción**,
que pasó de unos 4 GB a **21 GB** en una mañana. Al empezar la cuarta construcción
se liberaron 8 GB sin que Coolify limpiara nada y con todas las imágenes en su
sitio, así que lo razonable es que la caché se recorta sola al crecer; no encontré
un registro que lo diga, y no cuento con ello para planificar. El archivo de recuperación, su suma y
los otros seis proyectos, intactos: 43 contenedores antes y después.

| Intervención                                                                                                                  | Qué consigue                  | Impacto                                                      | ¿Hace falta tu sí?                                        |
| ----------------------------------------------------------------------------------------------------------------------------- | ----------------------------- | ------------------------------------------------------------ | --------------------------------------------------------- |
| **Ninguna:** desplegar después de las 05:00 UTC, dos por día y un tercero sólo si se mide antes (dos costaron 23 GB el 25-11) | margen de sobra en staging    | ninguno                                                      | no; es lo que se hace                                     |
| Limitar el tamaño de la caché de construcción de Coolify                                                                      | evita el pico de 17 GB        | es del servidor entero: construcciones más lentas para todos | **sí**, y no es urgente                                   |
| Ampliar el disco o separar el servidor antes de producción                                                                    | que quepan cinco recursos más | gasto recurrente                                             | **sí**, antes de los recursos de producción (§5, orden 8) |

## 5 · El orden hacia producción

| Orden | Qué                                                                                                                                                                                                 | Depende de       | Estado                                  |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | --------------------------------------- |
| 1     | Los catorce ajustes, la ayuda pública y lo de §2.9                                                                                                                                                  | —                | ✅ servidos                             |
| 2     | Preparación segura de Sentry                                                                                                                                                                        | —                | ✅ servida, sin DSN                     |
| 3     | Aceptación estética del resultado                                                                                                                                                                   | decisión 1       | pendiente                               |
| 4     | Activar Sentry y sus cinco eventos                                                                                                                                                                  | decisión 3       | preparado                               |
| 5     | Canal de avisos y su recepción                                                                                                                                                                      | decisión 4       | sin empezar                             |
| 6     | Ensayo de recuperación, evidencia y cierre                                                                                                                                                          | decisión 2       | preparado                               |
| 7     | Piloto B, en paralelo: no bloquea ni es bloqueado por producción                                                                                                                                    | decisiones 6 y 7 | preparado                               |
| 8     | Margen del servidor (§4) y una ventana para los parches y el reinicio pendiente                                                                                                                     | 3–6              | hoy no caben cinco recursos con holgura |
| 9     | Recursos **separados**: PostgreSQL por digest, Redis, API, worker y Web; bucket propio; respaldo y retención por decidir                                                                            | 3–6 y 8          | no existen                              |
| 10    | Entorno de producción: 28 valores de arranque, 7 de recorrido y los de construcción de Web, con secretos nuevos y `PSICO_ENV=production`. `EMAIL_ALLOWLIST` ausente y compras cerradas, a propósito | 9                | falta escribir su inventario            |
| 11    | Despliegue de uno en uno, migraciones y contenido                                                                                                                                                   | 10               | procedimiento escrito, nunca ejecutado  |
| 12    | Validación: `ready` con listas vacías, el recorrido de §2.6 del runbook y respaldo con restauración                                                                                                 | 11               | —                                       |
| 13    | **Textos públicos resueltos, o una restricción real de acceso**                                                                                                                                     | decisión 5       | borradores listos                       |
| 14    | Corte: `feelverse.app`, `www` y `api.feelverse.app`, certificado, prototipos en 404 y webhooks                                                                                                      | 12 y 13          | el DNS de `api.feelverse.app` no consta |
| 15    | Siete días de vigilancia                                                                                                                                                                            | 14               | —                                       |
| 16    | Apertura pública                                                                                                                                                                                    | 15 y decisión 5  | —                                       |

**Producción no está preparada** por tener staging sano ni por recibir la
aceptación estética.

## 6 · Lo que hace falta de ti, en concreto

| Para           | Intervención mínima                                                       |
| -------------- | ------------------------------------------------------------------------- |
| Estética       | pegar en la conversación la respuesta que arma la página                  |
| Nivel 4        | «autorizo hasta US$ …» y dejar iniciada tu sesión de OVH: el pago es tuyo |
| Sentry         | entrar en `sentry.io` y decir la región                                   |
| Avisos         | el sí al destino y al alcance, y pegar una clave                          |
| Quién responde | los datos de §2.7 y el nombre de quien valide las líneas                  |
| Piloto         | el sí a B y, por separado, la dirección de la primera persona             |

Lo demás **no espera por ti**: el sí o no al Dúo, salir por etapas, los precios y el
material se hablan cuando existan o cuando quieras moverlos.

## 7 · Lo que esta ficha NO hace

No contrata nada, no activa el canal de avisos ni Sentry, no abre B ni cobros, no
invita a nadie, no publica contenido editorial y no declara ninguna condición
cerrada que no lo esté.

## 8 · Antecedente: qué cambia respecto al 24-11

- **Trece filas pasan a siete.** Terapia deja de ser una decisión: está cerrada.
  Alcance, Dúo, materiales y precios no esperan por ti para avanzar.
- Los recursos de ayuda tienen una fuente común y sólo dicen lo acreditado; lo que
  queda es quién los valida.
- Cuatro de los defectos que salieron al escribir los textos están corregidos; los
  demás siguen en §2.10, cada uno con su impacto y su siguiente acción.
- Los eventos de Sentry son **cinco**, no cuatro, y la cifra del servidor de Web de
  la ficha anterior no tenía respaldo (§2.3).

## 9 · Antecedente: qué cambió el 24-11 respecto al 23-11

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
