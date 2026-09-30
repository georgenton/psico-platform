import { NextResponse } from "next/server";

import { declaredEnvironment } from "@/lib/deploy-env";

/**
 * Liveness de Web. Existe porque Coolify necesita una ruta HTTP que decida si el
 * contenedor está sano, y Next no trae ninguna (ADR 0024).
 *
 * En Vercel esto no hacía falta: la plataforma sabía por sí misma si una función
 * respondía. Un orquestador de contenedores no lo sabe, y sin una ruta que
 * contestar sólo puede comprobar que el proceso no se ha muerto — lo cual deja
 * pasar el caso que más importa, un proceso vivo que ya no sirve páginas.
 *
 * Deliberadamente **no** comprueba la API, ni la base, ni Redis. Un healthcheck
 * que depende de terceros convierte la caída de un tercero en el reinicio de este
 * contenedor, que es peor que el problema original: Web puede seguir sirviendo
 * páginas públicas con la API caída. Quien responde por esas dependencias es
 * `/health/integrations` de la API.
 *
 * Misma forma que `GET /health` de la API (`{ status, timestamp }`) para no
 * inventar un segundo contrato, más el entorno declarado, que es lo que el paso
 * VALIDATE del runbook necesita leer para comprobar que un despliegue de staging
 * no se cree producción. Nada de esto es secreto: un estado, una hora y una
 * palabra que ya viaja en la configuración.
 */

// Sin esto Next puede resolver la ruta en build y servir una hora congelada:
// un healthcheck que contesta 200 aunque el proceso esté atascado.
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(
    {
      status: "ok",
      timestamp: new Date().toISOString(),
      environment: declaredEnvironment(),
    },
    // Ni el navegador ni un proxy deben cachear una respuesta cuyo único valor
    // es ser de ahora mismo.
    { headers: { "cache-control": "no-store" } },
  );
}
