import { describe, it, expect, vi, afterEach } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  resolvePrototypeParams,
  GUIDE_RECALL,
  PROTOTYPE_CLIENT_GRADING,
  PROTOTYPE_ANCHOR_KIND,
  PROTOTYPE_ANCHOR_BLOCK_KEY,
  RUNTIME_ANCHOR_APPROVED,
  RUNTIME_ANCHOR_USED,
  CHECKPOINT_PROGRESS_AUTHORITY,
  SCENE_PROGRESS_AUTHORITY,
  REFERENCE_CLONE,
  PRACTICE_EXPLICIT_ROUTE_REQUIRED,
  PROTOTYPE_EVOLUTION_WRITE,
  PROTOTYPE_CHECKIN_WRITE,
  EMOTIONAL_MAP_WRITE,
} from "./guided-reading-prototype.fixture";

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB_SRC = resolve(HERE, "../../..");
const PROTOTYPE_DIRS = [
  HERE,
  resolve(WEB_SRC, "app/prototipos/lectura-guiada"),
];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    if (!/\.(ts|tsx|css)$/.test(entry)) return [];
    // Las propias pruebas mencionan los términos prohibidos.
    if (/\.(test|spec)\.tsx?$/.test(entry)) return [];
    return [full];
  });
}

const FILES = PROTOTYPE_DIRS.flatMap(sourceFiles);

/**
 * El ratchet mira código, no prosa: los comentarios del prototipo explican
 * justamente qué NO se usa («no usa `localStorage`», «no conoce
 * `correctOptionKey`») y no deben contar como infracción.
 */
function codeOf(file: string): string {
  return readFileSync(file, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("prototipo — ratchets de aislamiento", () => {
  it("encuentra los archivos del prototipo", () => {
    expect(FILES.length).toBeGreaterThan(5);
  });

  it.each([
    ["fetch(", "PROTOTYPE_NETWORK_CALLS=0"],
    ["localStorage", "PROTOTYPE_STORAGE_WRITES=0"],
    ["sessionStorage", "PROTOTYPE_STORAGE_WRITES=0"],
    ["document.cookie", "el prototipo no lee identidad"],
    ["/api/", "PROTOTYPE_GUIDE_API_REFERENCES=0"],
    ["@psico/api-client", "PROTOTYPE_GUIDE_API_REFERENCES=0"],
    ["use server", "el prototipo no usa server actions"],
    ["correctOptionKey", "la clave correcta nunca llega al cliente"],
    ["emotionalMapApi", "PROTOTYPE_MAP_WRITES=0"],
    ["resonancesApi", "PROTOTYPE_RESONANCE_WRITE=false"],
    ["moodApi", "PROTOTYPE_CHECKIN_WRITE=false"],
    ["homeApi", "PROTOTYPE_EVOLUTION_WRITE=false"],
    ["lectorApi", "el prototipo no toca el lector productivo"],
  ])("ningún archivo del prototipo contiene %s (%s)", (needle) => {
    const offenders = FILES.filter((file) => codeOf(file).includes(needle)).map(
      (file) => file.slice(WEB_SRC.length + 1),
    );
    expect(offenders).toEqual([]);
  });

  it("el fixture no expone ninguna marca de opción correcta", () => {
    const serialized = JSON.stringify(GUIDE_RECALL);
    expect(serialized).not.toContain("correct");
    for (const option of GUIDE_RECALL.options) {
      expect(Object.keys(option).sort()).toEqual(["optionKey", "text"]);
    }
    expect(PROTOTYPE_CLIENT_GRADING).toBe(false);
  });

  it("declara las banderas de GR-1", () => {
    expect(PROTOTYPE_ANCHOR_KIND).toBe("VISUAL_PLACEHOLDER");
    expect(PROTOTYPE_ANCHOR_BLOCK_KEY).toBeNull();
    expect(RUNTIME_ANCHOR_APPROVED).toBe(false);
    expect(RUNTIME_ANCHOR_USED).toBe(false);
    expect(CHECKPOINT_PROGRESS_AUTHORITY).toBe("SIMULATED_SERVER_FIXTURE");
    expect(SCENE_PROGRESS_AUTHORITY).toBe("PRESENTATION");
    expect(REFERENCE_CLONE).toBe(false);
    expect(PRACTICE_EXPLICIT_ROUTE_REQUIRED).toBe(true);
    expect(PROTOTYPE_EVOLUTION_WRITE).toBe(false);
    expect(PROTOTYPE_CHECKIN_WRITE).toBe(false);
    expect(EMOTIONAL_MAP_WRITE).toBe(false);
  });

  /*
   * jsdom no calcula layout: `scrollWidth` siempre es 0, así que una prueba
   * unitaria NO puede demostrar que no hay desbordamiento horizontal. Lo que
   * sí se puede fijar aquí es el contrato CSS que lo evita; la medición real
   * (`document.documentElement.scrollWidth <= window.innerWidth`) se hace en
   * un navegador real y queda registrada en la especificación.
   */
  it("el sheet móvil declara el contrato anti-overflow", () => {
    const css = readFileSync(
      join(HERE, "guided-reading-prototype.module.css"),
      "utf8",
    );
    const mobile = css.slice(css.indexOf("@media (max-width: 1023px)"));
    expect(mobile).toContain("max-width: 100vw");
    expect(mobile).toContain("safe-area-inset-bottom");
    expect(mobile).toContain("flex-direction: column");
    // Nada de anchos fijos en píxeles dentro del bloque móvil (el `max-width`
    // de la propia media query no cuenta).
    expect(mobile).not.toMatch(/(^|[^-])width:\s*\d{3,}px/m);
  });
});

describe("prototipo — parámetros deterministas", () => {
  it("acepta los modos válidos", () => {
    expect(resolvePrototypeParams({ mode: "listen" }).mode).toBe("listen");
    expect(resolvePrototypeParams({ mode: "watch" }).mode).toBe("watch");
    expect(resolvePrototypeParams({ mode: "guide" }).scene).toBe(1);
    expect(resolvePrototypeParams({ mode: "guide", scene: "6" }).scene).toBe(6);
    expect(
      resolvePrototypeParams({ mode: "guide", outcome: "review" }).outcome,
    ).toBe("review");
  });

  it("cae en defaults seguros ante valores inválidos", () => {
    expect(resolvePrototypeParams({})).toEqual({
      mode: "read",
      scene: 0,
      outcome: "correct",
    });
    expect(resolvePrototypeParams({ mode: "admin" }).mode).toBe("read");
    expect(resolvePrototypeParams({ mode: "guide", scene: "99" }).scene).toBe(
      1,
    );
    expect(resolvePrototypeParams({ mode: "guide", scene: "abc" }).scene).toBe(
      1,
    );
    expect(resolvePrototypeParams({ mode: "read", scene: "4" }).scene).toBe(0);
    expect(resolvePrototypeParams({ outcome: "perfecto" }).outcome).toBe(
      "correct",
    );
  });
});

describe("prototipo — exposición en producción", () => {
  it("devuelve notFound cuando VERCEL_ENV=production", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    const { default: Page } =
      await import("@/app/prototipos/lectura-guiada/page");
    expect(() => Page({ searchParams: {} })).toThrow("NEXT_NOT_FOUND");
  });

  it("renderiza en preview y en desarrollo", async () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    const { default: Page } =
      await import("@/app/prototipos/lectura-guiada/page");
    expect(Page({ searchParams: {} })).toBeTruthy();

    vi.stubEnv("VERCEL_ENV", "");
    expect(Page({ searchParams: {} })).toBeTruthy();
  });

  it("declara noindex, nofollow", async () => {
    const { metadata } = await import("@/app/prototipos/lectura-guiada/page");
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });
});
