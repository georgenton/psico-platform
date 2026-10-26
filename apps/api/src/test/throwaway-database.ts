/**
 * Una base desechable que es SUYA, y que sólo borra lo que creó.
 *
 * ── El problema ────────────────────────────────────────────────────────────
 *
 * Las dos pg-specs nuevas empezaban así:
 *
 *   DROP DATABASE IF EXISTS "billing_events_db" WITH (FORCE)
 *   CREATE DATABASE "billing_events_db"
 *
 * El nombre es fijo, de modo que la suite destruye cualquier base que ya se
 * llame así —con `FORCE`, cerrando las conexiones abiertas— sin preguntarse de
 * quién era. En la máquina de alguien que tuviera una base con ese nombre, o
 * en dos ejecuciones simultáneas, eso borra trabajo ajeno. El `FORCE` convierte
 * un choque de nombres en una pérdida.
 *
 * ── Lo que hace en su lugar ────────────────────────────────────────────────
 *
 * Un nombre único por ejecución, creado y registrado; el borrado sólo acepta
 * ese nombre y comprueba que encaja con el patrón que este archivo genera. No
 * hay `DROP` previo porque no hay nada que pisar: si el nombre ya existiera
 * —lo cual exigiría una colisión de reloj, pid y azar— la creación falla y se
 * dice, que es mejor que destruir.
 *
 * ── Y una comprobación del destino ─────────────────────────────────────────
 *
 * `TEST_DATABASE_URL` es una variable de entorno: apuntarla por accidente a un
 * servidor real es un error de una letra. Se exige que el host sea local. No
 * es una barrera criptográfica —quien quiera saltársela puede— pero convierte
 * el accidente silencioso en un mensaje.
 */

import { Pool } from "pg";

import { dropWhenIdle } from "./pg-drop";

/** Lo único a lo que una base de prueba puede apuntar sin decirlo. */
const HOSTS_LOCALES = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

const PREFIJO = "psico_test_";

export interface ThrowawayDatabase {
  /** La URL completa, lista para Prisma o para un `Pool`. */
  readonly url: string;
  /** El nombre creado. Útil para los informes. */
  readonly name: string;
  /** Borra EXACTAMENTE esta base. Idempotente. */
  drop(): Promise<void>;
}

function assertDestinoDePrueba(baseUrl: string): URL {
  let u: URL;
  try {
    u = new URL(baseUrl);
  } catch {
    throw new Error("TEST_DATABASE_URL no es una URL válida.");
  }
  if (!HOSTS_LOCALES.has(u.hostname)) {
    throw new Error(
      `TEST_DATABASE_URL apunta a "${u.hostname}", que no es local. ` +
        "Las pg-specs crean y borran bases: no se ejecutan contra un servidor remoto.",
    );
  }
  return u;
}

function nombreUnico(prefijoSuite: string): string {
  const limpio = prefijoSuite.replace(/[^a-z0-9_]/gi, "_").toLowerCase();
  const azar = Math.random().toString(36).slice(2, 8);
  return `${PREFIJO}${limpio}_${process.pid}_${Date.now().toString(36)}_${azar}`;
}

/**
 * Crea una base desechable y devuelve cómo usarla y cómo deshacerla.
 *
 * @param baseUrl normalmente `process.env.TEST_DATABASE_URL`
 * @param suite  nombre corto de la suite, sólo para que el nombre sea legible
 */
export async function createThrowawayDatabase(
  baseUrl: string,
  suite: string,
): Promise<ThrowawayDatabase> {
  const u = assertDestinoDePrueba(baseUrl);
  const name = nombreUnico(suite);

  const admin = new Pool({ connectionString: baseUrl });
  try {
    // Sin DROP previo: el nombre es nuestro por construcción.
    await admin.query(`CREATE DATABASE "${name}"`);
  } finally {
    await admin.end();
  }

  u.pathname = `/${name}`;
  const url = u.toString();
  let borrada = false;

  return {
    url,
    name,
    async drop() {
      if (borrada) return;
      // La guarda que da sentido a todo lo anterior: este método no puede
      // borrar una base que este archivo no haya creado.
      if (!name.startsWith(PREFIJO)) {
        throw new Error(
          `Negado: "${name}" no es una base desechable de pruebas.`,
        );
      }
      const a = new Pool({ connectionString: baseUrl });
      try {
        // No `FORCE` directo: ver `pg-drop.ts`. Forzar aquí termina las
        // conexiones que la propia suite acaba de pedir cerrar, y el `FATAL`
        // resultante puede llegar a un cliente a medio cerrar y tumbar la
        // corrida entera sin que falle ninguna prueba.
        await dropWhenIdle(a, name);
        borrada = true;
      } finally {
        await a.end();
      }
    },
  };
}
