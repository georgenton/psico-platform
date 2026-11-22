# Tarea — pedir otro enlace de verificación, sin borrar la cuenta

> Tarea **separada y acotada**, registrada el **2026-11-19**.
>
> **Estado al 2026-11-22: implementada en #870.** Lo que se entregó y lo que
> queda está en [§6](#6--lo-que-se-entregó-y-lo-que-queda). El resto de este
> documento es el encargo tal como se escribió.
>
> **Esto no reabre nada.** El transporte de correo y la recuperación de
> contraseña quedaron **cerrados y aceptados** ese mismo día
> ([FV-47 §78](../operations/correo-insumos-pendientes.md), PR #868). Lo que
> falta aquí es una capacidad distinta que nunca existió.

## 1 · El hueco

**`sendVerificationEmail` sólo se dispara desde `register()`**
(`apps/api/src/auth/auth.service.ts:117`). No hay ninguna otra ruta. El propio
código lo anticipaba: `auth.service.ts:115` dice «the user can re-request later
via `/auth/resend-verification` (future)», y el README del módulo lo lista como
pendiente.

Consecuencia práctica: si el enlace de alguien caduca —valen **24 horas**— o su
mensaje no llega, **esa persona no puede pedir otro**. La única salida hoy es
borrar la cuenta y rehacerla.

> **Ese borrado fue una maniobra de aquel ensayo, no un procedimiento.** Se usó
> una vez, sobre una cuenta de QA creada minutos antes y vacía, con guardas por
> id **y** por correo, para no tener que ampliar la lista de destinatarios —que
> es un control de seguridad—. **No es lo que se le hace a la cuenta de una
> persona real**, que además tendría contenido cifrado que nadie puede devolver.

## 2 · El defecto visible, con sus dos mitades

`apps/web/src/app/(auth)/verify-email/_VerifyEmailFlow.tsx`, estado `expired`:

> «Los enlaces de verificación valen 24 horas. **Iniciá sesión para que te
> enviemos uno nuevo automáticamente.**»

**a · La promesa es falsa.** Iniciar sesión **no** envía ningún enlace nuevo:
no existe código que lo haga. La pantalla describe un recorrido que el producto
no tiene, y manda a la persona a un sitio donde no va a pasar nada.

**b · Está en voseo**, que no es el registro del producto —se valida en Ecuador
y la regla está acordada—. Y hay un detalle que conviene arreglar en la misma
pasada: **el trinquete `apps/web/src/copy-voseo.test.ts` no lo detecta**, no
por un fallo de diseño sino porque su `IMPERATIVO_AR` es una **lista enumerada**
de verbos y `iniciá` no está en ella. Quien toque esta pantalla debe **añadir
`iniciá`** a esa lista; si no, el agujero sigue abierto para la próxima.

## 3 · Resultado esperado

1. Una persona puede **pedir otro enlace de verificación para su propia
   cuenta**, por el flujo normal.
2. Los **mensajes de la pantalla describen el recorrido real**: nada de un
   reenvío automático que no ocurre.
3. **Protecciones habituales contra abuso**: límite por dirección y por IP, y
   respuesta que **no revele** si una dirección está registrada — el mismo
   criterio de no-filtración que ya usa `forgot-password`, que siempre
   responde 200.
4. El copy, **en tuteo**, y `iniciá` añadido al trinquete.

## 4 · Lo que esta tarea NO hace

- **No cambia la política de acceso de las cuentas sin verificar.** Hoy ningún
  guard exige correo verificado para entrar, y eso **se queda como está**: es
  una decisión de producto aparte y no se toca de paso.
- **No reabre el correo ni la recuperación de contraseña.** Las dos están
  cerradas y aceptadas. Esto añade una capacidad que faltaba; no corrige nada
  de lo que se cerró.
- **No convierte el borrado de cuenta en un procedimiento.**

## 5 · Dónde encaja

Es trabajo de producto, no un bloqueo. **No condiciona el piloto**: una persona
cuyo enlace caduque todavía puede entrar —ningún guard se lo impide— y puede
recuperar su contraseña, que es el recorrido que sí está cerrado. Lo que no
puede es verificar su correo, y hoy eso no le cierra ninguna puerta.

## 6 · Lo que se entregó y lo que queda

Implementada en **#870**. Del §3:

1. **Se puede pedir otro enlace**, por el flujo normal y sin sesión:
   `POST /api/auth/resend-verification`. Desde la pantalla de un enlace
   vencido, inválido, incompleto o fallido, el formulario está ahí mismo; y
   para quien **nunca recibió** el primer correo, el login lleva al mismo
   formulario con «¿No te llegó el correo para confirmar tu cuenta? Pide otro
   enlace».
2. **La pantalla describe el recorrido real.** Tras pedirlo dice que la
   solicitud **se recibió** y que el enlace llegará **si puede procesarse**: no
   asegura un envío, porque el servidor pudo retenerlo por el cupo de la cuenta
   o por un fallo del proveedor.
3. **Protecciones**: 3 por hora y por IP (el mismo límite que
   `forgot-password`), 3 por hora y por **cuenta** —con el correo del registro
   dentro del mismo cupo, y comprobar-y-reservar en un solo paso con un cerrojo
   de PostgreSQL por cuenta—, y la misma respuesta `200 { ok: true }` para toda
   dirección. La entrega va por la cola de correo, así que la respuesta **no
   espera al proveedor**; eso no equivale a una latencia igual en todas las
   ramas, y no se afirma.
4. **Tuteo**, con `iniciá` y otras nueve formas en el trinquete.

**Lo que queda pendiente de observar:** la **recepción real de un reenvío**.
La única bandeja autorizada hoy, `qa@syntavera.dev`, ya está verificada, y
ampliar la lista de destinatarios no está autorizado; así que el recorrido
positivo —pedir, recibir y abrir el nuevo enlace— necesita una identidad de
pruebas sin verificar dentro de la restricción. Lo comprobado sobre staging, y
lo que falta, está en el cuerpo de #870.
