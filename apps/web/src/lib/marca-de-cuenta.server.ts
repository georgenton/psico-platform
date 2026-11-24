import "server-only";
import { createHash } from "node:crypto";

/**
 * La marca con la que las pestañas de un navegador se preguntan si la sesión
 * sigue siendo de la misma cuenta. Ver `lib/crypto/sesion-vigente.tsx`.
 *
 * Sale del identificador y no de la sal: la sal cambia al cambiar la contraseña,
 * y la pregunta aquí es «¿la misma cuenta?». Es un resumen corto —96 bits— con
 * su propio prefijo, así que no coincide con el de `guide-recovery-scope`. No es
 * un secreto y no autoriza nada.
 */
export function marcaDeCuenta(
  userId: string | null | undefined,
): string | null {
  if (!userId) return null;
  return createHash("sha256")
    .update(`marca-de-cuenta-v1\0${userId}`, "utf8")
    .digest("base64url")
    .slice(0, 16);
}
