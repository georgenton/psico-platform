# FRONT_API_AUDIT.md

Auditoría de llamadas HTTP realizadas desde `apps/web/src` y `apps/mobile/src`.  
Generado: 2026-05-18

---

## Índice

1. [Tipos TypeScript compartidos](#1-tipos-typescript-compartidos)
2. [Módulo Auth](#2-módulo-auth)
3. [Módulo Content](#3-módulo-content)
4. [Módulo Subscription](#4-módulo-subscription)
5. [Clientes HTTP](#5-clientes-http)
6. [Almacenamiento de tokens](#6-almacenamiento-de-tokens)
7. [Manejo de errores](#7-manejo-de-errores)
8. [Endpoints no implementados en el frontend](#8-endpoints-no-implementados-en-el-frontend)

---

## 1. Tipos TypeScript compartidos

**Fuente:** `packages/types/src/index.ts`

### Enums

```typescript
type UserRole   = "USER" | "PSYCHOLOGIST" | "ADMIN";
type UserPlan   = "FREE" | "PRO" | "ANNUAL" | "B2B";
type SubscriptionStatus = "ACTIVE" | "TRIALING" | "PAST_DUE" | "CANCELED" | "INCOMPLETE";
type BillingInterval    = "PRO_MONTHLY" | "PRO_YEARLY" | "B2B";
type ExerciseType       = "REFLECTION" | "QUIZ" | "BREATHING" | "JOURNALING";
type MessageRole        = "USER" | "ASSISTANT";
```

### Interfaces de dominio

```typescript
interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  plan: UserPlan;
}

interface User {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  role: UserRole;
  plan: UserPlan;
  isActive: boolean;
  emailVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface Subscription {
  id: string;
  userId: string;
  plan: UserPlan;
  status: SubscriptionStatus;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface Book {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  coverUrl: string | null;
  totalChapters: number;
  isPublished: boolean;
  plan: UserPlan;
  createdAt: Date;
  updatedAt: Date;
}

interface Chapter {
  id: string;
  bookId: string;
  order: number;
  title: string;
  description: string | null;
  durationMinutes: number | null;
  isPublished: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface BookWithChapters extends Book {
  chapters: Chapter[];
}

interface PlanInfo {
  plan: UserPlan;
  name: string;
  prices: { monthly?: number; yearly?: number; currency: string };
  description: string;
  features: string[];
}

interface CheckoutSessionResponse { url: string; }
interface PortalSessionResponse   { url: string; }
```

---

## 2. Módulo Auth

### POST `/auth/register`

| Campo        | Web | Mobile |
|--------------|-----|--------|
| Implementado | ✅  | ✅     |

**Archivos:**
- Web: `apps/web/src/actions/auth.ts` → `registerAction()`
- Mobile: `apps/mobile/src/context/auth.tsx` → `AuthProvider.register()`

**Request body:**
```typescript
{
  name: string;
  email: string;
  password: string;
}
```

**Response:**
```typescript
{
  accessToken: string;
  refreshToken: string;
  user: AuthUser;  // { id, email, name, role, plan }
}
```

---

### POST `/auth/login`

| Campo        | Web | Mobile |
|--------------|-----|--------|
| Implementado | ✅  | ✅     |

**Archivos:**
- Web: `apps/web/src/actions/auth.ts` → `loginAction()`
- Web: `apps/web/src/app/(auth)/login/_LoginForm.tsx`
- Mobile: `apps/mobile/src/context/auth.tsx` → `AuthProvider.login()`

**Request body:**
```typescript
{
  email: string;
  password: string;
}
```

**Response:**
```typescript
{
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}
```

---

### POST `/auth/refresh`

| Campo        | Web | Mobile |
|--------------|-----|--------|
| Implementado | ✅  | ✅     |

**Archivos:**
- Web: `apps/web/src/lib/api.ts` → `authApi.refresh()` (interceptor 401)
- Web: `apps/web/src/lib/api.server.ts` (server-side refresh silencioso)
- Mobile: `apps/mobile/src/context/auth.tsx` (cold start + interceptor 401)
- Mobile: `packages/api-client/src/` (interceptor automático)

**Request body:**
```typescript
{
  refreshToken: string;
}
```

**Response (Web — misma forma que login):**
```typescript
{
  accessToken: string;
  refreshToken: string;
}
```

**Response (Mobile — devuelve también el user):**
```typescript
{
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}
```

> **Nota:** discrepancia menor — Web solo usa los tokens del refresh; Mobile usa también el user para re-hidratar contexto.

---

### POST `/auth/logout`

| Campo        | Web | Mobile |
|--------------|-----|--------|
| Implementado | ✅  | ✅     |

**Archivos:**
- Web: `apps/web/src/actions/auth.ts` → `logoutAction()`
- Mobile: `apps/mobile/src/context/auth.tsx` → `AuthProvider.logout()` (optimista)

**Request body:**
```typescript
{
  refreshToken: string;
}
```

**Response:** `void` (204 No Content esperado)

---

## 3. Módulo Content

### GET `/content/books`

| Campo        | Web | Mobile |
|--------------|-----|--------|
| Implementado | ✅  | ✅     |

**Archivos:**
- Web: `apps/web/src/app/page.tsx` (landing — sin auth)
- Web: `apps/web/src/app/dashboard/page.tsx` (dashboard — con auth)
- Mobile: `packages/api-client/src/content.ts` → `contentApi.getBooks()`

**Request:** Sin body. Header `Authorization: Bearer {token}` opcional.

**Response:**
```typescript
Book[]
// Cada Book: { id, slug, title, description, coverUrl, totalChapters, isPublished, plan, createdAt, updatedAt }
```

---

### GET `/content/books/:slug`

| Campo        | Web | Mobile |
|--------------|-----|--------|
| Implementado | ✅  | ✅     |

**Archivos:**
- Web: `apps/web/src/lib/api.ts` → `booksApi.findBySlug(slug)`
- Mobile: `packages/api-client/src/content.ts` → `contentApi.getBook(slug)`

**Request:** Sin body. Path param: `slug: string`.

**Response:**
```typescript
BookWithChapters
// { ...Book, chapters: Chapter[] }
```

---

## 4. Módulo Subscription

### GET `/subscriptions/plans`

| Campo        | Web | Mobile |
|--------------|-----|--------|
| Implementado | ✅  | ✅     |

**Archivos:**
- Web: `apps/web/src/app/page.tsx` (sección pricing del landing)
- Web: `apps/web/src/app/dashboard/plan/page.tsx`
- Mobile: `packages/api-client/src/subscription.ts` → `subscriptionApi.getPlans()`

**Request:** Sin body. Sin autenticación requerida.

**Response:**
```typescript
PlanInfo[]
// Cada PlanInfo: { plan, name, prices: { monthly?, yearly?, currency }, description, features }
```

---

### GET `/subscriptions/me`

| Campo        | Web | Mobile |
|--------------|-----|--------|
| Implementado | ✅  | ❌     |

**Archivos:**
- Web: `apps/web/src/app/dashboard/page.tsx`
- Web: `apps/web/src/app/dashboard/plan/page.tsx`

**Request:** Sin body. Header `Authorization: Bearer {token}` requerido.

**Response:**
```typescript
Subscription
// { id, userId, plan, status, currentPeriodStart, currentPeriodEnd, cancelAtPeriodEnd, createdAt, updatedAt }
```

> **Nota:** Los usuarios FREE no tienen registro de Subscription. El frontend captura el 404 y lo trata como plan FREE sin suscripción activa.

---

### POST `/subscriptions/checkout`

| Campo        | Web | Mobile |
|--------------|-----|--------|
| Implementado | ✅  | ✅     |

**Archivos:**
- Web: `apps/web/src/actions/subscription.ts` → `createCheckoutAction()`
- Mobile: `packages/api-client/src/subscription.ts` → `subscriptionApi.createCheckoutSession()`

**Request body:**
```typescript
{
  billingPlan: BillingInterval;  // "PRO_MONTHLY" | "PRO_YEARLY" | "B2B"
  successUrl: string;            // ej: "https://app.example.com/dashboard/plan?upgraded=true"
  cancelUrl: string;             // ej: "https://app.example.com/dashboard/plan"
}
```

**Response:**
```typescript
CheckoutSessionResponse  // { url: string }  — URL de Stripe Checkout
```

---

### POST `/subscriptions/portal`

| Campo        | Web | Mobile |
|--------------|-----|--------|
| Implementado | ✅  | ❌     |

**Archivos:**
- Web: `apps/web/src/actions/subscription.ts` → `createPortalAction()`

**Request body:**
```typescript
{
  returnUrl: string;  // ej: "https://app.example.com/dashboard/plan"
}
```

**Response:**
```typescript
PortalSessionResponse  // { url: string }  — URL del portal de cliente Stripe
```

---

## 5. Clientes HTTP

### Web — `apps/web/src/lib/api.ts`

- Basado en `fetch` nativo.
- Base URL: variable de entorno `NEXT_PUBLIC_API_URL`.
- Interceptor de 401: llama `/auth/refresh` y reintenta la request original.
- Tokens almacenados en **cookies HTTP-only** (gestionadas por el servidor).

### Web (Server Components) — `apps/web/src/lib/api.server.ts`

- Variante server-side del cliente.
- Lee cookies desde los headers de Next.js.
- Realiza refresh silencioso si el access token expiró.

### Mobile — `packages/api-client/src/`

- Singleton `apiClient` compartido.
- Base URL: `process.env.EXPO_PUBLIC_API_URL`.
- Inyección automática de `Bearer` token.
- Refresh silencioso en 401 con un solo vuelo en curso (evita race conditions).
- Módulos separados: `authApi`, `contentApi`, `subscriptionApi`.

---

## 6. Almacenamiento de tokens

| Plataforma | Mecanismo                        | Claves                                      |
|------------|----------------------------------|---------------------------------------------|
| Web        | Cookies HTTP-only (server-set)   | Gestionadas por Next.js middleware          |
| Mobile     | `expo-secure-store`              | `psico_access_token`, `psico_refresh_token` |

**Protección de rutas Web:** `apps/web/src/middleware.ts` protege `/dashboard/*` — redirige a `/login` si no hay token válido.

**Restauración de sesión Mobile:** en cold start, `AuthProvider` llama `/auth/refresh` con el token guardado en SecureStore antes de mostrar la app.

---

## 7. Manejo de errores

Ambas plataformas lanzan una clase `ApiError`:

```typescript
class ApiError extends Error {
  readonly statusCode: number;
  message: string;
}
```

| Código HTTP | Comportamiento                                              |
|-------------|-------------------------------------------------------------|
| 401         | Intenta refresh silencioso; si falla, redirige a login      |
| 404         | En `/subscriptions/me`: tratado como "sin suscripción" (FREE) |
| 409         | En `/auth/register`: email ya existe                        |

---

## 8. Endpoints no implementados en el frontend

Los siguientes endpoints existen en la API (`apps/api`) pero **no tienen llamada correspondiente** en web ni mobile:

| Endpoint                        | Módulo API         | Notas                                                   |
|---------------------------------|--------------------|---------------------------------------------------------|
| `POST /ai/chat`                 | `AIModule`         | Chat con el compañero IA — pantalla pendiente           |
| `POST /ai/ingest/:bookId`       | `AIModule`         | Solo admin; ingestión de embeddings — sin UI            |
| `GET /content/books/:slug/chapters/:id` | `ContentModule` | Detalle de capítulo — pantalla pendiente           |
| `GET /content/books/:slug/chapters/:id/exercises` | `ContentModule` | Ejercicios — no implementados en UI    |
| `POST /progress/:chapterId`     | `ProgressModule`   | Marcar progreso — no implementado en mobile             |
| `GET /progress`                 | `ProgressModule`   | Progreso del usuario — no implementado en UI            |
| `GET /notifications`            | `NotificationsModule` | Listado de notificaciones — sin pantalla           |
| `PATCH /users/me`               | `UsersModule`      | Editar perfil — sin pantalla                            |
| `GET /analytics/events`         | `AnalyticsModule`  | Solo admin/internal — sin UI necesaria                  |

---

*Fin de la auditoría.*
