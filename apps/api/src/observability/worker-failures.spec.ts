import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { isFinalAttempt, reportWorkerFailures } from "./worker-failures";
import { captureException } from "./sentry";

vi.mock("./sentry", () => ({ captureException: vi.fn() }));

/** Un trabajo fallido que nadie ve es un fallo que nadie arregla. */
describe("los trabajos que fallan", () => {
  const worker = () =>
    Object.assign(new EventEmitter(), { name: "email" }) as never;
  const trabajo = (attemptsMade: number, attempts?: number) =>
    ({
      name: "send-email",
      attemptsMade,
      opts: { attempts },
      data: { to: "persona", html: "contenido" },
    }) as never;

  beforeEach(() => vi.mocked(captureException).mockClear());

  it("se informan al agotar los intentos, con cola y trabajo y nada más", () => {
    const w = worker();
    reportWorkerFailures(w);
    const err = new Error("x");
    (w as EventEmitter).emit("failed", trabajo(3, 3), err);
    expect(vi.mocked(captureException).mock.calls).toEqual([
      [err, { queue: "email", job: "send-email" }],
    ]);
  });

  it("un reintento pendiente no es noticia", () => {
    const w = worker();
    reportWorkerFailures(w);
    (w as EventEmitter).emit("failed", trabajo(1, 3), new Error("x"));
    expect(captureException).not.toHaveBeenCalled();
  });

  it("sin intentos configurados, el primero es el último", () => {
    expect(isFinalAttempt(trabajo(1), new Error("x"))).toBe(true);
  });

  it("uno irrecuperable no espera a agotarlos", () => {
    const err = Object.assign(new Error("x"), { name: "UnrecoverableError" });
    expect(isFinalAttempt(trabajo(1, 5), err)).toBe(true);
  });

  it("y si el trabajo se perdió, se dice", () => {
    expect(isFinalAttempt(undefined, new Error("x"))).toBe(true);
  });
});
