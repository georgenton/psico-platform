# Piloto mínimo — propuesta para revisión

**Fecha:** 2026-10-24 (segunda versión) · **Estado:** propuesta, **no** una
autorización. Nada de aquí abre rollout, publica contenido ni activa cobros.

Construida sobre lo que el entorno **hace**, comprobado una función a una:
[validación del 24-10](../informes/validacion-2026-10-24-experiencia-y-ensayo.md)
· [preparación del piloto](../informes/preparacion-piloto-2026-10-24.md) ·
[UAT del 23-10](../informes/uat-2026-10-23-cierre-staging.md).

**La regla que ordena la lista:** una función entra si una persona puede
recorrerla, si ese recorrido está comprobado, si sus dependencias existen y si
sus límites están dichos. **Que exista en la API no basta.**

---

## 1. Qué incluye, y con qué respaldo

| Recorrido                                  | Evidencia                                                                                                                                                                                                | Dependencias           | Sus límites                                                                                                                                                       |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Registro y acceso**                      | Cuenta creada por el flujo normal y acceso por el formulario, comprobados el 24-10                                                                                                                       | ninguna extra          | Ningún guard exige el correo verificado, así que el alta funciona aunque el correo no salga                                                                       |
| **Lectura de _EEC_**                       | Capítulo 1 abierto con **188 bloques** reales; diez capítulos en sus tres partes                                                                                                                         | ninguna extra          | **50 de esos 188 bloques muestran asteriscos literales** (ver §4)                                                                                                 |
| **Progreso: salir y volver**               | Comprobado por API _y_ por pantalla: «CONTINÚA TU RECORRIDO» devuelve al capítulo                                                                                                                        | ninguna extra          | —                                                                                                                                                                 |
| **Marcas y notas**                         | Una anotación sube `marcasLectura` de 0 a 1, persiste y no se filtra a otra cuenta                                                                                                                       | ninguna extra          | El resaltado por carácter no existe en móvil (v1 por bloque)                                                                                                      |
| **Diario cifrado**                         | Entrada escrita, releída tras reabrir sesión, y **recuperada con la frase de respaldo** tras restablecer la contraseña                                                                                   | ninguna extra          | Sin la frase, una contraseña nueva **no** reabre el diario. La pantalla ya lo dice                                                                                |
| **Mapa Emocional**                         | Tras leer un capítulo sigue en **0/6** ejes: leer no fabrica emoción                                                                                                                                     | ninguna extra          | Necesita check-ins para encenderse; con poca historia dice «Reuniendo datos»                                                                                      |
| **Mi Evolución**                           | Contadores reales, con aislamiento entre cuentas                                                                                                                                                         | ninguna extra          | —                                                                                                                                                                 |
| **Descargar mis datos**                    | Recorrido completo por API (202 → `READY` en 1,17 s → URL firmada → 2 837 bytes) y **superficie web nueva** en Cuenta y privacidad                                                                       | R2                     | El archivo trae ocho secciones y **nombra** lo que no trae. Sin `RESEND_API_KEY` no llega el aviso de «ya está lista»: hay que consultar el estado en la pantalla |
| **Los dos estilos y los cuatro ambientes** | Las **ocho** combinaciones recorridas con los controles reales: todas cambian, ninguna desborda, ningún texto por debajo de su piso de contraste                                                         | ninguna extra          | Recorrido en panel y biblioteca; no se midió pantalla por pantalla en todo el producto                                                                            |
| **Eco (conversar)**                        | Camino normal comprobado con cuenta sintética: SSE 200, respuesta de 631 caracteres en español, turno del usuario persistido **cifrado** y el de Eco en claro (ADR 0007 §C). Coste observado **$0,0043** | `ANTHROPIC_API_KEY` ✅ | Cuota FREE de **10 mensajes/día**. El modelo no puede releer el diario: conversa sobre lo presente. Sin reintento si se corta el SSE a mitad                      |

---

## 2. Qué queda fuera, y por qué

| Recorrido          | Motivo                                                           | Qué faltaría para entrar              |
| ------------------ | ---------------------------------------------------------------- | ------------------------------------- |
| **Modo guiado**    | Decisión **editorial** (publicar) más decisión de **rollout**    | Las dos, en ese orden                 |
| **Dúo / Círculos** | Su propia puerta de rollout                                      | Abrirla, que este piloto no necesita  |
| **Cobros**         | Cerrados por decisión; D-ORD operativo y comercial sigue abierto | Los seis criterios del ADR            |
| **Voz**            | Depende de cuota Pro, y Pro no se vende aquí                     | Alcance, no avería: técnicamente vivo |
| **Terapia**        | Detrás de su flag, v2                                            | —                                     |
| **Móvil**          | El piloto se camina en web                                       | Su propia validación                  |
| **Producción**     | No desplegada en Coolify                                         | Su propio gate                        |

---

## 3. Integraciones, recorrido por recorrido

| Integración          | Estado                | Qué recorrido necesita                                                                                                                                                                   |
| -------------------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Base, Redis, R2      | ✅                    | **Todo.** Imprescindibles                                                                                                                                                                |
| `ANTHROPIC_API_KEY`  | ✅                    | Eco y la narrativa del Mapa                                                                                                                                                              |
| `OPENAI_API_KEY`     | ✅                    | Voz. Fuera de alcance                                                                                                                                                                    |
| `STRIPE_*` (5)       | ✅, **modo test**     | Nada aquí: los cobros están cerrados                                                                                                                                                     |
| **`RESEND_API_KEY`** | ❌                    | **Restablecer la contraseña por correo**, el digest semanal y el aviso de exportación lista. **No** bloquea registro, lectura, diario, mapa ni la descarga (que se consulta en pantalla) |
| `GOOGLE_CLIENT_ID`   | ❌, **bien resuelto** | Sólo «Acceder con Google». Sin la clave, ni `/login` ni `/register` muestran el botón ni la palabra: el producto no ofrece lo que no puede cumplir. **No es una decisión del piloto**    |
| `VAPID_*`            | ❌                    | Sólo push web                                                                                                                                                                            |
| `SENTRY_DSN`         | ❌                    | Ningún recorrido de la persona. Lo que se pierde es **nuestra** traza                                                                                                                    |

### Antes de encender el correo, una precondición que nadie había visto

Staging tiene **7 cuentas**: cinco sintéticas `@psico.test` —que por la
RFC 2606 **no pueden recibir correo**— y **dos con dirección real**, las dos
del propietario, **las dos suscritas al digest semanal**.

El cron del digest corre **cada hora** y envía a quien cumpla su lunes 07:00
local. Así que poner `RESEND_API_KEY` sin más **mandaría correo real a esas
dos bandejas** el lunes siguiente, sin que nadie lo hubiera pedido.

La preparación exacta, en este orden:

1. Dar de baja del digest a las dos cuentas de dirección real, o dejar escrito
   que se acepta recibirlo. Es la decisión del dueño de esas cuentas, no mía,
   así que queda propuesta y no ejecutada.
2. Sólo entonces, configurar `RESEND_API_KEY` en **API y worker**.
3. Comprobar el envío contra una cuenta `@psico.test`, que no puede salir.

---

## 4. Lo que no hay que confundir

| Frente          | Comprobado                                                                                                                                                                                | Pendiente                                                                                                                        |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| **Eco**         | El **camino normal** y el **error controlado**: una conversación real por SSE (631 caracteres, $0,0043 observados) y, por separado, el fallo que llega sin `delta` y sin llamar al modelo | Nada del recorrido. Queda la **cuota** por ejercer: nadie ha chocado con el tope de 10/día                                       |
| **Retención**   | El **planificador**: los crons corren y evalúan el filtro por huso                                                                                                                        | La **entrega completa**: corrieron con `candidates=0` y sin correo configurado                                                   |
| **Exportación** | El **recorrido completo**, worker incluido, y ahora con pantalla                                                                                                                          | Su **alcance**: ocho secciones, lo ausente nombrado, y material bajo **D-EXP** que ni viaja ni se nombra una por una             |
| **Modo guiado** | Que el **contenido existe**: cinco microguías de C01 en el catálogo de Guide                                                                                                              | La **aprobación editorial**, la **disponibilidad** (`GUIDE_ROLLOUT_MODE=off`) y su **UAT**, que no puede hacerse sin lo anterior |
| **Lectura**     | 188 bloques reales, legibles en los ocho estilos × ambientes                                                                                                                              | **50 bloques (27 %) muestran Markdown literal** — `**Idea clave:**` en vez de negrita. Ver abajo                                 |

### Los asteriscos, y por qué no se arreglan desde el lector

El formato editorial del lector son **marcas estructuradas** (desplazamientos
en `meta`), no Markdown dentro del texto. La ingesta de la Parte I guardó el
Markdown **dentro de `content`** y sin marcas, así que el lector lo imprime
tal cual.

Quitar los asteriscos al renderizar sería peor que dejarlos: los
**resaltados** guardan sus desplazamientos contra ese mismo `content`, y
borrar caracteres correría todos los de después. Las marcas de la gente
acabarían señalando otro texto.

El arreglo correcto cambia el dato —contenido sin asteriscos, marcas
equivalentes, y los desplazamientos de los resaltados existentes rebasados—
conservando los `blockId`. Es una operación de datos sobre contenido
editorial, con su propia ventana, y **no se hizo aquí**.

**Decisión para el piloto:** o se acepta que la primera persona vea asteriscos
en poco más de una cuarta parte del capítulo, o esa operación va antes.

---

## 5. Decisiones que hacen falta

1. **¿Se configura `RESEND_API_KEY`?** Con su precondición del §3. Sin ella no
   hay restablecimiento por correo, así que **no se recupera el acceso** a una
   cuenta cuya contraseña se olvidó. Crear otra cuenta **no es recuperarla**:
   el diario de la primera sigue cifrado donde estaba y la nueva empieza vacía.
2. **¿Se arreglan los asteriscos antes del piloto?** §4.
3. **¿Se configura `SENTRY_DSN`?** Traza frente a reproducción.
4. **¿Se publica alguna microguía de C01?** Editorial, ADR 0027/0028.
5. **¿Se abre `GUIDE_ROLLOUT_MODE`?** Sólo después de la 4.

---

## 6. Criterios

### De entrada

- [x] **QA autenticada completada** — hecho el 24-10: panel y lector en los dos
      estilos × cuatro ambientes, con evidencia.
- [x] **Recuperación de cuenta comprobada** — hecha: restablecimiento por el
      flujo previsto, la contraseña vieja deja de valer. _Con el correo
      configurado hay que repetirla por su transporte real._
- [x] **Recuperación del diario comprobada** — hecha: la frase de respaldo
      devuelve el contenido original. El diario entra en el piloto.
- [x] **Exportación web validada** — recorrida en staging el 25-10 con cuenta
      sintética: pedir → «preparando» → consultar → «Lista», con el enlace
      apuntando a R2 y `rel="noopener noreferrer"`.
- [x] **Eco validado** — hecho el 24-10: conversación normal con cuenta
      sintética, cifrado persistido conforme al ADR 0007 §C, coste acotado
      antes de gastar y observado después. Eco entra en el alcance.
- [ ] **Versiones y readiness identificados** — el SHA del repositorio y el de
      cada artefacto servido, por separado, y
      `GET /api/health/ready` con `shippedCount == appliedCount`.
      Ojo con «el artefacto servido» en singular: son **tres** y no siempre
      coinciden (ver el runbook §3.1).
- [ ] Decisiones 1 y 2 del §5 **tomadas**.
- [ ] Una **persona a la vez**, avisada de que es staging, de que recuperar la
      cuenta y recuperar el diario son cosas distintas, y de que conviene
      guardar la frase de respaldo al crearla.
- [ ] Cuenta creada por **registro normal**, nunca sembrada.

### De salida

La persona **lee un capítulo completo**, sale y vuelve y el progreso está donde
lo dejó; **marca o anota** algo y lo encuentra después; **escribe en el
diario**, cierra sesión, vuelve y lo descifra; **pide y descarga su
exportación** desde la pantalla; ve su **Mapa** y su **Evolución** sin que
ninguna cifra la sorprenda. Ningún P0 ni P1 abierto de su recorrido.

**Eco sí está en los criterios de salida:** la persona **conversa con Eco** y
la respuesta llega; si choca con la cuota, el aviso lo explica en vez de
fallar en silencio.

### De suspensión

Pérdida o corrupción de lo que escribió · texto del diario fuera del cliente
(registro, respuesta o correo) · un cobro de cualquier importe · una crisis mal
atendida (el modal que no aparece o el número que no se marca) · una obra
retirada que vuelva a servirse · dos personas que vean datos de la otra ·
`GET /api/health/ready` no conforme a mitad del piloto.
