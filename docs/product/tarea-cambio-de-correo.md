# Tarea — terminar el cambio de correo

> Tarea de **identidad**, separada y acotada. Registrada el **2026-11-24**.
>
> **Hoy la operación está retirada.** `POST /api/user/email-change-request`
> existe y responde `503 EMAIL_CHANGE_UNAVAILABLE` a cualquier cuerpo válido,
> sin leer ni escribir nada y sin encolar ningún mensaje. Web y móvil enseñan el
> correo actual y dicen que por ahora no se puede cambiar. Las cuentas, el modelo
> `EmailChangeRequest` y las filas que ya existían **no se tocaron**.
>
> Este documento no promete fecha. Dice qué hay que construir y qué decidir
> antes de volver a ofrecerla.

## 1 · Qué había, y por qué se retiró

El código retirado está en git en `26eb115e`
(`apps/api/src/users/users.service.ts`, `requestEmailChange`). Hacía la mitad del
recorrido:

1. pasaba la dirección nueva a minúsculas y buscaba una cuenta con **esa**
   cadena exacta; si la había, `409 Email already in use`;
2. creaba un `EmailChangeRequest` con el SHA-256 de un token de 32 bytes y 24
   horas de vida;
3. encolaba un correo a la dirección nueva con un enlace a
   `/verify-email-change?token=…`.

Lo que faltaba:

- **La página no existe**, y tampoco un endpoint que consuma el token. El
  comentario del DTO nombraba `/user/email-change/:token`; nunca se escribió.
- **El 409 decía qué direcciones tienen cuenta**, a cualquiera con sesión.
- **El 409 tampoco era fiable**: ver §3.

## 2 · El recorrido que hay que construir

1. **Pedirlo** desde Perfil, con la identidad confirmada otra vez.
2. **Un mensaje a la dirección nueva** con un enlace de un solo uso.
3. **Una página pública** `/verify-email-change` con un botón. No debe consumir
   el token al abrirse: los filtros de correo abren los enlaces antes que la
   persona. (`/verify-email` sí confirma al montarse; confirmar dos veces la
   misma dirección no hace daño, cambiar de dirección sin querer sí.) El
   middleware sólo protege `/dashboard`, así que la ruta puede ser pública sin
   tocarlo.
4. **Un endpoint que consuma el token** y cambie `User.email`.
5. **Un aviso a la dirección anterior.** Hoy no existe ninguna plantilla para eso.

## 3 · Unicidad y mayúsculas

`User.email` es `@unique`, pero **distingue mayúsculas**: `Ana@x.com` y
`ana@x.com` caben a la vez. `register()` guarda lo que se tecleó y `login()` lo
busca exacto. Por eso `forgotPassword` y `resendVerification` comparten
`findAccountByTypedAddress` (`auth.service.ts`): exacta primero y, si falla, sin
distinguir mayúsculas sólo cuando la coincidencia es única.

El código retirado no la usaba: comparaba la versión en minúsculas con igualdad
exacta, así que **no veía** una cuenta guardada como `Ana@x.com`, y al terminar
habría guardado `ana@x.com` al lado.

Hay que decidir y escribir:

- **Con qué criterio se compara** (al pedir y al consumir), que debería ser el
  mismo de `findAccountByTypedAddress`, incluido el caso ambiguo.
- **Cómo se guarda** la dirección nueva: tal cual se teclea, como el registro, o
  normalizada. Mezclar los dos criterios es lo que dejó cuentas a las que no
  llegaba nada.
- **La carrera con un registro**: entre pedir y consumir, alguien puede crear una
  cuenta con esa dirección. El índice único frena la igual (`P2002`, que hay que
  traducir a un enlace que ya no vale) y **no** frena la que sólo difiere en
  mayúsculas.
- **La respuesta al pedir**, que debe ser la misma esté libre u ocupada la
  dirección — el contrato de `forgotPassword`. Y qué se envía, si se envía algo,
  a una dirección que ya tiene cuenta.

## 4 · Consumir el token

- **Una transacción** con la marca condicionada (`consumedAt` nulo, `expiresAt`
  en el futuro) **y** el cambio de `User.email`. Leer primero y escribir después
  deja pasar dos consumos a la vez.
- **Un solo mensaje para todo enlace que no vale** —desconocido, vencido, usado—,
  como el `410 TOKEN_INVALID_OR_EXPIRED` de los otros dos.
- **Una solicitud nueva invalida las anteriores** de esa cuenta. Hoy nada lo
  hace: cada petición añadía una fila y todas quedaban vivas 24 horas.
- **Un tope por cuenta**, reservado y comprobado en un solo paso, como
  `reserveVerificationSend` (`auth/verification-send-budget.ts`). La ruta sólo
  tenía el límite general de peticiones.
- **Las filas que ya existen**: sus enlaces duraban 24 horas desde que se
  pidieron. Comprobar `expiresAt` basta para que ninguna sirva; no hay que
  editarlas ni borrarlas para eso.

## 5 · Los enlaces que se mandaron a la dirección anterior

Aquí hay dos huecos que no se ven mirando sólo el cambio:

- `EmailVerificationToken` se guarda **por cuenta y sin dirección**, y
  `verifyEmail` marca `emailVerified` en la cuenta. Un enlace enviado a la
  dirección **vieja** confirmaría la **nueva**.
- `PasswordResetToken`, igual: un enlace de restablecer enviado a la dirección
  vieja seguiría sirviendo después del cambio.

Al cambiar hay que dejar sin efecto los dos. Y al revés: cambiar o restablecer la
contraseña debería anular un cambio de correo pendiente. `revokeAllUserSessions`
borra sesiones y no mira `EmailChangeRequest`, así que quien hubiera pedido el
cambio desde una sesión robada conservaría su enlace.

## 6 · Confirmar la identidad, sesiones y aviso

- **Contraseña actual.** Cambiarla y pedir la baja la exigen; pedir el cambio de
  correo no la pedía. Y el correo es la llave de la recuperación: quien lo
  controla puede restablecer la contraseña.
- **Aviso a la dirección anterior**, al pedir o al completar (decidirlo), con una
  vía para quien no lo pidió. Esa vía **también hay que decidirla**: hoy no hay
  un canal de ayuda público, así que el aviso no puede remitir a uno.
- **Sesiones.** `JwtStrategy` relee al usuario en cada petición, así que el
  correo no queda viejo en el servidor. Falta decidir si el cambio revoca las
  demás sesiones (`revokeAllUserSessions`, ADR 0015); la lista de sucesos que hoy
  lo hacen no incluye éste. El móvil pinta en Perfil el correo de su sesión, que
  viene del último acceso o renovación.
- **Registro.** Dos tipos nuevos de `AuthEvent` (pedido y completado). La columna
  es texto: no hace falta migración.

## 7 · Con qué se cruza

- **`EMAIL_ALLOWLIST`.** Fuera de producción sólo se escribe a las direcciones de
  la lista, y la lista es **por dirección**. El mensaje a una dirección nueva que
  no esté en ella se retiene; y quien cambiara a una fuera de la lista dejaría de
  recibir todo lo demás, incluida la recuperación de su contraseña. Incorporar la
  dirección va **antes** de pedir el cambio.
- **La sal de cifrado.** La clave del Diario y de Eco sale de la contraseña y de
  `cryptoSalt` (`deriveMasterKey(password, salt)`); **el correo no interviene**.
  El cambio no debe tocar `cryptoSalt` ni las entradas.
- **Cuentas de Google.** Entran por `providerId`, así que cambiar `User.email` no
  les quita el acceso. Pero no tienen contraseña con que confirmar, su correo ya
  no coincidiría con el de Google y la dirección anterior quedaría libre para otra
  cuenta. Y si una cuenta con contraseña pasa a la dirección Google de alguien que
  todavía no tiene cuenta, el primer acceso con Google de esa persona responderá
  `EMAIL_ALREADY_REGISTERED`. Lo más simple para empezar es **no ofrecérselo** a
  las cuentas de Google, como ya hace el cambio de contraseña.
- **Una baja pendiente.** La exportación y la foto se rechazan con
  `ACCOUNT_DELETION_PENDING`. El cambio debería hacer lo mismo **al pedir y al
  consumir**: entre los dos caben 24 horas. El consumo, que llega sin sesión,
  tiene que mirar también `isActive`.
- **Cobros.** El cliente de Stripe se crea con el correo de ese momento y nada lo
  actualiza después. Con las compras cerradas no urge; antes de abrirlas, sí.
- **Lo que sigue solo.** El digest y el aviso de exportación leen `user.email` al
  enviar, y las listas de acceso al modo guiado van por id. No hay que hacer nada.

## 8 · Qué pruebas la cierran

Con **PostgreSQL real**, porque son carreras y unicidad:

- dos consumos simultáneos del mismo token: uno cambia, el otro recibe el enlace
  no válido;
- dos solicitudes simultáneas de una cuenta: queda una viva y el tope aguanta;
- un registro que ocupa la dirección entre pedir y consumir, igual y con otras
  mayúsculas;
- un enlace de verificación y uno de restablecer anteriores al cambio, que ya no
  sirven después;
- un cambio de contraseña con una solicitud pendiente, que la anula.

Por **HTTP**:

- la misma respuesta para una dirección libre, ocupada, propia y con mayúsculas;
- sin contraseña, con la equivocada, con cuenta de Google, con baja pendiente y
  con cuenta inactiva, sin fila ni mensaje;
- token desconocido, vencido y usado: el mismo `410`;
- `cryptoSalt` y las entradas del Diario, idénticas antes y después, y una
  entrada cifrada antes que se abre después.

En **pantalla**: abrir el enlace no cambia nada hasta pulsar; y el recorrido
entero con recepción real en dos bandejas controladas, la nueva y la anterior.

Al cerrarla se retiran `apps/web/src/email-change-withdrawn.contract.test.ts`,
`apps/api/src/users/email-change-unavailable.e2e-spec.ts` y la constante
`EMAIL_CHANGE_UNAVAILABLE_*` de `@psico/types`. `UsersService` conserva
`ConfigService` inyectado porque el enlace se arma con `APP_URL`.
