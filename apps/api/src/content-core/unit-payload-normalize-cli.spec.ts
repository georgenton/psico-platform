import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

import { parseNormalizeArgs, runNormalize } from "./unit-payload-normalize-cli";

const dir = mkdtempSync(join(tmpdir(), "normalize-cli-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

function payloadFile(
  name: string,
  blocks: { kind: string; content: string; meta?: unknown }[],
): string {
  const p = join(dir, name);
  writeFileSync(
    p,
    JSON.stringify({
      editionKey: "emociones-en-construccion-1e",
      unitKey: "clave-del-build",
      title: "Un capítulo",
      placement: { order: 1, partNumber: 1, partTitle: "Parte" },
      blocks,
    }),
    "utf8",
  );
  return p;
}

describe("unit-payload-normalize-cli", () => {
  it("exige entrada y salida", () => {
    expect(() => parseNormalizeArgs(["--out=/x"])).toThrow("MISSING_IN");
    expect(() => parseNormalizeArgs(["--in=/x"])).toThrow("MISSING_OUT");
  });

  it("acepta las banderas en las dos formas", () => {
    const a = parseNormalizeArgs([
      "--in",
      "/a",
      "--out",
      "/b",
      "--unit-key",
      "k",
      "--permitir-negativas",
    ]);
    expect(a).toEqual({
      inPath: "/a",
      outPath: "/b",
      unitKey: "k",
      allowRefusals: true,
    });
  });

  it("normaliza y sustituye el unitKey por el del entorno destino", () => {
    // El pie que ya tropezó: el `unitKey` del build vale para la base donde se
    // construyó y para ninguna otra.
    const inPath = payloadFile("a.json", [
      { kind: "PARAGRAPH", content: "Una idea **clara**." },
      { kind: "PARAGRAPH", content: "Sin nada." },
    ]);
    const outPath = join(dir, "a-out.json");
    const report = runNormalize({
      inPath,
      outPath,
      unitKey: "clave-del-destino",
      allowRefusals: false,
    });

    expect(report.wrote).toBe(true);
    expect(report.normalized).toBe(1);
    expect(report.untouched).toBe(1);
    expect(report.unitKeyOverridden).toBe(true);
    expect(report.unitKeyFromBuild).toBe("clave-del-build");

    const written = JSON.parse(readFileSync(outPath, "utf8")) as {
      unitKey: string;
      title: string;
      blocks: { content: string; meta?: { inlineMarks?: unknown[] } }[];
    };
    expect(written.unitKey).toBe("clave-del-destino");
    // Y el resto del payload viaja igual: esto normaliza bloques, no reescribe
    // la unidad.
    expect(written.title).toBe("Un capítulo");
    expect(written.blocks[0]!.content).toBe("Una idea clara.");
    expect(written.blocks[0]!.meta?.inlineMarks).toHaveLength(1);
  });

  it("sin --unit-key conserva el del build, y lo dice", () => {
    const inPath = payloadFile("b.json", [
      { kind: "PARAGRAPH", content: "Limpio." },
    ]);
    const report = runNormalize({
      inPath,
      outPath: join(dir, "b-out.json"),
      unitKey: null,
      allowRefusals: false,
    });
    expect(report.unitKeyWritten).toBe("clave-del-build");
    expect(report.unitKeyOverridden).toBe(false);
  });

  it("ante una negativa NO escribe el fichero, y la nombra", () => {
    // Un payload medio normalizado publicaría Markdown en crudo en unas filas
    // y marcas en otras. Detenerse es mejor, y el fichero ausente es lo que
    // impide que alguien lo ingiera por descuido.
    const inPath = payloadFile("c.json", [
      { kind: "QUOTE", content: "**Nota:** ajusta `TEXT_LOCKED`." },
    ]);
    const outPath = join(dir, "c-out.json");
    const report = runNormalize({
      inPath,
      outPath,
      unitKey: null,
      allowRefusals: false,
    });
    expect(report.wrote).toBe(false);
    expect(report.refusals).toHaveLength(1);
    expect(report.refusals[0]!.blocker).toBe("UNREPRESENTABLE_MARKUP");
    expect(() => readFileSync(outPath, "utf8")).toThrow();
  });

  it("con --permitir-negativas escribe, y el informe las lleva", () => {
    const inPath = payloadFile("d.json", [
      { kind: "QUOTE", content: "**Nota:** ajusta `TEXT_LOCKED`." },
    ]);
    const outPath = join(dir, "d-out.json");
    const report = runNormalize({
      inPath,
      outPath,
      unitKey: null,
      allowRefusals: true,
    });
    expect(report.wrote).toBe(true);
    expect(report.refusals).toHaveLength(1);
    const written = JSON.parse(readFileSync(outPath, "utf8")) as {
      blocks: { content: string }[];
    };
    // Intacto: ni limpio ni medio limpio.
    expect(written.blocks[0]!.content).toBe("**Nota:** ajusta `TEXT_LOCKED`.");
  });

  it("rechaza un payload sin bloques", () => {
    const inPath = payloadFile("e.json", []);
    expect(() =>
      runNormalize({
        inPath,
        outPath: join(dir, "e-out.json"),
        unitKey: null,
        allowRefusals: false,
      }),
    ).toThrow("PAYLOAD_NO_BLOCKS");
  });
});
