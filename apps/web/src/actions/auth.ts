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
/**
 * Un origen que no puede existir, contra el que resolver destinos.
 *
 * `.invalid` está reservado por la RFC 2606, así que ningún DNS lo sirve nunca.
 * Sirve de referencia sin codificar el dominio real: si un destino resuelve
 * aquí, es relativo; si resuelve a cualquier otra cosa, nombra otro sitio.
 */
const SENTINEL_ORIGIN = "https://internal.invalid";

/**
 * El destino interno al que volver tras iniciar sesión, o `/dashboard`.
 *
 * Comprobar prefijos no basta. `"/\\evil.example/phish"` empieza por `/` y no
 * por `//`, así que pasaba el filtro anterior — y el parser de URLs normaliza
 * la barra invertida a `/`, de modo que el navegador lo resolvía como
 * `https://evil.example/phish`. Un redirect abierto a partir de una cadena que
 * "parecía" relativa.
 *
 * Así que la pregunta no se le hace al texto sino al mismo parser que usará el
 * navegador: resolvemos contra un origen centinela y exigimos seguir en él.
 *
 * Se comprueba DOS veces, y la segunda no es redundante: normalizar `..` puede
 * fabricar un `//host` que vuelve a ser protocol-relative, así que lo que se
 * valida al final es exactamente la cadena que se emite.
 */
function safeRedirectTarget(from: string | null): string {
  if (!from || !from.startsWith("/")) return "/dashboard";

  let resolved: URL;
  try {
    resolved = new URL(from, SENTINEL_ORIGIN);
  } catch {
    // Entrada que ni siquiera parsea: no hay destino que conservar.
    return "/dashboard";
  }
  if (resolved.origin !== SENTINEL_ORIGIN) return "/dashboard";

  const target = `${resolved.pathname}${resolved.search}${resolved.hash}`;
  try {
    if (new URL(target, SENTINEL_ORIGIN).origin !== SENTINEL_ORIGIN) {
      return "/dashboard";
    }
  } catch {
    return "/dashboard";
  }
  return target;
}

// ── Actions ────────────────────────────────────────────────────────────────

/**
 * Translate an `ApiError` from the auth endpoints into a user-facing
 * Spanish message. Centralised so login/register/oauth share the same
 * vocabulary and we cover every error class instead of falling into a
 * generic "Error al iniciar sesión" that hides the real cause from the
 * user (and from us).
 *
 * Mapping rules:
 *   - 400 + VALIDATION_ERROR → list the field problems if we have them,
 *     fall back to a generic "Revisa los datos del formulario." otherwise.
 *   - 401 → "Email o contraseña incorrectos." (login only — register and
 *     OAuth pass through here as 401 should not happen there).
 *   - 409 + EMAIL_ALREADY_REGISTERED → "Ya existe una cuenta con este email."
 *   - 410 → token expirado/revocado (verify-email, reset-password).
 *   - 429 → "Demasiados intentos. Intenta de nuevo en X minutos."
 *   - 500+ → "Estamos teniendo un problema. Intenta de nuevo en un momento."
 *   - cualquier otro `ApiError` → mensaje genérico con el código entre
 *     paréntesis para que tú lo veas si reportas el bug.
 */
/**
 * Las líneas legibles de un `VALIDATION_ERROR`, sea cual sea la forma que llegue.
 *
 * El detalle que la API produce de verdad es un `string[]`: el filtro global
 * reenvía el array de class-validator tal cual. El lector anterior daba por
 * hecho `Record<string, string[]>` y llamaba a `.map()` sobre cada valor, así
 * que con la forma real recibía un string y lanzaba `TypeError` — dentro del
 * manejador de errores, convirtiendo un 400 explicable en un 500 opaco.
 *
 * Las dos formas admitidas se discriminan explícitamente. Cualquier otra cosa
 * devuelve la lista vacía y el mensaje genérico se encarga: es mejor decir
 * menos que inventar texto a partir de una estructura que no reconocemos, y
 * desde luego mejor que volver a lanzar.
 */
function validationDetailLines(details: unknown): string[] {
  // Forma real de class-validator: ["email must be an email", …].
  if (Array.isArray(details)) {
    return details.filter((d): d is string => typeof d === "string");
  }
  // Forma por campo. La API no la emite hoy para VALIDATION_ERROR, pero es la
  // que el tipo declaraba y hay cobertura que la fija, así que se mantiene
  // tolerada — no anunciada como contrato.
  if (details !== null && typeof details === "object") {
    return Object.entries(details as Record<string, unknown>).flatMap(
      ([field, constraints]) =>
        Array.isArray(constraints)
          ? constraints
              .filter((c): c is string => typeof c === "string")
              .map((c) => `${field}: ${c}`)
          : [],
    );
  }
  return [];
}

function authErrorMessage(err: ApiError): string {
  if (err.status === 400 && err.code === "VALIDATION_ERROR") {
    const detailLines = validationDetailLines(err.details);
    if (detailLines.length > 0) {
      return `Revisa los datos del formulario: ${detailLines.join("; ")}.`;
    }
    return "Revisa los datos del formulario.";
  }
  if (err.status === 401) {
    return "Email o contraseña incorrectos.";
  }
  if (err.status === 409 && err.code === "EMAIL_ALREADY_REGISTERED") {
    return "Ya existe una cuenta con este email.";
  }
  if (err.status === 410) {
    return "El enlace ya expiró o fue usado. Solicita uno nuevo.";
  }
  if (err.status === 429) {
    return "Demasiados intentos desde tu red. Intenta de nuevo en 15 minutos.";
  }
  if (err.status >= 500) {
    return "Estamos teniendo un problema. Intenta de nuevo en un momento.";
  }
  // Any other ApiError — surface the code so the user can report it.
  const codeSuffix = err.code ? ` (código: ${err.code})` : "";
  return `Ocurrió un error inesperado${codeSuffix}. Intenta de nuevo.`;
}

export async function loginAction(
  payload: LoginPayload & { from?: string },
): Promise<{ error: string } | undefined> {
  // `from` es a dónde volver, no quién eres. Separarlo aquí es lo que impide
  // que un dato de navegación viaje dentro del cuerpo de `/auth/login`: la API
  // valida con `whitelist` + `forbidNonWhitelisted`, así que una propiedad de
  // más no se ignora, se rechaza — y el formulario acababa mostrando un error
  // de validación por un campo que el usuario nunca escribió.
  // Construido campo a campo, no por descarte. Un rest-spread quita `from`,
  // pero no promete "sólo email y password": cualquier propiedad que llegue en
  // runtime — un campo oculto del formulario, un contrato que crezca — viajaría
  // igual, y `forbidNonWhitelisted` la rechazaría con el mismo 400 de antes.
  const { email, password, from } = payload;
  try {
    const { accessToken, refreshToken } = await authApi.login({
      email,
      password,
    });
    setAuthCookies(accessToken, refreshToken);
  } catch (err) {
    if (err instanceof ApiError) {
      return { error: authErrorMessage(err) };
    }
    // Non-ApiError → fetch itself failed (network down, DNS, etc.).
    return {
      error:
        "No pudimos conectar con el servidor. Revisa tu conexión e intenta de nuevo.",
    };
  }
  redirect(safeRedirectTarget(from ?? null));
}

export async function registerAction(
  payload: RegisterPayload,
): Promise<{ error: string } | undefined> {
  try {
    const { accessToken, refreshToken } = await authApi.register(payload);
    setAuthCookies(accessToken, refreshToken);
  } catch (err) {
    if (err instanceof ApiError) {
      return { error: authErrorMessage(err) };
    }
    return {
      error:
        "No pudimos conectar con el servidor. Revisa tu conexión e intenta de nuevo.",
    };
  }
  redirect("/dashboard");
}

// Sprint S58 — Google Sign-In server action. The browser obtains a Google
// id_token from Google Identity Services (GIS) and posts it here. We
// forward to the backend, which verifies the signature against Google's
// public keys + matches/creates a User row, then returns the same
// AuthResponse as the email/password flow.
export async function loginWithGoogleAction(
  idToken: string,
  from?: string,
): Promise<{ error: string } | undefined> {
  try {
    const { accessToken, refreshToken } = await authApi.oauthGoogle(idToken);
    setAuthCookies(accessToken, refreshToken);
  } catch (err) {
    if (err instanceof ApiError) {
      const message =
        err.status === 409
          ? "Esta cuenta ya existe con email/contraseña. Iniciá sesión con esa modalidad."
          : err.status === 401
            ? "No pudimos verificar tu cuenta de Google."
            : "Error al iniciar sesión con Google.";
      return { error: message };
    }
    return { error: "Error inesperado. Reintenta." };
  }
  redirect(safeRedirectTarget(from ?? null));
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
  // Wipe the diary session wrap cookie too. We can't reach localStorage from
  // a server action, so the client-side `lock()` (called when the diary
  // provider sees the user is logged out) is what clears the encrypted
  // bundle. The combination is enough — an empty cookie makes the next
  // restore short-circuit before touching localStorage anyway.
  cookies().delete("psico_diary_wrap");
  redirect("/login");
}
