import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Guardas auxiliares sobre la ESTRUCTURA del envío de Eco.
 *
 * El comportamiento se prueba ejecutándolo, en `ChatArea.sse-error.test.tsx`.
 * Esto vigila otra cosa: que no vuelva a haber dos versiones de «este intento
 * falló», que es de donde salieron los dos defectos. Antes había un
 * rebobinado en el `catch` y otro, parcial, dentro del `switch`; y el `break`
 * del evento dejaba seguir al envío hasta revelar una respuesta a medias.
 */

const FUENTE = readFileSync(
  join(process.cwd(), "src/components/dashboard/eco/ChatArea.tsx"),
  "utf8",
);

describe("estructura del envío de Eco", () => {
  it("hay UN solo rebobinado, y hace las cuatro cosas", () => {
    const i = FUENTE.indexOf("const rebobinar = (");
    expect(i).toBeGreaterThan(-1);
    const cuerpo = FUENTE.slice(i, FUENTE.indexOf("};", i));
    for (const paso of [
      "setSendError(",
      "msg.id !== optimisticId",
      "setText(plain)",
      'setPhase("idle")',
    ]) {
      expect(cuerpo).toContain(paso);
    }
    // Y sólo uno: dos definiciones serían dos verdades.
    expect(FUENTE.split("const rebobinar = (")).toHaveLength(2);
  });

  it("el evento de error sólo anota; no rebobina por su cuenta", () => {
    const i = FUENTE.indexOf('case "error":');
    const rama = FUENTE.slice(i, FUENTE.indexOf("break;", i));
    expect(rama).toContain("fallo = ev.data.message");
    expect(rama).not.toContain("setText(");
    expect(rama).not.toContain("setPhase(");
  });

  it("y el intento termina ANTES de poder revelar lo que llegó a medias", () => {
    const cierre = FUENTE.indexOf("if (fallo) {");
    const revelado = FUENTE.indexOf("if (buffered) {");
    expect(cierre).toBeGreaterThan(-1);
    expect(revelado).toBeGreaterThan(-1);
    expect(cierre).toBeLessThan(revelado);
    expect(FUENTE.slice(cierre, revelado)).toContain("return;");
  });

  it("el `catch` usa el mismo rebobinado, no una copia", () => {
    const i = FUENTE.indexOf("Eco sendMessage failed");
    const rama = FUENTE.slice(i, FUENTE.indexOf("return;", i));
    expect(rama).toContain("rebobinar(");
    expect(rama).not.toContain("setText(plain)");
  });

  it("nada reintenta solo", () => {
    expect(FUENTE).not.toMatch(/setTimeout\([^)]*send\b/);
    expect(FUENTE).not.toMatch(/\bretryCount\b|\bautoRetry\b/);
  });
});
