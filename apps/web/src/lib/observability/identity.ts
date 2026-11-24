import {
  closedEnvironment,
  closedRelease,
  type ObservabilityEnvironment,
} from "@psico/types/observability";
import { declaredEnvironment } from "@/lib/deploy-env";

/**
 * Entorno y versión de los dos procesos de servidor de Web.
 *
 * El entorno es el declarado (`PSICO_ENV`), nunca `NODE_ENV`. La versión es el
 * commit: `SOURCE_COMMIT` es el nombre que pone Coolify, `RELEASE_SHA` el
 * nuestro, y el incrustado en la construcción es el último recurso. Si no hay
 * ninguno, o no es un SHA, los eventos salen sin versión.
 */
export function serverIdentity(): {
  environment: ObservabilityEnvironment;
  release: string | null;
} {
  return {
    environment: closedEnvironment(declaredEnvironment()),
    release: closedRelease(
      process.env.SOURCE_COMMIT ||
        process.env.RELEASE_SHA ||
        process.env.NEXT_PUBLIC_RELEASE_SHA,
    ),
  };
}
