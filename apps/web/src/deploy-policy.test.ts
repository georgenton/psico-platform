import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  appendFileSync,
  mkdirSync,
} from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * La política de despliegue de Web — #725.
 *
 * QUÉ DECIDE ESTA PRUEBA. `scripts/vercel-ignore-web.sh` es lo que Vercel
 * ejecuta para responder «¿construyo @psico/web en este commit?». Se equivocaba
 * en los dos sentidos: la regla anterior era `[ "$VERCEL_GIT_COMMIT_REF" != "main" ]`,
 * que omite TODA rama que no sea main —así que un PR que cambiaba Web se quedaba
 * sin preview (#726)— y construye SIEMPRE en main —así que un commit de docs o un
 * test de la API desplegaban Web (#751)—.
 *
 * LA POLARIDAD ES LO QUE MÁS DUELE SI SE INVIERTE, así que va primero y explícita:
 * para Vercel, `exit 0` ABORTA el build y `exit 1` lo CONTINÚA. Al revés de lo que
 * sugiere «0 = todo bien». Invertirlo deja de desplegar cambios reales o despliega
 * en cada commit.
 *
 * CÓMO SE PRUEBA. Ejecutando el script de verdad contra estado git de verdad, en
 * un worktree temporal. No se mockea git ni turbo: lo que falla en producción es
 * justo la interacción entre los dos. El worktree aísla el experimento — dejar
 * ficheros a medias en el árbol real interferiría con los otros workspaces, que
 * corren en paralelo bajo `pnpm test`.
 */

/** Para Vercel: 0 aborta el build, 1 lo continúa. No es intuitivo; es el contrato. */
const OMITIR = 0;
const CONSTRUIR = 1;

const raiz = join(__dirname, "..", "..", "..");
const script = join(raiz, "scripts", "vercel-ignore-web.sh");
/** El turbo del repo: en el build de Vercel es global, aquí sale de node_modules. */
const binRepo = join(raiz, "node_modules", ".bin");

let arbol: string;

function git(args: string[], cwd = raiz): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

/**
 * Corre la política con una base dada, en el worktree, y devuelve su decisión.
 * `VERCEL_GIT_PREVIOUS_SHA` es la variable que Vercel pone: el commit del último
 * deployment de la rama.
 */
function decidir(base: string | undefined): number {
  try {
    execFileSync("sh", [join(arbol, "scripts", "vercel-ignore-web.sh")], {
      cwd: arbol,
      env: {
        ...process.env,
        PATH: `${binRepo}:${process.env.PATH ?? ""}`,
        ...(base === undefined ? {} : { VERCEL_GIT_PREVIOUS_SHA: base }),
      },
      stdio: "pipe",
    });
    return 0;
  } catch (e) {
    return (e as { status?: number }).status ?? -1;
  }
}

/** Sitúa el worktree en `commit` y deja el script de la rama actual dentro. */
function situarEn(commit: string) {
  git(["checkout", "--detach", "--force", commit], arbol);
  git(["clean", "-qfd"], arbol);
  // El script se prueba tal como está en ESTA rama, aunque el worktree apunte a
  // un commit histórico que todavía no lo tenía.
  mkdirSync(dirname(join(arbol, "scripts", "vercel-ignore-web.sh")), {
    recursive: true,
  });
  writeFileSync(
    join(arbol, "scripts", "vercel-ignore-web.sh"),
    execFileSync("cat", [script], { encoding: "utf8" }),
  );
}

/** Reemplaza un trozo exacto de un fichero del worktree y committea. */
function sustituirYCommitear(
  archivo: string,
  viejo: string,
  nuevo: string,
): { base: string } {
  const base = git(["rev-parse", "HEAD"], arbol);
  const destino = join(arbol, archivo);
  const antes = execFileSync("cat", [destino], { encoding: "utf8" });
  expect(antes.includes(viejo), `no se encontró el trozo en ${archivo}`).toBe(
    true,
  );
  writeFileSync(destino, antes.replace(viejo, nuevo));
  git(["add", "--", archivo], arbol);
  git(
    [
      "-c",
      "user.name=t",
      "-c",
      "user.email=t@t",
      "commit",
      "-qm",
      `prueba: ${archivo}`,
    ],
    arbol,
  );
  return { base };
}

/** Un cambio sintético sobre HEAD, ya committeado, para preguntar por él. */
function cambiarYCommitear(
  archivo: string,
  contenido: string,
): { base: string } {
  const base = git(["rev-parse", "HEAD"], arbol);
  const destino = join(arbol, archivo);
  mkdirSync(dirname(destino), { recursive: true });
  appendFileSync(destino, contenido);
  git(["add", "--", archivo], arbol);
  git(
    [
      "-c",
      "user.name=t",
      "-c",
      "user.email=t@t",
      "commit",
      "-qm",
      `prueba: ${archivo}`,
    ],
    arbol,
  );
  return { base };
}

beforeAll(() => {
  arbol = mkdtempSync(join(tmpdir(), "politica-web-"));
  git(["worktree", "add", "-q", "--detach", arbol, "HEAD"]);
}, 120_000);

afterAll(() => {
  try {
    git(["worktree", "remove", "--force", arbol]);
  } catch {
    rmSync(arbol, { recursive: true, force: true });
  }
}, 120_000);

describe("#725 · la polaridad, que es lo único que no se puede equivocar", () => {
  it("el script documenta que 0 omite y 1 construye", () => {
    const fuente = execFileSync("cat", [script], { encoding: "utf8" });
    expect(fuente).toMatch(/exit 0\s*→\s*Vercel ABORTA/);
    expect(fuente).toMatch(/exit 1\s*→\s*Vercel CONSTRUYE/);
    expect(fuente).toMatch(/CONSTRUIR=1/);
    expect(fuente).toMatch(/OMITIR=0/);
  });
});

describe("#725 · cambios que NO afectan a Web → se omite", () => {
  it("DOCS_ONLY — un commit sólo de documentación", () => {
    // `e262975b` toca exactamente docs/operations/circles-pilot-runbook.md.
    // `docs/` no pertenece a ningún workspace y `turbo.json` no declara
    // globalDependencies, así que no afecta a nada.
    situarEn("e262975b");
    expect(decidir(git(["rev-parse", "e262975b^"]))).toBe(OMITIR);
  }, 120_000);

  it("API_TEST_ONLY — el commit que desencadenó este issue", () => {
    // `e838761a` toca sólo apps/api/src/users/rekey.e2e-spec.ts, y aun así
    // desplegó Web en producción (#751). Eso es lo que esto impide.
    situarEn("e838761a");
    expect(decidir(git(["rev-parse", "e838761a^"]))).toBe(OMITIR);
  }, 120_000);

  it("LOCKFILE_SIN_DEPENDENCIAS — un comentario en pnpm-lock.yaml", () => {
    // Un lockfile que cambia NO implica «reconstruye todo». Turbo lo lee por
    // importer, así que un comentario no mueve ninguna dependencia resuelta.
    situarEn("HEAD");
    const { base } = cambiarYCommitear(
      "pnpm-lock.yaml",
      "\n# comentario de prueba\n",
    );
    expect(decidir(base)).toBe(OMITIR);
  }, 120_000);

  it("API_RUNTIME_UNRELATED — código de la API que Web no importa", () => {
    situarEn("HEAD");
    const { base } = cambiarYCommitear(
      "apps/api/src/health/health.controller.ts",
      "\n// cambio de prueba en el runtime de la API\n",
    );
    expect(decidir(base)).toBe(OMITIR);
  }, 120_000);
});

describe("#725 · cambios que SÍ afectan a Web → se construye", () => {
  const dependencias: Array<[string, string]> = [
    ["WEB_DIRECT", "apps/web/src/app/globals.css"],
    ["WEB_UI_DEP", "packages/ui/src/index.ts"],
    ["WEB_TYPES_DEP", "packages/types/src/index.ts"],
    ["WEB_API_CLIENT_DEP", "packages/api-client/src/index.ts"],
    ["WEB_CRYPTO_DEP", "packages/crypto/src/index.ts"],
  ];

  for (const [caso, archivo] of dependencias) {
    it(`${caso} — ${archivo}`, () => {
      // El grafo del workspace es quien responde: nadie mantiene una lista de
      // carpetas, así que una dependencia nueva de Web queda cubierta sola.
      situarEn("HEAD");
      const { base } = cambiarYCommitear(archivo, "\n/* cambio de prueba */\n");
      expect(decidir(base)).toBe(CONSTRUIR);
    }, 120_000);
  }

  it("LOCKFILE_DEPENDENCIA_DE_WEB — sube la versión de un paquete que sólo usa Web", () => {
    // La otra cara de la moneda del caso anterior: si lo que cambia en el
    // lockfile es una dependencia de Web, hay que construir. `@daily-co/daily-js`
    // sólo aparece bajo el importer de apps/web.
    situarEn("HEAD");
    const { base } = sustituirYCommitear(
      "pnpm-lock.yaml",
      `      '@daily-co/daily-js':\n        specifier: ^0.90.0\n        version: 0.90.0`,
      `      '@daily-co/daily-js':\n        specifier: ^0.90.1\n        version: 0.90.1`,
    );
    expect(decidir(base)).toBe(CONSTRUIR);
  }, 120_000);

  it("ROOT_CONFIG — la propia política", () => {
    // Un PR que cambia la regla de despliegue tiene que desplegar, o no se puede
    // comprobar el cambio (§19 del ciclo).
    situarEn("HEAD");
    const { base } = cambiarYCommitear("apps/web/vercel.json", "\n");
    expect(decidir(base)).toBe(CONSTRUIR);
  }, 120_000);
});

describe("#725 · en un clon superficial, que es lo que Vercel hace", () => {
  /**
   * EL CASO QUE SE ESCAPÓ Y HAY QUE FIJAR. Vercel clona UNA sola rama y a
   * profundidad 1. En ese clon no existe `origin/main`, y —peor— `turbo query
   * affected` calcula un merge base por dentro: sin historia que enlace, avisa
   * «no merge base found», asume que cambió TODO y responde que Web está
   * afectada siempre.
   *
   * O sea que una política que funciona en el árbol local puede omitir nada en
   * producción. Por eso estos dos casos clonan de verdad, en vez de confiar en
   * el worktree.
   */
  const clones: string[] = [];
  const ramas: string[] = [];

  afterAll(() => {
    for (const d of clones) rmSync(d, { recursive: true, force: true });
    for (const r of ramas) {
      try {
        git(["branch", "-D", r]);
      } catch {
        /* ya no está */
      }
    }
  }, 120_000);

  /**
   * La punta de la rama de producción, que es contra lo que el script compara
   * cuando no hay deployment previo. La rama sintética se construye SOBRE ella,
   * no sobre `HEAD`: si se partiera de HEAD, en una rama que ya toca `apps/web`
   * —como la que introdujo esta misma prueba— el diff arrastraría esos cambios y
   * el caso «sólo docs» daría «construye» por motivos ajenos a lo que mide.
   */
  function puntaDeProduccion(): string | null {
    for (const ref of ["origin/main", "main"]) {
      try {
        return git(["rev-parse", "--verify", ref]);
      } catch {
        /* ese ref no está en este clon */
      }
    }
    return null;
  }

  /** Una rama con un cambio, clonada como la clonaría Vercel. */
  function clonarSuperficial(
    rama: string,
    archivo: string,
    desde: string,
  ): string {
    git(["branch", "-f", rama, desde]);
    ramas.push(rama);

    // El commit se hace en el worktree para no tocar el árbol real.
    git(["checkout", "--detach", "--force", desde], arbol);
    git(["clean", "-qfd"], arbol);
    const destino = join(arbol, archivo);
    mkdirSync(dirname(destino), { recursive: true });
    appendFileSync(destino, "\n/* cambio de prueba */\n");
    git(["add", "--", archivo], arbol);
    git(
      [
        "-c",
        "user.name=t",
        "-c",
        "user.email=t@t",
        "commit",
        "-qm",
        `prueba: ${rama}`,
      ],
      arbol,
    );
    git(["branch", "-f", rama, git(["rev-parse", "HEAD"], arbol)]);

    const clon = mkdtempSync(join(tmpdir(), "clon-superficial-"));
    clones.push(clon);
    execFileSync(
      "git",
      [
        "clone",
        "--quiet",
        "--depth=1",
        "--single-branch",
        "--branch",
        rama,
        `file://${raiz}`,
        join(clon, "repo"),
      ],
      { stdio: "pipe" },
    );
    const repo = join(clon, "repo");
    mkdirSync(join(repo, "scripts"), { recursive: true });
    writeFileSync(
      join(repo, "scripts", "vercel-ignore-web.sh"),
      execFileSync("cat", [script], { encoding: "utf8" }),
    );
    return repo;
  }

  /** Devuelve la decisión y lo que el script dijo, para que un fallo se explique. */
  function decidirEn(repo: string): { codigo: number; dijo: string } {
    try {
      const salida = execFileSync(
        "sh",
        [join(repo, "scripts", "vercel-ignore-web.sh")],
        {
          cwd: repo,
          env: { ...process.env, PATH: `${binRepo}:${process.env.PATH ?? ""}` },
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
      return { codigo: 0, dijo: salida.toString() };
    } catch (e) {
      const err = e as { status?: number; stderr?: Buffer };
      return { codigo: err.status ?? -1, dijo: err.stderr?.toString() ?? "" };
    }
  }

  it("sólo docs, sin deployment previo en la rama → omite", (ctx) => {
    const desde = puntaDeProduccion();
    // Sin la rama de producción en este clon no hay nada contra lo que comparar,
    // y un fallo aquí hablaría del clon, no de la política.
    if (!desde) return ctx.skip();
    const repo = clonarSuperficial(
      "prueba-superficial-docs",
      "docs/operations/prueba-de-politica.md",
      desde,
    );
    const r = decidirEn(repo);
    expect(r.codigo, r.dijo).toBe(OMITIR);
  }, 180_000);

  it("un cambio en Web, sin deployment previo en la rama → construye", (ctx) => {
    const desde = puntaDeProduccion();
    if (!desde) return ctx.skip();
    const repo = clonarSuperficial(
      "prueba-superficial-web",
      "apps/web/src/app/globals.css",
      desde,
    );
    const r = decidirEn(repo);
    expect(r.codigo, r.dijo).toBe(CONSTRUIR);
  }, 180_000);
});

describe("#725 · si no se puede demostrar, se construye", () => {
  it("UNKNOWN_BASE — una base que no está en el clon", () => {
    // Pasa con clones superficiales. Omitir aquí dejaría producción atrás sin
    // que nadie se enterara; construir cuesta unos minutos.
    situarEn("HEAD");
    expect(decidir("deadbeefdeadbeefdeadbeefdeadbeefdeadbeef")).toBe(CONSTRUIR);
  }, 120_000);

  it("NO_TURBO — sin turbo con el que preguntar", () => {
    situarEn("HEAD");
    const salida = (() => {
      try {
        execFileSync("sh", [join(arbol, "scripts", "vercel-ignore-web.sh")], {
          cwd: arbol,
          // Un PATH mínimo, deliberadamente sin turbo. `NODE_ENV` va porque el
          // `ProcessEnv` de este proyecto lo declara obligatorio.
          env: {
            PATH: "/usr/bin:/bin",
            NODE_ENV: process.env.NODE_ENV,
            VERCEL_GIT_PREVIOUS_SHA: "HEAD~1",
          },
          stdio: "pipe",
        });
        return 0;
      } catch (e) {
        return (e as { status?: number }).status ?? -1;
      }
    })();
    expect(salida).toBe(CONSTRUIR);
  }, 120_000);
});
