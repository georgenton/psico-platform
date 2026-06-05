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
import { tokenStore, pushIdStore } from "../store/secure-store";
import { diaryKeyStore } from "../crypto/diary-key-store";
import {
  tryRegisterPushToken,
  tryUnregisterPushToken,
} from "../notifications/push-registration";

const API_ROOT = process.env.EXPO_PUBLIC_API_URL ?? "";
// Cold-start refresh hits the raw fetch (not apiClient — see below comment),
// so it must compose the /api prefix itself. ADR 0006 — Sprint 0.A.
const API_URL = API_ROOT.replace(/\/$/, "");
const API_BASE = `${API_URL}/api`;

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
    // S6-crypto: when the user signs out the diary key MUST be wiped from
    // SecureStore too. Otherwise the next user on the same device (kid,
    // partner, lost-phone scenario) could open the diary with a stale key.
    void diaryKeyStore.clear();
    // S43: revoke the server-side push device token so we don't push
    // nudges to a logged-out user. Best-effort — the next login will
    // re-register.
    void (async () => {
      const id = await pushIdStore.load();
      if (id) {
        await tryUnregisterPushToken(id);
        await pushIdStore.clear();
      }
    })();
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
          const res = await fetch(`${API_BASE}/auth/refresh`, {
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

  // Sprint S43: register the device push token whenever auth transitions
  // to authenticated. Idempotent on the server side (upsert on token), so
  // re-running on app cold start is safe. Errors are swallowed by the
  // helper — push is non-critical.
  useEffect(() => {
    if (user === null) return;
    void (async () => {
      const existing = await pushIdStore.load();
      if (existing) return; // already registered on this install
      const res = await tryRegisterPushToken();
      if (res) await pushIdStore.save(res.id);
    })();
  }, [user]);

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
