import { getSessionUser } from "@/lib/api.server";
import { SoloDeEstaCuenta } from "@/lib/crypto/sesion-vigente";
import { marcaDeCuenta } from "@/lib/marca-de-cuenta.server";

/**
 * Envuelve las pantallas que juntan una llave del panel con su propio token.
 *
 * La marca sale de la misma cookie que el token que se les entrega, en la misma
 * petición, así que dice de quién es ese token. Ver `SoloDeEstaCuenta`.
 */
export function PantallaDeLaSesion({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SoloDeEstaCuenta marca={marcaDeCuenta(getSessionUser()?.userId)}>
      {children}
    </SoloDeEstaCuenta>
  );
}
