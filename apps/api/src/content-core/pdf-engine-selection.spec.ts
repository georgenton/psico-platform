import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * «Disponible» tiene que significar *puede producir un PDF*, no *el binario
 * está en el PATH*.
 *
 * ── El defecto, tal como apareció ─────────────────────────────────────────
 *
 * `findPdfEngine` devolvía el primer binario encontrado. Pandoc estaba
 * instalado, así que ganaba — pero Pandoc **no produce un PDF por sí mismo**:
 * delega en un motor LaTeX. En una máquina con Pandoc y sin `pdflatex` el
 * build entero moría a media construcción con «'pdflatex' not found», en vez
 * de dejar paso al siguiente conversor o de declarar que no hay motor.
 *
 * Que eso era un defecto y no una decisión lo dice el propio código: la rama
 * `else` anota el bloqueo como «Ni pandoc/**LaTeX** ni LibreOffice en este
 * entorno», o sea que la intención siempre fue comprobar las dos mitades.
 *
 * Y el daño no era teórico: `pnpm test` fallaba —y con él el `pre-push`— en
 * cualquier máquina con Pandoc y sin LaTeX. En CI no se notaba porque allí no
 * hay Pandoc, así que la rama que fallaba no se alcanzaba nunca.
 *
 * ── Por qué se prueba con un `exists` inyectado ───────────────────────────
 *
 * La decisión depende de lo que haya instalado en la máquina. Inyectar el
 * detector es lo único que permite ejercitar los tres casos —con LaTeX, sin
 * LaTeX, sin nada— de forma determinista y en cualquier entorno.
 */

const ROOT = join(__dirname, "..", "..", "..", "..");

type Engine = {
  bin: string;
  dependsOn?: string | null;
  args: (docx: string, pdf: string) => string[];
} | null;

type FindPdfEngine = (exists: (bin: string) => boolean) => Engine;

async function loadFindPdfEngine(): Promise<FindPdfEngine> {
  const mod = await import(
    /* @vite-ignore */ join(ROOT, "scripts/eec/build-chapter.mjs")
  );
  return mod.findPdfEngine as FindPdfEngine;
}

/** Un detector que sólo conoce los binarios que se le declaran. */
const only =
  (...present: string[]) =>
  (bin: string) =>
    present.includes(bin);

describe("findPdfEngine · disponible significa que puede, no que está", () => {
  it("con Pandoc y un motor LaTeX, elige Pandoc y le pasa ese motor", async () => {
    const findPdfEngine = await loadFindPdfEngine();

    const engine = findPdfEngine(only("pandoc", "pdflatex"));

    expect(engine).not.toBeNull();
    expect(engine!.bin).toBe("pandoc");
    expect(engine!.dependsOn).toBe("pdflatex");
    // El motor viaja en la línea de órdenes: sin esto Pandoc volvería a su
    // valor por omisión, que es justo el que puede no estar.
    expect(engine!.args("c.docx", "c.pdf")).toContain("--pdf-engine=pdflatex");
  });

  it("con Pandoc y SIN ningún motor LaTeX, Pandoc no se elige", async () => {
    const findPdfEngine = await loadFindPdfEngine();

    // Éste es el caso que rompía el build: el binario está y no sirve.
    const engine = findPdfEngine(only("pandoc"));

    expect(engine).toBeNull();
  });

  it("y en ese caso deja paso al siguiente conversor, si lo hay", async () => {
    const findPdfEngine = await loadFindPdfEngine();

    const engine = findPdfEngine(only("pandoc", "soffice"));

    // LibreOffice convierte DOCX a PDF sin LaTeX, así que es un motor real.
    expect(engine!.bin).toBe("soffice");
  });

  it("sin ningún motor, devuelve null — que es un estado declarado", async () => {
    const findPdfEngine = await loadFindPdfEngine();

    // El build sabe seguir sin PDF y lo anota como bloqueo. Eso es preferible
    // a elegir un motor que no puede.
    expect(findPdfEngine(only())).toBeNull();
  });

  it("prefiere Tectonic, que se basta solo, sobre una TeX Live completa", async () => {
    const findPdfEngine = await loadFindPdfEngine();

    const engine = findPdfEngine(only("pandoc", "pdflatex", "tectonic"));

    expect(engine!.dependsOn).toBe("tectonic");
  });

  it("un conversor sin dependencias se elige por presencia, como antes", async () => {
    const findPdfEngine = await loadFindPdfEngine();

    // El control contrario: la comprobación nueva no puede haber roto el
    // camino de los conversores que sí se bastan con estar instalados.
    const engine = findPdfEngine(only("libreoffice"));

    expect(engine!.bin).toBe("libreoffice");
    expect(engine!.dependsOn ?? null).toBeNull();
  });
});
