/**
 * Errores de la app móvil hacia Sentry. Inerte sin `EXPO_PUBLIC_SENTRY_DSN`.
 *
 * Se invoca una vez desde `app/_layout.tsx`, antes de pintar ninguna pantalla.
 *
 * Privacidad: la misma lista blanca que la API y la Web
 * (`@psico/types/observability-allowlist`). Además, sólo habla la parte de
 * JavaScript: el SDK nativo manda sus propios informes sin pasar por
 * `beforeSend`, así que no se enciende. Ni capturas, ni jerarquía de vistas, ni
 * migas, ni sesiones, ni trazas: con el Diario abierto hay texto descifrado en
 * pantalla.
 *
 * La app no está publicada en ninguna parte, y a diferencia de los otros cuatro
 * procesos esto NO se ha ensayado contra un receptor. Antes de ponerle un DSN
 * hay que hacerlo, en un dispositivo.
 */
import * as Sentry from "@sentry/react-native";
import {
  closedEnvironment,
  closedRelease,
  guardedOptions,
  isMinifiedFunction,
  type ObservabilityPolicy,
} from "@psico/types";
import { appEnvironment } from "@/config/environment";

let initialised = false;

const BUNDLE = /(?:^|\/)(main\.jsbundle|index\.(?:ios|android)\.bundle)$/;

function policy(): ObservabilityPolicy {
  return {
    service: "feelverse-mobile",
    environment: closedEnvironment(appEnvironment()),
    release: closedRelease(process.env.EXPO_PUBLIC_SENTRY_RELEASE),
    platform: "javascript",
    file: (raw) => {
      const name = raw.match(BUNDLE)?.[1];
      return name ? { name, inApp: true } : null;
    },
    fn: (name) => isMinifiedFunction(name),
  };
}

export function initSentry(): void {
  if (initialised) return;
  const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
  if (!dsn) {
    // Still a no-op without a DSN, deliberately: staging has no Sentry project
    // provisioned, and requiring one would make the staging profile unusable
    // for the thing it exists for.
    initialised = true;
    return;
  }
  Sentry.init({
    ...(guardedOptions(policy()) as Partial<Sentry.ReactNativeOptions>),
    dsn,
    // The app's OWN posture. This read `EXPO_PUBLIC_VERCEL_ENV` until now — a
    // deployment detail of a platform this client does not run on, and which is
    // retired from the operational plan (ADR 0024, decision of 2026-11-05).
    // Naming a mobile client's identity after someone else's infrastructure
    // means the identity disappears when that
    // infrastructure does, and until then every mobile event was tagged
    // `development` because the variable was never set on a phone.
    environment: appEnvironment(),
    // El SDK nativo informa por su cuenta y no pasa por la lista blanca.
    enableNative: false,
    enableAutoSessionTracking: false,
    // Hard-off screenshots + view hierarchy — would leak Diario plaintext.
    attachScreenshot: false,
    attachViewHierarchy: false,
    sendDefaultPii: false,
  });
  initialised = true;
}
