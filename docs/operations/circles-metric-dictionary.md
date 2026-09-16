# Círculos · diccionario de métricas

**Versión 1 · 2026-09-15.** Cambiar una definición es publicar una versión
nueva de este documento, no editar una fila: un número cuyo significado cambió
en silencio es peor que un número que falta.

> Este panel describe **uso, viabilidad y fricción**. No mide eficacia
> terapéutica, no representa a ninguna población y no dice nada sobre la
> relación entre dos personas. Adopción no es utilidad, y utilidad percibida no
> es eficacia.

---

## 0 · Los tres planos, y por qué no se mezclan

| Plano             | Qué contiene                                          | Quién lo ve                          | Retención           |
| ----------------- | ----------------------------------------------------- | ------------------------------------ | ------------------- |
| **Dominio**       | La actividad: sobres cifrados, acuerdos, sesiones     | Las dos personas, según sus permisos | La del producto     |
| **Logs técnicos** | Ruta normalizada, código, duración, id de correlación | Operación                            | La de la plataforma |
| **Analítica**     | Sólo agregados y contribuciones voluntarias           | ADMIN                                | 30 días / 12 meses  |

Sus finalidades no son intercambiables. Un número de este panel **nunca** se
obtiene leyendo un sobre, y el panel no tiene ninguna ruta que devuelva una
fila.

### El identificador, dicho con su nombre

`participantId` es el **asiento**: una persona en **una** actividad. Sirve para
deduplicar («esta ayuda la abrió la misma persona dos veces») y es
**seudónimo**, no anónimo — sigue apuntando a una membresía. No viaja entre
actividades y no es un identificador de navegación.

Un invitado puede aparecer en varias actividades con asientos distintos. Por
eso «10 contribuyentes» **no** es «10 personas anónimas», y por eso desde los
grupos se pide además un mínimo de salas distintas (§7).

---

## 1 · Hitos del dominio

Todos salen de columnas que escribió una transacción confirmada. Ninguno se
deriva de un clic del navegador.

| Métrica                   | Fuente                                        | Unidad       | Numerador      | Denominador                              | Ventana      | Deduplicación              | Ausencia                          | Sensibilidad | Retención |
| ------------------------- | --------------------------------------------- | ------------ | -------------- | ---------------------------------------- | ------------ | -------------------------- | --------------------------------- | ------------ | --------- |
| `invitaciones_creadas`    | `CircleInvitation.createdAt`                  | invitaciones | filas creadas  | —                                        | cohorte fija | una fila por invitación    | —                                 | baja         | dominio   |
| `invitaciones_aceptadas`  | `CircleInvitation.acceptedAt`                 | invitaciones | aceptadas      | invitaciones **elegibles** de la cohorte | cohorte fija | timestamp, se fija una vez | nulo = no aceptada                | baja         | dominio   |
| `invitaciones_declinadas` | `declinedAt`                                  | invitaciones | declinadas     | ídem                                     | cohorte fija | ídem                       | —                                 | baja         | dominio   |
| `invitaciones_caducadas`  | `expiresAt < ahora` y sin aceptar ni declinar | invitaciones | caducadas      | ídem                                     | cohorte fija | ídem                       | **no es un rechazo**: es el reloj | baja         | dominio   |
| `actividades_creadas`     | `CircleActivity.createdAt`                    | actividades  | filas          | —                                        | cohorte fija | una por actividad          | —                                 | baja         | dominio   |
| `actividades_reveladas`   | `revealedAt`                                  | actividades  | reveladas      | creadas en la cohorte                    | cohorte fija | timestamp                  | nulo = aún no                     | baja         | dominio   |
| `actividades_cerradas`    | `closedAt`                                    | actividades  | cerradas       | ídem                                     | cohorte fija | timestamp                  | nulo = aún no                     | baja         | dominio   |
| `actividades_canceladas`  | `cancelledAt`                                 | actividades  | canceladas     | ídem                                     | cohorte fija | timestamp                  | —                                 | baja         | dominio   |
| `actividades_pendientes`  | sin `closedAt` ni `cancelledAt`               | actividades  | pendientes     | ídem                                     | cohorte fija | —                          | **censuradas**, no fracasos       | baja         | dominio   |
| `acuerdos_propuestos`     | `CircleArtifact.createdAt`                    | versiones    | filas          | —                                        | cohorte fija | una por versión            | —                                 | baja         | dominio   |
| `acuerdos_confirmados`    | `CircleArtifact.agreedAt`                     | versiones    | con `agreedAt` | propuestos                               | cohorte fija | timestamp                  | nulo = sin acuerdo                | baja         | dominio   |

**«Enviadas» no existe.** El enlace lo comparte una persona por el canal que
elija, fuera de la app. Contar «enviadas» sería inventar un hito que nadie
observó.

**Un reintento técnico es una petición más, no una aceptación más.** La
aceptación es un timestamp que se fija una vez.

---

## 2 · Tiempos entre hitos

| Métrica                 | Fuente                                            | Unidad  | Estadístico                        | Ventana      | Ausencia                 |
| ----------------------- | ------------------------------------------------- | ------- | ---------------------------------- | ------------ | ------------------------ |
| Invitación → aceptación | `createdAt` → `acceptedAt`                        | minutos | mediana; p90 sólo con ≥10 muestras | cohorte fija | sólo las aceptadas       |
| Creación → revelado     | `createdAt` → `revealedAt`                        | minutos | ídem                               | cohorte fija | sólo las reveladas       |
| Revelado → cierre       | `revealedAt` → `closedAt`                         | minutos | ídem                               | cohorte fija | sólo las cerradas        |
| Entrar → confirmar      | `CircleActivityParticipant.createdAt` → `readyAt` | minutos | ídem                               | cohorte fija | sólo quienes confirmaron |

**No hay «tiempo pensando» ni «tiempo activo».** La diferencia entre dos
timestamps es tiempo transcurrido: incluye cenar, dormir y cambiar de opinión.
Llamarlo atención sería inventar una observación que no se hizo.

Un p90 sobre cuatro muestras es el máximo con un nombre elegante, así que por
debajo del umbral se devuelve `null`.

---

## 3 · Temas: dos dimensiones distintas

|                 | Tema **editorial**                         | Tema **autodeclarado**                  |
| --------------- | ------------------------------------------ | --------------------------------------- |
| Qué es          | Etiquetas cerradas de la plantilla         | Lo que una persona eligió decir         |
| Quién lo decide | Quien escribió la actividad                | La persona, después y si quiere         |
| Qué mide        | Qué actividad se usó                       | Qué dijo alguien que tocaba             |
| Fuente          | `CircleActivityDefinition.topics`          | `CircleFeedback.topics`                 |
| Sensibilidad    | baja                                       | **alta**                                |
| Supresión       | no aplica: no hay nadie detrás de la celda | sí, ≥10 contribuyentes y ≥3 actividades |
| Retención       | del catálogo                               | 30 días la fila; 12 meses el agregado   |

Se muestran en secciones separadas, y nunca en la misma columna. Sumarlos
produciría un número que nadie puede interpretar.

**Ninguno es un diagnóstico.** «Preocupaciones y ansiedad» es una palabra que
dos personas pueden usar sobre un martes.

---

## 3B · Modalidad y tamaño

Desde los Círculos de 3 a 6 hay dos formas de actividad, y el panel las cuenta
por separado — `Dúo (2 personas)` y `Grupo de N` para cada N que exista.

|                |                                                               |
| -------------- | ------------------------------------------------------------- |
| Fuente         | `CircleActivity.kind` y `CircleActivity.requiredParticipants` |
| Qué cuenta     | **actividades**, no personas                                  |
| Supresión      | no aplica: nadie está detrás de una celda                     |
| Corte temporal | la ventana completa, **no** por semana                        |

Dos decisiones que parecen detalles y no lo son:

- Se lee el tamaño de **la actividad**, no el rango de la plantilla. Una
  plantilla que admite de tres a seis no dice cuántas personas hay en esta sala,
  y la pregunta operativa es sobre las salas que existen.
- **No** se desglosa por semana. Un conteo de actividades por modalidad, por
  tamaño y por semana empieza a señalar una actividad concreta, que es
  exactamente lo que el resto del documento evita.

---

## 4 · Utilidad percibida

| Métrica             | Fuente                                       | Unidad         | Numerador         | Denominador                      | Deduplicación   | Ausencia                                    | Sensibilidad | Retención          |
| ------------------- | -------------------------------------------- | -------------- | ----------------- | -------------------------------- | --------------- | ------------------------------------------- | ------------ | ------------------ |
| `utilidad`          | `CircleFeedback.usefulness`                  | contribuciones | Sí / Un poco / No | contribuciones **con respuesta** | una por asiento | omitir ⇒ `null`, nunca una cuarta categoría | alta         | 30 días / 12 meses |
| `tasa_de_respuesta` | contribuciones ÷ participantes de la cohorte | proporción     | contribuciones    | participantes                    | ídem            | —                                           | media        | ídem               |

No se supone utilidad por haber terminado, y la respuesta de una persona no
dice nada de la otra. Las valoraciones no se comparten entre participantes.

---

## 5 · Ayuda de Echo

| Métrica               | Fuente                             | Unidad    | Deduplicación                  | Cobertura   | Sensibilidad | Retención          |
| --------------------- | ---------------------------------- | --------- | ------------------------------ | ----------- | ------------ | ------------------ |
| `ayuda_aperturas`     | `CircleHelpOpen.opens`             | aperturas | por (asiento, pregunta, pieza) | **parcial** | media        | 30 días / 12 meses |
| `ayuda_participantes` | asientos distintos con ≥1 apertura | asientos  | ídem                           | **parcial** | media        | ídem               |

**La cobertura es parcial a propósito.** Los contadores viven en la memoria del
navegador durante la preparación privada y se envían **sólo** si la persona
acepta contribuir al final. Quien abandona, recarga o dice que no, no aparece.

La alternativa era una petición durante la preparación, y una petición cuyo
**momento** dice que alguien se atascó en una pregunta es una observación sobre
alguien pensando. Se prefirió el hueco.

---

## 6 · Lo que deliberadamente no se captura

- Pulsaciones, valores, longitudes de respuesta, focos de campo.
- Qué se decidió en la compuerta de seguridad, cuánto se leyó o cuánto se tardó.
- Nombres de emociones escritos por nadie.
- Beacons, heartbeats o `flush` al salir durante la preparación o el preview.
- Session replay, grabaciones, fingerprinting, SDK de marketing.
- Cualquier análisis semántico de sobres, borradores, acuerdos, Diario o Eco.

El polling existente **no** se aumentó para medir actividad.

---

## 7 · Supresión y exportación

- Umbral: **10 contribuyentes distintos y 3 actividades distintas** por celda.
  Por debajo de cualquiera de los dos se muestra `muestra insuficiente`, **no**
  cero.
- **Por qué dos y no uno.** El umbral de diez se escribió cuando toda actividad
  tenía dos asientos: diez contribuyentes implicaban al menos cinco salas, así
  que ninguna sala podía restarse a sí misma y quedarse mirando otra
  identificable. Un grupo de seis rompe esa aritmética — dos salas dan doce
  contribuyentes, y cada organizadora conoce los seis suyos, de modo que
  restarlos deja las respuestas de la otra sala a la vista desde una celda que
  la regla vieja llamaba segura. Tres, y no dos: con dos salas, restar la tuya
  deja exactamente una; con tres deja dos combinadas, que es el número más
  pequeño que no es una sola sala disfrazada de total. Es un juicio, no una
  derivación, y se inclina a decir menos.
- Un hecho semanal ya plegado conserva **ambas** entradas de supresión
  (`contributors` y `activities`). Sin la segunda, toda celda envejecida
  quedaría suprimida para siempre — seguro, y también inútil.
- La supresión ocurre al formar los datos, así que la API, la pantalla y el CSV
  la heredan: no hay una ruta que devuelva la celda cruda.
- **Vistas fijas, sin filtros combinables.** Una celda suprimida con umbral 10
  se reconstruye trivialmente si se puede pedir la misma celda de cuatro
  maneras y restar.
- El CSV lleva el diccionario, el rango, el umbral y la nota de cobertura. Un
  CSV de números pelados es un CSV que alguien pegará en una diapositiva con un
  título seguro.
- **El umbral reduce exposición; no garantiza anonimato.** Ver
  [NIST SP 800-188](https://csrc.nist.gov/pubs/sp/800/188/final): quitar
  nombres o aplicar hash no es anonimizar.

---

## 8 · Retención y retirada

| Dato                               | Plazo        | Mecanismo                                |
| ---------------------------------- | ------------ | ---------------------------------------- |
| `CircleFeedback`, `CircleHelpOpen` | **30 días**  | barrido idempotente del worker existente |
| `CircleWeeklyFact`                 | **12 meses** | el mismo barrido                         |

Retirar el permiso —o borrar la cuenta— elimina las contribuciones vinculables
de esos asientos. **Lo que ya se plegó en un agregado no se puede restar**: el
agregado no tiene asiento dentro. Ese límite se dice donde se hace la promesa.

Esto **no** cambia la política de artefactos ni la retención del ledger, y no
se borra ningún dato histórico del usuario para hacer sitio a métricas.

---

## 9 · Lo que haría falta antes de investigar

Esta entrega permite describir uso, viabilidad, fricción, temas declarados y
utilidad percibida. **No** demuestra eficacia ni representatividad.

Antes de recoger cualquier medida de investigación hay que decidir, y escribir:
la pregunta, el protocolo, el consentimiento específico, las medidas
apropiadas y la evaluación ética aplicable. El consentimiento de la actividad,
el de la analítica opcional y el de investigación son tres cosas distintas y
ninguno sustituye a los otros.
