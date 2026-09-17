# ADR 0015 — Incorporación flexible en Círculos: capacidad, grupo y confirmaciones

**Estado:** aceptada · **Fecha:** 2026-09-17 · **Ámbito:** Círculos (Dúo y grupos adultos)

## Contexto

La cantidad inicialmente invitada funcionaba como **obligación de asistencia**.
Una sala de tres con una sola persona invitada aceptando no podía abrirse
nunca, y la pantalla le decía a quien organizaba que «esta actividad ya no
admite cambios» — sobre una actividad que funcionaba perfectamente y
simplemente estaba esperando gente. Ese mensaje es el defecto observado que
motiva el bloque.

La causa no era la copia. Era que **un solo número significaba cuatro cosas**:

| significado                             | quién lo leía                    |
| --------------------------------------- | -------------------------------- |
| cuántas personas **podrían** participar | la pantalla de crear, el preview |
| cuántas **aceptaron**                   | nadie: no existía                |
| qué grupo **compartirá** la actividad   | la barrera de revelación         |
| cuántas **confirmaron** contenido       | `readyCount`                     |

`requiredParticipants` era los cuatro a la vez, y la barrera lo leía como los
dos últimos.

## Decisión

### 1 · `requiredParticipants` conserva **un** significado: capacidad

Es lo que eligió quien organiza y lo que se le dice a cada persona **antes** de
aceptar. No se renombra: para un Dúo y para toda sala creada antes de este
cambio, capacidad y grupo son el mismo número, así que todos los lectores
actuales siguen teniendo razón.

### 2 · El grupo definitivo es una columna propia, escrita una vez

`CircleActivity.confirmedParticipants` es nulo mientras la incorporación está
abierta y se escribe **una sola vez** cuando quien organiza continúa. La
barrera de revelación lee `COALESCE(confirmedParticipants, requiredParticipants)`,
que es exactamente el comportamiento anterior para cualquier sala que no fije
un grupo.

Un trigger lo congela: mover el grupo después de fijarlo significaría que la
selección de alguien llega a una audiencia que no vio.

### 3 · Las reglas son **por actividad**, no por plantilla ni por versión

`CircleActivity.onboarding` (`FIXED` | `FLEXIBLE`), inmutable, con `FIXED` por
defecto.

Se consideró marcar las reglas en la versión de plantilla. Se descartó: la
versión de plantilla gobierna **contenido** —qué preguntas se hacen— y
mezclarle una regla de protocolo obligaría a publicar una versión nueva para
cambiar algo que no es editorial. La columna es el mecanismo mínimo que sobrevive
a un despliegue en curso: una instancia anterior que inserte sin escribirla
obtiene `FIXED`, que es la regla que ya obedecía.

**Las salas existentes conservan las reglas con las que entraron sus
participantes.** Nada se reescribe ni se reinterpreta.

### 4 · Los Dúos siguen siendo `FIXED`

Un Dúo son dos personas por definición: «continuar con quienes aceptaron» es o
las dos o ninguna. Sus garantías quedan intactas y no se convierte
retroactivamente en otra modalidad.

### 5 · El cierre es del organizador, atómico, y no elige a nadie

Una sola sentencia condicional fija el grupo; en la misma transacción se
revocan las invitaciones no redimidas y se **borran** los asientos que nadie
ocupó. Borrar y no marcar: un asiento que nunca se tomó no es alguien que se
retiró —decirlo en el registro sería inventar una decisión— y una fila en
`INVITED` es una fila que la barrera cuenta, es decir, una sala cerrada para
siempre.

No hay forma de dejar a alguien fuera: entra todo el que aceptó, y el comando
no lleva argumentos. Quien quiera una sala más pequeña invita a menos gente.

**La carrera tiene dos finales y sólo dos.** Ambos comandos toman las
invitaciones antes que la actividad (orden compartido de locks), así que una
aceptación simultánea o llegó antes —su asiento está `ACCEPTED`, el recuento la
incluye— o llega después y encuentra su invitación revocada, que se rechaza
igual que un enlace caducado.

### 6 · Preparar y confirmar son actos distintos, y la API los nombra distinto

Confirmar mientras la sala sigue incorporando gente ya no responde el opaco
`CIRCLE_ACTIVITY_UNAVAILABLE`, sino `CIRCLE_ONBOARDING_OPEN`. Es una excepción
deliberada a la regla de respuestas opacas: quien pregunta es alguien **que ya
está dentro de la sala**, así que no confirma nada que no sepa, y la pantalla
necesita poder decir «todavía no» en vez de «demasiado tarde».

Lo mismo con `CIRCLE_GROUP_TOO_SMALL`, que sólo puede verlo quien organiza.

### 7 · Visibilidad de incorporación, no de contenido

El bloque `onboarding` del read model lleva capacidad, aceptados, grupo y una
lista con tres estados: **Organiza**, **Participa**, **Invitación pendiente**.

La forma no puede expresar otra cosa: no hay valor para «ya confirmó», «está
escribiendo», «todavía no responde» ni «no compartió». Los asientos retirados
se omiten en vez de listarse como ausentes, porque nombrarlos publicaría una
decisión que la salida privada existe para no publicar.

Las invitaciones pendientes se etiquetan por asiento —«Invitación 2»— y sólo
las ve quien organiza. El producto no sabe a quién se envió cada enlace, e
inventar un destinatario es peor que admitirlo.

### 8 · Alias

`CircleActivityParticipant.alias`, opcional, elegido al aceptar. Es **dato
personal** y no identidad verificada; la pantalla lo dice. Vive exactamente lo
que vive su asiento y desaparece con él; no viaja a Pulso, analytics, trazas ni
al registro de eventos —cuya gramática cerrada no tiene dónde ponerlo—. El
validador excluye direcciones y números sueltos para que un dato de contacto no
acabe en la pantalla de todo el grupo.

## Consecuencias

- Una sala prevista para seis puede continuar con dos, y la interfaz lo explica
  en vez de dar un error.
- El barrido temporal cambia de política **sólo** para salas flexibles: una
  invitación muerta ya no cancela una sala donde hay gente suficiente; se
  cancela sólo cuando ya no queda ningún enlace redimible y hay menos de dos
  personas dentro. Las salas `FIXED` conservan su regla.
- Las pruebas que fijaban «asistencia obligatoria de todos los invitados» se
  sustituyen por la propiedad nueva, no se borran.
- Queda fuera de este bloque, deliberadamente: reabrir la incorporación, añadir
  personas después, quórums, votos, expulsiones tras confirmar, revelaciones
  parciales y transferencia de propiedad.
