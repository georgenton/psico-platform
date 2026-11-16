import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

/**
 * El trinquete del verificador de paquetes sellados.
 *
 * `scripts/eec/verify-guide-manifests.mjs` vive fuera de los workspaces, así
 * que nada lo ejercitaba — y un guion de verificación sin verificar es
 * exactamente donde aparece un falso verde. Apareció: el 2026-11-16, ejecutado
 * contra un directorio que contenía **sólo un `SHA256SUMS.txt` vacío**,
 * respondía `exit 0` y «OK — el paquete sellado coincide con lo que se firmó».
 *
 * Estas dos pruebas son el par mínimo que lo hace imposible:
 *
 *   - un paquete vacío **tiene** que rechazarse;
 *   - y el paquete real **tiene** que aceptarse, para que el trinquete no se
 *     pueda satisfacer haciendo que el guion falle siempre.
 *
 * Mismo patrón que `apps/web/src/deploy-policy.test.ts`, que ratchetea otro
 * guion de la raíz desde un workspace.
 */

const ROOT = join(process.cwd(), "..", "..");
const GUION = join(ROOT, "scripts", "eec", "verify-guide-manifests.mjs");
const PAQUETE_C01 = "artifacts/eec/C01/v1.0/feelverse/guides";

const temporales: string[] = [];

afterAll(() => {
  for (const d of temporales) rmSync(d, { recursive: true, force: true });
});

/** Ejecuta el guion y devuelve `{ code, salida }`, sin lanzar. */
function correr(
  cwd: string,
  args: string[] = [],
): { code: number; salida: string } {
  try {
    const salida = execFileSync(
      "node",
      [join(cwd, "scripts/eec/verify-guide-manifests.mjs"), ...args],
      {
        cwd,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    return { code: 0, salida };
  } catch (err) {
    const e = err as { status?: number; stdout?: string; stderr?: string };
    return {
      code: e.status ?? 1,
      salida: `${e.stdout ?? ""}${e.stderr ?? ""}`,
    };
  }
}

/**
 * Un árbol temporal con el guion EXACTO del repositorio y el paquete que se le
 * quiera dar. El guion resuelve su raíz desde su propia ubicación, así que
 * copiarlo es lo que lo apunta a este paquete y no al real.
 */
function arbolCon(paquete: { [ruta: string]: string }): string {
  const dir = mkdtempSync(join(tmpdir(), "verify-guides-"));
  temporales.push(dir);
  mkdirSync(join(dir, "scripts", "eec"), { recursive: true });
  cpSync(GUION, join(dir, "scripts", "eec", "verify-guide-manifests.mjs"));
  for (const [ruta, contenido] of Object.entries(paquete)) {
    const destino = join(dir, ruta);
    mkdirSync(dirname(destino), { recursive: true });
    writeFileSync(destino, contenido);
  }
  return dir;
}

describe("verify-guide-manifests: un paquete vacío NO es un paquete intacto", () => {
  it("rechaza un paquete con SHA256SUMS.txt vacío y nada más", () => {
    const dir = arbolCon({ [`${PAQUETE_C01}/SHA256SUMS.txt`]: "" });
    const r = correr(dir);

    expect(r.code).toBe(1);
    expect(r.salida).toContain("FALLO PAQUETE_SELLADO");
    // Y lo dice por lo que falta, no con un mensaje genérico: el inventario
    // es declarado, así que puede nombrar cada ausencia.
    expect(r.salida).toContain("mg01.manifest.json: FALTA");
    expect(r.salida).toContain("mg05.approval.json: FALTA");
    expect(r.salida).toContain("chapter-guided-suite.manifest.json: FALTA");
    // La frase del falso verde no aparece por ningún lado.
    expect(r.salida).not.toContain("coincide con lo que se firmó");
  });

  it("rechaza un paquete sin SHA256SUMS.txt", () => {
    const dir = arbolCon({
      [`${PAQUETE_C01}/mg01.manifest.json`]: "{}",
    });
    const r = correr(dir);
    expect(r.code).toBe(1);
    expect(r.salida).toContain("no hay SHA256SUMS.txt");
  });

  it("y acepta el paquete real, para que el trinquete no se cumpla fallando siempre", () => {
    // Contra el repositorio de verdad: el control contrario. Si alguien
    // «arregla» el falso verde haciendo que el guion rechace todo, esto cae.
    const r = correr(ROOT);
    expect(r.code).toBe(0);
    expect(r.salida).toContain("consistencia interna      ✔ comprobada");
    expect(r.salida).toContain("correspondencia con actas ✔ comprobada");
    // Y dice lo que NO hizo, que era la otra mitad del defecto.
    expect(r.salida).toContain("verificación criptográfica — NO realizada");
  });

  it("declara la comparación histórica sólo cuando la ha hecho", () => {
    // En el repositorio, C01 tiene referencia declarada y git la alcanza.
    const real = correr(ROOT);
    expect(real.salida).toMatch(/comparación histórica\s+✔ contra [0-9a-f]{8}/);

    // En un árbol sin git, la MISMA referencia no se puede leer, y el guion lo
    // dice en vez de callarlo. Es la diferencia entre «comprobado» y «no se
    // pudo comprobar», que es justo lo que §61 pidió separar.
    const dir = arbolCon({ [`${PAQUETE_C01}/SHA256SUMS.txt`]: "" });
    const aislado = correr(dir);
    expect(aislado.salida).toContain(
      "comparación histórica     — NO realizada",
    );
  });
});
