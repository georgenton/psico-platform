import type {
  AuthResponse,
  BillingInterval,
  Book,
  BookWithChapters,
  CheckoutSessionResponse,
  PlanInfo,
  PortalSessionResponse,
  Subscription,
} from "@psico/types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3333";

// ── Error type ─────────────────────────────────────────────────────────────

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// ── Base fetch ─────────────────────────────────────────────────────────────

interface FetchOptions extends Omit<RequestInit, "body"> {
  token?: string;
  // Accept typed objects so callers don't have to JSON.stringify manually
  body?: object | string | null;
}

export async function apiFetch<T>(
  path: string,
  { token, body, ...init }: FetchOptions = {},
): Promise<T> {
  const headers = new Headers(init.headers);

  const serialisedBody =
    body != null && typeof body === "object"
      ? JSON.stringify(body)
      : (body ?? undefined);

  if (serialisedBody != null) {
    headers.set("Content-Type", "application/json");
  }
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    body: serialisedBody ?? undefined,
    headers,
  });

  if (!response.ok) {
    const payload = await response
      .json()
      .catch(() => ({ message: response.statusText }));
    throw new ApiError(
      response.status,
      (payload as { message?: string }).message ?? "Request failed",
    );
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

// ── Auth ───────────────────────────────────────────────────────────────────

export interface RegisterPayload {
  email: string;
  password: string;
  name: string;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export const authApi = {
  register: (payload: RegisterPayload) =>
    apiFetch<AuthResponse>("/auth/register", {
      method: "POST",
      body: payload,
    }),

  login: (payload: LoginPayload) =>
    apiFetch<AuthResponse>("/auth/login", {
      method: "POST",
      body: payload,
    }),

  refresh: (refreshToken: string) =>
    apiFetch<AuthResponse>("/auth/refresh", {
      method: "POST",
      body: { refreshToken },
    }),

  logout: (refreshToken: string, token: string) =>
    apiFetch<void>("/auth/logout", {
      method: "POST",
      body: { refreshToken },
      token,
    }),
};

// ── Books ──────────────────────────────────────────────────────────────────

export const booksApi = {
  findAll: (token?: string) => apiFetch<Book[]>("/content/books", { token }),

  findBySlug: (slug: string, token?: string) =>
    apiFetch<BookWithChapters>(`/content/books/${slug}`, { token }),
};

// ── Subscriptions ──────────────────────────────────────────────────────────

export interface CheckoutPayload {
  billingPlan: BillingInterval;
  successUrl: string;
  cancelUrl: string;
}

export const subscriptionsApi = {
  getPlans: () => apiFetch<PlanInfo[]>("/subscriptions/plans"),

  getMySubscription: (token: string) =>
    apiFetch<Subscription>("/subscriptions/me", { token }),

  createCheckout: (token: string, payload: CheckoutPayload) =>
    apiFetch<CheckoutSessionResponse>("/subscriptions/checkout", {
      method: "POST",
      body: payload,
      token,
    }),

  createPortal: (token: string, returnUrl: string) =>
    apiFetch<PortalSessionResponse>("/subscriptions/portal", {
      method: "POST",
      body: { returnUrl },
      token,
    }),
};
