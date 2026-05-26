import { ApiError } from "./error";

// Callbacks the AuthContext wires up so the client can read/rotate tokens
// without holding a direct reference to SecureStore or React state.
export type TokenStore = {
  getAccessToken(): string | null;
  getRefreshToken(): string | null;
  onTokensRefreshed(tokens: {
    accessToken: string;
    refreshToken: string;
  }): void;
  onUnauthenticated(): void;
};

class PsicoApiClient {
  private baseUrl = "";
  private store: TokenStore | null = null;

  // Single in-flight refresh — prevents token rotation race when multiple
  // requests get 401 simultaneously.
  private refreshing: Promise<void> | null = null;

  configure(baseUrl: string, store: TokenStore): void {
    // baseUrl from env is the API root (e.g. "https://api.example.com").
    // The /api segment is appended here so feature clients (auth, content, …)
    // can declare clean paths like "/auth/login". Mirrors web/src/lib/api.ts.
    // Sprint 0.A · ADR 0006.
    const root = baseUrl.replace(/\/$/, "");
    this.baseUrl = `${root}/api`;
    this.store = store;
  }

  get<T>(path: string): Promise<T> {
    return this.request<T>("GET", path);
  }

  post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>("POST", path, body);
  }

  patch<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>("PATCH", path, body);
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    isRetry = false,
  ): Promise<T> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    const token = this.store?.getAccessToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (res.status === 401 && !isRetry && this.store) {
      await this.tryRefresh();
      return this.request<T>(method, path, body, true);
    }

    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as {
        message?: string;
      };
      throw new ApiError(res.status, data.message ?? res.statusText);
    }

    if (res.status === 204) return undefined as T;
    return res.json() as Promise<T>;
  }

  private async tryRefresh(): Promise<void> {
    if (this.refreshing) return this.refreshing;

    this.refreshing = (async () => {
      const refreshToken = this.store?.getRefreshToken();
      if (!refreshToken) {
        this.store?.onUnauthenticated();
        throw new ApiError(401, "No refresh token available");
      }

      const res = await fetch(`${this.baseUrl}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      });

      if (!res.ok) {
        this.store?.onUnauthenticated();
        throw new ApiError(401, "Sesión expirada. Vuelve a iniciar sesión.");
      }

      const data = (await res.json()) as {
        accessToken: string;
        refreshToken: string;
      };
      this.store?.onTokensRefreshed({
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
      });
    })().finally(() => {
      this.refreshing = null;
    });

    return this.refreshing;
  }
}

export const apiClient = new PsicoApiClient();
