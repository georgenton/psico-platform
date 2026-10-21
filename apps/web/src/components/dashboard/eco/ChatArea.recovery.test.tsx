import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * B1 — un fallo de Eco deja el borrador listo para reenviar.
 *
 * Hay dos caminos de fallo y durante un tiempo sólo uno se recuperaba:
 *
 *   · `catch` — la petición no llegó o reventó antes del flujo.
 *   · evento SSE `error` — el servidor abrió el flujo y lo cerró con un
 *     error dentro. Es el camino que toma un proveedor caído, y es el que se
 *     midió: «Algo salió mal», la burbuja optimista sin respuesta y el texto
 *     escrito, perdido.
 *
 * Montar `ChatArea` aquí costaría cripto, SSE y contexto de clave para
 * comprobar una sola cosa: que los dos caminos hacen el mismo rebobinado. Se
 * comprueba sobre la fuente, que es donde vive el riesgo de que uno vuelva a
 * quedarse atrás.
 */

const FUENTE = readFileSync(
  join(process.cwd(), "src/components/dashboard/eco/ChatArea.tsx"),
  "utf8",
);

/** El cuerpo del `case "error"` del consumidor SSE. */
function ramaDelEventoError(): string {
  const i = FUENTE.indexOf('case "error":');
  expect(i).toBeGreaterThan(-1);
  const j = FUENTE.indexOf("break;", i);
  expect(j).toBeGreaterThan(i);
  return FUENTE.slice(i, j);
}

/** El cuerpo del `catch` del envío. */
function ramaDelCatch(): string {
  const i = FUENTE.indexOf("Eco sendMessage failed");
  expect(i).toBeGreaterThan(-1);
  return FUENTE.slice(i, FUENTE.indexOf("return;", i));
}

describe("recuperación de Eco: los dos caminos de fallo se comportan igual", () => {
  const rebobinado = [
    "setText(plain)",
    'setPhase("idle")',
    'setStreamTarget("")',
    "finalizeRef.current = null",
  ];

  it("el evento SSE de error devuelve el borrador al compositor", () => {
    const rama = ramaDelEventoError();
    for (const paso of rebobinado) expect(rama).toContain(paso);
  });

  it("y retira la burbuja optimista que se quedó sin respuesta", () => {
    expect(ramaDelEventoError()).toContain("msg.id !== optimisticId");
  });

  it("el camino del `catch` sigue haciendo lo mismo", () => {
    const rama = ramaDelCatch();
    for (const paso of rebobinado) expect(rama).toContain(paso);
    expect(rama).toContain("msg.id !== optimisticId");
  });

  it("no hay reenvío automático: nada reintenta solo", () => {
    // Un reintento en bucle contra un proveedor caído multiplica mensajes y
    // coste. La recuperación la decide la persona pulsando Enviar.
    expect(FUENTE).not.toMatch(/setTimeout\([^)]*send\b/);
    expect(FUENTE).not.toMatch(/\bretryCount\b|\bautoRetry\b/);
  });
});
