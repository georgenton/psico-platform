import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import { apiClient, authApi } from "@psico/api-client";
import type { AuthUser } from "@psico/types";
import { tokenStore } from "../store/secure-store";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "";

type TokenPair = { accessToken: string; refreshToken: string };

type AuthContextValue = {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login(email: string, password: string): Promise<void>;
  register(name: string, email: string, password: string): Promise<void>;
  logout(): Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Ref provides a non-stale token pointer for the API client callbacks.
  // Using ref (not state) so token changes don't trigger re-renders.
  const tokensRef = useRef<TokenPair | null>(null);

  const saveTokens = useCallback(async (pair: TokenPair) => {
    tokensRef.current = pair;
    await tokenStore.saveTokens(pair);
  }, []);

  const handleUnauthenticated = useCallback(() => {
    tokensRef.current = null;
    setUser(null);
    void tokenStore.clearTokens();
  }, []);

  // Wire the shared API client singleton once on mount.
  useEffect(() => {
    apiClient.configure(API_URL, {
      getAccessToken: () => tokensRef.current?.accessToken ?? null,
      getRefreshToken: () => tokensRef.current?.refreshToken ?? null,
      onTokensRefreshed: (pair: TokenPair) => {
        tokensRef.current = pair;
        void tokenStore.saveTokens(pair);
      },
      onUnauthenticated: handleUnauthenticated,
    });
  }, [handleUnauthenticated]);

  // Restore session on cold start via direct fetch — avoids the retry loop
  // since apiClient isn't fully configured at the start of this effect.
  useEffect(() => {
    void (async () => {
      const stored = await tokenStore.loadTokens();

      if (stored.refreshToken) {
        tokensRef.current = stored.refreshToken
          ? {
              accessToken: stored.accessToken ?? "",
              refreshToken: stored.refreshToken,
            }
          : null;

        try {
          const res = await fetch(`${API_URL}/auth/refresh`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ refreshToken: stored.refreshToken }),
          });

          if (res.ok) {
            const data = (await res.json()) as {
              accessToken: string;
              refreshToken: string;
              user: AuthUser;
            };
            const pair: TokenPair = {
              accessToken: data.accessToken,
              refreshToken: data.refreshToken,
            };
            await saveTokens(pair);
            setUser(data.user);
          } else {
            handleUnauthenticated();
          }
        } catch {
          handleUnauthenticated();
        }
      }

      setIsLoading(false);
    })();
  }, [handleUnauthenticated, saveTokens]);

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await authApi.login(email, password);
      const pair: TokenPair = {
        accessToken: res.accessToken,
        refreshToken: res.refreshToken,
      };
      await saveTokens(pair);
      setUser(res.user);
    },
    [saveTokens],
  );

  const register = useCallback(
    async (name: string, email: string, password: string) => {
      const res = await authApi.register(name, email, password);
      const pair: TokenPair = {
        accessToken: res.accessToken,
        refreshToken: res.refreshToken,
      };
      await saveTokens(pair);
      setUser(res.user);
    },
    [saveTokens],
  );

  const logout = useCallback(async () => {
    const refreshToken = tokensRef.current?.refreshToken ?? null;
    handleUnauthenticated();
    // Optimistic: clear state first, then revoke server-side
    if (refreshToken) {
      await authApi.logout(refreshToken).catch(() => {});
    }
  }, [handleUnauthenticated]);

  const value = useMemo(
    () => ({
      user,
      isLoading,
      isAuthenticated: user !== null,
      login,
      register,
      logout,
    }),
    [user, isLoading, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
