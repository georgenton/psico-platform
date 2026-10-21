# ADR 0028 — Cómo pasa una experiencia de «sin aprobar» a «aprobada»

- **Estado:** la mecánica está implementada y probada; **la política de claves
  está propuesta y pendiente de decisión del propietario**.
- **Fecha:** 2026-10-21
- **Alcance:** `apps/api/src/experience/experience-editorial-approval.ts`,
  `experience-editorial-seal.ts`, `apps/api/src/content-core/eec-c01-guides-*`.
- **Antecede:** [ADR 0027](0027-control-de-publicacion-de-una-experiencia.md) describió
  que no había control; B3 lo construyó. Esto resuelve lo que quedaba: cómo se
  concede una aprobación legítima sin que concederla sea trivial.

## El problema que quedaba

El control de B3 niega bien, y eso dejó dos callejones:

1. El CLI rechazaba **cualquier** manifiesto con `publishAllowed` distinto de
   `false`, así que una aprobación legítima no tenía por dónde entrar.
2. `create-drafts` es idempotente por inspección: una fila DRAFT que coincide
   es un NOOP y nunca vuelve a escribir su procedencia. Sellar una fila que ya
   existe no era posible.

El segundo es fácil. El primero no, porque aflojarlo a secas convierte en
aprobador a quien pueda escribir en el repositorio.

## La pregunta de fondo

**¿Quién aprueba?** Toda respuesta que viva dentro del sistema tiene el mismo
defecto: nombra a quien ya tiene acceso.

| Si la aprobación es…         | …entonces aprueba               |
| ---------------------------- | ------------------------------- |
| una bandera en el manifiesto | quien pueda hacer un commit     |
| una columna en la base       | quien pueda hacer un `UPDATE`   |
| un endpoint                  | el ADMIN, por el hecho de serlo |
| un permiso                   | quien administre los permisos   |

El encargo pide expresamente que tener acceso **no** convierta a nadie en
aprobador. Eso descarta las cuatro.

## Decisión

**La aprobación es un acta firmada con una clave que la plataforma no tiene.**

Lo que vive en el sistema es sólo la comprobación, que es pública por
naturaleza. Quien aprueba es quien tiene la clave privada, y nadie dentro de
la plataforma la tiene — ni el ADMIN, ni quien despliega, ni quien escribe el
código.

### Qué cubre la firma

Todo lo que haría que la aprobación dejara de corresponder:

- **identidad** — `experienceKey@version` y el pin de guía;
- **revisión** — `canonicalVersion` y `canonicalSha256` del manuscrito;
- **empaquetado** — `manifestSha256`;
- **contenido** — `definitionSha256`, el resumen de lo que se va a servir.

Cambiar cualquiera invalida la firma. No hay forma de reaprovechar una
aprobación después de tocar el contenido o subir la versión.

### Las tres puertas, y por qué son tres

1. **`validate`** — la declaración del manifiesto y el acta tienen que decir
   lo mismo, y el acta tiene que cubrir el contenido que ese manifiesto
   produce. Las dos direcciones: declararse publicable sin acta es declararse
   aprobado solo; traer un acta sin declararlo deja una aprobación suelta que
   nadie reconoce.
2. **`reseal`** — comando propio y explícito. No crea nada: cambia la
   autorización de algo que ya existe, y eso merece que alguien lo escriba a
   mano en vez de obtenerlo como efecto de otro comando. Idempotente. Se niega
   si la fila guarda un contenido distinto del que el acta firmó, y si la fila
   no está en DRAFT.
3. **`publish`** — vuelve a verificar la firma, dentro del candado. Sin esto,
   un `UPDATE` directo podría escribir «aprobada» y publicar: la fila se
   creería a sí misma. **Medido:** un sello forjado a mano en la base responde
   409 `EXPERIENCE_APPROVAL_UNVERIFIABLE`, con y sin llavero configurado.

Y una cuarta que no es una puerta sino una ausencia: **no existe ningún
endpoint que selle**. La transición es una operación de herramienta, con el
acta delante.

### La herramienta no firma

`approval-request` emite el acta completa **salvo la firma** y los bytes
exactos a firmar. La autora los firma con su clave, donde sea que la guarde, y
pega el resultado. Una herramienta capaz de firmar tendría que tener la clave,
y entonces aprobaría quien pudiera ejecutarla.

Para MG03, hoy, esos bytes empiezan así:

```
feelverse.editorial-approval.v1
EEC-C01-MG03
eec-c1-alarma-antes-del-relato
…
```

y su `definitionSha256` es `4de4501e5339…`, que es exactamente el resumen que
la fila guarda. Firmar eso aprueba **ese** contenido y ningún otro.

Con `openssl`, la firma es:

```bash
# El payload exacto que imprime `approval-request`, sin salto final.
printf '%s' "$PAYLOAD" > /tmp/acta.txt
openssl pkeyutl -sign -rawin -inkey clave-privada.pem -in /tmp/acta.txt \
  | openssl base64 -A
```

## Lo que falta decidir, y es del propietario

1. **De quién es la clave.** La propuesta es: de la autora del contenido, no
   de la plataforma ni del equipo técnico. Una clave del equipo reintroduce el
   problema con un rodeo más largo.
2. **Dónde se guarda.** Fuera del repositorio y fuera de la plataforma. Un
   gestor de contraseñas personal o una llave de hardware; no un secreto de
   despliegue, porque quien administra los secretos volvería a ser aprobador.
3. **Qué `keyId` se usa y cómo se rota.** El llavero admite varias claves a la
   vez justamente para poder rotar sin invalidar lo ya aprobado.
4. **Dónde vive la clave pública.** Hoy en `EDITORIAL_APPROVAL_KEYS`, en el
   entorno. **No en el repositorio:** una clave pública guardada junto al
   artefacto que autoriza no es una autoridad, es una decoración — quien pueda
   cambiar uno puede cambiar la otra.

Mientras eso no se decida, el llavero está vacío y **ninguna instalación puede
aprobar nada**. Es el estado de hoy y es seguro: «no se pudo comprobar» nunca
significa «adelante».

## Qué NO cambia

- **MG03 sigue en DRAFT, sin aprobar y sin poder publicarse.** Su manifiesto
  declara `publishAllowed: false` y no existe ningún acta en el paquete. Una
  prueba lo comprueba leyendo el disco, y fallará el día que aparezca una —
  que es lo que debe pasar, porque sería una decisión que alguien tomó.
- El rol ADMIN sigue siendo necesario para llegar al panel. Esto añade, no
  sustituye.
- Las validaciones de estructura, pin y reserva de linaje siguen donde
  estaban, y se evalúan antes: un borrador roto se entera de que está roto, no
  de que no está aprobado.

## Cómo se comprueba

- `experience-editorial-approval.spec.ts` — 15 pruebas con claves generadas al
  vuelo: firma auténtica, clave desconocida, firma de otra clave bajo un
  `keyId` conocido, acta manipulada, acta de otra versión, de otra
  experiencia, de otra revisión, y del contenido de antes de editarlo.
- `eec-c01-guides-approval.spec.ts` — 14 pruebas de la transición completa
  sobre manifiestos sintéticos, más dos que fijan que MG03 sigue sin aprobar
  en el disco.
- `experience-editorial-seal.spec.ts` — que una fila que dice «aprobada» no se
  cree por decirlo.
- `experience-admin.service.spec.ts` — que el veredicto que lee la interfaz y
  el que aplica `publish` son el mismo, en los dos sentidos.
