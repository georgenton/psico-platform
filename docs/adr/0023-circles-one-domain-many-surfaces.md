# ADR 0023 — FeelVerse Círculos: un dominio relacional, Dúo como primera superficie

```
STATUS=PROPOSED
CUT=PR1 · docs/circles-v1-contract
BASE_SHA=ed237654d2c61874316303c34948924ad422bb06

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
IMPLEMENTATION_AUTHORIZED=false
```

La arquitectura completa —modelo de datos, máquinas de estados, matriz de
permisos, threat model, tren de PRs y decisiones pendientes— vive en
[`docs/architecture/circles-v1.md`](../architecture/circles-v1.md). Este ADR
registra las **decisiones** y por qué se tomaron así.

El merge de este ADR constituye **aprobación de contrato**. No autoriza
migración, runtime, API, UI ni despliegue.

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

---

## 2. Decisión

### 2.1 Un dominio propio, no una extensión de Guide

Círculos es su **propio agregado**, en un `CirclesModule` dentro de la API
actual. Dúo es su primera configuración (`Circle.kind = DUO`), no otro backend.

La alternativa seria era injertarlo en `GuideSession`, y se descarta: esa sesión
representa **progreso individual autenticado** —está ligada a `userId`, su
idempotencia es por usuario y su unicidad `ACTIVE` es por lineage (ADR 0022,
issue #639, cerrado y congelado)—. Círculos necesita invitaciones, participantes,
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

Retirarse antes de revelar cancela la actividad y **destruye** los sobres
cifrados pendientes. Retirarse después revoca el acceso futuro y activa la
purga — y el producto **nunca** promete que la otra persona olvide lo que ya
vio.

### 2.8 Plantillas versionadas en código, catálogo vacío

`CircleActivityDefinition` es un contrato validado en un catálogo de código; el
CMS queda fuera del programa. Solo `PUBLISHED` se previsualiza o instancia;
`DRAFT` y `ARCHIVED` resuelven por pin exacto para no romper actividades en
curso.

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

Este corte entrega **contrato y pruebas**: tipos, validator, registro, catálogo
vacío, matriz de permisos, dos máquinas de estados, threat model y fixtures.

No entrega modelo Prisma, migración, módulo Nest, rutas, guards, rollout,
cifrado, worker, Eco, CTA ni plantillas publicadas.
`apps/api/src/circles/circles-scope.spec.ts` verifica esa ausencia en lugar de
afirmarla, y se espera que PR2 actualice sus tres asserts de «todavía no».
