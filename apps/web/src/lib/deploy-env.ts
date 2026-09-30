/**
 * Qué entorno está sirviendo esta build de Web, sin preguntárselo a un proveedor.
 *
 * Hasta ADR 0024 la respuesta era `VERCEL_ENV`, que Vercel define y nadie más.
 * Con el runtime en Coolify esa variable simplemente no existe, y las dos cosas
 * que dependían de ella —el 404 de las rutas de prototipos y la etiqueta de
 * entorno en Sentry— dejarían de funcionar en silencio: la ruta se volvería
 * accesible en producción y todos los errores se reportarían como
 * «development».
 *
 * `PSICO_ENV` es el nombre que la API ya usa para lo mismo, así que Web habla el
 * mismo vocabulario. `VERCEL_ENV` se conserva como respaldo mientras Vercel siga
 * encendido como rollback: en Vercel el comportamiento es exactamente el de
 * antes de este cambio.
 */

/**
 * Marcadores de plataforma. Sólo pueden añadir «esto está desplegado», nunca
 * quitarlo.
 *
 * Únicamente variables que existen DENTRO del contenedor. A propósito no está
 * `COOLIFY_URL`: es como se configura un CLIENTE para hablar con un Coolify, así
 * que cualquier portátil con el CLI o el MCP la lleva puesta, y tomarla por
 * «estoy desplegado» haría desaparecer las rutas de prototipos en local.
 */
function looksDeployed(): boolean {
  return Boolean(
    process.env.PSICO_DEPLOYED?.trim() ??
    process.env.VERCEL_ENV ??
    process.env.COOLIFY_RESOURCE_UUID ??
    process.env.COOLIFY_CONTAINER_NAME,
  );
}

/** `production` | `staging` | `preview` | `development`, o null si nadie lo dijo. */
export function declaredEnvironment(): string | null {
  const explicit = process.env.PSICO_ENV?.trim().toLowerCase();
  if (explicit) return explicit;
  const vercel = process.env.VERCEL_ENV?.trim().toLowerCase();
  if (vercel) return vercel;
  return null;
}

/**
 * Si las rutas de `/prototipos/*` deben devolver 404.
 *
 * La polaridad importa y va al contrario que en el resto del proyecto. Esta
 * función protege una superficie que **se oculta**, así que ante la duda oculta:
 *
 * | lo que sabemos                          | resultado  |
 * | --------------------------------------- | ---------- |
 * | entorno declarado `production`          | **404**    |
 * | entorno declarado cualquier otro        | accesible  |
 * | nadie lo declaró, y la caja está desplegada | **404** |
 * | nadie lo declaró, y es una caja local   | accesible  |
 *
 * La tercera fila es la que este cambio añade. Antes, «nadie lo declaró» sólo
 * pasaba en local; en Coolify pasaría en producción, y el gate se habría abierto
 * solo. Una caja desplegada no es una caja de revisión de diseño, y si alguien
 * olvida la variable el coste de equivocarse debe ser un 404 molesto, no una
 * ruta de prototipos publicada.
 */
export function prototypeRoutesHidden(): boolean {
  const env = declaredEnvironment();
  if (env) return env === "production";
  return looksDeployed();
}
