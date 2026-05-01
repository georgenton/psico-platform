"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { authApi, ApiError } from "@/lib/api";
import type { LoginPayload, RegisterPayload } from "@/lib/api";
import { TOKEN_NAMES, cookieOptions } from "@/lib/cookies";

// ── Shared helpers ─────────────────────────────────────────────────────────

function setAuthCookies(accessToken: string, refreshToken: string) {
  const store = cookies();
  store.set(TOKEN_NAMES.access, accessToken, cookieOptions.access);
  store.set(TOKEN_NAMES.refresh, refreshToken, cookieOptions.refresh);
}

function clearAuthCookies() {
  const store = cookies();
  store.delete(TOKEN_NAMES.access);
  store.delete(TOKEN_NAMES.refresh);
}

// Validates that the redirect target is a relative path to prevent open
// redirect attacks.
function safeRedirectTarget(from: string | null): string {
  if (!from || !from.startsWith("/") || from.startsWith("//")) {
    return "/dashboard";
  }
  return from;
}

// ── Actions ────────────────────────────────────────────────────────────────

export async function loginAction(
  payload: LoginPayload & { from?: string },
): Promise<{ error: string } | undefined> {
  try {
    const { accessToken, refreshToken } = await authApi.login(payload);
    setAuthCookies(accessToken, refreshToken);
  } catch (err) {
    if (err instanceof ApiError) {
      const message =
        err.status === 401
          ? "Email o contraseña incorrectos."
          : "Error al iniciar sesión. Inténtalo de nuevo.";
      return { error: message };
    }
    return { error: "Error inesperado. Inténtalo de nuevo." };
  }
  redirect(safeRedirectTarget(payload.from ?? null));
}

export async function registerAction(
  payload: RegisterPayload,
): Promise<{ error: string } | undefined> {
  try {
    const { accessToken, refreshToken } = await authApi.register(payload);
    setAuthCookies(accessToken, refreshToken);
  } catch (err) {
    if (err instanceof ApiError) {
      const message =
        err.status === 409
          ? "Ya existe una cuenta con este email."
          : "Error al registrarse. Inténtalo de nuevo.";
      return { error: message };
    }
    return { error: "Error inesperado. Inténtalo de nuevo." };
  }
  redirect("/dashboard");
}

export async function logoutAction(): Promise<void> {
  const store = cookies();
  const accessToken = store.get(TOKEN_NAMES.access)?.value;
  const refreshToken = store.get(TOKEN_NAMES.refresh)?.value;

  if (accessToken && refreshToken) {
    try {
      await authApi.logout(refreshToken, accessToken);
    } catch {
      // Best-effort: always clear local cookies even if API call fails
    }
  }

  clearAuthCookies();
  redirect("/login");
}
