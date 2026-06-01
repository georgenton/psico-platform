# 10 · Perfil

`Perfil.html` — pantalla de cuenta del usuario: stats, logros, preferencias, notificaciones, privacidad. Una pantalla con varias secciones colapsables.

---

## Pantalla: Perfil

**Ruta sugerida:** `/perfil`

### Datos que muestra

- `user`:
  - `id`: string
  - `firstName`: string
  - `email`: string
  - `city`: string
  - `country`: string
  - `tier`: enum
  - `joinedAt`: Date
  - `initials`: string
  - `avatarUrl`: string | null
- `stats`:
  - `daysActive`: number
  - `booksCompleted`: number
  - `chaptersRead`: number
  - `diaryEntries`: number
  - `minutesTotal`: number
  - `currentStreakDays`: number
  - `longestStreakDays`: number
- `achievements[]`: array
  - `id`: string
  - `label`: string
  - `description`: string
  - `unlockedAt`: Date | null
  - `progressCurrent`: number
  - `progressTarget`: number
  - `icon`: string (token)
- `preferences`:
  - `voicePreference`: enum ("marina" | "tomas" | "none")
  - `moodPrompts`: boolean
  - `bestTime`: enum ("morning" | "noon" | "evening" | "any")
  - `weeklyGoalMinutes`: number
  - `theme`: enum ("system" | "light" | "dark")
  - `readerFont`: enum ("serif" | "sans")
  - `language`: enum ("es-419" | "es-ES")
- `notifications`:
  - `dailyReminder`: boolean
  - `reminderTime`: string ("HH:MM")
  - `streakReminders`: boolean
  - `ecoReplies`: boolean
  - `terapiaReminders`: boolean
  - `weeklyReport`: boolean
- `privacy`:
  - `shareDiaryWithTherapist`: boolean
  - `anonymizedAnalytics`: boolean — comparte uso (no contenido) para mejorar producto
  - `marketingEmail`: boolean
  - `dataExportRequested`: Date | null
  - `accountDeleteRequested`: Date | null
- `account[]`: array de rows (cambio email, password, idioma, etc.)
- `app[]`: array de rows (sobre la app, términos, soporte)

### Acciones del usuario

- **Editar perfil** (nombre, ciudad, avatar): PATCH `/user/profile`.
- **Cambiar email/password**: lleva a flujos dedicados (con verificación).
- **Toggle preferencia**: PATCH `/user/preferences`.
- **Toggle notificación**: PATCH `/user/notifications`.
- **Toggle privacidad**: PATCH `/user/privacy`.
- **Exportar mis datos**: POST `/user/data-export` → email con ZIP.
- **Eliminar cuenta**: flujo de confirmación con razón + email cooldown.
- **Cerrar sesión**: POST `/auth/logout`.
- **Click logro bloqueado**: muestra hint.

### Llamadas HTTP necesarias

- **Método:** GET — `/api/user/me` — Auth: Sí
  - **Response:** `{ user, stats, achievements, preferences, notifications, privacy }`
- **Método:** PATCH — `/api/user/profile` — Auth: Sí
  - **Request:** parcial de `{ firstName, city, country, avatarUrl }`
- **Método:** PATCH — `/api/user/preferences` — Auth: Sí
- **Método:** PATCH — `/api/user/notifications` — Auth: Sí
- **Método:** PATCH — `/api/user/privacy` — Auth: Sí
- **Método:** POST — `/api/user/email-change-request` — Auth: Sí
  - **Request:** `{ newEmail }`
  - **Response:** `{ ok: true, verificationSentTo }`
- **Método:** POST — `/api/user/password-change` — Auth: Sí
  - **Request:** `{ currentPassword, newPassword }`
- **Método:** POST — `/api/user/data-export` — Auth: Sí
  - **Response:** `{ ok: true, expectedAt: Date }`
- **Método:** POST — `/api/user/delete-request` — Auth: Sí
  - **Request:** `{ reason?, password }`
  - **Response:** `{ ok: true, deleteAt: Date }` (cooldown 30 días)
- **Método:** POST — `/api/auth/logout` — Auth: Sí
- **Método:** POST — `/api/user/avatar` — Auth: Sí — multipart upload

### Estados de la pantalla

- **Loading:** skeleton de header + 4 secciones.
- **Error:** 500 → retry.
- **Empty:** stats en 0 si recién creado. Logros muestran progreso "0/X".

### Notas

- `dataExportRequested` y `accountDeleteRequested` están limitados a 1 vez cada 30 días.
- El borrado de cuenta es soft delete con cooldown — el usuario puede cancelar dentro de 30 días.

---

## Endpoints de esta área

| Método | Endpoint                         | Auth | Descripción                      |
| ------ | -------------------------------- | ---- | -------------------------------- |
| GET    | `/api/user/me`                   | Sí   | Perfil completo                  |
| PATCH  | `/api/user/profile`              | Sí   | Editar nombre, ciudad, avatar    |
| POST   | `/api/user/avatar`               | Sí   | Subir avatar                     |
| PATCH  | `/api/user/preferences`          | Sí   | Voz, tema, fuente, idioma        |
| PATCH  | `/api/user/notifications`        | Sí   | Toggle notificaciones            |
| PATCH  | `/api/user/privacy`              | Sí   | Toggle privacidad                |
| POST   | `/api/user/email-change-request` | Sí   | Cambiar email (con verificación) |
| POST   | `/api/user/password-change`      | Sí   | Cambiar password                 |
| POST   | `/api/user/data-export`          | Sí   | Solicitar export de datos        |
| POST   | `/api/user/delete-request`       | Sí   | Solicitar eliminación de cuenta  |
| POST   | `/api/auth/logout`               | Sí   | Cerrar sesión                    |
