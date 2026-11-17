import { execFileSync } from "node:child_process";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
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

/** `git` dentro del árbol, con identidad propia para no depender del global. */
function git(cwd: string, ...args: string[]): string {
  return execFileSync(
    "git",
    ["-c", "user.email=t@test", "-c", "user.name=t", ...args],
    { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
  ).trim();
}

/**
 * Un árbol con el paquete REAL copiado y un repositorio git propio, donde el
 * sello declarado se reapunta a un commit de este árbol.
 *
 * `omitirDelSello` son los ficheros que ese commit NO contendrá — así se
 * fabrica una lectura histórica **parcial** sin tocar el repositorio de verdad:
 * existen en disco y en el commit siguiente, pero no en la referencia que el
 * guion declara.
 */
function arbolSellado(omitirDelSello: string[]): string {
  const dir = mkdtempSync(join(tmpdir(), "verify-guides-git-"));
  temporales.push(dir);
  mkdirSync(join(dir, "scripts", "eec"), { recursive: true });
  const guion = join(dir, "scripts", "eec", "verify-guide-manifests.mjs");
  cpSync(GUION, guion);

  const origen = join(ROOT, PAQUETE_C01);
  mkdirSync(join(dir, PAQUETE_C01), { recursive: true });
  const ficheros = readdirSync(origen);
  for (const f of ficheros) {
    cpSync(join(origen, f), join(dir, PAQUETE_C01, f));
  }

  git(dir, "init", "-q", ".");
  for (const f of ficheros) {
    if (!omitirDelSello.includes(f)) git(dir, "add", `${PAQUETE_C01}/${f}`);
  }
  git(dir, "add", "scripts");
  git(dir, "commit", "-q", "-m", "sello de prueba");
  const sello = git(dir, "rev-parse", "HEAD");
  // Lo omitido entra DESPUÉS: el fichero existe en disco, pero no en el sello.
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "--allow-empty", "-m", "el resto");

  // Reapuntar el sello declarado. Se exige exactamente una sustitución: si el
  // literal del guion cambia, esta prueba cae en voz alta en vez de medir otra
  // cosa en silencio.
  const fuente = readFileSync(guion, "utf8");
  const SELLO_REAL = "2bee9db5dbd0a9534b3dba5e9977870fa0f9f6f2";
  expect(fuente.split(SELLO_REAL).length - 1).toBe(1);
  writeFileSync(guion, fuente.split(SELLO_REAL).join(sello));

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

  it("una lectura histórica PARCIAL no se declara completa", () => {
    // Reproducido el 2026-11-17: con los once ficheros del inventario legibles
    // en el sello y la lista de sumas NO, el guion imprimía «✔ contra … · 11
    // ficheros» y cerraba con «IDÉNTICO a su referencia histórica declarada».
    const dir = arbolSellado(["SHA256SUMS.txt"]);
    const r = correr(dir);

    expect(r.salida).toContain(
      "comparación histórica     — NO realizada: lectura INCOMPLETA",
    );
    expect(r.salida).toContain("11 de 12 ficheros");
    // Nombra lo que faltó: «no se pudo comprobar» frente a «se comprobó».
    expect(r.salida).toContain(
      `no se pudo leer: ${PAQUETE_C01}/SHA256SUMS.txt`,
    );
    // Y no se afirma la garantía por ninguna de sus dos vías.
    expect(r.salida).not.toMatch(/comparación histórica\s+✔/);
    expect(r.salida).not.toContain("IDÉNTICO a su");
    expect(r.salida).toContain("OK PARCIAL");

    // Lo que SÍ se comprobó se conserva como comprobado: una lectura histórica
    // incompleta no degrada el inventario ni la correspondencia.
    expect(r.salida).toContain("consistencia interna      ✔ comprobada");
    expect(r.salida).toContain("correspondencia con actas ✔ comprobada");
  });

  it("y el control contrario: el paquete completo sí la declara", () => {
    // El MISMO árbol temporal, mismo mecanismo, sin omitir nada. Sin esto, el
    // arreglo se podría «cumplir» no declarando nunca la garantía.
    const dir = arbolSellado([]);
    const r = correr(dir);

    expect(r.code).toBe(0);
    expect(r.salida).toMatch(
      /comparación histórica\s+✔ contra [0-9a-f]{8} · 12 de 12 ficheros/,
    );
    expect(r.salida).toContain("IDÉNTICO a su");
    expect(r.salida).not.toContain("OK PARCIAL");
  });
});
