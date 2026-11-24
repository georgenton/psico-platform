---
"@psico/types": minor
"@psico/api-client": minor
---

La baja de una cuenta dice cuándo ocurre, y se puede cancelar.

- **`UserPrivacySettings.accountDeleteScheduledFor`** — el día en que la cuenta se
  elimina, calculado por el servidor con el número que usa el worker. Web y móvil
  enseñaban el día en que se **pidió**, treinta antes. Es opcional: contra una API
  que no lo manda no se imprime ninguna fecha.
- **`CancelAccountDeletionResponse`** y **`usersApi.cancelAccountDeletion()`** —
  `POST /user/delete-request/cancel`, sin cuerpo ni contraseña. Idempotente, y con
  409 cuando ya pasaron los treinta días.
- **`accountDeletionDateLabel`, `accountDeletionNotice`,
  `cancelAccountDeletionErrorCopy`** y sus dos frases — lo que se lee mientras la
  baja está programada, en la zona de la persona e igual en las dos plataformas.
