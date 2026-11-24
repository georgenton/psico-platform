import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/api.server";
import { marcaDeCuenta } from "@/lib/marca-de-cuenta.server";

/**
 * ¿De qué cuenta es la sesión de este navegador, AHORA?
 *
 * La respuesta es la marca —un resumen que no autoriza nada y que el panel ya
 * lleva— y sirve para que una pestaña compare la suya. Ver
 * `lib/crypto/sesion-vigente.tsx`.
 *
 * Cuelga de `/dashboard` a propósito: el middleware renueva ahí el token vencido
 * antes de llegar aquí y, sin sesión, redirige. Quien pregunta lee esa
 * redirección como «no hay sesión».
 */
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(
    { marca: marcaDeCuenta(getSessionUser()?.userId) },
    { headers: { "cache-control": "no-store, private", vary: "Cookie" } },
  );
}
