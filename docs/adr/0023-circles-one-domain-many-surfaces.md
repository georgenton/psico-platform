# ADR 0023 — FeelVerse Círculos: un dominio relacional, Dúo como primera superficie

```
STATUS=ACCEPTED
CUT=PR2 · feat/circles-domain-foundation
BASE_SHA=c824a6a4ebb50c9dc619c29ddb896e60f3efcdd3

CIRCLES_IS_ITS_OWN_AGGREGATE=true
GUIDE_SESSION_REUSED_AS_SHARED_SESSION=false
GUIDE_SESSION_FILES_CHANGED=0
ACTOR_IS_SERVER_OWNED=true
PRIVATE_PREPARATION_PERSISTED=false
SHARED_CONTENT_IS_E2E=false
POSTGRES_IS_CORRECTNESS_AUTHORITY=true
REDIS_CORRECTNESS_AUTHORITY=false
TEMPLATE_CMS_BUILT=false
PUBLISHED_TEMPLATES=0
IMPLEMENTATION_AUTHORIZED=PR2
CIRCLES_ROLLOUT_MODE=off
PUBLIC_ACCESS_ENABLED=false

ISSUE_639_IMPLEMENTATION_COMPLETE=true
ISSUE_639_FROZEN=true
ISSUE_639_CLOSED=false
```

La arquitectura completa —modelo de datos, máquinas de estados, matriz de
permisos, threat model, tren de PRs y decisiones pendientes— vive en
[`docs/architecture/circles-v1.md`](../architecture/circles-v1.md). Este ADR
registra las **decisiones** y por qué se tomaron así.

El merge de este ADR constituyó **aprobación de contrato**. PR2 añade la base
persistente y de acceso descrita en §6; no autoriza participación, revelación,
artefactos, UI ni despliegue habilitado.

Relacionados: [ADR 0007](./0007-e2e-encryption-diario-eco.md) ·
[ADR 0016](./0016-content-core-work-edition-revision.md) ·
[ADR 0021](./0021-experience-player-v2-scene-step-separation.md) ·
[ADR 0022](./0022-guide-lineage-active-scope.md) · issue #639.

---

## 1. Contexto

FeelVerse necesita actividades que dos personas realizan **juntas**: cada una
prepara en privado, ambas eligen qué comparten, nadie ve lo de la otra hasta que
las dos han confirmado, y queda un resultado común que puede revisarse después.

El repositorio ya tiene casi toda la infraestructura necesaria —contratos
compartidos, OpenAPI, Prisma/PostgreSQL, locks probados, idempotencia, rate
limiting, rollout `off/pilot/on`, cookies HttpOnly en el BFF de Next, worker
BullMQ— y **nada** del dominio relacional: no hay círculo, miembro, invitación,
invitado, actividad compartida ni artefacto. Los `DUO_CANDIDATES` que aparecen
en los capítulos de _Parejas que perduran_ son borradores editoriales que lo
declaran en su propio comentario.

La pregunta a decidir era dónde vive ese dominio.

> **Estado de #639.** Su arco de implementación está completo y **congelado**,
> y el issue sigue **abierto**. Congelado no es cerrado: este ADR no lo cierra,
> no lo reabre y no toca el issue remoto. Lo único que afirma es que Círculos
> no debe apoyarse en `GuideSession` — ver §2.1.

---

## 2. Decisión

### 2.1 Un dominio propio, no una extensión de Guide

Círculos es su **propio agregado**, en un `CirclesModule` dentro de la API
actual. Dúo es su primera configuración (`Circle.kind = DUO`), no otro backend.

La alternativa seria era injertarlo en `GuideSession`, y se descarta: esa sesión
representa **progreso individual autenticado** —está ligada a `userId`, su
idempotencia es por usuario y su unicidad `ACTIVE` es por lineage (ADR 0022,
issue #639: implementación completa, congelada y **todavía abierta**)—. Círculos
necesita invitaciones, participantes,
consentimiento, barrera de revelación, artefactos compartidos, retiro y acceso
temporal **sin cuenta**. Convertir `GuideSession` en un actor genérico
reabriría trabajo congelado y mezclaría progreso individual con consentimiento
relacional.

Una `CircleActivity` **puede referenciar** una Experience o Guide como fuente
editorial. No hereda su lifecycle.

### 2.2 El esquema admite N participantes; el producto expone dos

`participants { min, max, required }` en vez de suponer dos. Lo que mantiene
Familia y grupos fuera de v1 no es un esquema que habrá que reformar, sino que
`audience` tiene **un solo valor** (`DUO_ADULT`) y el validator lo fija a 2/2/2.

### 2.3 El actor lo construye el servidor

```ts
type CircleActor =
  | { kind: "USER"; userId: string }
  | {
      kind: "GUEST";
      guestSessionId: string;
      activityId: string;
      participantId: string;
    };
```

Ningún cuerpo de petición acepta `userId`, `participantId` ni rol. Un invitado no
es un miembro ligero: su identidad incluye **la** actividad a la que pertenece,
de modo que toda lectura queda acotada por construcción y no por recordar
filtrar.

### 2.4 La preparación privada no llega al servidor

No se crea `PrivateResponse` ni ningún campo equivalente. El borrador vive en
memoria del cliente y se pierde al recargar —la interfaz debe avisarlo—. Solo el
snapshot que la persona **previsualiza y confirma** cruza la red.

Es la solución más pequeña compatible con personas sin cuenta, y evita inventar
recuperación criptográfica para invitados. Si la investigación demuestra que
recuperar borradores importa, se añade persistencia E2E por dispositivo en una
PR aparte.

### 2.5 Lo compartido se cifra en la aplicación, y se dice así

El contenido confirmado se guarda como `ciphertext + nonce + keyVersion`,
cifrado por la API con una clave específica de Círculos que nunca llega a
`NEXT_PUBLIC_*` ni al navegador.

**Límite honesto:** esto **no es E2E**. El servicio puede descifrar lo
compartido —tiene que poder, para servirlo en otro dispositivo y para construir
el contexto de Eco Facilitador— y la interfaz debe decirlo en lenguaje
comprensible. Lo que sí queda fuera del servidor, cifrado o no, es la
preparación privada.

### 2.6 PostgreSQL manda; Redis ayuda

Invitaciones usadas, consentimiento, idempotencia de comandos, readiness,
revelación y revocación se resuelven en transacciones PostgreSQL con
constraints y locks. Redis queda para rate limiting, caché no sensible y colas.

Una caída o desincronización de Redis no puede revelar antes de tiempo ni
revivir un permiso revocado. El interceptor de idempotencia actual usa Redis y
actor `anon`; **no** es suficiente para comandos críticos de invitados.

### 2.7 Revelación atómica, y retiro con dos desenlaces

Dúo revela **solo** cuando los dos participantes requeridos han confirmado, en
una transición atómica bajo locks. La única arista hacia `REVEALED` tiene
trigger `SYSTEM`: nadie puede _pedir_ que se revele.

`WITHDRAW` tiene un desenlace explícito en cada etapa, y solo tres. Retirar una
invitación que nadie aceptó cancela la actividad de forma terminal y silenciosa,
sin pedir ni comunicar una razón. Retirarse antes de revelar cancela y
**destruye** los sobres cifrados pendientes. Retirarse después revoca el acceso
futuro y activa la purga — y el producto **nunca** promete que la otra persona
olvide lo que ya vio.

### 2.8 Plantillas versionadas en código, catálogo vacío

`CircleActivityDefinition` es un contrato validado en un catálogo de código; el
CMS queda fuera del programa. Solo `PUBLISHED` se previsualiza o instancia;
`DRAFT` y `ARCHIVED` resuelven por pin exacto para no romper actividades en
curso, pero el proyector público los **rechaza él mismo** con
`CIRCLE_CATALOG_NOT_PUBLISHED`: la frontera no depende de que quien llama se
acuerde de usar `getPublished()`.

`PRODUCTION_CIRCLE_TEMPLATES` se entrega **vacío**. La especificación permitía
incorporar dos candidatas como DRAFT _si hubiese copy aprobado verificable_; ese
copy vive en Notion, fuera del alcance de este corte, e inventarlo sería escribir
contenido editorial sin aprobación. Los nueve `DUO_CANDIDATES` de PQP **no** se
importan, y **PQP C07 conserva su lista vacía** porque una actividad bilateral es
el instrumento equivocado donde puede haber coerción o violencia.

### 2.9 Dos superficies distintas para «sin login»

«Sin login» no significa «cualquiera en Internet ve las respuestas». Hay un
preview público de plantilla sin estado de instancia, y una sala tokenizada y no
indexable a una actividad concreta. Una actividad íntima jamás se identifica con
un slug público adivinable.

### 2.10 Marca visible, identificadores estables

FeelVerse en copy y rutas nuevas; `psico-platform`, `@psico/*`, cookies y
modelos históricos se conservan. Un barrido de renombre no añade capacidad Dúo y
sí amplía diff, despliegues y riesgo.

---

## 3. Consecuencias

**Aceptadas.** Dos controladores (miembro e invitado) llamando al mismo
servicio; un segundo mecanismo de sesión que mantener; contenido compartido
descifrable por el servicio; el borrador se pierde al recargar.

**Evitadas.** Reabrir `GuideSession`; un microservicio; criptografía grupal
propia; un CMS antes de validar el valor; un esquema que habría que reformar
para Familia.

**Cargadas explícitamente.** El límite de que esto no es E2E, escrito aquí y
obligatorio en la interfaz. Y que el motor puede quedar listo mientras el
lanzamiento sigue bloqueado por revisión editorial: **cinco** experiencias
aprobadas, de las que hoy hay **cero**.

---

## 4. Dos invariantes más estrictas que la especificación

Se declaran para que la auditoría pueda rechazarlas, no para colarlas:

1. **Toda plantilla debe ofrecer una salida sin compartir** (`KEEP_PRIVATE` o
   `WITHDRAW`). Sin esto se podría redactar una actividad cuya única salida es
   revelar.
2. **`safety.level: "REINFORCED"` exige `privateGateRequired: true`**, para que
   `REINFORCED` no sea una etiqueta sin mecanismo.

---

## 5. Alternativas descartadas

| Alternativa                   | Por qué no                                                                   |
| ----------------------------- | ---------------------------------------------------------------------------- |
| Compartir `GuideSession`      | Progreso individual ≠ consentimiento relacional; reabre #639.                |
| Microservicio de Círculos     | Duplica auth, despliegue y observabilidad sin resolver nada del dominio.     |
| Persistir el borrador privado | Rompe «Mi espacio» y exige recuperación criptográfica para invitados.        |
| E2E multiparte real           | Impide servir en otro dispositivo y a Eco; exige protocolo propio de claves. |
| Sala pública por slug         | Una actividad íntima con URL adivinable.                                     |
| WebSockets y presencia        | La interacción es asincrónica; el tiempo real añade superficie sin valor.    |
| CMS de plantillas ya          | Semanas de editor y workflow antes de validar el valor central.              |
| Importar los `DUO_CANDIDATES` | Son borradores editoriales; publicarlos es una decisión editorial.           |

---

## 6. Estado de implementación

**PR1** entregó contrato y pruebas: tipos, validator, registro, catálogo vacío,
matriz de permisos, dos máquinas de estados, threat model y fixtures.

**PR2** entrega la base persistente y de acceso:

- los ocho modelos de [`circles-v1.md` §5](../architecture/circles-v1.md) y una
  migración **estrictamente aditiva** que además materializa en SQL lo que
  TypeScript no puede sostener solo — 25 CHECKs, 7 índices únicos parciales,
  **10 claves foráneas compuestas** y cuatro triggers;
- **ninguna fila puede nombrar dos mundos a la vez**: las nueve relaciones que
  cruzan círculo o actividad son claves compuestas declarativas, no invariantes
  confiadas a un repositorio. `CircleActivityParticipant.circleId` existe como
  columna de ámbito precisamente para que la pertenencia del miembro sea una
  clave y no un join que alguien deba recordar;
- **Dúo es 2/2/2 exacto**, no un mínimo: `kind=DUO`, `maxParticipants=2` y
  `requiredParticipants=2` por CHECK. Ensancharlo es editar la restricción;
- **el ledger es append-only por trigger** (UPDATE, DELETE y TRUNCATE), y su
  `metadata` está cerrado por gramática — dos valores, en un solo tipo de
  evento — en lugar de por un tope de tamaño que fingía ser esa garantía;
- `CirclesModule` con cuatro repositorios de un solo escritor;
- rollout `off|pilot|on` que, a diferencia del de Guide, **nunca lanza**:
  ausente e inválido resuelven a `off`, que ya es el estado cerrado;
- bajo `pilot`, **el invitado hereda la habilitación de quien invita** y no
  puede excederla: la elegibilidad del miembro que emitió la invitación se
  vuelve a derivar en el servidor en cada uso —y otra vez dentro de la
  transacción del canje— y cualquiera de sus cuatro formas de fallar produce
  exactamente `CIRCLE_INVITATION_UNUSABLE`;
- creación, almacenamiento y consumo de invitaciones — solo hashes, un uso,
  vencimiento, revocación y **una única respuesta** para todo lo inutilizable;
- intercambio por sesión opaca de invitado, ligada a una actividad y a un
  participante por clave foránea compuesta;
- construcción server-side de `CircleActor` y los guards que la hacen;
- el canje **verifica que el asiento pasó de `INVITED` a `ACCEPTED` en
  exactamente una fila**; cero o más de una aborta la transacción completa, sin
  invitación consumida, sin sesión y sin evento.

Una consecuencia se declara aquí en vez de descubrirse después: con el ledger
append-only, un `Circle` con eventos ya no puede borrarse, y una cuenta nombrada
por un evento tampoco. Es coherente con el dominio —cerrar un círculo es un
cambio de estado, no un borrado— pero el borrado de cuenta necesitará, cuando
Círculos se encienda, una vía de limpieza sancionada que sea a su vez una
migración. No un bypass de aplicación.

No entrega creación funcional de Dúo, `confirm-share`, barrera de revelación,
artefactos, seguimiento, cifrado operativo, worker, Eco, UI, rutas web, CTA ni
plantillas publicadas. `apps/api/src/circles/circles-scope.spec.ts` verifica esa
ausencia en lugar de afirmarla; sus tres asserts de «todavía no» se
convirtieron en esta PR en sus contrapartes positivas, que es exactamente lo
que PR1 anunció que ocurriría.
