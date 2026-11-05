import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * La política de despliegue de Web — después de retirar Vercel del plan.
 *
 * QUÉ DECIDE ESTA PRUEBA. `scripts/vercel-ignore-web.sh` es lo que Vercel
 * ejecuta para responder «¿construyo @psico/web en este commit?». FeelVerse se
 * aloja y despliega **exclusivamente en OVH con Coolify**, así que la respuesta
 * correcta es siempre la misma: no.
 *
 * LA POLARIDAD SIGUE SIENDO LO QUE MÁS DUELE SI SE INVIERTE, y ahora duele en
 * una sola dirección: para Vercel `exit 0` ABORTA el build y `exit 1` lo
 * CONTINÚA. Un `exit 1` por cualquier camino devuelve a FeelVerse a una
 * plataforma retirada, sin que nadie lo pida y sin que nadie se entere.
 *
 * POR QUÉ NO BASTA CON BORRAR EL FICHERO. Porque sin `ignoreCommand` Vercel
 * construye en CADA commit de la rama conectada: borrarlo consigue lo contrario
 * de lo que parece. La integración Git vive en la cuenta de Vercel y no se
 * desactiva desde el repositorio; responder «no construyas» a todo sí.
 *
 * CÓMO SE PRUEBA, y por qué cambió la forma. La versión anterior (#725)
 * levantaba worktrees de git de verdad para comprobar el grafo del workspace,
 * porque la respuesta DEPENDÍA del commit. Ya no depende de nada, así que
 * montar clones probaría una lógica que no existe. Lo que hay que fijar es
 * justo lo contrario: que **ninguna** condición consiga un build.
 *
 * Así que se prueba por dos caminos que fallan por motivos distintos: ejecutar
 * el guión en las situaciones que ANTES construían, y leerlo para comprobar que
 * no le queda ningún camino de salida distinto de cero. Lo primero se le escapa
 * a una rama que no se sepa provocar; lo segundo no.
 */

/** Para Vercel: 0 aborta el build, 1 lo continúa. No es intuitivo; es el contrato. */
const OMITIR = 0;

const raiz = join(__dirname, "..", "..", "..");
const script = join(raiz, "scripts", "vercel-ignore-web.sh");

/**
 * Ejecuta el guión y devuelve su código de salida.
 *
 * El intérprete se nombra por ruta absoluta a propósito: uno de los casos de
 * abajo vacía el `PATH` para simular «sin turbo disponible», y con `"sh"` a
 * secas sería el propio lanzador el que no encuentra el intérprete — un fallo
 * del arnés disfrazado de fallo del guión.
 */
function correr(env: Record<string, string> = {}, cwd = raiz): number {
  try {
    execFileSync("/bin/sh", [script], {
      cwd,
      env: { ...process.env, ...env },
      stdio: "pipe",
    });
    return 0;
  } catch (e) {
    const status = (e as { status?: number }).status;
    return typeof status === "number" ? status : -1;
  }
}

describe("Vercel no construye Web, bajo ninguna condición", () => {
  it("sin ninguna variable de entorno", () => {
    expect(correr()).toBe(OMITIR);
  });

  it("con la rama de producción, que antes construía siempre", () => {
    expect(
      correr({
        VERCEL_GIT_COMMIT_REF: "main",
        VERCEL_GIT_REPO_DEFAULT_BRANCH: "main",
      }),
    ).toBe(OMITIR);
  });

  it("con un deployment previo en la rama, que antes daba la base a comparar", () => {
    expect(
      correr({
        VERCEL_GIT_PREVIOUS_SHA: "0".repeat(40),
        VERCEL_GIT_COMMIT_REF: "main",
      }),
    ).toBe(OMITIR);
  });

  it("sin turbo en el PATH — el caso que antes construía «por precaución»", () => {
    // Era la rama de fallo abierto: sin turbo no se podía demostrar que Web no
    // estaba afectada, así que construía. Hoy no hay nada que demostrar.
    expect(correr({ PATH: "/nonexistent" })).toBe(OMITIR);
  });

  it("desde un directorio que no es la raíz del repositorio", () => {
    expect(correr({}, "/tmp")).toBe(OMITIR);
  });

  it("en un entorno que se presenta como el clon superficial de Vercel", () => {
    expect(
      correr({
        VERCEL: "1",
        VERCEL_ENV: "production",
        VERCEL_GIT_COMMIT_REF: "main",
        VERCEL_GIT_REPO_OWNER: "georgenton",
        VERCEL_GIT_REPO_SLUG: "psico-platform",
      }),
    ).toBe(OMITIR);
  });
});

describe("el guión no conserva ningún camino hacia un build", () => {
  const fuente = readFileSync(script, "utf8");

  /**
   * Las líneas que el intérprete ejecuta: sin comentarios y sin vacías. Los
   * comentarios de este guión EXPLICAN la polaridad y nombran `exit 1` para
   * documentar qué significaría, así que un grep sobre el fichero entero daría
   * un falso positivo y volvería la prueba inútil.
   */
  const codigo = fuente
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("#"));

  it("no hay ninguna salida distinta de cero", () => {
    const salidas = codigo.filter((l) => /\bexit\b/.test(l));
    expect(salidas.length).toBeGreaterThan(0);
    for (const linea of salidas) {
      expect(linea).toMatch(/\bexit\s+0\b/);
    }
  });

  it("no queda lógica condicional que pudiera reintroducir un build", () => {
    // Un `if`, un `case` o un `&&` son la forma en que volvería: alguien añade
    // «sólo en main», «sólo si cambió Web», y el guión vuelve a decidir.
    const condicionales = codigo.filter((l) =>
      /(^|\s)(if|elif|case|while|until)(\s|$)|\|\||&&/.test(l),
    );
    expect(condicionales).toEqual([]);
  });

  it("dice en voz alta dónde se despliega, para quien lea el log de Vercel", () => {
    expect(fuente).toMatch(/OVH\/Coolify/);
  });
});
